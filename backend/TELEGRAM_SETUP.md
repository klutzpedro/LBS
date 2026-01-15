# WASKITA LBS - Telegram Bot Integration Setup Guide

## Overview
WASKITA LBS menggunakan Telethon untuk mengotomasi komunikasi dengan Telegram bot (@northarch_bot) untuk mendapatkan data lokasi dari nomor telepon.

## Prerequisites
- Telegram account dengan akses ke @dwijayanto
- Phone number yang terdaftar di Telegram
- API ID: 35564970
- API Hash: d484d8fe3d2f4025f99101caeb070e1a
- Target Bot: @northarch_bot

## Setup Steps

### Step 1: Initialize Telegram Session (First Time Only)

Jalankan script inisialisasi:

```bash
cd /app/backend
python3 init_telegram.py
```

**Yang akan terjadi:**
1. Script akan connect ke Telegram
2. Jika belum authorized, akan diminta input:
   - Phone number (format: +62xxx)
   - Verification code (dikirim via Telegram app)
   - (Optional) 2FA password jika enabled
3. Setelah sukses, session file akan dibuat: `northarch_session.session`
4. Script akan test koneksi ke @northarch_bot

**Expected Output:**
```
============================================================
WASKITA LBS - Telegram Session Initialization
============================================================

[1/4] Connecting to Telegram...
[2/4] User not authorized. Starting phone verification...

Please enter your phone (or bot token): +628123456789
Please enter the code you received: 12345

[3/4] Logged in as:
  - Name: Your Name
  - Username: @dwijayanto
  - Phone: +628123456789
  - User ID: 35564970

[4/4] Testing connection to @northarch_bot...
✓ Successfully sent test message to @northarch_bot
✓ Retrieved 5 recent messages from bot

============================================================
✓ Telegram session initialized successfully!
============================================================
```

### Step 2: Test Bot Communication

Setelah session aktif, test komunikasi dengan bot:

```bash
cd /app/backend
python3 test_bot.py 628123456789
```

**Script ini akan:**
1. Connect menggunakan session yang sudah dibuat
2. Kirim nomor telepon ke @northarch_bot
3. Tunggu response dari bot
4. Cari dan click button "CP" otomatis
5. Parse response untuk extract koordinat
6. Tampilkan hasil parsing

**Expected Output:**
```
============================================================
WASKITA LBS - Bot Communication Test
============================================================

[1/6] Connecting to Telegram...
✓ Connected
✓ Logged in as: Your Name (@dwijayanto)

[2/6] Sending phone number to @northarch_bot...
✓ Sent: 628123456789

[3/6] Waiting for bot response (3 seconds)...

[4/6] Retrieving bot messages...
✓ Retrieved 10 messages

[5/6] Looking for 'CP' button...

  Message with buttons found:
  Text preview: Please select an option...
  Button rows: 1

  Row 1:
    Button 1: 'CP'
    Button 2: 'Cancel'

  ✓ Found 'CP' button! Clicking...
  ✓ Button clicked

[6/6] Waiting for location response (4 seconds)...

  Retrieving response messages...

  Parsing messages for location data...

  Message 1:
  ✓ COORDINATES FOUND IN TEXT!
    Latitude: -6.2088
    Longitude: 106.8456

============================================================
✓ BOT COMMUNICATION TEST SUCCESSFUL!
  The bot is responding correctly with location data.
============================================================
```

### Step 3: Verify in Application

1. Login ke aplikasi: http://localhost:3000
   - Username: admin
   - Password: Paparoni83

2. Navigate ke **Target Query**

3. Buat test query:
   - Pilih case
   - Input phone number (format: 62xxx)
   - Click "START QUERY"

4. Monitor status feed:
   - pending → connecting → querying → processing → parsing → completed

5. Check hasil di:
   - Status Feed (di Target Query page)
   - Map View (lokasi akan muncul sebagai marker)
   - History (list semua query)

## Troubleshooting

### Issue 1: "Session file not found"
**Solution:** Run `init_telegram.py` terlebih dahulu

### Issue 2: "User not authorized"
**Solution:** 
- Delete session file: `rm /app/backend/northarch_session.session*`
- Run `init_telegram.py` lagi
- Pastikan input phone dan code dengan benar

### Issue 3: "Could not find 'CP' button"
**Possible causes:**
- Bot belum respond
- Format response bot berbeda
- Button text bukan "CP"

**Debug steps:**
```bash
# Check available buttons
python3 -c "
from telethon import TelegramClient
import asyncio

async def check():
    client = TelegramClient('/app/backend/northarch_session', 35564970, 'd484d8fe3d2f4025f99101caeb070e1a')
    await client.start()
    messages = await client.get_messages('@northarch_bot', limit=5)
    for msg in messages:
        if msg.buttons:
            print('Buttons found:')
            for row in msg.buttons:
                for btn in row:
                    print(f'  - {btn.text}')
    await client.disconnect()

asyncio.run(check())
"
```

### Issue 4: "Could not parse location"
**Possible causes:**
- Response format berbeda dari expected
- Tidak ada koordinat dalam response
- Bot error

**Solution:** 
1. Check raw bot response di logs:
   ```bash
   tail -f /var/log/supervisor/backend.out.log
   ```

2. Adjust regex pattern di `server.py` function `query_telegram_bot`:
   ```python
   # Current pattern:
   lat_match = re.search(r'(?:lat|latitude)[:\s]*(-?\d+\.?\d*)', text, re.IGNORECASE)
   
   # Try alternative patterns based on bot response format
   ```

### Issue 5: Backend using mock data instead of real bot
**Check:**
1. Session file exists: `ls -la /app/backend/northarch_session.session*`
2. Backend logs untuk Telegram errors:
   ```bash
   tail -50 /var/log/supervisor/backend.err.log | grep -i telegram
   ```

## Configuration

### Environment Variables
File: `/app/backend/.env`

```bash
TELEGRAM_API_ID=35564970
TELEGRAM_API_HASH=d484d8fe3d2f4025f99101caeb070e1a
```

### Bot Settings
File: `/app/backend/server.py`

```python
BOT_USERNAME = '@northarch_bot'  # Target bot
```

## Security Notes

1. **Session File Security**
   - File `northarch_session.session` berisi auth token
   - Jangan share atau commit ke git
   - Backup secara secure

2. **API Credentials**
   - API_ID dan API_HASH adalah sensitive
   - Sudah di .env (not committed to git)

3. **Rate Limiting**
   - Telegram has rate limits
   - Avoid rapid successive queries
   - Current implementation: 2-3 second delays between operations

## Advanced Usage

### Manual Bot Interaction

Untuk test manual via Python shell:

```python
from telethon import TelegramClient
import asyncio

async def manual_test():
    client = TelegramClient('/app/backend/northarch_session', 35564970, 'd484d8fe3d2f4025f99101caeb070e1a')
    await client.start()
    
    # Send message
    await client.send_message('@northarch_bot', '628123456789')
    
    # Get response
    await asyncio.sleep(3)
    messages = await client.get_messages('@northarch_bot', limit=5)
    
    # Print messages
    for msg in messages:
        print(f"Text: {msg.text}")
        if msg.buttons:
            print("Buttons:", [btn.text for row in msg.buttons for btn in row])
    
    await client.disconnect()

asyncio.run(manual_test())
```

### Customize Parsing

Edit `/app/backend/server.py`, function `query_telegram_bot()`:

```python
# Add custom parsing logic
if "custom_pattern" in text:
    # Extract data based on your bot's format
    pass
```

## Monitoring

### Check Backend Logs
```bash
# Real-time logs
tail -f /var/log/supervisor/backend.out.log

# Error logs
tail -f /var/log/supervisor/backend.err.log

# Search for Telegram activity
grep -i "telegram\|bot\|telethon" /var/log/supervisor/backend.out.log
```

### Check Active Sessions
```bash
# List session files
ls -la /app/backend/*.session*

# Check session age
stat /app/backend/northarch_session.session
```

## Support

Jika mengalami masalah:

1. Check logs di `/var/log/supervisor/backend.*.log`
2. Run test scripts (`init_telegram.py`, `test_bot.py`)
3. Verify Telegram app masih login
4. Check internet connection
5. Verify bot masih aktif dan responsive

## Next Steps

Setelah setup berhasil:

1. ✅ Test dengan real phone numbers
2. ✅ Monitor success rate di Dashboard
3. ✅ Setup Scheduling untuk auto-tracking
4. ✅ Adjust parsing jika format bot response berubah
5. ✅ Implement error notifications (email/webhook)
