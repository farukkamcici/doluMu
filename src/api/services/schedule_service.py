"""
IETT Planned Schedule Service.

Fetches bus schedules from IETT API (SOAP/XML) and caches them for efficient access.
Filters schedules by day type (weekday/Saturday/Sunday).

Author: Backend Team
Date: 2025-12-02
"""

import requests
import logging
from datetime import datetime, time
from typing import Dict, List, Optional
from cachetools import TTLCache
import xml.etree.ElementTree as ET

from ..db import SessionLocal
from .bus_schedule_cache import bus_schedule_cache_service
from ..models import BusScheduleCache

logger = logging.getLogger(__name__)

# In-process micro-cache (DB is the source of truth).
# Key: line_code_date, Value: canonical schedule payload
_schedule_cache = TTLCache(maxsize=2000, ttl=300)


class IETTScheduleService:
    """
    Service for fetching and caching IETT bus schedules via SOAP/XML.
    """
    
    IETT_API_URL = "https://api.ibb.gov.tr/iett/UlasimAnaVeri/PlanlananSeferSaati.asmx"
    
    SOAP_ENVELOPE_TEMPLATE = """<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
               xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetPlanlananSeferSaati_XML xmlns="http://tempuri.org/">
      <HatKodu>{line_code}</HatKodu>
    </GetPlanlananSeferSaati_XML>
  </soap:Body>
</soap:Envelope>"""
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (compatible; IBB-Transport-Platform/1.0)',
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': 'http://tempuri.org/GetPlanlananSeferSaati_XML'
        })
    
    def _get_day_type(self) -> str:
        """
        Determine day type based on current day of week.
        
        Returns:
            "I" for weekdays (Monday-Friday)
            "C" for Saturday
            "P" for Sunday
        """
        weekday = datetime.now().weekday()
        
        if weekday == 6:  # Sunday
            return "P"
        elif weekday == 5:  # Saturday
            return "C"
        else:  # Monday-Friday
            return "I"
    
    def _parse_time(self, time_str: str) -> Optional[time]:
        """
        Parse time string to time object for sorting.
        
        Args:
            time_str: Time string in various formats (e.g., "06:00", "6:0", "06:00:00")
            
        Returns:
            time object or None if parsing fails
        """
        try:
            # Try common formats
            for fmt in ["%H:%M", "%H:%M:%S", "%I:%M %p"]:
                try:
                    return datetime.strptime(time_str.strip(), fmt).time()
                except ValueError:
                    continue
            
            # Try parsing manually for edge cases
            parts = time_str.strip().split(':')
            if len(parts) >= 2:
                hour = int(parts[0])
                minute = int(parts[1])
                return time(hour=hour, minute=minute)
                
        except Exception as e:
            logger.warning(f"Failed to parse time '{time_str}': {e}")
        
        return None
    
    def _parse_xml_response(self, xml_text: str) -> Optional[List[Dict]]:
        """
        Parse SOAP XML response to extract schedule data.
        
        Args:
            xml_text: Raw XML response text
            
        Returns:
            List of schedule records or None if parsing fails
        """
        try:
            root = ET.fromstring(xml_text)
            
            # Define namespaces
            namespaces = {
                'soap': 'http://schemas.xmlsoap.org/soap/envelope/',
                'diffgr': 'urn:schemas-microsoft-com:xml-diffgram-v1',
                'msdata': 'urn:schemas-microsoft-com:xml-msdata'
            }
            
            # Navigate to NewDataSet -> Table elements
            # Path: soap:Body -> GetPlanlananSeferSaati_XMLResponse -> GetPlanlananSeferSaati_XMLResult -> diffgr:diffgram -> NewDataSet -> Table
            body = root.find('.//NewDataSet', namespaces)
            if body is None:
                # Try without namespace
                body = root.find('.//NewDataSet')
            
            if body is None:
                logger.warning("No NewDataSet found in XML response")
                return None
            
            # Extract all Table elements
            tables = body.findall('.//Table')
            if not tables:
                logger.warning("No Table elements found in XML response")
                return None
            
            schedule_data = []
            for table in tables:
                record = {}
                for child in table:
                    # Remove namespace prefix from tag
                    tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
                    record[tag] = child.text if child.text else ""
                
                if record:
                    schedule_data.append(record)
            
            return schedule_data
            
        except ET.ParseError as e:
            logger.error(f"XML parsing error: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error parsing XML: {e}")
            return None
    
    def _fetch_from_iett(self, line_code: str) -> Optional[List[Dict]]:
        """
        Fetch schedule data from IETT SOAP API.
        
        Args:
            line_code: Bus line code (e.g., "15F")
            
        Returns:
            List of schedule records or None if request fails
        """
        try:
            # Prepare SOAP envelope
            soap_body = self.SOAP_ENVELOPE_TEMPLATE.format(line_code=line_code)
            
            # Send POST request
            response = self.session.post(
                self.IETT_API_URL,
                data=soap_body.encode('utf-8'),
                timeout=15
            )
            response.raise_for_status()
            
            # Parse XML response
            schedule_data = self._parse_xml_response(response.text)
            
            if schedule_data is None:
                logger.warning(f"No schedule data parsed for line {line_code}")
                return None
            
            return schedule_data
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to fetch schedule for line {line_code}: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error fetching schedule for line {line_code}: {e}")
            return None
    
    def _parse_route_name(self, route_name: str) -> Dict[str, str]:
        """
        Parse route name to extract start and end stops.
        
        Args:
            route_name: Route name string (e.g., "KADIKÖY - PENDİK")
            
        Returns:
            Dictionary with start and end stop names
        """
        if not route_name or ' - ' not in route_name:
            return {"start": "", "end": ""}
        
        parts = route_name.split(' - ', 1)
        if len(parts) == 2:
            return {"start": parts[0].strip(), "end": parts[1].strip()}
        
        return {"start": "", "end": ""}
    
    def get_schedule(self, line_code: str) -> Dict:
        """Get filtered and sorted schedule for a bus line.

        Source of truth is Postgres cache (bus_schedules). On cache miss the
        service fetches from IETT, stores the result, and returns it.

        Args:
            line_code: Bus line code (e.g., "15F")

        Returns:
            Canonical payload with directions, route metadata and status flags.
        """
        target_date = bus_schedule_cache_service.today_istanbul()
        cache_key = f"{line_code}_{target_date.isoformat()}"

        # Fast path: memory cache
        if cache_key in _schedule_cache:
            logger.debug("Memory cache hit for schedule: %s", line_code)
            return _schedule_cache[cache_key]

        # DB cache lookup
        db = SessionLocal()
        try:
            cached_payload, is_stale, record = bus_schedule_cache_service.get_cached_schedule(
                db,
                line_code,
                valid_for=target_date,
                max_stale_days=2
            )
            if cached_payload:
                if is_stale:
                    logger.warning(
                        "Serving stale bus schedule for line=%s (valid_for=%s)",
                        line_code,
                        record.valid_for if record else target_date
                    )
                _schedule_cache[cache_key] = cached_payload
                return cached_payload
        finally:
            db.close()

        # Cache miss: fetch from upstream and persist
        logger.info("Fetching schedule for line %s from IETT API", line_code)
        day_type = bus_schedule_cache_service.day_type_for_date(target_date)

        db = SessionLocal()
        try:
            try:
                raw_rows = bus_schedule_cache_service.fetch_schedule_from_api(line_code)
                payload = bus_schedule_cache_service.build_filtered_payload(raw_rows, target_date=target_date)

                bus_schedule_cache_service.store_schedule(
                    db,
                    line_code=line_code,
                    valid_for=target_date,
                    day_type=day_type,
                    payload=payload,
                    status='SUCCESS'
                )

                _schedule_cache[cache_key] = payload
                return payload

            except Exception as exc:
                logger.error("Failed to fetch schedule for line %s: %s", line_code, exc)
                
                # Return payload indicating schedule fetch failed
                # UI should show forecasts for all hours with "schedule unavailable" note
                failed_payload = {
                    "G": [],
                    "D": [],
                    "meta": {},
                    "has_service_today": True,  # Not a service day issue - data fetch issue
                    "data_status": "FETCH_FAILED",
                    "day_type": day_type,
                    "valid_for": target_date.isoformat(),
                }

                # Persist failure row for observability
                try:
                    bus_schedule_cache_service.store_schedule(
                        db,
                        line_code=line_code,
                        valid_for=target_date,
                        day_type=day_type,
                        payload=failed_payload,
                        status='FAILED',
                        error_message=str(exc)[:1000]
                    )
                except Exception:
                    pass

                _schedule_cache[cache_key] = failed_payload
                return failed_payload
        finally:
            db.close()


    def clear_cache(self, line_code: Optional[str] = None):
        """Clear bus schedule cache.

        Clears both the in-process micro-cache and persisted Postgres cache rows.
        """
        target_date = bus_schedule_cache_service.today_istanbul()

        # Memory
        if line_code:
            _schedule_cache.pop(f"{line_code}_{target_date.isoformat()}", None)
        else:
            _schedule_cache.clear()

        # DB
        db = SessionLocal()
        try:
            q = db.query(BusScheduleCache)
            if line_code:
                q = q.filter(BusScheduleCache.line_code == line_code)
            deleted = q.delete(synchronize_session=False)
            db.commit()
            logger.info("Cleared bus schedule DB cache (line=%s, deleted=%s)", line_code, deleted)
        except Exception as exc:
            db.rollback()
            logger.warning("Failed to clear bus schedule DB cache: %s", exc)
        finally:
            db.close()

    def get_cache_stats(self) -> Dict:
        """Get schedule cache statistics (memory + DB)."""
        target_date = bus_schedule_cache_service.today_istanbul()
        day_type = bus_schedule_cache_service.day_type_for_date(target_date)

        db = SessionLocal()
        try:
            rows_today = db.query(BusScheduleCache).filter(
                BusScheduleCache.valid_for == target_date,
                BusScheduleCache.day_type == day_type,
            ).count()
            rows_success = db.query(BusScheduleCache).filter(
                BusScheduleCache.valid_for == target_date,
                BusScheduleCache.day_type == day_type,
                BusScheduleCache.source_status == 'SUCCESS',
            ).count()
        finally:
            db.close()

        return {
            "memory": {
                "cache_size": len(_schedule_cache),
                "max_size": _schedule_cache.maxsize,
                "ttl_seconds": _schedule_cache.ttl,
            },
            "db": {
                "date": target_date.isoformat(),
                "day_type": day_type,
                "rows_today": rows_today,
                "rows_today_success": rows_success,
            },
        }


# Global singleton instance
schedule_service = IETTScheduleService()
