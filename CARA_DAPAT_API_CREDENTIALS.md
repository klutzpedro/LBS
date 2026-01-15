# 🔑 CARA MENDAPATKAN TELEGRAM API CREDENTIALS

## ⚠️ PENTING!

**User ID ≠ API ID**

Yang Anda berikan sebelumnya:
- User ID: 35564970 ← Ini BUKAN API ID
- API Hash: d484d8fe3d2f4025f99101caeb070e1a ← Perlu diverifikasi

**Anda perlu mendapatkan API ID dan API Hash yang BENAR dari Telegram.**

---

## 📋 LANGKAH-LANGKAH MENDAPATKAN API CREDENTIALS

### **Step 1: Buka Telegram Developer Portal**

🔗 **Link:** https://my.telegram.org

### **Step 2: Login dengan Nomor Telepon**

1. Masukkan nomor telepon Anda (yang terdaftar untuk @dwijayanto)
2. Format: `+62xxx` (dengan kode negara)
3. Click **"Next"**

### **Step 3: Masukkan Kode Verifikasi**

1. Telegram akan kirim kode ke app Anda
2. Buka Telegram app
3. Salin kode yang diterima
4. Paste di website
5. Click **"Sign In"**

### **Step 4: Buka API Development Tools**

Setelah login, Anda akan melihat menu:
- Click **"API development tools"**

### **Step 5: Create Application**

**Jika belum pernah buat app:**

1. Anda akan diminta isi form:
   - **App title:** `WASKITA LBS` (atau nama apapun)
   - **Short name:** `waskita` (atau pendek lainnya)
   - **Platform:** Pilih **"Other"**
   - **Description:** (opsional) `Location tracking system`

2. Click **"Create application"**

**Jika sudah pernah buat app:**
- Anda akan langsung lihat list aplikasi Anda
- Pilih salah satu atau buat baru

### **Step 6: Salin API ID dan API Hash**

Setelah create/pilih app, Anda akan lihat:

```
App configuration
─────────────────────────────────
App api_id:       12345678        ← INI API ID YANG BENAR
App api_hash:     abcdef1234567890abcdef1234567890  ← INI API HASH YANG BENAR
```

**⚠️ PENTING:**
- **API ID** adalah angka (contoh: 12345678)
- **API Hash** adalah string 32 karakter (contoh: abcdef1234567890...)
- **JANGAN dikasih tahu siapapun** - ini credentials sensitif

### **Step 7: Salin ke Text File**

Copy dan save di notepad:
```
API ID: 12345678
API Hash: abcdef1234567890abcdef1234567890
Phone: +628123456789
```

---

## 🔄 UPDATE CREDENTIALS DI APLIKASI

Setelah dapat API ID dan API Hash yang benar:

### **Cara 1: Via Web Interface (RECOMMENDED)**

Saya akan buat halaman Settings untuk update credentials ini.

### **Cara 2: Via Environment File (Manual)**

Update file `/app/backend/.env`:

```bash
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=abcdef1234567890abcdef1234567890
```

**Kemudian restart backend:**
```bash
sudo supervisorctl restart backend
```

---

## 📸 SCREENSHOT PANDUAN

Berikut tampilan website my.telegram.org:

1. **Login page:** Input phone number
2. **Verification:** Input code dari Telegram
3. **API Tools:** Menu "API development tools"
4. **App Create:** Form untuk create app
5. **Credentials:** Page dengan api_id dan api_hash

---

## ✅ VERIFIKASI CREDENTIALS BENAR

Setelah update, test dengan:

```bash
cd /app/backend
python3 -c "
from telethon import TelegramClient
import asyncio

async def test():
    client = TelegramClient('test_session', API_ID_BARU, 'API_HASH_BARU')
    try:
        await client.connect()
        print('✓ Credentials VALID!')
    except Exception as e:
        print(f'✗ Error: {e}')
    finally:
        await client.disconnect()

asyncio.run(test())
"
```

---

## 🆘 TROUBLESHOOTING

### "Invalid API credentials"
- Cek ulang di my.telegram.org
- Pastikan copy lengkap (32 karakter untuk hash)
- Tidak ada spasi atau karakter tambahan

### "Cannot find API development tools"
- Pastikan sudah login di my.telegram.org
- Scroll down untuk cari menu
- Try different browser jika tidak muncul

### "App already exists"
- Tidak masalah, pakai yang sudah ada
- Click app untuk lihat credentials

---

## 📝 NEXT STEPS

Setelah dapat credentials yang benar:

1. ✅ Share API ID dan API Hash ke saya
2. ✅ Saya akan update di aplikasi
3. ✅ Restart backend
4. ✅ Test lagi Telegram setup di web
5. ✅ Sukses! Bot automation aktif

---

**Mohon akses https://my.telegram.org dan dapatkan API ID & API Hash yang benar, lalu share ke saya untuk saya update di aplikasi.**
