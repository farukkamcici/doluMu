from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import case, or_
from typing import List
from ..db import get_db
from ..models import TransportLine
from pydantic import BaseModel

router = APIRouter()

class TransportLineResponse(BaseModel):
    line_name: str
    transport_type_id: int
    road_type: str
    line: str

    class Config:
        from_attributes = True

class SearchResult(BaseModel):
    line_name: str
    transport_type_id: int
    road_type: str
    line: str
    relevance_score: int

    class Config:
        from_attributes = True

@router.get("/lines/search", response_model=List[SearchResult])
def search_lines(query: str, db: Session = Depends(get_db)):
    """
    Searches for transport lines with rich metadata, prioritizing matches:
    1. Exact line_name match (score: 1)
    2. Starts with query in line_name (score: 2)
    3. Contains query in line_name (score: 3)
    4. Matches in route description (score: 4)
    """
    if not query:
        return []
        
    search_query = f"%{query}%"
    
    # Define a CASE statement to rank results with relevance scoring
    ordering_logic = case(
        (TransportLine.line_name == query.upper(), 1),
        (TransportLine.line_name.ilike(f"{query}%"), 2),
        (TransportLine.line_name.ilike(search_query), 3),
        else_=4
    )

    # Search in both line_name and line (route description)
    lines = db.query(TransportLine, ordering_logic.label('relevance_score')).filter(
        (TransportLine.line_name.ilike(search_query)) | 
        (TransportLine.line.ilike(search_query))
    ).order_by(
        ordering_logic,
        TransportLine.line_name
    ).limit(15).all()
    
    return [
        SearchResult(
            line_name=line.TransportLine.line_name,
            transport_type_id=line.TransportLine.transport_type_id,
            road_type=line.TransportLine.road_type,
            line=line.TransportLine.line,
            relevance_score=line.relevance_score
        )
        for line in lines
    ]

@router.get("/lines/{line_name}", response_model=TransportLineResponse)
def get_line_metadata(line_name: str, db: Session = Depends(get_db)):
    """
    Retrieves metadata for a specific transport line.
    """
    line = db.query(TransportLine).filter(
        TransportLine.line_name == line_name
    ).first()
    
    if not line:
        raise HTTPException(
            status_code=404,
            detail=f"Transport line '{line_name}' not found."
        )
    
    return line
