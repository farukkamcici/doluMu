"""
Metro Topology Cleaner & Standardizer

Cleans and standardizes direction data in metro_topology.json by:
1. Filtering terminus stations to show only correct departure directions
2. Filtering intermediate stations to show only valid main-line directions
3. Removing branch/extension direction IDs from main line stations

This ensures the frontend UI shows only valid, user-actionable directions
for each station based on its position (start/intermediate/end).

Usage:
    python src/data_prep/update_directions.py

Output:
    Updates frontend/public/data/metro_topology.json in-place
"""

import json
import logging
from pathlib import Path
from typing import Dict, List

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

TOPOLOGY_PATH = Path(__file__).parent.parent.parent / "frontend" / "public" / "data" / "metro_topology.json"

# Direction filtering rules per line
# start_keep: Direction ID to keep for first station (departure direction)
# end_keep: Direction ID to keep for last station (departure direction)
# valid: Valid direction IDs for intermediate stations (main line only)
DIRECTION_RULES = {
    "F1":  {"start_keep": 14, "end_keep": 13, "valid": [13, 14]},
    "F4":  {"start_keep": 73, "end_keep": 72, "valid": [72, 73]},
    "M1A": {"start_keep": 67, "end_keep": 66, "valid": [66, 67]},
    "M1B": {"start_keep": 31, "end_keep": 30, "valid": [30, 31]},
    "M2":  {"start_keep": 34, "end_keep": 35, "valid": [34, 35]},  # Main line only
    "M3":  {"start_keep": 90, "end_keep": 91, "valid": [90, 91]},
    "M4":  {"start_keep": 70, "end_keep": 71, "valid": [70, 71]},
    "M5":  {"start_keep": 102, "end_keep": 103, "valid": [102, 103]},
    "M6":  {"start_keep": 15, "end_keep": 16, "valid": [15, 16]},
    "M7":  {"start_keep": 42, "end_keep": 43, "valid": [42, 43]},  # Mecidiyeköy -> Mahmutbey
    "M8":  {"start_keep": 78, "end_keep": 79, "valid": [78, 79]},
    "M9":  {"start_keep": 107, "end_keep": 106, "valid": [106, 107]},
    "T1":  {"start_keep": 22, "end_keep": 21, "valid": [21, 22]},  # Kabataş -> Bağcılar
    "T3":  {"start_keep": 23, "end_keep": 23, "valid": [23]},      # Ring line
    "T4":  {"start_keep": 18, "end_keep": 17, "valid": [17, 18]},
    "T5":  {"start_keep": 86, "end_keep": 87, "valid": [86, 87]},
    "TF1": {"start_keep": 46, "end_keep": 47, "valid": [46, 47]},
    "TF2": {"start_keep": 44, "end_keep": 45, "valid": [44, 45]},
}


def filter_directions(directions: List[Dict], keep_ids: List[int]) -> List[Dict]:
    """
    Filter direction list to only include specified direction IDs.
    
    Args:
        directions: Original directions list with {id, name}
        keep_ids: List of direction IDs to keep
        
    Returns:
        Filtered directions list
    """
    return [d for d in directions if d.get('id') in keep_ids]


def clean_topology():
    """
    Main cleaning logic:
    1. Load existing metro_topology.json
    2. For each line, apply direction filtering rules
    3. Filter terminus stations to show only departure direction
    4. Filter intermediate stations to show only main-line directions
    5. Save cleaned topology back to file
    """
    logger.info("=" * 70)
    logger.info("Metro Topology Cleaner & Standardizer")
    logger.info("=" * 70)
    
    # Load existing topology
    logger.info(f"\nLoading topology from: {TOPOLOGY_PATH}")
    with open(TOPOLOGY_PATH, 'r', encoding='utf-8') as f:
        topology = json.load(f)
    
    total_lines_processed = 0
    total_stations_cleaned = 0
    
    # Process each line
    for line_name, line_data in topology['lines'].items():
        # Check if we have rules for this line
        if line_name not in DIRECTION_RULES:
            logger.warning(f"⚠ {line_name}: No direction rules defined, skipping")
            continue
        
        rules = DIRECTION_RULES[line_name]
        stations = line_data['stations']
        
        # Sort stations by order to identify start/end
        stations_sorted = sorted(stations, key=lambda s: s.get('order', 0))
        
        if len(stations_sorted) == 0:
            logger.warning(f"⚠ {line_name}: No stations found, skipping")
            continue
        
        logger.info(f"\nProcessing {line_name}:")
        logger.info(f"  Total stations: {len(stations_sorted)}")
        
        start_station = stations_sorted[0]
        end_station = stations_sorted[-1]
        intermediate_stations = stations_sorted[1:-1] if len(stations_sorted) > 2 else []
        
        cleaned_count = 0
        
        # Clean START station - only keep departure direction
        original_dirs = len(start_station.get('directions', []))
        start_station['directions'] = filter_directions(
            start_station.get('directions', []),
            [rules['start_keep']]
        )
        new_dirs = len(start_station['directions'])
        if original_dirs != new_dirs:
            cleaned_count += 1
            logger.info(f"    ✓ Start station '{start_station['name']}': {original_dirs} → {new_dirs} direction(s)")
        
        # Clean END station - only keep departure direction
        original_dirs = len(end_station.get('directions', []))
        end_station['directions'] = filter_directions(
            end_station.get('directions', []),
            [rules['end_keep']]
        )
        new_dirs = len(end_station['directions'])
        if original_dirs != new_dirs:
            cleaned_count += 1
            logger.info(f"    ✓ End station '{end_station['name']}': {original_dirs} → {new_dirs} direction(s)")
        
        # Clean INTERMEDIATE stations - only keep valid main-line directions
        for station in intermediate_stations:
            original_dirs = len(station.get('directions', []))
            station['directions'] = filter_directions(
                station.get('directions', []),
                rules['valid']
            )
            new_dirs = len(station['directions'])
            if original_dirs != new_dirs:
                cleaned_count += 1
        
        if len(intermediate_stations) > 0:
            logger.info(f"    ✓ Cleaned {cleaned_count - 2} intermediate station(s)")
        
        total_lines_processed += 1
        total_stations_cleaned += cleaned_count
    
    # Save cleaned topology
    logger.info(f"\n{'=' * 70}")
    logger.info("Saving cleaned topology...")
    
    with open(TOPOLOGY_PATH, 'w', encoding='utf-8') as f:
        json.dump(topology, f, ensure_ascii=False, indent=2)
    
    file_size_kb = TOPOLOGY_PATH.stat().st_size / 1024
    
    logger.info(f"{'=' * 70}")
    logger.info("✓ Topology Cleaning Complete!")
    logger.info(f"  Lines processed: {total_lines_processed}/{len(DIRECTION_RULES)}")
    logger.info(f"  Stations cleaned: {total_stations_cleaned}")
    logger.info(f"  File size: {file_size_kb:.1f} KB")
    logger.info(f"  Output: {TOPOLOGY_PATH}")
    logger.info(f"{'=' * 70}")


if __name__ == "__main__":
    try:
        clean_topology()
    except Exception as e:
        logger.error(f"\n✗ Cleaning failed: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
