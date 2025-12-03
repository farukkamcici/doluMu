"""
Line Status Service - Unified Alerts and Operation Hours.

Combines IETT disruption alerts with schedule-based operation hours
to provide comprehensive line status information.

Author: Backend Team
Date: 2025-12-03
"""

import requests
import logging
from datetime import datetime, time, timedelta
from typing import Dict, Optional, List
from cachetools import TTLCache
import xml.etree.ElementTree as ET
from .schedule_service import schedule_service

logger = logging.getLogger(__name__)

# Cache status for 5 minutes (300 seconds)
_status_cache = TTLCache(maxsize=500, ttl=300)


class LineStatus:
    """Line status enumeration."""
    ACTIVE = "ACTIVE"
    WARNING = "WARNING"
    OUT_OF_SERVICE = "OUT_OF_SERVICE"


class IETTStatusService:
    """
    Service for determining line operational status.
    Checks both IETT disruption alerts and operating hours.
    """
    
    IETT_ALERTS_URL = "https://api.ibb.gov.tr/iett/UlasimDinamikVeri/Duyurular.asmx"
    
    SOAP_ENVELOPE_TEMPLATE = """<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
               xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetDuyurular_json xmlns="http://tempuri.org/" />
  </soap:Body>
</soap:Envelope>"""
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': 'http://tempuri.org/GetDuyurular_json',
            'Origin': 'https://api.ibb.gov.tr',
            'Referer': 'https://api.ibb.gov.tr/iett/UlasimDinamikVeri/Duyurular.asmx',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Connection': 'keep-alive',
            'Cache-Control': 'max-age=0'
        })
    
    def _parse_update_time(self, time_str: str) -> Optional[datetime]:
        """
        Parse GUNCELLEME_SAATI field from IETT API.
        
        Format from API: "Kayit Saati: 04:09" or "Kayit Saati: 16:07"
        We extract the time and combine with today's date.
        
        Args:
            time_str: Time string from API
            
        Returns:
            datetime object or None if parsing fails
        """
        try:
            # Extract time from "Kayit Saati: HH:MM" format
            if "Kayit Saati:" in time_str or "Kayıt Saati:" in time_str:
                time_part = time_str.split(":")[-2:]  # Get last two parts ["04", "09"]
                if len(time_part) == 2:
                    hour = int(time_part[0].strip().split()[-1])  # Extract hour
                    minute = int(time_part[1].strip())
                    
                    # Combine with today's date
                    today = datetime.now().date()
                    update_time = datetime.combine(today, time(hour=hour, minute=minute))
                    
                    # If time is 04:00 (early morning update), it might be for today
                    # If current time is before 04:00, the update is from yesterday
                    now = datetime.now()
                    if now.hour < 4 and hour >= 4:
                        # It's past midnight but before 4am, update is from yesterday
                        update_time = update_time - timedelta(days=1)
                    
                    return update_time
        except Exception as e:
            logger.warning(f"Failed to parse update time '{time_str}': {e}")
        
        return None
    
    def _fetch_alerts(self, line_code: str) -> List[str]:
        """
        Fetch disruption alerts from IETT API.
        
        According to IETT API spec (page 4), GetDuyurular_json returns ALL alerts
        for all lines. We need to filter by HAT field to find alerts for our line.
        
        Only returns alerts from the last 24 hours (based on GUNCELLEME_SAATI).
        
        Response fields: HATKODU, HAT, TIP, GUNCELLEME_SAATI, MESAJ
        
        Args:
            line_code: Line code to check for alerts (e.g., "10", "10B")
            
        Returns:
            List of alert message texts (empty list if no active alerts)
        """
        try:
            soap_body = self.SOAP_ENVELOPE_TEMPLATE
            
            response = self.session.post(
                self.IETT_ALERTS_URL,
                data=soap_body.encode('utf-8'),
                timeout=10
            )
            response.raise_for_status()
            
            # Parse XML response
            root = ET.fromstring(response.text)
            
            # Find all Table elements (each represents an announcement)
            tables = root.findall('.//{*}Table')
            if not tables:
                # Try without namespace
                tables = root.findall('.//Table')
            
            if not tables:
                logger.debug(f"No announcements found in API response")
                return []
            
            # Collect all alerts for this line
            alerts = []
            now = datetime.now()
            cutoff_time = now - timedelta(hours=24)
            
            for table in tables:
                # Extract HATKODU (preferred) or HAT
                hatkodu_elem = table.find('.//{*}HATKODU')
                if hatkodu_elem is None:
                    hatkodu_elem = table.find('.//HATKODU')
                
                # Extract MESAJ
                mesaj_elem = table.find('.//{*}MESAJ')
                if mesaj_elem is None:
                    mesaj_elem = table.find('.//MESAJ')
                
                # Extract GUNCELLEME_SAATI for timestamp filtering
                update_time_elem = table.find('.//{*}GUNCELLEME_SAATI')
                if update_time_elem is None:
                    update_time_elem = table.find('.//GUNCELLEME_SAATI')
                
                # Check if this announcement is for our line
                if hatkodu_elem is not None and mesaj_elem is not None:
                    hat_code = hatkodu_elem.text.strip() if hatkodu_elem.text else ""
                    mesaj_text = mesaj_elem.text.strip() if mesaj_elem.text else ""
                    
                    # Match line code (case-insensitive)
                    if hat_code.upper() == line_code.upper() and mesaj_text:
                        # Check timestamp - only include alerts from last 24 hours
                        if update_time_elem is not None and update_time_elem.text:
                            update_time = self._parse_update_time(update_time_elem.text)
                            
                            if update_time and update_time < cutoff_time:
                                logger.debug(f"Skipping old alert for line {line_code}: {update_time}")
                                continue
                        
                        alerts.append(mesaj_text)
                        logger.info(f"Alert found for line {line_code}: {mesaj_text[:50]}...")
            
            if alerts:
                logger.info(f"Found {len(alerts)} active alert(s) for line {line_code}")
            else:
                logger.debug(f"No active alerts found for line {line_code}")
            
            return alerts
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to fetch alerts for line {line_code}: {e}")
            return []
        except ET.ParseError as e:
            logger.error(f"XML parsing error for alerts: {e}")
            return []
        except Exception as e:
            logger.error(f"Unexpected error fetching alerts: {e}")
            return []
    
    def _parse_time(self, time_str: str) -> Optional[time]:
        """
        Parse time string to time object.
        
        Args:
            time_str: Time string (e.g., "06:00", "23:30")
            
        Returns:
            time object or None if parsing fails
        """
        try:
            parts = time_str.strip().split(':')
            if len(parts) >= 2:
                hour = int(parts[0])
                minute = int(parts[1])
                return time(hour=hour, minute=minute)
        except Exception as e:
            logger.warning(f"Failed to parse time '{time_str}': {e}")
        return None
    
    def _check_operation_hours(self, line_code: str) -> Dict:
        """
        Check if line is currently in operation based on schedule.
        
        Args:
            line_code: Line code to check
            
        Returns:
            Dictionary with in_operation (bool) and next_service_time (str or None)
        """
        try:
            schedule = schedule_service.get_schedule(line_code)
            
            # Get all times from both directions
            all_times = []
            for direction in ['G', 'D']:
                times = schedule.get(direction, [])
                for time_str in times:
                    parsed = self._parse_time(time_str)
                    if parsed:
                        all_times.append(parsed)
            
            if not all_times:
                # No schedule data - assume active (benefit of doubt)
                return {"in_operation": True, "next_service_time": None}
            
            # Sort times
            all_times.sort()
            
            # Get current time
            now = datetime.now().time()
            
            # Find first and last service times
            first_service = all_times[0]
            last_service = all_times[-1]
            
            # Check if current time is within operating hours
            if first_service <= now <= last_service:
                return {"in_operation": True, "next_service_time": None}
            else:
                # Out of service - find next service time
                next_service = None
                if now < first_service:
                    # Before first service
                    next_service = first_service.strftime("%H:%M")
                else:
                    # After last service - next service is tomorrow's first service
                    next_service = first_service.strftime("%H:%M")
                
                return {"in_operation": False, "next_service_time": next_service}
                
        except Exception as e:
            logger.error(f"Error checking operation hours for line {line_code}: {e}")
            # On error, assume active
            return {"in_operation": True, "next_service_time": None}
    
    def get_line_status(self, line_code: str) -> Dict:
        """
        Get comprehensive line status including alerts and operation hours.
        
        Args:
            line_code: Line code to check
            
        Returns:
            Dictionary with status, messages (list), and metadata
            Example: {
                "status": "WARNING",
                "messages": ["Alert 1", "Alert 2"],
                "next_service_time": None
            }
        """
        # Check cache first
        if line_code in _status_cache:
            logger.debug(f"Cache hit for status: {line_code}")
            return _status_cache[line_code]
        
        logger.info(f"Fetching status for line {line_code}")
        
        # Step 1: Check for alerts
        alert_messages = self._fetch_alerts(line_code)
        
        if alert_messages:
            result = {
                "status": LineStatus.WARNING,
                "messages": alert_messages,
                "next_service_time": None
            }
            _status_cache[line_code] = result
            return result
        
        # Step 2: Check operation hours
        operation_info = self._check_operation_hours(line_code)
        
        if not operation_info["in_operation"]:
            next_time = operation_info.get("next_service_time")
            message = f"Hat şu an hizmet vermemektedir. İlk sefer: {next_time}" if next_time else "Hat şu an hizmet vermemektedir."
            
            result = {
                "status": LineStatus.OUT_OF_SERVICE,
                "messages": [message],
                "next_service_time": next_time
            }
            _status_cache[line_code] = result
            return result
        
        # Step 3: All clear - line is active
        result = {
            "status": LineStatus.ACTIVE,
            "messages": [],
            "next_service_time": None
        }
        _status_cache[line_code] = result
        return result
    
    def clear_cache(self, line_code: Optional[str] = None):
        """
        Clear status cache.
        
        Args:
            line_code: If provided, clear only this line's cache. Otherwise clear all.
        """
        if line_code:
            _status_cache.pop(line_code, None)
            logger.info(f"Cleared status cache for line {line_code}")
        else:
            _status_cache.clear()
            logger.info("Cleared all status cache")
    
    def get_cache_stats(self) -> Dict:
        """
        Get cache statistics.
        
        Returns:
            Dictionary with cache size and TTL info
        """
        return {
            "cache_size": len(_status_cache),
            "max_size": _status_cache.maxsize,
            "ttl_seconds": _status_cache.ttl
        }


# Global singleton instance
status_service = IETTStatusService()
