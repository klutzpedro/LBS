# 🎯 PANDUAN LENGKAP - WASKITA LBS

## 📱 AKSES APLIKASI

**URL:** http://localhost:3000 (atau URL deployment Anda)

**Login Credentials:**
- Username: `admin`
- Password: `Paparoni83`

---

## 🚀 FIRST TIME SETUP (TELEGRAM)

### **Langkah Mudah - Via Web Interface**

1. **Login ke aplikasi** dengan credentials di atas

2. **Anda akan melihat banner kuning** di atas dashboard:
   ```
   ⚠️ Telegram belum terhubung
   Login ke Telegram untuk mengaktifkan bot automation
   [Setup Telegram] ← Click tombol ini
   ```

3. **Click tombol "Setup Telegram"** atau navigate ke menu Telegram Setup

4. **Di halaman Telegram Setup:**
   
   **Step 1: Input Phone Number**
   - Masukkan nomor HP untuk akun @dwijayanto
   - Format: `+628123456789` (dengan +62)
   - Click **"KIRIM KODE"**
   
   **Step 2: Check Telegram App**
   - Buka Telegram di HP atau Desktop Anda
   - Cek pesan dari "Telegram" (official account)
   - Salin kode verifikasi 5 digit
   
   **Step 3: Input Verification Code**
   - Masukkan kode 5 digit di form
   - Click **"VERIFY"**
   
   **Step 4: (Jika ada 2FA)**
   - Jika akun pakai 2FA, akan muncul field password
   - Masukkan 2FA password
   - Click **"VERIFY"** lagi
   
   **Step 5: Success!**
   - Akan muncul checkmark hijau
   - Info akun Telegram ditampilkan
   - Status: "Bot automation siap digunakan"
   - Click **"MULAI QUERY TARGET"**

5. **Banner kuning akan hilang** setelah login berhasil

6. **Sekarang siap digunakan!** Query target akan otomatis remote @northarch_bot

---

## 📋 CARA MENGGUNAKAN APLIKASI

### **1. Create Case (Investigasi)**

- Menu: **Cases**
- Click **"NEW CASE"**
- Isi:
  - Case Name: `Investigasi 001`
  - Description: `Tracking target ABC`
- Click **"CREATE CASE"**

### **2. Query Target (Cari Lokasi)**

- Menu: **Target Query**
- **Select Case:** Pilih case yang sudah dibuat
- **Phone Number:** Input nomor target (contoh: `628123456789`)
- Click **"START QUERY"**

**Status Feed akan menampilkan progress:**
```
⏳ Menunggu proses...
🔄 Menghubungi bot Telegram...
📤 Mengirim nomor telepon...
⚙️ Bot sedang memproses...
🔍 Mengekstrak data lokasi...
✅ Lokasi berhasil ditemukan
```

**Hasil akan tampil:**
- Nama target
- Alamat
- Koordinat (Latitude, Longitude)

### **3. View di Map**

- Menu: **Map View**
- Peta akan menampilkan semua target yang sudah di-query
- **Features:**
  - 🗺️ **Map Type:** Switch antara Dark/Street/Satellite/Terrain
  - 🔍 **Maximize:** Fullscreen map
  - 📍 **Markers:** Click marker untuk detail
  - 🎯 **Popup:** Info lengkap target

**Cara ganti jenis peta:**
1. Lihat pojok kanan atas peta
2. Click dropdown "MAP TYPE"
3. Pilih: Dark / Street / Satellite / Terrain

**Cara maximize peta:**
1. Click icon maximize (⛶) di pojok kanan atas
2. Peta akan fullscreen
3. Click minimize (⊟) untuk kembali normal

### **4. Scheduling (Auto Tracking)**

- Menu: **Scheduling**
- Click **"NEW SCHEDULE"**
- Isi:
  - **Case:** Pilih case
  - **Phone Number:** Nomor target
  - **Interval Type:** Per Menit / Per Jam / Per Hari / Per Minggu / Per Bulan
  - **Interval Value:** Angka (misal: 5 untuk setiap 5 jam)
- Click **"CREATE SCHEDULE"**

**Schedule akan jalan otomatis:**
- Status: Active (hijau) atau Paused (abu-abu)
- Next Run: Kapan query berikutnya
- Controls: Pause/Resume, Delete

### **5. History (Riwayat)**

- Menu: **History**
- Melihat semua query yang pernah dilakukan
- **Features:**
  - 🔍 Search: Cari by phone atau nama
  - 🎯 Filter Status: All / Completed / Pending / Error
  - 📁 Filter Case: Pilih case tertentu
  - 🗺️ **View Map:** Click tombol untuk lihat lokasi di peta

**Cara view map dari history:**
1. Cari target dengan status "completed"
2. Click tombol **"View Map"** di kolom Actions
3. Dialog popup akan muncul dengan peta interaktif
4. Marker menunjukkan lokasi terakhir

---

## ✅ FITUR-FITUR APLIKASI

### **Dashboard**
- Total Cases, Active Cases
- Total Targets, Success Rate
- Recent Targets dengan status

### **Case Management**
- Create, view, manage cases
- Track jumlah targets per case
- Status active/archived

### **Target Query**
- Input phone number (format: 62xxx)
- Real-time status updates
- Automatic bot communication
- Location data extraction

### **Map View**
- Interactive map dengan Leaflet.js
- 4 map types: Dark, Street, Satellite, Terrain
- Custom markers dengan popup info
- Maximize/fullscreen mode

### **Scheduling**
- Auto tracking dengan interval custom
- Per menit, jam, hari, minggu, bulan
- Pause/Resume schedule
- Next run timestamp

### **History**
- Complete query history
- Search & filter functionality
- View map dari individual target
- Export-ready data table

---

## 🎨 UI FEATURES

✅ Dark cyber tactical theme
✅ Cyan accent colors (#00D9FF)
✅ Professional fonts (Barlow Condensed, Rajdhani)
✅ Responsive design
✅ Real-time status updates
✅ Toast notifications
✅ Smooth animations

---

## ⚡ QUICK TIPS

**Telegram Setup:**
- Hanya perlu dilakukan **SEKALI**
- Setelah login, session tersimpan
- Tidak perlu login ulang setiap kali

**Query Tips:**
- Nomor harus format: `62XXXXXXXXXX`
- Minimal 10 digit setelah 62
- Bot akan otomatis di-remote

**Map Tips:**
- Dark theme cocok untuk tactical monitoring
- Satellite view untuk lihat area real
- Street view untuk navigasi detail
- Terrain view untuk topografi

**Scheduling Tips:**
- Gunakan untuk auto-tracking target penting
- Set interval sesuai kebutuhan
- Pause schedule jika tidak diperlukan sementara

---

## ❓ TROUBLESHOOTING

### "Telegram belum terhubung" tetap muncul
**Solution:**
1. Pastikan sudah complete setup di /telegram-setup
2. Refresh browser (Ctrl+R atau Cmd+R)
3. Logout dan login ulang

### "Query gagal" atau error
**Check:**
1. Telegram sudah setup? (banner tidak muncul)
2. Nomor format benar? (62xxx, 10-13 digit)
3. @northarch_bot masih aktif?
4. Internet connection stable?

### Map tidak muncul / blank
**Solution:**
1. Tunggu beberapa detik (map loading)
2. Pastikan ada target dengan status "completed"
3. Refresh page
4. Check browser console untuk errors

### Kode verifikasi tidak diterima
**Solution:**
1. Pastikan nomor HP benar
2. Check Telegram app (mungkin ada di archived chats)
3. Request kode lagi (kembali ke step 1)
4. Kode valid 5 menit saja

---

## 📞 SUPPORT

Jika masih ada masalah:

1. **Check browser console** (F12 → Console tab)
2. **Screenshot error** dan simpan
3. **Note down:** Apa yang dilakukan sebelum error

---

## 🎯 SUMMARY

**Your WASKITA LBS is ready!**

✅ Login dengan admin/Paparoni83
✅ Setup Telegram via web interface (sekali saja)
✅ Query target dengan input phone number
✅ View locations di interactive map
✅ Schedule auto-tracking
✅ Monitor history lengkap

**No terminal access needed! Semua via web interface. 🚀**

---

**Selamat menggunakan WASKITA LBS!**
