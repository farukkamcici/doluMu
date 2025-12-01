"""
IETT Bus Line Routes Data Ingestion Script

Fetches ordered stop sequences for all bus lines in Istanbul from IETT API
and saves them as a structured JSON file for frontend route visualization.

API Documentation: docs/ibb_api_doc.pdf
- Section 4.1: GetHat_json (Get all lines)
- Section 7.1: DurakDetay_GYY (Get ordered stops for a line)
"""

import requests
import json
import time
import os
from datetime import datetime
from typing import Dict, List, Optional
import logging
import xml.etree.ElementTree as ET
from tqdm import tqdm

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# API Configuration
HAT_API_URL = "https://api.ibb.gov.tr/iett/UlasimAnaVeri/HatDurakGuzergah.asmx"
DURAK_DETAY_API_URL = "https://api.ibb.gov.tr/iett/ibb/ibb.asmx"

# SOAP Headers
HAT_SOAP_HEADERS = {
    'Content-Type': 'text/xml; charset=utf-8',
    'SOAPAction': 'http://tempuri.org/GetHat_json'
}

DURAK_DETAY_SOAP_HEADERS = {
    'Content-Type': 'text/xml; charset=utf-8',
    'SOAPAction': 'http://tempuri.org/DurakDetay_GYY'
}

# Output Configuration
OUTPUT_DIR = "frontend/public/data"
OUTPUT_FILE = "line_routes.json"

# Rate limiting
REQUEST_DELAY = 0.05  # 50ms between requests


def fetch_all_lines() -> List[str]:
    """
    Fetch all bus line codes from IETT API using GetHat_json endpoint.
    
    Returns:
        List of line codes (SHATKODU)
    """
    logger.info("Fetching all bus lines from IETT API...")
    
    try:
        # Build SOAP envelope for GetHat_json request
        soap_envelope = '''<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
               xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetHat_json xmlns="http://tempuri.org/">
      <HatKodu></HatKodu>
    </GetHat_json>
  </soap:Body>
</soap:Envelope>'''
        
        # Call API using SOAP POST
        response = requests.post(
            HAT_API_URL,
            data=soap_envelope,
            headers=HAT_SOAP_HEADERS,
            timeout=60
        )
        response.raise_for_status()
        
        # Parse XML response to extract JSON data
        root = ET.fromstring(response.content)
        
        # Find the JSON response in the SOAP envelope
        namespaces = {
            'soap': 'http://schemas.xmlsoap.org/soap/envelope/',
            'ns': 'http://tempuri.org/'
        }
        json_result = root.find('.//ns:GetHat_jsonResult', namespaces)
        
        if json_result is None or not json_result.text:
            logger.error("No data found in SOAP response")
            return []
        
        # Parse the JSON data from XML
        lines_data = json.loads(json_result.text)
        
        if not lines_data:
            logger.error("API returned empty response")
            return []
        
        # Extract line codes
        line_codes = [str(line.get("SHATKODU", "")).strip() for line in lines_data]
        line_codes = [code for code in line_codes if code]  # Remove empty codes
        
        logger.info(f"Received {len(line_codes)} bus lines from API")
        return line_codes
        
    except requests.exceptions.RequestException as e:
        logger.error(f"API request failed: {e}")
        raise
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse API response as JSON: {e}")
        raise
    except ET.ParseError as e:
        logger.error(f"Failed to parse SOAP XML response: {e}")
        raise


def fetch_line_stops(line_code: str) -> Optional[Dict[str, List[str]]]:
    """
    Fetch ordered stop sequence for a specific bus line.
    
    Uses DurakDetay_GYY endpoint which returns XML with:
    - HATKODU: Line code
    - YON: Direction (G=Gidiş/Outbound, D=Dönüş/Return)
    - SIRANO: Sequence number
    - DURAKKODU: Stop code
    
    Args:
        line_code: Bus line code (e.g., "15F", "500T")
        
    Returns:
        Dictionary with directions as keys and ordered stop lists as values:
        {"G": ["stop1", "stop2", ...], "D": ["stop3", "stop4", ...]}
        Returns None if request fails
    """
    try:
        # Build SOAP envelope for DurakDetay_GYY request
        soap_envelope = f'''<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
               xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <DurakDetay_GYY xmlns="http://tempuri.org/">
      <hat_kodu>{line_code}</hat_kodu>
    </DurakDetay_GYY>
  </soap:Body>
</soap:Envelope>'''
        
        # Call API using SOAP POST
        response = requests.post(
            DURAK_DETAY_API_URL,
            data=soap_envelope,
            headers=DURAK_DETAY_SOAP_HEADERS,
            timeout=30
        )
        response.raise_for_status()
        
        # Parse XML response
        root = ET.fromstring(response.content)
        
        # Find the result in the SOAP envelope
        namespaces = {
            'soap': 'http://schemas.xmlsoap.org/soap/envelope/',
            'ns': 'http://tempuri.org/'
        }
        
        # The result contains nested XML with stop details
        result_node = root.find('.//ns:DurakDetay_GYYResult', namespaces)
        
        if result_node is None:
            logger.debug(f"No result node found for line {line_code}")
            return None
        
        # Parse the nested XML content
        if result_node.text:
            # The result contains another XML document
            stops_root = ET.fromstring(result_node.text)
            stops_elements = stops_root.findall('.//Table')
        else:
            # Try direct children
            stops_elements = root.findall('.//Table')
        
        if not stops_elements:
            logger.debug(f"No stops found for line {line_code}")
            return None
        
        # Group stops by direction and sort by sequence
        routes = {}
        
        for stop_elem in stops_elements:
            try:
                yon = stop_elem.find('YON')
                sirano = stop_elem.find('SIRANO')
                durakkodu = stop_elem.find('DURAKKODU')
                
                if yon is None or sirano is None or durakkodu is None:
                    continue
                
                direction = str(yon.text).strip() if yon.text else ""
                sequence = int(sirano.text) if sirano.text else 0
                stop_code = str(durakkodu.text).strip() if durakkodu.text else ""
                
                if not direction or not stop_code:
                    continue
                
                if direction not in routes:
                    routes[direction] = []
                
                routes[direction].append((sequence, stop_code))
                
            except (ValueError, AttributeError) as e:
                logger.debug(f"Error parsing stop element for line {line_code}: {e}")
                continue
        
        # Sort stops by sequence number and extract stop codes
        for direction in routes:
            routes[direction] = [stop_code for _, stop_code in sorted(routes[direction])]
        
        return routes if routes else None
        
    except requests.exceptions.RequestException as e:
        logger.debug(f"Request failed for line {line_code}: {e}")
        return None
    except ET.ParseError as e:
        logger.debug(f"XML parsing failed for line {line_code}: {e}")
        return None
    except Exception as e:
        logger.warning(f"Unexpected error for line {line_code}: {e}")
        return None


def fetch_all_routes(line_codes: List[str]) -> Dict[str, Dict[str, List[str]]]:
    """
    Fetch ordered stop sequences for all bus lines with progress tracking.
    
    Args:
        line_codes: List of bus line codes
        
    Returns:
        Dictionary mapping line codes to their routes:
        {
            "15F": {"G": [...], "D": [...]},
            "500T": {"G": [...]}
        }
    """
    logger.info(f"Fetching routes for {len(line_codes)} bus lines...")
    
    routes = {}
    failed_count = 0
    empty_count = 0
    
    # Progress bar
    for line_code in tqdm(line_codes, desc="Fetching routes", unit="line"):
        # Rate limiting
        time.sleep(REQUEST_DELAY)
        
        try:
            line_routes = fetch_line_stops(line_code)
            
            if line_routes:
                routes[line_code] = line_routes
            else:
                empty_count += 1
                logger.debug(f"No routes found for line {line_code}")
                
        except Exception as e:
            failed_count += 1
            logger.warning(f"Failed to fetch line {line_code}: {e}")
            continue
    
    logger.info(f"Successfully fetched {len(routes)} lines")
    if empty_count > 0:
        logger.info(f"Lines with no route data: {empty_count}")
    if failed_count > 0:
        logger.warning(f"Failed requests: {failed_count}")
    
    return routes


def save_routes_data(routes: Dict, output_path: str):
    """
    Save processed route data to JSON file.
    
    Args:
        routes: Routes dictionary
        output_path: Full path to output JSON file
    """
    # Calculate statistics
    total_routes = sum(len(directions) for directions in routes.values())
    total_stops = sum(
        len(stops) 
        for line_routes in routes.values() 
        for stops in line_routes.values()
    )
    
    output_data = {
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "total_lines": len(routes),
        "total_routes": total_routes,
        "total_stop_sequences": total_stops,
        "routes": routes
    }
    
    # Create output directory if it doesn't exist
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # Write JSON file with pretty formatting
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    
    logger.info(f"Saved route data to {output_path}")
    logger.info(f"File size: {os.path.getsize(output_path) / 1024:.2f} KB")
    logger.info(f"Total lines: {len(routes)}")
    logger.info(f"Total routes (directions): {total_routes}")
    logger.info(f"Total stop sequences: {total_stops}")


def main():
    """
    Main execution function.
    """
    try:
        logger.info("="*60)
        logger.info("IETT Bus Line Routes Ingestion Script")
        logger.info("="*60)
        
        # Step 1: Fetch all line codes
        line_codes = fetch_all_lines()
        
        if not line_codes:
            logger.error("No line codes fetched from API. Exiting.")
            return
        
        # Step 2: Fetch routes for all lines
        routes = fetch_all_routes(line_codes)
        
        if not routes:
            logger.error("No routes fetched. Exiting.")
            return
        
        # Step 3: Save to output file
        output_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            OUTPUT_DIR,
            OUTPUT_FILE
        )
        save_routes_data(routes, output_path)
        
        logger.info("="*60)
        logger.info("✅ Route data ingestion completed successfully")
        logger.info("="*60)
        
    except Exception as e:
        logger.error(f"❌ Script failed: {e}")
        raise


if __name__ == "__main__":
    main()