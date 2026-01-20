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
