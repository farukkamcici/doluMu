"""Anonymous device registration, subscriptions and bus alarms for the DoluMu app (no accounts)."""
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Alarm, Device, Subscription

router = APIRouter(prefix="/v1", tags=["devices"])

ALARM_TTL = timedelta(minutes=60)


class DeviceIn(BaseModel):
    token: str = Field(..., min_length=10, max_length=200)
    platform: Literal["ios", "android"] = "ios"
    locale: Literal["tr", "en"] = "tr"


class SubscriptionIn(BaseModel):
    kind: Literal["line_disruption", "station_outage"]
    target: str = Field(..., min_length=1, max_length=40)


class SubscriptionsIn(BaseModel):
    subscriptions: List[SubscriptionIn] = Field(default_factory=list, max_length=100)


class AlarmIn(BaseModel):
    deviceId: str = Field(..., max_length=40)
    stop: str = Field(..., max_length=20)
    line: str = Field(..., max_length=20)
    dir: Literal["G", "D"]
    threshold: int = Field(5, ge=1, le=30)
    stopName: str = Field("", max_length=120)
    lineLabel: str = Field("", max_length=40)


def _device(db: Session, device_id: str) -> Device:
    device = db.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="device_not_found")
    device.last_seen = datetime.now(timezone.utc)
    return device


@router.post("/devices")
def register(body: DeviceIn, db: Session = Depends(get_db)):
    device = db.query(Device).filter(Device.push_token == body.token).one_or_none()
    if device:
        device.platform, device.locale, device.last_seen = body.platform, body.locale, datetime.now(timezone.utc)
    else:
        device = Device(id=str(uuid.uuid4()), push_token=body.token, platform=body.platform, locale=body.locale)
        db.add(device)
    db.commit()
    return {"id": device.id}


@router.get("/devices/{device_id}")
def get_device(device_id: str = Path(..., max_length=40), db: Session = Depends(get_db)):
    _device(db, device_id)
    now = datetime.now(timezone.utc)
    subs = db.query(Subscription).filter(Subscription.device_id == device_id).all()
    alarms = (
        db.query(Alarm)
        .filter(Alarm.device_id == device_id, Alarm.fired_at.is_(None), Alarm.cancelled == 0, Alarm.expires_at > now)
        .all()
    )
    db.commit()
    return {
        "subscriptions": [{"kind": s.kind, "target": s.target} for s in subs],
        "alarms": [
            {"id": a.id, "stop": a.stop_code, "line": a.line_code, "dir": a.direction, "threshold": a.threshold_min,
             "stopName": a.stop_name, "lineLabel": a.line_label, "expiresAt": a.expires_at.isoformat()}
            for a in alarms
        ],
    }


@router.put("/devices/{device_id}/subscriptions")
def set_subscriptions(body: SubscriptionsIn, device_id: str = Path(..., max_length=40), db: Session = Depends(get_db)):
    _device(db, device_id)
    db.query(Subscription).filter(Subscription.device_id == device_id).delete()
    for s in {(s.kind, s.target) for s in body.subscriptions}:
        db.add(Subscription(device_id=device_id, kind=s[0], target=s[1]))
    db.commit()
    return {"ok": True, "count": len(body.subscriptions)}


@router.post("/alarms")
def create_alarm(body: AlarmIn, db: Session = Depends(get_db)):
    _device(db, body.deviceId)
    # One alarm per device, stop and line: setting it again replaces the old one.
    db.query(Alarm).filter(
        Alarm.device_id == body.deviceId, Alarm.stop_code == body.stop, Alarm.line_code == body.line, Alarm.fired_at.is_(None)
    ).update({Alarm.cancelled: 1})
    alarm = Alarm(
        id=str(uuid.uuid4()),
        device_id=body.deviceId,
        stop_code=body.stop,
        line_code=body.line,
        direction=body.dir,
        threshold_min=body.threshold,
        stop_name=body.stopName,
        line_label=body.lineLabel,
        expires_at=datetime.now(timezone.utc) + ALARM_TTL,
    )
    db.add(alarm)
    db.commit()
    return {"id": alarm.id, "expiresAt": alarm.expires_at.isoformat()}


@router.delete("/alarms/{alarm_id}")
def cancel_alarm(alarm_id: str = Path(..., max_length=40), db: Session = Depends(get_db)):
    alarm = db.get(Alarm, alarm_id)
    if alarm:
        alarm.cancelled = 1
        db.commit()
    return {"ok": True}
