from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from ..services.capacity_store import CapacityStore
from ..state import get_capacity_store
from ..constants import METROBUS_CODE, METROBUS_CAPACITY

router = APIRouter(tags=["capacity"])


class CapacityMetaResponse(BaseModel):
    line_code: str = Field(..., description="Transport line code")
    expected_capacity_weighted_int: int = Field(..., gt=0, description="Expected per-vehicle capacity")
    capacity_min: int | None = Field(None, gt=0, description="Lower bound per-vehicle capacity")
    capacity_max: int | None = Field(None, gt=0, description="Upper bound per-vehicle capacity")
    confidence: str = Field(..., description="Capacity confidence label")
    likely_models_topk_json: str | None = Field(None, description="Top-K likely models JSON")
    notes: str | None = Field(None, description="Extra notes")


class CapacityMixRow(BaseModel):
    representative_brand_model: str | None = None
    model_capacity_int: int | None = Field(None, gt=0)
    share_by_vehicles: float | None = None
    occupancy_delta_pct_vs_expected: float | None = None
    n_days_present: int | None = None


@router.get("/capacity/{line_code}", response_model=CapacityMetaResponse)
def get_capacity_meta(
    line_code: str,
    store: CapacityStore = Depends(get_capacity_store),
):
    if line_code == METROBUS_CODE:
        return CapacityMetaResponse(
            line_code=METROBUS_CODE,
            expected_capacity_weighted_int=METROBUS_CAPACITY,
            capacity_min=METROBUS_CAPACITY,
            capacity_max=METROBUS_CAPACITY,
            confidence="FIXED",
            likely_models_topk_json=None,
            notes="Virtual line: pooled metrobus variants with fixed per-vehicle capacity.",
        )
    meta = store.get_capacity_meta(line_code)
    return CapacityMetaResponse(**meta.__dict__)


@router.get("/capacity/{line_code}/mix", response_model=List[CapacityMixRow])
def get_capacity_mix(
    line_code: str,
    top_k: int = Query(10, ge=1, le=50),
    store: CapacityStore = Depends(get_capacity_store),
):
    if line_code == METROBUS_CODE:
        return []
    rows: List[Dict[str, Any]] = store.get_capacity_mix(line_code, top_k=top_k)
    return [CapacityMixRow(**row) for row in rows]
