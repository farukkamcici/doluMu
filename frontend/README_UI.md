# DoluMu - Istanbul Public Transit Crowding Prediction Platform

**DoluMu** is an AI-powered web app that predicts crowding levels on Istanbul public transit **up to 24 hours ahead**. Before you leave, you can check how crowded your bus, metro, or ferry is likely to be and plan a more comfortable trip.

---

## 🎯 What Does It Offer?

### 1. **24-Hour Crowding Forecasts (Model)**
- **Forecast up to 24 hours ahead**: See predicted crowding for any line for every hour of today and tomorrow
- **Easy-to-read crowd levels**: Clear, color-coded levels ("Low", "Medium", "High", "Very High")
- **Occupancy percentage**: View estimated occupancy (%) and passenger volume for each hour
- **Smart predictions**: A machine learning model combining historical ridership, weather, and calendar features
- **Important**: These values are **not real-time sensor measurements** — they are **forecasts** learned from past patterns.

### 2. **Interactive Map Experience**
- **Line visualization**:
  - Bus routes rendered on the map with start/end stops and route polylines
- **Location-based features**:
  - See your current location on the map
  - Find nearby lines more easily
- **Map UX enhancements**:
  - Smooth zoom and pan
  - Metro station amenity badges (elevator, escalator, WC)
  - Distinct line and stop styling for fast recognition

### 3. **Schedules & Trip Planning**
- **Live timetable info**:
  - Metro Istanbul API integration for live schedule data
  - Next 5 departures with minute-level countdowns
  - “On platform” / “in X minutes” style status messages
- **Full-day timetable**:
  - First/last departures
  - Direction-aware schedules (outbound/inbound)
  - Clear messaging for out-of-service hours
- **Service-hour awareness**: Automatic warnings when a line is outside service hours

### 4. **Favorites**
- **Quick access**: Save frequently used lines
- **Favorite line cards**:
  - Show current-hour crowding summary
  - One-tap access to details
- **Persistent storage**: Favorites are stored locally in your browser

### 5. **Multi-language Support**
- **Turkish + English**: Full localization support
- **Smart language detection**: Uses browser language by default
- **Easy switching**: Change language from the Settings page

### 6. **Progressive Web App (PWA)**
- **Add to Home Screen**: Use like a native app
- **Offline support**: Core UI keeps working without network
- **Fast loading**: Service worker caching for smoother performance
- **Cross-platform**: iOS, Android, and desktop support

### 7. **Capacity & Service Frequency (Trips/Hour)**
- View line-specific `max_capacity`, `vehicle_capacity`, and (when available) `trips_per_hour`.
- For bus lines, review capacity assumptions and a vehicle-mix summary in the Capacity modal.
- For rail, a static capacity table and a Marmaray static schedule integration help keep capacity/service-hour logic stable.

---

## 🚀 How It Works

### Home Screen: Map + Search

**What you see on the start screen:**
- **Top bar**:
  - Smart search (search by line code or description)
  - **Traffic widget**: Istanbul-wide traffic congestion index (0–100%)
  - **Weather widget**: current temperature + 6-hour forecast
  - Language switcher
- **Map view**:
  - Istanbul map with public transit layers
  - Metro lines rendered with official colors and stations
  - Bus route visualization after selecting a line
- **Bottom navigation**:
  - Quick switch between Map, Favorites, and Settings

**Search experience:**
1. Type a line code in the search bar (e.g., "M2", "500T", "15F")
2. Results filter instantly
3. Each result shows:
   - Line code (highlighted)
   - Transport type label (Bus/Metro)
   - Route description (matched terms highlighted)
4. Tap a result to update the map and open the line panel

### Line Detail Panel: Your Information Hub

**A smart panel that opens when you select a line:**

#### Mobile:
- **Bottom sheet**:
  - Swipe up to expand
  - Swipe down to minimize
  - Close button at the top-right

#### Desktop:
- **Draggable modal**:
  - Drag anywhere on the screen
  - Resize from the corner
  - “Reset position” button to return to default
- **Minimize / maximize**: work in a compact title-bar mode

#### Panel Contents

**1. Header**
- Line code and name
- Current-hour occupancy badge
- Add/remove favorite button
- Direction selector (Bus) or station selector (Metro)

**2. Crowding Card (Main Summary)**
- **Selected hour label**: “Estimated crowding — 14:00”
- **Crowd level**: Large, color-coded label (e.g., “Medium”)
- **Occupancy bar**: Percentage-based progress bar
- **Details**:
  - Estimated passenger volume (e.g., “1,234 people”)
  - Max capacity (explained via tooltip)
- **Time slider**: Select an hour (0–23)
  - Defaults to current hour
  - Updates data instantly while sliding

**3. Schedule Card**
- **Next 3–5 departures**: live countdown
- **“View full timetable”** button
- **Modal view**:
  - Full-day schedule
  - First/last departure times
  - Station + direction options for Metro

**4. 24-Hour Chart**
- **Interactive chart** (Recharts):
  - Estimated passenger volume per hour
  - Color/gradient styling based on crowd levels
  - Hover for details
- **Service hours visualization**:
  - Gray bars show out-of-service hours
  - Tooltip shows “No service”

**5. Status Banners (when active)**
- **Warning banner**: disruptions and announcements
- **Out-of-service banner**: if the line is not running right now
- Clickable for details (opens a modal)

### Favorites Page

**Manage saved lines in one place:**
- **Favorite line cards**:
  - Mini summary for the current hour
  - Passenger volume and occupancy percentage
  - Line metadata (code, name, type)
  - Tap to open the full detail panel
- **Empty state**:
  - If no favorites are saved, shows a guide card
  - “Go to lines” button navigates back to the map
  - Step-by-step instructions for adding favorites

### Settings Page

**Customize your app:**
- **Language**: Turkish ↔ English
- **PWA install**: add-to-home-screen instructions
  - iOS Safari/Chrome-specific steps
  - Animated, step-by-step visuals
- **Data management**:
  - Clear favorites (with confirmation)
  - Reset app (clears cache)
- **Feedback form**:
  - Bug reports
  - Data issue reports
  - Feature requests
  - Optional email follow-up

---

## 🎨 Design & User Experience

### Visual Identity
- **Dark theme**: modern slate-gray palette
- **Neon accents**: purple/amber gradients and bright highlights
- **Glassmorphism**: translucent surfaces with backdrop blur
- **Rounded UI**: friendly 2xl border radius style

### Color System
- **Crowding colors**:
  - 🟢 Green: Low
  - 🟡 Yellow: Medium
  - 🟠 Orange: High
  - 🔴 Red: Very High
  - ⚫ Gray: Out of service / Unknown
- **Transport types**:
  - Metro: blue tones
  - Bus: green/amber tones

### Motion & Interaction
- **Framer Motion**:
  - Panel open/close animations
  - Page transitions
  - Drag interactions
- **Haptic feedback**: optional vibration on mobile devices
- **Skeleton loaders**: placeholders during fetch
- **Smooth scrolling**: custom scrollbar styling in lists

### Accessibility
- **Semantic HTML**: proper heading hierarchy
- **ARIA labels**: screen reader support
- **Keyboard navigation**: tab-through navigation
- **High contrast**: WCAG-aware color contrast
- **Loading states**: `aria-busy` and `sr-only` patterns

### Responsive Design
- **Mobile-first**: touch-optimized layouts
- **Tablet support**: mid-size layouts
- **Desktop**: multi-panel / wide layout behavior
- **Dynamic viewport**: 100dvh for full-screen experience

---

## 🏗️ Technical Overview

> This section is a short technical summary for developers. If you only want to use the app, you can skip it.  
> Developer docs: `frontend/README_TECHNICAL_UI.md` and `src/api/README_API.md`

### Framework & Libraries
- **Next.js 16** (App Router): modern React framework
- **React 19**: current React version
- **next-intl 4.5.5**: internationalization
- **Zustand**: lightweight state management
- **Tailwind CSS**: utility-first styling
- **Framer Motion**: animations
- **React Leaflet**: interactive maps
- **Recharts**: charts and data visualization
- **Axios**: HTTP client
- **date-fns**: date utilities

### State Management (Zustand Store)
```javascript
{
  selectedLine: null,          // Selected line object
  isPanelOpen: false,          // Is the detail panel open?
  isPanelMinimized: false,     // Is the panel minimized?
  selectedHour: 14,            // Selected hour (0-23)
  userLocation: [41.0, 28.9],  // GPS coordinates
  favorites: ['M2', '500T'],   // Favorite line codes
  selectedDirection: 'G',      // 'G' (outbound) or 'D' (inbound)
  showRoute: true,             // Show route polyline on map
  metroSelection: {            // Metro selection state
    lineCode: 'M2',
    stationId: 123,
    directionId: 1
  }
}
```

### API Integration
- **Backend**: FastAPI (Python)
- **Base URL**: `NEXT_PUBLIC_API_URL` (default if unset: `https://ibb-transport.onthewifi.com/api`)
- **Endpoints**:
  - `GET /lines/search?query={query}`: line search
  - `GET /forecast/{lineCode}?target_date={date}&direction={dir}`: 24-hour forecast (note: `direction` filters service-hours/alerts; the forecast series is not split by direction)
  - `GET /lines/{lineCode}`: line metadata
  - `GET /lines/{lineCode}/status`: service status and alerts
- **Metro API**: Metro Istanbul live timetable API
- **Weather**: Open-Meteo integration

### Data Shapes

**Forecast response (24 hours):**
```json
[
  {
    "hour": 14,
    "predicted_value": 1234,
    "occupancy_pct": 67,
    "crowd_level": "High",
    "max_capacity": 1850,
    "in_service": true
  }
]
```

**Line metadata:**
```json
{
  "line_name": "M2",
  "transport_type_id": 2,
  "road_type": "metro",
  "line": "Yenikapı - Hacıosman Metro Line"
}
```

### Performance Optimizations
- **Debounced search**: 300ms delay to reduce API calls
- **Lazy loading**: pages/components load on demand
- **Image optimization**: Next.js Image component
- **Code splitting**: automatic route-based splitting
- **Service worker**: PWA caching strategies
- **localStorage**: favorites stored locally

### Data Management
- **Static data**:
  - `public/data/line_routes.json`: bus line stop sequences
  - `public/data/metro_topology.json`: metro topology
  - `public/data/stops_geometry.json`: stop coordinates
- **Cache strategy**:
  - Metro schedule: short-lived cache for responsive UX
  - Route data: cached at first load, refreshed on reload
  - Forecast: re-fetched periodically while the app is open

### Custom Hooks
- `useDebounce`: input debouncing
- `useGetTransportLabel`: transport label translations via i18n
- `useMediaQuery`: responsive breakpoints
- `useMetroSchedule`: metro schedule state
- `useMetroTopology`: parse metro topology
- `usePwaInstall`: PWA install event handling
- `useRoutePolyline`: route polyline builder

---

## 📱 Example User Flows

### Scenario 1: Morning Commute
1. Open the app → map view
2. Search for “M2”
3. Tap the M2 metro line
4. The panel opens for 08:00:
   - **Very High** crowding (92% occupancy)
   - Estimated 1,847 passengers
5. Slide to 09:00:
   - **High** crowding (78% occupancy)
   - Estimated 1,562 passengers
6. Decision: travel one hour later for a more comfortable ride
7. Tap the star icon to add it to favorites

### Scenario 2: Visiting a New Area
1. Tap the location button on the map
2. Your GPS location appears as a blue dot
3. Search for nearby bus “500T”
4. The panel opens and the route is drawn on the map
5. Start/end stops are highlighted in green/red
6. Check departure info: “in 5 minutes”
7. The 24-hour chart shows crowding rising at 18:00
8. Plan your return trip accordingly

### Scenario 3: Waiting at a Metro Station
1. Open the Favorites page
2. Tap your saved M4 line
3. Choose station “Kadıköy”
4. Direction: “towards Tavşantepe”
5. Live departures:
   - Train arriving in **2 minutes**
   - Next train in **7 minutes**
6. Tap “View full timetable” to open the daily schedule
7. Last departure: 23:45 — plan your return accordingly

---

## 🌟 Highlights

### 1. Smart Service-Hour Handling
- Detects when a line is out of service for the selected hour
- Dedicated UI for “No service” states
- Shows next service time to guide the user
- Visual “gaps” / gray bars for out-of-service hours in charts

### 2. Direction-Aware Line Support
In DoluMu, the “direction” selection exists to correctly display direction-dependent info such as **service hours, alerts, and route geometry**:
- Different operating hours and out-of-service periods per direction (G/D)
- Direction-specific route polyline (bus)
- Station + direction selection for accurate metro timetables

### 3. Metro-Specific Features
- **Full network rendering**:
  - All stations shown in order
  - Connection segments between stations
  - Transfer stations highlighted
- **Station details**:
  - Amenity info (elevator, escalator)
  - Functional codes
  - Station order (stop 1, stop 2, ...)
- **Dynamic line logic**:
  - M1 branch handling (M1A / M1B)
  - Station order reverses based on direction

### 4. Data Visualization
- **Crowd level mapping**:
  - Occupancy percentage → crowd level
  - Instant recognition via color
  - Visual proportion via progress bars
- **24-hour chart**:
  - Trend visualization
  - Interactive tooltips
  - Gradient fill for readability

### 5. Error Handling & User Feedback
- **Graceful degradation**:
  - Clear messages on API errors
  - Automatic retry on timeouts
  - Connection guidance for network errors
- **Loading states**:
  - Skeleton screens while loading
  - Screen-reader friendly loading text
  - Shimmer placeholders

### 6. Multi-Platform Support
- **iOS**:
  - Safari-specific install instructions
  - Safe-area inset handling
  - Touch delay optimizations
- **Android**:
  - Chrome PWA install prompt
  - Material Design aligned UX
- **Desktop**:
  - Hover states
  - Keyboard navigation
  - Resize handles

---

## 🔮 User Value Proposition

### Save Time
- Reduce waiting time by choosing less crowded hours
- Compare alternative times and routes quickly
- Check conditions before leaving

### Improve Comfort
- Avoid peak crowding
- Increase the chance of finding a seat
- Reduce travel stress by planning ahead

### Trustworthy Guidance
- Machine learning models trained on historical data
- Official ridership data sources
- Updated forecasts produced daily

### Accessible
- Free to use
- Works in any modern browser
- PWA keeps core functionality available even when offline

---

## 📊 Data Flow & Architecture

```
User Interaction
    ↓
Next.js Frontend (React Components)
    ↓
Zustand Store (State Management)
    ↓
API Client (Axios)
    ↓
FastAPI Backend
    ↓
┌──────────────┬──────────────┬───────────────┐
│  PostgreSQL  │  LightGBM    │  Metro API    │
│  (Metadata)  │  (ML Model)  │  (Live Data)  │
└──────────────┴──────────────┴───────────────┘
```

### Data Freshness
- **Forecasts**: precomputed daily (24-hour horizon)
- **Metro schedules**: near real-time experience with short-lived caching
- **Line status**: fetched on demand
- **Routes**: static JSON assets (updated when sources change)

---

## 🎨 Design System

For the detailed design system, see `DESIGN_SYSTEM.md`. Key elements:

- **Typography**: Inter font family, responsive font sizes
- **Spacing**: 4px grid system (space-1 → space-20)
- **Colors**:
  - Background: slate-950
  - Surface: slate-900
  - Text: gray-100
  - Primary: purple-600
  - Secondary: amber-500
- **Shadows**: multi-layer shadows for depth
- **Borders**: subtle white/10 opacity borders

---

## 💻 Development

From the `frontend/` directory:

### Install
```bash
npm install
```

### Dev Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build
```bash
npm run build
npm start
```

### Lint
```bash
npm run lint
```

---

## 🙏 Thanks

This platform is built to help millions of people in Istanbul make daily trips more predictable and comfortable. It keeps improving thanks to user feedback and community support.

**Have a great trip!** 🚇🚌⛴️
