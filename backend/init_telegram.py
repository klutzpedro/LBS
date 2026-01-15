#!/usr/bin/env python3
"""
Interactive script untuk login ke Telegram dengan akun @dwijayanto.
Script ini akan meminta phone number dan verification code secara manual.
"""

from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

API_ID = int(os.getenv('TELEGRAM_API_ID', '37983970'))
API_HASH = os.getenv('TELEGRAM_API_HASH', 'd484d8fe3d2f4025f99101caeb070e1a')
PHONE = '+6285156832909'  # Phone untuk @dwijayanto
BOT_USERNAME = '@northarch_bot'

def main():
    print("=" * 70)
    print("  WASKITA LBS - Telegram Login Setup")
    print("=" * 70)
    print(f"\nAPI ID: {API_ID}")
    print(f"API Hash: {API_HASH[:20]}...")
    print(f"Session: /app/backend/northarch_session.session")
    print("\n" + "=" * 70)
    
    client = TelegramClient('/app/backend/northarch_session', API_ID, API_HASH)
    
    async def login_flow():
        await client.connect()
        
        if not await client.is_user_authorized():
            print("\n[INFO] Starting authentication process...")
            print(f"[INFO] Phone number yang akan digunakan: {PHONE}")
            print("\n" + "-" * 70)
            
            # Send code request
            await client.send_code_request(PHONE)
            print(f"\n✓ Verification code telah dikirim ke {PHONE}")
            print("\nBuka Telegram app Anda untuk melihat kode verifikasi.")
            print("Kode akan dikirim dari 'Telegram' official account.")
            print("\n" + "-" * 70)
            
            # Manual input untuk code
            code = input("\nMasukkan kode verifikasi (5 digit): ").strip()
            
            try:
                await client.sign_in(PHONE, code)
                print("\n✓ Login berhasil!")
                
            except SessionPasswordNeededError:
                print("\n[INFO] Akun dilindungi 2FA password")
                password = input("Masukkan 2FA password: ").strip()
                await client.sign_in(password=password)
                print("\n✓ Login berhasil dengan 2FA!")
            
            except Exception as e:
                print(f"\n✗ Login gagal: {e}")
                print("\nSilakan coba lagi dengan kode yang benar.")
                return False
        else:
            print("\n[INFO] Session sudah aktif. User sudah terautentikasi.")
        
        # Get user info
        me = await client.get_me()
        print("\n" + "=" * 70)
        print("  LOGIN INFORMATION")
        print("=" * 70)
        print(f"Name      : {me.first_name} {me.last_name or ''}")
        print(f"Username  : @{me.username}")
        print(f"Phone     : {me.phone}")
        print(f"User ID   : {me.id}")
        print("=" * 70)
        
        # Test bot connection
        print(f"\n[TEST] Menghubungi {BOT_USERNAME}...")
        try:
            await client.send_message(BOT_USERNAME, '/start')
            print(f"✓ Berhasil mengirim pesan ke {BOT_USERNAME}")
            
            import asyncio
            await asyncio.sleep(2)
            
            messages = await client.get_messages(BOT_USERNAME, limit=3)
            print(f"✓ Menerima {len(messages)} pesan dari bot")
            
            if messages and messages[0].text:
                print(f"\nResponse dari bot:")
                print(f"  {messages[0].text[:150]}...")
                
                if messages[0].buttons:
                    print(f"\n  Buttons tersedia:")
                    for row in messages[0].buttons:
                        for btn in row:
                            print(f"    - {btn.text}")
            
        except Exception as e:
            print(f"⚠ Warning: {e}")
            print("  Pastikan Anda sudah start chat dengan bot di Telegram app")
        
        print("\n" + "=" * 70)
        print("✓ SETUP SELESAI!")
        print("=" * 70)
        print("\nSession file tersimpan di:")
        print("  /app/backend/northarch_session.session")
        print("\nAplikasi WASKITA LBS sekarang bisa otomatis remote bot!")
        print("\nRestart backend untuk apply session:")
        print("  sudo supervisorctl restart backend")
        print("\n")
        
        return True
    
    # Run async function
    import asyncio
    try:
        result = asyncio.get_event_loop().run_until_complete(login_flow())
        return result
    finally:
        client.disconnect()

if __name__ == "__main__":
    print("\n")
    print("INSTRUKSI:")
    print("1. Script akan mengirim kode verifikasi ke phone number Anda")
    print("2. Buka Telegram app untuk melihat kode")
    print("3. Masukkan kode 5 digit yang diterima")
    print("4. (Optional) Masukkan 2FA password jika diminta")
    print("\n")
    
    input("Tekan ENTER untuk melanjutkan setup...")
    print("\n")
    
    try:
        success = main()
        if success:
            print("\n✓ Setup berhasil!\n")
        else:
            print("\n✗ Setup gagal. Silakan coba lagi.\n")
    except KeyboardInterrupt:
        print("\n\nSetup dibatalkan.\n")
    except Exception as e:
        print(f"\n✗ Error: {e}\n")
