# 🔧 TROUBLESHOOTING - API Credentials Invalid

## ❌ ERROR: "The api_id/api_hash combination is invalid"

**Penyebab:**
1. API credentials tidak valid atau berubah
2. API ID/Hash salah
3. App di-revoke dari my.telegram.org
4. Account issue

---

## ✅ SOLUSI - DAPATKAN CREDENTIALS BARU

### **Step 1: Akses Telegram Developer Portal**

🔗 **https://my.telegram.org**

### **Step 2: Login**
1. Masukkan phone number Anda (untuk @dwijayanto)
2. Input kode verifikasi dari Telegram app

### **Step 3: API Development Tools**
1. Click menu **"API development tools"**
2. Anda akan lihat list aplikasi atau form create app

### **Step 4: Cek Existing App ATAU Create New**

**Jika sudah ada app:**
- Click app yang sudah ada
- Lihat **api_id** dan **api_hash**
- Salin keduanya

**Jika belum ada atau ingin create baru:**
- Fill form:
  - App title: `WASKITA LBS`
  - Short name: `waskita`
  - Platform: `Other`
- Submit
- Salin **api_id** dan **api_hash** yang muncul

### **Step 5: Update di Settings**

**Via Web (WASKITA LBS):**
1. Login ke aplikasi
2. Go to **Settings** (icon ⚙️)
3. Scroll ke section "API CREDENTIALS"
4. Input **API ID** (angka, contoh: 12345678)
5. Input **API Hash** (32 karakter string)
6. Click **"SAVE CREDENTIALS"**

**Via File (Manual):**
```bash
# Edit /app/backend/.env
nano /app/backend/.env

# Update baris:
TELEGRAM_API_ID=NEW_API_ID_HERE
TELEGRAM_API_HASH=NEW_API_HASH_HERE

# Save (Ctrl+O, Enter, Ctrl+X)

# Restart backend
sudo supervisorctl restart backend
```

### **Step 6: Reset Connection**
1. Settings → Click **"Reset Connection"** (red button)
2. Confirm
3. Session lama dihapus

### **Step 7: Setup Telegram Lagi**
1. Settings → Telegram Setup section
2. Input phone number
3. Input kode verifikasi
4. Success! ✓

---

## 🔍 VERIFY CREDENTIALS

**Test API ID & Hash:**

```bash
cd /app/backend
python3 << 'EOF'
from telethon import TelegramClient
import asyncio

API_ID = 37983970  # ← Your API ID
API_HASH = "d484d8fe3d2f4025f99101caeb070e1a"  # ← Your API Hash

async def test():
    client = TelegramClient('test_session', API_ID, API_HASH)
    try:
        await client.connect()
        print("✓ Credentials VALID!")
        print("  API ID dan Hash benar")
    except Exception as e:
        print(f"✗ Error: {e}")
        if "api_id" in str(e).lower():
            print("\n  → API ID/Hash INVALID")
            print("  → Dapatkan credentials baru dari my.telegram.org")
    finally:
        await client.disconnect()
        # Clean up test session
        import os
        if os.path.exists('test_session.session'):
            os.remove('test_session.session')

asyncio.run(test())
EOF
```

**Output:**
- ✓ Credentials VALID → Lanjut setup
- ✗ INVALID → Dapatkan credentials baru

---

## 📸 SCREENSHOT REFERENSI

**my.telegram.org setelah login:**

```
App configuration
─────────────────────────────────
App api_id:       12345678        ← SALIN INI
App api_hash:     abc123...       ← SALIN INI (32 char)
```

**⚠️ PENTING:**
- api_id = ANGKA (contoh: 37983970)
- api_hash = STRING 32 karakter
- Keduanya HARUS dari my.telegram.org
- User ID ≠ API ID

---

## 🆘 JIKA TETAP ERROR

### **Kemungkinan 1: Account Issue**
- Login ke Telegram app
- Check apakah account normal
- Tidak ada restriction/ban

### **Kemungkinan 2: App Deleted**
- App di my.telegram.org mungkin dihapus
- Create app baru
- Dapatkan credentials baru

### **Kemungkinan 3: Rate Limit**
- Terlalu banyak request
- Tunggu 24 jam
- Try lagi

---

## 📝 QUICK FIX STEPS

**Paling cepat:**

1. **Screenshot my.telegram.org** (bagian API credentials)
2. **Share ke saya** API ID dan Hash yang benar
3. **Saya update** di aplikasi
4. **Restart backend**
5. **Test lagi**

Atau

1. **Settings page** di aplikasi
2. **Update credentials** via form
3. **Restart backend** (via terminal atau saya)
4. **Reset connection**
5. **Setup ulang**

---

**API credentials error bisa diselesaikan dengan dapatkan credentials fresh dari my.telegram.org. Silakan akses https://my.telegram.org dan share screenshot API credentials yang muncul. 🔑**
