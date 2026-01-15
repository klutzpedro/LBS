#!/usr/bin/env python3
"""
Script untuk initialize Telethon session pertama kali.
Run script ini untuk verify phone number dan create session file.
"""

import asyncio
from telethon import TelegramClient
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Telegram credentials
API_ID = int(os.getenv('TELEGRAM_API_ID', '35564970'))
API_HASH = os.getenv('TELEGRAM_API_HASH', 'd484d8fe3d2f4025f99101caeb070e1a')
BOT_USERNAME = '@northarch_bot'

async def init_session():
    """Initialize Telegram session with phone verification"""
    print("=" * 60)
    print("WASKITA LBS - Telegram Session Initialization")
    print("=" * 60)
    print(f"\nAPI ID: {API_ID}")
    print(f"API Hash: {API_HASH[:20]}...")
    print(f"Target Bot: {BOT_USERNAME}")
    print("\nSession file will be saved to: /app/backend/northarch_session.session")
    print("\n" + "=" * 60)
    
    client = TelegramClient(
        '/app/backend/northarch_session',
        API_ID,
        API_HASH
    )
    
    try:
        print("\n[1/4] Connecting to Telegram...")
        await client.connect()
        
        if not await client.is_user_authorized():
            print("\n[2/4] User not authorized. Starting phone verification...")
            print("\nNote: You need to enter your phone number (format: +62xxx)")
            print("Then you'll receive a code via Telegram app.")
            
            # Start the client (will ask for phone and code)
            await client.start()
            
            print("\n✓ Authentication successful!")
        else:
            print("\n[2/4] User already authorized. Session file exists.")
        
        # Get current user info
        me = await client.get_me()
        print(f"\n[3/4] Logged in as:")
        print(f"  - Name: {me.first_name} {me.last_name or ''}")
        print(f"  - Username: @{me.username}")
        print(f"  - Phone: {me.phone}")
        print(f"  - User ID: {me.id}")
        
        # Test sending message to bot
        print(f"\n[4/4] Testing connection to {BOT_USERNAME}...")
        try:
            # Send test message
            await client.send_message(BOT_USERNAME, '/start')
            print(f"✓ Successfully sent test message to {BOT_USERNAME}")
            
            # Get recent messages
            messages = await client.get_messages(BOT_USERNAME, limit=5)
            print(f"✓ Retrieved {len(messages)} recent messages from bot")
            
            if messages:
                print("\nMost recent message:")
                print(f"  Text: {messages[0].text[:100] if messages[0].text else 'No text'}")
                if messages[0].buttons:
                    print(f"  Buttons: {len(messages[0].buttons)} button rows")
                    for row in messages[0].buttons:
                        for btn in row:
                            print(f"    - {btn.text}")
            
        except Exception as e:
            print(f"⚠ Warning: Could not communicate with bot: {e}")
            print("  Make sure you have started a chat with the bot in Telegram app")
        
        print("\n" + "=" * 60)
        print("✓ Telegram session initialized successfully!")
        print("=" * 60)
        print("\nSession file created: /app/backend/northarch_session.session")
        print("The application can now communicate with Telegram automatically.")
        print("\nYou can now test target queries in the application.")
        
    except Exception as e:
        print(f"\n✗ Error during initialization: {e}")
        print("\nPlease check:")
        print("  1. API ID and API Hash are correct")
        print("  2. Your phone number is correct")
        print("  3. You have internet connection")
        print("  4. You received and entered the correct code from Telegram")
        return False
    
    finally:
        await client.disconnect()
    
    return True

if __name__ == "__main__":
    print("\n")
    success = asyncio.run(init_session())
    
    if success:
        print("\n✓ Setup complete! Backend server can now use Telegram bot.\n")
        exit(0)
    else:
        print("\n✗ Setup failed. Please try again.\n")
        exit(1)
