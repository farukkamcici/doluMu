"""
Metro Istanbul Static Topology Ingestion Script.

Fetches metro line topology (stations, coordinates, directions) from Metro Istanbul API
and generates an optimized JSON file for frontend consumption.

This script runs ONCE during build time to create the static data layer.

Usage:
    python src/data_prep/fetch_metro_topology.py

Output:
    frontend/public/data/metro_topology.json

Architecture:
    - Static Data Layer: Lines, Stations, Coordinates, Directions
    - Frontend loads this JSON on init for map rendering
    - Dynamic data (schedules, status) fetched via backend API

Author: Backend Team
Date: 2025-12-08
"""

import requests
import json
import logging
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime, timezone
import time

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Metro Istanbul API Configuration
METRO_API_BASE = "https://api.ibb.gov.tr/MetroIstanbul/api/MetroMobile/V2"
OUTPUT_PATH = Path(__file__).parent.parent.parent / "frontend" / "public" / "data" / "metro_topology.json"

# HTTP Session with headers
session = requests.Session()
session.headers.update({
    'User-Agent': 'IBB-Transport-Platform/1.0',
    'Accept': 'application/json',
    'Content-Type': 'application/json'
})


def fetch_lines() -> List[Dict]:
    """
    Step 1: Load metro lines from local static file.
    
    Source: data/raw/metro_lines_v1.json (manually curated)
    Why: GetLines API is slow (3-language HTML content) and sometimes unreliable
    
    Returns: List of Line objects with Id, Name, Description, Color, FirstTime, LastTime
    """
    logger.info("Loading metro lines from static file...")
    
    try:
        # Load from local file instead of API
        lines_file = Path(__file__).parent.parent.parent / "data" / "raw" / "metro_lines_v1.json"
        
        if not lines_file.exists():
            raise FileNotFoundError(f"Metro lines file not found: {lines_file}")
        
        with open(lines_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        if not data.get('Success'):
            error_msg = data.get('Error', {}).get('Message', 'Unknown error')
            raise Exception(f"Data Error: {error_msg}")
        
        lines = data.get('Data', [])
        logger.info(f"✓ Loaded {len(lines)} metro lines from local file")
        return lines
        
    except Exception as e:
        logger.error(f"Failed to load lines: {e}")
        raise


def fetch_stations_by_line(line_id: int, max_retries: int = 3) -> List[Dict]:
    """
    Step 2: Fetch all stations for a specific line with retry logic.
    
    GET /GetStationById/{LineId}
    Returns: List of Station objects with coordinates and accessibility info
    """
    logger.info(f"  Fetching stations for line {line_id}...")
    
    for attempt in range(max_retries):
        try:
            response = session.get(
                f"{METRO_API_BASE}/GetStationById/{line_id}", 
                timeout=30  # Longer timeout
            )
            response.raise_for_status()
            data = response.json()
            
            if not data.get('Success'):
                logger.warning(f"  ⚠ No stations found for line {line_id}")
                return []
            
            stations = data.get('Data', [])
            logger.info(f"    ✓ Found {len(stations)} stations")
            return stations
            
        except requests.exceptions.Timeout:
            if attempt < max_retries - 1:
                wait_time = (attempt + 1) * 2  # Exponential backoff: 2s, 4s, 6s
                logger.warning(f"  ⏱ Timeout on attempt {attempt + 1}/{max_retries}, retrying in {wait_time}s...")
                time.sleep(wait_time)
            else:
                logger.error(f"  ✗ Failed after {max_retries} attempts - timeout")
                return []
        except requests.exceptions.RequestException as e:
            logger.error(f"  Failed to fetch stations for line {line_id}: {e}")
            return []
    
    return []


def fetch_directions_by_line(line_id: int) -> List[Dict]:
    """
    Step 3: Fetch valid direction IDs for a line (NOT per station).
    
    GET /GetDirectionById/{LineId}
    
    Why line-based instead of station-based?
    - GetDirectionsByLineIdAndStationId is BROKEN (returns 500 NullReference)
    - Line-based is FAST (1 request per line vs 250+ requests)
    - Line-based is RELIABLE (no timeouts)
    
    Trade-off: Terminal stations may show both directions even though they're
    uni-directional. Frontend handles this gracefully (shows "No trains" if invalid).
    
    Returns: List of Direction objects with DirectionId and DirectionName
    Example: [{"DirectionId": 66, "DirectionName": "Havalimanı->Yenikapı"}, ...]
    """
    try:
        response = session.get(
            f"{METRO_API_BASE}/GetDirectionById/{line_id}",
            timeout=10
        )
        response.raise_for_status()
        data = response.json()
        
        if not data.get('Success'):
            return []
        
        directions = data.get('Data', [])
        logger.info(f"    ✓ Found {len(directions)} directions for line")
        return directions
        
    except requests.exceptions.RequestException as e:
        logger.warning(f"    Failed to fetch directions for line {line_id}: {e}")
        return []


def build_topology() -> Dict:
    """
    Main topology builder.
    
    Orchestrates all API calls to build complete metro topology.
    
    Returns:
        Optimized topology structure for frontend:
        {
          "lines": {
            "M1A": {
              "id": 9,
              "name": "M1A",
              "description": "Yenikapı - Atatürk Havalimanı",
              "color": "#e31e24",
              "stations": [
                {
                  "id": 121,
                  "name": "YENIKAPI",
                  "description": "Yenikapı",
                  "order": 1,
                  "coordinates": {"lat": 41.004755, "lng": 28.952549},
                  "accessibility": {
                    "elevator": true,
                    "escalator": true,
                    "wc": false,
                    "babyRoom": false
                  },
                  "directions": [
                    {"id": 66, "name": "Havalimanı İstikameti"},
                    {"id": 67, "name": "Yenikapı İstikameti"}
                  ]
                },
                ...
              ]
            }
          },
          "metadata": {
            "generated_at": "2025-12-08T10:30:00Z",
            "total_lines": 10,
            "total_stations": 250
          }
        }
    """
    logger.info("=" * 60)
    logger.info("Metro Istanbul Topology Ingestion")
    logger.info("=" * 60)
    
    topology = {
        "lines": {},
        "metadata": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "total_lines": 0,
            "total_stations": 0
        }
    }
    
    # Step 1: Get all lines
    lines = fetch_lines()
    
    # Helper function to convert RGB to hex
    def rgb_to_hex(color_obj: Dict) -> str:
        """Convert RGB color object to hex string."""
        try:
            r = int(color_obj.get('Color_R', 0))
            g = int(color_obj.get('Color_G', 0))
            b = int(color_obj.get('Color_B', 0))
            return f"#{r:02x}{g:02x}{b:02x}"
        except:
            return "#808080"  # Default gray
    
    total_stations = 0
    
    # Step 2: Process each line
    for line in lines:
        line_id = line['Id']
        line_name = line['Name']
        
        logger.info(f"\nProcessing Line: {line_name} (ID: {line_id})")
        
        # Step 2a: Fetch directions for this LINE (once per line, not per station)
        line_directions = fetch_directions_by_line(line_id)
        
        # Step 2b: Fetch stations for this line
        stations = fetch_stations_by_line(line_id)
        
        if not stations:
            logger.warning(f"  ⚠ Skipping line {line_name} - no stations found")
            continue
        
        # Build station list with enriched data
        enriched_stations = []
        
        for station in stations:
            station_id = station['Id']
            detail_info = station.get('DetailInfo', {})
            
            # Build enriched station object
            enriched_station = {
                "id": station_id,
                "name": station['Name'],
                "description": station.get('Description', station['Name']),
                "order": station.get('Order', 0),
                "coordinates": {
                    "lat": float(detail_info.get('Latitude', 0)),
                    "lng": float(detail_info.get('Longitude', 0))
                },
                "accessibility": {
                    "elevator": detail_info.get('Lift', 0) > 0,
                    "escalator": detail_info.get('Escolator', 0) > 0,
                    "wc": detail_info.get('WC', False),
                    "babyRoom": detail_info.get('BabyRoom', False),
                    "masjid": detail_info.get('Masjid', False)
                },
                "directions": [
                    {
                        "id": d.get('DirectionId'),
                        "name": d.get('DirectionName', 'Unknown')
                    }
                    for d in line_directions
                    if d.get('DirectionId')
                ]
            }
            
            enriched_stations.append(enriched_station)
            total_stations += 1
        
        # Extract color from line data
        line_color = rgb_to_hex(line.get('Color', {}))
        
        # Add line to topology with enriched data from file
        topology["lines"][line_name] = {
            "id": line_id,
            "name": line_name,
            "description": line.get('LongDescription', line_name),
            "description_en": line.get('ENDescription', ''),
            "color": line_color,
            "first_time": line.get('FirstTime', '06:00'),
            "last_time": line.get('LastTime', '23:59'),
            "is_active": line.get('IsActive', True),
            "stations": enriched_stations
        }
        
        logger.info(f"  ✓ Processed {len(enriched_stations)} stations")
    
    # Update metadata
    topology["metadata"]["total_lines"] = len(topology["lines"])
    topology["metadata"]["total_stations"] = total_stations
    
    logger.info("\n" + "=" * 60)
    logger.info(f"Topology Build Complete:")
    logger.info(f"  Lines: {topology['metadata']['total_lines']}")
    logger.info(f"  Stations: {topology['metadata']['total_stations']}")
    logger.info("=" * 60)
    
    return topology


def save_topology(topology: Dict) -> None:
    """
    Save topology to JSON file in frontend public directory.
    
    Creates directory structure if needed.
    """
    logger.info(f"\nSaving topology to: {OUTPUT_PATH}")
    
    # Create directory if it doesn't exist
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    
    # Write JSON with pretty formatting
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(topology, f, ensure_ascii=False, indent=2)
    
    # Calculate file size
    file_size_kb = OUTPUT_PATH.stat().st_size / 1024
    
    logger.info(f"✓ Topology saved successfully ({file_size_kb:.1f} KB)")
    logger.info(f"  Path: {OUTPUT_PATH}")


def main():
    """Main execution flow."""
    try:
        # Build topology from Metro API
        topology = build_topology()
        
        # Save to frontend
        save_topology(topology)
        
        logger.info("\n✓ Metro topology ingestion completed successfully!")
        return 0
        
    except Exception as e:
        logger.error(f"\n✗ Topology ingestion failed: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit(main())
