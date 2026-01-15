# 🚀 CARA LOGIN KE TELEGRAM & AKTIVASI BOT

## ⚠️ PENTING: Setup Pertama Kali

Untuk menggunakan fitur Telegram bot automation, Anda **HARUS** login dulu ke akun Telegram @dwijayanto.

---

## 📋 LANGKAH-LANGKAH LOGIN

### **Metode 1: Via Script Python (RECOMMENDED)**

#### Step 1: Buka Terminal
```bash
cd /app/backend
python3 init_telegram.py
```

#### Step 2: Ikuti Instruksi di Layar

Script akan:
1. **Mengirim kode verifikasi** ke phone number Anda (+6285156832909)
2. **Menunggu input kode** dari Anda

#### Step 3: Buka Telegram App
- Buka Telegram di HP atau Desktop
- Cek pesan dari "Telegram" (official account)
- Salin kode 5 digit yang diterima

#### Step 4: Masukkan Kode
```
Masukkan kode verifikasi (5 digit): 12345
```

#### Step 5: (Opsional) 2FA Password
Jika akun Telegram Anda menggunakan 2FA:
```
Masukkan 2FA password: ********
```

#### Step 6: Verifikasi Success
Script akan menampilkan:
```
============================================================
  LOGIN INFORMATION
============================================================
Name      : Dwi Jayanto
Username  : @dwijayanto
Phone     : +6285156832909
User ID   : 35564970
============================================================

✓ SETUP SELESAI!
```

---

### **Metode 2: Via Helper Script**

```bash
cd /app/backend
./telegram_helper.sh init
```

Kemudian ikuti instruksi yang sama seperti Metode 1.

---

## 🔍 VERIFIKASI SESSION SUDAH AKTIF

### Check 1: Session File
```bash
ls -la /app/backend/northarch_session.session
```

**Expected:** File exists dengan size > 0 bytes

### Check 2: System Status
```bash
cd /app/backend
./telegram_helper.sh status
```

**Expected:**
```
=== Telegram Session ===
✓ Session file found: /app/backend/northarch_session.session
```

### Check 3: Backend Logs
```bash
tail -50 /var/log/supervisor/backend.out.log | grep -i telegram
```

**Expected:** Tidak ada error Telegram

---

## 🧪 TEST BOT COMMUNICATION

Setelah login sukses, test komunikasi dengan bot:

```bash
cd /app/backend
python3 test_bot.py 628123456789
```

**Script ini akan:**
1. ✅ Login dengan session yang sudah dibuat (TIDAK perlu input lagi)
2. ✅ Kirim phone number ke @northarch_bot
3. ✅ Tunggu response dari bot
4. ✅ Deteksi dan click button "CP" otomatis
5. ✅ Parse koordinat dari response
6. ✅ Display hasil

**Expected Output:**
```
[1/6] Connecting to Telegram...
✓ Connected
✓ Logged in as: Dwi Jayanto (@dwijayanto)

[2/6] Sending phone number to @northarch_bot...
✓ Sent: 628123456789

[3/6] Waiting for bot response (3 seconds)...

[4/6] Retrieving bot messages...
✓ Retrieved 10 messages

[5/6] Looking for 'CP' button...
  ✓ Found 'CP' button! Clicking...
  ✓ Button clicked

[6/6] Waiting for location response (4 seconds)...
  ✓ COORDINATES FOUND!

============================================================
✓ BOT COMMUNICATION TEST SUCCESSFUL!
============================================================
```

---

## 🔄 RESTART BACKEND AFTER LOGIN

Setelah session dibuat, **WAJIB restart backend**:

```bash
sudo supervisorctl restart backend
```

Atau via helper:
```bash
cd /app/backend
./telegram_helper.sh restart
```

---

## 🌐 TEST DI APPLICATION

1. **Buka browser:** http://localhost:3000

2. **Login:**
   - Username: `admin`
   - Password: `Paparoni83`

3. **Buat Case baru** (jika belum ada):
   - Menu: Cases
   - Click "NEW CASE"
   - Isi nama case
   - Submit

4. **Query Target:**
   - Menu: Target Query
   - Select case
   - Input phone: `628123456789` (atau nomor lain)
   - Click "START QUERY"

5. **Monitor Status Feed:**
   - Status akan berubah setiap 2 detik:
     - pending
     - connecting ← Menghubungi Telegram
     - querying ← Mengirim nomor ke bot
     - processing ← Bot memproses
     - parsing ← Extract koordinat
     - completed ← SELESAI!

6. **Lihat Hasil:**
   - Status Feed: Nama, alamat, koordinat
   - Map View: Marker di peta
   - History: Record tersimpan

---

## ❌ TROUBLESHOOTING

### Problem: "Session file not found"
**Solution:**
```bash
cd /app/backend
python3 init_telegram.py
```
Ikuti instruksi login.

---

### Problem: "User not authorized"
**Solution:**
```bash
# Delete old session
rm /app/backend/northarch_session.session*

# Create new session
python3 init_telegram.py
```

---

### Problem: "Invalid code" atau "Code expired"
**Solution:**
- Kode hanya valid 5 menit
- Request kode baru dengan run `init_telegram.py` lagi
- Pastikan input kode dengan cepat

---

### Problem: "Bot tidak merespons"
**Solution:**
1. Pastikan sudah start chat dengan @northarch_bot di Telegram app
2. Send pesan manual ke bot dulu: `/start`
3. Verify bot masih aktif

---

### Problem: "CP button not found"
**Solution:**
1. Check format response bot dengan test_bot.py
2. Lihat available buttons di output
3. Jika button text berbeda, update di `server.py`:
   ```python
   if button.text and 'NAMA_BUTTON_YANG_BENAR' in button.text.upper():
   ```

---

### Problem: "Could not parse location"
**Debug:**
```bash
# Run test bot dan lihat raw response
python3 test_bot.py 628123456789

# Check format response di output
# Adjust regex di server.py jika perlu
```

**Alternative:** Lihat raw message:
```bash
cd /app/backend
python3 -c "
from telethon import TelegramClient
import asyncio

async def check():
    client = TelegramClient('northarch_session', 35564970, 'd484d8fe3d2f4025f99101caeb070e1a')
    await client.start()
    
    # Get all recent messages
    messages = await client.get_messages('@northarch_bot', limit=20)
    
    print('=== RECENT MESSAGES FROM BOT ===')
    for idx, msg in enumerate(messages):
        print(f'\n[{idx+1}] {msg.date}')
        print(f'Text: {msg.text if msg.text else \"No text\"}')
        if msg.buttons:
            print(f'Buttons: {[btn.text for row in msg.buttons for btn in row]}')
        if hasattr(msg, 'geo') and msg.geo:
            print(f'Geo: lat={msg.geo.lat}, long={msg.geo.long}')
    
    await client.disconnect()

asyncio.run(check())
"
```

---

## 📱 INFORMASI AKUN TELEGRAM

**Akun yang digunakan untuk login:**
- Username: @dwijayanto
- User ID: 35564970
- Phone: +6285156832909 (sesuaikan dengan nomor actual Anda)

**Bot target:**
- Username: @northarch_bot
- Owner: @dwijayanto

**Credential:**
- API ID: 35564970
- API Hash: d484d8fe3d2f4025f99101caeb070e1a

---

## 🎯 QUICK START (TL;DR)

```bash
# 1. Login ke Telegram
cd /app/backend
python3 init_telegram.py
# Input phone number saat diminta
# Input verification code dari Telegram app
# (Optional) Input 2FA password

# 2. Restart backend
sudo supervisorctl restart backend

# 3. Test bot
python3 test_bot.py 628123456789

# 4. Test di application
# Buka http://localhost:3000
# Login → Target Query → Input phone → START QUERY
```

---

## ✅ SUCCESS INDICATORS

**Session Created:**
```bash
$ ls -la /app/backend/northarch_session.session
-rw-r--r-- 1 root root 5120 Jan 15 05:30 northarch_session.session
```

**Test Bot Success:**
```
✓ BOT COMMUNICATION TEST SUCCESSFUL!
```

**Application Query Success:**
- Status berubah dari pending → completed
- Location data ditampilkan di Status Feed
- Marker muncul di Map View
- Record tersimpan di History

---

## 📞 NEED HELP?

Jika masih mengalami masalah setelah mengikuti panduan ini:

1. **Check logs:**
   ```bash
   ./telegram_helper.sh logs
   ```

2. **View status:**
   ```bash
   ./telegram_helper.sh status
   ```

3. **Reset dan coba lagi:**
   ```bash
   ./telegram_helper.sh reset
   ./telegram_helper.sh init
   ```

4. **Manual debugging:**
   - Pastikan Telegram app bisa diakses
   - Verify @northarch_bot masih aktif
   - Test manual interaction di Telegram app dulu

---

**Selamat mencoba! Setelah login sukses, aplikasi akan bisa otomatis remote bot untuk setiap query. 🚀**
