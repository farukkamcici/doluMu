# DoluMu - Istanbul Public Transit Crowding Prediction Platform

**ML-powered crowd and occupancy predictions for all Istanbul public transport. Check before you ride.**

🌐 **Available in Turkish and English** | Türkçe ve İngilizce dillerinde kullanılabilir

---

## What is this Platform?

**DoluMu** is a **multilingual, web-based ML prediction tool** that helps you avoid peak hours and plan more comfortable journeys on Istanbul's public transportation network covering Metro, Bus, Metrobus, and rail lines.

**Important:** This platform uses **ML models trained on historical passenger data and weather forecasts** to predict crowding levels. It does **not** rely on real-time sensors or live passenger counting. All information shown represents **forecasted predictions** based on patterns learned from past data, weather conditions, and calendar factors.

---

## Key Features

### 🕐 **Hourly Crowding Forecasts**
- Hour-by-hour crowding for today and tomorrow on metro, Metrobüs, bus, Marmaray and ferry lines
- A "Right now" summary with a quieter-hour suggestion, so you can decide whether to wait

### 🌦️ **Weather-Aware Predictions**
- The model uses the weather forecast (rain, temperature, wind), since weather changes how people travel
- Current Istanbul weather is shown on the home screen

### 🚦 **City Traffic Index**
- Istanbul-wide congestion index from the İBB Traffic Management Center (UYM), refreshed every 5 minutes

### 🗺️ **Network Map**
- The home screen is a map of Istanbul's rail network and Metrobüs in official line colours
- Line width shows forecast riders for the chosen hour; scrub or play through the day
- Tap a line for its page, a station for the lines calling there; "stations near you" uses your location
- Line pages highlight the route: bus routes per direction, rail lines with every station

### 🚇 **Rail Lines**
- Metro, tram, funicular and cable-car lines use their official Metro İstanbul colours and names
- Operating hours from the Metro İstanbul topology; hours outside service are shown as gaps
- `M1` is searchable as its `M1A` / `M1B` branches; both share the same forecast

### 🚌 **Departures & Notices**
- First/last departure, next departures with countdown and the full daily timetable (planned İETT schedules)
- İETT service notices shown on the line page

### 📱 **Mobile-First Web App**
- One responsive design: single column on phones, two columns on large screens
- Installable to the home screen (Add to Home Screen / Install app)
- Light, dark or system theme; shareable line URLs (`/tr/line/500T?dir=D&day=tomorrow`)

### 🌐 **Multi-Language Support**
- Full interface available in Turkish (Türkçe) and English
- Easy language switching from Settings page
- All forecasts, labels, and notifications localized
- Automatic language detection based on browser preferences

---

## How to Read the Crowd Levels

Levels are **relative to each line's own busiest hour of that day**, like "Popular times" on Google Maps:

| Level | Share of the day's busiest hour | Meaning |
|---|---|---|
| 🟢 Quiet | < 40% | One of the quietest times of the day |
| 🟡 Normal | 40–65% | Typical for this line |
| 🟠 Busy | 65–85% | Crowded, seats may be hard to find |
| 🔴 Very busy | ≥ 85% | Among the busiest hours of the day |

The "Right now" card also suggests a noticeably quieter hour within the next three hours when there is one.
Capacity-based occupancy (`occupancy_pct`) is still shown under "How is this forecast made?", together with a note on how reliable the capacity estimate is. It is not used for the colours because the capacity estimates are coarse and saturate at 100% on many lines.

### 🚦 Service Awareness
- Hours that fall outside the published schedule are clearly marked **Out of Service**, so you instantly know when a line is offline instead of staring at an empty chart.
- Direction-aware status checks mean the app can tell you if only one side of a route (e.g., `G` vs `D`) is paused, keeping the forecast, status banner, and schedule widget perfectly aligned.
- Metro/rail out-of-service hours are derived from Metro topology service windows (`first_time`/`last_time`) so 24h charts remain visible while inactive hours render as gaps.

---

## User Scenarios

### 🏢 **Daily Commuters**
*"I work in Levent and live in Kadıköy. Should I leave at 17:30 or wait until 18:30?"*
- Check M2 Metro predictions for both time slots
- Compare crowd levels and choose the more comfortable option

### 🛍️ **Weekend Shoppers**
*"Planning to visit Taksim on Saturday afternoon - when will the metro be less crowded?"*
- View weekend patterns for M2 Vezneciler → Taksim
- Get suggestions for off-peak shopping hours

### 🏥 **Medical Appointments**
*"I have a doctor's appointment in Bakırköy at 14:00 - when should I leave Beylikdüzü?"*
- Check Metrobüs predictions 2-3 hours before departure
- Plan buffer time based on predicted crowding levels

### 🎯 **Event Attendees**
*"There's a match at Vodafone Park tonight - how crowded will the metro be?"*
- Check predictions for lines serving Beşiktaş
- Plan alternative routes if main lines show high crowding

---

## FAQ & Important Information

### **How accurate are these predictions?**
Our ML models achieve good accuracy for typical conditions, but predictions are **estimates, not guarantees**. Accuracy is highest for:
- Regular weekday patterns
- Well-established metro and metrobüs lines
- Normal weather conditions

Predictions may be less accurate during:
- Unusual events (strikes, major celebrations, emergencies)
- Extreme weather conditions not seen in historical data
- New transportation routes with limited historical data

### **What data sources are used?**
- **Passenger Data:** Istanbul Metropolitan Municipality (IBB) open data on hourly ridership
- **Weather Data:** Open-Meteo weather forecasts and historical weather patterns
- **Calendar Data:** Turkish holidays, school terms, and seasonal patterns
- **Transit Topology & Timetables:** Metro Istanbul API (stations, directions, daily timetables) and IETT planned schedules (bus service windows, trips-per-hour)
- **Traffic Index:** İBB Traffic Management Center (IMM/UYM) congestion feed (Istanbul-wide % index)
- **Route Geometry (Map):** IETT stop coordinates and route geometries (processed into static JSON assets for the PWA and optional backend route endpoints)

### **Why don't I see real-time information?**
This platform focuses on **prediction and planning** rather than real-time monitoring. Our goal is to help you plan ahead and avoid crowded conditions before you start your journey.

### **Which transport lines are covered?**
The platform covers major Istanbul public transportation including:
- Metro & rail lines (topology/schedule-aware; M1 is exposed as `M1A`/`M1B` in the UI)
- Marmaray (static schedule integration for consistent service-hour logic)
- Metrobüs (BRT) routes
- Major bus lines with sufficient historical data (with capacity + trips-per-hour support when available)

### **Is my location data tracked?**
The platform can use your location (if you permit it) only to show nearby transport options and provide relevant recommendations. Location data is not stored or tracked for advertising purposes.

### **How do I save my favorite lines?**
You can bookmark frequently used transport lines by clicking the star icon (⭐) when viewing a line's details. Your favorites are stored locally on your device and displayed on the Forecast page for quick access to real-time crowd predictions.

### **Can I get notifications?**
Notification features are planned for future releases to alert you about:
- Unusually high crowding on your saved favorite lines
- Weather-related changes affecting your regular routes
- Recommended departure times for your planned trips

---

## Getting Started

1. **Visit the Platform:** Access through your web browser on any device
2. **Choose Your Language:** Select Turkish or English from Settings (⚙️)
3. **Explore the Map:** Browse Istanbul's transport network and crowding patterns
4. **Select Your Line:** Click on any metro or bus route
5. **Choose Your Time:** Use the time slider to see predictions for different hours
6. **Save Favorites:** Bookmark your regular routes for quick access
7. **Plan Ahead:** Check predictions before starting your journey

---

## For Developers

- **Architecture & backend internals:** [`README_TECHNICAL.md`](README_TECHNICAL.md), [`src/api/README_API.md`](src/api/README_API.md)
- **Frontend:** [`frontend/README.md`](frontend/README.md), product & design: [`frontend/DESIGN.md`](frontend/DESIGN.md)
- **ML pipeline (offline):** [`ML_PIPELINE_README.md`](ML_PIPELINE_README.md)
- **Full documentation index:** [`docs/`](docs/README.md) — subsystem docs (metro, capacity), PRD, technical reference & Q&A.

### Stack at a glance

- **Backend:** FastAPI + LightGBM + Polars, served by Uvicorn in Docker. APScheduler runs the daily forecast and schedule-cache cron jobs in-process. Public forecast endpoints read precomputed predictions from Postgres.
- **Database:** Postgres 15 (Docker volume).
- **Frontend:** Next.js PWA on Vercel (unaffected by backend deploys).
- **Production:** self-hosted on Hetzner behind Caddy (automatic TLS).

---

*This platform is designed to make Istanbul's public transportation more comfortable and predictable for everyone. While we strive for accuracy, please use these predictions as guidance alongside your own experience and local conditions.*
