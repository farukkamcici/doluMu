"""
Live list of İETT bus lines (GetHat_json).

The forecast database's line list comes from 2022–24 ridership data; about a fifth of those bus
lines no longer run. This registry lets jobs and search skip them. If İETT is unreachable it
returns None and callers fall back to the full database list. Refreshes run in a background thread,
so a caller (search) never waits on İETT's timeout.
"""
from __future__ import annotations

import json
import logging
import re
import threading
import time
from typing import Optional, Set

import requests

logger = logging.getLogger(__name__)

_URL = "https://api.ibb.gov.tr/iett/UlasimAnaVeri/HatDurakGuzergah.asmx"
_ENVELOPE = (
    '<?xml version="1.0" encoding="utf-8"?>'
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>'
    '<GetHat_json xmlns="http://tempuri.org/"><HatKodu></HatKodu></GetHat_json>'
    "</soap:Body></soap:Envelope>"
)
_TTL_SECONDS = 12 * 3600
# After a failed refresh, wait this long before trying again.
_RETRY_SECONDS = 10 * 60
# Sanity floor: a near-empty answer means İETT had a hiccup, not that lines were cancelled.
_MIN_LINES = 300


class IettLineRegistry:
    def __init__(self) -> None:
        self._codes: Optional[Set[str]] = None
        self._fetched_at = 0.0
        self._failed_at = 0.0
        self._refreshing = False
        self._lock = threading.Lock()

    def _fetch(self) -> Set[str]:
        res = requests.post(
            _URL,
            data=_ENVELOPE.encode("utf-8"),
            headers={"Content-Type": "text/xml; charset=utf-8", "SOAPAction": '"http://tempuri.org/GetHat_json"'},
            timeout=30,
        )
        res.raise_for_status()
        match = re.search(r"<GetHat_jsonResult>(.*?)</GetHat_jsonResult>", res.text, re.S)
        if not match:
            raise ValueError("GetHat_json: empty result")
        payload = json.loads(match.group(1).replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">"))
        codes = {str(row["SHATKODU"]).strip() for row in payload if row.get("SHATKODU")}
        if len(codes) < _MIN_LINES:
            raise ValueError(f"GetHat_json returned only {len(codes)} lines")
        return codes

    def _refresh(self) -> None:
        try:
            codes = self._fetch()
            with self._lock:
                self._codes, self._fetched_at = codes, time.time()
            logger.info("İETT registry refreshed: %d active lines", len(codes))
        except Exception as exc:  # noqa: BLE001 - any failure means "unknown"
            with self._lock:
                self._failed_at = time.time()
            logger.warning("İETT registry unavailable (%s); keeping %s", exc, "previous list" if self._codes else "no filter")
        finally:
            with self._lock:
                self._refreshing = False

    def active_codes(self) -> Optional[Set[str]]:
        """Codes of lines İETT runs today, or None when unknown (callers must not filter then)."""
        with self._lock:
            now = time.time()
            stale = self._codes is None or now - self._fetched_at >= _TTL_SECONDS
            if stale and not self._refreshing and now - self._failed_at >= _RETRY_SECONDS:
                self._refreshing = True
                threading.Thread(target=self._refresh, name="iett-registry", daemon=True).start()
            return self._codes


iett_registry = IettLineRegistry()
