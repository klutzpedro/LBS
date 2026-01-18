# WASKITA LBS - Product Requirements Document

## Project Overview
**Application Name:** WASKITA LBS  
**Type:** Geospatial Information System (GIS) Web Application  
**Purpose:** Location-based system to find mobile phone positions and retrieve owner details via Telegram bot integration

## Core Workflow
1. User creates a "case" in the web app
2. User enters a target phone number
3. System sends phone number to `@northarch_bot` via Telegram
4. System automatically interacts with bot responses (CP, Reghp, NIK, NKK buttons)
5. System parses bot responses to extract coordinates, addresses, personal info
6. Location plotted on map with detailed data in "Pendalaman" dialogs

## Tech Stack
- **Frontend:** React, Tailwind CSS, Leaflet.js, Shadcn/UI
- **Backend:** FastAPI, Telethon (Telegram client)
- **Database:** MongoDB
- **Authentication:** JWT-based (admin/Paparoni83)

## Key Features Implemented

### Authentication & Session
- [x] Web app login (admin/Paparoni83)
- [x] Telegram account integration via Telethon
- [x] Session management with "Reset Connection" button

### Map Features
- [x] Multiple map tile layers (Dark, Street, Satellite, Terrain, Light, Voyager)
- [x] Full-screen maximize/minimize with proper resize handling
- [x] Custom markers with labels (phone, name, timestamp)
- [x] Toggle marker names visibility

### Target Management
- [x] Create/delete cases and targets
- [x] Search by phone, name, NIK
- [x] Checkbox for marker visibility control
- [x] Duplicate target detection

### Intelligence Gathering
- [x] CP (Coordinates) query
- [x] Reghp (Registration HP) data query
- [x] NIK (National ID) data query with photo
- [x] NKK (Family Card) data query with family tree visualization

### Scheduling
- [x] Schedule position updates (minutes, hourly, daily, weekly, monthly)
- [x] Cancel scheduled tasks

### UI/UX
- [x] Collapsible sidebar
- [x] Dark theme with cyan accents
- [x] 4K resolution optimization (smaller fonts, compact dialogs)
- [x] Toast notifications

## Data Models

### Cases
```json
{ "id": "string", "name": "string", "user_id": "string", "status": "active|deleted" }
```

### Targets
```json
{
  "id": "string",
  "case_id": "string", 
  "phone_number": "string",
  "status": "pending|processing|completed|not_found|error",
  "data": { "latitude": "float", "longitude": "float", "address": "string", ... },
  "reghp_data": { "parsed_data": {...}, "raw_text": "string" },
  "nik_queries": { "nik": { "data": { "parsed_data": {...}, "photo_path": "string" } } },
  "family_data": { "nkk": "string", "members": [...] }
}
```

## Recent Fixes (December 2025)

### Map Maximize Bug Fix
- **Issue:** Map didn't fill entire screen when maximized, leaving gray area on right
- **Solution:** Implemented `MapResizeHandler` component using `useMap` hook and `invalidateSize()` with `ResizeObserver`
- **Files Modified:** `/app/frontend/src/pages/MainApp.jsx`

### 4K Resolution Optimization
- Added CSS media queries for screens >= 2560px and >= 3840px
- Reduced font sizes, dialog widths, button padding
- **Files Modified:** `/app/frontend/src/index.css`, `/app/frontend/src/pages/MainApp.jsx`

### Schedule Countdown Timer (Real-time)
- **Feature:** Real-time countdown timer showing time until next scheduled update
- **Display:** Format `29h 23:51:31` with seconds ticking live
- **Visibility:** Below "Batal Jadwal" button only when schedule is active
- **Files Modified:** `/app/frontend/src/components/main/CountdownTimer.jsx`

### Compact UI for 4K Screens
- Reduced all dialog sizes (`max-w-sm` to `max-w-lg`)
- Reduced padding and spacing throughout
- NIK photos capped at 180px width, 200px height
- Raw response sections made collapsible
- **Files Modified:** `/app/frontend/src/pages/MainApp.jsx`

### Target List Scroll
- **Feature:** Target list now scrollable with max 3 visible at a time
- **Implementation:** Max height 360px with overflow-y-auto
- **Files Modified:** `/app/frontend/src/pages/MainApp.jsx`

### AI Family Tree Analysis
- **Feature:** Gemini 3 Flash integration for family tree analysis
- **Capability:** Generates insights about family structure, relationships, and target position
- **API:** POST `/api/ai/family-analysis`
- **Files Modified:** `/app/backend/server.py`, `/app/frontend/src/components/FamilyTreeViz.jsx`

### Map Position Persistence
- **Feature:** Map preserves center and zoom position when changing tile layers
- **Implementation:** `handleTileLayerChange()` function that preserves mapCenter and mapZoom states
- **Files Modified:** `/app/frontend/src/pages/MainApp.jsx`

### PDF Export Feature
- **Feature:** Export target or entire case data to PDF
- **Format:**
  - A. Target number/info
  - B. Location with map coordinates and timestamp
  - C. RegHP data (table format)
  - D. NIK complete data (table format) - Per NIK
  - E. NKK/Family data (table format) - Per NIK
  - F. Family tree structure - Per NIK
- **Icons:** Print icons appear on hover for both Case and Target cards
- **Libraries:** jspdf, jspdf-autotable
- **Files Created:** `/app/frontend/src/components/main/PDFExport.jsx`

### PDF Map Screenshot Bug Fix (January 2026)
- **Issue:** PDF export captured live map view instead of target's specific location
- **Root Cause:** Using html2canvas on live DOM captured whatever was displayed on screen
- **Solution (Final):** 
  - `handlePrintTarget` now programmatically moves map to target's location first
  - Waits 2 seconds for map tiles to load
  - Takes screenshot using `html2canvas` of the actual webapp map
  - Restores previous map position after screenshot
  - Passes screenshot to `generateTargetPDF(target, mapScreenshot)`
  - `handlePrintCase` does the same for each target in sequence
- **Result:** Each PDF now contains actual webapp map screenshot at target's location
- **Files Modified:** `/app/frontend/src/pages/MainApp.jsx`, `/app/frontend/src/components/main/PDFExport.jsx`

### Family Tree Per-NIK Storage
- **Issue:** Previously, family tree data was stored at target level, causing all NIKs to share the same family tree
- **Fix:** Family tree data now stored per-NIK in `nik_queries[nik].family_data`
- **Impact:** When a phone number has multiple NIKs (e.g., 2 different people registered), each NIK now has its own independent family tree
- **Files Modified:** `/app/backend/server.py`, `/app/frontend/src/pages/MainApp.jsx`

### Code Refactoring
- Extracted reusable components from `MainApp.jsx`
- New components location: `/app/frontend/src/components/main/`
  - `CountdownTimer.jsx` - Real-time countdown display
  - `MapUtils.jsx` - Map tiles config and marker creation
  - `MapResizeHandler.jsx` - Leaflet map resize handling
  - `PDFExport.jsx` - PDF generation for targets and cases
  - `index.js` - Barrel exports
- Reduced MainApp.jsx size by ~150 lines

## API Endpoints
- `POST /api/auth/login` - User authentication
- `GET/POST /api/cases` - Case CRUD
- `GET/POST /api/targets` - Target CRUD
- `POST /api/targets/{id}/query` - Initiate CP query
- `POST /api/targets/{id}/reghp` - Initiate Reghp query
- `POST /api/targets/{id}/nik/{nik}` - Initiate NIK query
- `POST /api/targets/{id}/family/{family_id}` - Initiate NKK query
- `POST /api/telegram/setup` - Telegram login flow
- `POST /api/telegram/reset` - Reset Telegram session
- `GET /api/targets/{target_id}/history` - Get position history
- `GET /api/aois` - Get all AOIs
- `POST /api/aois` - Create AOI
- `PUT /api/aois/{aoi_id}` - Update AOI
- `DELETE /api/aois/{aoi_id}` - Delete AOI
- `GET /api/aoi-alerts` - Get AOI alerts
- `POST /api/aoi-alerts/{alert_id}/acknowledge` - Acknowledge alert
- `POST /api/aoi-alerts/acknowledge-all` - Acknowledge all alerts

## Credentials
- **Web App:** admin / Paparoni83
- **Telegram:** @dwijayanto (API credentials in backend/.env)

## Recent Features (January 2026)

### 1. Family Tree - DOB-based Child Ordering
- Children are now sorted by Date of Birth (oldest = Anak 1)
- Supports multiple DOB formats: DD-MM-YYYY, YYYY-MM-DD, DD/MM/YYYY
- Applied to both FamilyTreeViz component and PDF export
- **Files Modified:** `/app/frontend/src/components/FamilyTreeViz.jsx`, `/app/frontend/src/components/main/PDFExport.jsx`

### 2. Position History Feature
- New History icon appears on hover next to Print icon
- View position history within date/time range
- Option to display history path as polyline on map
- Backend stores position each time target is updated
- **New Files:** `/app/frontend/src/components/HistoryDialog.jsx`
- **Backend:** New `position_history` collection, `save_position_history()` function

### 2b. Schedule Auto-Execute on Countdown End
- When countdown timer reaches zero, automatically triggers position update
- Backend endpoint `POST /api/schedules/{schedule_id}/execute` handles execution
- Sends phone number to Telegram bot, updates position, saves to history
- Map auto-centers on new position after update
- Schedule automatically calculates next_run time based on interval
- **Button shows "⏳ Memproses..." when target is processing**
- **Frontend:** CountdownTimer now has `onCountdownEnd` callback
- **Backend:** New `execute_schedule` endpoint that calls `process_target_query`

### 2c. Chat Panel Changed to Popup Dialog
- Chat button now opens a popup dialog instead of side panel
- Dialog shows chat history in a centered modal
- Map controls no longer affected by chat visibility
- Cleaner UI without side panel layout changes

### 2d. AOI Drawing on Map (January 2026)
- Click "Gambar Polygon" or "Gambar Lingkaran" to start drawing
- Click on map to add points
- Double-click to finish drawing
- Right-click to cancel
- Drawing preview shows in green
- Drawing indicator shows point count with "Selesai" and "Cancel" buttons
- AOI saved with `is_visible: false` by default (hidden until activated)
- **New:** `MapClickHandler` component with `useMapEvents`

### 2e. Position History Fix
- Added `POST /api/targets/{target_id}/save-current-position` to manually save position
- Added `POST /api/sync-all-positions-to-history` to migrate existing data
- History now shows even single position entry
- All future position updates automatically saved to history

### 3. AOI (Area of Interest) Feature
- **AOI Panel:** Create and manage Areas of Interest
- **Drawing Tools:** Draw polygon or circle on map
- **Manual Input:** Enter coordinates manually
- **Target Monitoring:** Checklist to select which targets to monitor per AOI
- **Visibility Toggle:** Show/hide AOI on map
- **Alarm System:** Enable/disable alarm per AOI
- **Alert Notification:** Pop-up when monitored target enters AOI
- **Acknowledge Button:** Dismiss alerts
- AOI checking triggered when target position is updated
- **New Files:** `/app/frontend/src/components/AOIComponents.jsx`
- **Backend:** New `aois` and `aoi_alerts` collections, AOI CRUD endpoints, `check_aoi_alerts()` function

### 4. History UI Improvements (January 18, 2026)
- **Smaller markers:** History point radius reduced from 12 to 6 meters for cleaner visualization
- **Label offset increased:** Timestamp labels moved further from markers (-35px vs -22px) to prevent overlap
- **No label on endpoint:** Timestamp labels removed from newest/endpoint marker since target info popup already shows this data
- **Files Modified:** `/app/frontend/src/pages/MainApp.jsx`

### 5. AOI Notification Bug Fix (January 18, 2026)
- **Issue:** "Gagal membuat AOI" error shown even when AOI was successfully created (due to 520 timeout)
- **Solution:** Implemented polling verification - on error, system waits and re-fetches AOI list to verify creation
- **Behavior:** If AOI appears in list after error, shows success toast instead of error
- **Files Modified:** `/app/frontend/src/pages/MainApp.jsx`

## Future Tasks (Backlog)
- [ ] AI-enhanced family tree visualization using graph library (react-flow/D3.js)
- [ ] Refactor MainApp.jsx into smaller components (Sidebar, MapControls, TargetDialog) - Currently 2500+ lines
- [ ] Multi-user support

## Files Reference
- `/app/frontend/src/pages/MainApp.jsx` - Main application component
- `/app/backend/server.py` - FastAPI backend with Telethon integration
- `/app/frontend/src/index.css` - Global styles and 4K media queries
- `/app/frontend/src/components/FamilyTreeViz.jsx` - Family tree component
- `/app/frontend/src/components/HistoryDialog.jsx` - Position history dialog
- `/app/frontend/src/components/AOIComponents.jsx` - AOI panel and alert notification
