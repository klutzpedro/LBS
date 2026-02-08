# NETRA - Intelligence Platform

## Overview
NETRA adalah platform intelijen berbasis web dengan backend Python/Flask, frontend React, dan database MongoDB. Platform ini memiliki fitur "Simple Query" untuk pencarian data tunggal dan "Full Query" untuk investigasi mendalam pada target (NIK, NKK, Passport, dll).

## Architecture
```
/app
├── backend/
│   └── server.py        # Main Flask backend with all API endpoints
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── main/
│   │   │   │   ├── SimpleQuery.jsx      # Simple Query UI
│   │   │   │   └── NonGeointSearch.jsx  # Full Query dialog/investigation
│   │   │   └── ...
│   │   └── pages/
│   │       └── MainApp.jsx              # Main application component
│   └── package.json
└── scripts/
    └── clear_passport_cache.py  # Utility script for cache cleanup
```

## Key Technical Stack
- **Frontend:** React.js, Material-UI (MUI), axios
- **Backend:** Python Flask (async), FastAPI router
- **Database:** MongoDB (motor async driver)
- **External APIs:** CP API (Imigrasi), Telegram Bot

## Database Schema
- `users`: {username, password_hash, role, is_admin}
- `simple_query_cache`: {cache_key, query_type, raw_response, passports, crossings}
- `nongeoint_searches`: {id, name, created_by, status, results, niks_found, nik_photos}
- `nik_investigations`: {id, search_id, niks, status, results}

## API Endpoints
- `POST /api/auth/login` - User authentication
- `POST /api/simple-query` - Simple queries (perlintasan, passport, NIK, etc.)
- `GET /api/nongeoint/searches` - List Full Query history
- `GET /api/nongeoint/search/{id}` - Get specific Full Query with investigation
- `POST /api/nongeoint/search/investigate` - Start investigation

---

## Completed Work (Dec 2025)

### Fix: Full Reset Target (All Cache Clear)
**Date:** 2025-12-09
**Issue:** Reset target tidak menghapus semua cache (OSINT, SNA, dll)
**Fix:**
- Endpoint DELETE sekarang menghapus: NIK, NKK, REGNIK, Passport, Perlintasan, OSINT, SNA
- Data dihapus untuk SEMUA akun (global)
- Frontend konfirmasi diperjelas

### Fix: Perlintasan Multiple Passports Bug
**Date:** 2025-12-09
**Issue:** Data perlintasan tidak muncul untuk target dengan multiple passports
**Root Cause:** Cache passport tidak menyimpan `passports` array
**Fix:**
1. Cache sekarang menyimpan `passports` array
2. Pembacaan cache prioritas array, fallback ke regex parsing
3. Enhanced logging untuk debugging

### Previous Fixes (from handoff):
- UI status icons for completed investigations
- Backend parsing of cached NIK/NKK data
- Perlintasan data fetching for multiple passports (caching logic)
- Race condition lock for investigations
- Admin permission for viewing all data
- ADINT mockup in Simple Query

---

## Known Issues

### P0 - Critical
1. **Full Query Admin View Inconsistency** (TESTING NEEDED)
   - Admin melihat layar seleksi NIK untuk investigasi user lain yang sudah selesai
   - Logic di `getCurrentStep()` sudah diperbaiki, perlu testing

### P1 - Important
2. **NoneType Error in Simple Query** (VPS-specific)
   - Error `'NoneType' object has no attribute 'get'` untuk Perlintasan/Passport
   - Safety checks sudah ditambahkan, monitoring diperlukan

### Blocked
3. **TikTok Scraper**
   - Blocked oleh anti-bot measures TikTok
   - Butuh residential proxies untuk solusi

---

## Pending Tasks

### P0 - High Priority
1. **Global Busy/Idle Status Lock**
   - Extend lock system ke Full Query investigations
   - Saat Full Query berjalan, block semua query dari user lain

### P1 - Medium Priority
2. **ADINT API Integration**
   - Menunggu API credentials dari provider (Veraset, etc.)
   - Mockup sudah ada di Simple Query

### P2 - Low Priority
3. **TikTok Scraper Resolution**
   - Evaluate residential proxy solutions
   - Or remove feature if not feasible

---

## Credentials
- Admin: `admin` / `Paparoni290483#`
- CP API configured via backend/.env

## VPS Deployment Notes
After deploying new code:
```bash
python3 /app/scripts/clear_passport_cache.py
```
This clears old cache entries without passports array.
