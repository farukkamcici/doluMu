"""
Push notifications for the DoluMu app (see dolumu-mobile/docs/notifications.md).

Live state (disruptions, arrivals) comes from the app API, so the same logic isn't written twice;
messages go out through the Expo push service. Three kinds:
  - alarm:            one-off "your bus is N minutes away" at a stop (checked every 30 s)
  - line_disruption:  a subscribed rail line gets / loses a disruption notice (every 2 min)
  - station_outage:   a lift/escalator breaks at a subscribed station (every 2 min)
"""
from __future__ import annotations

import logging
import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

import requests
from sqlalchemy.orm import Session

from ..db import SessionLocal
from ..models import Alarm, Device, NotificationLog, NotifyState, Subscription

logger = logging.getLogger(__name__)

APP_API = os.getenv("APP_API_URL", "https://dolumu-api.vercel.app").rstrip("/")
EXPO_PUSH = "https://exp.host/--/api/v2/push/send"
RATE_LIMIT = timedelta(hours=1)
DEVICE_TTL = timedelta(days=90)

TEXT = {
    "tr": {
        "alarm_title": "{line} {min} dk sonra",
        "alarm_now": "{line} geliyor",
        "alarm_body": "{stop} durağında, {towards} yönü",
        "disruption_title": "{line} hattında aksama",
        "resolved_title": "{line} normale döndü",
        "resolved_body": "Seferler planlandığı gibi yapılıyor.",
        "outage_title": "{station}: {kind} arızalı",
        "outage_body": "Yolculuğunu buna göre planla.",
        "kinds": {"lift": "asansör", "escalator": "yürüyen merdiven", "walkway": "yürüyen bant"},
    },
    "en": {
        "alarm_title": "{line} in {min} min",
        "alarm_now": "{line} arriving",
        "alarm_body": "at {stop}, towards {towards}",
        "disruption_title": "Disruption on {line}",
        "resolved_title": "{line} back to normal",
        "resolved_body": "Trains are running as planned.",
        "outage_title": "{station}: {kind} out of order",
        "outage_body": "Plan your trip accordingly.",
        "kinds": {"lift": "lift", "escalator": "escalator", "walkway": "moving walkway"},
    },
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _app_api(path: str):
    res = requests.get(f"{APP_API}/v1{path}", timeout=30, headers={"X-App-Version": "engine"})
    res.raise_for_status()
    return res.json()


def _text(locale: str) -> dict:
    return TEXT["en" if locale == "en" else "tr"]


def send(db: Session, messages: List[Tuple[Device, str, str, str]]) -> int:
    """messages: (device, title, body, url). Drops devices Expo says are gone."""
    sent = 0
    for i in range(0, len(messages), 100):
        chunk = messages[i : i + 100]
        payload = [
            {"to": d.push_token, "title": title, "body": body, "sound": "default", "data": {"url": url}}
            for d, title, body, url in chunk
        ]
        try:
            res = requests.post(EXPO_PUSH, json=payload, timeout=30, headers={"Accept": "application/json"})
            tickets = res.json().get("data", [])
        except Exception as exc:  # noqa: BLE001 - try again on the next run
            logger.warning("Expo push failed: %s", exc)
            continue
        for (device, *_), ticket in zip(chunk, tickets):
            if ticket.get("status") == "ok":
                sent += 1
            elif (ticket.get("details") or {}).get("error") == "DeviceNotRegistered":
                _forget_device(db, device.id)
    db.commit()
    return sent


def _forget_device(db: Session, device_id: str) -> None:
    db.query(Subscription).filter(Subscription.device_id == device_id).delete()
    db.query(Alarm).filter(Alarm.device_id == device_id).delete()
    db.query(Device).filter(Device.id == device_id).delete()


def _recently_sent(db: Session, device_id: str, kind: str, target: str) -> bool:
    since = _now() - RATE_LIMIT
    return (
        db.query(NotificationLog.id)
        .filter(NotificationLog.device_id == device_id, NotificationLog.kind == kind, NotificationLog.target == target, NotificationLog.sent_at >= since)
        .first()
        is not None
    )


def _subscribers(db: Session, kind: str, target: str) -> List[Device]:
    return (
        db.query(Device)
        .join(Subscription, Subscription.device_id == Device.id)
        .filter(Subscription.kind == kind, Subscription.target == target)
        .all()
    )


# ---------------------------------------------------------------------------------------------
# Alarms (every 30 s)

def check_alarms() -> int:
    db = SessionLocal()
    try:
        now = _now()
        active = db.query(Alarm).filter(Alarm.fired_at.is_(None), Alarm.cancelled == 0).all()
        expired = [a for a in active if a.expires_at <= now]
        for a in expired:
            a.cancelled = 1
        live = [a for a in active if a.expires_at > now]
        if not live:
            db.commit()
            return 0
        by_stop: Dict[str, List[Alarm]] = defaultdict(list)
        for a in live:
            by_stop[a.stop_code].append(a)
        devices = {d.id: d for d in db.query(Device).filter(Device.id.in_({a.device_id for a in live}))}
        messages = []
        for stop_code, alarms in by_stop.items():
            try:
                stop = _app_api(f"/stops/{stop_code}")
            except Exception as exc:  # noqa: BLE001
                logger.warning("alarm: stop %s unavailable: %s", stop_code, exc)
                continue
            rows = {(l["code"], l["dir"]): l for l in stop.get("lines", [])}
            for a in alarms:
                row = rows.get((a.line_code, a.direction))
                minutes = (row or {}).get("arrival", {}) or {}
                minutes = minutes.get("minutes")
                device = devices.get(a.device_id)
                if minutes is None or device is None or minutes > a.threshold_min:
                    continue
                t = _text(device.locale)
                label = a.line_label or a.line_code
                title = t["alarm_now"].format(line=label) if minutes < 1 else t["alarm_title"].format(line=label, min=minutes)
                body = t["alarm_body"].format(stop=a.stop_name or stop.get("name", stop_code), towards=(row or {}).get("towards", ""))
                messages.append((device, title, body, f"dolumu://stop/{stop_code}"))
                a.fired_at = now
        db.commit()
        return send(db, messages) if messages else 0
    finally:
        db.close()


# ---------------------------------------------------------------------------------------------
# Disruptions and outages (every 2 min)

def _state(db: Session, key: str) -> Optional[dict]:
    row = db.get(NotifyState, key)
    return row.value if row else None


def _save_state(db: Session, key: str, value: dict) -> None:
    row = db.get(NotifyState, key)
    if row:
        row.value = value
    else:
        db.add(NotifyState(key=key, value=value))


def check_status() -> int:
    db = SessionLocal()
    try:
        try:
            status = _app_api("/status")
        except Exception as exc:  # noqa: BLE001
            logger.warning("status unavailable: %s", exc)
            return 0
        current = {d["line"]: d["message"] for d in status.get("disruptions", [])}
        previous = _state(db, "disruptions")
        messages: List[Tuple[Device, str, str, str]] = []
        if previous is not None:  # first run only records the baseline
            for line, message in current.items():
                if line not in previous:
                    messages += _for_subscribers(db, "line_disruption", line, lambda t: (t["disruption_title"].format(line=line), message), f"dolumu://line/{line}")
            for line in previous:
                if line not in current:
                    messages += _for_subscribers(
                        db, "line_disruption", line, lambda t: (t["resolved_title"].format(line=line), t["resolved_body"]), f"dolumu://line/{line}"
                    )
        _save_state(db, "disruptions", current)

        # Outages: compare per subscribed station (few stations, read through the app API).
        stations = [s for (s,) in db.query(Subscription.target).filter(Subscription.kind == "station_outage").distinct()]
        seen = _state(db, "outages") or {}
        for station_id in stations:
            try:
                st = _app_api(f"/stations/{station_id}")
            except Exception:  # noqa: BLE001
                continue
            kinds = sorted(o["kind"] for o in st.get("outages", []))
            before = seen.get(station_id)
            if before is not None:
                for kind in set(kinds) - set(before):
                    messages += _for_subscribers(
                        db,
                        "station_outage",
                        station_id,
                        lambda t, kind=kind: (t["outage_title"].format(station=st["name"], kind=t["kinds"].get(kind, kind)), t["outage_body"]),
                        f"dolumu://station/{station_id}",
                    )
            seen[station_id] = kinds
        _save_state(db, "outages", seen)
        db.commit()
        return send(db, messages) if messages else 0
    finally:
        db.close()


def _for_subscribers(db: Session, kind: str, target: str, text, url: str) -> List[Tuple[Device, str, str, str]]:
    out = []
    for device in _subscribers(db, kind, target):
        if _recently_sent(db, device.id, kind, target):
            continue
        title, body = text(_text(device.locale))
        out.append((device, title, body, url))
        db.add(NotificationLog(device_id=device.id, kind=kind, target=target))
    return out


def prune_devices() -> None:
    db = SessionLocal()
    try:
        cutoff = _now() - DEVICE_TTL
        for (device_id,) in db.query(Device.id).filter(Device.last_seen < cutoff).all():
            _forget_device(db, device_id)
        db.query(NotificationLog).filter(NotificationLog.sent_at < _now() - timedelta(days=7)).delete()
        db.query(Alarm).filter(Alarm.expires_at < _now() - timedelta(days=1)).delete()
        db.commit()
    finally:
        db.close()
