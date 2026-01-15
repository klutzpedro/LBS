#!/usr/bin/env python3
"""
Script untuk test komunikasi dengan Telegram bot.
Run setelah session sudah diinisialisasi.
"""

import asyncio
from telethon import TelegramClient
import os
from dotenv import load_dotenv
from pathlib import Path
import re

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

API_ID = int(os.getenv('TELEGRAM_API_ID', '35564970'))
API_HASH = os.getenv('TELEGRAM_API_HASH', 'd484d8fe3d2f4025f99101caeb070e1a')
BOT_USERNAME = '@northarch_bot'

async def test_bot_query(phone_number: str):
    """Test complete bot query flow"""
    print("=" * 60)
    print("WASKITA LBS - Bot Communication Test")
    print("=" * 60)
    print(f"\nTarget Bot: {BOT_USERNAME}")
    print(f"Phone Number: {phone_number}")
    print("\n" + "=" * 60)
    
    client = TelegramClient(
        '/app/backend/northarch_session',
        API_ID,
        API_HASH
    )
    
    try:
        print("\n[1/6] Connecting to Telegram...")
        await client.start()
        print("✓ Connected")
        
        me = await client.get_me()
        print(f"✓ Logged in as: {me.first_name} (@{me.username})")
        
        print(f"\n[2/6] Sending phone number to {BOT_USERNAME}...")
        await client.send_message(BOT_USERNAME, phone_number)
        print(f"✓ Sent: {phone_number}")
        
        print("\n[3/6] Waiting for bot response (3 seconds)...")
        await asyncio.sleep(3)
        
        print("\n[4/6] Retrieving bot messages...")
        messages = await client.get_messages(BOT_USERNAME, limit=10)
        print(f"✓ Retrieved {len(messages)} messages")
        
        print("\n[5/6] Looking for 'CP' button...")
        cp_found = False
        for msg in messages:
            if msg.buttons:
                print(f"\n  Message with buttons found:")
                print(f"  Text preview: {msg.text[:100] if msg.text else 'No text'}...")
                print(f"  Button rows: {len(msg.buttons)}")
                
                for row_idx, row in enumerate(msg.buttons):
                    print(f"\n  Row {row_idx + 1}:")
                    for btn_idx, button in enumerate(row):
                        print(f"    Button {btn_idx + 1}: '{button.text}'")
                        
                        if button.text and 'CP' in button.text.upper():
                            print(f"\n  ✓ Found 'CP' button! Clicking...")
                            await button.click()
                            cp_found = True
                            print("  ✓ Button clicked")
                            break
                    if cp_found:
                        break
            if cp_found:
                break
        
        if not cp_found:
            print("\n  ⚠ 'CP' button not found in recent messages")
            print("  Available buttons:")
            for msg in messages:
                if msg.buttons:
                    for row in msg.buttons:
                        for btn in row:
                            print(f"    - {btn.text}")
            return False
        
        print("\n[6/6] Waiting for location response (4 seconds)...")
        await asyncio.sleep(4)
        
        print("\n  Retrieving response messages...")
        response_messages = await client.get_messages(BOT_USERNAME, limit=15)
        
        location_found = False
        print("\n  Parsing messages for location data...")
        
        for idx, msg in enumerate(response_messages):
            print(f"\n  Message {idx + 1}:")
            
            # Check for geo location
            if hasattr(msg, 'geo') and msg.geo:
                print(f"  ✓ GEO LOCATION FOUND!")
                print(f"    Latitude: {msg.geo.lat}")
                print(f"    Longitude: {msg.geo.long}")
                location_found = True
                break
            
            # Check text for coordinates
            if msg.text:
                text_preview = msg.text[:200]
                print(f"  Text: {text_preview}...")
                
                # Try to find coordinates in text
                lat_match = re.search(r'(?:lat|latitude)[:\s]*(-?\d+\.?\d*)', msg.text, re.IGNORECASE)
                lon_match = re.search(r'(?:lon|long|longitude)[:\s]*(-?\d+\.?\d*)', msg.text, re.IGNORECASE)
                
                if lat_match and lon_match:
                    print(f"  ✓ COORDINATES FOUND IN TEXT!")
                    print(f"    Latitude: {lat_match.group(1)}")
                    print(f"    Longitude: {lon_match.group(1)}")
                    location_found = True
                    break
        
        if not location_found:
            print("\n  ⚠ No location data found in response")
            print("\n  Recent bot responses:")
            for idx, msg in enumerate(response_messages[:5]):
                if msg.text:
                    print(f"\n  [{idx+1}] {msg.text[:150]}")
        
        print("\n" + "=" * 60)
        if location_found:
            print("✓ BOT COMMUNICATION TEST SUCCESSFUL!")
            print("  The bot is responding correctly with location data.")
        else:
            print("⚠ BOT RESPONDED BUT NO LOCATION DATA DETECTED")
            print("  You may need to adjust the parsing logic.")
        print("=" * 60)
        
        return location_found
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    finally:
        await client.disconnect()

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("\nUsage: python3 test_bot.py <phone_number>")
        print("Example: python3 test_bot.py 628123456789")
        print("\nThis will test the complete bot query flow:")
        print("  1. Send phone number to bot")
        print("  2. Wait for response")
        print("  3. Click 'CP' button")
        print("  4. Parse location from response")
        sys.exit(1)
    
    phone = sys.argv[1]
    
    if not phone.startswith('62'):
        print("\n✗ Error: Phone number must start with 62")
        sys.exit(1)
    
    print("\n")
    success = asyncio.run(test_bot_query(phone))
    
    if success:
        print("\n✓ Test complete! Bot integration is working.\n")
        exit(0)
    else:
        print("\n⚠ Test completed with warnings. Check the output above.\n")
        exit(1)
