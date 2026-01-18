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

## Credentials
- **Web App:** admin / Paparoni83
- **Telegram:** @dwijayanto (API credentials in backend/.env)

## Future Tasks (Backlog)
- [ ] AI-enhanced family tree visualization
- [ ] Refactor MainApp.jsx into smaller components (Sidebar, MapControls, TargetDialog)
- [ ] Export data to PDF/Excel
- [ ] Multi-user support

## Files Reference
- `/app/frontend/src/pages/MainApp.jsx` - Main application component
- `/app/backend/server.py` - FastAPI backend with Telethon integration
- `/app/frontend/src/index.css` - Global styles and 4K media queries
- `/app/frontend/src/components/FamilyTreeViz.jsx` - Family tree component
