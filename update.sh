#!/bin/bash

# ============================================
# WASKITA LBS - Update Script
# Jalankan: chmod +x update.sh && ./update.sh
# ============================================

echo "=========================================="
echo "   WASKITA LBS - UPDATE SCRIPT"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Change to project directory
cd /var/www/waskita-lbs || { echo -e "${RED}ERROR: Folder /var/www/waskita-lbs tidak ditemukan!${NC}"; exit 1; }

echo -e "${YELLOW}[1/5]${NC} Membersihkan perubahan lokal..."
git checkout -- .

echo -e "${YELLOW}[2/5]${NC} Mengambil update dari GitHub..."
git pull origin main
if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR: Gagal pull dari GitHub. Periksa koneksi internet.${NC}"
    exit 1
fi

echo -e "${YELLOW}[3/5]${NC} Menginstall dependencies frontend..."
cd frontend
npm install --legacy-peer-deps

echo -e "${YELLOW}[4/5]${NC} Build frontend (ini butuh waktu ~1-2 menit)..."
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR: Build frontend gagal!${NC}"
    exit 1
fi

echo -e "${YELLOW}[5/5]${NC} Restart backend service..."
cd ..
pm2 restart waskita-backend

echo ""
echo -e "${GREEN}=========================================="
echo "   UPDATE SELESAI!"
echo "==========================================${NC}"
echo ""
echo "Langkah selanjutnya:"
echo "1. Buka browser dan HARD REFRESH (Ctrl+Shift+R)"
echo "2. Atau buka tab Incognito/Private"
echo ""
pm2 status
