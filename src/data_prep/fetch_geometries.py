"""
IETT Bus Stop Geometry Data Ingestion Script

Fetches bus stop coordinates from IETT Web Service API and saves them
as a structured JSON file for frontend map visualization.

API Documentation: docs/ibb_api_doc.pdf
Source: İBB IETT Ulaşım Ana Veri Web Servisleri (Section 4.1)
"""

import requests
import json
import re
import os
from datetime import datetime
from typing import Dict, Optional, Tuple
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# API Configuration
API_BASE_URL = "https://api.ibb.gov.tr/iett/UlasimAnaVeri/HatDurakGuzergah.asmx"
DURAK_ENDPOINT = f"{API_BASE_URL}/GetDurak_json"

# SOAP Configuration
SOAP_HEADERS = {
    'Content-Type': 'text/xml; charset=utf-8',
    'SOAPAction': 'http://tempuri.org/GetDurak_json'
}

# Output Configuration
OUTPUT_DIR = "frontend/public/data"
OUTPUT_FILE = "stops_geometry.json"


def parse_coordinate(coord_str: str) -> Optional[Tuple[float, float]]:
    """
    Parse coordinate string from IETT API format to [lat, lng].
    
    IETT KOORDINAT field formats (documented cases):
    - "POINT(29.0123 41.0456)" - Standard WKT format
    - "29.0123,41.0456" - Comma-separated
    - "29.0123 41.0456" - Space-separated
    
    Note: IETT uses geographic coordinates (longitude, latitude) format.
    We need to convert to [lat, lng] for Leaflet compatibility.
    
    Args:
        coord_str: Coordinate string from API
        
    Returns:
        Tuple of (latitude, longitude) as floats, or None if parsing fails
    """
    if not coord_str or coord_str.strip() == "":
        return None
    
    try:
        # Remove whitespace
        coord_str = coord_str.strip()
        
        # Pattern 1: POINT(X Y) format (WKT)
        point_pattern = r'POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)'
        match = re.match(point_pattern, coord_str, re.IGNORECASE)
        if match:
            lng, lat = float(match.group(1)), float(match.group(2))
            # Validate coordinate ranges for Istanbul
            if 28.0 <= lng <= 30.0 and 40.5 <= lat <= 41.5:
                return (lat, lng)
            else:
                logger.warning(f"Coordinates out of Istanbul bounds: {coord_str}")
                return None
        
        # Pattern 2: Comma-separated "X,Y"
        if ',' in coord_str:
            parts = coord_str.split(',')
            if len(parts) == 2:
                lng, lat = float(parts[0].strip()), float(parts[1].strip())
                if 28.0 <= lng <= 30.0 and 40.5 <= lat <= 41.5:
                    return (lat, lng)
        
        # Pattern 3: Space-separated "X Y"
        if ' ' in coord_str:
            parts = coord_str.split()
            if len(parts) == 2:
                lng, lat = float(parts[0]), float(parts[1])
                if 28.0 <= lng <= 30.0 and 40.5 <= lat <= 41.5:
                    return (lat, lng)
        
        logger.warning(f"Could not parse coordinate format: {coord_str}")
        return None
        
    except (ValueError, AttributeError) as e:
        logger.warning(f"Error parsing coordinate '{coord_str}': {e}")
        return None


def fetch_all_stops() -> Dict:
    """
    Fetch all bus stops from IETT API using GetDurak_json endpoint.
    
    API Method: GetDurak_json (DurakKodu: Optional)
    When DurakKodu is empty, returns ALL stops in the system.
    
    Returns:
        Dictionary of stops with SDURAKKODU as keys
    """
    logger.info("Fetching all bus stops from IETT API...")
    
    try:
        # Build SOAP envelope for request
        soap_envelope = '''<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
               xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetDurak_json xmlns="http://tempuri.org/">
      <DurakKodu></DurakKodu>
    </GetDurak_json>
  </soap:Body>
</soap:Envelope>'''
        
        # Call API using SOAP POST
        response = requests.post(
            API_BASE_URL,
            data=soap_envelope,
            headers=SOAP_HEADERS,
            timeout=60
        )
        response.raise_for_status()
        
        # Parse XML response to extract JSON data
        import xml.etree.ElementTree as ET
        root = ET.fromstring(response.content)
        
        # Find the JSON response in the SOAP envelope
        namespaces = {
            'soap': 'http://schemas.xmlsoap.org/soap/envelope/',
            'ns': 'http://tempuri.org/'
        }
        json_result = root.find('.//ns:GetDurak_jsonResult', namespaces)
        
        if json_result is None or not json_result.text:
            logger.error("No data found in SOAP response")
            return {}
        
        # Parse the JSON data from XML
        stops_data = json.loads(json_result.text)
        
        if not stops_data:
            logger.error("API returned empty response")
            return {}
        
        logger.info(f"Received {len(stops_data)} stops from API")
        return stops_data
        
    except requests.exceptions.RequestException as e:
        logger.error(f"API request failed: {e}")
        raise
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse API response as JSON: {e}")
        raise
    except ET.ParseError as e:
        logger.error(f"Failed to parse SOAP XML response: {e}")
        raise


def process_stops(raw_stops: list) -> Dict:
    """
    Process raw stop data from API into structured format.
    
    Input Fields (from API):
        - SDURAKKODU: Stop code (unique ID)
        - SDURAKADI: Stop name
        - KOORDINAT: X-Y coordinate string
        - ILCEADI: District name
        - SYON: Direction
        - AKILLI: Smart stop indicator
        - FIZIKI: Physical condition
        - DURAK_TIPI: Stop type
        - ENGELLIKULLANIM: Accessibility for disabled
        
    Output Format:
        {
            "DURAK_CODE": {
                "name": "Stop Name",
                "lat": 41.xxxx,
                "lng": 29.xxxx,
                "district": "District Name"
            }
        }
    
    Args:
        raw_stops: List of stop dictionaries from API
        
    Returns:
        Processed stops dictionary
    """
    processed = {}
    skipped_count = 0
    
    for stop in raw_stops:
        try:
            # Extract required fields (handle both string and integer types)
            durak_kodu = str(stop.get("SDURAKKODU", "")).strip()
            durak_adi = str(stop.get("SDURAKADI", "")).strip()
            koordinat = str(stop.get("KOORDINAT", ""))
            ilce_adi = str(stop.get("ILCEADI", "")).strip()
            
            # Validate required fields
            if not durak_kodu:
                skipped_count += 1
                continue
            
            # Parse coordinates
            coords = parse_coordinate(koordinat)
            if coords is None:
                logger.debug(f"Skipping stop {durak_kodu} - invalid coordinates: {koordinat}")
                skipped_count += 1
                continue
            
            lat, lng = coords
            
            # Store processed stop
            processed[durak_kodu] = {
                "name": durak_adi or "Unknown",
                "lat": lat,
                "lng": lng,
                "district": ilce_adi or "Unknown"
            }
            
        except Exception as e:
            logger.warning(f"Error processing stop {stop.get('SDURAKKODU', 'UNKNOWN')}: {e}")
            skipped_count += 1
            continue
    
    logger.info(f"Processed {len(processed)} stops successfully")
    if skipped_count > 0:
        logger.warning(f"Skipped {skipped_count} stops due to missing/invalid data")
    
    return processed


def save_geometry_data(stops: Dict, output_path: str):
    """
    Save processed stop geometry data to JSON file.
    
    Args:
        stops: Processed stops dictionary
        output_path: Full path to output JSON file
    """
    output_data = {
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "total_stops": len(stops),
        "stops": stops
    }
    
    # Create output directory if it doesn't exist
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # Write JSON file with pretty formatting
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    
    logger.info(f"Saved geometry data to {output_path}")
    logger.info(f"File size: {os.path.getsize(output_path) / 1024:.2f} KB")


def main():
    """
    Main execution function.
    """
    try:
        logger.info("="*60)
        logger.info("IETT Bus Stop Geometry Ingestion Script")
        logger.info("="*60)
        
        # Step 1: Fetch data from API
        raw_stops = fetch_all_stops()
        
        if not raw_stops:
            logger.error("No stops fetched from API. Exiting.")
            return
        
        # Step 2: Process and validate data
        processed_stops = process_stops(raw_stops)
        
        if not processed_stops:
            logger.error("No valid stops after processing. Exiting.")
            return
        
        # Step 3: Save to output file
        output_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            OUTPUT_DIR,
            OUTPUT_FILE
        )
        save_geometry_data(processed_stops, output_path)
        
        logger.info("="*60)
        logger.info("✅ Geometry data ingestion completed successfully")
        logger.info(f"✅ Total stops saved: {len(processed_stops)}")
        logger.info("="*60)
        
    except Exception as e:
        logger.error(f"❌ Script failed: {e}")
        raise


if __name__ == "__main__":
    main()
