# NETRA - Product Requirements Document

## Project Overview
**Application Name:** NETRA  
**Type:** Geospatial Information System (GIS) Web Application  
**Purpose:** Location-based system to find mobile phone positions and retrieve owner details via Telegram bot integration and CP API

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
- **Authentication:** JWT-based (admin/Paparoni290483#)

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
- **Web App:** admin / Paparoni290483#
- **Telegram:** @dwijayanto (API credentials in backend/.env)

## Database Seeding (December 2025)

### How It Works
- **Auto-seed on startup:** If database is empty, automatically seeds with data from `seed_data.json`
- **Manual export:** `GET /api/db/export` - Exports all collections to JSON
- **Manual seed:** `POST /api/db/seed` - Seeds database with provided JSON data
- **Status check:** `GET /api/db/status` - Shows document counts per collection

### Files Created
- `/app/backend/seed_database.py` - Seeding script with auto-seed logic
- `/app/backend/seed_data.json` - Full database export (auto-generated)
- `/app/backend/seed_data_template.json` - Minimal template for fresh deployments

### API Endpoints
- `GET /api/db/export` - Export all collections
- `POST /api/db/seed` - Seed database (body: `{"data": {...}, "clear_existing": false}`)
- `GET /api/db/status` - Get document counts

### Usage for Deployment
1. Before deploying: Call `GET /api/db/export` to save current data
2. After deploying: Call `POST /api/db/seed` with exported data
3. Or: Auto-seed runs automatically if database is empty

### Important Notes
- **Targets/chat_messages** may need to be re-queried via Telegram after migration
- **Position history** is preserved but timestamps are from original queries
- **Schedules** may need adjustment (next_run times may be outdated)

## Recent Features (January 2026)

### 0. NIK Info Dialog Bug Fix (January 19, 2026)
- **Issue:** NIK Info Dialog only displayed 3 fields (Phone, NIK, Operator) instead of full 15 fields
- **Root Cause:** Multiple issues identified and fixed:
  1. State `selectedReghpTarget` was not refreshed after NIK query completed
  2. "Info" button was shown even when NIK data was incomplete (error status)
  3. No validation for Telegram connection before starting query
- **Fixes Applied:**
  1. Added field count validation - "Info (15)" button only shows if `parsed_data` has ≥5 fields
  2. Added "🔄 Retry" button for NIK queries with error status
  3. Added Telegram connection check before REGHP/NIK queries with toast error message
  4. `selectedReghpTarget` is now updated after NIK query completes
  5. Field count indicator "(X fields)" shown under each NIK entry
- **Testing Verified:** NIK Info Dialog now shows all 15 fields correctly
- **Files Modified:**
  - `/app/frontend/src/components/main/TargetDialogs.jsx` - ReghpInfoDialog NIK buttons logic
  - `/app/frontend/src/pages/MainApp.jsx` - handlePendalaman, handleNikPendalaman with Telegram check

### 0c. Telegram Session Persistence & Data Loading Fix (January 19, 2026)
- **Issues Fixed:**
  1. **Telegram session tidak persistent** - Session hilang setelah server restart
  2. **Data tidak muncul langsung setelah login** - User harus logout/login ulang
- **Solutions:**
  1. **MongoDB Session Backup:** Session di-backup ke MongoDB collection `telegram_sessions` setelah login berhasil
  2. **Auto-restore dari MongoDB:** Saat startup, server akan restore session dari MongoDB jika file tidak ada
  3. **Data fetch improvement:** Added `username` dependency dan Authorization header untuk immediate data loading
- **Files Modified:**
  - `/app/backend/server.py` - startup auto-reconnect, MongoDB session backup
  - `/app/frontend/src/pages/MainApp.jsx` - fetchCases/fetchTargets dengan auth header

### 0d. Multiple Bug Fixes (January 19, 2026)
- **Issues Fixed:**
  1. **Mock data dihapus** - Tidak lagi menampilkan data contoh saat Telegram error, sekarang menampilkan error message
  2. **Telegram status check tidak konsisten** - Ditambahkan retry logic 3x dengan delay 1 detik
  3. **Chat tidak menampilkan info pendalaman** - Chat panel otomatis terbuka saat pendalaman dimulai
  4. **API ID/Hash reset tidak stabil** - Ditambahkan retry logic 3x dan client reset saat credentials diupdate
  5. **"Data Not Found" handling** - Error message ditampilkan dengan jelas di dialog
- **Files Modified:**
  - `/app/backend/server.py` - Removed mock data fallback, added retry logic, improved error handling
  - `/app/frontend/src/pages/MainApp.jsx` - Auto-open chat, retry for status check, auth headers
  - `/app/frontend/src/components/main/TargetDialogs.jsx` - Error display in REGHP dialog

### 0b. AOI Custom Color Feature (January 19, 2026)
- **Feature:** Users can now set custom colors for each AOI
- **Color Palette:** 10 predefined colors (Cyan, Yellow, Green, Purple, Pink, Orange, Blue, Red, Teal, Lime)
- **Implementation:**
  - Color picker in manual AOI creation form
  - Color picker in drawing mode (polygon/circle) - shows in map control panel
  - Color indicator (circle dot) displayed next to AOI name in list
  - Edit color for existing AOIs via pencil button
  - AOI shapes on map use the selected custom color
  - Drawing preview uses selected color in real-time
- **Backend:** Added `color` field to AOI schema (optional, hex format)
- **Files Modified:** 
  - `/app/backend/server.py` - AOICreate and AOI models, update endpoint
  - `/app/frontend/src/components/AOIComponents.jsx` - Color picker in form and list
  - `/app/frontend/src/components/main/AOIRenderer.jsx` - Use custom color for map shapes
  - `/app/frontend/src/components/main/MapControls.jsx` - Color picker in drawing indicator
  - `/app/frontend/src/components/main/DrawingOverlay.jsx` - Preview with selected color
  - `/app/frontend/src/pages/MainApp.jsx` - Drawing color state management

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
- **Minimal markers:** History points use tiny dots (radius 3) attached to line, endpoint uses radius 8
- **Arrow pointer:** Each history point (except newest) has a small colored arrow pointing down to the dot
- **Timestamp above arrow:** Date/time label positioned above the arrow with dark background
- **No label on endpoint:** Newest position has NO timestamp label or arrow (only history points have labels)
- **Multiple history support:** Can display history for multiple targets simultaneously with different colors
- **Toggle history:** Click history icon once to show, click again to hide (no separate X button)
- **Icon color change:** History icon turns green when active for that target
- **Color coding:** Different colors for each target's history path (yellow, cyan, pink, green, orange)
- **Files Modified:** `/app/frontend/src/pages/MainApp.jsx`, `/app/backend/server.py`

### 4b. History Timestamp Fix (January 18, 2026)
- **Issue:** History timestamps showed access time instead of actual CP query time
- **Fix:** Modified `save_position_history()` to accept and use `cp_timestamp` parameter
- **Migration:** Added `/api/fix-history-timestamps` endpoint to update existing history records
- **Files Modified:** `/app/backend/server.py`

### 4c. History Dialog Date Fix (January 18, 2026)
- **Issue:** Date range "Dari" was sometimes larger than "Sampai", and "Muat Data" button didn't work
- **Fix:** 
  - Refactored date initialization to use local timezone properly
  - Created `formatDateTimeLocal()` helper for correct datetime-local format
  - Split `fetchHistory` into `fetchHistoryWithDates()` for initial load
  - Added validation to prevent "Dari" > "Sampai"
- **Default range:** 30 days ago 00:00 → today 23:59
- **Files Modified:** `/app/frontend/src/components/HistoryDialog.jsx`

### 5. AOI Panel Search Feature (January 18, 2026)
- **New search field:** Added search input at top of AOI list to filter by name
- **Real-time filter:** Filters AOI list as user types
- **Empty state:** Shows "Tidak ada AOI dengan nama X" when no matches
- **Files Modified:** `/app/frontend/src/components/AOIComponents.jsx`

### 6. AOI Notification Bug Fix (January 18, 2026)
- **Issue:** "Gagal membuat AOI" error shown even when AOI was successfully created (due to 520 timeout)
- **Solution:** Implemented polling verification - on error, system waits and re-fetches AOI list to verify creation
- **Behavior:** If AOI appears in list after error, shows success toast instead of error
- **Files Modified:** `/app/frontend/src/pages/MainApp.jsx`

## Major Refactoring (December 2025)

### MainApp.jsx Component Breakdown
**Completed:** Reduced `MainApp.jsx` from **3253 lines** to **1459 lines** (~55% reduction)

**New Components Created in `/app/frontend/src/components/main/`:**

1. **`Sidebar.jsx`** - Complete sidebar with Cases, Targets, Telegram status
   - `SidebarHeader` - Logo, settings, logout buttons
   - `ProcessingIndicator` - Global processing status
   - `CasesSection` - Case list with CRUD
   - `TargetsSection` - Target list with search, actions
   - `TargetCard` - Individual target card with all controls

2. **`ChatDialog.jsx`** - Chat history popup dialog
   - `ChatMessage` - Individual chat message component

3. **`MapControls.jsx`** - All map control buttons
   - `MapControls` - Tile selector, maximize, marker names, AOI toggle
   - `MapControlsToggle` - Show/hide map controls button
   - `DrawingIndicator` - AOI drawing mode indicator

4. **`HistoryPathRenderer.jsx`** - Multi-target history visualization
   - Polyline rendering with dotted lines
   - Circle markers for history points
   - Timestamp labels with arrows on previous points
   - Color-coded paths for multiple targets

5. **`AOIRenderer.jsx`** - Area of Interest map overlays
   - `AOIPopup` - Popup content for AOI shapes
   - Polygon and Circle rendering with alert highlighting

6. **`DrawingOverlay.jsx`** - AOI drawing preview
   - Polygon and circle preview during drawing
   - Point markers for drawing vertices

7. **`TargetMarkers.jsx`** - Target location markers
   - `TargetPopup` - Popup with target info and Pendalaman button

8. **`TargetDialogs.jsx`** - All modal dialogs
   - `NewCaseDialog` - Create new case
   - `AddTargetDialog` - Add new target
   - `DuplicatePhoneDialog` - Handle duplicate phone numbers
   - `ScheduleDialog` - Schedule position updates
   - `ReghpInfoDialog` - Registration HP info display
   - `NikInfoDialog` - NIK data with photo display
   - `FamilyTreeDialog` - Family tree visualization
   - `NikDataRow` - Table row for NIK data with Family button

**Updated `index.js`:** Barrel exports for all new components

**Benefits:**
- Better code organization and maintainability
- Easier testing of individual components
- Reduced cognitive load when reading code
- Clear separation of concerns

## Future Tasks (Backlog)
- [ ] AI-enhanced family tree visualization using graph library (react-flow/D3.js)
- [x] ~~Refactor MainApp.jsx into smaller components~~ **COMPLETED**
- [ ] Multi-user support
- [ ] Add unit tests for new components
- [ ] AOI opacity slider for adjusting overlay transparency

## Recent Updates (January 20, 2026)

### Refresh Position Feature Fix (January 20, 2026)
- **Problem:** When clicking "Perbaharui", it created a NEW target instead of updating the existing one
- **Fix:** Created new endpoint `POST /api/targets/{target_id}/refresh-position`
- **Behavior Now:**
  1. ✅ Old position saved to history BEFORE querying new position
  2. ✅ All existing data (RegHP, NIK, NKK) preserved - no need to re-query
  3. ✅ New position saved to history after successful update
  4. ✅ AOI alerts automatically triggered when new position enters monitored area
  5. ✅ History path refreshed automatically if displayed
- **Files Modified:**
  - `/app/backend/server.py` - New `refresh-position` endpoint, `query_telegram_bot_refresh` function, `parse_cp_response` helper
  - `/app/frontend/src/pages/MainApp.jsx` - Updated `handlePerbaharui` to use new endpoint with polling

### PDF Export with Photo (January 20, 2026)
- **Feature:** PDF export now includes target's photo (from NIK data) if available
- **Layout:** Photo displayed on the right side of NIK data table (35x45mm portrait format)
- **Both Exports Updated:** Single target PDF and Case PDF both show photos
- **Fallback:** If photo unavailable, table uses full width
- **Files Modified:**
  - `/app/frontend/src/components/main/PDFExport.jsx` - Added photo rendering in both `generateTargetPDF` and `generateCasePDF`

### Real-time Telegram Status Monitoring
- **Feature:** Telegram connection status is now monitored in real-time with polling every 10 seconds
- **UI Changes:**
  - Sidebar shows "● LIVE" indicator when status is being actively monitored
  - Status shows "Session active, reconnecting..." when authorized but temporarily disconnected
  - Click on status bar to manually refresh status
  - Colors: Green = Connected, Yellow = Reconnecting, Red = Disconnected
- **Backend:** Added `connected` field to `/api/telegram/status` response (separate from `authorized`)
- **Keepalive Task:** Background task pings Telegram every 60 seconds to maintain connection
- **Files Modified:**
  - `/app/frontend/src/context/TelegramContext.jsx` - Polling logic, enhanced status states
  - `/app/frontend/src/components/main/Sidebar.jsx` - Enhanced status indicator with LIVE badge
  - `/app/backend/server.py` - Added `connected` field, keepalive task

### Telegram Session Restore Feature
- **Feature:** "Restore Session dari Backup" button in Settings to recover session from MongoDB backup
- **Use Case:** When Telegram session is lost after deployment/restart but backup exists in database
- **Endpoint:** `POST /api/telegram/force-restore-session`
- **Behavior:**
  - Disconnects current client
  - Deletes current session file
  - Restores session from MongoDB backup
  - Reconnects and verifies authorization
- **Files Modified:**
  - `/app/backend/server.py` - New force-restore endpoint, telegram_keepalive_task
  - `/app/frontend/src/pages/Settings.jsx` - New restore button and handler

### AOI Alert System (In Progress)
- **Components:**
  1. **Red Banner:** Persistent banner at top of screen when target enters AOI
  2. **Beep Sound:** Repeating beep every 3 seconds until acknowledged
  3. **Flashing Marker:** Target marker blinks red with "⚠️ ALERT: Dalam AOI" label
- **Implementation:**
  - `AOIAlertNotification` component with Web Audio API for beep sound
  - `createBlinkingMarker` function for animated marker with CSS keyframes
  - Mute button to silence beep without dismissing alert
  - "ACKNOWLEDGE ALL" button to dismiss all alerts
- **Files Modified:**
  - `/app/frontend/src/components/AOIComponents.jsx` - Alert banner component
  - `/app/frontend/src/components/main/MapUtils.jsx` - Blinking marker function
  - `/app/frontend/src/components/main/TargetMarkers.jsx` - Use blinking marker for alerts
  - `/app/frontend/src/pages/MainApp.jsx` - Pass aoiAlerts to TargetMarkers

## Files Reference

### Main Files
- `/app/frontend/src/pages/MainApp.jsx` - Main application component (1459 lines)
- `/app/backend/server.py` - FastAPI backend with Telethon integration
- `/app/frontend/src/index.css` - Global styles and 4K media queries

### Refactored Components (`/app/frontend/src/components/main/`)
- `index.js` - Barrel exports
- `Sidebar.jsx` - Sidebar with Cases/Targets
- `ChatDialog.jsx` - Chat history dialog
- `MapControls.jsx` - Map control buttons
- `HistoryPathRenderer.jsx` - History path visualization
- `AOIRenderer.jsx` - AOI shapes rendering
- `DrawingOverlay.jsx` - Drawing preview
- `TargetMarkers.jsx` - Target location markers
- `TargetDialogs.jsx` - All modal dialogs
- `CountdownTimer.jsx` - Schedule countdown
- `MapUtils.jsx` - Map tiles and marker utilities
- `MapResizeHandler.jsx` - Map resize handling
- `PDFExport.jsx` - PDF generation

### Other Components
- `/app/frontend/src/components/FamilyTreeViz.jsx` - Family tree component
- `/app/frontend/src/components/HistoryDialog.jsx` - Position history dialog
- `/app/frontend/src/components/AOIComponents.jsx` - AOI panel and alert notification
- `/app/frontend/src/components/main/NonGeointSearch.jsx` - NON GEOINT search component

## Recent Updates (January 22, 2026)

### Critical Bug Fixes on VPS (January 21-22, 2026)
1. **IndentationError Fix:** Fixed server-crashing IndentationError in `backend/server.py`
2. **Telegram Session Path Fix:** Replaced hardcoded file paths with relative paths using `ROOT_DIR`
3. **NIK Data Overwriting Fix:** Corrected logic where detailed NIK data was being overwritten

### Cases Slider Feature (January 22, 2026)
- **Feature:** Cases list in sidebar now uses horizontal slider for multiple cases
- **Library:** `react-slick`, `slick-carousel`
- **UI:** Navigation arrows and dots for case selection
- **Files Modified:** `/app/frontend/src/components/main/Sidebar.jsx`

### NON GEOINT Search Engine (January 22, 2026)
- **Purpose:** Search for individuals by name (separate from map-based phone tracking)
- **Workflow:**
  1. User enters full name in search dialog
  2. System queries Telegram bot for: Capil → Pass WNI → Pass WNA
  3. Results aggregated with automatic NIK extraction
  4. User selects NIKs for detailed investigation (NIK, NKK, RegNIK queries)
  5. Final results exportable as PDF

- **Backend Features:**
  - New `asyncio.Queue` system for sequential Telegram queries (prevents race conditions)
  - Endpoints: `/api/nongeoint/search`, `/api/nongeoint/investigate-niks`, `/api/nongeoint/history`
  - MongoDB collection: `nongeoint_searches`

- **Frontend Features:**
  - 3D-styled "NON GEOINT" button (orange gradient) positioned above map
  - History button (purple) for viewing past searches
  - Multi-step dialog: Search → Results → NIK Selection → Investigation → PDF Export
  - Status indicators for each query type (Capil, Pass WNI, Pass WNA)
  - Checkbox selection for multiple NIKs
  - Real-time polling for query progress

- **Files Created/Modified:**
  - `/app/backend/server.py` - NON GEOINT endpoints and queue system
  - `/app/frontend/src/components/main/NonGeointSearch.jsx` - New component
  - `/app/frontend/src/pages/MainApp.jsx` - Integration and button placement
  - `/app/frontend/package.json` - Added jspdf, html2canvas dependencies

- **UI Fix:** Sidebar minimize button z-index corrected (z-[999] instead of z-[2000])

### Dependencies Added
- `react-slick` - Slider/carousel component
- `slick-carousel` - Slider CSS
- `jspdf` - PDF generation (also used by NON GEOINT)
- `html2canvas` - HTML to canvas conversion

## Deployment Notes (VPS: 76.13.21.246)
- **Update Command:**
  ```bash
  cd /var/www/waskita-lbs
  git checkout -- .
  git pull origin main
  pm2 restart waskita-backend
  ```
- Agent does NOT have direct VPS access - all instructions provided as bash commands for user

## Testing Status (January 22, 2026)
- **Preview Environment:** UI verified working (login, map, NON GEOINT dialogs)
- **VPS Testing Required:** Full functional testing of NON GEOINT needs:
  1. Active Telegram connection (session setup on VPS)
  2. Bot @northarch_bot must be responsive
- **CP API:** Disconnected in preview (IP not whitelisted)

## New Feature: Auto Photo Fetch for NON GEOINT (January 2026)

### Flow Baru:
```
User input NAMA 
    ↓
Request CAPIL → Extract ALL NIKs (improved: limit=50, multiple message collection)
    ↓
[NEW] Untuk SETIAP NIK yang ditemukan:
    → Request NIK ke bot (sequential, tidak race)
    → Ambil FOTO dari response (check ALL messages for photos)
    → Status: fetching_photos (dengan progress bar)
    ↓
Tampilkan "Pilih Target" dengan:
    📷 FOTO + NIK + Nama (horizontal scrollable grid)
    ↓
User pilih target
    ↓
Pendalaman: NIK detail + NKK + RegNIK
    ↓
Tampilkan hasil + PDF
```

### Bug Fixes in This Update:
1. **NIK Extraction** - Now collects NIKs from ALL messages (not just first one)
   - Increased message limit from 20 to 50
   - Wait and fetch more messages for CAPIL queries
   - Remove early `break` that stopped NIK collection
   
2. **Photo Fetch** - Now searches for photos in ALL messages
   - Photo might be sent as separate message from text data
   - Check all messages for photo before parsing text

### Files Modified:
- `/app/backend/server.py`:
  - `execute_nongeoint_query()` - Fixed NIK extraction to collect from all messages
  - `execute_nik_button_query()` - Search for photo in all messages first
  - `process_nongeoint_search()` - Auto photo fetch with progress tracking
  
- `/app/frontend/src/components/main/NonGeointSearch.jsx`:
  - `PersonSelectionCard` - Redesigned with photo display (80x100px)
  - `pollSearchResults()` - Handle `fetching_photos` status
  - Photo fetching progress bar UI
  - Fixed useEffect to only process when status is 'completed'
  - Added extensive console logging for debugging

---

## Bug Fixes (January 2026 - Latest Session)

### P0: Investigation Results Not Reloading from History - FIXED (v2)
- **Issue:** When user selected a target from NON GEOINT history, investigation results (NIK/NKK/RegNIK) were not displayed
- **Root Cause:** React useEffect had flawed logic with `prevOpenRef` that prevented data loading on subsequent dialog opens
- **Solution (v2 - Simplified & More Robust):**
  1. Replaced complex `prevOpenRef` logic with simpler `lastOpenedWithSearchRef`
  2. Data loads when: dialog opens AND initialSearch.id differs from last loaded search
  3. On dialog close: all states reset AND `lastOpenedWithSearchRef` set to null
  4. Parent component resets `selectedNonGeointSearch` when dialog closes
  5. Added extensive console logging for debugging
- **Files Modified:**
  - `/app/frontend/src/components/main/NonGeointSearch.jsx` - useEffect refactoring
  - `/app/frontend/src/pages/MainApp.jsx` - onOpenChange handler with state reset
  - `/app/backend/server.py` - Enhanced logging for investigation loading

### Debug Logs Added
Frontend logs prefixed with `[NonGeoint]`:
- Dialog open/close events
- Search data loading
- Investigation data presence

Backend logs in `/var/log/supervisor/backend.out.log`:
- Search fetch with investigation status
- NIK results summary for each investigation

### P1: Family Tree Graph Not Rendering
- **Status:** Needs VPS testing - component code appears correct
- **Debug Notes:** Check if `family_data.members` is populated in backend response

### P2: NKK Results Only Show One Family Member
- **Status:** Needs VPS testing - parser has 4 methods, may need bot response samples

### P2: Delete Button Not Visible on VPS
- **Status:** User must rebuild frontend on VPS
- **Command:**
  ```bash
  cd /var/www/waskita-lbs/frontend
  npm install
  npm run build
  ```

### VPS Deployment Instructions (CRITICAL)
After pulling latest code, user MUST run:
```bash
cd /var/www/waskita-lbs
git checkout -- .
git pull origin main
cd frontend && npm install && npm run build
pm2 restart waskita-backend
```

## Recent Updates (January 25, 2026)

### NON GEOINT Resumable Search Verification
- **Status:** VERIFIED working in frontend code
- **Implementation Details:**
  1. Search ID saved to localStorage when dialog closes during active search (`fetching_photos`, `waiting_selection`, or loading more photos)
  2. On dialog reopen, checks localStorage for `nongeoint_ongoing_search_id`
  3. Loads search data from backend and resumes polling if still fetching
  4. UI updates with fetched photos and shows proper state
- **Files:** `/app/frontend/src/components/main/NonGeointSearch.jsx` (lines 1097-1168, 1221-1246)
- **Testing:** Frontend UI testing passed 100% (iteration_4.json)

### Pending Issues Summary

#### BLOCKED - Immigration/Passport API (P0)
- **Status:** EXTERNALLY BLOCKED by API provider
- **Root Cause:** IP whitelist on provider side has wrong IP (`162.159.142.117`) instead of VPS IP (`76.13.21.246`)
- **Backend code is CORRECT** - The `/api/nongeoint/investigate` endpoint correctly calls CP API's `/imigrasi/wni`, `/imigrasi/wna`, and `/imigrasi/lintas` endpoints
- **Action Required:** User must contact API provider to update Lock IP for imigrasi subscription to `76.13.21.246`

#### IN PROGRESS - NKK Table Shows Only 1 Family Member (P1)
- **Status:** Needs root cause analysis
- **Suspected Cause:** Backend parser `parse_nkk_family_data()` in `server.py` (line 5069-5225)
- **Parser has 4 methods:**
  1. Structured format (NIK, Name on separate lines)
  2. Table format (NIK | Name | Relationship | Gender)
  3. Numbered list format
  4. NIK split method (extract all NIKs and associate with nearby text)
- **Debug Required:** Need sample raw text from Telegram bot's NKK query response to identify parsing issue
- **Files:** `/app/backend/server.py` function `parse_nkk_family_data()`

### Test Reports Created
- `/app/test_reports/iteration_4.json` - NON GEOINT UI testing (100% pass rate)

## January 27, 2026 Updates

### P0: Passport Queries via CP API (IMPLEMENTED)
- **Request:** User requested Passport queries (WNA Nama, WNI Nama, Nomor) use CP API instead of Telegram Bot
- **Implementation:**
  1. Created new function `query_passport_simple_cp_api()` in server.py
  2. Modified `/api/simple-query` endpoint to route passport queries directly to CP API (bypassing Telegram)
  3. Passport queries no longer require Telegram connection
  4. Results are cached in `simple_query_cache` collection
  5. UI shows "VIA CP API" badge for passport queries
  
- **CP API Endpoints Used:**
  - WNI by name: `GET /api/v3/imigrasi/wni?type=name&query={name}`
  - WNA by name: `GET /api/v3/imigrasi/wna?type=name&query={name}`
  - By passport number: `POST /api/v3/imigrasi/lintas` with `nopas={passport_no}`

- **Query Types Affected:**
  - `passport_wna` - Search WNA passport by name → CP API
  - `passport_wni` - Search WNI passport by name → CP API
  - `passport_number` - Search by passport number → CP API
  
- **Files Modified:**
  - `/app/backend/server.py`:
    - New function: `query_passport_simple_cp_api()`
    - Modified: `/api/simple-query` endpoint to handle passport queries before Telegram check
  - `/app/frontend/src/components/main/SimpleQuery.jsx`:
    - Added "VIA CP API" badge indicator

### P1: NKK Parser Fix (IMPLEMENTED & VERIFIED)
- **Issue:** NKK table only showing 1 family member (recurring bug from previous forks)
- **Root Cause:** Parser was detecting NIK patterns too aggressively, not properly handling block-based format
- **Solution:** Rewrote `parse_nkk_family_data()` function with proper block-by-block parsing:
  1. Each member block starts with "Nik: {16-digit-NIK}"
  2. Parses all fields: Full Name, Address, Dob, Religion, Relationship, Blood, Type of Work, Gender, Marital, Father/Mother Name/NIK
  3. Fallback method for alternative formats
  
- **Test Result:** Successfully parsed 4 family members from sample data:
  - NUR ENDAH DWIJAYANTO (KEPALA KELUARGA, L)
  - KEANA LOVA SHAFEEQA (ANAK, P)
  - KEANU ALTAF AL-FARUQ (ANAK, L)
  - DEWI ARIYANTI (ISTRI, P)

- **Files Modified:**
  - `/app/backend/server.py`: Function `parse_nkk_family_data()` completely rewritten

### CP API Note
- CP API requires IP whitelist - queries will fail if VPS IP is not whitelisted
- In preview environment, CP API returns HTML (not whitelisted)
- User must ensure VPS IP is whitelisted for all API subscriptions (CP, Imigrasi)

### Pending for User Verification
1. Test Passport queries on VPS where CP API IP is whitelisted
2. Test NKK query to verify all family members are displayed
3. Verify FULL QUERY investigation shows passport/perlintasan data


### UI Restructure: Tools Panel (January 27, 2026)

**Request:**
1. Rename "Query" button to "SIMPLE QUERY"
2. Create a floating, draggable, minimizable, maximizable window containing all query tools

**Implementation:**
- Created new component: `/app/frontend/src/components/main/ToolsPanel.jsx`
- Features:
  - Draggable window with grip handle
  - Minimize/Maximize/Close buttons
  - Auto-centers on screen when opened
  - Stays within viewport bounds

**Tools Panel Contents (in order):**
1. FULL QUERY - Cari button + History button
2. FACE RECOGNITION - Scan button + History button  
3. SIMPLE QUERY - "Buka Simple Query" button (green)
4. USER MANAGEMENT - "Buka User Management" button (purple, admin only)

**Files Modified:**
- `/app/frontend/src/components/main/ToolsPanel.jsx` - NEW
- `/app/frontend/src/components/main/index.js` - Added exports
- `/app/frontend/src/components/main/SimpleQuery.jsx` - Changed title to "SIMPLE QUERY"
- `/app/frontend/src/pages/MainApp.jsx` - Replaced individual buttons with ToolsPanel


## January 28, 2026 Updates

### NETRA Logo Implementation (COMPLETED)
- **Request:** Application rebranded from "Waskita LBS" to "NETRA", logo implementation was pending
- **Implementation:**
  1. Generated NETRA logo using image generation tool (eye + location pin + radar elements in cyan/teal)
  2. Downloaded logo to `/app/frontend/src/assets/logo.png`
  3. Updated Login page to display logo instead of Shield icon
  4. Updated Sidebar header to display logo next to "NETRA" text
  
- **Files Modified:**
  - `/app/frontend/src/assets/logo.png` - NEW logo file
  - `/app/frontend/src/pages/Login.jsx` - Logo import and display
  - `/app/frontend/src/components/main/Sidebar.jsx` - Logo import and display in header

- **Testing:** Screenshot verification confirmed logo displays correctly on:
  - Login page: Large logo (128x128) above NETRA title
  - Sidebar: Small logo (40x40) next to NETRA text

### Pending User Verification
1. **Bug "waiting_selection" di FULL QUERY** - Code fix implemented, needs VPS testing
2. **Race condition "plat_mobil"** - Server-side retry logic implemented, needs VPS testing with concurrent users
3. **NKK Parser** - Improved parser needs verification with real bot data

### Single Device Login (January 28, 2026) - SIMPLIFIED & COMPLETED
- **Request:** Satu user hanya bisa login di satu device pada satu waktu. Versi awal menggunakan sistem approval yang kompleks, kemudian user meminta penyederhanaan.
- **Implementation (Simplified - January 28, 2026):**
  1. Backend tracks active sessions in MongoDB collection `active_sessions`
  2. Login endpoint checks for existing sessions - if exists, BLOCKS login with HTTP 409 error
  3. Returns error `{error: "session_active", message: "Akun ini sudah dibuka di tempat lain...", device_info: "..."}`
  4. Frontend shows simple AlertDialog with "OK" button - no approval flow needed
  5. User must logout from other device first before logging in from new device
  6. Stale sessions (inactive > 30 minutes) are automatically cleaned up during login attempt

- **Removed (Old Complex System):**
  - Device transfer request system (collection `device_transfer_requests`)
  - Endpoints: `/auth/transfer-request/{id}`, `/auth/pending-transfer`, `/auth/transfer-response/{id}`
  - Polling for approval from other device
  - Approve/Reject dialog on existing device

- **Files Modified:**
  - `/app/backend/server.py` - Simplified login logic, removed transfer endpoints
  - `/app/frontend/src/context/AuthContext.jsx` - Simplified to only handle session_active error
  - `/app/frontend/src/pages/Login.jsx` - Simple dialog instead of waiting state
  - `/app/frontend/src/pages/MainApp.jsx` - Removed pending transfer dialog

- **Active Endpoints:**
  - `POST /api/auth/login` - Returns 409 if session active
  - `POST /api/auth/check-session` - Validates and updates last_activity
  - `POST /api/auth/logout` - Invalidates session

- **Database:**
  - Collection `active_sessions`: `{username, session_id, device_info, created_at, last_activity}`
  - Stale session cleanup: sessions with last_activity > 30 minutes are automatically removed

### Upcoming Tasks
1. **UI for Security Logs** - Create admin view for `/api/admin/security-logs` endpoint
2. **Family Tree Graph Fix** - Debug `FamilyTreeViz.jsx` rendering issues
3. **Verify Extended Location Info** - Test map popup with real Telegram bot data (IMEI, IMSI, MCC, LAC, CI, CGI)

### Backlog
- Export to Excel/CSV functionality
- Enhanced Family Tree visualization
- Backend parser refactoring for robustness

## January 28, 2026 - Bug Fixes (Continued)

### P0: CP Query Auto-Refresh Not Working - FIXED
- **Issue:** Setelah CP query selesai, user harus manual refresh halaman untuk melihat hasil posisi
- **Root Cause:** Closure issue di useEffect - variabel `targets` yang digunakan dalam `setInterval` tidak mendapatkan nilai terbaru karena hanya di-capture saat pertama kali mount
- **Solution:**
  1. Ditambahkan `targetsRef` (useRef) untuk melacak targets terbaru
  2. Polling sekarang menggunakan `targetsRef.current` bukan closure variable
  3. Interval polling dikurangi dari 10 detik ke 5 detik untuk responsivitas lebih baik
  4. Polling sekarang juga memeriksa `reghp_status` dan `nik_queries` processing status
- **Files Modified:**
  - `/app/frontend/src/pages/MainApp.jsx` - Lines 158-161 (targetsRef), 620-644 (polling logic)

### Status Change Toast Detection - FIXED
- **Issue:** Toast notification tidak muncul saat target status berubah
- **Root Cause:** Logic deteksi perubahan salah - mencari `prevTarget` di array yang sama (bukan previous state)
- **Solution:**
  1. Ditambahkan `prevTargetsRef` untuk menyimpan state targets sebelumnya
  2. Bandingkan status target saat ini dengan status di previous render
  3. Toast hanya muncul saat ada perubahan nyata (processing → completed/error)
- **Files Modified:**
  - `/app/frontend/src/pages/MainApp.jsx` - Lines 654-680 (status change detection)

### Pendalaman Button Debugging
- **Issue:** User melaporkan tombol Pendalaman (REGHP) tidak berfungsi meskipun response Telegram sudah ada
- **Debug Added:** Console logs di TargetMarkers.jsx dan MainApp.jsx untuk melacak event handler
- **Next Steps:** Verifikasi dengan user apakah issue masih terjadi setelah fix polling

### P0 CRITICAL: "Sesi Berakhir" Bug - ROOT CAUSE FOUND & FIXED
- **Issue:** Dialog "Sesi Berakhir" muncul di tengah aktivitas webapp meskipun user sedang aktif menggunakan aplikasi
- **Root Cause:** `JWT_SECRET` tidak di-set di `.env`, sehingga setiap kali server restart, secret JWT baru di-generate secara random. Ini menyebabkan SEMUA token lama menjadi invalid!
- **Solution:** 
  1. Ditambahkan `JWT_SECRET` yang fixed di `/app/backend/.env`
  2. `JWT_SECRET=netra_jwt_secret_key_2026_do_not_change_a8f3b2c1d4e5`
- **IMPORTANT FOR VPS DEPLOYMENT:**
  User HARUS menambahkan baris berikut ke `/var/www/waskita-lbs/backend/.env`:
  ```
  JWT_SECRET=netra_jwt_secret_key_2026_do_not_change_a8f3b2c1d4e5
  ```
  Kemudian restart backend: `pm2 restart waskita-backend`
- **Files Modified:** `/app/backend/.env`

## Stability Fixes (January 2026)

### P0: Telegram Connection Race Condition Fix
- **Issue:** User melaporkan error "Bot belum terkoneksi" secara random, UI disappearing, dan crash memerlukan refresh berkali-kali
- **Root Causes Found:**
  1. **Race Condition:** `telegram_status` endpoint membuat TelegramClient baru di luar lock global
  2. **Inconsistent Client Creation:** Beberapa tempat tidak menggunakan `create_telegram_client()` helper
  3. **Keepalive Task:** Mengakses `telegram_client` tanpa lock, menyebabkan race condition
- **Solutions:**
  1. Modified `/telegram/status` endpoint untuk menggunakan `telegram_connection_lock`
  2. Replaced manual `TelegramClient()` calls dengan `create_telegram_client()` helper
  3. Added lock di `telegram_keepalive_task()` untuk semua akses telegram_client
  4. Updated `safe_telegram_operation()` untuk use lock saat reconnect
- **Files Modified:** `/app/backend/server.py`

### P1: Leaflet Popup Button Fix (Pendalaman REGHP)
- **Issue:** Tombol "🔍 Reghp" dan "📋 Info" di popup marker tidak berfungsi saat diklik
- **Root Cause:** React onClick events tidak propagate dengan benar dari content yang di-render di Leaflet popup DOM
- **Solution:** 
  1. Replaced React onClick dengan native DOM event listeners
  2. Used `useEffect` untuk attach event listeners setelah popup rendered
  3. Added `data-action` attributes untuk button identification
  4. Proper cleanup dengan ref variable
- **Files Modified:** `/app/frontend/src/components/main/TargetMarkers.jsx`

### Global Error Handling Improvement
- **Issue:** Server errors (500) bisa menyebabkan UI collapse
- **Solution:** Added global axios response interceptor di App.js untuk menangkap dan log errors dengan graceful
- **Files Modified:** `/app/frontend/src/App.js`

### Files Modified Summary (January 2026 Stability)
- `/app/backend/server.py`:
  - `telegram_status()`: Now uses `telegram_connection_lock` and `create_telegram_client()`
  - `safe_telegram_operation()`: Uses lock during reconnect to prevent race conditions  
  - `telegram_keepalive_task()`: Added `async with telegram_connection_lock` for all client access
  - Force restore session: Uses `create_telegram_client()` instead of manual creation
- `/app/frontend/src/components/main/TargetMarkers.jsx`:
  - `TargetPopup`: Implemented native DOM event listeners for Leaflet popup buttons
  - `generateShareLink`: Wrapped in `useCallback` for proper dependency management
  - Added proper cleanup for event listeners
- `/app/frontend/src/App.js`:
  - Added global axios response interceptor for error handling

## Pending Issues

### P2: Family Tree Graph UI Not Rendering
- **Issue:** FamilyTreeViz component exists but graph may not render correctly with certain data formats
- **Status:** Code looks correct but needs user verification with actual data
- **Debug checklist:**
  1. Check browser console for errors when opening Family Tree dialog
  2. Verify data format passed to FamilyTreeViz matches expected structure
  3. Inspect if `members` array is populated correctly

## Bug Fix: Duplicate Phone Prevention (January 2026)

### Issue
User melaporkan ada nomor yang sama muncul duplikat di target list dan peta (2x nomor yang sama dalam satu case).

### Root Causes
1. Frontend `handleRefreshLocation()` memanggil `createNewTarget()` yang membuat target BARU alih-alih memperbarui yang sudah ada
2. Backend tidak memvalidasi duplikat nomor dalam case yang sama

### Solutions
1. **Backend validation:** Added duplicate check in `POST /targets` endpoint
   - Returns HTTP 409 with `error: "duplicate_phone"` if phone exists in case
   - Provides `existing_target_id` for frontend to handle
   
2. **Frontend fix:**
   - `handleRefreshLocation()` now calls `handlePerbaharui(existingTarget)` instead of `createNewTarget()`
   - `createNewTarget()` handles 409 error and shows duplicate dialog
   - `handleUseExisting()` also zooms to existing target on map

### Files Modified
- `/app/backend/server.py`: Added duplicate validation in `create_target()` endpoint
- `/app/frontend/src/pages/MainApp.jsx`: Fixed `handleRefreshLocation()` and `createNewTarget()` error handling

## Stability Fix: Telegram Connection Pre-Check (January 2026)

### Issue
User melaporkan error "Bot tidak terhubung silakan lakukan setting ulang" saat mencoba pendalaman NIK meskipun status Telegram menunjukkan "live/hijau". Error ini intermittent - kadang berhasil, kadang gagal.

### Root Causes
1. **Lazy Connection Check:** Endpoint NIK, REGHP, Family langsung memulai background task tanpa validasi koneksi Telegram terlebih dahulu
2. **Simple Query Check Tidak Robust:** Hanya mengecek `is_connected()` tanpa auto-reconnect
3. **Race Condition:** Koneksi bisa terputus saat menunggu lock untuk query

### Solutions
1. **Pre-Check di Semua Endpoint Query:**
   - `POST /targets/{id}/nik` - Added pre-check with `ensure_telegram_connected()`
   - `POST /targets/{id}/reghp` - Added pre-check
   - `POST /targets/{id}/family` - Added pre-check
   - Returns HTTP 503 dengan pesan jelas jika koneksi gagal
   
2. **Improved Simple Query:**
   - Replaced simple `is_connected()` check dengan `ensure_telegram_connected()`
   - Added double-check koneksi setelah mendapat lock
   - Auto-reconnect jika koneksi terputus saat menunggu lock

3. **Better Error Messages:**
   - Frontend sekarang menampilkan pesan spesifik untuk error 503
   - "Telegram tidak terhubung. Silakan cek koneksi di Settings atau coba lagi."

### Files Modified
- `/app/backend/server.py`:
  - Added `import base64` di top level (fixing F821 error)
  - `query_nik()`: Added Telegram pre-check
  - `query_reghp()`: Added Telegram pre-check  
  - `query_family()`: Added Telegram pre-check
  - `simple_query()`: Improved connection handling with auto-reconnect
- `/app/frontend/src/pages/MainApp.jsx`:
  - `handleNikPendalaman()`: Better error handling for 503

## CRITICAL FIX: Global Telegram Query Lock (January 2026)

### Issue
User melaporkan data tertukar antar user saat query bersamaan:
- User A CP nomor X
- User B CP nomor Y (bersamaan)
- Data posisi Y ditetapkan sebagai posisi X

### Root Cause
Tidak ada global serialization untuk request ke Telegram bot. Multiple background tasks bisa mengirim query dan membaca response secara bersamaan, menyebabkan response yang salah ditangkap oleh user yang berbeda.

### Solution: Global Telegram Query Lock
Implementasi **Global Lock System** yang memastikan **HANYA SATU query Telegram berjalan pada satu waktu** di seluruh aplikasi:

1. **New Global Lock:** `telegram_query_lock = asyncio.Lock()`
2. **Active Query Tracking:** `active_query_info` untuk melacak query yang sedang berjalan
3. **Lock Helper Functions:**
   - `set_active_query(user, type, value, msg_id)` - Set active query info
   - `clear_active_query()` - Clear active query
   - `validate_response_matches_query()` - Validasi response cocok dengan query

4. **Functions Updated with Global Lock:**
   - `query_telegram_bot()` - CP position query
   - `query_telegram_reghp()` - REGHP query
   - `query_telegram_nik()` - NIK detail query
   - `query_telegram_family()` - Family/NKK query
   - Simple Query endpoint - All non-passport queries

### How it Works
```
User A starts CP query for 6281111111111
  ↓
Acquires global lock → set_active_query("userA", "cp", "6281111111111")
  ↓
User B starts CP query for 6282222222222
  ↓
Waits for global lock... (BLOCKED)
  ↓
User A completes → clear_active_query() → releases lock
  ↓
User B acquires lock → set_active_query("userB", "cp", "6282222222222")
  ↓
User B completes → releases lock
```

### Benefits
1. **No Data Mixing:** Only one query runs at a time
2. **Predictable Results:** Each query gets its own response
3. **Easy Debugging:** Active query info logged for troubleshooting
4. **Thread-Safe:** Uses asyncio.Lock() for proper async handling

### Files Modified
- `/app/backend/server.py`:
  - Added `telegram_query_lock` global lock
  - Added `active_query_info` tracking dict
  - Added helper functions for lock management
  - Updated 4 query functions with lock acquire/release in try/finally
  - Updated simple_query to use global lock instead of simple_query_lock

## Future Tasks
- Admin Security Logs UI (backend endpoint `/api/admin/security-logs` exists)
- NKK Parser fix verification with real data
- Export to Excel/CSV functionality
