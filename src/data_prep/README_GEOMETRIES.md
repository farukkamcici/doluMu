# IETT Bus Stop Geometry Data Ingestion

## Overview
This script fetches bus stop coordinates from the IETT Web Service API and saves them as a structured JSON file for frontend map visualization.

## Script: `fetch_geometries.py`

### Purpose
- Fetch all IETT bus stop locations from the official Istanbul Municipality API
- Parse coordinate data from various formats (WKT POINT, comma-separated, space-separated)
- Validate coordinates are within Istanbul boundaries
- Export structured JSON for frontend consumption

### API Details
- **Service**: IETT Ulaşım Ana Veri - Hat-Durak-Güzergâh Web Servisi
- **Base URL**: `https://api.ibb.gov.tr/iett/UlasimAnaVeri/HatDurakGuzergah.asmx`
- **Method**: `GetDurak_json` (SOAP Web Service)
- **Protocol**: SOAP 1.1 with XML envelope
- **Documentation**: `docs/ibb_api_doc.pdf` (Section 4.1)

### Output
**File**: `frontend/public/data/stops_geometry.json`

**Structure**:
```json
{
  "updated_at": "YYYY-MM-DD HH:MM:SS",
  "total_stops": 15100,
  "stops": {
    "DURAK_CODE": {
      "name": "Stop Name",
      "lat": 41.xxxx,
      "lng": 29.xxxx,
      "district": "District Name"
    }
  }
}
```

### Coordinate Parsing
The script handles multiple coordinate formats from the API:

1. **WKT Format** (Primary): `POINT(29.0123 41.0456)`
2. **Comma-separated**: `29.0123,41.0456`
3. **Space-separated**: `29.0123 41.0456`

**Important**: 
- IETT API returns coordinates as `(longitude, latitude)`
- Script converts to `[latitude, longitude]` for Leaflet/map library compatibility
- Validates coordinates are within Istanbul bounds (28.0-30.0 lng, 40.5-41.5 lat)

### Usage

#### Basic Usage
```bash
python src/data_prep/fetch_geometries.py
```

#### From Project Root
```bash
cd /path/to/ibb-transport
python src/data_prep/fetch_geometries.py
```

### Expected Output
```
============================================================
IETT Bus Stop Geometry Ingestion Script
============================================================
INFO - Fetching all bus stops from IETT API...
INFO - Received 15102 stops from API
INFO - Processed 15100 stops successfully
WARNING - Skipped 2 stops due to missing/invalid data
INFO - Saved geometry data to frontend/public/data/stops_geometry.json
INFO - File size: 2209.74 KB
============================================================
✅ Geometry data ingestion completed successfully
✅ Total stops saved: 15100
============================================================
```

### Error Handling

The script handles:
- **SOAP API failures**: Connection errors, timeouts
- **Invalid coordinates**: Out of bounds, malformed strings
- **Missing data**: Stops without coordinates or codes
- **Type inconsistencies**: Handles both string and integer field types

### Data Quality

- **Total Stops**: ~15,100 bus stops across Istanbul
- **Success Rate**: >99% (only stops with valid coordinates)
- **File Size**: ~2.2 MB (minified JSON)
- **Coordinate Precision**: 6-8 decimal places (~0.11m accuracy)

### Dependencies
```python
requests      # HTTP client for SOAP API
json          # JSON parsing
re            # Coordinate pattern matching
xml.etree     # SOAP XML parsing (stdlib)
logging       # Progress logging (stdlib)
```

### API Fields Used
From `GetDurak_json` response:

| Field | Type | Description | Usage |
|-------|------|-------------|-------|
| `SDURAKKODU` | String | Stop code (unique ID) | Primary key |
| `SDURAKADI` | String | Stop name | Display name |
| `KOORDINAT` | String | WKT coordinate | Lat/lng parsing |
| `ILCEADI` | String | District name | Metadata |

### Frontend Integration

The generated JSON can be consumed by the frontend for:
1. **Stop Markers**: Display all bus stops on map
2. **Route Visualization**: Connect stops to approximate line routes
3. **Search**: Find stops by name or district
4. **Proximity**: Show nearby stops based on user location

### Maintenance

#### Update Frequency
- Run when new bus stops are added to the system
- Recommended: Weekly or monthly updates
- API data is relatively stable

#### Troubleshooting

**API Returns 500 Error**:
- Check SOAP envelope format
- Verify API endpoint is accessible
- Test with a single stop code first

**No Coordinates Parsed**:
- Check `KOORDINAT` field format in API response
- Update regex patterns in `parse_coordinate()` if needed

**File Not Created**:
- Ensure `frontend/public/data/` directory exists
- Check write permissions

### Future Enhancements

1. **Line-Stop Mapping**: Fetch line-to-stops relationships from `DurakDetay_GYY` endpoint
2. **Incremental Updates**: Only fetch stops modified since last run
3. **GeoJSON Export**: Alternative output format for mapping libraries
4. **Caching**: Cache API responses to reduce load

### Related Files
- **API Documentation**: `docs/ibb_api_doc.pdf`
- **Transport Metadata**: `data/processed/transport_meta.parquet`
- **Frontend Map Component**: `frontend/src/components/map/`

### Author
Istanbul Transport Crowding Prediction Platform
Data Engineering Team

### License
Internal Use - Istanbul Municipality Data