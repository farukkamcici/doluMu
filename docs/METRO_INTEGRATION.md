# Metro Istanbul Integration Documentation

## 🏗️ Architecture Overview

This integration follows a **Hybrid Static/Dynamic Architecture** to maximize performance and minimize API latency.

### Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│  ┌──────────────────────┐      ┌──────────────────────────┐    │
│  │  Static Data Layer   │      │  Dynamic Data Layer      │    │
│  │                      │      │                          │    │
│  │  metro_topology.json │◄─────┤  API Calls (Real-time)   │    │
│  │  - Coordinates       │      │  - Train schedules       │    │
│  │  - Station IDs       │      │  - Network status        │    │
│  │  - Direction IDs     │      │  - Travel durations      │    │
│  │  - Accessibility     │      │                          │    │
│  └──────────────────────┘      └──────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
         ▲                                    ▲
         │                                    │
         │ Build Time                         │ Runtime
         │ (Once)                             │ (Continuous)
         │                                    │
┌────────┴──────────┐                ┌───────┴─────────────────────┐
│  INGESTION SCRIPT │                │    BACKEND API              │
│                   │                │                             │
│  fetch_metro_     │                │  /api/metro/schedule        │
│  topology.py      │                │  /api/metro/status          │
│                   │                │  /api/metro/duration        │
│  Calls:           │                │                             │
│  - GetLines       │                │  Cache Strategy:            │
│  - GetStations    │                │  - Schedule: 60s TTL        │
│  - GetDirections  │                │  - Status: 5min TTL         │
│                   │                │  - Duration: 24h TTL        │
└───────────────────┘                └─────────────────────────────┘
         │                                    │
         │                                    │
         └────────────────┬───────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Metro Istanbul API   │
              │  api.ibb.gov.tr       │
              └───────────────────────┘
```

---

## 📁 File Structure

```
ibb-transport/
├── src/
│   ├── api/
│   │   ├── models/
│   │   │   └── metro_models.py          # Pydantic models for Metro API
│   │   └── routers/
│   │       └── metro.py                  # Backend API endpoints
│   └── data_prep/
│       └── fetch_metro_topology.py       # Static topology ingestion
│
├── frontend/
│   └── public/
│       └── data/
│           └── metro_topology.json       # Generated static data
│
└── docs/
    └── METRO_INTEGRATION.md              # This file
```

---

## 🚀 Quick Start

### 1. Generate Static Topology Data

Run the ingestion script **once** to fetch metro topology:

```bash
cd /path/to/ibb-transport
python src/data_prep/fetch_metro_topology.py
```

**Output:**
- `frontend/public/data/metro_topology.json`
- Contains all lines, stations, coordinates, directions

**When to re-run:**
- New metro lines are added
- Station accessibility features change
- Weekly/monthly maintenance sync

### 2. Start Backend API

The Metro router is automatically loaded in `main.py`:

```bash
uvicorn src.api.main:app --reload --port 8000
```

**Available endpoints:**
- `POST /api/metro/schedule` - Live train arrivals
- `GET /api/metro/status` - Network status + alerts
- `POST /api/metro/duration` - Travel times
- `POST /api/metro/admin/clear-cache` - Cache management
- `GET /api/metro/admin/cache-stats` - Cache monitoring

### 3. Frontend Integration

Load static topology on app init:

```javascript
// Load metro topology
const response = await fetch('/data/metro_topology.json');
const topology = await response.json();

// Render stations on map
topology.lines['M1A'].stations.forEach(station => {
  renderMarker({
    lat: station.coordinates.lat,
    lng: station.coordinates.lng,
    name: station.name,
    stationId: station.id,
    directions: station.directions
  });
});
```

Fetch real-time data:

```javascript
// Get train schedule
const schedule = await fetch('/api/metro/schedule', {
  method: 'POST',
  body: JSON.stringify({
    BoardingStationId: 121,  // From topology
    DirectionId: 66,          // From topology
    DateTime: new Date().toISOString()
  })
});

// Get network status
const status = await fetch('/api/metro/status');
```

---

## 📊 Data Models

### Static Data (metro_topology.json)

```json
{
  "lines": {
    "M1A": {
      "id": 9,
      "name": "M1A",
      "description": "Yenikapı - Atatürk Havalimanı",
      "color": "#e31e24",
      "stations": [
        {
          "id": 121,
          "name": "YENIKAPI",
          "description": "Yenikapı",
          "order": 1,
          "coordinates": {
            "lat": 41.004755,
            "lng": 28.952549
          },
          "accessibility": {
            "elevator": true,
            "escalator": false,
            "wc": false,
            "babyRoom": false,
            "masjid": false
          },
          "directions": [
            {"id": 66, "name": "Havalimanı İstikameti"},
            {"id": 67, "name": "Yenikapı İstikameti"}
          ]
        }
      ]
    }
  },
  "metadata": {
    "generated_at": "2025-12-08T10:30:00Z",
    "total_lines": 10,
    "total_stations": 250
  }
}
```

### API Request Examples

#### 1. Get Train Schedule

```bash
POST /api/metro/schedule
Content-Type: application/json

{
  "BoardingStationId": 121,
  "DirectionId": 66,
  "DateTime": "2025-12-08T14:30:00+03:00"
}
```

**Response:**
```json
{
  "Success": true,
  "Error": null,
  "Data": [
    {
      "TrainId": "T-1234",
      "DestinationStationName": "ATATÜRK HAVALIMANI",
      "RemainingMinutes": 3,
      "ArrivalTime": "14:33",
      "IsCrowded": false
    },
    {
      "TrainId": "T-1235",
      "DestinationStationName": "ATATÜRK HAVALIMANI",
      "RemainingMinutes": 8,
      "ArrivalTime": "14:38",
      "IsCrowded": true
    }
  ]
}
```

#### 2. Get Network Status

```bash
GET /api/metro/status
```

**Response:**
```json
{
  "lines": {
    "M1A": {
      "line_code": "M1A",
      "line_name": "Yenikapı - Atatürk Havalimanı",
      "status": "ACTIVE",
      "alerts": [
        {
          "Id": 123,
          "LineCode": "M1A",
          "Title": "Bakım Çalışması",
          "Message": "Saat 23:00 - 01:00 arası hizmet verilmeyecektir",
          "PublishDate": "2025-12-08T10:00:00Z",
          "Language": "TR",
          "Priority": "HIGH"
        }
      ],
      "last_updated": "2025-12-08T14:30:00Z"
    }
  },
  "fetched_at": "2025-12-08T14:30:00Z"
}
```

#### 3. Get Travel Duration

```bash
POST /api/metro/duration
Content-Type: application/json

{
  "BoardingStationId": 121,
  "DirectionId": 66,
  "DateTime": "2025-12-08T14:30:00+03:00"
}
```

**Response:**
```json
{
  "Success": true,
  "Error": null,
  "Data": [
    {
      "FromStationId": 121,
      "ToStationId": 120,
      "FromStationName": "YENIKAPI",
      "ToStationName": "AKSARAY",
      "DurationMinutes": 3
    },
    {
      "FromStationId": 121,
      "ToStationId": 119,
      "FromStationName": "YENIKAPI",
      "ToStationName": "EMNIYET",
      "DurationMinutes": 6
    }
  ]
}
```

---

## 🔧 Technical Details

### Caching Strategy

| Endpoint | TTL | Reason | Cache Key |
|----------|-----|--------|-----------|
| `/schedule` | 60s | Real-time train data | `schedule:{StationId}:{DirectionId}` |
| `/status` | 5min | Status changes infrequently | `network_status` |
| `/duration` | 24h | Infrastructure rarely changes | `duration:{StationId}:{DirectionId}` |

### Error Handling

All endpoints follow consistent error patterns:

```json
{
  "detail": "Error message",
  "status_code": 404 | 500 | 504
}
```

**Error Codes:**
- `404`: Station/direction not found, no data available
- `500`: Metro API error, internal server error
- `504`: Metro API timeout (10s threshold)

### Performance Optimization

1. **Parallel Fetching**: Network status endpoint calls multiple APIs in parallel
2. **Connection Pooling**: Reuses HTTP session for all Metro API calls
3. **Minimal Payload**: Only returns essential fields to frontend
4. **TTL-based Cache**: Automatic expiration, no manual invalidation needed

---

## 🛠️ Development Guide

### Adding New Endpoints

1. **Define Pydantic model** in `src/api/models/metro_models.py`
2. **Create router function** in `src/api/routers/metro.py`
3. **Add cache strategy** (choose appropriate TTL)
4. **Update this documentation**

### Testing Metro Endpoints

```bash
# Schedule
curl -X POST http://localhost:8000/api/metro/schedule \
  -H "Content-Type: application/json" \
  -d '{"BoardingStationId": 121, "DirectionId": 66, "DateTime": "2025-12-08T14:30:00+03:00"}'

# Status
curl http://localhost:8000/api/metro/status

# Cache stats
curl http://localhost:8000/api/metro/admin/cache-stats

# Clear cache
curl -X POST http://localhost:8000/api/metro/admin/clear-cache
```

### Regenerating Topology

```bash
# Full regeneration
python src/data_prep/fetch_metro_topology.py

# Check output
cat frontend/public/data/metro_topology.json | jq '.metadata'
```

---

## 📝 API Endpoint Reference

### Metro Istanbul Upstream APIs

| Endpoint | Method | Purpose | Used By |
|----------|--------|---------|---------|
| `/GetLines` | GET | Fetch all metro lines | Ingestion Script |
| `/GetStationById/{LineId}` | GET | Fetch stations for a line | Ingestion Script |
| `/GetDirectionsByLineIdAndStationId` | POST | Fetch valid directions | Ingestion Script |
| `/GetTimeTable` | POST | Live train arrivals | Backend API |
| `/GetStationBetweenTime` | POST | Travel durations | Backend API |
| `/GetServiceStatuses` | GET | Line operational status | Backend API |
| `/GetAnnouncementsByLine` | POST | Service alerts | Backend API |

---

## 🚨 Troubleshooting

### Topology Generation Fails

**Symptoms:** Script crashes or returns empty data

**Solutions:**
1. Check Metro API availability: `curl https://api.ibb.gov.tr/MetroIstanbul/api/MetroMobile/V2/GetLines`
2. Check network/firewall settings
3. Review script logs for specific API errors
4. Retry with exponential backoff (API may be rate-limited)

### Backend Returns Cached Old Data

**Symptoms:** Train schedule shows outdated times

**Solutions:**
1. Check cache TTL: `GET /api/metro/admin/cache-stats`
2. Manually clear cache: `POST /api/metro/admin/clear-cache?cache_type=schedule`
3. Restart backend to reset all caches

### Frontend Can't Load Topology

**Symptoms:** Map doesn't show metro stations

**Solutions:**
1. Verify file exists: `ls frontend/public/data/metro_topology.json`
2. Check JSON syntax: `cat frontend/public/data/metro_topology.json | jq`
3. Regenerate topology: `python src/data_prep/fetch_metro_topology.py`
4. Check frontend dev server is serving static files from `/public`

---

## 📈 Future Enhancements

### Planned Features

- [ ] **Real-time Vehicle Tracking**: Add GPS position endpoints when available
- [ ] **Crowding Predictions**: Integrate ML model for metro crowding (similar to bus)
- [ ] **Historical Data**: Store schedule adherence for analytics
- [ ] **Multi-language Support**: English/Arabic announcements
- [ ] **Accessibility Routing**: Elevator-only routes for disabled passengers

### API Wishlist (Upstream)

- Real-time train GPS positions
- Per-car crowding data
- Platform-level waiting times
- Transfer time between lines

---

## 📞 Support

**Issues:** GitHub Issues  
**API Documentation:** https://api.ibb.gov.tr/MetroIstanbul  
**Maintainer:** Backend Team  

---

*Last Updated: 2025-12-08*
