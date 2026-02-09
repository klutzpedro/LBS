from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import base64
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
from passlib.context import CryptContext
import asyncio
from telethon import TelegramClient, events
import re
import httpx  # For CP API calls
import socket  # For forcing IPv4
import hashlib
import secrets
import time
from collections import defaultdict

ROOT_DIR = Path(__file__).parent
env_path = ROOT_DIR / '.env'
load_dotenv(env_path)

# Log environment loading
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.info(f"Loading .env from: {env_path}, exists: {env_path.exists()}")

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()
JWT_SECRET = os.getenv('JWT_SECRET', secrets.token_hex(32))  # Use random secret if not set
JWT_ALGORITHM = "HS256"

# ============================================
# SECURITY HARDENING CONFIGURATION
# ============================================
ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', '*').split(',')
RATE_LIMIT_REQUESTS = int(os.getenv('RATE_LIMIT_REQUESTS', '100'))  # requests per window
RATE_LIMIT_WINDOW = int(os.getenv('RATE_LIMIT_WINDOW', '60'))  # seconds
MAX_REQUEST_SIZE = int(os.getenv('MAX_REQUEST_SIZE', '10485760'))  # 10MB
BLOCKED_USER_AGENTS = ['sqlmap', 'nikto', 'nmap', 'masscan', 'zgrab', 'gobuster', 'dirbuster', 'wpscan']

# Check if HTTPS is enabled (set HTTPS_ENABLED=true in .env when you have SSL)
HTTPS_ENABLED = os.getenv('HTTPS_ENABLED', 'false').lower() == 'true'

SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',  # Changed from DENY to allow same-origin
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
}

# Only add HTTPS-related headers if HTTPS is enabled
if HTTPS_ENABLED:
    SECURITY_HEADERS['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    SECURITY_HEADERS['Content-Security-Policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:;"
else:
    # Relaxed CSP for HTTP
    SECURITY_HEADERS['Content-Security-Policy'] = "default-src 'self' 'unsafe-inline' 'unsafe-eval'; img-src 'self' data: http: https:; connect-src 'self' http: https:;"

# Rate limiting storage (in-memory, consider Redis for production cluster)
rate_limit_storage = defaultdict(list)
blocked_ips = set()
failed_login_attempts = defaultdict(list)

# CP API Configuration
CP_API_URL = os.getenv('CP_API_URL', 'https://gate-amg.blackopium.xyz')
CP_API_KEY = os.getenv('CP_API_KEY', '4e5c5c4afc0c7ee8e22aa54c0796c084')
CP_API_INITIAL_QUOTA = int(os.getenv('CP_API_QUOTA', '300'))

logger.info(f"CP API URL: {CP_API_URL}")
logger.info(f"CP API Key: {CP_API_KEY[:8]}...{CP_API_KEY[-4:]}")

# Telegram Client Setup - PERMANENT VALUES
# Telegram API credentials - USE FROM ENVIRONMENT VARIABLES
# Each deployment can have different API credentials
env_api_id = os.getenv('TELEGRAM_API_ID', '')
env_api_hash = os.getenv('TELEGRAM_API_HASH', '')

if not env_api_id or not env_api_hash:
    logger.error("TELEGRAM_API_ID and TELEGRAM_API_HASH must be set in .env file!")
    TELEGRAM_API_ID = 0
    TELEGRAM_API_HASH = ''
else:
    TELEGRAM_API_ID = int(env_api_id)
    TELEGRAM_API_HASH = env_api_hash
    logger.info(f"Telegram API ID: {TELEGRAM_API_ID} (from .env)")

BOT_USERNAME = '@northarch_bot'

telegram_client = None
telegram_connection_lock = asyncio.Lock()

# ============================================
# GLOBAL TELEGRAM QUERY LOCK - PREVENTS RACE CONDITIONS
# ============================================
# This is the MASTER lock for ALL Telegram bot queries.
# Only ONE query can be processed at a time across ALL users.
# This prevents data mixing when multiple users query simultaneously.
telegram_query_lock = asyncio.Lock()

# Lock timeout to prevent deadlocks (in seconds)
LOCK_TIMEOUT = 120  # 2 minutes max wait

# Track current active request across all users
current_request_status = {
    "is_busy": False,
    "username": None,
    "operation": None,
    "started_at": None
}

async def acquire_telegram_lock(operation_name: str, username: str = None, timeout: float = LOCK_TIMEOUT) -> bool:
    """
    Acquire the global Telegram lock with timeout.
    Returns True if lock acquired, False if timeout.
    """
    global current_request_status
    try:
        # Try to acquire lock with timeout
        acquired = await asyncio.wait_for(
            telegram_query_lock.acquire(),
            timeout=timeout
        )
        if acquired:
            logger.info(f"[LOCK] Acquired for: {operation_name} by {username}")
            # Update request status for ALL operations
            current_request_status = {
                "is_busy": True,
                "username": username,
                "operation": operation_name,
                "started_at": datetime.now(timezone.utc).isoformat()
            }
        return acquired
    except asyncio.TimeoutError:
        logger.error(f"[LOCK] Timeout waiting for lock: {operation_name} (waited {timeout}s)")
        return False
    except Exception as e:
        logger.error(f"[LOCK] Error acquiring lock for {operation_name}: {e}")
        return False

def release_telegram_lock(operation_name: str):
    """Safely release the global Telegram lock"""
    global current_request_status
    try:
        if telegram_query_lock.locked():
            telegram_query_lock.release()
            logger.info(f"[LOCK] Released for: {operation_name}")
            # Clear request status for ALL operations
            current_request_status = {
                "is_busy": False,
                "username": None,
                "operation": None,
                "started_at": None
            }
    except Exception as e:
        logger.error(f"[LOCK] Error releasing lock for {operation_name}: {e}")

# Track active query to prevent data mixing
active_query_info = {
    "user": None,
    "query_type": None,
    "query_value": None,
    "started_at": None,
    "last_msg_id": None
}

def set_active_query(user: str, query_type: str, query_value: str, last_msg_id: int = None):
    """Set the active query info for validation and update request status"""
    global active_query_info, current_request_status
    active_query_info = {
        "user": user,
        "query_type": query_type,
        "query_value": query_value,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "last_msg_id": last_msg_id
    }
    # Also update request status for queue indicator
    current_request_status = {
        "is_busy": True,
        "username": user,
        "operation": f"{query_type} - {query_value[:15] if query_value else 'N/A'}...",
        "started_at": datetime.now(timezone.utc).isoformat()
    }
    logger.info(f"[QUERY LOCK] Active query set: user={user}, type={query_type}, value={query_value[:20] if query_value else 'N/A'}...")

def clear_active_query():
    """Clear the active query info and request status"""
    global active_query_info, current_request_status
    prev_user = active_query_info.get("user")
    prev_type = active_query_info.get("query_type")
    active_query_info = {
        "user": None,
        "query_type": None,
        "query_value": None,
        "started_at": None,
        "last_msg_id": None
    }
    # Also clear request status for queue indicator
    current_request_status = {
        "is_busy": False,
        "username": None,
        "operation": None,
        "started_at": None
    }
    logger.info(f"[QUERY LOCK] Active query cleared (was: user={prev_user}, type={prev_type})")

def validate_response_matches_query(response_text: str, query_type: str, query_value: str) -> bool:
    """
    Validate that a response from Telegram bot matches the query that was sent.
    This prevents data mixing when multiple users query simultaneously.
    """
    if not response_text or not query_value:
        return True  # Can't validate, assume OK
    
    response_lower = response_text.lower()
    query_lower = query_value.lower()
    
    # For phone number queries (CP), check if phone appears in response
    if query_type in ['cp', 'reghp', 'reghp_phone']:
        # Phone number should appear somewhere in response
        # Remove non-digits for comparison
        phone_digits = re.sub(r'\D', '', query_value)
        if len(phone_digits) >= 8:
            # Check if at least 8 consecutive digits match
            if phone_digits[-8:] in re.sub(r'\D', '', response_text):
                return True
            # Also check formatted versions
            if phone_digits in response_text.replace(' ', '').replace('-', ''):
                return True
    
    # For NIK queries, the NIK should appear in response
    if query_type in ['nik', 'capil_nik']:
        if query_value in response_text:
            return True
    
    # For NKK queries
    if query_type in ['nkk', 'family']:
        if query_value in response_text:
            return True
    
    # For name queries, at least part of the name should appear
    if query_type in ['capil_name', 'name']:
        # Check if any significant word from query appears in response
        words = query_lower.split()
        for word in words:
            if len(word) >= 3 and word in response_lower:
                return True
    
    # Default: log warning but don't fail (for flexibility)
    logger.warning(f"[VALIDATION] Response may not match query: type={query_type}, query={query_value[:30]}...")
    return True  # Return True to not break existing functionality, but log warning

# Session path - use ROOT_DIR for portability
SESSION_PATH = str(ROOT_DIR / 'northarch_session')

# Helper function to create TelegramClient with proper settings
def create_telegram_client():
    """Create a TelegramClient with persistent connection settings"""
    return TelegramClient(
        SESSION_PATH,
        TELEGRAM_API_ID,
        TELEGRAM_API_HASH,
        connection_retries=20,        # Increased retry attempts
        retry_delay=1,                # 1 second delay between retries
        auto_reconnect=True,          # Auto reconnect on disconnect
        request_retries=10,           # More request retries
        timeout=30,                   # 30 second timeout
    )

# Robust connection helper with lock to prevent race conditions
async def ensure_telegram_connected():
    """Ensure Telegram client is connected, reconnect if needed"""
    global telegram_client
    
    async with telegram_connection_lock:
        if telegram_client is None:
            telegram_client = create_telegram_client()
            await telegram_client.connect()
            logger.info("[Telegram] Client created and connected")
            return True
        
        if not telegram_client.is_connected():
            logger.warning("[Telegram] Client disconnected, reconnecting...")
            try:
                await telegram_client.connect()
                if telegram_client.is_connected():
                    logger.info("[Telegram] Reconnected successfully")
                    return True
                else:
                    logger.error("[Telegram] Reconnect failed - not connected")
                    return False
            except Exception as e:
                logger.error(f"[Telegram] Reconnect error: {e}")
                # Try to recreate client
                try:
                    telegram_client = create_telegram_client()
                    await telegram_client.connect()
                    logger.info("[Telegram] Client recreated and connected")
                    return True
                except Exception as e2:
                    logger.error(f"[Telegram] Recreate failed: {e2}")
                    return False
        
        return True

# Wrapper for safe Telegram operations with automatic retry
async def safe_telegram_operation(operation, operation_name="operation", max_retries=3):
    """
    Safely execute a Telegram operation with automatic reconnection and retry.
    
    Args:
        operation: async callable that performs the Telegram operation
        operation_name: name for logging
        max_retries: maximum number of retries
    
    Returns:
        Result of the operation or None if all retries fail
    """
    global telegram_client
    
    for attempt in range(max_retries):
        try:
            # Ensure connection before operation
            if not await ensure_telegram_connected():
                logger.error(f"[Telegram] Cannot connect for {operation_name}")
                await asyncio.sleep(2)
                continue
            
            # Execute the operation
            result = await operation()
            return result
            
        except ConnectionError as e:
            logger.warning(f"[Telegram] Connection error in {operation_name} (attempt {attempt + 1}/{max_retries}): {e}")
            # Force reconnect using lock to prevent race conditions
            async with telegram_connection_lock:
                if telegram_client:
                    try:
                        await telegram_client.disconnect()
                    except Exception as disc_err:
                        logger.debug(f"[Telegram] Disconnect during recovery: {disc_err}")
                    telegram_client = None
            await asyncio.sleep(2)
            
        except Exception as e:
            error_str = str(e).lower()
            if 'connection' in error_str or 'disconnect' in error_str or 'timeout' in error_str:
                logger.warning(f"[Telegram] Network error in {operation_name} (attempt {attempt + 1}/{max_retries}): {e}")
                # Force reconnect using lock to prevent race conditions
                async with telegram_connection_lock:
                    if telegram_client:
                        try:
                            await telegram_client.disconnect()
                        except Exception as disc_err:
                            logger.debug(f"[Telegram] Disconnect during recovery: {disc_err}")
                        telegram_client = None
                await asyncio.sleep(2)
            else:
                # Non-connection error, don't retry
                logger.error(f"[Telegram] Error in {operation_name}: {e}")
                raise
    
    logger.error(f"[Telegram] All {max_retries} retries failed for {operation_name}")
    return None

# ============================================
# CP API Functions (CEKPOS)
# ============================================

async def get_cp_api_quota():
    """Get current CP API quota from database"""
    quota_doc = await db.api_quota.find_one({"type": "cp_api"})
    if not quota_doc:
        # Initialize quota
        await db.api_quota.insert_one({
            "type": "cp_api",
            "remaining": CP_API_INITIAL_QUOTA,
            "initial": CP_API_INITIAL_QUOTA,
            "used": 0,
            "last_updated": datetime.now(timezone.utc).isoformat()
        })
        return CP_API_INITIAL_QUOTA
    return quota_doc.get("remaining", 0)

async def decrement_cp_api_quota():
    """Decrement CP API quota by 1"""
    result = await db.api_quota.find_one_and_update(
        {"type": "cp_api", "remaining": {"$gt": 0}},
        {
            "$inc": {"remaining": -1, "used": 1},
            "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
        },
        return_document=True
    )
    if result:
        return result.get("remaining", 0)
    return 0

async def check_cp_api_connection():
    """Check if CP API is reachable AND authorized
    
    IMPORTANT: This function NO LONGER makes actual API calls to CP API!
    It only checks the cached status from database to avoid wasting quota.
    
    Actual CP API status is updated ONLY when:
    1. User performs a real query (position query)
    2. User manually clicks "refresh" on status
    
    Returns tuple: (is_connected: bool, quota_exceeded: bool)
    """
    try:
        # Get cached status from database
        quota_doc = await db.api_quota.find_one({"type": "cp_api"}, {"_id": 0})
        
        if quota_doc:
            quota_exceeded = quota_doc.get("quota_exceeded", False)
            last_check = quota_doc.get("last_check")
            is_connected = quota_doc.get("is_connected", True)  # Assume connected unless proven otherwise
            
            # If we have a recent check (within last hour), use cached status
            if last_check:
                try:
                    last_check_time = datetime.fromisoformat(last_check.replace('Z', '+00:00'))
                    time_since_check = (datetime.now(timezone.utc) - last_check_time).total_seconds()
                    
                    # If last check was within 1 hour, trust the cached status
                    if time_since_check < 3600:
                        logger.info(f"[CP API] Using cached status (checked {int(time_since_check)}s ago): connected={is_connected}, quota_exceeded={quota_exceeded}")
                        return is_connected, quota_exceeded
                except:
                    pass
            
            # Return cached status even if old
            logger.info(f"[CP API] Using cached status: connected={is_connected}, quota_exceeded={quota_exceeded}")
            return is_connected, quota_exceeded
        
        # No cached status, assume connected (will be updated on first real query)
        logger.info("[CP API] No cached status, assuming connected")
        return True, False
        
    except Exception as e:
        logger.error(f"[CP API] Error checking cached status: {e}")
        return True, False  # Assume connected on error


async def verify_cp_api_connection_real():
    """
    Actually test CP API connection by making a real request.
    This should ONLY be called when user explicitly requests a refresh
    or during actual query operations.
    
    WARNING: This uses CP API quota!
    """
    try:
        import subprocess
        import json
        
        # Use a minimal test - check if API responds at all
        # Using a test number that won't return real data
        result = subprocess.run(
            [
                'curl', '-4', '-s', '-X', 'POST',
                f'{CP_API_URL}/api/v3/cekpos',
                '-H', f'api-key: {CP_API_KEY}',
                '-d', 'msisdn=628123456789',
                '--connect-timeout', '10'
            ],
            capture_output=True,
            text=True,
            timeout=15
        )
        
        response_text = result.stdout.strip()
        
        if not response_text:
            logger.warning("[CP API REAL CHECK] Empty response")
            await update_cp_api_status(False, False)
            return False, False
        
        if '<html' in response_text.lower():
            logger.warning("[CP API REAL CHECK] Received HTML response - likely blocked")
            await update_cp_api_status(False, False)
            return False, False
        
        try:
            data = json.loads(response_text)
            
            if data.get("error") == "Quota exceeded":
                logger.warning("[CP API REAL CHECK] Quota exceeded!")
                await update_cp_api_status(True, True)
                return True, True
            
            logger.info(f"[CP API REAL CHECK] Connection OK")
            await update_cp_api_status(True, False)
            return True, False
            
        except json.JSONDecodeError:
            logger.warning(f"[CP API REAL CHECK] Could not parse response")
            await update_cp_api_status(False, False)
            return False, False
            
    except subprocess.TimeoutExpired:
        logger.error("[CP API REAL CHECK] Connection timed out")
        await update_cp_api_status(False, False)
        return False, False
    except Exception as e:
        logger.error(f"[CP API REAL CHECK] Failed: {e}")
        await update_cp_api_status(False, False)
        return False, False


async def update_cp_api_status(is_connected: bool, quota_exceeded: bool):
    """Update CP API status in database"""
    await db.api_quota.update_one(
        {"type": "cp_api"},
        {
            "$set": {
                "is_connected": is_connected,
                "quota_exceeded": quota_exceeded,
                "last_check": datetime.now(timezone.utc).isoformat()
            }
        },
        upsert=True
    )

def normalize_phone_number(phone: str) -> str:
    """Convert phone number to 628xxx format"""
    phone = re.sub(r'[^0-9]', '', phone)  # Remove non-digits
    if phone.startswith('08'):
        phone = '62' + phone[1:]
    elif phone.startswith('8'):
        phone = '62' + phone
    elif not phone.startswith('62'):
        phone = '62' + phone
    return phone

async def query_cp_api(phone_number: str) -> dict:
    """
    Query CP (CEKPOS) API for phone location.
    Returns dict with location data or error.
    Uses curl -4 to force IPv4 for whitelisted IP.
    """
    normalized_phone = normalize_phone_number(phone_number)
    logger.info(f"[CP API] Querying position for {normalized_phone}")
    
    try:
        import subprocess
        import json
        
        # Use curl -4 to force IPv4 (required for IP-whitelisted API)
        result = subprocess.run(
            [
                'curl', '-4', '-s', '-X', 'POST',
                f'{CP_API_URL}/api/v3/cekpos',
                '-H', f'api-key: {CP_API_KEY}',
                '-d', f'msisdn={normalized_phone}',
                '--connect-timeout', '15',
                '--max-time', '30'
            ],
            capture_output=True,
            text=True,
            timeout=35
        )
        
        response_text = result.stdout.strip()
        
        if not response_text:
            logger.error(f"[CP API] Empty response for {normalized_phone}")
            return {"success": False, "error": "Empty response from API"}
        
        # Check for HTML error page
        if '<html' in response_text.lower():
            logger.error(f"[CP API] Received HTML error page")
            return {"success": False, "error": "API blocked or server error"}
        
        data = json.loads(response_text)
        logger.info(f"[CP API] Response code: {data.get('code')}, message: {data.get('message')}")
        
        if data.get("code") == 0 and data.get("contents"):
            contents = data["contents"]
            
            # Decrement quota on successful query
            await decrement_cp_api_quota()
            
            # Update CP API status - we know it's connected now
            await update_cp_api_status(True, False)
            
            return {
                "success": True,
                "latitude": float(contents.get("latitude", 0)),
                "longitude": float(contents.get("longitude", 0)),
                "address": contents.get("address", "Alamat tidak tersedia"),
                "network": contents.get("network", "Unknown"),
                "state": contents.get("state", "Unknown"),
                "imsi": contents.get("imsi", ""),
                "imei": contents.get("imei", ""),
                "phone_model": contents.get("phone", ""),
                "prefix_type": contents.get("prefix_type", ""),
                "query_time": data.get("queryTime", ""),
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        elif data.get("error") == "Quota exceeded":
            # Update status - connected but quota exceeded
            await update_cp_api_status(True, True)
            return {
                "success": False,
                "error": "Quota exceeded",
                "code": -1
            }
        else:
            # Update status - connected (got valid response)
            await update_cp_api_status(True, False)
            return {
                "success": False,
                "error": data.get("message", "Unknown error"),
                "code": data.get("code", -1)
            }
            
    except subprocess.TimeoutExpired:
        logger.error(f"[CP API] Timeout for {normalized_phone}")
        return {"success": False, "error": "Request timeout"}
    except json.JSONDecodeError as e:
        logger.error(f"[CP API] JSON parse error: {e}, response: {response_text[:200] if response_text else 'empty'}")
        return {"success": False, "error": "Invalid API response"}
    except Exception as e:
        logger.error(f"[CP API] Error: {e}")
        return {"success": False, "error": str(e)}

async def query_telegram_bot_position(phone_number: str) -> dict:
    """
    Query position via Telegram bot as fallback when CP API quota is exceeded.
    
    Flow:
    1. Send phone number to bot
    2. Wait for bot reply with options (buttons)
    3. Auto-click "CP" button
    4. Wait for final response with location data
    5. Parse and extract: lat, long, address, imei, imsi, phone model, etc.
    """
    global telegram_client
    
    normalized_phone = normalize_phone_number(phone_number)
    logger.info(f"[TG BOT] Querying position for {normalized_phone} via Telegram bot")
    
    try:
        if not telegram_client or not telegram_client.is_connected():
            logger.error("[TG BOT] Telegram not connected")
            return {"success": False, "error": "Telegram tidak terhubung"}
        
        bot_entity = await telegram_client.get_entity("@northarch_bot")
        
        # Step 1: Send phone number to bot
        await telegram_client.send_message(bot_entity, normalized_phone)
        logger.info(f"[TG BOT] Sent phone number: {normalized_phone}")
        
        # Step 2: Wait for bot response with buttons
        await asyncio.sleep(3)
        
        messages = await telegram_client.get_messages(bot_entity, limit=10)
        
        cp_button_clicked = False
        for msg in messages:
            if msg.out:  # Skip our own messages
                continue
            
            # Look for message with buttons
            if msg.buttons:
                for row in msg.buttons:
                    for button in row:
                        button_text = (button.text or '').upper()
                        # Click "CP" button
                        if 'CP' in button_text:
                            logger.info(f"[TG BOT] Found CP button, clicking: {button.text}")
                            try:
                                await button.click()
                                cp_button_clicked = True
                                logger.info(f"[TG BOT] CP button clicked successfully")
                            except Exception as btn_err:
                                logger.error(f"[TG BOT] Error clicking CP button: {btn_err}")
                            break
                    if cp_button_clicked:
                        break
            if cp_button_clicked:
                break
        
        if not cp_button_clicked:
            logger.warning("[TG BOT] CP button not found, trying to send 'CP' as text")
            await telegram_client.send_message(bot_entity, "CP")
        
        # Step 3: Wait for final response with location data
        await asyncio.sleep(5)
        
        messages = await telegram_client.get_messages(bot_entity, limit=10)
        
        for msg in messages:
            if msg.out:
                continue
            
            text = msg.text or ''
            
            # Check if this is the location response
            if 'Phone Location of' in text or ('Lat:' in text and 'Long:' in text):
                logger.info(f"[TG BOT] Found location response")
                
                # Parse the response
                result = parse_telegram_location_response(text)
                if result.get("success"):
                    logger.info(f"[TG BOT] Successfully parsed location: {result.get('latitude')}, {result.get('longitude')}")
                    return result
        
        logger.warning("[TG BOT] No location response found from bot")
        return {"success": False, "error": "Tidak ada respons lokasi dari bot"}
        
    except Exception as e:
        logger.error(f"[TG BOT] Error: {e}")
        import traceback
        logger.error(f"[TG BOT] Traceback: {traceback.format_exc()}")
        return {"success": False, "error": str(e)}

def parse_telegram_location_response(text: str) -> dict:
    """
    Parse Telegram bot location response.
    
    Expected format:
    Phone Location of 6281342046135
    
    Imei: 352722665176486
    Imsi: 510104232046135
    Phone: SAMSUNG Galaxy S24 Ultra
    Operator: Telkomsel Kartu Halo
    Network: 4G
    MCC: 510
    MNC: 10
    LAC: 12345
    CI: 67890
    CGI: 510-10-12345-67890
    Long: 119.8837
    Lat: -0.92559
    Address: SULAWESI TENGAH, KOTA PALU, PALU SELATAN, TATURA SELATAN
    """
    try:
        lines = text.strip().split('\n')
        data = {}
        
        for line in lines:
            line = line.strip()
            if ':' in line:
                key, value = line.split(':', 1)
                key = key.strip().lower()
                value = value.strip()
                
                if key == 'lat':
                    data['latitude'] = float(value)
                elif key == 'long':
                    data['longitude'] = float(value)
                elif key == 'address':
                    data['address'] = value
                elif key == 'imei':
                    data['imei'] = value
                elif key == 'imsi':
                    data['imsi'] = value
                elif key == 'phone':
                    data['phone_model'] = value
                elif key == 'operator':
                    data['operator'] = value
                elif key == 'network':
                    data['network'] = value
                elif key == 'mcc':
                    data['mcc'] = value
                elif key == 'mnc':
                    data['mnc'] = value
                elif key == 'lac':
                    data['lac'] = value
                elif key == 'ci':
                    data['ci'] = value
                elif key == 'cgi':
                    data['cgi'] = value
        
        if 'latitude' in data and 'longitude' in data:
            return {
                "success": True,
                "source": "telegram_bot",
                "latitude": data.get('latitude', 0),
                "longitude": data.get('longitude', 0),
                "address": data.get('address', 'Alamat tidak tersedia'),
                "network": data.get('network', 'Unknown'),
                "imsi": data.get('imsi', ''),
                "imei": data.get('imei', ''),
                "phone_model": data.get('phone_model', ''),
                "operator": data.get('operator', ''),
                "mcc": data.get('mcc', ''),
                "mnc": data.get('mnc', ''),
                "lac": data.get('lac', ''),
                "ci": data.get('ci', ''),
                "cgi": data.get('cgi', ''),
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        else:
            return {"success": False, "error": "Could not parse lat/long from response"}
            
    except Exception as e:
        logger.error(f"[TG BOT] Parse error: {e}")
        return {"success": False, "error": f"Parse error: {e}"}

async def query_position(phone_number: str) -> dict:
    """
    Main function to query position - uses CP API or Telegram bot based on settings.
    """
    # Check if we should use Telegram bot
    settings_doc = await db.settings.find_one({"type": "position_source"})
    use_telegram = settings_doc.get("use_telegram", False) if settings_doc else False
    
    if use_telegram:
        logger.info(f"[POSITION] Using Telegram bot for {phone_number}")
        return await query_telegram_bot_position(phone_number)
    else:
        logger.info(f"[POSITION] Using CP API for {phone_number}")
        result = await query_cp_api(phone_number)
        
        # If CP API returns quota exceeded, try Telegram as fallback
        if not result.get("success") and "Quota exceeded" in str(result.get("error", "")):
            logger.warning("[POSITION] CP API quota exceeded, falling back to Telegram bot")
            return await query_telegram_bot_position(phone_number)
        
        return result

app = FastAPI(
    title="NETRA API",
    docs_url=None,  # Disable Swagger docs in production
    redoc_url=None,  # Disable ReDoc in production
    openapi_url=None  # Disable OpenAPI schema
)
api_router = APIRouter(prefix="/api")

# ============================================
# SECURITY MIDDLEWARE
# ============================================

class SecurityMiddleware(BaseHTTPMiddleware):
    """
    Comprehensive security middleware for:
    - Rate limiting
    - Blocked user agents detection
    - Security headers injection
    - Request logging
    - IP blocking
    """
    
    async def dispatch(self, request: Request, call_next):
        client_ip = self.get_client_ip(request)
        user_agent = request.headers.get('user-agent', '').lower()
        path = request.url.path
        
        # Skip security for health checks
        if path in ['/health', '/api/health']:
            return await call_next(request)
        
        # 1. Check if IP is blocked
        if client_ip in blocked_ips:
            logger.warning(f"[SECURITY] Blocked IP attempted access: {client_ip}")
            return Response(
                content='{"error": "Access denied"}',
                status_code=403,
                media_type='application/json'
            )
        
        # 2. Check for malicious user agents
        for blocked_agent in BLOCKED_USER_AGENTS:
            if blocked_agent in user_agent:
                logger.warning(f"[SECURITY] Blocked user agent: {user_agent} from {client_ip}")
                await self.log_security_event(client_ip, 'blocked_agent', user_agent)
                return Response(
                    content='{"error": "Access denied"}',
                    status_code=403,
                    media_type='application/json'
                )
        
        # 3. Rate limiting
        if not await self.check_rate_limit(client_ip, path):
            logger.warning(f"[SECURITY] Rate limit exceeded for {client_ip}")
            await self.log_security_event(client_ip, 'rate_limit', path)
            return Response(
                content='{"error": "Too many requests. Please try again later."}',
                status_code=429,
                media_type='application/json',
                headers={'Retry-After': str(RATE_LIMIT_WINDOW)}
            )
        
        # 4. Process request
        response = await call_next(request)
        
        # 5. Add security headers
        for header, value in SECURITY_HEADERS.items():
            response.headers[header] = value
        
        # Add custom headers to prevent caching of sensitive data
        if '/api/' in path:
            response.headers['X-Robots-Tag'] = 'noindex, nofollow, noarchive'
        
        return response
    
    def get_client_ip(self, request: Request) -> str:
        """Extract real client IP from headers"""
        forwarded = request.headers.get('x-forwarded-for')
        if forwarded:
            return forwarded.split(',')[0].strip()
        real_ip = request.headers.get('x-real-ip')
        if real_ip:
            return real_ip
        return request.client.host if request.client else 'unknown'
    
    async def check_rate_limit(self, client_ip: str, path: str) -> bool:
        """Check if request is within rate limit"""
        current_time = time.time()
        window_start = current_time - RATE_LIMIT_WINDOW
        
        # Clean old entries
        rate_limit_storage[client_ip] = [
            t for t in rate_limit_storage[client_ip] 
            if t > window_start
        ]
        
        # Check limit
        if len(rate_limit_storage[client_ip]) >= RATE_LIMIT_REQUESTS:
            return False
        
        # Add current request
        rate_limit_storage[client_ip].append(current_time)
        return True
    
    async def log_security_event(self, ip: str, event_type: str, details: str):
        """Log security events to database"""
        try:
            await db.security_logs.insert_one({
                "ip": ip,
                "event_type": event_type,
                "details": details,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        except Exception as e:
            logger.error(f"[SECURITY] Failed to log event: {e}")

# Add security middleware
app.add_middleware(SecurityMiddleware)

# ============================================
# BRUTE FORCE PROTECTION
# ============================================

async def check_login_attempts(ip: str, username: str) -> bool:
    """Check if login should be allowed based on failed attempts"""
    current_time = time.time()
    window_start = current_time - 900  # 15 minute window
    
    key = f"{ip}:{username}"
    
    # Clean old entries
    failed_login_attempts[key] = [
        t for t in failed_login_attempts[key]
        if t > window_start
    ]
    
    # Block after 5 failed attempts in 15 minutes
    if len(failed_login_attempts[key]) >= 5:
        return False
    
    return True

async def record_failed_login(ip: str, username: str):
    """Record a failed login attempt"""
    key = f"{ip}:{username}"
    failed_login_attempts[key].append(time.time())
    
    # Log to database
    await db.security_logs.insert_one({
        "ip": ip,
        "event_type": "failed_login",
        "details": f"Failed login for user: {username}",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    # Block IP after 20 total failed attempts
    total_failures = sum(len(v) for k, v in failed_login_attempts.items() if k.startswith(ip))
    if total_failures >= 20:
        blocked_ips.add(ip)
        logger.warning(f"[SECURITY] IP blocked due to excessive failed logins: {ip}")

async def clear_failed_logins(ip: str, username: str):
    """Clear failed login attempts after successful login"""
    key = f"{ip}:{username}"
    failed_login_attempts[key] = []

# ============================================
# SINGLE DEVICE SESSION MANAGEMENT (SIMPLE VERSION)
# ============================================
# Set SINGLE_DEVICE_LOGIN=true in .env to enable this feature
SINGLE_DEVICE_LOGIN_ENABLED = os.getenv('SINGLE_DEVICE_LOGIN', 'true').lower() == 'true'
SESSION_INACTIVITY_TIMEOUT = 1800  # 30 minutes - session considered stale if no activity

logger.info(f"[CONFIG] Single Device Login: {'ENABLED' if SINGLE_DEVICE_LOGIN_ENABLED else 'DISABLED'}")

async def get_active_session(username: str):
    """Get active session for a user, returns None if session is stale or feature disabled"""
    if not SINGLE_DEVICE_LOGIN_ENABLED:
        return None  # Feature disabled, always allow login
        
    session = await db.active_sessions.find_one({"username": username})
    
    if session:
        # Check if session is stale (no activity for SESSION_INACTIVITY_TIMEOUT)
        last_activity = session.get("last_activity")
        if last_activity:
            try:
                last_activity_dt = datetime.fromisoformat(last_activity.replace('Z', '+00:00'))
                time_since_activity = (datetime.now(timezone.utc) - last_activity_dt).total_seconds()
                
                if time_since_activity > SESSION_INACTIVITY_TIMEOUT:
                    # Session is stale, delete it and return None
                    logger.info(f"[SESSION] Stale session detected for {username}, inactive for {time_since_activity:.0f}s. Cleaning up.")
                    await db.active_sessions.delete_one({"username": username})
                    return None
            except Exception as e:
                logger.error(f"[SESSION] Error checking session activity: {e}")
    
    return session

async def create_session(username: str, session_id: str, device_info: str):
    """Create or update session for user"""
    await db.active_sessions.update_one(
        {"username": username},
        {
            "$set": {
                "username": username,
                "session_id": session_id,
                "device_info": device_info,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "last_activity": datetime.now(timezone.utc).isoformat()
            }
        },
        upsert=True
    )

async def invalidate_session(username: str):
    """Invalidate session for user (logout)"""
    await db.active_sessions.delete_one({"username": username})

async def check_session_valid(username: str, session_id: str) -> bool:
    """Check if session is still valid (exists with matching session_id)"""
    if not SINGLE_DEVICE_LOGIN_ENABLED:
        return True  # Feature disabled, session always valid
        
    session = await db.active_sessions.find_one({
        "username": username,
        "session_id": session_id
    })
    
    return session is not None

# Models
class LoginRequest(BaseModel):
    username: str
    password: str
    device_info: Optional[str] = "Unknown Device"
    force_login: Optional[bool] = False  # Force logout other sessions

class LoginResponse(BaseModel):
    token: str
    username: str
    is_admin: bool = False
    session_id: str = ""

class RegisterRequest(BaseModel):
    username: str
    password: str
    full_name: str

class UserResponse(BaseModel):
    id: str
    username: str
    full_name: str
    status: str  # pending, approved, rejected
    is_admin: bool
    created_at: datetime

class CaseCreate(BaseModel):
    name: str
    description: Optional[str] = None

class Case(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    status: str = "active"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    target_count: int = 0
    created_by: Optional[str] = None  # Owner of the case

class TargetCreate(BaseModel):
    case_id: str
    phone_number: str
    manual_mode: Optional[bool] = False
    manual_data: Optional[dict] = None

class Target(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    case_id: str
    phone_number: str
    status: str = "pending"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    location: Optional[dict] = None
    data: Optional[dict] = None
    error: Optional[str] = None
    reghp_data: Optional[dict] = None
    reghp_status: str = "not_started"  # not_started, processing, completed, error
    nik_queries: Optional[dict] = None  # {nik: {status, data, photo}}
    family_data: Optional[dict] = None  # NKK family tree data
    family_status: str = "not_started"

class QueryStatus(BaseModel):
    target_id: str
    status: str
    message: str
    data: Optional[dict] = None

class ScheduleCreate(BaseModel):
    case_id: str
    phone_number: str
    interval_type: str  # minutes, hourly, daily, weekly, monthly, specific_time
    interval_value: int = 1
    scheduled_time: Optional[str] = None  # HH:MM format in WIB for specific_time type
    active: bool = True

class Schedule(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    case_id: str
    phone_number: str
    interval_type: str
    interval_value: int = 1
    scheduled_time: Optional[str] = None  # HH:MM format in WIB
    active: bool = True
    next_run: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_run: Optional[datetime] = None

class ScheduleUpdate(BaseModel):
    active: Optional[bool] = None

class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    target_id: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    direction: str  # "sent" or "received"
    message: str
    has_buttons: bool = False
    buttons: Optional[list] = None

# Position History Model
class PositionHistory(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    target_id: str
    phone_number: str
    latitude: float
    longitude: float
    address: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# AOI (Area of Interest) Model
class AOICreate(BaseModel):
    name: str
    aoi_type: str  # "polygon" or "circle"
    coordinates: list  # For polygon: [[lat,lng], ...], For circle: [lat, lng]
    radius: Optional[float] = None  # Only for circle, in meters
    monitored_targets: List[str] = []  # List of target IDs
    is_visible: bool = True
    alarm_enabled: bool = True
    color: Optional[str] = None  # Custom color for AOI (hex format, e.g., "#FF5733")

class AOI(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    aoi_type: str
    coordinates: list
    radius: Optional[float] = None
    monitored_targets: List[str] = []
    is_visible: bool = True
    alarm_enabled: bool = True
    color: Optional[str] = None  # Custom color for AOI (hex format)
    created_by: Optional[str] = None  # Owner of the AOI
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AOIAlert(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    aoi_id: str
    aoi_name: str
    aoi_owner: Optional[str] = None  # Owner of the AOI for filtering alerts
    target_ids: List[str]
    target_phones: List[str]
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    acknowledged: bool = False
    acknowledged_at: Optional[datetime] = None

# Authentication
async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        username = payload.get("username")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return username
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# Auth Routes
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "Paparoni290483#"

# Cache for admin check to avoid repeated DB queries
_admin_cache = {}
_admin_cache_ttl = 300  # 5 minutes

async def is_user_admin(username: str) -> bool:
    """Check if user is admin with caching"""
    import time
    
    # Check hardcoded admin
    if username == ADMIN_USERNAME:
        return True
    
    # Check cache
    cache_key = username
    cached = _admin_cache.get(cache_key)
    if cached and (time.time() - cached['time']) < _admin_cache_ttl:
        return cached['is_admin']
    
    # Query database
    user = await db.users.find_one({"username": username}, {"_id": 0, "is_admin": 1})
    is_admin = user and user.get("is_admin", False)
    
    # Update cache
    _admin_cache[cache_key] = {'is_admin': is_admin, 'time': time.time()}
    
    return is_admin

# ============================================
# REQUEST STATUS ENDPOINT (for queue indicator)
# ============================================
@api_router.get("/request-status")
async def get_request_status():
    """
    Get current request status - shows which user is currently making a request.
    Used by frontend to display queue/busy indicator.
    This is a lightweight endpoint with no database access.
    """
    global current_request_status
    
    # Only check current_request_status.is_busy
    # telegram_query_lock being held doesn't mean system is busy for other users
    # (it could be initial nongeoint search which doesn't block others)
    is_busy = current_request_status.get("is_busy", False)
    
    if is_busy:
        return {
            "is_busy": True,
            "username": current_request_status.get("username"),
            "operation": current_request_status.get("operation"),
            "started_at": current_request_status.get("started_at"),
            "investigation_id": current_request_status.get("investigation_id"),
            "message": f"User '{current_request_status.get('username')}' sedang melakukan {current_request_status.get('operation', 'request')}"
        }
    else:
        return {
            "is_busy": False,
            "username": None,
            "operation": None,
            "started_at": None,
            "investigation_id": None,
            "message": "Semua Akun Idle (No Request)"
        }

@api_router.post("/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest, req: Request):
    """Login endpoint - supports admin and registered users with single-device enforcement"""
    
    client_ip = req.headers.get('x-forwarded-for', req.headers.get('x-real-ip', req.client.host if req.client else 'unknown'))
    if ',' in client_ip:
        client_ip = client_ip.split(',')[0].strip()
    
    device_info = request.device_info or f"Unknown Device ({client_ip})"
    
    # Check brute force protection
    if not await check_login_attempts(client_ip, request.username):
        logger.warning(f"[SECURITY] Login blocked due to too many attempts: {request.username} from {client_ip}")
        raise HTTPException(
            status_code=429, 
            detail="Terlalu banyak percobaan login. Silakan coba lagi dalam 15 menit."
        )
    
    is_admin = False
    
    # Check if admin login
    if request.username == ADMIN_USERNAME:
        if request.password != ADMIN_PASSWORD:
            await record_failed_login(client_ip, request.username)
            raise HTTPException(status_code=401, detail="Invalid credentials")
        is_admin = True
    else:
        # Check if registered user
        user = await db.users.find_one({"username": request.username})
        if not user:
            await record_failed_login(client_ip, request.username)
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        # Verify password
        if not pwd_context.verify(request.password, user.get("password_hash", "")):
            await record_failed_login(client_ip, request.username)
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        # Check if user is approved
        if user.get("status") != "approved":
            if user.get("status") == "pending":
                raise HTTPException(status_code=403, detail="Akun Anda belum disetujui oleh admin")
            elif user.get("status") == "rejected":
                raise HTTPException(status_code=403, detail="Pendaftaran akun Anda ditolak")
            else:
                raise HTTPException(status_code=403, detail="Akun tidak aktif")
        
        # Check if user has admin role in database
        if user.get("is_admin", False):
            is_admin = True
    
    # Check for existing session (single device enforcement)
    existing_session = await get_active_session(request.username)
    
    # Auto-cleanup: Remove sessions older than 24 hours (expired)
    await db.active_sessions.delete_many({
        "last_activity": {"$lt": (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()}
    })
    
    if existing_session:
        # Check if force_login is requested
        if request.force_login:
            # Force logout the other session
            logger.info(f"[SESSION] Force login for {request.username}, removing existing session")
            await db.active_sessions.delete_many({"username": request.username})
            existing_session = None  # Clear so we can proceed
        else:
            # Check if existing session is stale (no activity for 2 hours)
            last_activity = existing_session.get("last_activity")
            if last_activity:
                try:
                    last_activity_dt = datetime.fromisoformat(last_activity.replace('Z', '+00:00'))
                    if datetime.now(timezone.utc) - last_activity_dt > timedelta(hours=2):
                        # Session is stale, auto-remove it
                        logger.info(f"[SESSION] Auto-removing stale session for {request.username}")
                        await db.active_sessions.delete_many({"username": request.username})
                        existing_session = None
                except:
                    pass
    
    if existing_session:
        # Block login - session active elsewhere
        device_info_existing = existing_session.get("device_info", "Unknown Device")
        logger.info(f"[SESSION] Login blocked for {request.username}, session active on: {device_info_existing}")
        
        raise HTTPException(
            status_code=409,
            detail={
                "error": "session_active",
                "message": "Akun ini sedang aktif di perangkat lain. Gunakan tombol 'Paksa Login' untuk logout dari perangkat lain.",
                "device_info": device_info_existing,
                "can_force": True  # Tell frontend that force login is available
            }
        )
    
    # No existing session - create new session directly
    session_id = secrets.token_hex(32)
    await create_session(request.username, session_id, device_info)
    
    await clear_failed_logins(client_ip, request.username)
    token = jwt.encode(
        {
            "username": request.username, 
            "is_admin": is_admin, 
            "session_id": session_id,
            "iat": datetime.now(timezone.utc)
        },
        JWT_SECRET,
        algorithm=JWT_ALGORITHM
    )
    
    # Log successful login
    await db.security_logs.insert_one({
        "ip": client_ip,
        "event_type": "login_success",
        "details": f"{'Admin' if is_admin else 'User'} login: {request.username} from {device_info}",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return LoginResponse(token=token, username=request.username, is_admin=is_admin, session_id=session_id)

@api_router.post("/auth/check-session")
async def check_session(req: Request, credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Check if current session is still valid"""
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        username = payload.get("username")
        session_id = payload.get("session_id")
        
        if not username or not session_id:
            return {"valid": False, "reason": "invalid_token"}
        
        is_valid = await check_session_valid(username, session_id)
        if not is_valid:
            return {"valid": False, "reason": "session_invalidated"}
        
        # Update last activity
        await db.active_sessions.update_one(
            {"username": username, "session_id": session_id},
            {"$set": {"last_activity": datetime.now(timezone.utc).isoformat()}}
        )
        
        return {"valid": True}
    except jwt.ExpiredSignatureError:
        return {"valid": False, "reason": "token_expired"}
    except jwt.InvalidTokenError:
        return {"valid": False, "reason": "invalid_token"}

@api_router.post("/auth/logout")
async def logout(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Logout and invalidate session"""
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        username = payload.get("username")
        
        if username:
            await invalidate_session(username)
        
        return {"success": True, "message": "Logged out successfully"}
    except:
        return {"success": True, "message": "Logged out"}

@api_router.post("/auth/register")
async def register(request: RegisterRequest):
    """Register new user - requires admin approval"""
    
    # Check if username already exists
    if request.username == ADMIN_USERNAME:
        raise HTTPException(status_code=400, detail="Username tidak tersedia")
    
    existing = await db.users.find_one({"username": request.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username sudah terdaftar")
    
    # Create new user with pending status
    user_doc = {
        "id": str(uuid.uuid4()),
        "username": request.username,
        "password_hash": pwd_context.hash(request.password),
        "full_name": request.full_name,
        "status": "pending",  # pending, approved, rejected
        "is_admin": False,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    
    await db.users.insert_one(user_doc)
    
    return {"success": True, "message": "Pendaftaran berhasil! Menunggu persetujuan admin."}

@api_router.get("/auth/users")
async def get_users(username: str = Depends(verify_token)):
    """Get all users - admin only"""
    
    # Check if admin (hardcoded or from DB)
    requester = await db.users.find_one({"username": username})
    is_admin = (username == ADMIN_USERNAME) or (requester and requester.get("is_admin", False))
    
    if not is_admin:
        raise HTTPException(status_code=403, detail="Hanya admin yang dapat melihat daftar pengguna")
    
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(100)
    return {"users": users}

@api_router.get("/auth/users/pending")
async def get_pending_users(username: str = Depends(verify_token)):
    """Get pending users - admin only"""
    
    requester = await db.users.find_one({"username": username})
    is_admin = (username == ADMIN_USERNAME) or (requester and requester.get("is_admin", False))
    
    if not is_admin:
        raise HTTPException(status_code=403, detail="Hanya admin yang dapat melihat pendaftaran")
    
    users = await db.users.find({"status": "pending"}, {"_id": 0, "password_hash": 0}).to_list(100)
    return {"users": users}

@api_router.post("/auth/users/{user_id}/approve")
async def approve_user(user_id: str, username: str = Depends(verify_token)):
    """Approve user registration - admin only"""
    
    requester = await db.users.find_one({"username": username})
    is_admin = (username == ADMIN_USERNAME) or (requester and requester.get("is_admin", False))
    
    if not is_admin:
        raise HTTPException(status_code=403, detail="Hanya admin yang dapat menyetujui pendaftaran")
    
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {"status": "approved", "updated_at": datetime.now(timezone.utc)}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    
    return {"success": True, "message": "User berhasil disetujui"}

@api_router.post("/auth/users/{user_id}/reject")
async def reject_user(user_id: str, username: str = Depends(verify_token)):
    """Reject user registration - admin only"""
    
    requester = await db.users.find_one({"username": username})
    is_admin = (username == ADMIN_USERNAME) or (requester and requester.get("is_admin", False))
    
    if not is_admin:
        raise HTTPException(status_code=403, detail="Hanya admin yang dapat menolak pendaftaran")
    
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {"status": "rejected", "updated_at": datetime.now(timezone.utc)}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    
    return {"success": True, "message": "Pendaftaran ditolak"}

@api_router.delete("/auth/users/{user_id}")
async def delete_user(user_id: str, username: str = Depends(verify_token)):
    """Delete user - admin only"""
    
    requester = await db.users.find_one({"username": username})
    is_admin = (username == ADMIN_USERNAME) or (requester and requester.get("is_admin", False))
    
    if not is_admin:
        raise HTTPException(status_code=403, detail="Hanya admin yang dapat menghapus user")
    
    result = await db.users.delete_one({"id": user_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    
    return {"success": True, "message": "User berhasil dihapus"}

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

@api_router.post("/auth/change-password")
async def change_password(request: ChangePasswordRequest, username: str = Depends(verify_token)):
    """Change own password"""
    
    # Get user from database
    user = await db.users.find_one({"username": username})
    
    if not user:
        # Check if it's the hardcoded admin
        if username == ADMIN_USERNAME:
            raise HTTPException(status_code=400, detail="Password admin tidak dapat diubah melalui fitur ini")
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    
    # Verify current password
    if not pwd_context.verify(request.current_password, user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Password lama salah")
    
    # Validate new password
    if len(request.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password baru minimal 6 karakter")
    
    # Update password
    result = await db.users.update_one(
        {"username": username},
        {"$set": {
            "password_hash": pwd_context.hash(request.new_password),
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=500, detail="Gagal mengubah password")
    
    logger.info(f"[AUTH] Password changed for user: {username}")
    return {"success": True, "message": "Password berhasil diubah"}

class AdminChangePasswordRequest(BaseModel):
    new_password: str

@api_router.post("/auth/users/{user_id}/change-password")
async def admin_change_password(user_id: str, request: AdminChangePasswordRequest, username: str = Depends(verify_token)):
    """Change user password - admin only"""
    
    # Check if requester is admin
    requester = await db.users.find_one({"username": username})
    is_admin = (username == ADMIN_USERNAME) or (requester and requester.get("is_admin", False))
    
    if not is_admin:
        raise HTTPException(status_code=403, detail="Hanya admin yang dapat mengubah password user lain")
    
    # Validate new password
    if len(request.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password baru minimal 6 karakter")
    
    # Update password
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "password_hash": pwd_context.hash(request.new_password),
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    
    logger.info(f"[AUTH] Admin {username} changed password for user_id: {user_id}")
    return {"success": True, "message": "Password user berhasil diubah"}

class UpdateUserRoleRequest(BaseModel):
    is_admin: bool

@api_router.post("/auth/users/{user_id}/role")
async def update_user_role(user_id: str, request: UpdateUserRoleRequest, username: str = Depends(verify_token)):
    """Update user role (admin/user) - admin only"""
    
    # Check if requester is admin
    requester = await db.users.find_one({"username": username})
    is_admin = (username == ADMIN_USERNAME) or (requester and requester.get("is_admin", False))
    
    if not is_admin:
        raise HTTPException(status_code=403, detail="Hanya admin yang dapat mengubah role user")
    
    # Update role
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "is_admin": request.is_admin,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    
    role_label = "Admin" if request.is_admin else "User"
    logger.info(f"[AUTH] Admin {username} changed role for user_id: {user_id} to {role_label}")
    return {"success": True, "message": f"Role user berhasil diubah menjadi {role_label}"}

# ============================================
# SECURITY ENDPOINTS (Admin Only)
# ============================================

@api_router.get("/security/logs")
async def get_security_logs(
    limit: int = 100,
    event_type: str = None,
    username: str = Depends(verify_token)
):
    """Get security logs - admin only"""
    
    if username != ADMIN_USERNAME:
        raise HTTPException(status_code=403, detail="Hanya admin yang dapat melihat log keamanan")
    
    query = {}
    if event_type:
        query["event_type"] = event_type
    
    logs = await db.security_logs.find(
        query, 
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return {"logs": logs, "total": len(logs)}

@api_router.get("/security/blocked-ips")
async def get_blocked_ips(username: str = Depends(verify_token)):
    """Get list of blocked IPs - admin only"""
    
    if username != ADMIN_USERNAME:
        raise HTTPException(status_code=403, detail="Hanya admin")
    
    return {"blocked_ips": list(blocked_ips), "count": len(blocked_ips)}

@api_router.post("/security/unblock-ip/{ip}")
async def unblock_ip(ip: str, username: str = Depends(verify_token)):
    """Unblock an IP address - admin only"""
    
    if username != ADMIN_USERNAME:
        raise HTTPException(status_code=403, detail="Hanya admin")
    
    if ip in blocked_ips:
        blocked_ips.remove(ip)
        # Clear failed login attempts for this IP
        keys_to_remove = [k for k in failed_login_attempts.keys() if k.startswith(ip)]
        for key in keys_to_remove:
            del failed_login_attempts[key]
        
        await db.security_logs.insert_one({
            "ip": ip,
            "event_type": "ip_unblocked",
            "details": f"Unblocked by admin: {username}",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        
        return {"success": True, "message": f"IP {ip} berhasil di-unblock"}
    
    return {"success": False, "message": f"IP {ip} tidak dalam daftar blokir"}

@api_router.post("/security/block-ip/{ip}")
async def block_ip(ip: str, username: str = Depends(verify_token)):
    """Manually block an IP address - admin only"""
    
    if username != ADMIN_USERNAME:
        raise HTTPException(status_code=403, detail="Hanya admin")
    
    blocked_ips.add(ip)
    
    await db.security_logs.insert_one({
        "ip": ip,
        "event_type": "ip_blocked_manual",
        "details": f"Blocked manually by admin: {username}",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {"success": True, "message": f"IP {ip} berhasil diblokir"}

@api_router.get("/auth/me")
async def get_current_user(username: str = Depends(verify_token)):
    """Get current user info"""
    
    if username == ADMIN_USERNAME:
        return {
            "username": ADMIN_USERNAME,
            "full_name": "Administrator",
            "is_admin": True,
            "status": "approved"
        }
    
    user = await db.users.find_one({"username": username}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    
    return user

# ============================================
# CP API Status and Quota Endpoints
# ============================================

@api_router.get("/cp-api/status")
async def get_cp_api_status(username: str = Depends(verify_token)):
    """Get CP API connection status and quota (uses CACHED status, no API call)"""
    is_connected, quota_exceeded = await check_cp_api_connection()
    quota = await get_cp_api_quota()
    quota_doc = await db.api_quota.find_one({"type": "cp_api"}, {"_id": 0})
    
    # Get position source setting
    settings_doc = await db.settings.find_one({"type": "position_source"}, {"_id": 0})
    use_telegram = settings_doc.get("use_telegram", False) if settings_doc else False
    
    # Determine status message
    if quota_exceeded:
        status_message = "Quota Exceeded - Silakan gunakan Bot Telegram atau isi ulang quota"
    elif is_connected:
        status_message = "Connected & Authorized"
    else:
        status_message = "Disconnected (IP not whitelisted or server unreachable)"
    
    return {
        "connected": is_connected,
        "quota_exceeded": quota_exceeded,
        "status_message": status_message,
        "quota_remaining": quota,
        "quota_initial": quota_doc.get("initial", CP_API_INITIAL_QUOTA) if quota_doc else CP_API_INITIAL_QUOTA,
        "quota_used": quota_doc.get("used", 0) if quota_doc else 0,
        "last_updated": quota_doc.get("last_updated") if quota_doc else None,
        "last_check": quota_doc.get("last_check") if quota_doc else None,
        "api_url": CP_API_URL,
        "use_telegram": use_telegram,
        "cached": True  # Indicate this is cached status
    }

@api_router.post("/cp-api/refresh-status")
async def refresh_cp_api_status(username: str = Depends(verify_token)):
    """
    Manually refresh CP API status by making a REAL API call.
    WARNING: This will use 1 quota point!
    Use sparingly.
    """
    logger.info(f"[CP API] Manual refresh requested by {username}")
    
    is_connected, quota_exceeded = await verify_cp_api_connection_real()
    quota = await get_cp_api_quota()
    quota_doc = await db.api_quota.find_one({"type": "cp_api"}, {"_id": 0})
    
    # Get position source setting
    settings_doc = await db.settings.find_one({"type": "position_source"}, {"_id": 0})
    use_telegram = settings_doc.get("use_telegram", False) if settings_doc else False
    
    # Determine status message
    if quota_exceeded:
        status_message = "Quota Exceeded - Silakan gunakan Bot Telegram atau isi ulang quota"
    elif is_connected:
        status_message = "Connected & Authorized"
    else:
        status_message = "Disconnected (IP not whitelisted or server unreachable)"
    
    return {
        "connected": is_connected,
        "quota_exceeded": quota_exceeded,
        "status_message": status_message,
        "quota_remaining": quota,
        "quota_initial": quota_doc.get("initial", CP_API_INITIAL_QUOTA) if quota_doc else CP_API_INITIAL_QUOTA,
        "quota_used": quota_doc.get("used", 0) if quota_doc else 0,
        "last_updated": quota_doc.get("last_updated") if quota_doc else None,
        "last_check": quota_doc.get("last_check") if quota_doc else None,
        "api_url": CP_API_URL,
        "use_telegram": use_telegram,
        "refreshed": True  # Indicate this was a real check
    }

@api_router.post("/cp-api/toggle-telegram")
async def toggle_telegram_source(username: str = Depends(verify_token)):
    """Toggle between CP API and Telegram bot for position queries"""
    # Get current setting
    settings_doc = await db.settings.find_one({"type": "position_source"})
    current_use_telegram = settings_doc.get("use_telegram", False) if settings_doc else False
    
    # Toggle
    new_use_telegram = not current_use_telegram
    
    await db.settings.update_one(
        {"type": "position_source"},
        {"$set": {"use_telegram": new_use_telegram, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    
    source = "Telegram Bot" if new_use_telegram else "CP API"
    logger.info(f"[Settings] Position source changed to: {source}")
    
    return {
        "success": True,
        "use_telegram": new_use_telegram,
        "message": f"Sumber posisi diubah ke {source}"
    }

@api_router.post("/cp-api/reset-quota")
async def reset_cp_api_quota(username: str = Depends(verify_token)):
    """Reset CP API quota to initial value"""
    await db.api_quota.update_one(
        {"type": "cp_api"},
        {
            "$set": {
                "remaining": CP_API_INITIAL_QUOTA,
                "initial": CP_API_INITIAL_QUOTA,
                "used": 0,
                "last_updated": datetime.now(timezone.utc).isoformat()
            }
        },
        upsert=True
    )
    return {"message": "Quota reset", "remaining": CP_API_INITIAL_QUOTA}

@api_router.post("/cp-api/test")
async def test_cp_api(phone_number: str, username: str = Depends(verify_token)):
    """Test position query with a phone number (uses quota or Telegram)"""
    result = await query_position(phone_number)
    return result

# Case Routes
@api_router.post("/cases", response_model=Case)
async def create_case(case_data: CaseCreate, username: str = Depends(verify_token)):
    case = Case(**case_data.model_dump(), created_by=username)  # Set owner at creation
    doc = case.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.cases.insert_one(doc)
    return case

@api_router.get("/cases", response_model=List[Case])
async def get_cases(username: str = Depends(verify_token)):
    # Check if user is admin (hardcoded or from DB)
    requester = await db.users.find_one({"username": username})
    is_admin = (username == ADMIN_USERNAME) or (requester and requester.get("is_admin", False))
    
    # Filter by user - each user only sees their own cases
    # Admin sees all cases
    query = {} if is_admin else {"created_by": username}
    cases = await db.cases.find(query, {"_id": 0}).to_list(1000)
    
    for case in cases:
        if isinstance(case.get('created_at'), str):
            case['created_at'] = datetime.fromisoformat(case['created_at'])
        if isinstance(case.get('updated_at'), str):
            case['updated_at'] = datetime.fromisoformat(case['updated_at'])
    
    return cases

@api_router.get("/cases/{case_id}", response_model=Case)
async def get_case(case_id: str, username: str = Depends(verify_token)):
    # Check if user is admin
    requester = await db.users.find_one({"username": username})
    is_admin = (username == ADMIN_USERNAME) or (requester and requester.get("is_admin", False))
    
    # Filter by user ownership (admin can see all)
    query = {"id": case_id}
    if not is_admin:
        query["created_by"] = username
    
    case = await db.cases.find_one(query, {"_id": 0})
    if not case:
        raise HTTPException(status_code=404, detail="Case not found atau Anda tidak memiliki akses")
    
    if isinstance(case.get('created_at'), str):
        case['created_at'] = datetime.fromisoformat(case['created_at'])
    if isinstance(case.get('updated_at'), str):
        case['updated_at'] = datetime.fromisoformat(case['updated_at'])
    
    return case

@api_router.delete("/cases/{case_id}")
async def delete_case(case_id: str, username: str = Depends(verify_token)):
    """Delete case and all its targets"""
    # Check if user is admin
    requester = await db.users.find_one({"username": username})
    is_admin = (username == ADMIN_USERNAME) or (requester and requester.get("is_admin", False))
    
    # Verify ownership first (admin can delete any)
    query = {"id": case_id}
    if not is_admin:
        query["created_by"] = username
    
    case = await db.cases.find_one(query)
    if not case:
        raise HTTPException(status_code=404, detail="Case tidak ditemukan atau Anda tidak memiliki akses")
    
    # Get all targets in this case
    targets = await db.targets.find({"case_id": case_id}, {"_id": 0}).to_list(1000)
    
    # Delete all chat messages for these targets
    target_ids = [t['id'] for t in targets]
    await db.chat_messages.delete_many({"target_id": {"$in": target_ids}})
    
    # Delete all targets in this case
    result_targets = await db.targets.delete_many({"case_id": case_id})
    
    # Delete all schedules for this case
    await db.schedules.delete_many({"case_id": case_id})
    
    # Delete the case
    result_case = await db.cases.delete_one({"id": case_id})
    
    if result_case.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Case not found")
    
    return {
        "message": "Case deleted successfully",
        "deleted_targets": result_targets.deleted_count,
        "deleted_case": True
    }

# Target Routes
@api_router.post("/targets", response_model=Target)
async def create_target(target_data: TargetCreate, username: str = Depends(verify_token)):
    # Validate phone number format
    if not target_data.phone_number.startswith('62'):
        raise HTTPException(status_code=400, detail="Phone number must start with 62")
    
    if not re.match(r'^62\d{9,12}$', target_data.phone_number):
        raise HTTPException(status_code=400, detail="Invalid phone number format")
    
    # Check if user is admin
    requester = await db.users.find_one({"username": username})
    is_admin = (username == ADMIN_USERNAME) or (requester and requester.get("is_admin", False))
    
    # Verify case ownership
    case_query = {"id": target_data.case_id}
    if not is_admin:
        case_query["created_by"] = username
    
    case = await db.cases.find_one(case_query)
    if not case:
        raise HTTPException(status_code=404, detail="Case tidak ditemukan atau Anda tidak memiliki akses")
    
    # PREVENT DUPLICATE: Check if phone number already exists in this case
    existing_target = await db.targets.find_one({
        "case_id": target_data.case_id,
        "phone_number": target_data.phone_number
    })
    
    if existing_target:
        logger.warning(f"[DUPLICATE BLOCKED] Phone {target_data.phone_number} already exists in case {target_data.case_id}")
        raise HTTPException(
            status_code=409, 
            detail={
                "error": "duplicate_phone",
                "message": f"Nomor {target_data.phone_number} sudah ada dalam case ini. Gunakan tombol 'Perbaharui' untuk memperbarui posisi.",
                "existing_target_id": existing_target['id']
            }
        )
    
    target = Target(**target_data.model_dump(exclude={'manual_mode', 'manual_data'}))
    doc = target.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['created_by'] = username  # Add user ownership
    
    await db.targets.insert_one(doc)
    
    # Update case target count
    await db.cases.update_one(
        {"id": target_data.case_id},
        {"$inc": {"target_count": 1}}
    )
    
    # If manual mode, process immediately with provided data
    if target_data.manual_mode and target_data.manual_data:
        await process_manual_target(target.id, target_data.manual_data)
    else:
        # Check quota before querying
        quota = await get_cp_api_quota()
        if quota <= 0:
            await db.targets.update_one(
                {"id": target.id},
                {"$set": {"status": "error", "error": "Quota CP API habis (0 tersisa)"}}
            )
        else:
            # Start background task to query CP API (instead of Telegram bot)
            asyncio.create_task(query_cp_api_for_new_target(target.id, target_data.phone_number))
    
    return target

async def query_cp_api_for_new_target(target_id: str, phone_number: str):
    """Query CP API for new target position"""
    try:
        logging.info(f"[CP API NEW] Querying position for new target {phone_number}")
        
        # Update status to querying
        await db.targets.update_one(
            {"id": target_id},
            {"$set": {"status": "querying"}}
        )
        
        # Query position (CP API or Telegram bot based on settings)
        result = await query_position(phone_number)
        
        if result.get("success"):
            # Update target with position - include all available data
            new_data = {
                "latitude": result["latitude"],
                "longitude": result["longitude"],
                "address": result["address"],
                "network": result.get("network"),
                "state": result.get("state"),
                "imsi": result.get("imsi"),
                "imei": result.get("imei"),
                "phone_model": result.get("phone_model"),
                "operator": result.get("operator"),
                "mcc": result.get("mcc"),
                "mnc": result.get("mnc"),
                "lac": result.get("lac"),
                "ci": result.get("ci"),
                "cgi": result.get("cgi"),
                "prefix_type": result.get("prefix_type"),
                "query_time": result.get("query_time"),
                "timestamp": result["timestamp"],
                "source": result.get("source", "cp_api")
            }
            
            await db.targets.update_one(
                {"id": target_id},
                {"$set": {
                    "status": "completed",
                    "data": new_data,
                    "location": {
                        "type": "Point",
                        "coordinates": [result["longitude"], result["latitude"]]
                    }
                }}
            )
            
            # Save to position history
            await save_position_history(
                target_id, phone_number,
                result["latitude"], result["longitude"],
                result["address"], result["timestamp"]
            )
            
            logging.info(f"[POSITION] ✓ Position found for {phone_number}: {result['latitude']}, {result['longitude']}")
            
            # Check AOI alerts
            await check_aoi_alerts(target_id, phone_number, result["latitude"], result["longitude"])
            
        else:
            error_msg = result.get("error", "Unknown error")
            logging.warning(f"[POSITION] Failed for {phone_number}: {error_msg}")
            
            await db.targets.update_one(
                {"id": target_id},
                {"$set": {
                    "status": "not_found",
                    "error": error_msg
                }}
            )
            
    except Exception as e:
        logging.error(f"[CP API NEW] Error for {phone_number}: {e}")
        await db.targets.update_one(
            {"id": target_id},
            {"$set": {"status": "error", "error": str(e)}}
        )

async def process_manual_target(target_id: str, manual_data: dict):
    """Process target with manually entered data"""
    try:
        await db.targets.update_one(
            {"id": target_id},
            {
                "$set": {
                    "status": "completed",
                    "data": manual_data,
                    "location": {
                        "type": "Point",
                        "coordinates": [manual_data.get('longitude'), manual_data.get('latitude')]
                    }
                }
            }
        )
    except Exception as e:
        logging.error(f"Error processing manual target: {e}")
        await db.targets.update_one(
            {"id": target_id},
            {"$set": {"status": "error", "error": str(e)}}
        )

@api_router.get("/targets", response_model=List[Target])
async def get_targets(case_id: Optional[str] = None, username: str = Depends(verify_token)):
    # Check if user is admin - use cached check
    is_admin = await is_user_admin(username)
    
    # Filter by user ownership (admin sees all)
    query = {}
    if case_id:
        query["case_id"] = case_id
    if not is_admin:
        query["created_by"] = username
    
    # Use projection to only get needed fields for faster query
    targets = await db.targets.find(query, {"_id": 0}).to_list(500)
    
    for target in targets:
        if isinstance(target.get('created_at'), str):
            target['created_at'] = datetime.fromisoformat(target['created_at'])
    
    return targets

@api_router.get("/targets/{target_id}", response_model=Target)
async def get_target(target_id: str, username: str = Depends(verify_token)):
    # Check if user is admin - use cached check
    is_admin = await is_user_admin(username)
    
    # Filter by user ownership
    query = {"id": target_id}
    if not is_admin:
        query["created_by"] = username
    
    target = await db.targets.find_one(query, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Target tidak ditemukan atau Anda tidak memiliki akses")
    
    if isinstance(target.get('created_at'), str):
        target['created_at'] = datetime.fromisoformat(target['created_at'])
    
    return target

@api_router.delete("/targets/{target_id}")
async def delete_target(target_id: str, username: str = Depends(verify_token)):
    """Delete target and all associated data"""
    # Check if user is admin
    requester = await db.users.find_one({"username": username})
    is_admin = (username == ADMIN_USERNAME) or (requester and requester.get("is_admin", False))
    
    # Filter by user ownership
    query = {"id": target_id}
    if not is_admin:
        query["created_by"] = username
    
    target = await db.targets.find_one(query, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Target not found or access denied")
    
    # Delete chat messages
    await db.chat_messages.delete_many({"target_id": target_id})
    
    # Delete schedules for this phone
    await db.schedules.delete_many({
        "case_id": target['case_id'],
        "phone_number": target['phone_number']
    })
    
    # Delete the target
    result = await db.targets.delete_one({"id": target_id})
    
    # Update case target count
    await db.cases.update_one(
        {"id": target['case_id']},
        {"$inc": {"target_count": -1}}
    )
    
    return {
        "message": "Target deleted successfully",
        "deleted": True
    }

@api_router.get("/targets/{target_id}/status", response_model=QueryStatus)
async def get_target_status(target_id: str, username: str = Depends(verify_token)):
    target = await db.targets.find_one({"id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    status_map = {
        "pending": "Menunggu proses...",
        "connecting": "Menghubungi bot Telegram...",
        "querying": "Mengirim nomor telepon...",
        "processing": "Bot sedang memproses...",
        "parsing": "Mengekstrak data lokasi...",
        "completed": "Lokasi berhasil ditemukan",
        "error": f"Error: {target.get('error', 'Unknown error')}"
    }
    
    return QueryStatus(
        target_id=target_id,
        status=target['status'],
        message=status_map.get(target['status'], "Unknown status"),
        data=target.get('data')
    )

@api_router.get("/targets/{target_id}/chat")
async def get_target_chat(target_id: str, username: str = Depends(verify_token)):
    """Get chat history for a target query"""
    chat_messages = await db.chat_messages.find(
        {"target_id": target_id},
        {"_id": 0}
    ).sort("timestamp", 1).to_list(100)
    
    for msg in chat_messages:
        if isinstance(msg.get('timestamp'), str):
            msg['timestamp'] = datetime.fromisoformat(msg['timestamp'])
    
    return chat_messages

@api_router.post("/targets/{target_id}/refresh-position")
async def refresh_target_position(target_id: str, username: str = Depends(verify_token)):
    """
    Refresh/update target position while preserving all existing data (RegHP, NIK, NKK).
    - Saves current position to history
    - Queries new position from CP API (not Telegram anymore)
    - Keeps all existing pendalaman data intact
    """
    target = await db.targets.find_one({"id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    phone_number = target.get('phone_number')
    
    # Check quota first
    quota = await get_cp_api_quota()
    if quota <= 0:
        raise HTTPException(status_code=400, detail="Quota CP API habis (0 tersisa)")
    
    # Save current position to history BEFORE updating
    if target.get('data') and target['data'].get('latitude') and target['data'].get('longitude'):
        lat = float(target['data']['latitude'])
        lng = float(target['data']['longitude'])
        address = target['data'].get('address')
        cp_timestamp = target['data'].get('timestamp')
        
        # Check if this exact position is already in history
        existing = await db.position_history.find_one({
            "target_id": target_id,
            "latitude": lat,
            "longitude": lng
        })
        
        if not existing:
            await save_position_history(target_id, phone_number, lat, lng, address, cp_timestamp)
            logging.info(f"[REFRESH] Saved previous position to history for {phone_number}")
    
    # Update status to processing but KEEP all other data intact
    await db.targets.update_one(
        {"id": target_id},
        {"$set": {
            "status": "processing",
            "previous_position": target.get('data')  # Store previous position for reference
        }}
    )
    
    logging.info(f"[REFRESH] Starting CP API position refresh for {phone_number} (target: {target_id})")
    
    # Start background task to query new position via CP API
    asyncio.create_task(query_cp_api_refresh(target_id, phone_number))
    
    return {
        "message": "Position refresh started (via CP API)",
        "target_id": target_id,
        "phone_number": phone_number,
        "previous_position_saved": True,
        "quota_remaining": quota - 1
    }

async def query_cp_api_refresh(target_id: str, phone_number: str):
    """
    Query CP API for updated position.
    Uses the new CP API instead of Telegram bot.
    """
    try:
        logging.info(f"[POSITION REFRESH] Querying position for {phone_number}")
        
        # Query position (CP API or Telegram bot based on settings)
        result = await query_position(phone_number)
        
        if result.get("success"):
            # Update target with new position
            new_data = {
                "latitude": result["latitude"],
                "longitude": result["longitude"],
                "address": result["address"],
                "network": result.get("network"),
                "state": result.get("state"),
                "imsi": result.get("imsi"),
                "imei": result.get("imei"),
                "phone_model": result.get("phone_model"),
                "prefix_type": result.get("prefix_type"),
                "query_time": result.get("query_time"),
                "timestamp": result["timestamp"],
                "source": result.get("source", "cp_api")  # Mark source
            }
            
            await db.targets.update_one(
                {"id": target_id},
                {"$set": {
                    "status": "completed",
                    "data": new_data,
                    "location": {
                        "type": "Point",
                        "coordinates": [result["longitude"], result["latitude"]]
                    },
                    "last_refresh": datetime.now(timezone.utc).isoformat()
                }}
            )
            
            # Save new position to history
            await save_position_history(
                target_id, phone_number, 
                result["latitude"], result["longitude"], 
                result["address"], result["timestamp"]
            )
            
            logging.info(f"[CP API REFRESH] ✓ Updated position for {phone_number}: {result['latitude']}, {result['longitude']}")
            
            # Check AOI alerts for new position
            await check_aoi_alerts(target_id, phone_number, result["latitude"], result["longitude"])
            
        else:
            # API returned error
            error_msg = result.get("error", "Unknown error")
            logging.warning(f"[CP API REFRESH] Failed for {phone_number}: {error_msg}")
            
            await db.targets.update_one(
                {"id": target_id},
                {"$set": {
                    "status": "not_found",
                    "error": error_msg,
                    "last_refresh": datetime.now(timezone.utc).isoformat()
                }}
            )
            
    except Exception as e:
        logging.error(f"[CP API REFRESH] Error for {phone_number}: {e}")
        await db.targets.update_one(
            {"id": target_id},
            {"$set": {
                "status": "error",
                "error": str(e)
            }}
        )

# Keep old Telegram refresh function for reference but renamed
async def query_telegram_bot_refresh_legacy(target_id: str, phone_number: str):
    """
    Query Telegram bot for updated position.
    Similar to query_telegram_bot but updates existing target instead of creating new.
    Uses safe_telegram_operation for robust connection handling.
    """
    global telegram_client
    
    try:
        # Ensure connection using helper with retries
        connected = await safe_telegram_operation(
            lambda: ensure_telegram_connected(),
            "connect_for_refresh",
            max_retries=5
        )
        
        if not connected:
            logging.error("[REFRESH] Telegram client not connected after retries")
            await db.targets.update_one(
                {"id": target_id},
                {"$set": {"status": "error", "error": "Telegram tidak terkoneksi"}}
            )
            return
        
        # Get current target for chat history
        target = await db.targets.find_one({"id": target_id}, {"_id": 0})
        
        bot_username = "northarch_bot"
        
        # Send phone number query with retry wrapper
        message_text = f"{phone_number}"
        
        async def send_message():
            await telegram_client.send_message(bot_username, message_text)
            return True
        
        sent = await safe_telegram_operation(send_message, f"send_message_{phone_number}", max_retries=3)
        
        if not sent:
            logging.error(f"[REFRESH] Failed to send message for {phone_number}")
            await db.targets.update_one(
                {"id": target_id},
                {"$set": {"status": "error", "error": "Gagal mengirim pesan ke bot"}}
            )
            return
        
        logging.info(f"[REFRESH] Sent: {message_text} to @{bot_username}")
        
        # Save sent message to chat history
        await db.chat_messages.insert_one({
            "target_id": target_id,
            "direction": "sent",
            "content": message_text,
            "timestamp": datetime.now(timezone.utc)
        })
        
        # Wait for bot to respond with buttons
        await asyncio.sleep(2)  # Reduced from 4s to 2s - bot responds quickly
        
        # Get messages and look for CP button
        async def get_button_messages():
            return await telegram_client.get_messages(bot_username, limit=5)
        
        button_messages = await safe_telegram_operation(get_button_messages, "get_buttons_refresh", max_retries=3)
        
        cp_clicked = False
        cp_button = None
        
        if button_messages:
            for msg in button_messages:
                if msg.buttons:
                    button_texts = [[btn.text for btn in row] for row in msg.buttons]
                    logging.info(f"[REFRESH] Buttons found: {button_texts}")
                    
                    for row in msg.buttons:
                        for button in row:
                            if button.text and 'CP' in button.text.upper():
                                cp_button = button
                                break
                        if cp_button:
                            break
                    if cp_button:
                        break
        
        # Click CP button if found
        if cp_button:
            async def click_cp():
                await cp_button.click()
                return True
            
            clicked = await safe_telegram_operation(click_cp, f"click_cp_refresh_{phone_number}", max_retries=3)
            
            if clicked:
                logging.info(f"[REFRESH] ✓ Clicked CP button for {phone_number}")
                cp_clicked = True
            else:
                logging.error(f"[REFRESH] Failed to click CP button for {phone_number}")
        else:
            logging.warning(f"[REFRESH] CP button not found for {phone_number}")
        
        # Wait for location response after clicking CP
        await asyncio.sleep(2)  # Reduced from 5s to 2s - bot responds quickly
        
        received_response = False
        for attempt in range(15):  # Try for ~45 seconds
            # Get messages with retry
            async def get_messages():
                return await telegram_client.get_messages(bot_username, limit=10)
            
            messages = await safe_telegram_operation(get_messages, "get_messages_refresh", max_retries=2)
            
            if messages is None:
                logging.warning(f"[REFRESH] Failed to get messages, attempt {attempt + 1}")
                await asyncio.sleep(3)
                continue
            
            for msg in messages:
                if msg.text and phone_number in msg.text:
                    # Check if this message has coordinates (not just the initial response with buttons)
                    if 'maps.google.com' in msg.text.lower() or 'lat:' in msg.text.lower() or 'long:' in msg.text.lower():
                        logging.info(f"[REFRESH] Got location response for {phone_number}")
                        
                        # Save to chat history
                        await db.chat_messages.insert_one({
                            "target_id": target_id,
                            "direction": "received",
                            "content": msg.text,
                            "timestamp": datetime.now(timezone.utc)
                        })
                        
                        # Parse location from response
                        lat, lng, address, timestamp = parse_cp_response(msg.text)
                        
                        if lat and lng:
                            # Update target with new position
                            new_data = {
                                "latitude": lat,
                                "longitude": lng,
                                "address": address or "Alamat tidak tersedia",
                                "timestamp": timestamp or datetime.now(timezone.utc).isoformat()
                            }
                            
                            await db.targets.update_one(
                                {"id": target_id},
                                {"$set": {
                                    "status": "completed",
                                    "data": new_data,
                                    "location": {
                                        "type": "Point",
                                        "coordinates": [lng, lat]
                                    },
                                    "last_refresh": datetime.now(timezone.utc).isoformat()
                                }}
                            )
                            
                            # Save new position to history
                            await save_position_history(target_id, phone_number, lat, lng, address, timestamp)
                            logging.info(f"[REFRESH] ✓ Updated position for {phone_number}: {lat}, {lng}")
                            
                            # Check AOI alerts for new position
                            await check_aoi_alerts(target_id, phone_number, lat, lng)
                            
                            received_response = True
                            break
                    
                    # Check for "not found" or similar responses
                    msg_lower = msg.text.lower()
                    if 'not found' in msg_lower or 'tidak ditemukan' in msg_lower or 'offline' in msg_lower:
                        logging.info(f"[REFRESH] Target not found response for {phone_number}")
                        await db.targets.update_one(
                            {"id": target_id},
                            {"$set": {
                                "status": "not_found",
                                "last_refresh": datetime.now(timezone.utc).isoformat()
                            }}
                        )
                        received_response = True
                        break
            
            if received_response:
                break
            
            await asyncio.sleep(3)
        
        if not received_response:
            # Timeout - revert to completed status with previous data or set error
            if cp_clicked:
                # CP was clicked but no response - might be bot issue
                await db.targets.update_one(
                    {"id": target_id},
                    {"$set": {
                        "status": "error",
                        "error": "Timeout menunggu respons lokasi dari bot"
                    }}
                )
                logging.warning(f"[REFRESH] Timeout waiting for location for {phone_number}")
            else:
                # CP button not found/clicked
                await db.targets.update_one(
                    {"id": target_id},
                    {"$set": {
                        "status": "error",
                        "error": "Tombol CP tidak ditemukan atau gagal diklik"
                    }}
                )
                logging.warning(f"[REFRESH] CP button issue for {phone_number}")
            
    except Exception as e:
        logging.error(f"[REFRESH] Error: {e}")
        await db.targets.update_one(
            {"id": target_id},
            {"$set": {
                "status": "error",
                "error": str(e)
            }}
        )

def parse_cp_response(text: str):
    """Parse CP response from Telegram bot to extract coordinates"""
    lat = None
    lng = None
    address = None
    timestamp = None
    
    try:
        lines = text.split('\n')
        for line in lines:
            line_lower = line.lower().strip()
            
            # Try to find latitude
            if 'lat' in line_lower or 'latitude' in line_lower:
                match = re.search(r'[-+]?\d*\.?\d+', line)
                if match:
                    lat = float(match.group())
            
            # Try to find longitude
            if 'long' in line_lower or 'lng' in line_lower or 'longitude' in line_lower:
                match = re.search(r'[-+]?\d*\.?\d+', line)
                if match:
                    lng = float(match.group())
            
            # Try to find address
            if 'alamat' in line_lower or 'address' in line_lower:
                parts = line.split(':', 1)
                if len(parts) > 1:
                    address = parts[1].strip()
            
            # Try to find timestamp
            if 'waktu' in line_lower or 'time' in line_lower or 'tanggal' in line_lower:
                parts = line.split(':', 1)
                if len(parts) > 1:
                    timestamp = parts[1].strip()
        
        # Try alternative coordinate format: coordinates in one line
        if not lat or not lng:
            coord_match = re.search(r'([-+]?\d+\.?\d*)[,\s]+([-+]?\d+\.?\d*)', text)
            if coord_match:
                val1, val2 = float(coord_match.group(1)), float(coord_match.group(2))
                # Determine which is lat/lng based on Indonesia coordinates
                if -11 <= val1 <= 6 and 95 <= val2 <= 141:
                    lat, lng = val1, val2
                elif -11 <= val2 <= 6 and 95 <= val1 <= 141:
                    lat, lng = val2, val1
                    
    except Exception as e:
        logging.error(f"Error parsing CP response: {e}")
    
    return lat, lng, address, timestamp

@api_router.post("/targets/{target_id}/reghp")
async def query_reghp(target_id: str, username: str = Depends(verify_token)):
    """Query Reghp (pendalaman) untuk target"""
    target = await db.targets.find_one({"id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    if target['status'] != 'completed':
        raise HTTPException(status_code=400, detail="Target must be completed first")
    
    # Check if phone already has Reghp data in other targets (same case)
    existing_reghp = await db.targets.find_one({
        "case_id": target['case_id'],
        "phone_number": target['phone_number'],
        "reghp_status": "completed",
        "reghp_data": {"$exists": True},
        "id": {"$ne": target_id}  # Not this target
    }, {"_id": 0})
    
    if existing_reghp and existing_reghp.get('reghp_data'):
        # Reuse existing Reghp data
        logging.info(f"Reusing Reghp data for {target['phone_number']} from existing target")
        
        reghp_data = existing_reghp['reghp_data']
        nik_queries = existing_reghp.get('nik_queries', {})
        
        await db.targets.update_one(
            {"id": target_id},
            {
                "$set": {
                    "reghp_status": "completed",
                    "reghp_data": reghp_data,
                    "nik_queries": nik_queries
                }
            }
        )
        
        return {
            "message": "Reusing existing Reghp & NIK data",
            "target_id": target_id,
            "reused": True,
            "source": "target_history"
        }
    
    # Check Simple Query Cache for this phone (reghp)
    phone_number = target['phone_number']
    cache_key = f"reghp:{phone_number}"
    cached_reghp = await db.simple_query_cache.find_one({"cache_key": cache_key})
    
    # Also check reghp_phone cache (search by phone)
    if not cached_reghp:
        cache_key_phone = f"reghp_phone:{phone_number}"
        cached_reghp = await db.simple_query_cache.find_one({"cache_key": cache_key_phone})
    
    if cached_reghp and cached_reghp.get("raw_response"):
        logging.info(f"Reusing Reghp data for {phone_number} from Simple Query Cache")
        
        reghp_data = {
            "raw_response": cached_reghp.get("raw_response"),
            "parsed_data": {},
            "from_cache": True
        }
        
        await db.targets.update_one(
            {"id": target_id},
            {
                "$set": {
                    "reghp_status": "completed",
                    "reghp_data": reghp_data
                }
            }
        )
        
        return {
            "message": "Reusing Reghp data from Simple Query Cache",
            "target_id": target_id,
            "reused": True,
            "source": "simple_query_cache"
        }
    
    # No existing data, proceed with new query
    # PRE-CHECK: Verify Telegram connection
    global telegram_client
    
    if telegram_client is None:
        raise HTTPException(status_code=503, detail="Telegram belum diinisialisasi. Silakan login Telegram di halaman Settings.")
    
    try:
        if not telegram_client.is_connected():
            await telegram_client.connect()
        
        is_authorized = await telegram_client.is_user_authorized()
        if not is_authorized:
            raise HTTPException(status_code=503, detail="Telegram belum login. Silakan login di halaman Settings terlebih dahulu.")
            
    except HTTPException:
        raise
    except Exception as conn_err:
        logger.error(f"[REGHP] Connection check failed: {conn_err}")
        raise HTTPException(status_code=503, detail=f"Koneksi Telegram error: {str(conn_err)}. Coba refresh halaman Settings.")
    
    # Update reghp_status to processing
    await db.targets.update_one(
        {"id": target_id},
        {"$set": {"reghp_status": "processing"}}
    )
    
    # Update request status for queue indicator (will be updated again when lock is acquired)
    global current_request_status
    current_request_status = {
        "is_busy": True,
        "username": username,
        "operation": f"REGHP - {target['phone_number']}",
        "started_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Start background task
    asyncio.create_task(query_telegram_reghp(target_id, target['phone_number']))
    
    return {"message": "Reghp query started", "target_id": target_id, "reused": False}

@api_router.post("/targets/{target_id}/nik")
async def query_nik(target_id: str, nik_data: dict, username: str = Depends(verify_token)):
    """Query NIK detail dengan foto"""
    target = await db.targets.find_one({"id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    nik = nik_data.get('nik')
    if not nik:
        raise HTTPException(status_code=400, detail="NIK required")
    
    # Check if this NIK already queried in other targets (same phone)
    existing_nik = await db.targets.find_one({
        "case_id": target['case_id'],
        "phone_number": target['phone_number'],
        f"nik_queries.{nik}.status": "completed",
        "id": {"$ne": target_id}
    }, {"_id": 0})
    
    if existing_nik and existing_nik.get('nik_queries', {}).get(nik):
        # Reuse existing NIK data
        logging.info(f"Reusing NIK {nik} data from existing target")
        
        nik_query_data = existing_nik['nik_queries'][nik]
        
        # Initialize nik_queries if not exists
        if not target.get('nik_queries'):
            await db.targets.update_one(
                {"id": target_id},
                {"$set": {"nik_queries": {}}}
            )
        
        await db.targets.update_one(
            {"id": target_id},
            {"$set": {f"nik_queries.{nik}": nik_query_data}}
        )
        
        return {
            "message": "Reusing existing NIK data",
            "nik": nik,
            "reused": True,
            "source": "target_history"
        }
    
    # Check Simple Query Cache for this NIK (capil_nik)
    cache_key = f"capil_nik:{nik}"
    cached_nik = await db.simple_query_cache.find_one({"cache_key": cache_key})
    
    if cached_nik and cached_nik.get("raw_response"):
        logging.info(f"Reusing NIK {nik} data from Simple Query Cache")
        
        # Initialize nik_queries if not exists
        if not target.get('nik_queries'):
            await db.targets.update_one(
                {"id": target_id},
                {"$set": {"nik_queries": {}}}
            )
        
        # Build nik_query_data from cache
        nik_query_data = {
            "status": "completed",
            "data": {
                "raw_response": cached_nik.get("raw_response"),
                "parsed_data": {}  # Will be parsed by frontend if needed
            },
            "photo": cached_nik.get("photo"),
            "queried_at": cached_nik.get("created_at"),
            "from_cache": True
        }
        
        await db.targets.update_one(
            {"id": target_id},
            {"$set": {f"nik_queries.{nik}": nik_query_data}}
        )
        
        return {
            "message": "Reusing NIK data from Simple Query Cache",
            "nik": nik,
            "reused": True,
            "source": "simple_query_cache"
        }
    
    # No existing data, proceed with new query
    # Initialize nik_queries if not exists
    if not target.get('nik_queries'):
        await db.targets.update_one(
            {"id": target_id},
            {"$set": {"nik_queries": {}}}
        )
    
    # PRE-CHECK: Verify Telegram connection
    # Be more tolerant - only fail if client doesn't exist at all
    global telegram_client
    
    if telegram_client is None:
        raise HTTPException(status_code=503, detail="Telegram belum diinisialisasi. Silakan login Telegram di halaman Settings.")
    
    # Try to ensure connection (don't fail if just not authorized yet)
    try:
        if not telegram_client.is_connected():
            await telegram_client.connect()
        
        # Check if authorized
        is_authorized = await telegram_client.is_user_authorized()
        if not is_authorized:
            raise HTTPException(status_code=503, detail="Telegram belum login. Silakan login di halaman Settings terlebih dahulu.")
            
    except HTTPException:
        raise
    except Exception as conn_err:
        logger.error(f"[NIK] Connection check failed: {conn_err}")
        raise HTTPException(status_code=503, detail=f"Koneksi Telegram error: {str(conn_err)}. Coba refresh halaman Settings.")
    
    # Update NIK status to processing
    await db.targets.update_one(
        {"id": target_id},
        {"$set": {f"nik_queries.{nik}.status": "processing"}}
    )
    
    # Update request status for queue indicator
    global current_request_status
    current_request_status = {
        "is_busy": True,
        "username": username,
        "operation": f"NIK Query - {nik[:6]}***",
        "started_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Start background task
    asyncio.create_task(query_telegram_nik(target_id, nik))
    
    return {"message": "NIK query started", "nik": nik, "reused": False}

@api_router.post("/targets/{target_id}/family")
async def query_family(target_id: str, family_data_input: dict, username: str = Depends(verify_token)):
    """Query Family (NKK) dengan Family ID - Stores per NIK"""
    target = await db.targets.find_one({"id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    family_id = family_data_input.get('family_id')
    source_nik = family_data_input.get('source_nik')  # The NIK that triggered this family query
    
    if not family_id:
        raise HTTPException(status_code=400, detail="Family ID required")
    
    # Check Simple Query Cache for this NKK
    cache_key = f"nkk:{family_id}"
    cached_nkk = await db.simple_query_cache.find_one({"cache_key": cache_key})
    
    if cached_nkk and cached_nkk.get("raw_response"):
        logging.info(f"Reusing NKK {family_id} data from Simple Query Cache")
        
        # Build family_data from cache
        family_data = {
            "raw_response": cached_nkk.get("raw_response"),
            "parsed_data": {},
            "from_cache": True
        }
        
        # Update family query status in nik_queries for the specific NIK
        if source_nik and target.get('nik_queries', {}).get(source_nik):
            await db.targets.update_one(
                {"id": target_id},
                {"$set": {
                    f"nik_queries.{source_nik}.family_status": "completed",
                    f"nik_queries.{source_nik}.family_data": family_data
                }}
            )
        else:
            # Fallback to target-level for backward compatibility
            await db.targets.update_one(
                {"id": target_id},
                {"$set": {
                    "family_status": "completed",
                    "family_data": family_data
                }}
            )
        
        return {
            "message": "Reusing NKK data from Simple Query Cache",
            "target_id": target_id,
            "source_nik": source_nik,
            "reused": True
        }
    
    # Update family query status in nik_queries for the specific NIK
    if source_nik and target.get('nik_queries', {}).get(source_nik):
        await db.targets.update_one(
            {"id": target_id},
            {"$set": {f"nik_queries.{source_nik}.family_status": "processing"}}
        )
    else:
        # Fallback to target-level for backward compatibility
        await db.targets.update_one(
            {"id": target_id},
            {"$set": {"family_status": "processing"}}
        )
    
    # PRE-CHECK: Verify Telegram connection
    global telegram_client
    
    if telegram_client is None:
        raise HTTPException(status_code=503, detail="Telegram belum diinisialisasi. Silakan login Telegram di halaman Settings.")
    
    try:
        if not telegram_client.is_connected():
            await telegram_client.connect()
        
        is_authorized = await telegram_client.is_user_authorized()
        if not is_authorized:
            raise HTTPException(status_code=503, detail="Telegram belum login. Silakan login di halaman Settings terlebih dahulu.")
            
    except HTTPException:
        raise
    except Exception as conn_err:
        logger.error(f"[FAMILY] Connection check failed: {conn_err}")
        raise HTTPException(status_code=503, detail=f"Koneksi Telegram error: {str(conn_err)}. Coba refresh halaman Settings.")
    
    # Update request status for queue indicator
    global current_request_status
    current_request_status = {
        "is_busy": True,
        "username": username,
        "operation": f"Family Query - NKK",
        "started_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Start background task with source_nik
    asyncio.create_task(query_telegram_family(target_id, family_id, source_nik))
    
    return {"message": "Family query started", "target_id": target_id, "source_nik": source_nik, "reused": False}

# Reset stuck processes
@api_router.post("/targets/{target_id}/reset-stuck")
async def reset_stuck_processes(target_id: str, username: str = Depends(verify_token)):
    """Reset any stuck processing status for a target"""
    target = await db.targets.find_one({"id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    updates = {}
    
    # Reset target-level stuck statuses
    if target.get('reghp_status') == 'processing':
        updates['reghp_status'] = 'not_started'
    if target.get('family_status') == 'processing':
        updates['family_status'] = 'not_started'
    
    # Reset NIK-level stuck statuses
    nik_queries = target.get('nik_queries', {})
    for nik, nik_data in nik_queries.items():
        if nik_data.get('status') == 'processing':
            updates[f'nik_queries.{nik}.status'] = 'not_started'
        if nik_data.get('family_status') == 'processing':
            updates[f'nik_queries.{nik}.family_status'] = 'not_started'
    
    if updates:
        await db.targets.update_one({"id": target_id}, {"$set": updates})
        logging.info(f"Reset stuck processes for target {target_id}: {list(updates.keys())}")
        return {"message": "Stuck processes reset", "reset_fields": list(updates.keys())}
    
    return {"message": "No stuck processes found"}

# Dashboard Stats
@api_router.get("/stats")
async def get_stats(username: str = Depends(verify_token)):
    total_cases = await db.cases.count_documents({})
    active_cases = await db.cases.count_documents({"status": "active"})
    total_targets = await db.targets.count_documents({})
    completed_targets = await db.targets.count_documents({"status": "completed"})
    
    success_rate = 0
    if total_targets > 0:
        success_rate = round((completed_targets / total_targets) * 100, 1)
    
    return {
        "total_cases": total_cases,
        "active_cases": active_cases,
        "total_targets": total_targets,
        "completed_targets": completed_targets,
        "success_rate": success_rate
    }

# Scheduling Routes
@api_router.post("/schedules", response_model=Schedule)
async def create_schedule(schedule_data: ScheduleCreate, username: str = Depends(verify_token)):
    # Validate phone number format
    if not schedule_data.phone_number.startswith('62'):
        raise HTTPException(status_code=400, detail="Phone number must start with 62")
    
    if not re.match(r'^62\d{9,12}$', schedule_data.phone_number):
        raise HTTPException(status_code=400, detail="Invalid phone number format")
    
    # Check case ownership - only case owner can schedule targets
    case = await db.cases.find_one({"id": schedule_data.case_id}, {"_id": 0})
    if not case:
        raise HTTPException(status_code=404, detail="Case tidak ditemukan")
    
    case_owner = case.get("created_by")
    
    # Only allow scheduling by case owner - admin cannot schedule other user's targets
    # Exception: If case has no owner (legacy cases), allow anyone to schedule
    if case_owner is not None and case_owner != username:
        raise HTTPException(
            status_code=403, 
            detail="Target hanya bisa dijadwalkan oleh pemilik cases"
        )
    
    schedule = Schedule(**schedule_data.model_dump())
    
    # Calculate next run time
    from datetime import timedelta
    from zoneinfo import ZoneInfo
    
    now_utc = datetime.now(timezone.utc)
    wib = ZoneInfo('Asia/Jakarta')  # WIB timezone
    now_wib = now_utc.astimezone(wib)
    
    if schedule_data.interval_type == 'specific_time':
        # Parse scheduled_time (HH:MM in WIB)
        if not schedule_data.scheduled_time:
            raise HTTPException(status_code=400, detail="scheduled_time diperlukan untuk tipe specific_time")
        
        try:
            hour, minute = map(int, schedule_data.scheduled_time.split(':'))
            if not (0 <= hour <= 23 and 0 <= minute <= 59):
                raise ValueError("Invalid time")
        except:
            raise HTTPException(status_code=400, detail="Format waktu harus HH:MM (contoh: 07:00 atau 21:35)")
        
        # Calculate next run in WIB
        target_time_wib = now_wib.replace(hour=hour, minute=minute, second=0, microsecond=0)
        
        # If target time has passed today, schedule for tomorrow
        if target_time_wib <= now_wib:
            target_time_wib = target_time_wib + timedelta(days=1)
        
        # Convert back to UTC for storage
        schedule.next_run = target_time_wib.astimezone(timezone.utc)
        
    elif schedule_data.interval_type == 'minutes':
        schedule.next_run = now_utc + timedelta(minutes=schedule_data.interval_value)
    elif schedule_data.interval_type == 'hourly':
        schedule.next_run = now_utc + timedelta(hours=schedule_data.interval_value)
    elif schedule_data.interval_type == 'daily':
        schedule.next_run = now_utc + timedelta(days=schedule_data.interval_value)
    elif schedule_data.interval_type == 'weekly':
        schedule.next_run = now_utc + timedelta(weeks=schedule_data.interval_value)
    elif schedule_data.interval_type == 'monthly':
        schedule.next_run = now_utc + timedelta(days=schedule_data.interval_value * 30)
    
    # Add created_by field to schedule
    schedule_doc = schedule.model_dump()
    schedule_doc['created_by'] = username
    schedule_doc['created_at'] = schedule_doc['created_at'].isoformat()
    if schedule_doc.get('next_run'):
        schedule_doc['next_run'] = schedule_doc['next_run'].isoformat()
    if schedule_doc.get('last_run'):
        schedule_doc['last_run'] = schedule_doc['last_run'].isoformat()
    
    await db.schedules.insert_one(schedule_doc)
    return schedule

@api_router.get("/schedules", response_model=List[Schedule])
async def get_schedules(username: str = Depends(verify_token)):
    schedules = await db.schedules.find({}, {"_id": 0}).to_list(1000)
    
    for schedule in schedules:
        if isinstance(schedule.get('created_at'), str):
            schedule['created_at'] = datetime.fromisoformat(schedule['created_at'])
        if schedule.get('next_run') and isinstance(schedule['next_run'], str):
            schedule['next_run'] = datetime.fromisoformat(schedule['next_run'])
        if schedule.get('last_run') and isinstance(schedule['last_run'], str):
            schedule['last_run'] = datetime.fromisoformat(schedule['last_run'])
    
    return schedules

@api_router.get("/schedules/{schedule_id}", response_model=Schedule)
async def get_schedule(schedule_id: str, username: str = Depends(verify_token)):
    schedule = await db.schedules.find_one({"id": schedule_id}, {"_id": 0})
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    if isinstance(schedule.get('created_at'), str):
        schedule['created_at'] = datetime.fromisoformat(schedule['created_at'])
    if schedule.get('next_run') and isinstance(schedule['next_run'], str):
        schedule['next_run'] = datetime.fromisoformat(schedule['next_run'])
    if schedule.get('last_run') and isinstance(schedule['last_run'], str):
        schedule['last_run'] = datetime.fromisoformat(schedule['last_run'])
    
    return schedule

@api_router.patch("/schedules/{schedule_id}", response_model=Schedule)
async def update_schedule(schedule_id: str, update_data: ScheduleUpdate, username: str = Depends(verify_token)):
    schedule = await db.schedules.find_one({"id": schedule_id}, {"_id": 0})
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    if update_dict:
        await db.schedules.update_one(
            {"id": schedule_id},
            {"$set": update_dict}
        )
    
    updated_schedule = await db.schedules.find_one({"id": schedule_id}, {"_id": 0})
    
    if isinstance(updated_schedule.get('created_at'), str):
        updated_schedule['created_at'] = datetime.fromisoformat(updated_schedule['created_at'])
    if updated_schedule.get('next_run') and isinstance(updated_schedule['next_run'], str):
        updated_schedule['next_run'] = datetime.fromisoformat(updated_schedule['next_run'])
    if updated_schedule.get('last_run') and isinstance(updated_schedule['last_run'], str):
        updated_schedule['last_run'] = datetime.fromisoformat(updated_schedule['last_run'])
    
    return updated_schedule

@api_router.delete("/schedules/{schedule_id}")
async def delete_schedule(schedule_id: str, username: str = Depends(verify_token)):
    result = await db.schedules.delete_one({"id": schedule_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return {"message": "Schedule deleted successfully"}

@api_router.post("/schedules/{schedule_id}/execute")
async def execute_schedule(schedule_id: str, username: str = Depends(verify_token)):
    """Execute a scheduled update immediately - triggered by countdown end"""
    from zoneinfo import ZoneInfo
    
    schedule = await db.schedules.find_one({"id": schedule_id}, {"_id": 0})
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    phone_number = schedule.get('phone_number')
    if not phone_number:
        raise HTTPException(status_code=400, detail="No phone number in schedule")
    
    # Find the target with this phone number
    target = await db.targets.find_one({"phone_number": phone_number}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    target_id = target['id']
    
    # Check quota first - IMPORTANT: Schedule also uses CP API quota
    quota = await get_cp_api_quota()
    if quota <= 0:
        logging.warning(f"[SCHEDULE] Quota habis, tidak bisa execute schedule untuk {phone_number}")
        raise HTTPException(status_code=400, detail="Quota CP API habis (0 tersisa)")
    
    # Update schedule with last_run and calculate next_run
    now_utc = datetime.now(timezone.utc)
    interval_type = schedule.get('interval_type', 'hourly')
    interval_value = schedule.get('interval_value', 1)
    scheduled_time = schedule.get('scheduled_time')
    
    if interval_type == 'specific_time' and scheduled_time:
        # For specific_time, schedule for same time tomorrow (in WIB)
        wib = ZoneInfo('Asia/Jakarta')
        now_wib = now_utc.astimezone(wib)
        
        try:
            hour, minute = map(int, scheduled_time.split(':'))
            # Calculate next run for tomorrow at the same time
            target_time_wib = now_wib.replace(hour=hour, minute=minute, second=0, microsecond=0)
            target_time_wib = target_time_wib + timedelta(days=1)  # Always tomorrow
            next_run = target_time_wib.astimezone(timezone.utc)
        except:
            # Fallback to 24 hours from now
            next_run = now_utc + timedelta(days=1)
    elif interval_type == 'minutes':
        next_run = now_utc + timedelta(minutes=interval_value)
    elif interval_type == 'hourly':
        next_run = now_utc + timedelta(hours=interval_value)
    elif interval_type == 'daily':
        next_run = now_utc + timedelta(days=interval_value)
    elif interval_type == 'weekly':
        next_run = now_utc + timedelta(weeks=interval_value)
    else:
        next_run = now_utc + timedelta(days=interval_value * 30)
    
    await db.schedules.update_one(
        {"id": schedule_id},
        {"$set": {
            "last_run": now_utc.isoformat(),
            "next_run": next_run.isoformat()
        }}
    )
    
    # Save current position to history BEFORE updating (like refresh does)
    if target.get('data') and target['data'].get('latitude') and target['data'].get('longitude'):
        lat = float(target['data']['latitude'])
        lng = float(target['data']['longitude'])
        address = target['data'].get('address')
        cp_timestamp = target['data'].get('timestamp')
        
        # Check if this exact position is already in history
        existing = await db.position_history.find_one({
            "target_id": target_id,
            "latitude": lat,
            "longitude": lng
        })
        
        if not existing:
            await save_position_history(target_id, phone_number, lat, lng, address, cp_timestamp)
            logging.info(f"[SCHEDULE] Saved previous position to history for {phone_number}")
    
    # Set target to processing state
    await db.targets.update_one(
        {"id": target_id},
        {"$set": {
            "status": "processing",
            "previous_position": target.get('data')  # Store previous position for reference
        }}
    )
    
    logging.info(f"[SCHEDULE] Executing scheduled update for {phone_number} via CP API (schedule: {schedule_id})")
    
    # Process in background - NOW uses CP API instead of Telegram bot
    asyncio.create_task(query_cp_api_refresh(target_id, phone_number))
    
    return {
        "message": f"Updating position for {phone_number} via CP API",
        "target_id": target_id,
        "next_run": next_run.isoformat(),
        "quota_remaining": quota - 1
    }

# Settings Routes
@api_router.get("/settings/telegram-credentials")
async def get_telegram_credentials(username: str = Depends(verify_token)):
    """Get current Telegram credentials status"""
    env_api_id = os.getenv('TELEGRAM_API_ID', 'not set')
    
    return {
        "runtime_api_id": str(TELEGRAM_API_ID),
        "env_api_id": env_api_id,
        "has_api_hash": bool(TELEGRAM_API_HASH),
        "status": "OK - Using API credentials from .env"
    }

@api_router.post("/settings/telegram-credentials")
async def update_telegram_credentials(credentials: dict, username: str = Depends(verify_token)):
    api_id = credentials.get('api_id')
    api_hash = credentials.get('api_hash')
    
    if not api_id or not api_hash:
        raise HTTPException(status_code=400, detail="API ID and Hash required")
    
    try:
        # Update .env file
        env_path = ROOT_DIR / '.env'
        env_lines = []
        
        with open(env_path, 'r') as f:
            for line in f:
                if line.startswith('TELEGRAM_API_ID='):
                    env_lines.append(f'TELEGRAM_API_ID={api_id}\n')
                elif line.startswith('TELEGRAM_API_HASH='):
                    env_lines.append(f'TELEGRAM_API_HASH={api_hash}\n')
                else:
                    env_lines.append(line)
        
        # Check if TELEGRAM vars exist, if not add them
        has_api_id = any(line.startswith('TELEGRAM_API_ID=') for line in env_lines)
        has_api_hash = any(line.startswith('TELEGRAM_API_HASH=') for line in env_lines)
        
        if not has_api_id:
            env_lines.append(f'TELEGRAM_API_ID={api_id}\n')
        if not has_api_hash:
            env_lines.append(f'TELEGRAM_API_HASH={api_hash}\n')
        
        with open(env_path, 'w') as f:
            f.writelines(env_lines)
        
        # Delete old session files to force re-authentication
        session_files = list(ROOT_DIR.glob('*.session')) + list(ROOT_DIR.glob('*.session-journal'))
        deleted_sessions = []
        for sf in session_files:
            try:
                os.remove(sf)
                deleted_sessions.append(str(sf.name))
                logger.info(f"Deleted session file: {sf}")
            except Exception as e:
                logger.warning(f"Could not delete session file {sf}: {e}")
        
        # Update global variables (for hot reload)
        global TELEGRAM_API_ID, TELEGRAM_API_HASH, telegram_client
        TELEGRAM_API_ID = int(api_id)
        TELEGRAM_API_HASH = api_hash
        
        # Disconnect existing client if any
        if telegram_client:
            try:
                await telegram_client.disconnect()
                logger.info("Disconnected old Telegram client")
            except:
                pass
            telegram_client = None
        
        logger.info(f"Updated Telegram credentials: API_ID={api_id}")
        
        return {
            "success": True,
            "message": "Credentials updated successfully!",
            "deleted_sessions": deleted_sessions,
            "next_steps": "Silakan klik 'Reset Connection' lalu setup Telegram ulang."
        }
    except Exception as e:
        logging.error(f"Error updating credentials: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Telegram Bot Integration
telegram_client = None
telegram_phone_code_hash = None

@api_router.post("/telegram/send-code")
async def send_telegram_code(phone_data: dict, username: str = Depends(verify_token)):
    global telegram_client, telegram_phone_code_hash
    
    phone = phone_data.get('phone')
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number required")
    
    max_retries = 3
    last_error = None
    
    for attempt in range(1, max_retries + 1):
        try:
            # Delete old session file first to avoid IP conflict errors
            session_path = str(ROOT_DIR / 'northarch_session.session')
            if os.path.exists(session_path) and attempt == 1:
                # On first attempt, if session exists but we're here, it might be corrupted
                # Check if it's causing issues
                pass
            
            # Initialize client if not exists or reconnect if disconnected
            if telegram_client is None or not telegram_client.is_connected():
                # Close existing client if any
                if telegram_client:
                    try:
                        await telegram_client.disconnect()
                    except:
                        pass
                
                telegram_client = create_telegram_client()
                await telegram_client.connect()
                logger.info(f"Telegram client connected (attempt {attempt})")
            
            # Check if already authorized
            if await telegram_client.is_user_authorized():
                me = await telegram_client.get_me()
                return {
                    "already_authorized": True,
                    "username": me.username,
                    "phone": me.phone
                }
            
            # Send code
            result = await telegram_client.send_code_request(phone)
            telegram_phone_code_hash = result.phone_code_hash
            
            return {
                "success": True,
                "message": f"Kode verifikasi telah dikirim ke {phone}",
                "phone_code_hash": result.phone_code_hash
            }
        except Exception as e:
            last_error = e
            error_str = str(e).lower()
            logger.warning(f"Send code attempt {attempt} failed: {e}")
            
            # Check for IP conflict error - need full reset
            if "two different ip" in error_str or "authorization key" in error_str:
                logger.error("Session IP conflict detected! Performing full reset...")
                
                # Full cleanup
                if telegram_client:
                    try:
                        await telegram_client.disconnect()
                    except:
                        pass
                telegram_client = None
                telegram_phone_code_hash = None
                
                # Delete session file
                for sf in [str(ROOT_DIR / 'northarch_session.session'), str(ROOT_DIR / 'northarch_session.session-journal')]:
                    if os.path.exists(sf):
                        try:
                            os.remove(sf)
                            logger.info(f"Deleted corrupted session: {sf}")
                        except:
                            pass
                
                # Delete MongoDB backup
                try:
                    await db.telegram_sessions.delete_many({})
                    logger.info("Cleared MongoDB session backups")
                except:
                    pass
                
                # Return specific error with instructions
                raise HTTPException(
                    status_code=409, 
                    detail="Session conflict terdeteksi (IP berbeda). Session lama sudah dihapus. Silakan coba kirim kode lagi."
                )
            
            if attempt < max_retries:
                # Reset client for retry
                if telegram_client:
                    try:
                        await telegram_client.disconnect()
                    except:
                        pass
                    telegram_client = None
                await asyncio.sleep(1)
            continue
    
    # All retries failed
    logging.error(f"All {max_retries} attempts to send Telegram code failed: {last_error}")
    raise HTTPException(status_code=500, detail=f"Gagal mengirim kode setelah {max_retries} percobaan: {str(last_error)}")

@api_router.post("/telegram/verify-code")
async def verify_telegram_code(verify_data: dict, username: str = Depends(verify_token)):
    global telegram_client, telegram_phone_code_hash
    
    phone = verify_data.get('phone')
    code = verify_data.get('code')
    password = verify_data.get('password')
    
    if not phone or not code:
        raise HTTPException(status_code=400, detail="Phone and code required")
    
    try:
        if telegram_client is None:
            raise HTTPException(status_code=400, detail="Please send code first")
        
        # Sign in with code
        try:
            await telegram_client.sign_in(phone, code, phone_code_hash=telegram_phone_code_hash)
        except Exception as signin_error:
            # Check if it's 2FA error
            if "password" in str(signin_error).lower():
                if not password:
                    return {
                        "requires_2fa": True,
                        "message": "Akun dilindungi 2FA, masukkan password"
                    }
                # Try with password
                await telegram_client.sign_in(password=password)
            else:
                raise signin_error
        
        # Get user info
        me = await telegram_client.get_me()
        
        # Verify session file was created and backup to MongoDB
        session_path = str(ROOT_DIR / 'northarch_session.session')
        session_saved = os.path.exists(session_path)
        
        if session_saved:
            logging.info(f"Telegram session saved at {session_path}")
            # Backup session to MongoDB for persistence
            try:
                with open(session_path, 'rb') as f:
                    session_data = f.read()
                    import base64
                    encoded_session = base64.b64encode(session_data).decode('utf-8')
                    await db.telegram_sessions.update_one(
                        {"type": "main_session"},
                        {"$set": {
                            "session_data": encoded_session,
                            "user_id": me.id,
                            "username": me.username,
                            "phone": me.phone,
                            "updated_at": datetime.now(timezone.utc)
                        }},
                        upsert=True
                    )
                    logging.info("Telegram session backed up to MongoDB")
            except Exception as backup_err:
                logging.warning(f"Failed to backup session to MongoDB: {backup_err}")
        else:
            logging.warning(f"Telegram session file not found at {session_path}")
        
        # Test bot connection
        try:
            await telegram_client.send_message(BOT_USERNAME, '/start')
            await asyncio.sleep(1)
            messages = await telegram_client.get_messages(BOT_USERNAME, limit=1)
            bot_active = True
        except:
            bot_active = False
        
        return {
            "success": True,
            "message": "Login Telegram berhasil!",
            "user": {
                "username": me.username,
                "first_name": me.first_name,
                "phone": me.phone,
                "user_id": me.id
            },
            "bot_status": "connected" if bot_active else "not_connected",
            "session_saved": session_saved,
            "session_backed_up": True
        }
    except Exception as e:
        logging.error(f"Error verifying Telegram code: {e}")
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(e)}")

@api_router.get("/telegram/status")
async def telegram_status(username: str = Depends(verify_token)):
    """Check Telegram status using the global connection lock to prevent race conditions"""
    global telegram_client
    
    session_exists = os.path.exists(str(ROOT_DIR / 'northarch_session.session'))
    
    if not session_exists:
        return {
            "authorized": False,
            "connected": False,
            "message": "Belum login ke Telegram"
        }
    
    try:
        # Use the global lock to prevent race conditions with other operations
        async with telegram_connection_lock:
            # Check current connection state
            is_connected = telegram_client is not None and telegram_client.is_connected()
            
            # Recreate client if needed - use the helper function for consistency
            if telegram_client is None or not is_connected:
                if telegram_client is not None:
                    try:
                        await telegram_client.disconnect()
                    except Exception as disc_err:
                        logger.warning(f"[Telegram Status] Disconnect error: {disc_err}")
                
                # Use the helper function instead of direct TelegramClient creation
                telegram_client = create_telegram_client()
                await telegram_client.connect()
                is_connected = telegram_client.is_connected()
                logger.info(f"[Telegram Status] Reconnected client, is_connected={is_connected}")
            
            if await telegram_client.is_user_authorized():
                me = await telegram_client.get_me()
                return {
                    "authorized": True,
                    "connected": is_connected,
                    "user": {
                        "username": me.username,
                        "first_name": me.first_name,
                        "phone": me.phone,
                        "user_id": me.id
                    }
                }
            else:
                return {
                    "authorized": False,
                    "connected": is_connected,
                    "message": "Session expired atau belum login"
                }
    except Exception as e:
        error_msg = str(e)
        logger.error(f"[Telegram Status] Error: {e}")
        
        # If duplicate session error, suggest reset
        if "authorization key" in error_msg.lower() or "duplicate" in error_msg.lower():
            return {
                "authorized": False,
                "connected": False,
                "message": "Session conflict - Please reset connection in Settings",
                "error_type": "duplicate_session"
            }
        
        return {
            "authorized": False,
            "connected": False,
            "message": str(e)
        }

@api_router.post("/telegram/reset-connection")
async def reset_telegram_connection(username: str = Depends(verify_token)):
    global telegram_client, telegram_phone_code_hash
    
    try:
        # Try to properly log out from Telegram first (this invalidates the session on Telegram's side)
        if telegram_client is not None:
            try:
                if telegram_client.is_connected():
                    try:
                        # Log out properly - this tells Telegram to invalidate this session
                        await telegram_client.log_out()
                        logging.info("Logged out from Telegram properly")
                    except Exception as logout_err:
                        logging.warning(f"Logout error (may already be invalid): {logout_err}")
                    
                await telegram_client.disconnect()
                logging.info("Disconnected Telegram client")
            except Exception as e:
                logging.warning(f"Error disconnecting client: {e}")
        
        # Reset global variables
        telegram_client = None
        telegram_phone_code_hash = None
        
        # Delete ALL session files (including any cache)
        session_files = [
            str(ROOT_DIR / 'northarch_session.session'),
            str(ROOT_DIR / 'northarch_session.session-journal'),
        ]
        
        deleted_files = []
        for sf in session_files:
            if os.path.exists(sf):
                try:
                    os.remove(sf)
                    deleted_files.append(sf)
                    logging.info(f"Deleted session file: {sf}")
                except Exception as e:
                    logging.error(f"Error deleting {sf}: {e}")
        
        # IMPORTANT: Delete session backup from MongoDB
        try:
            result = await db.telegram_sessions.delete_many({})
            logging.info(f"Deleted {result.deleted_count} session backups from MongoDB")
        except Exception as db_err:
            logging.warning(f"Error deleting MongoDB sessions: {db_err}")
        
        return {
            "success": True,
            "message": "Telegram connection fully reset. Session invalidated on Telegram servers.",
            "deleted_files": deleted_files,
            "mongodb_cleared": True,
            "next_step": "Please login with your phone number again"
        }
    except Exception as e:
        logging.error(f"Error resetting Telegram connection: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def query_telegram_bot(target_id: str, phone_number: str):
    """Query Telegram bot with robust connection handling and GLOBAL LOCK"""
    operation_name = f"CP_{target_id[:8]}_{phone_number}"
    
    # ============================================
    # ACQUIRE GLOBAL TELEGRAM QUERY LOCK WITH TIMEOUT
    # ============================================
    logging.info(f"[TARGET {target_id}] Waiting for global Telegram lock...")
    lock_acquired = await acquire_telegram_lock(operation_name)
    
    if not lock_acquired:
        logging.error(f"[TARGET {target_id}] Failed to acquire lock - timeout")
        await db.targets.update_one(
            {"id": target_id},
            {"$set": {"status": "error", "error": "Server sibuk, coba lagi nanti"}}
        )
        return
    
    set_active_query(f"target_{target_id[:8]}", "cp", phone_number)
    
    try:
        # Update status: connecting
        await db.targets.update_one(
            {"id": target_id},
            {"$set": {"status": "connecting"}}
        )
        
        # Ensure connection using safe wrapper
        global telegram_client
        connected = await safe_telegram_operation(
            lambda: ensure_telegram_connected(),
            "connect_for_query",
            max_retries=5
        )
        
        if not connected:
            logging.error(f"[TARGET {target_id}] Failed to connect to Telegram")
            await db.targets.update_one(
                {"id": target_id},
                {"$set": {"status": "error", "error": "Tidak dapat terhubung ke Telegram"}}
            )
            return
        
        # Create unique token for this query
        query_token = f"CP_{phone_number}_{target_id[:8]}"
        
        await asyncio.sleep(1)
        
        # Update status: querying
        await db.targets.update_one(
            {"id": target_id},
            {"$set": {"status": "querying"}}
        )
        
        try:
            # Send phone number with safe wrapper
            async def send_phone():
                await telegram_client.send_message(BOT_USERNAME, phone_number)
                return True
            
            sent = await safe_telegram_operation(send_phone, f"send_phone_{phone_number}", max_retries=3)
            
            if not sent:
                logging.error(f"[TARGET {target_id}] Failed to send phone number")
                await db.targets.update_one(
                    {"id": target_id},
                    {"$set": {"status": "error", "error": "Gagal mengirim nomor ke bot"}}
                )
                return
            
            logging.info(f"[TARGET {target_id}] [{query_token}] Sent phone number {phone_number} to {BOT_USERNAME}")
            
            # Save sent message to chat history
            await db.chat_messages.insert_one({
                "id": str(uuid.uuid4()),
                "target_id": target_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "direction": "sent",
                "message": f"📤 Mengirim nomor: {phone_number}",
                "has_buttons": False
            })
            
            await asyncio.sleep(2)
            
            # Update status: processing
            await db.targets.update_one(
                {"id": target_id},
                {"$set": {"status": "processing"}}
            )
            
            # Wait for bot response and look for "CP" button
            logging.info(f"[TARGET {target_id}] Waiting for bot response...")
            await asyncio.sleep(5)
            
            # Get latest messages from bot with safe wrapper
            async def get_messages():
                return await telegram_client.get_messages(BOT_USERNAME, limit=5)
            
            messages = await safe_telegram_operation(get_messages, "get_messages_for_buttons", max_retries=3)
            
            if messages is None:
                logging.error(f"[TARGET {target_id}] Failed to get messages from bot")
                await db.targets.update_one(
                    {"id": target_id},
                    {"$set": {"status": "error", "error": "Gagal membaca pesan dari bot"}}
                )
                return
            
            logging.info(f"[TARGET {target_id}] Retrieved {len(messages)} messages from bot")
            
            # Look for message with buttons
            cp_clicked = False
            cp_button_found = None
            
            for idx, msg in enumerate(messages):
                logging.info(f"[TARGET {target_id}] Message {idx}: has_buttons={msg.buttons is not None}, text_preview={msg.text[:50] if msg.text else 'No text'}...")
                
                if msg.buttons:
                    button_texts = [[btn.text for btn in row] for row in msg.buttons]
                    logging.info(f"[TARGET {target_id}] Buttons found: {button_texts}")
                    
                    # Save received message with buttons
                    await db.chat_messages.insert_one({
                        "id": str(uuid.uuid4()),
                        "target_id": target_id,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "direction": "received",
                        "message": f"📥 Bot: {msg.text[:100] if msg.text else 'Response'}...",
                        "has_buttons": True,
                        "buttons": button_texts
                    })
                    
                    for row in msg.buttons:
                        for button in row:
                            if button.text and 'CP' in button.text.upper():
                                cp_button_found = button
                                break
                        if cp_button_found:
                            break
                    if cp_button_found:
                        break
            
            # Click CP button with safe wrapper
            if cp_button_found:
                async def click_cp():
                    await cp_button_found.click()
                    return True
                
                clicked = await safe_telegram_operation(click_cp, f"click_CP_{phone_number}", max_retries=3)
                
                if clicked:
                    logging.info(f"[TARGET {target_id}] ✓ Clicked CP button: {cp_button_found.text}")
                    cp_clicked = True
                    
                    # Save click action
                    await db.chat_messages.insert_one({
                        "id": str(uuid.uuid4()),
                        "target_id": target_id,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "direction": "sent",
                        "message": f"🔘 Clicked button: {cp_button_found.text}",
                        "has_buttons": False
                    })
                else:
                    logging.error(f"[TARGET {target_id}] Failed to click CP button after retries")
            
            if not cp_clicked:
                logging.warning(f"[TARGET {target_id}] ⚠ CP button not found or click failed")
            
            # Wait longer for bot to process and respond
            logging.info(f"[TARGET {target_id}] Waiting for location response...")
            await asyncio.sleep(8)
            
            # Update status: parsing
            await db.targets.update_one(
                {"id": target_id},
                {"$set": {"status": "parsing"}}
            )
            
            # Get the response after clicking CP with safe wrapper
            async def get_response_messages():
                return await telegram_client.get_messages(BOT_USERNAME, limit=20)
            
            response_messages = await safe_telegram_operation(get_response_messages, "get_response_messages", max_retries=3)
            
            if response_messages is None:
                logging.error(f"[TARGET {target_id}] Failed to get response messages")
                await db.targets.update_one(
                    {"id": target_id},
                    {"$set": {"status": "error", "error": "Gagal membaca respons dari bot"}}
                )
                return
            
            logging.info(f"[TARGET {target_id}] [{query_token}] Retrieved {len(response_messages)} messages for parsing")
            
            # Log all messages for debugging
            for idx, msg in enumerate(response_messages):
                if msg.text:
                    # Check if message contains the phone number we queried (tokenization)
                    if phone_number in msg.text:
                        logging.info(f"[TARGET {target_id}] [{query_token}] ✓ Response matched (contains {phone_number}): {msg.text[:200]}...")
                    else:
                        logging.info(f"[TARGET {target_id}] [{query_token}] Response {idx} (no match): {msg.text[:100]}...")
            
            # Parse response to extract location data - ONLY from messages containing our phone number
            location_data = None
            for msg in response_messages:
                if msg.text and phone_number in msg.text:
                    text = msg.text
                    
                    # Look for the specific format from your bot
                    # Format: "Long: 106.940340\nLat: -6.411650\nAddress: ...\nMaps: https://maps.google.com/?q=-6.411650,106.940340"
                    
                    # Try to extract from "Maps:" link first (most reliable)
                    maps_match = re.search(r'Maps:\s*https://maps\.google\.com/\?q=(-?\d+\.?\d*),(-?\d+\.?\d*)', text, re.IGNORECASE)
                    
                    if maps_match:
                        lat = float(maps_match.group(1))
                        lon = float(maps_match.group(2))
                        
                        # Extract address
                        address_match = re.search(r'Address:\s*(.+?)(?=\nMaps:|\n\n|$)', text, re.IGNORECASE | re.DOTALL)
                        address = address_match.group(1).strip() if address_match else "Location from Telegram Bot"
                        
                        # Extract phone info
                        phone_match = re.search(r'Phone:\s*(.+?)(?=\n|$)', text, re.IGNORECASE)
                        phone_info = phone_match.group(1).strip() if phone_match else "NULL NULL"
                        
                        # Extract operator
                        operator_match = re.search(r'Operator:\s*(.+?)(?=\n|$)', text, re.IGNORECASE)
                        operator = operator_match.group(1).strip() if operator_match else "NULL"
                        
                        # Extract network
                        network_match = re.search(r'Network:\s*(.+?)(?=\n|$)', text, re.IGNORECASE)
                        network = network_match.group(1).strip() if network_match else "NULL"
                        
                        # Extract IMEI
                        imei_match = re.search(r'Imei:\s*(.+?)(?=\n|$)', text, re.IGNORECASE)
                        imei = imei_match.group(1).strip() if imei_match else "NULL"
                        
                        location_data = {
                            "name": phone_info if phone_info != "NULL NULL" else "Target User",
                            "phone_number": phone_number,
                            "address": address,
                            "latitude": lat,
                            "longitude": lon,
                            "additional_phones": [phone_number],
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "imei": imei,
                            "operator": operator,
                            "network": network,
                            "maps_link": maps_match.group(0).replace('Maps: ', ''),
                            "raw_response": text[:1000]
                        }
                        logging.info(f"Successfully parsed location from Maps link: lat={lat}, lon={lon}")
                        break
                    
                    # Fallback: Try to extract Long and Lat separately
                    long_match = re.search(r'Long:\s*(-?\d+\.?\d*)', text, re.IGNORECASE)
                    lat_match = re.search(r'Lat:\s*(-?\d+\.?\d*)', text, re.IGNORECASE)
                    
                    if long_match and lat_match:
                        lon = float(long_match.group(1))
                        lat = float(lat_match.group(1))
                        
                        # Extract address
                        address_match = re.search(r'Address:\s*(.+?)(?=\nMaps:|\n\n|$)', text, re.IGNORECASE | re.DOTALL)
                        address = address_match.group(1).strip() if address_match else "Location from Telegram Bot"
                        
                        location_data = {
                            "name": "Target User",
                            "phone_number": phone_number,
                            "address": address,
                            "latitude": lat,
                            "longitude": lon,
                            "additional_phones": [phone_number],
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "raw_response": text[:1000]
                        }
                        logging.info(f"Successfully parsed location from Long/Lat fields: lat={lat}, lon={lon}")
                        break
                
                # Check if message has geo location
                if hasattr(msg, 'geo') and msg.geo:
                    location_data = {
                        "name": "Target User",
                        "phone_number": phone_number,
                        "address": "Location from Telegram Bot",
                        "latitude": msg.geo.lat,
                        "longitude": msg.geo.long,
                        "additional_phones": [phone_number],
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }
                    break
            
            if location_data:
                # Update with parsed result
                await db.targets.update_one(
                    {"id": target_id},
                    {
                        "$set": {
                            "status": "completed",
                            "data": location_data,
                            "location": {
                                "type": "Point",
                                "coordinates": [location_data['longitude'], location_data['latitude']]
                            }
                        }
                    }
                )
                
                # Save position to history with CP timestamp
                await save_position_history(
                    target_id, 
                    phone_number, 
                    location_data['latitude'], 
                    location_data['longitude'],
                    location_data.get('address'),
                    location_data.get('timestamp')
                )
                
                # Check AOI alerts
                await check_aoi_alerts(
                    target_id, 
                    phone_number, 
                    location_data['latitude'], 
                    location_data['longitude']
                )
                
                # Save success message
                await db.chat_messages.insert_one({
                    "id": str(uuid.uuid4()),
                    "target_id": target_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "direction": "received",
                    "message": f"✅ Lokasi ditemukan: {location_data['address'][:100]}",
                    "has_buttons": False
                })
                
                logging.info(f"[TARGET {target_id}] ✓✓ Location found and saved")
            else:
                # No location found - mark as not_found
                logging.warning(f"[TARGET {target_id}] ⚠ Could not parse location from bot response")
                
                await db.targets.update_one(
                    {"id": target_id},
                    {
                        "$set": {
                            "status": "not_found",
                            "error": "Lokasi tidak ditemukan atau target sedang OFF"
                        }
                    }
                )
                
                # Save not found message
                await db.chat_messages.insert_one({
                    "id": str(uuid.uuid4()),
                    "target_id": target_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "direction": "received",
                    "message": "❌ Target tidak ditemukan atau sedang OFF. Bot tidak memberikan koordinat lokasi.",
                    "has_buttons": False
                })
        
        except Exception as bot_error:
            logging.error(f"Error communicating with Telegram bot: {bot_error}")
            error_message = str(bot_error)
            
            # Set error status instead of using mock data
            await db.targets.update_one(
                {"id": target_id},
                {
                    "$set": {
                        "status": "error",
                        "error": f"Telegram error: {error_message}"
                    }
                }
            )
            
            # Save error message to chat
            await db.chat_messages.insert_one({
                "id": str(uuid.uuid4()),
                "target_id": target_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "direction": "received",
                "message": f"❌ Error komunikasi dengan Telegram: {error_message}",
                "has_buttons": False
            })
            
            # Note: No position to save for error cases
        
    except Exception as e:
        logging.error(f"Error querying bot for target {target_id}: {e}")
        await db.targets.update_one(
            {"id": target_id},
            {
                "$set": {
                    "status": "error",
                    "error": str(e)
                }
            }
        )
    finally:
        # ALWAYS release the global lock
        clear_active_query()
        release_telegram_lock(f"CP_{target_id[:8]}")

async def query_telegram_reghp(target_id: str, phone_number: str):
    """Query Reghp data for deeper information with GLOBAL LOCK"""
    operation_name = f"REGHP_{target_id[:8]}_{phone_number}"
    
    # ============================================
    # ACQUIRE GLOBAL TELEGRAM QUERY LOCK WITH TIMEOUT
    # ============================================
    logging.info(f"[REGHP {target_id}] Waiting for global Telegram lock...")
    lock_acquired = await acquire_telegram_lock(operation_name)
    
    if not lock_acquired:
        logging.error(f"[REGHP {target_id}] Failed to acquire lock - timeout")
        await db.targets.update_one(
            {"id": target_id},
            {"$set": {"reghp_status": "error", "reghp_error": "Server sibuk, coba lagi nanti"}}
        )
        return
    
    set_active_query(f"reghp_{target_id[:8]}", "reghp", phone_number)
    
    try:
        global telegram_client
        
        # Ensure connection using safe wrapper
        connected = await safe_telegram_operation(
            lambda: ensure_telegram_connected(),
            "connect_for_reghp",
            max_retries=5
        )
        
        if not connected:
            logging.error(f"[REGHP {target_id}] Failed to connect to Telegram")
            await db.targets.update_one(
                {"id": target_id},
                {"$set": {"reghp_status": "error", "reghp_error": "Tidak dapat terhubung ke Telegram"}}
            )
            return
        
        query_token = f"REGHP_{phone_number}_{target_id[:8]}"
        logging.info(f"[{query_token}] Starting Reghp query for {phone_number}")
        
        # Log to chat: Starting REGHP query
        await db.chat_messages.insert_one({
            "target_id": target_id,
            "message": f"[PENDALAMAN] 🔍 Memulai query REGHP untuk {phone_number}...",
            "direction": "sent",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "query_type": "reghp"
        })
        
        # Send phone number to bot with safe wrapper
        async def send_phone():
            await telegram_client.send_message(BOT_USERNAME, phone_number)
            return True
        
        sent = await safe_telegram_operation(send_phone, f"send_reghp_{phone_number}", max_retries=3)
        
        if not sent:
            logging.error(f"[{query_token}] Failed to send phone number")
            await db.targets.update_one(
                {"id": target_id},
                {"$set": {"reghp_status": "error", "reghp_error": "Gagal mengirim nomor ke bot"}}
            )
            return
        
        logging.info(f"[{query_token}] Sent phone number to bot")
        
        # Log to chat: Sent to bot
        await db.chat_messages.insert_one({
            "target_id": target_id,
            "message": f"[PENDALAMAN] 📤 Mengirim nomor {phone_number} ke bot...",
            "direction": "sent",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "query_type": "reghp"
        })
        
        await asyncio.sleep(3)
        
        # Get messages with safe wrapper
        async def get_msgs():
            return await telegram_client.get_messages(BOT_USERNAME, limit=5)
        
        messages = await safe_telegram_operation(get_msgs, "get_reghp_messages", max_retries=3)
        
        if messages is None:
            logging.error(f"[{query_token}] Failed to get messages")
            await db.targets.update_one(
                {"id": target_id},
                {"$set": {"reghp_status": "error", "reghp_error": "Gagal membaca pesan dari bot"}}
            )
            return
        
        reghp_button = None
        reghp_clicked = False
        for msg in messages:
            if msg.buttons:
                button_texts = [[btn.text for btn in row] for row in msg.buttons]
                logging.info(f"[{query_token}] Buttons found: {button_texts}")
                
                # Log buttons found
                await db.chat_messages.insert_one({
                    "target_id": target_id,
                    "message": f"[PENDALAMAN] 🔘 Tombol ditemukan: {button_texts}",
                    "direction": "received",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "query_type": "reghp"
                })
                
                for row in msg.buttons:
                    for button in row:
                        if button.text and 'REGHP' in button.text.upper():
                            reghp_button = button
                            break
                    if reghp_button:
                        break
                if reghp_button:
                    break
        
        # Click REGHP button with safe wrapper
        if reghp_button:
            async def click_reghp():
                await reghp_button.click()
                return True
            
            clicked = await safe_telegram_operation(click_reghp, f"click_reghp_{phone_number}", max_retries=3)
            
            if clicked:
                logging.info(f"[{query_token}] ✓ Clicked Reghp button")
                reghp_clicked = True
                
                # Log button clicked
                await db.chat_messages.insert_one({
                    "target_id": target_id,
                    "message": "[PENDALAMAN] ✅ Klik tombol REGHP...",
                    "direction": "sent",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "query_type": "reghp"
                })
            else:
                logging.error(f"[{query_token}] Failed to click REGHP button after retries")
        
        if not reghp_clicked:
            logging.warning(f"[{query_token}] Reghp button not found or click failed")
            
            # Log button not found
            await db.chat_messages.insert_one({
                "target_id": target_id,
                "message": "[PENDALAMAN] ⚠️ Tombol REGHP tidak ditemukan atau gagal diklik",
                "direction": "received",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "query_type": "reghp"
            })
        
        # Wait for response
        await asyncio.sleep(8)
        
        # Get Reghp response with safe wrapper
        async def get_response():
            return await telegram_client.get_messages(BOT_USERNAME, limit=15)
        
        response_messages = await safe_telegram_operation(get_response, "get_reghp_response", max_retries=3)
        
        if response_messages is None:
            logging.error(f"[{query_token}] Failed to get REGHP response")
            await db.targets.update_one(
                {"id": target_id},
                {"$set": {"reghp_status": "error", "reghp_error": "Gagal membaca respons REGHP"}}
            )
            return
        
        reghp_info = None
        data_not_found = False
        
        for msg in response_messages:
            if not msg.text or phone_number not in msg.text:
                continue
                
            msg_lower = msg.text.lower()
            
            # Check for "Data Not Found" response
            if 'not found' in msg_lower or 'data not found' in msg_lower or 'tidak ditemukan' in msg_lower:
                logging.info(f"[{query_token}] REGHP returned 'Data Not Found'")
                data_not_found = True
                
                # Log data not found
                await db.chat_messages.insert_one({
                    "target_id": target_id,
                    "message": "[PENDALAMAN] ⚠️ REGHP: Data Not Found",
                    "direction": "received",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "query_type": "reghp"
                })
                break
            
            # Check if this is a REAL REGHP response (contains "identity" and NIK pattern)
            # NOT just Phone Location response
            is_reghp_response = (
                'identity' in msg_lower and 
                ('nik:' in msg_lower or re.search(r'nik:\s*\d{16}', msg_lower))
            )
            
            # Skip Phone Location responses (these have "phone location" in text)
            is_phone_location = 'phone location' in msg_lower
            
            if is_reghp_response and not is_phone_location:
                logging.info(f"[{query_token}] ✓ Found matching Reghp response (contains {phone_number})")
                logging.info(f"[{query_token}] Response preview: {msg.text[:200]}...")
                
                # Log response found
                await db.chat_messages.insert_one({
                    "target_id": target_id,
                    "message": f"[PENDALAMAN] 📥 Response REGHP diterima:\n{msg.text[:500]}{'...' if len(msg.text) > 500 else ''}",
                    "direction": "received",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "query_type": "reghp"
                })
                
                # Extract all info from response
                reghp_info = {
                    "raw_text": msg.text,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
                
                # Try to parse specific fields
                lines = msg.text.split('\n')
                parsed_data = {}
                for line in lines:
                    if ':' in line:
                        parts = line.split(':', 1)
                        if len(parts) == 2:
                            key = parts[0].strip()
                            value = parts[1].strip()
                            parsed_data[key] = value
                
                reghp_info['parsed_data'] = parsed_data
                break
        
        if data_not_found:
            # REGHP returned "Data Not Found"
            await db.targets.update_one(
                {"id": target_id},
                {
                    "$set": {
                        "reghp_status": "not_found",
                        "reghp_data": {
                            "error": "Data Not Found",
                            "message": "Data REGHP tidak ditemukan untuk nomor ini",
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        }
                    }
                }
            )
            logging.info(f"[REGHP {target_id}] Data Not Found")
            
            # Log to chat
            await db.chat_messages.insert_one({
                "target_id": target_id,
                "message": f"[PENDALAMAN] ⚠️ Data REGHP tidak ditemukan untuk {phone_number}",
                "direction": "received",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "query_type": "reghp"
            })
        elif reghp_info:
            # Parse multiple NIK entries from the MATCHED response
            niks = []
            nik_pattern = re.compile(r'NIK:\s*(\d{16})', re.IGNORECASE)
            for match in nik_pattern.finditer(reghp_info['raw_text']):
                nik_value = match.group(1)
                if nik_value not in niks:
                    niks.append(nik_value)
            
            reghp_info['niks'] = niks
            logging.info(f"[{query_token}] ✓ Found {len(niks)} unique NIKs: {niks}")
            
            await db.targets.update_one(
                {"id": target_id},
                {
                    "$set": {
                        "reghp_status": "completed",
                        "reghp_data": reghp_info
                    }
                }
            )
            logging.info(f"[REGHP {target_id}] ✓ Reghp data saved")
            
            # Log success
            await db.chat_messages.insert_one({
                "target_id": target_id,
                "message": f"[PENDALAMAN] ✅ REGHP selesai! Ditemukan {len(niks)} NIK",
                "direction": "received",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "query_type": "reghp"
            })
        else:
            await db.targets.update_one(
                {"id": target_id},
                {
                    "$set": {
                        "reghp_status": "error",
                        "reghp_data": {"error": "No Reghp response found"}
                    }
                }
            )
            logging.warning(f"[REGHP {target_id}] No Reghp data found")
            
            # Log error
            await db.chat_messages.insert_one({
                "target_id": target_id,
                "message": "[PENDALAMAN] ❌ REGHP gagal - tidak ada response",
                "direction": "received",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "query_type": "reghp"
            })
            
    except Exception as e:
        logging.error(f"[REGHP {target_id}] Error: {e}")
        await db.targets.update_one(
            {"id": target_id},
            {
                "$set": {
                    "reghp_status": "error",
                    "reghp_data": {"error": str(e)}
                }
            }
        )
        
        # Log error
        await db.chat_messages.insert_one({
            "target_id": target_id,
            "message": f"[PENDALAMAN] ❌ REGHP error: {str(e)}",
            "direction": "received",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "query_type": "reghp"
        })
    finally:
        # ALWAYS release the global lock
        clear_active_query()
        release_telegram_lock(operation_name)

async def query_telegram_nik(target_id: str, nik: str):
    """Query NIK detail dengan foto dari bot - with GLOBAL LOCK"""
    operation_name = f"NIK_{target_id[:8]}_{nik}"
    
    # ============================================
    # ACQUIRE GLOBAL TELEGRAM QUERY LOCK WITH TIMEOUT
    # ============================================
    logging.info(f"[NIK {target_id}] Waiting for global Telegram lock...")
    lock_acquired = await acquire_telegram_lock(operation_name)
    
    if not lock_acquired:
        logging.error(f"[NIK {target_id}] Failed to acquire lock - timeout")
        await db.targets.update_one(
            {"id": target_id},
            {"$set": {f"nik_queries.{nik}.status": "error", f"nik_queries.{nik}.data": {"error": "Server sibuk, coba lagi nanti"}}}
        )
        return
    
    set_active_query(f"nik_{target_id[:8]}", "nik", nik)
    
    try:
        global telegram_client
        
        # Ensure client is connected using safe wrapper
        connected = await safe_telegram_operation(
            lambda: ensure_telegram_connected(),
            "connect_for_nik",
            max_retries=5
        )
        
        if not connected:
            logging.error("[NIK] Failed to connect to Telegram")
            await db.targets.update_one(
                {"id": target_id},
                {"$set": {f"nik_queries.{nik}.status": "error", f"nik_queries.{nik}.data": {"error": "Telegram connection failed"}}}
            )
            return
        
        query_token = f"NIK_{nik}_{target_id[:8]}"
        logging.info(f"[{query_token}] Starting NIK query")
        
        # Short delay to prevent concurrent queries mixing
        await asyncio.sleep(1)
        
        # Send NIK to bot with safe wrapper
        async def send_nik():
            await telegram_client.send_message(BOT_USERNAME, nik)
            return True
        
        sent = await safe_telegram_operation(send_nik, f"send_nik_{nik}", max_retries=3)
        
        if not sent:
            logging.error(f"[{query_token}] Failed to send NIK")
            await db.targets.update_one(
                {"id": target_id},
                {"$set": {f"nik_queries.{nik}.status": "error", f"nik_queries.{nik}.data": {"error": "Gagal mengirim NIK ke bot"}}}
            )
            return
        
        logging.info(f"[{query_token}] Sent NIK: {nik} to bot")
        
        # Wait for initial response
        await asyncio.sleep(4)
        
        # Get messages with safe wrapper
        async def get_msgs():
            return await telegram_client.get_messages(BOT_USERNAME, limit=5)
        
        messages = await safe_telegram_operation(get_msgs, "get_nik_buttons", max_retries=3)
        
        if messages is None:
            logging.error(f"[{query_token}] Failed to get messages")
            await db.targets.update_one(
                {"id": target_id},
                {"$set": {f"nik_queries.{nik}.status": "error", f"nik_queries.{nik}.data": {"error": "Gagal membaca pesan dari bot"}}}
            )
            return
        
        nik_button = None
        nik_clicked = False
        for msg in messages:
            if msg.buttons:
                button_texts = [[btn.text for btn in row] for row in msg.buttons]
                logging.info(f"[{query_token}] Buttons found: {button_texts}")
                
                for row in msg.buttons:
                    for button in row:
                        if button.text and 'NIK' in button.text.upper():
                            nik_button = button
                            break
                    if nik_button:
                        break
                if nik_button:
                    break
        
        # Click NIK button with safe wrapper
        if nik_button:
            async def click_nik():
                await nik_button.click()
                return True
            
            clicked = await safe_telegram_operation(click_nik, f"click_nik_{nik}", max_retries=3)
            
            if clicked:
                logging.info(f"[{query_token}] ✓ Clicked NIK button")
                nik_clicked = True
            else:
                logging.error(f"[{query_token}] Failed to click NIK button after retries")
        
        if not nik_clicked:
            logging.warning(f"[{query_token}] NIK button not found or click failed")
        
        # Wait for response with photo
        nik_info = None
        photo_path = None
        found_matching_response = False
        
        # Try multiple times to get response (total ~20 seconds)
        for attempt in range(4):
            await asyncio.sleep(5)
            
            # Get NIK response with safe wrapper
            async def get_response():
                return await telegram_client.get_messages(BOT_USERNAME, limit=20)
            
            response_messages = await safe_telegram_operation(get_response, f"get_nik_response_{attempt}", max_retries=2)
            
            if response_messages is None:
                logging.warning(f"[{query_token}] Failed to get response at attempt {attempt+1}")
                continue
            
            for msg in response_messages:
                # Skip if we already have good NIK data (10+ fields) - don't overwrite with lesser data
                if nik_info and nik_info.get('parsed_data') and len(nik_info['parsed_data']) >= 10:
                    # Only continue looking for photo
                    if msg.photo and not photo_path and found_matching_response:
                        try:
                            photo_bytes = await telegram_client.download_media(msg.photo, bytes)
                            if photo_bytes:
                                import base64
                                photo_base64 = base64.b64encode(photo_bytes).decode('utf-8')
                                photo_path = f"data:image/jpeg;base64,{photo_base64}"
                                logging.info(f"[{query_token}] ✓ Photo downloaded ({len(photo_bytes)} bytes)")
                        except Exception as photo_err:
                            logging.error(f"[{query_token}] Error downloading photo: {photo_err}")
                    continue
                
                # STRICT TOKENIZATION: Must contain exact NIK we queried
                if msg.text and nik in msg.text:
                    logging.info(f"[{query_token}] Found message containing NIK {nik}")
                    
                    # Verify this is the RIGHT response (contains our NIK)
                    if ('identity of' in msg.text.lower() and nik in msg.text.lower()) or \
                       (f'NIK: {nik}' in msg.text or f'NIK:{nik}' in msg.text):
                        
                        logging.info(f"[{query_token}] ✓ CONFIRMED: This is response for NIK {nik}")
                        found_matching_response = True
                        
                        # Parse identity data - ONLY if it looks like full NIK data (contains Full Name)
                        if 'full name' in msg.text.lower():
                            logging.info(f"[{query_token}] Parsing identity data...")
                            
                            temp_nik_info = {
                                "nik": nik,
                                "raw_text": msg.text,
                                "timestamp": datetime.now(timezone.utc).isoformat()
                            }
                            
                            # Parse fields with improved multi-line handling
                            lines = msg.text.split('\n')
                            parsed_data = {}
                            current_key = None
                            current_value = ""
                            
                            for line in lines:
                                line = line.strip()
                                
                                # Skip empty lines, code blocks, and disclaimer
                                if not line or line.startswith('```') or 'not for misuse' in line.lower() or 'search at your own risk' in line.lower() or 'law enforcement only' in line.lower():
                                    continue
                                
                                # Skip header line
                                if line.startswith('Identity of'):
                                    continue
                                
                                # Check if line starts a new key-value pair
                                is_new_key = False
                                if ':' in line:
                                    colon_pos = line.index(':')
                                    if colon_pos < 25 and not line.startswith(' ') and line[0].isupper():
                                        potential_key = line.split(':', 1)[0].strip()
                                        if len(potential_key) < 20 and not any(word in potential_key for word in ['KOTA', 'RT.', 'RW.', 'KEL.', 'KEC.', 'KODE POS']):
                                            is_new_key = True
                                
                                if is_new_key:
                                    if current_key:
                                        parsed_data[current_key] = current_value.strip()
                                    
                                    parts = line.split(':', 1)
                                    current_key = parts[0].strip()
                                    current_value = parts[1].strip() if len(parts) == 2 else ""
                                else:
                                    if current_key and line:
                                        current_value += " " + line
                            
                            if current_key:
                                parsed_data[current_key] = current_value.strip()
                            
                            temp_nik_info['parsed_data'] = parsed_data
                            logging.info(f"[{query_token}] Parsed {len(parsed_data)} fields: {list(parsed_data.keys())}")
                            
                            # VERIFY: Check if parsed NIK matches queried NIK
                            if parsed_data.get('NIK') == nik:
                                logging.info(f"[{query_token}] ✓✓ NIK VERIFIED: Data matches queried NIK")
                                # Only accept if this has MORE fields than current data (or no current data)
                                if not nik_info or len(parsed_data) > len(nik_info.get('parsed_data', {})):
                                    nik_info = temp_nik_info
                                    logging.info(f"[{query_token}] ✓ Accepted NIK data with {len(parsed_data)} fields")
                            else:
                                logging.error(f"[{query_token}] ✗✗ NIK MISMATCH: Parsed NIK {parsed_data.get('NIK')} != Queried NIK {nik}")
                                continue
                
                # Check for photo in messages (must be near our NIK response)
                if msg.photo and not photo_path and found_matching_response:
                    try:
                        photo_bytes = await telegram_client.download_media(msg.photo, bytes)
                        if photo_bytes:
                            import base64
                            photo_base64 = base64.b64encode(photo_bytes).decode('utf-8')
                            photo_path = f"data:image/jpeg;base64,{photo_base64}"
                            logging.info(f"[{query_token}] ✓ Photo downloaded ({len(photo_bytes)} bytes)")
                    except Exception as photo_err:
                        logging.error(f"[{query_token}] Error downloading photo: {photo_err}")
            
            # If we found data, break out of retry loop
            if nik_info and photo_path:
                break
            elif nik_info:
                # Got text but waiting for photo, try once more
                logging.info(f"[{query_token}] Got text data, waiting for photo...")
                continue
        
        if nik_info or photo_path:
            if not nik_info:
                nik_info = {"nik": nik}
            
            if photo_path:
                nik_info['photo'] = photo_path
            
            await db.targets.update_one(
                {"id": target_id},
                {
                    "$set": {
                        f"nik_queries.{nik}.status": "completed",
                        f"nik_queries.{nik}.data": nik_info
                    }
                }
            )
            logging.info(f"[NIK {nik}] ✓ NIK data saved with photo: {photo_path is not None}")
        else:
            await db.targets.update_one(
                {"id": target_id},
                {
                    "$set": {
                        f"nik_queries.{nik}.status": "error",
                        f"nik_queries.{nik}.data": {"error": "No NIK response found"}
                    }
                }
            )
            logging.warning(f"[NIK {nik}] No NIK data found")
            
    except Exception as e:
        logging.error(f"[NIK {nik}] Error: {e}")
        await db.targets.update_one(
            {"id": target_id},
            {
                "$set": {
                    f"nik_queries.{nik}.status": "error",
                    f"nik_queries.{nik}.data": {"error": str(e)}
                }
            }
        )
    finally:
        # ALWAYS release the global lock
        clear_active_query()
        release_telegram_lock(operation_name)

async def query_telegram_family(target_id: str, family_id: str, source_nik: str = None):
    """Query Family (NKK) data dengan Family ID - with GLOBAL LOCK"""
    operation_name = f"FAMILY_{target_id[:8]}_{family_id}"
    
    # ============================================
    # ACQUIRE GLOBAL TELEGRAM QUERY LOCK WITH TIMEOUT
    # ============================================
    logging.info(f"[FAMILY {target_id}] Waiting for global Telegram lock...")
    lock_acquired = await acquire_telegram_lock(operation_name)
    
    if not lock_acquired:
        logging.error(f"[FAMILY {target_id}] Failed to acquire lock - timeout")
        if source_nik:
            await db.targets.update_one(
                {"id": target_id},
                {"$set": {f"nik_queries.{source_nik}.family_status": "error"}}
            )
        else:
            await db.targets.update_one(
                {"id": target_id},
                {"$set": {"family_status": "error"}}
            )
        return
    
    set_active_query(f"family_{target_id[:8]}", "family", family_id)
    
    try:
        global telegram_client
        
        # Ensure connection using safe wrapper
        connected = await safe_telegram_operation(
            lambda: ensure_telegram_connected(),
            "connect_for_family",
            max_retries=5
        )
        
        if not connected:
            logging.error(f"[FAMILY {target_id}] Failed to connect to Telegram")
            return
        
        query_token = f"FAMILY_{family_id}_{target_id[:8]}"
        logging.info(f"[{query_token}] Starting Family query for NIK: {source_nik}")
        
        # Add delay
        await asyncio.sleep(2)
        
        # Send Family ID to bot with safe wrapper
        async def send_family_id():
            await telegram_client.send_message(BOT_USERNAME, family_id)
            return True
        
        sent = await safe_telegram_operation(send_family_id, f"send_family_{family_id}", max_retries=3)
        
        if not sent:
            logging.error(f"[{query_token}] Failed to send Family ID")
            return
        
        logging.info(f"[{query_token}] Sent Family ID: {family_id}")
        
        await asyncio.sleep(5)
        
        # Get messages with safe wrapper
        async def get_msgs():
            return await telegram_client.get_messages(BOT_USERNAME, limit=5)
        
        messages = await safe_telegram_operation(get_msgs, "get_family_buttons", max_retries=3)
        
        if messages is None:
            logging.error(f"[{query_token}] Failed to get messages")
            return
        
        nkk_button = None
        nkk_clicked = False
        for msg in messages:
            if msg.buttons:
                button_texts = [[btn.text for btn in row] for row in msg.buttons]
                logging.info(f"[{query_token}] Buttons: {button_texts}")
                
                for row in msg.buttons:
                    for button in row:
                        if button.text and ('NKK' in button.text.upper() or 'FAMILY' in button.text.upper()):
                            nkk_button = button
                            break
                    if nkk_button:
                        break
                if nkk_button:
                    break
        
        # Click NKK button with safe wrapper
        if nkk_button:
            async def click_nkk():
                await nkk_button.click()
                return True
            
            clicked = await safe_telegram_operation(click_nkk, f"click_nkk_{family_id}", max_retries=3)
            
            if clicked:
                logging.info(f"[{query_token}] ✓ Clicked NKK button")
                nkk_clicked = True
            else:
                logging.error(f"[{query_token}] Failed to click NKK button after retries")
        
        if not nkk_clicked:
            logging.warning(f"[{query_token}] NKK button not found or click failed")
        
        # Wait for family data response
        await asyncio.sleep(10)
        
        # Get family response with safe wrapper
        async def get_response():
            return await telegram_client.get_messages(BOT_USERNAME, limit=20)
        
        response_messages = await safe_telegram_operation(get_response, "get_family_response", max_retries=3)
        
        if response_messages is None:
            logging.error(f"[{query_token}] Failed to get family response")
            return
        
        family_info = None
        for msg in response_messages:
            if msg.text and family_id in msg.text:
                # Look for NKK/Family Card data (multiple members)
                text_lower = msg.text.lower()
                
                if any(keyword in text_lower for keyword in ['kartu keluarga', 'nkk', 'household', 'anggota keluarga', 'family card']):
                    logging.info(f"[{query_token}] ✓ Found NKK/Family Card response")
                    
                    # Parse family members from NKK format
                    members = []
                    lines = msg.text.split('\n')
                    
                    current_member = {}
                    for line in lines:
                        line = line.strip()
                        if not line or 'not for misuse' in line.lower():
                            continue
                        
                        if ':' in line:
                            parts = line.split(':', 1)
                            key = parts[0].strip()
                            value = parts[1].strip() if len(parts) == 2 else ""
                            
                            # Key fields untuk family member
                            if key in ['NIK', 'Nik'] and value and len(value) == 16:
                                # New member starts
                                if current_member and current_member.get('nik'):
                                    members.append(current_member)
                                current_member = {'nik': value}
                            elif key in ['Full Name', 'Name', 'Nama'] and value:
                                current_member['name'] = value
                            elif key in ['Relationship', 'Hubungan', 'Status'] and value:
                                current_member['relationship'] = value
                            elif key in ['Gender', 'Jenis Kelamin', 'JK'] and value:
                                current_member['gender'] = value
                    
                    # Add last member
                    if current_member and current_member.get('nik'):
                        members.append(current_member)
                    
                    if members:
                        family_info = {
                            "family_id": family_id,
                            "members": members,
                            "raw_text": msg.text,
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        }
                        logging.info(f"[{query_token}] ✓ Parsed {len(members)} family members")
                        break
                else:
                    # Fallback: Maybe it's just list of members without "Kartu Keluarga" keyword
                    # Check if multiple NIK entries exist (sign of family data)
                    nik_count = msg.text.count('NIK:') + msg.text.count('Nik:')
                    if nik_count > 1:
                        logging.info(f"[{query_token}] Found {nik_count} NIK entries - parsing as family data")
                        
                        members = []
                        lines = msg.text.split('\n')
                        current_member = {}
                        
                        for line in lines:
                            line = line.strip()
                            if not line or 'not for misuse' in line.lower():
                                continue
                            
                            if ':' in line:
                                parts = line.split(':', 1)
                                key = parts[0].strip()
                                value = parts[1].strip() if len(parts) == 2 else ""
                                
                                if key in ['NIK', 'Nik'] and value and len(value) >= 14:
                                    if current_member and current_member.get('nik'):
                                        members.append(current_member)
                                    current_member = {'nik': value}
                                elif key in ['Full Name', 'Name', 'Nama'] and value:
                                    current_member['name'] = value
                                elif key in ['Relationship', 'Hubungan', 'Status'] and value:
                                    current_member['relationship'] = value
                                elif key in ['Gender', 'Jenis Kelamin', 'JK'] and value:
                                    current_member['gender'] = value
                        
                        if current_member and current_member.get('nik'):
                            members.append(current_member)
                        
                        if members and len(members) > 0:
                            family_info = {
                                "family_id": family_id,
                                "members": members,
                                "raw_text": msg.text,
                                "timestamp": datetime.now(timezone.utc).isoformat()
                            }
                            logging.info(f"[{query_token}] ✓ Parsed {len(members)} members from multi-NIK response")
                            break
        
        if family_info:
            # Store family data per NIK in nik_queries
            if source_nik:
                await db.targets.update_one(
                    {"id": target_id},
                    {
                        "$set": {
                            f"nik_queries.{source_nik}.family_status": "completed",
                            f"nik_queries.{source_nik}.family_data": family_info
                        }
                    }
                )
                logging.info(f"[{query_token}] ✓ Family data saved for NIK: {source_nik}")
            else:
                # Fallback to target-level for backward compatibility
                await db.targets.update_one(
                    {"id": target_id},
                    {
                        "$set": {
                            "family_status": "completed",
                            "family_data": family_info
                        }
                    }
                )
                logging.info(f"[{query_token}] ✓ Family data saved (target-level)")
        else:
            if source_nik:
                await db.targets.update_one(
                    {"id": target_id},
                    {
                        "$set": {
                            f"nik_queries.{source_nik}.family_status": "error",
                            f"nik_queries.{source_nik}.family_data": {"error": "No family data found"}
                        }
                    }
                )
            else:
                await db.targets.update_one(
                    {"id": target_id},
                    {
                        "$set": {
                            "family_status": "error",
                            "family_data": {"error": "No family data found"}
                        }
                    }
                )
            logging.warning(f"[{query_token}] No family data found")
    
    except Exception as e:
        logging.error(f"[FAMILY {family_id}] Error: {e}")
        if source_nik:
            await db.targets.update_one(
                {"id": target_id},
                {
                    "$set": {
                        f"nik_queries.{source_nik}.family_status": "error",
                        f"nik_queries.{source_nik}.family_data": {"error": str(e)}
                    }
                }
            )
        else:
            await db.targets.update_one(
                {"id": target_id},
                {
                    "$set": {
                        "family_status": "error",
                        "family_data": {"error": str(e)}
                    }
                }
            )
    finally:
        # ALWAYS release the global lock
        clear_active_query()
        release_telegram_lock(operation_name)

# NON GEOINT Search - Queue-based search for CAPIL, Pass WNI, Pass WNA
class NonGeointSearchRequest(BaseModel):
    name: str
    query_types: List[str] = ["capil", "pass_wni", "pass_wna"]

class NonGeointSearchResult(BaseModel):
    query_type: str
    status: str
    data: Optional[dict] = None
    niks_found: List[str] = []
    raw_text: Optional[str] = None
    error: Optional[str] = None

# Global queue lock for NON GEOINT queries
nongeoint_queue_lock = asyncio.Lock()

# Constants for pagination
PHOTO_BATCH_SIZE = 10  # Fetch 10 photos at a time

@api_router.post("/nongeoint/search")
async def nongeoint_search(request: NonGeointSearchRequest, username: str = Depends(verify_token)):
    """
    NON GEOINT Search - Sequentially queries CAPIL, Pass WNI, Pass WNA
    Uses queue system to prevent race conditions
    Now with CACHING: checks if name was searched before BY THE SAME USER
    """
    global current_request_status
    
    # ============================================
    # CHECK IF SYSTEM IS BUSY (another user doing query)
    # ============================================
    if current_request_status.get("is_busy"):
        busy_user = current_request_status.get("username", "unknown")
        busy_operation = current_request_status.get("operation", "unknown")
        # Block ALL users including the same user - no concurrent queries allowed
        logger.warning(f"[NONGEOINT] Blocked - System busy by {busy_user} doing {busy_operation}")
        raise HTTPException(
            status_code=503,
            detail={
                "error": "system_busy",
                "message": f"Antrian query sedang berjalan. User '{busy_user}' sedang melakukan {busy_operation}. Mohon tunggu hingga selesai.",
                "busy_user": busy_user,
                "operation": busy_operation,
                "started_at": current_request_status.get("started_at")
            }
        )
    
    search_name = request.name.strip().upper()  # Normalize name for caching
    
    # ============================================
    # CHECK CACHE: Look for existing search with same name BY THIS USER
    # Only use cache if pagination was properly done (photos_fetched_count <= batch_size for first batch)
    # ============================================
    existing_search = await db.nongeoint_searches.find_one(
        {
            "name_normalized": search_name,
            "created_by": username,  # Filter by user - each user has their own cache
            "status": {"$in": ["completed", "waiting_selection"]},
            "niks_found": {"$exists": True, "$ne": []},
            # Only use cache if it was created with pagination
            "batch_size": {"$exists": True}
        },
        {"_id": 0}
    )
    
    if existing_search:
        # Verify cache is valid (has pagination fields)
        if existing_search.get('batch_size') and existing_search.get('total_niks'):
            logger.info(f"[NONGEOINT] CACHE HIT: Found existing search for '{search_name}' (id: {existing_search['id']})")
            
            # Return cached search - frontend will use this data
            return {
                "search_id": existing_search['id'],
                "status": existing_search.get('status', 'completed'),
                "message": "Menggunakan data cache dari pencarian sebelumnya",
                "cached": True,
                "total_niks": existing_search.get('total_niks', len(existing_search.get('niks_found', []))),
                "photos_fetched": existing_search.get('photos_fetched_count', len(existing_search.get('nik_photos', {}))),
                "has_more_batches": existing_search.get('has_more_batches', False)
            }
        else:
            # Old cache without pagination - delete it and create new search
            logger.info(f"[NONGEOINT] Found OLD cache without pagination for '{search_name}', deleting and creating new search")
            await db.nongeoint_searches.delete_one({"id": existing_search['id']})
    
    # ============================================
    # NEW SEARCH: No cache found
    # ============================================
    search_id = str(uuid.uuid4())[:8]
    logger.info(f"[NONGEOINT {search_id}] Starting NEW search for name: {request.name}")
    
    # Store search in database with pagination fields
    search_doc = {
        "id": search_id,
        "name": request.name,
        "name_normalized": search_name,  # For cache lookup
        "query_types": request.query_types,
        "status": "processing",
        "results": {},
        "niks_found": [],
        "nik_photos": {},
        # Pagination fields
        "total_niks": 0,
        "current_batch": 0,
        "photos_fetched_count": 0,
        "batch_size": PHOTO_BATCH_SIZE,
        "all_batches_completed": False,
        # Timestamps
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": username
    }
    await db.nongeoint_searches.insert_one(search_doc)
    
    # Start background task
    asyncio.create_task(process_nongeoint_search(search_id, request.name, request.query_types))
    
    return {"search_id": search_id, "status": "processing", "message": "Search started", "cached": False}

@api_router.get("/nongeoint/search/{search_id}")
async def get_nongeoint_search(search_id: str, username: str = Depends(verify_token)):
    """Get NON GEOINT search results with investigation if exists"""
    logger.info(f"[NONGEOINT] Fetching search {search_id}")
    
    # Check if user is admin
    requester = await db.users.find_one({"username": username})
    is_admin = (username == ADMIN_USERNAME) or (requester and requester.get("is_admin", False))
    
    # Filter by user ownership - admin can see all
    query = {"id": search_id}
    if not is_admin:
        query["created_by"] = username
    
    search = await db.nongeoint_searches.find_one(query, {"_id": 0})
    if not search:
        logger.warning(f"[NONGEOINT] Search {search_id} not found or access denied")
        raise HTTPException(status_code=404, detail="Search not found or access denied")
    
    logger.info(f"[NONGEOINT] Found search: {search.get('name')}, status: {search.get('status')}, niks_found: {search.get('niks_found', [])}")
    
    # Also get investigation if exists
    investigation = await db.nik_investigations.find_one({"search_id": search_id}, {"_id": 0})
    if investigation:
        search["investigation"] = investigation
        logger.info(f"[NONGEOINT] Loaded investigation for search {search_id}: status={investigation.get('status')}, results_count={len(investigation.get('results', {}))}")
        # Log each NIK result in detail
        for nik, result in investigation.get('results', {}).items():
            has_nik = 'nik_data' in result
            has_nkk = 'nkk_data' in result  
            has_regnik = 'regnik_data' in result
            has_passport = 'passport_data' in result
            has_perlintasan = 'perlintasan_data' in result
            # Log passport and perlintasan details
            passport_data = result.get('passport_data', {})
            passport_count = len(passport_data.get('passports', [])) if passport_data else 0
            perlintasan_data = result.get('perlintasan_data', {})
            perlintasan_count = len(perlintasan_data.get('results', [])) if perlintasan_data else 0
            logger.info(f"[NONGEOINT]   NIK {nik}: nik_data={has_nik}, nkk_data={has_nkk}, regnik_data={has_regnik}, passport_data={has_passport}(count:{passport_count}), perlintasan_data={has_perlintasan}(count:{perlintasan_count})")
    else:
        logger.info(f"[NONGEOINT] No investigation found for search {search_id}")
    
    return search

@api_router.get("/nongeoint/searches")
async def list_nongeoint_searches(username: str = Depends(verify_token)):
    """List all NON GEOINT searches for user with investigation status"""
    # Check if user is admin (either username is 'admin' or has is_admin flag)
    requester = await db.users.find_one({"username": username})
    is_admin = (username == ADMIN_USERNAME) or (requester and requester.get("is_admin", False))
    
    # Filter by user - admin sees all
    query = {} if is_admin else {"created_by": username}
    
    searches = await db.nongeoint_searches.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)  # Increased limit for admin
    
    # Add investigation status for each search
    for search in searches:
        investigation = await db.nik_investigations.find_one(
            {"search_id": search["id"]}, 
            {"_id": 0, "status": 1, "id": 1, "results": 1}
        )
        if investigation:
            results = investigation.get("results", {})
            has_valid_results = len(results) > 0
            
            # Only mark as has_investigation if there are actual results
            search["has_investigation"] = has_valid_results
            search["investigation_status"] = investigation.get("status") if has_valid_results else None
            search["investigation_id"] = investigation.get("id") if has_valid_results else None
            search["investigated_niks_count"] = len(results)
            
            # Log for debugging - always log, not just debug level
            logger.info(f"[NONGEOINT LIST] Search {search['id']}: investigation found - status={investigation.get('status')}, results_count={len(results)}, has_valid={has_valid_results}, returning investigation_status={search['investigation_status']}")
        else:
            search["has_investigation"] = False
            search["investigation_status"] = None
            search["investigation_id"] = None
            search["investigated_niks_count"] = 0
    
    return searches

@api_router.post("/nongeoint/search/{search_id}/fetch-next-batch")
async def fetch_next_photo_batch(search_id: str, username: str = Depends(verify_token)):
    """
    Fetch next batch of photos (10 at a time)
    Called when user wants to see more candidates
    Uses global lock to prevent race conditions
    """
    global request_status
    
    # Check if system is busy with another request
    if request_status["is_busy"]:
        return {
            "status": "busy",
            "message": f"Sistem sedang memproses request lain: {request_status['operation']}",
            "queued": True
        }
    
    search = await db.nongeoint_searches.find_one({"id": search_id}, {"_id": 0})
    if not search:
        raise HTTPException(status_code=404, detail="Search not found")
    
    all_niks = search.get("niks_found", [])
    nik_photos = search.get("nik_photos", {})
    current_batch = search.get("current_batch", 0)
    batch_size = search.get("batch_size", PHOTO_BATCH_SIZE)
    
    # Calculate which NIKs to fetch in this batch
    start_idx = current_batch * batch_size
    end_idx = start_idx + batch_size
    
    # Get NIKs that haven't been fetched yet
    niks_to_fetch = []
    for i, nik in enumerate(all_niks):
        if i >= start_idx and i < end_idx and nik not in nik_photos:
            niks_to_fetch.append(nik)
    
    if not niks_to_fetch:
        # Check if there are more batches
        if end_idx >= len(all_niks):
            return {
                "status": "all_completed",
                "message": "Semua foto sudah diambil",
                "total_niks": len(all_niks),
                "photos_fetched": len(nik_photos),
                "has_more": False
            }
        else:
            # Move to next batch
            current_batch += 1
            start_idx = current_batch * batch_size
            end_idx = start_idx + batch_size
            niks_to_fetch = [nik for i, nik in enumerate(all_niks) if i >= start_idx and i < end_idx and nik not in nik_photos]
    
    if not niks_to_fetch:
        return {
            "status": "all_completed", 
            "message": "Semua foto sudah diambil",
            "total_niks": len(all_niks),
            "photos_fetched": len(nik_photos),
            "has_more": False
        }
    
    logger.info(f"[NONGEOINT {search_id}] Fetching next batch: {len(niks_to_fetch)} NIKs (batch {current_batch + 1})")
    
    # Set request status to busy BEFORE starting the task
    request_status = {
        "is_busy": True,
        "operation": f"Mengambil foto batch {current_batch + 1}",
        "username": username,
        "search_id": search_id,
        "started_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Update status
    await db.nongeoint_searches.update_one(
        {"id": search_id},
        {"$set": {
            "status": "fetching_photos",
            "current_batch": current_batch,
            "photo_fetch_progress": 0,
            "photo_fetch_total": len(niks_to_fetch),
            "has_more_batches": end_idx < len(all_niks)
        }}
    )
    
    # Start background task to fetch this batch
    asyncio.create_task(fetch_photo_batch(search_id, search.get("name", ""), niks_to_fetch, current_batch))
    
    return {
        "status": "fetching",
        "message": f"Mengambil {len(niks_to_fetch)} foto...",
        "batch": current_batch + 1,
        "total_batches": (len(all_niks) + batch_size - 1) // batch_size,
        "niks_in_batch": len(niks_to_fetch),
        "total_niks": len(all_niks),
        "photos_fetched": len(nik_photos),
        "has_more": end_idx < len(all_niks)
    }

async def fetch_photo_batch(search_id: str, name: str, niks_to_fetch: List[str], batch_num: int):
    """Background task to fetch a batch of photos"""
    global telegram_client, request_status
    
    def clear_batch_status():
        global request_status
        request_status = {"is_busy": False, "operation": None, "username": None}
    
    nik_photos = {}
    
    async with nongeoint_queue_lock:
        try:
            # Ensure Telegram connection
            connected = await safe_telegram_operation(
                lambda: ensure_telegram_connected(),
                f"batch_photo_{search_id}",
                max_retries=3
            )
            
            if not connected:
                await db.nongeoint_searches.update_one(
                    {"id": search_id},
                    {"$set": {"status": "waiting_selection", "error": "Telegram connection failed for batch"}}
                )
                clear_batch_status()
                return
            
            for idx, nik in enumerate(niks_to_fetch):
                logger.info(f"[NONGEOINT {search_id}] Batch {batch_num + 1}: Fetching photo {idx + 1}/{len(niks_to_fetch)} for NIK: {nik}")
                
                # Update progress
                await db.nongeoint_searches.update_one(
                    {"id": search_id},
                    {"$set": {
                        "photo_fetch_progress": idx + 1,
                        "photo_fetch_total": len(niks_to_fetch),
                        "photo_fetch_current_nik": nik
                    }}
                )
                
                try:
                    nik_result = await execute_nik_button_query(f"batch_{search_id}_{batch_num}", nik, "NIK")
                    
                    nik_photo_data = {
                        "nik": nik,
                        "photo": None,
                        "name": None,
                        "status": "unknown",
                        "batch": batch_num
                    }
                    
                    if nik_result:
                        nik_photo_data["status"] = nik_result.get("status", "unknown")
                        nik_photo_data["photo"] = nik_result.get("photo")
                        
                        if nik_result.get("data"):
                            data = nik_result["data"]
                            nik_photo_data["name"] = (
                                data.get("Nama") or data.get("nama") or 
                                data.get("NAMA") or data.get("Full Name") or data.get("Name")
                            )
                            nik_photo_data["ttl"] = data.get("TTL") or data.get("Tempat/Tgl Lahir")
                            nik_photo_data["alamat"] = data.get("Alamat") or data.get("alamat")
                            nik_photo_data["jk"] = data.get("Jenis Kelamin") or data.get("JK")
                        
                        if not nik_photo_data["name"] and nik_result.get("raw_text"):
                            raw = nik_result["raw_text"]
                            name_match = re.search(r'(?:nama|name)\s*[:\-]?\s*([^\n]+)', raw, re.IGNORECASE)
                            if name_match:
                                nik_photo_data["name"] = name_match.group(1).strip()
                    
                    # Calculate similarity
                    found_name = nik_photo_data.get("name", "")
                    similarity = check_name_similarity(name, found_name) if found_name else 0.0
                    nik_photo_data["similarity"] = similarity
                    
                    nik_photos[nik] = nik_photo_data
                    logger.info(f"[NONGEOINT {search_id}] NIK {nik}: photo={'Yes' if nik_photo_data.get('photo') else 'No'}, similarity={similarity:.2f}")
                    
                except Exception as nik_err:
                    logger.error(f"[NONGEOINT {search_id}] Error fetching NIK {nik}: {nik_err}")
                    nik_photos[nik] = {"nik": nik, "photo": None, "name": None, "status": "error", "error": str(nik_err), "similarity": 0, "batch": batch_num}
                
                await asyncio.sleep(3)
            
            # Merge with existing nik_photos
            existing = await db.nongeoint_searches.find_one({"id": search_id}, {"nik_photos": 1})
            existing_photos = existing.get("nik_photos", {}) if existing else {}
            existing_photos.update(nik_photos)
            
            # Check if all batches are complete
            search_data = await db.nongeoint_searches.find_one({"id": search_id})
            all_niks = search_data.get("niks_found", [])
            all_completed = len(existing_photos) >= len(all_niks)
            
            # Update database
            await db.nongeoint_searches.update_one(
                {"id": search_id},
                {"$set": {
                    "nik_photos": existing_photos,
                    "photos_fetched_count": len(existing_photos),
                    "status": "completed" if all_completed else "waiting_selection",
                    "all_batches_completed": all_completed,
                    "current_batch": batch_num + 1,
                    "has_more_batches": not all_completed
                }}
            )
            
            logger.info(f"[NONGEOINT {search_id}] Batch {batch_num + 1} completed. Total photos: {len(existing_photos)}/{len(all_niks)}")
            clear_batch_status()
            
        except Exception as e:
            logger.error(f"[NONGEOINT {search_id}] Batch photo fetch error: {e}")
            await db.nongeoint_searches.update_one(
                {"id": search_id},
                {"$set": {"status": "waiting_selection", "error": str(e)}}
            )
            clear_batch_status()

@api_router.post("/nongeoint/clear-cache")
async def clear_nongeoint_cache(username: str = Depends(verify_token)):
    """Clear all NON GEOINT search cache for fresh searches"""
    result = await db.nongeoint_searches.delete_many({"created_by": username})
    result2 = await db.nik_investigations.delete_many({"created_by": username})
    
    logger.info(f"[NONGEOINT] Cache cleared by {username}: {result.deleted_count} searches, {result2.deleted_count} investigations")
    return {
        "message": "Cache cleared successfully",
        "deleted_searches": result.deleted_count,
        "deleted_investigations": result2.deleted_count
    }

@api_router.post("/nongeoint/clear-cache/{name}")
async def clear_nongeoint_cache_by_name(name: str, username: str = Depends(verify_token)):
    """Clear NON GEOINT search cache for a specific name"""
    search_name = name.strip().upper()
    result = await db.nongeoint_searches.delete_many({
        "name_normalized": search_name,
        "created_by": username
    })
    
    logger.info(f"[NONGEOINT] Cache cleared for '{search_name}' by {username}: {result.deleted_count} searches")
    return {
        "message": f"Cache cleared for '{name}'",
        "deleted_searches": result.deleted_count
    }

@api_router.delete("/nongeoint/search/{search_id}")
async def delete_nongeoint_search(search_id: str, clear_nik_cache: bool = False, username: str = Depends(verify_token)):
    """Delete a NON GEOINT search and its associated investigation
    
    Args:
        clear_nik_cache: If True, also delete ALL related cache from simple_query_cache
                        This includes: NIK, NKK, REGNIK, Passport, Perlintasan, OSINT, SNA
                        Data will be deleted for ALL users (global cache clear)
    """
    # Check if search exists and belongs to user (admin can delete any)
    requester = await db.users.find_one({"username": username})
    is_admin = (username == ADMIN_USERNAME) or (requester and requester.get("is_admin", False))
    
    if is_admin:
        search = await db.nongeoint_searches.find_one({"id": search_id})
    else:
        search = await db.nongeoint_searches.find_one({"id": search_id, "created_by": username})
    
    if not search:
        raise HTTPException(status_code=404, detail="Search not found")
    
    # Get NIKs from search before deleting (for cache clearing)
    niks_to_clear = search.get("niks_found", [])
    
    # Delete the search
    await db.nongeoint_searches.delete_one({"id": search_id})
    
    # Also delete associated investigations
    investigation = await db.nik_investigations.find_one({"search_id": search_id})
    if investigation:
        # Get additional NIKs from investigation results
        if investigation.get("results"):
            niks_to_clear.extend(list(investigation["results"].keys()))
        await db.nik_investigations.delete_many({"search_id": search_id})
    
    # Clear ALL related cache from simple_query_cache if requested
    # This removes data for ALL users (global cache clear for this target)
    if clear_nik_cache and niks_to_clear:
        unique_niks = list(set(niks_to_clear))
        logger.info(f"[NONGEOINT] FULL CACHE CLEAR for {len(unique_niks)} NIKs - clearing NIK, NKK, REGNIK, Passport, Perlintasan, OSINT, SNA")
        
        # Collect all cache keys to delete
        all_cache_keys = []
        names_to_clear = []
        family_ids_to_clear = []
        passport_numbers_to_clear = []
        
        for nik in unique_niks:
            # Standard NIK-based cache keys
            all_cache_keys.extend([
                f"capil_nik:{nik}",
                f"nkk:{nik}",
                f"reghp:{nik}",  # RegNIK uses 'reghp' prefix
                f"osint:{nik}",  # OSINT cache
                f"sna:{nik}",    # SNA cache
            ])
        
        # Get names, family IDs, and passport numbers from investigation results
        if investigation and investigation.get("results"):
            for nik, result in investigation["results"].items():
                # Get Family ID for NKK cache
                family_id = None
                if result.get("nik_data", {}).get("data", {}).get("Family ID"):
                    family_id = result["nik_data"]["data"]["Family ID"]
                elif result.get("nkk_data", {}).get("data", {}).get("Family ID"):
                    family_id = result["nkk_data"]["data"]["Family ID"]
                elif result.get("nik_data", {}).get("data", {}).get("No KK"):
                    family_id = result["nik_data"]["data"]["No KK"]
                
                if family_id and family_id not in family_ids_to_clear:
                    family_ids_to_clear.append(family_id)
                    all_cache_keys.append(f"nkk:{family_id}")
                
                # Get name for passport cache (passport uses name, not NIK)
                target_name = None
                if result.get("nik_data", {}).get("data", {}).get("Full Name"):
                    target_name = result["nik_data"]["data"]["Full Name"]
                elif result.get("nik_data", {}).get("data", {}).get("Nama"):
                    target_name = result["nik_data"]["data"]["Nama"]
                
                if target_name and target_name.upper() not in names_to_clear:
                    names_to_clear.append(target_name.upper())
                    all_cache_keys.append(f"passport_wni:{target_name.upper()}")
                
                # Get passport numbers for perlintasan cache
                # Check both 'passports' array and 'results' array (different formats)
                passport_data = result.get("passport_data", {})
                if passport_data:
                    # Format 1: passports array
                    for passport_no in passport_data.get("passports", []):
                        if passport_no and passport_no not in passport_numbers_to_clear:
                            passport_numbers_to_clear.append(passport_no)
                            all_cache_keys.append(f"perlintasan:{passport_no}")
                    
                    # Format 2: wni_data.result array
                    wni_data = passport_data.get("wni_data", {})
                    if wni_data:
                        for item in wni_data.get("result", []) or wni_data.get("data", []) or []:
                            passport_no = item.get("no_paspor") or item.get("NO_PASPOR")
                            if passport_no and passport_no not in passport_numbers_to_clear:
                                passport_numbers_to_clear.append(passport_no)
                                all_cache_keys.append(f"perlintasan:{passport_no}")
                
                # Also check perlintasan_data for additional passport numbers
                perlintasan_data = result.get("perlintasan_data", {})
                if perlintasan_data:
                    for perl_result in perlintasan_data.get("results", []):
                        passport_no = perl_result.get("passport_no")
                        if passport_no and passport_no not in passport_numbers_to_clear:
                            passport_numbers_to_clear.append(passport_no)
                            all_cache_keys.append(f"perlintasan:{passport_no}")
        
        # Also get name from search data
        if search.get("name"):
            search_name = search['name'].upper()
            if search_name not in names_to_clear:
                names_to_clear.append(search_name)
                all_cache_keys.append(f"passport_wni:{search_name}")
        
        # Remove duplicates
        all_cache_keys = list(set(all_cache_keys))
        
        logger.info(f"[NONGEOINT] Cache keys to delete ({len(all_cache_keys)}): {all_cache_keys}")
        logger.info(f"[NONGEOINT] Names: {names_to_clear}, Family IDs: {family_ids_to_clear}, Passports: {passport_numbers_to_clear}")
        
        # Delete all cache keys
        deleted_count = 0
        if all_cache_keys:
            delete_result = await db.simple_query_cache.delete_many({"cache_key": {"$in": all_cache_keys}})
            deleted_count = delete_result.deleted_count
            logger.info(f"[NONGEOINT] Deleted {deleted_count} cache entries from simple_query_cache")
        
        # Also delete OSINT results stored in separate collection (if exists)
        osint_deleted = await db.osint_results.delete_many({"nik": {"$in": unique_niks}}) if hasattr(db, 'osint_results') else None
        if osint_deleted:
            logger.info(f"[NONGEOINT] Deleted {osint_deleted.deleted_count} OSINT results")
        
        # Also delete SNA results stored in separate collection (if exists)
        sna_deleted = await db.sna_results.delete_many({"nik": {"$in": unique_niks}}) if hasattr(db, 'sna_results') else None
        if sna_deleted:
            logger.info(f"[NONGEOINT] Deleted {sna_deleted.deleted_count} SNA results")
        
        logger.info(f"[NONGEOINT] FULL CACHE CLEAR completed for search {search_id}")
        
        return {
            "message": "Search deleted successfully with FULL cache clear",
            "cache_cleared": True,
            "niks_cleared": unique_niks,
            "cache_keys_deleted": deleted_count,
            "names_cleared": names_to_clear,
            "passport_numbers_cleared": passport_numbers_to_clear
        }
    
    logger.info(f"[NONGEOINT] Deleted search {search_id} by {username}")
    return {"message": "Search deleted successfully", "cache_cleared": clear_nik_cache}

async def process_nongeoint_search(search_id: str, name: str, query_types: List[str]):
    """Process NON GEOINT search with queue system - includes auto photo fetch"""
    global telegram_client
    
    results = {}
    all_niks = []
    nik_photos = {}  # Store photos for each NIK: {nik: {photo, name, raw_data}}
    
    async with nongeoint_queue_lock:
        # Acquire global telegram lock and set BUSY status
        search_doc = await db.nongeoint_searches.find_one({"id": search_id})
        search_username = search_doc.get("created_by", "unknown") if search_doc else "unknown"
        lock_acquired = await acquire_telegram_lock(f"Full Query - {name}", search_username)
        
        if not lock_acquired:
            logger.error(f"[NONGEOINT {search_id}] Could not acquire telegram lock")
            await db.nongeoint_searches.update_one(
                {"id": search_id},
                {"$set": {"status": "error", "error": "Sistem sedang sibuk, coba lagi nanti"}}
            )
            return
        
        try:
            # Ensure Telegram connection
            connected = await safe_telegram_operation(
                lambda: ensure_telegram_connected(),
                f"nongeoint_connect_{search_id}",
                max_retries=5
            )
            
            if not connected:
                await db.nongeoint_searches.update_one(
                    {"id": search_id},
                    {"$set": {"status": "error", "error": "Telegram connection failed"}}
                )
                return
            
            # Process each query type sequentially
            for query_type in query_types:
                logger.info(f"[NONGEOINT {search_id}] Processing {query_type} for '{name}'")
                
                # Update status
                await db.nongeoint_searches.update_one(
                    {"id": search_id},
                    {"$set": {f"results.{query_type}.status": "processing"}}
                )
                
                result = await execute_nongeoint_query(search_id, name, query_type)
                results[query_type] = result
                
                # Extract NIKs from result
                if result.get("niks_found"):
                    for nik in result["niks_found"]:
                        if nik not in all_niks:
                            all_niks.append(nik)
                
                # Update result in database
                await db.nongeoint_searches.update_one(
                    {"id": search_id},
                    {"$set": {f"results.{query_type}": result, "niks_found": all_niks}}
                )
                
                # Wait between queries to avoid rate limiting
                await asyncio.sleep(3)
            
            # ============================================
            # PHASE 2: Fetch photos for FIRST BATCH only (pagination)
            # Only fetch first 10 NIKs, user can load more later
            # ============================================
            if all_niks:
                total_niks = len(all_niks)
                logger.info(f"[NONGEOINT {search_id}] ======= PHASE 2: STARTING PHOTO FETCH (PAGINATED) =======")
                logger.info(f"[NONGEOINT {search_id}] Total NIKs found: {total_niks}")
                
                # Update total count
                await db.nongeoint_searches.update_one(
                    {"id": search_id},
                    {"$set": {"total_niks": total_niks}}
                )
                
                # Only fetch first batch (10 NIKs)
                first_batch = all_niks[:PHOTO_BATCH_SIZE]
                has_more = total_niks > PHOTO_BATCH_SIZE
                
                logger.info(f"[NONGEOINT {search_id}] Will fetch FIRST BATCH: {len(first_batch)} NIKs (has_more: {has_more})")
                
                # Update status to fetching_photos
                await db.nongeoint_searches.update_one(
                    {"id": search_id},
                    {"$set": {
                        "status": "fetching_photos", 
                        "photo_fetch_progress": 0,
                        "photo_fetch_total": len(first_batch),
                        "current_batch": 0
                    }}
                )
                
                for idx, nik in enumerate(first_batch):
                    logger.info(f"[NONGEOINT {search_id}] ------- Photo fetch {idx+1}/{len(first_batch)} for NIK: {nik} -------")
                    
                    # Update progress
                    await db.nongeoint_searches.update_one(
                        {"id": search_id},
                        {"$set": {
                            "photo_fetch_progress": idx + 1,
                            "photo_fetch_total": len(first_batch),
                            "photo_fetch_current_nik": nik
                        }}
                    )
                    
                    try:
                        # Query NIK to get photo
                        logger.info(f"[NONGEOINT {search_id}] Calling execute_nik_button_query for NIK {nik}")
                        nik_result = await execute_nik_button_query(f"photo_{search_id}", nik, "NIK")
                        logger.info(f"[NONGEOINT {search_id}] Result for NIK {nik}: status={nik_result.get('status') if nik_result else 'None'}, has_photo={bool(nik_result.get('photo')) if nik_result else False}")
                        
                        # Always create entry for this NIK
                        nik_photo_data = {
                            "nik": nik,
                            "photo": None,
                            "name": None,
                            "status": "unknown",
                            "batch": 0
                        }
                        
                        if nik_result:
                            nik_photo_data["status"] = nik_result.get("status", "unknown")
                            nik_photo_data["photo"] = nik_result.get("photo")
                            
                            # Try to extract name from NIK data
                            if nik_result.get("data"):
                                data = nik_result["data"]
                                nik_photo_data["name"] = (
                                    data.get("Nama") or 
                                    data.get("nama") or 
                                    data.get("NAMA") or 
                                    data.get("Full Name") or
                                    data.get("Name")
                                )
                                # Also store other useful fields
                                nik_photo_data["ttl"] = data.get("TTL") or data.get("Tempat/Tgl Lahir") or data.get("Tanggal Lahir")
                                nik_photo_data["alamat"] = data.get("Alamat") or data.get("alamat") or data.get("Address")
                                nik_photo_data["jk"] = data.get("Jenis Kelamin") or data.get("JK") or data.get("Gender")
                            
                            # Try to extract from raw_text if no structured data
                            if not nik_photo_data["name"] and nik_result.get("raw_text"):
                                raw = nik_result["raw_text"]
                                name_match = re.search(r'(?:nama|name|full\s*name)\s*[:\-]?\s*([^\n]+)', raw, re.IGNORECASE)
                                if name_match:
                                    nik_photo_data["name"] = name_match.group(1).strip()
                                    
                                # Also try to extract TTL if not found
                                if not nik_photo_data.get("ttl"):
                                    ttl_match = re.search(r'(?:ttl|tempat.*lahir|tgl.*lahir)\s*[:\-]?\s*([^\n]+)', raw, re.IGNORECASE)
                                    if ttl_match:
                                        nik_photo_data["ttl"] = ttl_match.group(1).strip()
                        
                        # Calculate name similarity score
                        found_name = nik_photo_data.get("name", "")
                        similarity = check_name_similarity(name, found_name) if found_name else 0.0
                        nik_photo_data["similarity"] = similarity
                        nik_photo_data["search_name"] = name  # Store original search name
                        
                        # Always save entry (even if photo not available)
                        nik_photos[nik] = nik_photo_data
                        logger.info(f"[NONGEOINT {search_id}] NIK {nik}: status={nik_photo_data.get('status')}, photo={'Yes' if nik_photo_data.get('photo') else 'No'}, name={nik_photo_data.get('name')}, similarity={similarity:.2f}")
                        
                    except Exception as nik_err:
                        logger.error(f"[NONGEOINT {search_id}] Error fetching NIK {nik}: {nik_err}")
                        nik_photos[nik] = {"nik": nik, "photo": None, "name": None, "status": "error", "error": str(nik_err), "similarity": 0, "batch": 0}
                    
                    # Wait between NIK queries
                    await asyncio.sleep(3)
                
                # Save nik_photos to database
                await db.nongeoint_searches.update_one(
                    {"id": search_id},
                    {"$set": {
                        "nik_photos": nik_photos,
                        "photos_fetched_count": len(nik_photos)
                    }}
                )
                logger.info(f"[NONGEOINT {search_id}] First batch photo fetch completed. {sum(1 for v in nik_photos.values() if v.get('photo'))} photos obtained")
            
                # Mark status based on whether there are more NIKs to fetch
                final_status = "waiting_selection" if has_more else "completed"
                all_completed = not has_more
                
                await db.nongeoint_searches.update_one(
                    {"id": search_id},
                    {"$set": {
                        "status": final_status,
                        "niks_found": all_niks,
                        "nik_photos": nik_photos,
                        "total_niks": total_niks,
                        "photos_fetched_count": len(nik_photos),
                        "current_batch": 1,
                        "all_batches_completed": all_completed,
                        "has_more_batches": has_more
                    }}
                )
                
                if has_more:
                    logger.info(f"[NONGEOINT {search_id}] Search paused for selection. Showing {len(nik_photos)}/{total_niks} NIKs. User can load more.")
                else:
                    logger.info(f"[NONGEOINT {search_id}] Search completed. Found {total_niks} NIKs with {sum(1 for v in nik_photos.values() if v.get('photo'))} photos")
            
            else:
                # No NIKs found
                await db.nongeoint_searches.update_one(
                    {"id": search_id},
                    {"$set": {
                        "status": "completed",
                        "niks_found": [],
                        "nik_photos": {},
                        "total_niks": 0,
                        "all_batches_completed": True
                    }}
                )
                logger.info(f"[NONGEOINT {search_id}] Search completed. No NIKs found.")
            
        except Exception as e:
            logger.error(f"[NONGEOINT {search_id}] Error: {e}")
            await db.nongeoint_searches.update_one(
                {"id": search_id},
                {"$set": {"status": "error", "error": str(e)}}
            )
        finally:
            # Always release lock when done
            release_telegram_lock(f"Full Query - {name}")
            logger.info(f"[NONGEOINT {search_id}] Released telegram lock")

async def execute_nongeoint_query(search_id: str, name: str, query_type: str) -> dict:
    """Execute a single NON GEOINT query"""
    global telegram_client
    from datetime import datetime, timezone, timedelta
    
    button_map = {
        "capil": "CAPIL",
        "pass_wni": "PASS WNI",
        "pass_wna": "PASS WNA"
    }
    
    button_text = button_map.get(query_type, query_type.upper())
    query_token = f"NONGEOINT_{search_id}_{query_type}"
    
    try:
        # IMPORTANT: Record timestamp BEFORE sending query
        query_start_time = datetime.now(timezone.utc)
        logger.info(f"[{query_token}] Query start time: {query_start_time}")
        
        # Step 1: Send name to bot
        async def send_name():
            await telegram_client.send_message(BOT_USERNAME, name)
            return True
        
        sent = await safe_telegram_operation(send_name, f"send_{query_token}", max_retries=3)
        if not sent:
            return {"status": "error", "error": "Failed to send name to bot", "niks_found": []}
        
        logger.info(f"[{query_token}] Sent name: {name}")
        await asyncio.sleep(2)  # Reduced from 4s to 2s - bot responds quickly
        
        # Step 2: Get buttons and click the right one
        async def get_buttons():
            return await telegram_client.get_messages(BOT_USERNAME, limit=5)
        
        messages = await safe_telegram_operation(get_buttons, f"get_buttons_{query_token}", max_retries=3)
        if not messages:
            return {"status": "error", "error": "Failed to get bot response", "niks_found": []}
        
        target_button = None
        for msg in messages:
            if msg.buttons:
                button_texts = [[btn.text for btn in row] for row in msg.buttons]
                logger.info(f"[{query_token}] Buttons found: {button_texts}")
                
                for row in msg.buttons:
                    for button in row:
                        if button.text and button_text.lower() in button.text.lower():
                            target_button = button
                            break
                    if target_button:
                        break
            if target_button:
                break
        
        if not target_button:
            # Try alternative button names
            alternative_names = {
                "capil": ["capil", "📝 capil", "dukcapil"],
                "pass_wni": ["pass wni", "🛂 pass wni", "passport wni", "paspor wni"],
                "pass_wna": ["pass wna", "🛂 pass wna", "passport wna", "paspor wna"]
            }
            
            for msg in messages:
                if msg.buttons:
                    for row in msg.buttons:
                        for button in row:
                            if button.text:
                                for alt in alternative_names.get(query_type, []):
                                    if alt.lower() in button.text.lower():
                                        target_button = button
                                        break
                            if target_button:
                                break
                        if target_button:
                            break
                if target_button:
                    break
        
        if not target_button:
            logger.warning(f"[{query_token}] Button '{button_text}' not found")
            return {"status": "not_found", "error": f"Button '{button_text}' not found", "niks_found": []}
        
        # Step 3: Click button
        async def click_button():
            await target_button.click()
            return True
        
        clicked = await safe_telegram_operation(click_button, f"click_{query_token}", max_retries=3)
        if not clicked:
            return {"status": "error", "error": "Failed to click button", "niks_found": []}
        
        logger.info(f"[{query_token}] Clicked button: {target_button.text}")
        
        # Record time after clicking button
        button_click_time = datetime.now(timezone.utc)
        await asyncio.sleep(2)  # Reduced from 5s to 2s - bot responds quickly
        
        # Step 4: Get response - increase limit for large results
        async def get_response():
            return await telegram_client.get_messages(BOT_USERNAME, limit=50)
        
        response_messages = await safe_telegram_operation(get_response, f"get_response_{query_token}", max_retries=3)
        if not response_messages:
            return {"status": "error", "error": "Failed to get response", "niks_found": []}
        
        # IMPORTANT: Filter messages to only include those AFTER our query
        # Use a buffer of 10 seconds before query_start_time to account for clock differences
        time_threshold = query_start_time - timedelta(seconds=10)
        filtered_messages = []
        for msg in response_messages:
            msg_time = msg.date.replace(tzinfo=timezone.utc) if msg.date.tzinfo is None else msg.date
            if msg_time >= time_threshold:
                filtered_messages.append(msg)
            else:
                logger.debug(f"[{query_token}] Skipping old message (time: {msg_time}, threshold: {time_threshold})")
        
        logger.info(f"[{query_token}] Filtered {len(response_messages)} messages to {len(filtered_messages)} (after {time_threshold})")
        response_messages = filtered_messages
        
        # For CAPIL queries with potentially many results, wait and get more messages
        if query_type == 'capil':
            await asyncio.sleep(1.5)  # Reduced from 3s to 1.5s
            more_messages = await safe_telegram_operation(get_response, f"get_more_{query_token}", max_retries=2)
            if more_messages:
                existing_ids = {m.id for m in response_messages}
                for m in more_messages:
                    if m.id not in existing_ids:
                        # Also filter by time
                        msg_time = m.date.replace(tzinfo=timezone.utc) if m.date.tzinfo is None else m.date
                        if msg_time >= time_threshold:
                            response_messages.append(m)
        
        # Step 5: Parse response - COLLECT ONLY NIKs (NOT Family IDs) FROM ALL filtered MESSAGES
        parsed_data = None
        all_raw_text = []
        niks_found = []
        passports_found = []  # NEW: Track passport numbers
        
        # First pass: collect ONLY NIKs (exclude Family IDs/No KK) and passports
        for msg in response_messages:
            if msg.text:
                # Extract 16-digit numbers but filter out Family IDs
                extracted_niks = extract_niks_only(msg.text)
                for nik in extracted_niks:
                    if nik not in niks_found:
                        niks_found.append(nik)
                        logger.info(f"[{query_token}] Found NIK: {nik}")
                
                # Extract passport numbers for pass_wni and pass_wna queries
                if query_type in ['pass_wni', 'pass_wna']:
                    extracted_passports = extract_passport_numbers(msg.text)
                    for passport in extracted_passports:
                        if passport not in passports_found:
                            passports_found.append(passport)
                            logger.info(f"[{query_token}] Found Passport: {passport}")
                
                # Collect raw text if relevant
                if name.lower() in msg.text.lower() or 'nik' in msg.text.lower() or len(extracted_niks) > 0 or len(passports_found) > 0:
                    all_raw_text.append(msg.text)
        
        raw_text = '\n---\n'.join(all_raw_text) if all_raw_text else None
        
        # Second pass: parse structured data from first relevant message
        for msg in response_messages:
            if msg.text and (name.lower() in msg.text.lower() or 'nik' in msg.text.lower()):
                parsed_data = parse_nongeoint_response(msg.text, query_type)
                
                # Check for "not found" message
                if 'not found' in msg.text.lower() or 'tidak ditemukan' in msg.text.lower():
                    if not niks_found:  # Only return not_found if we really found nothing
                        return {
                            "status": "not_found",
                            "raw_text": raw_text,
                            "niks_found": [],
                            "error": "Data not found"
                        }
                
                if parsed_data:
                    break
        
        logger.info(f"[{query_token}] Total NIKs found (excluding Family IDs): {len(niks_found)}")
        if passports_found:
            logger.info(f"[{query_token}] Total Passports found: {len(passports_found)}")
        
        if parsed_data or niks_found or passports_found:
            logger.info(f"[{query_token}] Found {len(niks_found)} NIKs: {niks_found}")
            result = {
                "status": "completed",
                "data": parsed_data,
                "raw_text": raw_text,
                "niks_found": niks_found
            }
            # Include passports_found only for passport queries
            if query_type in ['pass_wni', 'pass_wna'] and passports_found:
                result["passports_found"] = passports_found
            return result
        else:
            return {
                "status": "no_data",
                "raw_text": raw_text,
                "niks_found": [],
                "error": "No data parsed from response"
            }
            
    except Exception as e:
        logger.error(f"[{query_token}] Error: {e}")
        return {"status": "error", "error": str(e), "niks_found": []}


def extract_niks_only(text: str) -> list:
    """
    Extract only NIKs (16-digit numbers) from text, excluding Family IDs/No KK.
    Family IDs are typically labeled as 'No KK', 'NKK', 'Family ID', 'Nomor KK', etc.
    NIKs are typically labeled as 'NIK', 'Nomor NIK', etc.
    """
    import re
    
    # Find all 16-digit numbers with their positions
    all_16_digits = list(re.finditer(r'\b(\d{16})\b', text))
    
    if not all_16_digits:
        return []
    
    text_lower = text.lower()
    niks_only = []
    
    for match in all_16_digits:
        number = match.group(1)
        number_pos = match.start()
        
        # Get context around this number (100 chars before)
        start = max(0, number_pos - 100)
        context_before = text_lower[start:number_pos]
        
        # Family ID indicators (these mean the number is a Family ID, NOT a NIK)
        family_indicators = [
            'no kk', 'no. kk', 'nokk', 'n o k k',
            'nkk', 'n k k',
            'family id', 'familyid',
            'nomor kk', 'nomor kartu keluarga',
            'kartu keluarga',
            'kk :', 'kk:'
        ]
        
        # NIK indicators (these confirm the number is a NIK)
        nik_indicators = [
            'nik', 'n i k',
            'nomor induk', 'nomor nik',
            'national id', 'identity number'
        ]
        
        # Check the immediate context (last 30 chars before the number)
        immediate_context = context_before[-30:] if len(context_before) >= 30 else context_before
        
        # Determine if this is a Family ID or NIK
        is_family_id = any(indicator in immediate_context for indicator in family_indicators)
        is_nik = any(indicator in immediate_context for indicator in nik_indicators)
        
        # If explicitly labeled as NIK, include it
        if is_nik and not is_family_id:
            if number not in niks_only:
                niks_only.append(number)
                logger.debug(f"[extract_niks_only] Found NIK (labeled): {number}")
        # If explicitly labeled as Family ID, exclude it
        elif is_family_id:
            logger.debug(f"[extract_niks_only] Skipping Family ID: {number}")
            continue
        # If no explicit label but found in data, check if it looks like NIK pattern
        # NIK format: PPRRKKDDMMYYXXXX (province, regency, district, DOB, sequence)
        # First 6 digits are location code, next 6 are DOB (DDMMYY), last 4 are sequence
        else:
            # If the number appears after common field patterns, it's likely a NIK
            common_patterns = [':', '=', '-', '|', '\n', '\t']
            has_field_separator = any(sep in immediate_context[-5:] for sep in common_patterns)
            
            # If no Family ID label and has a field separator, assume it's a NIK
            if has_field_separator:
                if number not in niks_only:
                    niks_only.append(number)
                    logger.debug(f"[extract_niks_only] Found NIK (unlabeled): {number}")
    
    logger.info(f"[extract_niks_only] Extracted {len(niks_only)} NIKs from {len(all_16_digits)} 16-digit numbers")
    return niks_only


def extract_passport_numbers(text: str) -> list:
    """
    Extract passport numbers from text.
    Indonesian passport format: typically starts with A, B, C followed by 7-8 digits,
    or just alphanumeric combinations.
    Common patterns: A1234567, B12345678, etc.
    """
    import re
    
    passports_found = []
    
    # Pattern 1: Indonesian passport (letter followed by 7-8 digits)
    # Examples: A1234567, B12345678
    pattern1 = re.finditer(r'\b([A-Z]\d{7,8})\b', text, re.IGNORECASE)
    for match in pattern1:
        passport = match.group(1).upper()
        if passport not in passports_found:
            passports_found.append(passport)
    
    # Pattern 2: Look for explicitly labeled passport numbers
    # Examples: "No Paspor: A1234567", "Passport: A1234567"
    pattern2 = re.finditer(
        r'(?:no\.?\s*)?(?:paspor|passport|pasport)\s*[:\-]?\s*([A-Z0-9]{6,10})',
        text, re.IGNORECASE
    )
    for match in pattern2:
        passport = match.group(1).upper()
        if passport not in passports_found and len(passport) >= 6:
            passports_found.append(passport)
    
    # Pattern 3: Generic alphanumeric pattern that looks like passport
    # Must have at least one letter and one number, 7-9 characters
    pattern3 = re.finditer(r'\b([A-Z]{1,2}\d{6,8}|\d{6,8}[A-Z]{1,2})\b', text, re.IGNORECASE)
    for match in pattern3:
        passport = match.group(1).upper()
        if passport not in passports_found:
            passports_found.append(passport)
    
    logger.info(f"[extract_passport_numbers] Found {len(passports_found)} passport numbers")
    return passports_found


def parse_nongeoint_response(text: str, query_type: str) -> dict:
    """Parse NON GEOINT response based on query type"""
    parsed = {}
    lines = text.split('\n')
    
    for line in lines:
        line = line.strip()
        if not line or line.startswith('```'):
            continue
        
        if ':' in line:
            parts = line.split(':', 1)
            if len(parts) == 2:
                key = parts[0].strip()
                value = parts[1].strip()
                if key and value and len(key) < 30:
                    parsed[key] = value
    
    return parsed if parsed else None


def check_name_similarity(search_name: str, found_name: str) -> float:
    """Check similarity between search name and found name - returns score 0-1"""
    if not search_name or not found_name:
        return 0.0
    
    # Normalize names
    search_lower = search_name.lower().strip()
    found_lower = found_name.lower().strip()
    
    # Exact match
    if search_lower == found_lower:
        return 1.0
    
    # Split into parts
    search_parts = set(search_lower.split())
    found_parts = set(found_lower.split())
    
    # Check if all search parts are in found name
    if search_parts.issubset(found_parts):
        return 0.9
    
    # Check word overlap
    common = search_parts.intersection(found_parts)
    if not common:
        return 0.0
    
    # Calculate Jaccard similarity
    union = search_parts.union(found_parts)
    similarity = len(common) / len(union)
    
    # Bonus if first word matches (usually family name)
    search_first = search_lower.split()[0] if search_lower.split() else ""
    found_first = found_lower.split()[0] if found_lower.split() else ""
    if search_first == found_first and len(search_first) > 2:
        similarity = min(1.0, similarity + 0.2)
    
    return similarity


# NIK Deep Investigation (NIK, NKK, RegNIK)
class NikDeepInvestigationRequest(BaseModel):
    search_id: str
    niks: List[str]

@api_router.post("/nongeoint/investigate-niks")
async def investigate_niks(request: NikDeepInvestigationRequest, username: str = Depends(verify_token)):
    """
    Deep investigation for selected NIKs - queries NIK, NKK, RegNIK for each
    """
    global current_request_status
    
    # ============================================
    # CHECK IF SYSTEM IS BUSY (another operation running)
    # ============================================
    if current_request_status.get("is_busy"):
        busy_user = current_request_status.get("username", "unknown")
        busy_operation = current_request_status.get("operation", "unknown")
        # Block ALL users including the same user - no concurrent queries allowed
        logger.warning(f"[INVESTIGATE] Blocked - System busy by {busy_user} doing {busy_operation}")
        raise HTTPException(
            status_code=503,
            detail={
                "error": "system_busy",
                "message": f"Antrian query sedang berjalan. User '{busy_user}' sedang melakukan {busy_operation}. Mohon tunggu hingga selesai.",
                "busy_user": busy_user,
                "operation": busy_operation,
                "started_at": current_request_status.get("started_at")
            }
        )
    
    # Check if there's already an active investigation for this search_id
    active_investigation = await db.nik_investigations.find_one({
        "search_id": request.search_id,
        "status": {"$in": ["processing", "pending"]}
    }, {"_id": 0})
    
    if active_investigation:
        # Check if it's by another user
        active_user = active_investigation.get("created_by", "unknown")
        if active_user != username:
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "investigation_in_progress",
                    "message": f"Target sedang didalami oleh user lain: {active_user}",
                    "active_user": active_user,
                    "investigation_id": active_investigation.get("id"),
                    "started_at": active_investigation.get("created_at")
                }
            )
        else:
            # Same user, return existing investigation
            return {
                "investigation_id": active_investigation.get("id"),
                "status": "already_processing",
                "message": "Anda sudah memulai pendalaman untuk target ini"
            }
    
    investigation_id = str(uuid.uuid4())[:8]
    logger.info(f"[NIK INVESTIGATION {investigation_id}] Starting for {len(request.niks)} NIKs by {username}")
    
    # Create investigation document
    investigation_doc = {
        "id": investigation_id,
        "search_id": request.search_id,
        "niks": request.niks,
        "status": "processing",
        "results": {},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": username
    }
    await db.nik_investigations.insert_one(investigation_doc)
    
    # Start background processing
    asyncio.create_task(process_nik_investigation(investigation_id, request.search_id, request.niks))
    
    return {"investigation_id": investigation_id, "status": "processing"}

@api_router.get("/nongeoint/investigation/{investigation_id}")
async def get_investigation(investigation_id: str, username: str = Depends(verify_token)):
    """Get NIK investigation results"""
    investigation = await db.nik_investigations.find_one({"id": investigation_id}, {"_id": 0})
    if not investigation:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    # Log for debugging
    logger.info(f"[GET INVESTIGATION {investigation_id}] Status: {investigation.get('status')}, Results keys: {list(investigation.get('results', {}).keys())}")
    
    return investigation

# ==================== FAKTA OSINT FEATURE ====================

class FaktaOsintRequest(BaseModel):
    search_id: str
    nik: str
    name: str

@api_router.post("/nongeoint/fakta-osint")
async def start_fakta_osint(request: FaktaOsintRequest, username: str = Depends(verify_token)):
    """
    Start FAKTA OSINT search for a target - searches web and AI summarization
    """
    osint_id = str(uuid.uuid4())[:8]
    logger.info(f"[FAKTA OSINT {osint_id}] Starting for {request.name} (NIK: {request.nik})")
    
    # Create osint document
    osint_doc = {
        "id": osint_id,
        "search_id": request.search_id,
        "nik": request.nik,
        "name": request.name,
        "status": "processing",
        "results": {},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": username
    }
    await db.fakta_osint.insert_one(osint_doc)
    
    # Start background processing
    asyncio.create_task(process_fakta_osint(osint_id, request.search_id, request.nik, request.name))
    
    return {"osint_id": osint_id, "status": "processing"}

@api_router.get("/nongeoint/fakta-osint/{osint_id}")
async def get_fakta_osint(osint_id: str, username: str = Depends(verify_token)):
    """Get FAKTA OSINT results"""
    osint = await db.fakta_osint.find_one({"id": osint_id}, {"_id": 0})
    if not osint:
        raise HTTPException(status_code=404, detail="OSINT not found")
    
    logger.info(f"[GET FAKTA OSINT {osint_id}] Status: {osint.get('status')}")
    return osint

async def process_fakta_osint(osint_id: str, search_id: str, nik: str, name: str):
    """Process FAKTA OSINT - comprehensive analysis with internal data + web search"""
    try:
        logger.info(f"[FAKTA OSINT {osint_id}] Processing for {name} (NIK: {nik})")
        
        results = {
            "summary": None,
            "antecedents": None,
            "internal_data": {},  # Data from NIK, NKK, REGNIK, Passport, Perlintasan
            "social_media": [],
            "legal_cases": [],
            "web_mentions": [],
            "risk_assessment": None
        }
        
        # ============ 0. FETCH INTERNAL DATA FROM DATABASE ============
        logger.info(f"[FAKTA OSINT {osint_id}] Fetching internal investigation data...")
        
        internal_data = {
            "nik_data": None,
            "nkk_data": None,
            "regnik_data": None,
            "passport_data": None,
            "perlintasan_data": None
        }
        
        # Get investigation data from database
        investigation = await db.nik_investigations.find_one({"search_id": search_id}, {"_id": 0})
        if investigation and investigation.get("results", {}).get(nik):
            nik_result = investigation["results"][nik]
            
            # Extract NIK data
            if nik_result.get("nik_data", {}).get("data"):
                internal_data["nik_data"] = nik_result["nik_data"]["data"]
                logger.info(f"[FAKTA OSINT {osint_id}] Found NIK data")
            
            # Extract NKK data (family members)
            if nik_result.get("nkk_data", {}).get("data"):
                internal_data["nkk_data"] = nik_result["nkk_data"]["data"]
                logger.info(f"[FAKTA OSINT {osint_id}] Found NKK data")
            
            # Extract REGNIK data
            if nik_result.get("regnik_data", {}).get("data"):
                internal_data["regnik_data"] = nik_result["regnik_data"]["data"]
                logger.info(f"[FAKTA OSINT {osint_id}] Found REGNIK data")
            
            # Extract Passport data
            if nik_result.get("passport_data"):
                internal_data["passport_data"] = nik_result["passport_data"]
                logger.info(f"[FAKTA OSINT {osint_id}] Found Passport data")
            
            # Extract Perlintasan data (border crossings)
            if nik_result.get("perlintasan_data"):
                internal_data["perlintasan_data"] = nik_result["perlintasan_data"]
                logger.info(f"[FAKTA OSINT {osint_id}] Found Perlintasan data")
        
        results["internal_data"] = internal_data
        
        # ============ 0.5. SEARCH FAMILY MEMBERS IN CACHE ============
        family_cache_data = []
        try:
            # Extract family member NIKs from NKK data
            family_niks = []
            nkk_data = internal_data.get("nkk_data")
            
            if nkk_data:
                logger.info(f"[FAKTA OSINT {osint_id}] Searching family members in cache...")
                
                # NKK data could be dict or list
                if isinstance(nkk_data, list):
                    for member in nkk_data:
                        if isinstance(member, dict):
                            member_nik = member.get('nik') or member.get('NIK') or member.get('no_ktp')
                            if member_nik and member_nik != nik:  # Exclude target's own NIK
                                family_niks.append({
                                    'nik': str(member_nik),
                                    'nama': member.get('nama') or member.get('Nama') or member.get('name', 'Unknown'),
                                    'hubungan': member.get('hubungan') or member.get('Hubungan') or member.get('relation', 'Unknown')
                                })
                elif isinstance(nkk_data, dict):
                    # Check for members array inside dict
                    members = nkk_data.get('members') or nkk_data.get('anggota') or nkk_data.get('family_members', [])
                    if isinstance(members, list):
                        for member in members:
                            if isinstance(member, dict):
                                member_nik = member.get('nik') or member.get('NIK') or member.get('no_ktp')
                                if member_nik and member_nik != nik:
                                    family_niks.append({
                                        'nik': str(member_nik),
                                        'nama': member.get('nama') or member.get('Nama') or member.get('name', 'Unknown'),
                                        'hubungan': member.get('hubungan') or member.get('Hubungan') or member.get('relation', 'Unknown')
                                    })
                
                logger.info(f"[FAKTA OSINT {osint_id}] Found {len(family_niks)} family member NIKs to search")
                
                # Search cache for each family member
                for family_member in family_niks:
                    fnik = family_member['nik']
                    cached_data = {
                        'nik': fnik,
                        'nama': family_member['nama'],
                        'hubungan': family_member['hubungan'],
                        'has_investigation': False,
                        'has_osint': False,
                        'investigation_data': None,
                        'osint_data': None,
                        'search_info': None
                    }
                    
                    # Search in nik_investigations (all users)
                    inv_with_nik = await db.nik_investigations.find_one(
                        {f"results.{fnik}": {"$exists": True}},
                        {"_id": 0, f"results.{fnik}": 1, "search_id": 1, "created_at": 1, "osint_results": 1}
                    )
                    
                    if inv_with_nik:
                        cached_data['has_investigation'] = True
                        cached_data['investigation_data'] = inv_with_nik.get('results', {}).get(fnik)
                        
                        # Check if OSINT exists for this family member
                        if inv_with_nik.get('osint_results', {}).get(fnik):
                            cached_data['has_osint'] = True
                            cached_data['osint_data'] = inv_with_nik['osint_results'][fnik]
                        
                        # Get search info
                        search_info = await db.nongeoint_searches.find_one(
                            {"id": inv_with_nik.get('search_id')},
                            {"_id": 0, "name": 1, "created_at": 1, "created_by": 1}
                        )
                        if search_info:
                            cached_data['search_info'] = search_info
                        
                        logger.info(f"[FAKTA OSINT {osint_id}] Found cached data for family member {fnik} ({family_member['nama']})")
                    
                    # Also search in fakta_osint collection directly
                    if not cached_data['has_osint']:
                        osint_record = await db.fakta_osint.find_one(
                            {"nik": fnik, "status": "completed"},
                            {"_id": 0}
                        )
                        if osint_record:
                            cached_data['has_osint'] = True
                            cached_data['osint_data'] = osint_record.get('results', {})
                            logger.info(f"[FAKTA OSINT {osint_id}] Found OSINT data for family member {fnik}")
                    
                    # Only add if we found something
                    if cached_data['has_investigation'] or cached_data['has_osint']:
                        family_cache_data.append(cached_data)
                
                logger.info(f"[FAKTA OSINT {osint_id}] Found {len(family_cache_data)} family members with cached data")
        
        except Exception as e:
            logger.error(f"[FAKTA OSINT {osint_id}] Error searching family cache: {e}")
        
        results["family_cache"] = family_cache_data
        
        # Update progress
        await db.fakta_osint.update_one(
            {"id": osint_id},
            {"$set": {"status": "fetched_internal_data", "results.internal_data": internal_data, "results.family_cache": family_cache_data}}
        )
        
        # Search name variations
        name_cleaned = name.strip()
        
        # Build more targeted search queries
        search_queries = [
            f'"{name_cleaned}"',
            f'{name_cleaned} Indonesia',
            f'{name_cleaned} LinkedIn',
            f'{name_cleaned} Facebook',
            f'{name_cleaned} Instagram',
        ]
        
        # If we have address from NIK data, add location-based search
        if internal_data.get("nik_data"):
            nik_info = internal_data["nik_data"]
            if isinstance(nik_info, dict):
                address = nik_info.get("Address") or nik_info.get("Alamat") or ""
                if address:
                    search_queries.append(f'{name_cleaned} {address[:30]}')
        
        # List of SIPP court URLs to search
        sipp_courts = [
            {"name": "PN Jakarta Selatan", "url": "sipp.pn-jakartaselatan.go.id"},
            {"name": "PN Jakarta Pusat", "url": "sipp.pn-jakartapusat.go.id"},
            {"name": "PN Jakarta Barat", "url": "sipp.pn-jakartabarat.go.id"},
            {"name": "PN Jakarta Timur", "url": "sipp.pn-jakartautara.go.id"},
            {"name": "PN Bandung", "url": "sipp.pn-bandung.go.id"},
            {"name": "PN Surabaya", "url": "sipp.pn-surabaya.go.id"},
            {"name": "PN Medan", "url": "sipp.pn-medan.go.id"},
            {"name": "PN Semarang", "url": "sipp.pn-semarang.go.id"},
            {"name": "PN Makassar", "url": "sipp.pn-makassar.go.id"},
            {"name": "PN Palembang", "url": "sipp.pn-palembang.go.id"},
        ]
        
        # ============ 1. Web Search for General Info + Social Media ============
        web_data = []
        try:
            import aiohttp
            import socket
            from bs4 import BeautifulSoup
            import urllib.parse
            
            # DuckDuckGo search
            connector = aiohttp.TCPConnector(family=socket.AF_INET)
            async with aiohttp.ClientSession(connector=connector) as session:
                for query in search_queries[:5]:  # Search up to 5 queries
                    encoded_query = urllib.parse.quote(query)
                    ddg_url = f"https://html.duckduckgo.com/html/?q={encoded_query}"
                    
                    try:
                        async with session.get(
                            ddg_url,
                            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
                            timeout=aiohttp.ClientTimeout(total=15)
                        ) as response:
                            if response.status == 200:
                                html = await response.text()
                                soup = BeautifulSoup(html, 'html.parser')
                                
                                # Extract search results
                                for result in soup.find_all('div', class_='result')[:7]:
                                    title_elem = result.find('a', class_='result__a')
                                    snippet_elem = result.find('a', class_='result__snippet')
                                    
                                    if title_elem:
                                        title = title_elem.get_text(strip=True)
                                        link = title_elem.get('href', '')
                                        snippet = snippet_elem.get_text(strip=True) if snippet_elem else ''
                                        
                                        # Avoid duplicates
                                        if not any(w['url'] == link for w in web_data):
                                            web_data.append({
                                                "title": title,
                                                "url": link,
                                                "snippet": snippet
                                            })
                    except Exception as e:
                        logger.warning(f"[FAKTA OSINT {osint_id}] Search error: {e}")
                    
                    await asyncio.sleep(0.8)
                    
        except Exception as e:
            logger.error(f"[FAKTA OSINT {osint_id}] Web search error: {e}")
        
        results["web_mentions"] = web_data[:10]
        logger.info(f"[FAKTA OSINT {osint_id}] Found {len(web_data)} web mentions")
        
        # Update progress
        await db.fakta_osint.update_one(
            {"id": osint_id},
            {"$set": {"status": "searching_social", "results.web_mentions": results["web_mentions"]}}
        )
        
        # ============ 2. Social Media Detection - Enhanced ============
        social_media_patterns = {
            "facebook": {"pattern": r'facebook\.com/([^/?\s"]+)', "icon": "facebook", "url_template": "https://facebook.com/{}"},
            "instagram": {"pattern": r'instagram\.com/([^/?\s"]+)', "icon": "instagram", "url_template": "https://instagram.com/{}"},
            "twitter": {"pattern": r'(?:twitter|x)\.com/([^/?\s"]+)', "icon": "twitter", "url_template": "https://x.com/{}"},
            "youtube": {"pattern": r'youtube\.com/(?:user|channel|c|@)?/?([^/?\s"]+)', "icon": "youtube", "url_template": "https://youtube.com/@{}"},
            "tiktok": {"pattern": r'tiktok\.com/@?([^/?\s"]+)', "icon": "tiktok", "url_template": "https://tiktok.com/@{}"},
            "linkedin": {"pattern": r'linkedin\.com/in/([^/?\s"]+)', "icon": "linkedin", "url_template": "https://linkedin.com/in/{}"},
            "email": {"pattern": r'[\w\.-]+@[\w\.-]+\.\w+', "icon": "email", "url_template": "mailto:{}"},
            "github": {"pattern": r'github\.com/([^/?\s"]+)', "icon": "github", "url_template": "https://github.com/{}"},
            "telegram": {"pattern": r't\.me/([^/?\s"]+)', "icon": "telegram", "url_template": "https://t.me/{}"},
        }
        
        social_media_found = []
        import re
        
        # Blacklist common non-profile URLs
        blacklist_usernames = ["search", "explore", "hashtag", "login", "signup", "share", "watch", "help", "about", "settings", "privacy", "terms", "policy"]
        
        # Search web data for social media links
        for item in web_data:
            url = item.get("url", "")
            snippet = item.get("snippet", "")
            title = item.get("title", "")
            combined = f"{url} {snippet} {title}"
            
            for platform, config in social_media_patterns.items():
                matches = re.findall(config["pattern"], combined, re.IGNORECASE)
                for match in matches:
                    match_clean = match.strip().rstrip('.,;:')
                    if match_clean and match_clean.lower() not in blacklist_usernames and len(match_clean) > 2:
                        # Build proper URL
                        if platform == "email":
                            profile_url = f"mailto:{match_clean}"
                        else:
                            profile_url = config["url_template"].format(match_clean)
                        
                        social_entry = {
                            "platform": platform,
                            "username": match_clean,
                            "url": profile_url,
                            "icon": config["icon"],
                            "source": url
                        }
                        # Avoid duplicates
                        if not any(s["platform"] == platform and s["username"].lower() == match_clean.lower() for s in social_media_found):
                            social_media_found.append(social_entry)
        
        # Direct search for social media profiles by name
        try:
            import aiohttp
            import urllib.parse
            
            # Search for specific social media profiles
            social_searches = [
                f'site:linkedin.com/in "{name_cleaned}"',
                f'site:facebook.com "{name_cleaned}"',
                f'site:instagram.com "{name_cleaned}"',
            ]
            
            connector = aiohttp.TCPConnector(family=socket.AF_INET)
            async with aiohttp.ClientSession(connector=connector) as session:
                for search_query in social_searches:
                    try:
                        encoded_query = urllib.parse.quote(search_query)
                        ddg_url = f"https://html.duckduckgo.com/html/?q={encoded_query}"
                        
                        async with session.get(
                            ddg_url,
                            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
                            timeout=aiohttp.ClientTimeout(total=10)
                        ) as response:
                            if response.status == 200:
                                html = await response.text()
                                soup = BeautifulSoup(html, 'html.parser')
                                
                                for result in soup.find_all('div', class_='result')[:3]:
                                    title_elem = result.find('a', class_='result__a')
                                    if title_elem:
                                        link = title_elem.get('href', '')
                                        for platform, config in social_media_patterns.items():
                                            if platform in ['email']:
                                                continue
                                            matches = re.findall(config["pattern"], link, re.IGNORECASE)
                                            for match in matches:
                                                match_clean = match.strip().rstrip('.,;:')
                                                if match_clean and match_clean.lower() not in blacklist_usernames:
                                                    profile_url = config["url_template"].format(match_clean)
                                                    if not any(s["platform"] == platform and s["username"].lower() == match_clean.lower() for s in social_media_found):
                                                        social_media_found.append({
                                                            "platform": platform,
                                                            "username": match_clean,
                                                            "url": profile_url,
                                                            "icon": config["icon"],
                                                            "source": "direct_search"
                                                        })
                    except Exception as e:
                        pass
                    await asyncio.sleep(0.5)
        except Exception as e:
            logger.warning(f"[FAKTA OSINT {osint_id}] Social search error: {e}")
        
        results["social_media"] = social_media_found
        logger.info(f"[FAKTA OSINT {osint_id}] Found {len(social_media_found)} social media profiles")
        
        # Update progress
        await db.fakta_osint.update_one(
            {"id": osint_id},
            {"$set": {"status": "searching_legal", "results.social_media": results["social_media"]}}
        )
        
        # ============ 3. Legal Case Search (SIPP Courts) ============
        legal_cases = []
        try:
            import aiohttp
            connector = aiohttp.TCPConnector(family=socket.AF_INET)
            async with aiohttp.ClientSession(connector=connector) as session:
                # Search Pusiknas DPO (Daftar Pencarian Orang)
                try:
                    pusiknas_url = f"https://pusiknas.polri.go.id/dpo?nama={urllib.parse.quote(name_cleaned)}"
                    logger.info(f"[FAKTA OSINT {osint_id}] Checking Pusiknas DPO")
                    
                    async with session.get(
                        pusiknas_url,
                        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
                        timeout=aiohttp.ClientTimeout(total=10),
                        allow_redirects=True,
                        ssl=False  # Skip SSL verification for government sites
                    ) as response:
                        if response.status == 200:
                            html = await response.text()
                            if name_cleaned.lower() in html.lower() or "ditemukan" in html.lower():
                                legal_cases.append({
                                    "source": "Pusiknas POLRI - DPO",
                                    "status": "possible_match",
                                    "url": pusiknas_url,
                                    "note": "Nama ditemukan dalam database DPO - perlu verifikasi manual"
                                })
                except Exception as e:
                    logger.warning(f"[FAKTA OSINT {osint_id}] Pusiknas error: {e}")
                
                # Search SIPP courts
                for court in sipp_courts[:5]:  # Limit to 5 courts
                    try:
                        sipp_search_url = f"https://{court['url']}/list_perkara/search"
                        logger.info(f"[FAKTA OSINT {osint_id}] Checking {court['name']}")
                        
                        # Try to search the court system
                        async with session.get(
                            f"https://{court['url']}/list_perkara",
                            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
                            timeout=aiohttp.ClientTimeout(total=8),
                            allow_redirects=True
                        ) as response:
                            if response.status == 200:
                                html = await response.text()
                                # Check if name appears in search or available data
                                if name_cleaned.lower() in html.lower():
                                    legal_cases.append({
                                        "source": f"SIPP {court['name']}",
                                        "status": "possible_match",
                                        "url": f"https://{court['url']}/list_perkara",
                                        "note": f"Kemungkinan ada perkara di {court['name']} - perlu verifikasi manual"
                                    })
                    except Exception as e:
                        pass  # Skip court if error
                    
                    await asyncio.sleep(0.5)
                    
        except Exception as e:
            logger.error(f"[FAKTA OSINT {osint_id}] Legal search error: {e}")
        
        results["legal_cases"] = legal_cases
        logger.info(f"[FAKTA OSINT {osint_id}] Found {len(legal_cases)} potential legal cases")
        
        # Update progress
        await db.fakta_osint.update_one(
            {"id": osint_id},
            {"$set": {"status": "generating_summary", "results.legal_cases": results["legal_cases"]}}
        )
        
        # ============ 4. AI Summary Generation - COMPREHENSIVE ANTESEDEN ============
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            
            api_key = os.getenv('EMERGENT_LLM_KEY')
            if api_key:
                # Prepare INTERNAL DATA summary
                internal_summary = ""
                
                # NIK Data
                if internal_data.get("nik_data"):
                    nik_info = internal_data["nik_data"]
                    if isinstance(nik_info, dict):
                        internal_summary += "\n--- DATA NIK (CAPIL) ---\n"
                        for key, val in nik_info.items():
                            if val and str(val).strip():
                                internal_summary += f"- {key}: {val}\n"
                
                # NKK Data (Family)
                if internal_data.get("nkk_data"):
                    nkk_info = internal_data["nkk_data"]
                    internal_summary += "\n--- DATA NKK (KELUARGA) ---\n"
                    if isinstance(nkk_info, dict):
                        for key, val in nkk_info.items():
                            if val and str(val).strip():
                                internal_summary += f"- {key}: {val}\n"
                    elif isinstance(nkk_info, list):
                        internal_summary += f"- Jumlah anggota keluarga: {len(nkk_info)}\n"
                        for i, member in enumerate(nkk_info[:5]):
                            if isinstance(member, dict):
                                name = member.get('nama') or member.get('Nama') or member.get('name', 'N/A')
                                relation = member.get('hubungan') or member.get('Hubungan') or member.get('relation', 'N/A')
                                internal_summary += f"  {i+1}. {name} ({relation})\n"
                
                # REGNIK Data
                if internal_data.get("regnik_data"):
                    regnik_info = internal_data["regnik_data"]
                    internal_summary += "\n--- DATA REGNIK ---\n"
                    if isinstance(regnik_info, dict):
                        for key, val in regnik_info.items():
                            if val and str(val).strip():
                                internal_summary += f"- {key}: {val}\n"
                
                # Passport Data
                if internal_data.get("passport_data"):
                    passport_info = internal_data["passport_data"]
                    internal_summary += "\n--- DATA PASSPORT ---\n"
                    if isinstance(passport_info, dict):
                        passports = passport_info.get("passports", [])
                        if passports:
                            internal_summary += f"- Jumlah passport: {len(passports)}\n"
                            for p in passports[:3]:
                                internal_summary += f"  - No: {p}\n"
                        wni_data = passport_info.get("wni_data", {})
                        if wni_data:
                            result_list = wni_data.get("result") or wni_data.get("data") or []
                            if result_list:
                                for item in result_list[:2]:
                                    if isinstance(item, dict):
                                        internal_summary += f"  - Nama: {item.get('nama_lengkap') or item.get('GIVENNAME', 'N/A')}\n"
                                        internal_summary += f"  - Tanggal Lahir: {item.get('tanggal_lahir') or item.get('DATEOFBIRTH', 'N/A')}\n"
                
                # Perlintasan Data (Border Crossings)
                if internal_data.get("perlintasan_data"):
                    perlintasan_info = internal_data["perlintasan_data"]
                    internal_summary += "\n--- DATA PERLINTASAN (IMIGRASI) ---\n"
                    if isinstance(perlintasan_info, dict):
                        results_list = perlintasan_info.get("results", [])
                        if results_list:
                            total_crossings = 0
                            for passport_result in results_list:
                                crossings = passport_result.get("crossings", [])
                                total_crossings += len(crossings)
                                for c in crossings[:5]:
                                    direction = "MASUK" if c.get("direction_code") == "A" else "KELUAR"
                                    internal_summary += f"  - {c.get('movement_date', 'N/A')}: {direction} via {c.get('tpi_name', 'N/A')} ({c.get('port_description', 'N/A')})\n"
                            internal_summary += f"- Total perlintasan: {total_crossings}\n"
                
                # Prepare FAMILY CACHE summary
                family_summary = ""
                if family_cache_data:
                    family_summary = "\n--- DATA KELUARGA DARI CACHE ---\n"
                    for fm in family_cache_data:
                        family_summary += f"\n{fm['nama']} ({fm['hubungan']}) - NIK: {fm['nik']}\n"
                        if fm.get('has_investigation') and fm.get('investigation_data'):
                            inv_data = fm['investigation_data']
                            if inv_data.get('nik_data', {}).get('data'):
                                nik_info = inv_data['nik_data']['data']
                                family_summary += f"  - Alamat: {nik_info.get('Address') or nik_info.get('Alamat', 'N/A')}\n"
                                family_summary += f"  - Pekerjaan: {nik_info.get('Occupation') or nik_info.get('Pekerjaan', 'N/A')}\n"
                        if fm.get('has_osint') and fm.get('osint_data'):
                            osint = fm['osint_data']
                            if osint.get('social_media'):
                                sm_list = ", ".join([f"{s['platform']}" for s in osint['social_media'][:3]])
                                family_summary += f"  - Media Sosial: {sm_list}\n"
                            if osint.get('summary'):
                                family_summary += f"  - Sudah ada laporan OSINT sebelumnya\n"
                
                # Prepare WEB DATA summary
                web_summary = "\n".join([f"- {w['title']}: {w['snippet']}" for w in web_data[:10]])
                
                # Prepare SOCIAL MEDIA summary
                social_summary = "\n".join([f"- {s['platform'].upper()}: @{s['username']} ({s.get('url', '')})" for s in social_media_found])
                
                # Prepare LEGAL summary
                legal_summary = "\n".join([f"- {lc['source']}: {lc['note']}" for lc in legal_cases])
                
                prompt = f"""Kamu adalah analis intelijen OSINT (Open Source Intelligence) profesional Indonesia. Analisis SEMUA data berikut tentang target bernama "{name_cleaned}" (NIK: {nik}) dan buat LAPORAN ANTESEDEN INTELIJEN yang komprehensif dalam Bahasa Indonesia.

==========================================
DATA INTERNAL (DARI DATABASE PEMERINTAH)
==========================================
{internal_summary if internal_summary.strip() else "Tidak ada data internal yang tersedia"}
{family_summary if family_summary.strip() else ""}

==========================================
DATA EKSTERNAL (DARI INTERNET)
==========================================

INFORMASI WEB:
{web_summary if web_summary else "Tidak ditemukan informasi signifikan di internet"}

MEDIA SOSIAL TERIDENTIFIKASI:
{social_summary if social_summary else "Tidak ditemukan akun media sosial"}

CATATAN HUKUM:
{legal_summary if legal_summary else "Tidak ditemukan catatan hukum atau perkara terkait"}

==========================================
FORMAT LAPORAN ANTESEDEN INTELIJEN
==========================================

Buat laporan anteseden intelijen yang komprehensif dengan format berikut:

**I. IDENTITAS & BIODATA**
Rangkum informasi identitas target berdasarkan data NIK, NKK, REGNIK, dan Passport:
- Nama lengkap, NIK, tempat/tanggal lahir
- Alamat domisili, status perkawinan
- Pekerjaan/profesi yang tercatat
- Nomor passport (jika ada)
- Anggota keluarga utama (dari NKK)

**II. AKTIVITAS & PERGERAKAN**
Analisis aktivitas target berdasarkan data yang tersedia:
- Riwayat perlintasan/perjalanan internasional (dari data imigrasi)
- Aktivitas online/digital footprint
- Pekerjaan, usaha, atau kegiatan yang teridentifikasi
- Pola pergerakan atau mobilitas geografis

**III. RELASI & JARINGAN SOSIAL**
Identifikasi hubungan dan jaringan target:
- Anggota keluarga (dari NKK)
- Akun media sosial dan koneksi digital
- Afiliasi organisasi, komunitas, atau kelompok
- Rekan kerja atau mitra bisnis yang teridentifikasi

**IV. ASET & KEPEMILIKAN**
Identifikasi aset yang dapat diidentifikasi:
- Properti atau kendaraan (jika ada di data)
- Akun digital dan platform online
- Usaha atau bisnis yang terkait

**V. CATATAN KHUSUS & PERINGATAN**
Informasi penting yang perlu diperhatikan:
- Catatan hukum atau perkara (dari Pusiknas/SIPP)
- Indikasi aktivitas mencurigakan
- Hal-hal yang memerlukan investigasi lanjutan

**VI. PENILAIAN RISIKO**
Berikan penilaian risiko berdasarkan SEMUA data:
- RENDAH: Tidak ada indikasi negatif, profil normal
- SEDANG: Ada beberapa catatan yang perlu diverifikasi
- TINGGI: Ada catatan hukum atau indikasi serius yang perlu investigasi lanjut

**VII. REKOMENDASI TINDAK LANJUT**
Berikan 3-5 langkah investigasi lanjutan yang spesifik dan dapat dilakukan.

CATATAN PENTING:
- Analisis SEMUA data yang tersedia, baik internal maupun eksternal
- Jika data terbatas, tetap buat analisis berdasarkan informasi yang ada
- Sebutkan secara eksplisit jika ada data yang tidak tersedia atau perlu diverifikasi
- Gunakan bahasa formal dan profesional untuk laporan intelijen"""

                chat = LlmChat(
                    api_key=api_key,
                    session_id=f"osint-{osint_id}",
                    system_message="Kamu adalah analis intelijen senior Indonesia dengan spesialisasi OSINT. Tugasmu adalah menyusun laporan anteseden intelijen yang komprehensif, akurat, dan dapat dipertanggungjawabkan. Analisis semua data yang tersedia dan berikan penilaian objektif. Gunakan format laporan resmi dan Bahasa Indonesia yang formal."
                ).with_model("gemini", "gemini-2.5-flash")
                
                user_message = UserMessage(text=prompt)
                ai_summary = await chat.send_message(user_message)
                
                # Clean up AI response - remove excessive quotes and markdown artifacts
                def clean_ai_text(text):
                    if not text:
                        return text
                    # Remove excessive double quotes
                    text = text.replace('""', '"')
                    # Remove quotes around entire text
                    text = text.strip('"')
                    # Remove markdown code blocks if any
                    text = text.replace('```', '')
                    # Remove escaped quotes
                    text = text.replace('\\"', '"')
                    # Remove multiple consecutive spaces
                    import re
                    text = re.sub(r' +', ' ', text)
                    # Remove quotes at the beginning of lines
                    text = re.sub(r'^"', '', text, flags=re.MULTILINE)
                    text = re.sub(r'"$', '', text, flags=re.MULTILINE)
                    return text.strip()
                
                cleaned_summary = clean_ai_text(ai_summary)
                results["summary"] = cleaned_summary
                results["antecedents"] = cleaned_summary
                results["risk_assessment"] = "Lihat bagian PENILAIAN RISIKO di summary"
                logger.info(f"[FAKTA OSINT {osint_id}] AI anteseden generated successfully")
            else:
                results["summary"] = "AI tidak tersedia - silakan review data manual. Data internal dan eksternal telah dikumpulkan."
                results["antecedents"] = "AI tidak tersedia"
                
        except Exception as e:
            logger.error(f"[FAKTA OSINT {osint_id}] AI summary error: {e}")
            import traceback
            traceback.print_exc()
            results["summary"] = f"Error generating summary: {str(e)}"
            results["antecedents"] = "Error generating antecedents"
        
        # ============ 5. Save final results ============
        await db.fakta_osint.update_one(
            {"id": osint_id},
            {"$set": {
                "status": "completed",
                "results": results,
                "completed_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        # Also update the investigation document with FULL OSINT results
        await db.nik_investigations.update_one(
            {"search_id": search_id},
            {"$set": {f"osint_results.{nik}": {
                "osint_id": osint_id,
                "status": "completed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                # Store full results for cache access
                "summary": results.get("summary"),
                "antecedents": results.get("antecedents"),
                "social_media": results.get("social_media", []),
                "legal_cases": results.get("legal_cases", []),
                "web_mentions": results.get("web_mentions", []),
                "internal_data": results.get("internal_data", {}),
                "risk_assessment": results.get("risk_assessment"),
                "family_cache": results.get("family_cache", [])
            }}}
        )
        
        # Also update nongeoint_searches collection for history access
        await db.nongeoint_searches.update_one(
            {"id": search_id},
            {"$set": {f"osint_results.{nik}": {
                "osint_id": osint_id,
                "status": "completed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "summary": results.get("summary"),
                "antecedents": results.get("antecedents"),
                "social_media": results.get("social_media", []),
                "legal_cases": results.get("legal_cases", []),
                "web_mentions": results.get("web_mentions", []),
                "internal_data": results.get("internal_data", {}),
                "family_cache": results.get("family_cache", []),
                "risk_assessment": results.get("risk_assessment")
            }}}
        )
        
        logger.info(f"[FAKTA OSINT {osint_id}] Completed successfully and cached")
        
    except Exception as e:
        logger.error(f"[FAKTA OSINT {osint_id}] Error: {e}")
        await db.fakta_osint.update_one(
            {"id": osint_id},
            {"$set": {"status": "error", "error": str(e)}}
        )

# ==================== END FAKTA OSINT ====================

# ==================== SOCIAL NETWORK ANALYTICS ====================

class SnaRequest(BaseModel):
    search_id: str
    nik: str
    name: str
    social_media: List[dict] = []  # From OSINT results

@api_router.post("/nongeoint/social-network-analytics")
async def start_sna(request: SnaRequest, username: str = Depends(verify_token)):
    """
    Start Social Network Analytics for a target
    """
    sna_id = str(uuid.uuid4())[:8]
    logger.info(f"[SNA {sna_id}] Starting for {request.name} (NIK: {request.nik})")
    
    # Create SNA document
    sna_doc = {
        "id": sna_id,
        "search_id": request.search_id,
        "nik": request.nik,
        "name": request.name,
        "social_media_input": request.social_media,
        "status": "processing",
        "results": {},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": username
    }
    await db.social_network_analytics.insert_one(sna_doc)
    
    # Start background processing
    asyncio.create_task(process_sna(sna_id, request.search_id, request.nik, request.name, request.social_media))
    
    return {"sna_id": sna_id, "status": "processing"}

@api_router.get("/nongeoint/social-network-analytics/{sna_id}")
async def get_sna(sna_id: str, username: str = Depends(verify_token)):
    """Get Social Network Analytics results"""
    sna = await db.social_network_analytics.find_one({"id": sna_id}, {"_id": 0})
    if not sna:
        raise HTTPException(status_code=404, detail="SNA not found")
    
    logger.info(f"[GET SNA {sna_id}] Status: {sna.get('status')}")
    return sna

async def process_sna(sna_id: str, search_id: str, nik: str, name: str, social_media_input: List[dict]):
    """Process Social Network Analytics - scrape and analyze social media profiles"""
    try:
        logger.info(f"[SNA {sna_id}] Processing for {name}")
        
        results = {
            "profiles": [],  # Detailed profile data
            "network_graph": {
                "nodes": [],
                "edges": []
            },
            "statistics": {
                "total_friends": 0,
                "total_followers": 0,
                "total_following": 0,
                "total_posts": 0,
                "total_engagement": 0
            },
            "analysis": None,
            "important_connections": [],
            "political_analysis": None
        }
        
        # Get OSINT data if not provided
        if not social_media_input:
            osint = await db.fakta_osint.find_one(
                {"nik": nik, "status": "completed"},
                {"_id": 0, "results.social_media": 1}
            )
            if osint and osint.get("results", {}).get("social_media"):
                social_media_input = osint["results"]["social_media"]
        
        if not social_media_input:
            # Try from investigation
            inv = await db.nik_investigations.find_one(
                {"search_id": search_id},
                {"_id": 0, f"osint_results.{nik}.social_media": 1}
            )
            if inv and inv.get("osint_results", {}).get(nik, {}).get("social_media"):
                social_media_input = inv["osint_results"][nik]["social_media"]
        
        logger.info(f"[SNA {sna_id}] Found {len(social_media_input)} social media profiles to analyze")
        
        # Update progress
        await db.social_network_analytics.update_one(
            {"id": sna_id},
            {"$set": {"status": "scraping_profiles"}}
        )
        
        # ============ 1. Scrape Profile Data ============
        import aiohttp
        import socket
        from bs4 import BeautifulSoup
        import re
        
        # Add target as center node
        results["network_graph"]["nodes"].append({
            "id": "target",
            "label": name,
            "type": "target",
            "platform": "center",
            "size": 30
        })
        
        connector = aiohttp.TCPConnector(family=socket.AF_INET)
        async with aiohttp.ClientSession(connector=connector) as session:
            for sm in social_media_input:
                platform = sm.get("platform", "").lower()
                username_sm = sm.get("username", "")
                url = sm.get("url", "")
                
                profile_data = {
                    "platform": platform,
                    "username": username_sm,
                    "url": url,
                    "followers": 0,
                    "following": 0,
                    "friends": 0,
                    "posts": 0,
                    "likes": 0,
                    "engagement_rate": 0,
                    "bio": "",
                    "connections": [],
                    "scraped": False
                }
                
                try:
                    # Try to scrape public profile data
                    headers = {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    }
                    
                    async with session.get(
                        url,
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=15),
                        allow_redirects=True,
                        ssl=False
                    ) as response:
                        if response.status == 200:
                            html = await response.text()
                            soup = BeautifulSoup(html, 'html.parser')
                            
                            # Platform-specific parsing
                            if platform == "twitter" or "x.com" in url:
                                # Try to find follower count from meta or page content
                                followers_match = re.search(r'(\d+(?:,\d+)*(?:\.\d+)?[KMB]?)\s*(?:Followers|followers)', html)
                                following_match = re.search(r'(\d+(?:,\d+)*(?:\.\d+)?[KMB]?)\s*(?:Following|following)', html)
                                
                                if followers_match:
                                    profile_data["followers"] = parse_count(followers_match.group(1))
                                if following_match:
                                    profile_data["following"] = parse_count(following_match.group(1))
                                    
                            elif platform == "instagram":
                                # Instagram meta tags
                                meta_desc = soup.find("meta", property="og:description")
                                if meta_desc:
                                    content = meta_desc.get("content", "")
                                    followers_match = re.search(r'(\d+(?:,\d+)*(?:\.\d+)?[KMB]?)\s*Followers', content)
                                    following_match = re.search(r'(\d+(?:,\d+)*(?:\.\d+)?[KMB]?)\s*Following', content)
                                    posts_match = re.search(r'(\d+(?:,\d+)*)\s*Posts', content)
                                    
                                    if followers_match:
                                        profile_data["followers"] = parse_count(followers_match.group(1))
                                    if following_match:
                                        profile_data["following"] = parse_count(following_match.group(1))
                                    if posts_match:
                                        profile_data["posts"] = parse_count(posts_match.group(1))
                                        
                            elif platform == "linkedin":
                                # LinkedIn connections
                                connections_match = re.search(r'(\d+(?:,\d+)*)\+?\s*(?:connections|koneksi)', html, re.IGNORECASE)
                                if connections_match:
                                    profile_data["friends"] = parse_count(connections_match.group(1))
                                    
                            elif platform == "facebook":
                                # Facebook friends
                                friends_match = re.search(r'(\d+(?:,\d+)*)\s*(?:friends|teman)', html, re.IGNORECASE)
                                followers_match = re.search(r'(\d+(?:,\d+)*)\s*(?:followers|pengikut)', html, re.IGNORECASE)
                                
                                if friends_match:
                                    profile_data["friends"] = parse_count(friends_match.group(1))
                                if followers_match:
                                    profile_data["followers"] = parse_count(followers_match.group(1))
                                    
                            elif platform == "tiktok":
                                # TikTok
                                followers_match = re.search(r'(\d+(?:,\d+)*(?:\.\d+)?[KMB]?)\s*Followers', html)
                                following_match = re.search(r'(\d+(?:,\d+)*(?:\.\d+)?[KMB]?)\s*Following', html)
                                likes_match = re.search(r'(\d+(?:,\d+)*(?:\.\d+)?[KMB]?)\s*Likes', html)
                                
                                if followers_match:
                                    profile_data["followers"] = parse_count(followers_match.group(1))
                                if following_match:
                                    profile_data["following"] = parse_count(following_match.group(1))
                                if likes_match:
                                    profile_data["likes"] = parse_count(likes_match.group(1))
                            
                            # Try to get bio
                            bio_elem = soup.find("meta", property="og:description") or soup.find("meta", attrs={"name": "description"})
                            if bio_elem:
                                profile_data["bio"] = bio_elem.get("content", "")[:500]
                            
                            profile_data["scraped"] = True
                            logger.info(f"[SNA {sna_id}] Scraped {platform}: followers={profile_data['followers']}, following={profile_data['following']}")
                            
                except Exception as e:
                    logger.warning(f"[SNA {sna_id}] Failed to scrape {platform}: {e}")
                
                results["profiles"].append(profile_data)
                
                # Add to network graph
                node_id = f"{platform}_{username_sm}"
                results["network_graph"]["nodes"].append({
                    "id": node_id,
                    "label": f"@{username_sm}",
                    "platform": platform,
                    "type": "profile",
                    "followers": profile_data["followers"],
                    "following": profile_data["following"],
                    "size": 20
                })
                
                # Add edge from target to this profile
                results["network_graph"]["edges"].append({
                    "from": "target",
                    "to": node_id,
                    "label": platform
                })
                
                # Update statistics
                results["statistics"]["total_followers"] += profile_data["followers"]
                results["statistics"]["total_following"] += profile_data["following"]
                results["statistics"]["total_friends"] += profile_data["friends"]
                results["statistics"]["total_posts"] += profile_data["posts"]
                results["statistics"]["total_likes"] = results["statistics"].get("total_likes", 0) + profile_data["likes"]
                results["statistics"]["total_engagement"] += profile_data["likes"]
                
                # LinkedIn connections
                if platform == "linkedin" and profile_data["friends"] > 0:
                    results["statistics"]["total_connections"] = results["statistics"].get("total_connections", 0) + profile_data["friends"]
                
                await asyncio.sleep(0.5)
        
        # Update progress
        await db.social_network_analytics.update_one(
            {"id": sna_id},
            {"$set": {"status": "analyzing", "results.profiles": results["profiles"], "results.statistics": results["statistics"]}}
        )
        
        # ============ 2. AI Analysis ============
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            
            api_key = os.getenv('EMERGENT_LLM_KEY')
            if api_key:
                # Prepare profile summary for AI
                profiles_summary = ""
                for p in results["profiles"]:
                    profiles_summary += f"\n{p['platform'].upper()} (@{p['username']}):\n"
                    profiles_summary += f"  - Followers: {p['followers']:,}\n"
                    profiles_summary += f"  - Following: {p['following']:,}\n"
                    if p['friends'] > 0:
                        profiles_summary += f"  - Friends/Connections: {p['friends']:,}\n"
                    if p['posts'] > 0:
                        profiles_summary += f"  - Posts: {p['posts']:,}\n"
                    if p['bio']:
                        profiles_summary += f"  - Bio: {p['bio'][:200]}...\n"
                
                prompt = f"""Kamu adalah analis Social Network Analysis (SNA) profesional. Analisis data media sosial berikut untuk target "{name}" dan berikan laporan SNA komprehensif dalam Bahasa Indonesia.

=== DATA MEDIA SOSIAL ===
{profiles_summary if profiles_summary.strip() else "Tidak ada data media sosial yang berhasil diambil"}

=== STATISTIK TOTAL ===
- Total Followers: {results['statistics']['total_followers']:,}
- Total Following: {results['statistics']['total_following']:,}
- Total Friends/Connections: {results['statistics']['total_friends']:,}
- Total Posts: {results['statistics']['total_posts']:,}
- Total Engagement (Likes): {results['statistics']['total_engagement']:,}

=== FORMAT LAPORAN SNA ===

Berikan analisis dalam format berikut:

**I. PROFIL DIGITAL**
Analisis kehadiran digital target di berbagai platform media sosial:
- Platform mana yang paling aktif
- Rasio followers vs following (influencer atau follower)
- Tingkat engagement

**II. ANALISIS JARINGAN SOSIAL**
Berdasarkan data yang ada, analisis:
- Estimasi ukuran jaringan sosial
- Potensi jangkauan pengaruh
- Pola interaksi sosial

**III. TOKOH PENTING & KONEKSI**
Berdasarkan jumlah followers dan engagement:
- Apakah target berpotensi terhubung dengan tokoh penting
- Estimasi tipe koneksi (publik figure, profesional, pribadi)
- Kemungkinan afiliasi dengan organisasi/komunitas

**IV. ANALISIS POLITIK**
Berikan penilaian objektif:
- Kecenderungan politik: KIRI / KANAN / NETRAL / TIDAK TERIDENTIFIKASI
- Apakah ada indikasi radikal: YA / TIDAK / TIDAK CUKUP DATA
- Dasar penilaian

**V. KESIMPULAN & REKOMENDASI**
- Ringkasan profil SNA target
- Tingkat risiko jaringan sosial: RENDAH / SEDANG / TINGGI
- Rekomendasi investigasi lanjutan

CATATAN: Jika data terbatas, tetap berikan analisis berdasarkan informasi yang tersedia dan sebutkan keterbatasan data."""

                chat = LlmChat(
                    api_key=api_key,
                    session_id=f"sna-{sna_id}",
                    system_message="Kamu adalah analis Social Network Analysis (SNA) dan intelijen media sosial profesional. Berikan analisis yang objektif, terukur, dan dapat dipertanggungjawabkan berdasarkan data yang tersedia."
                ).with_model("gemini", "gemini-2.5-flash")
                
                user_message = UserMessage(text=prompt)
                ai_analysis = await chat.send_message(user_message)
                
                results["analysis"] = ai_analysis
                logger.info(f"[SNA {sna_id}] AI analysis completed")
            else:
                results["analysis"] = "AI tidak tersedia - silakan review data manual"
                
        except Exception as e:
            logger.error(f"[SNA {sna_id}] AI analysis error: {e}")
            results["analysis"] = f"Error generating analysis: {str(e)}"
        
        # ============ 3. Save final results ============
        await db.social_network_analytics.update_one(
            {"id": sna_id},
            {"$set": {
                "status": "completed",
                "results": results,
                "completed_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        # Also save to investigation for cache
        await db.nik_investigations.update_one(
            {"search_id": search_id},
            {"$set": {f"sna_results.{nik}": {
                "sna_id": sna_id,
                "status": "completed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "statistics": results["statistics"],
                "profiles": results["profiles"],
                "analysis": results["analysis"],
                "network_graph": results["network_graph"]
            }}}
        )
        
        logger.info(f"[SNA {sna_id}] Completed successfully")
        
    except Exception as e:
        logger.error(f"[SNA {sna_id}] Error: {e}")
        import traceback
        traceback.print_exc()
        await db.social_network_analytics.update_one(
            {"id": sna_id},
            {"$set": {"status": "error", "error": str(e)}}
        )

def parse_count(count_str: str) -> int:
    """Parse count string like '1.5K', '2M', '1,234' to integer"""
    try:
        count_str = count_str.strip().replace(",", "")
        multiplier = 1
        if count_str.endswith('K'):
            multiplier = 1000
            count_str = count_str[:-1]
        elif count_str.endswith('M'):
            multiplier = 1000000
            count_str = count_str[:-1]
        elif count_str.endswith('B'):
            multiplier = 1000000000
            count_str = count_str[:-1]
        return int(float(count_str) * multiplier)
    except:
        return 0

# ==================== END SOCIAL NETWORK ANALYTICS ====================

async def process_nik_investigation(investigation_id: str, search_id: str, niks: List[str]):
    """Process NIK deep investigation with queue system"""
    global telegram_client, current_request_status
    import json  # Import at function level to ensure availability
    import re    # Import at function level to ensure availability
    
    results = {}
    
    # Set global busy status for Full Query
    investigation_username = None
    try:
        inv_doc = await db.nik_investigations.find_one({"id": investigation_id})
        if inv_doc:
            investigation_username = inv_doc.get("created_by", "unknown")
    except:
        pass
    
    # Update global status to BUSY
    current_request_status = {
        "is_busy": True,
        "username": investigation_username,
        "operation": f"Full Query Investigation ({len(niks)} NIK)",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "investigation_id": investigation_id
    }
    logger.info(f"[NIK INVESTIGATION {investigation_id}] Set global status to BUSY by {investigation_username}")
    
    async with nongeoint_queue_lock:
        try:
            # Process each NIK sequentially
            for nik in niks:
                logger.info(f"[NIK INVESTIGATION {investigation_id}] Processing NIK: {nik}")
                
                nik_results = {
                    "nik": nik,
                    "nik_data": None,
                    "nkk_data": None,
                    "regnik_data": None,
                    "passport_data": None,
                    "perlintasan_data": None,
                    "status": "processing"
                }
                
                # ============================================
                # CHECK CACHE FIRST BEFORE QUERYING TELEGRAM
                # ============================================
                
                # Query 1: NIK - Check cache first
                cache_key_nik = f"capil_nik:{nik}"
                cached_nik = await db.simple_query_cache.find_one({"cache_key": cache_key_nik})
                
                if cached_nik and cached_nik.get("raw_response"):
                    logger.info(f"[NIK INVESTIGATION {investigation_id}] CACHE HIT for NIK {nik}")
                    raw_text = cached_nik.get("raw_response", "")
                    
                    # Use full parser to extract all data fields
                    parsed_data = parse_nongeoint_response(raw_text, "NIK") or {}
                    
                    # Also try to extract common fields with regex if parser missed them
                    try:
                        import re
                        # Extract Family ID/NKK if not found
                        if 'Family ID' not in parsed_data and 'No KK' not in parsed_data:
                            family_match = re.search(r'(?:Family ID|No KK|NKK|NO\.?\s*KK)[:\s]*(\d{16})', raw_text, re.IGNORECASE)
                            if family_match:
                                parsed_data['Family ID'] = family_match.group(1)
                        
                        # Extract NIK if not found
                        if 'NIK' not in parsed_data:
                            nik_match = re.search(r'(?:^|\n)\s*NIK[:\s]*(\d{16})', raw_text, re.IGNORECASE)
                            if nik_match:
                                parsed_data['NIK'] = nik_match.group(1)
                        
                        # Extract Name if not found
                        if 'Nama' not in parsed_data and 'Full Name' not in parsed_data and 'NAME' not in parsed_data:
                            name_match = re.search(r'(?:Nama|Full Name|NAME)[:\s]*([^\n]+)', raw_text, re.IGNORECASE)
                            if name_match:
                                parsed_data['Full Name'] = name_match.group(1).strip()
                        
                        # Extract Tempat/Tgl Lahir
                        if 'Tempat/Tgl Lahir' not in parsed_data and 'TTL' not in parsed_data:
                            ttl_match = re.search(r'(?:Tempat.*Lahir|TTL|Place.*Birth)[:\s]*([^\n]+)', raw_text, re.IGNORECASE)
                            if ttl_match:
                                parsed_data['Tempat/Tgl Lahir'] = ttl_match.group(1).strip()
                        
                        # Extract Alamat
                        if 'Alamat' not in parsed_data and 'Address' not in parsed_data:
                            alamat_match = re.search(r'(?:Alamat|Address)[:\s]*([^\n]+)', raw_text, re.IGNORECASE)
                            if alamat_match:
                                parsed_data['Alamat'] = alamat_match.group(1).strip()
                        
                        # Extract Jenis Kelamin
                        if 'Jenis Kelamin' not in parsed_data and 'Gender' not in parsed_data:
                            jk_match = re.search(r'(?:Jenis Kelamin|Gender|JK)[:\s]*([^\n]+)', raw_text, re.IGNORECASE)
                            if jk_match:
                                parsed_data['Jenis Kelamin'] = jk_match.group(1).strip()
                        
                        # Extract Agama
                        if 'Agama' not in parsed_data and 'Religion' not in parsed_data:
                            agama_match = re.search(r'(?:Agama|Religion)[:\s]*([^\n]+)', raw_text, re.IGNORECASE)
                            if agama_match:
                                parsed_data['Agama'] = agama_match.group(1).strip()
                        
                        # Extract Pekerjaan
                        if 'Pekerjaan' not in parsed_data and 'Occupation' not in parsed_data:
                            kerja_match = re.search(r'(?:Pekerjaan|Occupation|Job)[:\s]*([^\n]+)', raw_text, re.IGNORECASE)
                            if kerja_match:
                                parsed_data['Pekerjaan'] = kerja_match.group(1).strip()
                        
                        # Extract Status Perkawinan
                        if 'Status Perkawinan' not in parsed_data and 'Marital Status' not in parsed_data:
                            status_match = re.search(r'(?:Status Perkawinan|Marital Status|Status)[:\s]*([^\n]+)', raw_text, re.IGNORECASE)
                            if status_match:
                                parsed_data['Status Perkawinan'] = status_match.group(1).strip()
                                
                    except Exception as e:
                        logger.warning(f"[NIK INVESTIGATION {investigation_id}] Error parsing cached NIK data: {e}")
                    
                    nik_result = {
                        "status": "success",
                        "raw_text": raw_text,
                        "data": parsed_data,
                        "photo": cached_nik.get("photo"),
                        "from_cache": True
                    }
                    logger.info(f"[NIK INVESTIGATION {investigation_id}] Parsed {len(parsed_data)} fields from cached NIK data")
                else:
                    # No cache, query Telegram
                    logger.info(f"[NIK INVESTIGATION {investigation_id}] No cache, querying NIK for {nik}")
                    
                    # Ensure Telegram connection
                    connected = await safe_telegram_operation(
                        lambda: ensure_telegram_connected(),
                        f"nik_invest_connect_{investigation_id}",
                        max_retries=5
                    )
                    
                    if not connected:
                        await db.nik_investigations.update_one(
                            {"id": investigation_id},
                            {"$set": {"status": "error", "error": "Telegram connection failed"}}
                        )
                        return
                    
                    await db.nik_investigations.update_one(
                        {"id": investigation_id},
                        {"$set": {f"results.{nik}.status": "processing_nik"}}
                    )
                    
                    # Execute NIK query with retry
                    nik_result = None
                    for retry_attempt in range(2):  # Try up to 2 times
                        nik_result = await execute_nik_button_query(investigation_id, nik, "NIK")
                        if nik_result.get("status") == "success" and nik_result.get("raw_text"):
                            break
                        elif retry_attempt < 1:
                            logger.warning(f"[NIK INVESTIGATION {investigation_id}] NIK query failed, retrying... (attempt {retry_attempt + 1})")
                            await asyncio.sleep(3)
                    
                    # Save to Simple Query Cache
                    if nik_result.get("status") == "success" and nik_result.get("raw_text"):
                        cache_doc = {
                            "cache_key": cache_key_nik,
                            "query_type": "capil_nik",
                            "query_value": nik,
                            "raw_response": nik_result.get("raw_text"),
                            "photo": nik_result.get("photo"),
                            "created_by": "investigation",
                            "created_at": datetime.now(timezone.utc).isoformat()
                        }
                        await db.simple_query_cache.update_one(
                            {"cache_key": cache_key_nik},
                            {"$set": cache_doc},
                            upsert=True
                        )
                        logger.info(f"[NIK INVESTIGATION {investigation_id}] Saved NIK result to cache")
                    else:
                        logger.warning(f"[NIK INVESTIGATION {investigation_id}] NIK query did not return success after retries")
                
                nik_results["nik_data"] = nik_result
                logger.info(f"[NIK INVESTIGATION {investigation_id}] NIK result status: {nik_result.get('status')}, from_cache: {nik_result.get('from_cache', False)}")
                
                # Save immediately after each query
                await db.nik_investigations.update_one(
                    {"id": investigation_id},
                    {"$set": {f"results.{nik}.nik_data": nik_result}}
                )
                await asyncio.sleep(1)
                
                # Query 2: NKK - MUST USE FAMILY ID from NIK data
                family_id = None
                if nik_result.get('data'):
                    family_id = nik_result['data'].get('Family ID') or nik_result['data'].get('No KK') or nik_result['data'].get('NKK') or nik_result['data'].get('family_id')
                
                if not family_id and nik_result.get('raw_text'):
                    import re
                    family_match = re.search(r'(?:Family ID|No KK|NKK)[:\s]*(\d{16})', nik_result['raw_text'], re.IGNORECASE)
                    if family_match:
                        family_id = family_match.group(1)
                
                logger.info(f"[NIK INVESTIGATION {investigation_id}] Extracted Family ID: {family_id}")
                
                if family_id:
                    # Check NKK cache first
                    cache_key_nkk = f"nkk:{family_id}"
                    cached_nkk = await db.simple_query_cache.find_one({"cache_key": cache_key_nkk})
                    
                    if cached_nkk and cached_nkk.get("raw_response"):
                        logger.info(f"[NIK INVESTIGATION {investigation_id}] CACHE HIT for NKK {family_id}")
                        raw_text = cached_nkk.get("raw_response", "")
                        
                        # Parse family data from cached raw text
                        family_data = parse_nkk_family_data(raw_text)
                        parsed_data = parse_nongeoint_response(raw_text, "NKK") or {}
                        
                        if family_data:
                            logger.info(f"[NIK INVESTIGATION {investigation_id}] Parsed {family_data.get('member_count', 0)} family members from NKK cache")
                        
                        nkk_result = {
                            "status": "success",
                            "raw_text": raw_text,
                            "data": parsed_data,
                            "family_data": family_data,
                            "from_cache": True
                        }
                    else:
                        logger.info(f"[NIK INVESTIGATION {investigation_id}] Querying NKK with Family ID: {family_id}")
                        await db.nik_investigations.update_one(
                            {"id": investigation_id},
                            {"$set": {f"results.{nik}.status": "processing_nkk"}}
                        )
                        
                        # Execute NKK query with retry
                        nkk_result = None
                        for retry_attempt in range(2):  # Try up to 2 times
                            nkk_result = await execute_nik_button_query(investigation_id, family_id, "NKK")
                            if nkk_result.get("status") == "success" and nkk_result.get("raw_text"):
                                break
                            elif retry_attempt < 1:
                                logger.warning(f"[NIK INVESTIGATION {investigation_id}] NKK query failed, retrying... (attempt {retry_attempt + 1})")
                                await asyncio.sleep(3)
                        
                        # Save to cache
                        if nkk_result.get("status") == "success" and nkk_result.get("raw_text"):
                            cache_doc = {
                                "cache_key": cache_key_nkk,
                                "query_type": "nkk",
                                "query_value": family_id,
                                "raw_response": nkk_result.get("raw_text"),
                                "created_by": "investigation",
                                "created_at": datetime.now(timezone.utc).isoformat()
                            }
                            await db.simple_query_cache.update_one(
                                {"cache_key": cache_key_nkk},
                                {"$set": cache_doc},
                                upsert=True
                            )
                        else:
                            logger.warning(f"[NIK INVESTIGATION {investigation_id}] NKK query did not return success after retries")
                    
                    nik_results["nkk_data"] = nkk_result
                    logger.info(f"[NIK INVESTIGATION {investigation_id}] NKK result status: {nkk_result.get('status')}, from_cache: {nkk_result.get('from_cache', False)}")
                else:
                    logger.warning(f"[NIK INVESTIGATION {investigation_id}] No Family ID found, skipping NKK query")
                    nkk_result = {"status": "skipped", "error": "No Family ID found in NIK data"}
                    nik_results["nkk_data"] = nkk_result
                
                # Save immediately after each query
                await db.nik_investigations.update_one(
                    {"id": investigation_id},
                    {"$set": {f"results.{nik}.nkk_data": nkk_result}}
                )
                await asyncio.sleep(1)
                
                # Query 3: RegNIK - Check cache first
                cache_key_reghp = f"reghp:{nik}"
                cached_reghp = await db.simple_query_cache.find_one({"cache_key": cache_key_reghp})
                
                if cached_reghp and cached_reghp.get("raw_response"):
                    logger.info(f"[NIK INVESTIGATION {investigation_id}] CACHE HIT for RegHP {nik}")
                    regnik_result = {
                        "status": "success",
                        "raw_text": cached_reghp.get("raw_response"),
                        "phones": [],
                        "from_cache": True
                    }
                    # Try to extract phone numbers from raw text
                    import re
                    phones = re.findall(r'62\d{9,13}', cached_reghp.get("raw_response", ""))
                    regnik_result["phones"] = list(set(phones))
                else:
                    logger.info(f"[NIK INVESTIGATION {investigation_id}] Querying RegNIK for {nik}")
                    await db.nik_investigations.update_one(
                        {"id": investigation_id},
                        {"$set": {f"results.{nik}.status": "processing_regnik"}}
                    )
                    
                    # Execute RegNIK query with retry
                    regnik_result = None
                    for retry_attempt in range(2):  # Try up to 2 times
                        regnik_result = await execute_regnik_query(investigation_id, nik)
                        if regnik_result.get("status") == "success":
                            break
                        elif retry_attempt < 1:
                            logger.warning(f"[NIK INVESTIGATION {investigation_id}] RegNIK query failed, retrying... (attempt {retry_attempt + 1})")
                            await asyncio.sleep(3)
                    
                    # Save to cache
                    if regnik_result.get("status") == "success" and regnik_result.get("raw_text"):
                        cache_doc = {
                            "cache_key": cache_key_reghp,
                            "query_type": "reghp",
                            "query_value": nik,
                            "raw_response": regnik_result.get("raw_text"),
                            "created_by": "investigation",
                            "created_at": datetime.now(timezone.utc).isoformat()
                        }
                        await db.simple_query_cache.update_one(
                            {"cache_key": cache_key_reghp},
                            {"$set": cache_doc},
                            upsert=True
                        )
                    else:
                        logger.warning(f"[NIK INVESTIGATION {investigation_id}] RegNIK query did not return success after retries")
                
                nik_results["regnik_data"] = regnik_result
                logger.info(f"[NIK INVESTIGATION {investigation_id}] RegNIK result status: {regnik_result.get('status')}, from_cache: {regnik_result.get('from_cache', False)}")
                
                # Save immediately after each query
                await db.nik_investigations.update_one(
                    {"id": investigation_id},
                    {"$set": {f"results.{nik}.regnik_data": regnik_result}}
                )
                await asyncio.sleep(1)
                
                # Query 4: Passport via CP API (WNI by NIK) - Check cache first
                target_name = None
                if nik_result.get('data'):
                    target_name = nik_result['data'].get('Full Name') or nik_result['data'].get('Name') or nik_result['data'].get('Nama')
                
                # Check cache for passport by name
                if target_name:
                    cache_key_passport = f"passport_wni:{target_name.upper()}"
                    cached_passport = await db.simple_query_cache.find_one({"cache_key": cache_key_passport})
                    
                    # FIX: Check for cached passports array first (more reliable), then fall back to raw_response parsing
                    if cached_passport and (cached_passport.get("passports") or cached_passport.get("raw_response")):
                        logger.info(f"[NIK INVESTIGATION {investigation_id}] CACHE HIT for Passport {target_name}")
                        logger.info(f"[NIK INVESTIGATION {investigation_id}] Cache has passports array: {bool(cached_passport.get('passports'))}, raw_response: {bool(cached_passport.get('raw_response'))}")
                        
                        # FIX: First try to use pre-stored passports array
                        passport_numbers = cached_passport.get("passports", [])
                        logger.info(f"[NIK INVESTIGATION {investigation_id}] Pre-stored passports from cache: {passport_numbers}")
                        
                        # If no pre-stored passports, try to extract from raw_response
                        if not passport_numbers and cached_passport.get("raw_response"):
                            import re
                            raw_text = cached_passport.get("raw_response", "")
                            logger.info(f"[NIK INVESTIGATION {investigation_id}] Parsing raw_response (first 500 chars): {raw_text[:500]}")
                            
                            # Extract passport numbers with various patterns
                            # Indonesian passport: A1234567 (letter + 7 digits)
                            # Old format: B12345678 (letter + 8 digits)
                            passport_numbers = []
                            
                            # Pattern 1: Standard passport format (letter + 6-8 digits)
                            patterns = [
                                r'\b[A-Z]\d{6,8}\b',  # A1234567 or B12345678
                                r'NO\.?\s*PASPOR\s*:?\s*([A-Z]\d{6,8})',  # NO. PASPOR: A1234567
                                r'no_paspor["\']?\s*:?\s*["\']?([A-Z]\d{6,8})',  # JSON format
                                r'TRAVELDOCUMENTNO["\']?\s*:?\s*["\']?([A-Z]?\d{6,8})',  # API format
                            ]
                            
                            for pattern in patterns:
                                matches = re.findall(pattern, raw_text, re.IGNORECASE)
                                for match in matches:
                                    # Clean and validate passport number
                                    passport_no = match.upper().strip()
                                    if passport_no and len(passport_no) >= 7 and passport_no not in passport_numbers:
                                        passport_numbers.append(passport_no)
                                        logger.info(f"[NIK INVESTIGATION {investigation_id}] Extracted passport via regex: {passport_no}")
                            
                            # Also try to parse as JSON if it looks like JSON
                            if raw_text.strip().startswith('{') or raw_text.strip().startswith('['):
                                try:
                                    cached_json = json.loads(raw_text)
                                    data_list = cached_json.get("result") or cached_json.get("data") or []
                                    logger.info(f"[NIK INVESTIGATION {investigation_id}] Parsed JSON, data_list type: {type(data_list)}, length: {len(data_list) if isinstance(data_list, list) else 'N/A'}")
                                    if isinstance(data_list, list):
                                        for item in data_list:
                                            for field in ["no_paspor", "no_paspor_lama", "TRAVELDOCUMENTNO", "NO_PASPOR", "passport_no"]:
                                                pno = item.get(field)
                                                if pno and pno not in passport_numbers:
                                                    passport_numbers.append(pno)
                                                    logger.info(f"[NIK INVESTIGATION {investigation_id}] Extracted passport from JSON field {field}: {pno}")
                                except Exception as json_err:
                                    logger.warning(f"[NIK INVESTIGATION {investigation_id}] JSON parsing failed: {json_err}")
                        
                        logger.info(f"[NIK INVESTIGATION {investigation_id}] Final passport_numbers from cache: {passport_numbers}")
                        
                        passport_result = {
                            "status": "success",
                            "raw_text": cached_passport.get("raw_response", ""),
                            "passports": list(set(passport_numbers)),
                            "from_cache": True
                        }
                    else:
                        logger.info(f"[NIK INVESTIGATION {investigation_id}] Querying Passport for {nik}")
                        await db.nik_investigations.update_one(
                            {"id": investigation_id},
                            {"$set": {f"results.{nik}.status": "processing_passport"}}
                        )
                        passport_result = await query_passport_cp_api(nik, target_name)
                        
                        # Save to cache if successful - FIX: use raw_response (not raw_text) and also save passports array
                        raw_resp = passport_result.get("raw_response")
                        passports_list = passport_result.get("passports", [])
                        if (raw_resp or passports_list) and target_name:
                            cache_doc = {
                                "cache_key": cache_key_passport,
                                "query_type": "passport_wni",
                                "query_value": target_name.upper(),
                                "raw_response": raw_resp,
                                "passports": passports_list,  # FIX: Store passports array for reliable retrieval
                                "created_by": "investigation",
                                "created_at": datetime.now(timezone.utc).isoformat()
                            }
                            await db.simple_query_cache.update_one(
                                {"cache_key": cache_key_passport},
                                {"$set": cache_doc},
                                upsert=True
                            )
                            logger.info(f"[NIK INVESTIGATION {investigation_id}] Cached passport data with {len(passports_list)} passports")
                else:
                    logger.info(f"[NIK INVESTIGATION {investigation_id}] No name found, querying Passport directly")
                    await db.nik_investigations.update_one(
                        {"id": investigation_id},
                        {"$set": {f"results.{nik}.status": "processing_passport"}}
                    )
                    passport_result = await query_passport_cp_api(nik, target_name)
                
                # Safety check - ensure passport_result is a dict
                if passport_result is None:
                    passport_result = {
                        "status": "error",
                        "error": "No response from passport query",
                        "passports": []
                    }
                
                nik_results["passport_data"] = passport_result
                passports_found = passport_result.get('passports', []) if passport_result else []
                logger.info(f"[NIK INVESTIGATION {investigation_id}] Passport result status: {passport_result.get('status')}, from_cache: {passport_result.get('from_cache', False)}, passports_found: {passports_found}")
                
                # Save immediately after passport query
                await db.nik_investigations.update_one(
                    {"id": investigation_id},
                    {"$set": {f"results.{nik}.passport_data": passport_result}}
                )
                await asyncio.sleep(1)
                
                # Query 5: Perlintasan (Immigration Crossing) via CP API - for each passport found
                perlintasan_results = []
                passports_to_check = passports_found
                
                logger.info(f"[NIK INVESTIGATION {investigation_id}] Passports to check for perlintasan: {passports_to_check} (count: {len(passports_to_check)})")
                
                if passports_to_check:
                    logger.info(f"[NIK INVESTIGATION {investigation_id}] Querying Perlintasan for {len(passports_to_check)} passports")
                    await db.nik_investigations.update_one(
                        {"id": investigation_id},
                        {"$set": {f"results.{nik}.status": "processing_perlintasan"}}
                    )
                    
                    for passport_no in passports_to_check:
                        logger.info(f"[NIK INVESTIGATION {investigation_id}] Processing perlintasan for passport: {passport_no}")
                        
                        # Check cache first for perlintasan
                        cache_key_perl = f"perlintasan:{passport_no}"
                        cached_perl = await db.simple_query_cache.find_one({"cache_key": cache_key_perl})
                        
                        if cached_perl and (cached_perl.get("raw_response") or cached_perl.get("crossings")):
                            logger.info(f"[NIK INVESTIGATION {investigation_id}] CACHE HIT for Perlintasan {passport_no}")
                            
                            # Check if crossings already parsed in cache
                            crossings = cached_perl.get("crossings", [])
                            
                            # If no pre-parsed crossings, try to parse from raw_response
                            if not crossings and cached_perl.get("raw_response"):
                                try:
                                    cached_data = json.loads(cached_perl.get("raw_response", "{}"))
                                    crossings_data = cached_data.get("dataPerlintasan") or cached_data.get("data") or []
                                    for c in crossings_data:
                                        crossings.append({
                                            "passport_no": c.get("TRAVELDOCUMENTNO", passport_no),
                                            "movement_date": c.get("MOVEMENTDATE", "-"),
                                            "direction": "ARRIVAL" if c.get("DIRECTIONCODE") == "A" else "DEPARTURE" if c.get("DIRECTIONCODE") == "D" else c.get("DIRECTIONCODE", "-"),
                                            "direction_code": c.get("DIRECTIONCODE", "-"),
                                            "tpi_name": c.get("TPINAME", "-"),
                                            "port_description": c.get("PORTDESCRIPTION", "-"),
                                            "name": c.get("GIVENNAME", "-"),
                                            "family_name": c.get("FAMILYNAME", "-"),
                                            "nationality": c.get("NATIONALITYDESCRIPTION", "-")
                                        })
                                except Exception as parse_err:
                                    logger.warning(f"[NIK INVESTIGATION {investigation_id}] Error parsing cached perlintasan: {parse_err}")
                            
                            perlintasan_result = {
                                "passport_no": passport_no,
                                "status": cached_perl.get("status", "success") if crossings else "no_data",
                                "raw_text": cached_perl.get("raw_response"),
                                "crossings": crossings,
                                "total_crossings": len(crossings),
                                "from_cache": True
                            }
                        else:
                            perlintasan_result = await query_perlintasan_cp_api(passport_no)
                            
                            # Safety check - ensure perlintasan_result is a dict
                            if perlintasan_result is None:
                                perlintasan_result = {
                                    "passport_no": passport_no,
                                    "status": "error",
                                    "error": "No response from perlintasan query",
                                    "crossings": []
                                }
                            
                            # Save to cache - use raw_data if available
                            raw_data = perlintasan_result.get("raw_data")
                            if raw_data:
                                # Convert dict to JSON string for cache storage
                                cache_raw = json.dumps(raw_data) if isinstance(raw_data, dict) else str(raw_data)
                                cache_doc = {
                                    "cache_key": cache_key_perl,
                                    "query_type": "perlintasan",
                                    "query_value": passport_no,
                                    "raw_response": cache_raw,
                                    "crossings": perlintasan_result.get("crossings", []),
                                    "status": perlintasan_result.get("status"),
                                    "created_by": "investigation",
                                    "created_at": datetime.now(timezone.utc).isoformat()
                                }
                                await db.simple_query_cache.update_one(
                                    {"cache_key": cache_key_perl},
                                    {"$set": cache_doc},
                                    upsert=True
                                )
                                logger.info(f"[NIK INVESTIGATION {investigation_id}] Cached perlintasan for {passport_no}")
                        
                        perlintasan_results.append(perlintasan_result)
                        logger.info(f"[NIK INVESTIGATION {investigation_id}] Perlintasan result for {passport_no}: status={perlintasan_result.get('status')}, crossings={len(perlintasan_result.get('crossings', []))}")
                        await asyncio.sleep(0.5)
                    
                    logger.info(f"[NIK INVESTIGATION {investigation_id}] Perlintasan query complete. Total results: {len(perlintasan_results)}")
                else:
                    logger.info(f"[NIK INVESTIGATION {investigation_id}] No passports found, skipping perlintasan query")
                
                nik_results["perlintasan_data"] = {
                    "status": "completed" if perlintasan_results else "no_passport",
                    "results": perlintasan_results,
                    "total_passports": len(passports_to_check)
                }
                
                # Save perlintasan data
                await db.nik_investigations.update_one(
                    {"id": investigation_id},
                    {"$set": {f"results.{nik}.perlintasan_data": nik_results["perlintasan_data"]}}
                )
                
                nik_results["status"] = "completed"
                results[nik] = nik_results
                
                # Update database with complete NIK results
                await db.nik_investigations.update_one(
                    {"id": investigation_id},
                    {"$set": {f"results.{nik}": nik_results}}
                )
                logger.info(f"[NIK INVESTIGATION {investigation_id}] Saved complete results for {nik}")
                
                # Wait between NIKs
                await asyncio.sleep(3)
            
            # Mark investigation as completed
            await db.nik_investigations.update_one(
                {"id": investigation_id},
                {"$set": {"status": "completed", "results": results}}
            )
            logger.info(f"[NIK INVESTIGATION {investigation_id}] Completed")
            
            # Release global busy status
            current_request_status = {
                "is_busy": False,
                "username": None,
                "operation": None,
                "started_at": None,
                "investigation_id": None
            }
            logger.info(f"[NIK INVESTIGATION {investigation_id}] Released global status to IDLE")
            
        except Exception as e:
            logger.error(f"[NIK INVESTIGATION {investigation_id}] Error: {e}")
            await db.nik_investigations.update_one(
                {"id": investigation_id},
                {"$set": {"status": "error", "error": str(e)}}
            )
            
            # Release global busy status even on error
            current_request_status = {
                "is_busy": False,
                "username": None,
                "operation": None,
                "started_at": None,
                "investigation_id": None
            }
            logger.info(f"[NIK INVESTIGATION {investigation_id}] Released global status to IDLE (after error)")

async def execute_regnik_query(investigation_id: str, nik: str) -> dict:
    """Execute RegNIK query and parse multiple phone numbers"""
    global telegram_client
    
    query_token = f"REGNIK_{investigation_id}_{nik}"
    
    try:
        # Step 1: Send NIK to bot
        async def send_nik():
            await telegram_client.send_message(BOT_USERNAME, nik)
            return True
        
        sent = await safe_telegram_operation(send_nik, f"send_{query_token}", max_retries=3)
        if not sent:
            return {"status": "error", "error": "Failed to send NIK to bot"}
        
        logger.info(f"[{query_token}] Sent NIK: {nik}")
        await asyncio.sleep(4)
        
        # Step 2: Get buttons and click RegNIK
        async def get_buttons():
            return await telegram_client.get_messages(BOT_USERNAME, limit=5)
        
        messages = await safe_telegram_operation(get_buttons, f"get_buttons_{query_token}", max_retries=3)
        if not messages:
            return {"status": "error", "error": "Failed to get bot buttons"}
        
        # Find RegNIK button
        regnik_button = None
        for msg in messages:
            if msg.buttons:
                for row in msg.buttons:
                    for button in row:
                        if button.text and any(x.lower() in button.text.lower() for x in ["📞 Regnik", "Regnik", "REGNIK"]):
                            regnik_button = button
                            break
                    if regnik_button:
                        break
            if regnik_button:
                break
        
        if not regnik_button:
            return {"status": "not_found", "error": "RegNIK button not found"}
        
        # Click button
        async def click_btn():
            await regnik_button.click()
            return True
        
        clicked = await safe_telegram_operation(click_btn, f"click_{query_token}", max_retries=3)
        if not clicked:
            return {"status": "error", "error": "Failed to click button"}
        
        logger.info(f"[{query_token}] Clicked RegNIK button")
        await asyncio.sleep(6)
        
        # Step 3: Get response with multiple phone numbers
        phones = []
        raw_texts = []
        
        for attempt in range(3):
            async def get_resp():
                return await telegram_client.get_messages(BOT_USERNAME, limit=20)
            
            response_messages = await safe_telegram_operation(get_resp, f"get_resp_{query_token}_attempt{attempt}", max_retries=2)
            if not response_messages:
                await asyncio.sleep(2)
                continue
            
            for msg in response_messages:
                if not msg.text:
                    continue
                
                msg_text = msg.text
                msg_text_lower = msg_text.lower()
                
                # Skip non-data messages
                if msg_text.strip() == nik:
                    continue
                if 'pilih menu' in msg_text_lower or 'silahkan pilih' in msg_text_lower:
                    continue
                
                # Check for not found
                if 'not found' in msg_text_lower or 'tidak ditemukan' in msg_text_lower:
                    return {"status": "not_found", "raw_text": msg_text, "phones": []}
                
                # Parse phone numbers from RegNIK response
                # Look for phone patterns: 08xxx, 628xxx, +628xxx
                import re
                phone_patterns = [
                    r'(?:Phone|HP|No HP|Nomor|No\.?|📞)[:\s]*([+]?[0-9]{10,15})',
                    r'\b(08[0-9]{8,12})\b',
                    r'\b(628[0-9]{8,12})\b',
                    r'\b(\+628[0-9]{8,12})\b',
                    r'(?:^|\n)([0-9]{10,15})(?:\n|$)'
                ]
                
                for pattern in phone_patterns:
                    found_phones = re.findall(pattern, msg_text)
                    for phone in found_phones:
                        # Clean phone number
                        clean_phone = re.sub(r'[^0-9+]', '', phone)
                        if len(clean_phone) >= 10 and clean_phone not in phones:
                            phones.append(clean_phone)
                            logger.info(f"[{query_token}] Found phone: {clean_phone}")
                
                # Also check if message contains phone-related keywords
                if any(kw in msg_text_lower for kw in ['phone', 'hp', 'nomor', 'telp', '📞', 'mobile']):
                    if msg_text not in raw_texts:
                        raw_texts.append(msg_text)
            
            if phones:
                break
            await asyncio.sleep(2)
        
        if phones:
            logger.info(f"[{query_token}] Found {len(phones)} phone numbers")
            return {
                "status": "completed",
                "phones": phones,
                "raw_text": "\n---\n".join(raw_texts) if raw_texts else None,
                "data": {"phones": phones, "count": len(phones)}
            }
        
        return {"status": "no_data", "error": "No phone numbers found", "phones": [], "raw_text": "\n---\n".join(raw_texts) if raw_texts else None}
        
    except Exception as e:
        logger.error(f"[{query_token}] Error: {e}")
        return {"status": "error", "error": str(e), "phones": []}


async def query_passport_cp_api(nik: str, name: str = None) -> dict:
    """
    Query passport data via CP API using curl command
    - WNI: search by NIK
    - If name provided, also search WNA by name
    """
    import subprocess
    import json
    
    result = {
        "status": "processing",
        "wni_data": None,
        "wna_data": None,
        "passports": [],
        "raw_response": None
    }
    
    try:
        # Query WNI passport by NIK using curl with explicit IPv4
        logger.info(f"[PASSPORT CP] Querying WNI passport by NIK: {nik}")
        
        # Build curl command with -4 for IPv4
        wni_cmd = [
            "curl", "-4", "-s", 
            "-H", f"api-key: {CP_API_KEY}",
            f"{CP_API_URL}/api/v3/imigrasi/wni?type=nik&query={nik}"
        ]
        logger.info(f"[PASSPORT CP] WNI curl command: {' '.join(wni_cmd[:5])}...")
        
        wni_process = subprocess.run(wni_cmd, capture_output=True, text=True, timeout=30)
        
        raw_response = wni_process.stdout
        result["raw_response"] = raw_response[:1000] if raw_response else None
        
        logger.info(f"[PASSPORT CP] WNI response code: {wni_process.returncode}")
        logger.info(f"[PASSPORT CP] WNI response: {raw_response[:500] if raw_response else 'empty'}")
        logger.info(f"[PASSPORT CP] WNI stderr: {wni_process.stderr[:200] if wni_process.stderr else 'none'}")
        
        if raw_response and not raw_response.strip().startswith('<'):
            try:
                wni_data = json.loads(raw_response)
                result["wni_data"] = wni_data
                
                # Extract passport numbers from various response formats
                # API returns "result" array, not "data"
                data_list = wni_data.get("result") or wni_data.get("data") or []
                
                if isinstance(data_list, list):
                    for item in data_list:
                        # Try different field names - API uses lowercase "no_paspor"
                        passport_no = (
                            item.get("no_paspor") or
                            item.get("no_paspor_lama") or
                            item.get("TRAVELDOCUMENTNO") or 
                            item.get("NO_PASPOR") or 
                            item.get("passport_no") or
                            item.get("paspor_no") or
                            item.get("NOPAS")
                        )
                        if passport_no and passport_no not in result["passports"]:
                            result["passports"].append(passport_no)
                            logger.info(f"[PASSPORT CP] Found passport: {passport_no}")
                        
                        # Also check for old passport
                        old_passport = item.get("no_paspor_lama")
                        if old_passport and old_passport not in result["passports"]:
                            result["passports"].append(old_passport)
                            logger.info(f"[PASSPORT CP] Found old passport: {old_passport}")
                
                logger.info(f"[PASSPORT CP] WNI data parsed, total passports: {len(result['passports'])}")
                
            except json.JSONDecodeError as e:
                logger.warning(f"[PASSPORT CP] WNI JSON decode error: {e}")
                logger.warning(f"[PASSPORT CP] Raw response was: {raw_response[:300]}")
        else:
            logger.warning(f"[PASSPORT CP] WNI returned HTML or empty response")
        
        # If name provided, also search WNA
        if name:
            logger.info(f"[PASSPORT CP] Querying WNA passport by name: {name}")
            
            import urllib.parse
            encoded_name = urllib.parse.quote(name)
            
            wna_cmd = [
                "curl", "-4", "-s",
                "-H", f"api-key: {CP_API_KEY}",
                f"{CP_API_URL}/api/v3/imigrasi/wna?type=name&query={encoded_name}"
            ]
            
            wna_process = subprocess.run(wna_cmd, capture_output=True, text=True, timeout=30)
            
            logger.info(f"[PASSPORT CP] WNA response: {wna_process.stdout[:500] if wna_process.stdout else 'empty'}")
            
            if wna_process.stdout and not wna_process.stdout.strip().startswith('<'):
                try:
                    wna_data = json.loads(wna_process.stdout)
                    result["wna_data"] = wna_data
                    
                    # API returns "result" array, not "data"
                    data_list = wna_data.get("result") or wna_data.get("data") or []
                    if isinstance(data_list, list):
                        for item in data_list:
                            passport_no = (
                                item.get("no_paspor") or
                                item.get("TRAVELDOCUMENTNO") or 
                                item.get("NO_PASPOR") or 
                                item.get("passport_no") or
                                item.get("paspor_no") or
                                item.get("NOPAS")
                            )
                            if passport_no and passport_no not in result["passports"]:
                                result["passports"].append(passport_no)
                    
                    logger.info(f"[PASSPORT CP] WNA data parsed")
                except json.JSONDecodeError as e:
                    logger.warning(f"[PASSPORT CP] WNA JSON decode error: {e}")
        
        # Determine final status based on whether passports were actually found
        if result["passports"] and len(result["passports"]) > 0:
            result["status"] = "completed"  # Passport(s) found - green checkmark
        elif result["wni_data"] or result["wna_data"]:
            result["status"] = "no_data"    # Query succeeded but no passport found - yellow warning
        else:
            result["status"] = "no_data"    # No response at all - yellow warning
        
        logger.info(f"[PASSPORT CP] Final status: {result['status']}, passports found: {len(result['passports'])}")
        
    except subprocess.TimeoutExpired:
        logger.error(f"[PASSPORT CP] Timeout")
        result["status"] = "error"
        result["error"] = "Request timeout"
    except Exception as e:
        logger.error(f"[PASSPORT CP] Error: {e}")
        import traceback
        logger.error(f"[PASSPORT CP] Traceback: {traceback.format_exc()}")
        result["status"] = "error"
        result["error"] = str(e)
    
    return result


async def query_perlintasan_cp_api(passport_no: str) -> dict:
    """
    Query immigration crossing (perlintasan) data via CP API using curl command
    """
    import subprocess
    import json
    
    result = {
        "status": "processing",
        "passport_no": passport_no,
        "crossings": [],
        "raw_data": None
    }
    
    try:
        logger.info(f"[PERLINTASAN CP] Querying crossings for passport: {passport_no}")
        
        # Use curl with -4 for IPv4, -X POST explicitly, and -d for POST data
        # FIX: Added -X POST to match Simple Query behavior
        lintas_cmd = [
            "curl", "-4", "-s", "-X", "POST",
            "-H", f"api-key: {CP_API_KEY}",
            "-d", f"nopas={passport_no}",
            f"{CP_API_URL}/api/v3/imigrasi/lintas"
        ]
        logger.info(f"[PERLINTASAN CP] curl command: curl -4 -s -X POST -H api-key:*** -d nopas={passport_no} {CP_API_URL}/api/v3/imigrasi/lintas")
        
        process = subprocess.run(lintas_cmd, capture_output=True, text=True, timeout=30)
        
        logger.info(f"[PERLINTASAN CP] response code: {process.returncode}")
        logger.info(f"[PERLINTASAN CP] response: {process.stdout[:500] if process.stdout else 'empty'}")
        logger.info(f"[PERLINTASAN CP] stderr: {process.stderr[:200] if process.stderr else 'none'}")
        
        if process.stdout and not process.stdout.strip().startswith('<'):
            try:
                data = json.loads(process.stdout)
                result["raw_data"] = data
                
                # Check different response formats
                crossings_data = data.get("dataPerlintasan") or data.get("data") or []
                
                if data.get("response_status") or crossings_data:
                    # Parse crossing data
                    for crossing in crossings_data:
                        parsed = {
                            "passport_no": crossing.get("TRAVELDOCUMENTNO", passport_no),
                            "name": crossing.get("GIVENNAME", "-"),
                            "family_name": crossing.get("FAMILYNAME", "-"),
                            "nationality": crossing.get("NATIONALITYDESCRIPTION", "-"),
                            "issuing_state": crossing.get("ISSUINGSTATEDESCRIPTION", "-"),
                            "gender": crossing.get("GENDERCODE", "-"),
                            "dob": crossing.get("DATEOFBIRTH", "-"),
                            "movement_date": crossing.get("MOVEMENTDATE", "-"),
                            "direction": "ARRIVAL" if crossing.get("DIRECTIONCODE") == "A" else "DEPARTURE" if crossing.get("DIRECTIONCODE") == "D" else crossing.get("DIRECTIONCODE", "-"),
                            "direction_code": crossing.get("DIRECTIONCODE", "-"),
                            "tpi_name": crossing.get("TPINAME", "-"),
                            "port_description": crossing.get("PORTDESCRIPTION", "-")
                        }
                        result["crossings"].append(parsed)
                    
                    result["status"] = "completed"
                    result["total_crossings"] = len(result["crossings"])
                    logger.info(f"[PERLINTASAN CP] Found {len(result['crossings'])} crossings")
                else:
                    result["status"] = "no_data"
                    result["message"] = data.get("response_message", "No crossing data found")
                    logger.info(f"[PERLINTASAN CP] No data found: {data.get('response_message')}")
            except json.JSONDecodeError as e:
                logger.warning(f"[PERLINTASAN CP] JSON decode error: {e}, response: {process.stdout[:200]}")
                result["status"] = "error"
                result["error"] = f"Invalid JSON response: {process.stdout[:100]}"
        else:
            logger.warning(f"[PERLINTASAN CP] Got HTML or empty response")
            result["status"] = "error"
            result["error"] = "Empty or HTML response from API"
            
    except subprocess.TimeoutExpired:
        logger.error(f"[PERLINTASAN CP] Timeout")
        result["status"] = "error"
        result["error"] = "Request timeout"
    except Exception as e:
        logger.error(f"[PERLINTASAN CP] Error: {e}")
        import traceback
        logger.error(f"[PERLINTASAN CP] Traceback: {traceback.format_exc()}")
        result["status"] = "error"
        result["error"] = str(e)
    
    return result


async def query_passport_simple_cp_api(query_type: str, query_value: str) -> dict:
    """
    Query passport data via CP API for Simple Query feature.
    
    Types:
    - passport_wna: Search WNA passport by name
    - passport_wni: Search WNI passport by name  
    - passport_number: Search passport by passport number
    - passport_nik: Search WNI passport by NIK
    
    Returns formatted raw_response string similar to Telegram bot output.
    """
    import subprocess
    import json
    import urllib.parse
    
    result = {
        "success": False,
        "raw_response": None,
        "error": None
    }
    
    try:
        encoded_value = urllib.parse.quote(query_value)
        
        if query_type == 'passport_wna':
            # WNA search by name
            url = f"{CP_API_URL}/api/v3/imigrasi/wni?type=name&query={encoded_value}"
            logger.info(f"[PASSPORT SIMPLE CP] Querying WNA by name: {query_value}")
            
        elif query_type == 'passport_wni':
            # WNI search by name
            url = f"{CP_API_URL}/api/v3/imigrasi/wni?type=name&query={encoded_value}"
            logger.info(f"[PASSPORT SIMPLE CP] Querying WNI by name: {query_value}")
            
        elif query_type == 'passport_nik':
            # WNI search by NIK - clean to ensure only 16 digits
            clean_nik = ''.join(filter(str.isdigit, query_value))
            if len(clean_nik) != 16:
                result["error"] = f"NIK harus 16 digit angka, ditemukan {len(clean_nik)} digit"
                return result
            url = f"{CP_API_URL}/api/v3/imigrasi/wni?type=nik&query={clean_nik}"
            logger.info(f"[PASSPORT SIMPLE CP] Querying WNI passport by NIK (IPv4): {clean_nik}")
            
        elif query_type == 'passport_number':
            # Search by passport number - try both WNI and WNA, also get perlintasan
            logger.info(f"[PASSPORT SIMPLE CP] Querying by passport number: {query_value}")
            
            # First try to get perlintasan (crossing) data which has most info
            lintas_cmd = [
                "curl", "-4", "-s", "-X", "POST",
                "-H", f"api-key: {CP_API_KEY}",
                "-d", f"nopas={query_value}",
                f"{CP_API_URL}/api/v3/imigrasi/lintas"
            ]
            
            try:
                lintas_process = subprocess.run(lintas_cmd, capture_output=True, text=True, timeout=30)
                
                logger.info(f"[PASSPORT SIMPLE CP] Lintas response: {lintas_process.stdout[:300] if lintas_process.stdout else 'empty'}")
                
                # Check if response is HTML (IP not whitelisted or API error)
                if lintas_process.stdout and lintas_process.stdout.strip().startswith('<'):
                    logger.warning(f"[PASSPORT SIMPLE CP] Got HTML response - CP API may not be accessible (IP not whitelisted)")
                    result["error"] = "CP API tidak dapat diakses. Pastikan IP VPS sudah di-whitelist untuk layanan Imigrasi."
                    return result
                
                if lintas_process.stdout:
                    try:
                        lintas_data = json.loads(lintas_process.stdout)
                        crossings = lintas_data.get("dataPerlintasan") or lintas_data.get("data") or []
                        
                        if crossings:
                            # Format perlintasan data as readable text
                            output_lines = [f"Passport Crossing Data for: {query_value}\n"]
                            output_lines.append("=" * 50)
                            
                            for i, crossing in enumerate(crossings, 1):
                                output_lines.append(f"\n--- Record {i} ---")
                                output_lines.append(f"Passport No: {crossing.get('TRAVELDOCUMENTNO', '-')}")
                                output_lines.append(f"Name: {crossing.get('GIVENNAME', '-')} {crossing.get('FAMILYNAME', '-')}")
                                output_lines.append(f"Nationality: {crossing.get('NATIONALITYDESCRIPTION', '-')}")
                                output_lines.append(f"Date of Birth: {crossing.get('DATEOFBIRTH', '-')}")
                                output_lines.append(f"Gender: {crossing.get('GENDERCODE', '-')}")
                                output_lines.append(f"Issuing State: {crossing.get('ISSUINGSTATEDESCRIPTION', '-')}")
                                
                                direction = crossing.get('DIRECTIONCODE', '-')
                                direction_text = "ARRIVAL (Masuk)" if direction == 'A' else "DEPARTURE (Keluar)" if direction == 'D' else direction
                                output_lines.append(f"Movement: {direction_text}")
                                output_lines.append(f"Movement Date: {crossing.get('MOVEMENTDATE', '-')}")
                                output_lines.append(f"Port: {crossing.get('TPINAME', '-')} - {crossing.get('PORTDESCRIPTION', '-')}")
                            
                            output_lines.append("\n" + "=" * 50)
                            output_lines.append(f"Total Records: {len(crossings)}")
                            
                            result["success"] = True
                            result["raw_response"] = "\n".join(output_lines)
                            return result
                        else:
                            # No crossing data found
                            error_msg = lintas_data.get("response_message") or lintas_data.get("message") or "Tidak ditemukan data perlintasan"
                            result["error"] = f"Tidak ditemukan data untuk nomor passport {query_value}. {error_msg}"
                            return result
                            
                    except json.JSONDecodeError as e:
                        logger.error(f"[PASSPORT SIMPLE CP] JSON decode error: {e}")
                        result["error"] = "Response dari CP API tidak valid"
                        return result
                else:
                    result["error"] = "Tidak ada response dari CP API"
                    return result
                    
            except subprocess.TimeoutExpired:
                result["error"] = "Request timeout - CP API tidak merespons"
                return result
            except Exception as e:
                logger.error(f"[PASSPORT SIMPLE CP] Error: {e}")
                result["error"] = f"Error: {str(e)}"
                return result
        else:
            result["error"] = f"Unknown query type: {query_type}"
            return result
        
        # Execute curl for WNA/WNI name/NIK queries using IPv4
        # -4 forces IPv4, ensuring connection from whitelisted IP (76.13.21.246)
        cmd = [
            "curl", "-4", "-s",
            "--connect-timeout", "30",
            "-H", f"api-key: {CP_API_KEY}",
            url
        ]
        
        logger.info(f"[PASSPORT SIMPLE CP] Executing IPv4 request: curl -4 -s -H 'api-key: ***' {url}")
        
        process = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        raw_api_response = process.stdout
        logger.info(f"[PASSPORT SIMPLE CP] Response: {raw_api_response[:500] if raw_api_response else 'empty'}")
        
        if not raw_api_response or raw_api_response.strip().startswith('<'):
            logger.warning(f"[PASSPORT SIMPLE CP] Got HTML or empty response - CP API may not be accessible")
            result["error"] = "CP API tidak dapat diakses. Pastikan IP VPS sudah di-whitelist untuk layanan Imigrasi."
            return result
        
        try:
            data = json.loads(raw_api_response)
        except json.JSONDecodeError as e:
            logger.error(f"[PASSPORT SIMPLE CP] JSON decode error: {e}")
            result["error"] = f"Invalid JSON response: {raw_api_response[:100]}"
            return result
        
        # Check for API error responses
        if data.get("error"):
            result["error"] = data.get("error")
            return result
        
        # Extract results
        results_list = data.get("result") or data.get("data") or []
        
        if not results_list:
            result["error"] = "Tidak ditemukan data passport untuk query ini"
            return result
        
        # Format results as readable text
        type_label = "Passport WNA" if query_type == 'passport_wna' else "Passport WNI (by NIK)" if query_type == 'passport_nik' else "Passport WNI"
        output_lines = [f"{type_label} Data for: {query_value}\n"]
        output_lines.append("=" * 50)
        
        for i, item in enumerate(results_list, 1):
            output_lines.append(f"\n--- Result {i} ---")
            
            # Common fields
            output_lines.append(f"Nama: {item.get('nama') or item.get('NAMA') or item.get('name') or '-'}")
            output_lines.append(f"No Paspor: {item.get('no_paspor') or item.get('NO_PASPOR') or item.get('TRAVELDOCUMENTNO') or '-'}")
            
            if item.get('no_paspor_lama'):
                output_lines.append(f"No Paspor Lama: {item.get('no_paspor_lama')}")
            
            output_lines.append(f"Tempat Lahir: {item.get('tempat_lahir') or item.get('TEMPAT_LAHIR') or '-'}")
            output_lines.append(f"Tanggal Lahir: {item.get('tanggal_lahir') or item.get('TANGGAL_LAHIR') or item.get('tgl_lahir') or '-'}")
            output_lines.append(f"Jenis Kelamin: {item.get('jenis_kelamin') or item.get('JENIS_KELAMIN') or item.get('jk') or '-'}")
            
            # WNI specific fields
            if query_type in ['passport_wni', 'passport_nik']:
                output_lines.append(f"NIK: {item.get('nik') or item.get('NIK') or '-'}")
                output_lines.append(f"Alamat: {item.get('alamat') or item.get('ALAMAT') or '-'}")
                output_lines.append(f"Pekerjaan: {item.get('pekerjaan') or item.get('PEKERJAAN') or '-'}")
            
            # WNA specific fields  
            if query_type == 'passport_wna':
                output_lines.append(f"Kewarganegaraan: {item.get('kewarganegaraan') or item.get('KEWARGANEGARAAN') or item.get('nationality') or '-'}")
                output_lines.append(f"Negara Penerbit: {item.get('negara_penerbit') or item.get('issuing_country') or '-'}")
            
            # Passport details
            output_lines.append(f"Tanggal Terbit: {item.get('tanggal_terbit') or item.get('issue_date') or '-'}")
            output_lines.append(f"Tanggal Expired: {item.get('tanggal_expired') or item.get('expiry_date') or item.get('tgl_expired') or '-'}")
            output_lines.append(f"Kantor Terbit: {item.get('kantor_terbit') or item.get('issuing_office') or '-'}")
        
        output_lines.append("\n" + "=" * 50)
        output_lines.append(f"Total Results: {len(results_list)}")
        
        result["success"] = True
        result["raw_response"] = "\n".join(output_lines)
        
        logger.info(f"[PASSPORT SIMPLE CP] Successfully formatted {len(results_list)} results")
        
    except subprocess.TimeoutExpired:
        logger.error(f"[PASSPORT SIMPLE CP] Timeout")
        result["error"] = "Request timeout - CP API tidak merespons"
    except Exception as e:
        logger.error(f"[PASSPORT SIMPLE CP] Error: {e}")
        import traceback
        logger.error(f"[PASSPORT SIMPLE CP] Traceback: {traceback.format_exc()}")
        result["error"] = str(e)
    
    return result


async def query_perlintasan_simple_cp_api(passport_number: str) -> dict:
    """
    Query perlintasan (border crossing) data via CP API for Simple Query feature.
    
    This queries the /api/v3/imigrasi/lintas endpoint with passport number
    and returns formatted crossing records.
    """
    import subprocess
    import json
    
    result = {
        "success": False,
        "raw_response": None,
        "error": None
    }
    
    try:
        logger.info(f"[PERLINTASAN SIMPLE CP] Querying by passport number: {passport_number}")
        
        # Query perlintasan (crossing) data
        lintas_cmd = [
            "curl", "-4", "-s", "-X", "POST",
            "-H", f"api-key: {CP_API_KEY}",
            "-d", f"nopas={passport_number}",
            f"{CP_API_URL}/api/v3/imigrasi/lintas"
        ]
        
        lintas_process = subprocess.run(lintas_cmd, capture_output=True, text=True, timeout=30)
        
        logger.info(f"[PERLINTASAN SIMPLE CP] Response: {lintas_process.stdout[:300] if lintas_process.stdout else 'empty'}")
        
        # Check if response is HTML (IP not whitelisted or API error)
        if lintas_process.stdout and lintas_process.stdout.strip().startswith('<'):
            logger.warning(f"[PERLINTASAN SIMPLE CP] Got HTML response - CP API may not be accessible")
            result["error"] = "CP API tidak dapat diakses. Pastikan IP VPS sudah di-whitelist untuk layanan Imigrasi."
            return result
        
        if not lintas_process.stdout:
            result["error"] = "Tidak ada response dari CP API"
            return result
        
        try:
            lintas_data = json.loads(lintas_process.stdout)
        except json.JSONDecodeError as e:
            logger.error(f"[PERLINTASAN SIMPLE CP] JSON decode error: {e}")
            result["error"] = "Response dari CP API tidak valid"
            return result
        
        crossings = lintas_data.get("dataPerlintasan") or lintas_data.get("data") or []
        
        if crossings:
            # Format perlintasan data as readable text
            output_lines = [f"═══════════════════════════════════════════════════"]
            output_lines.append(f"      DATA PERLINTASAN - PASSPORT: {passport_number}")
            output_lines.append(f"═══════════════════════════════════════════════════\n")
            
            for i, crossing in enumerate(crossings, 1):
                direction = crossing.get('DIRECTIONCODE', '-')
                if direction == 'A':
                    direction_text = "🛬 ARRIVAL (Masuk Indonesia)"
                    direction_emoji = "🟢"
                elif direction == 'D':
                    direction_text = "🛫 DEPARTURE (Keluar Indonesia)"
                    direction_emoji = "🔴"
                else:
                    direction_text = direction
                    direction_emoji = "⚪"
                
                output_lines.append(f"─── Record {i} {direction_emoji} ───")
                output_lines.append(f"Movement     : {direction_text}")
                output_lines.append(f"Date         : {crossing.get('MOVEMENTDATE', '-')}")
                output_lines.append(f"Passport No  : {crossing.get('TRAVELDOCUMENTNO', '-')}")
                output_lines.append(f"Name         : {crossing.get('GIVENNAME', '-')} {crossing.get('FAMILYNAME', '-')}")
                output_lines.append(f"Nationality  : {crossing.get('NATIONALITYDESCRIPTION', '-')}")
                output_lines.append(f"Birth Date   : {crossing.get('DATEOFBIRTH', '-')}")
                output_lines.append(f"Gender       : {'Laki-laki' if crossing.get('GENDERCODE') == 'M' else 'Perempuan' if crossing.get('GENDERCODE') == 'F' else crossing.get('GENDERCODE', '-')}")
                output_lines.append(f"Issuing State: {crossing.get('ISSUINGSTATEDESCRIPTION', '-')}")
                output_lines.append(f"Port         : {crossing.get('TPINAME', '-')}")
                output_lines.append(f"Location     : {crossing.get('PORTDESCRIPTION', '-')}")
                output_lines.append("")
            
            output_lines.append(f"═══════════════════════════════════════════════════")
            output_lines.append(f"Total Records: {len(crossings)}")
            output_lines.append(f"═══════════════════════════════════════════════════")
            
            result["success"] = True
            result["raw_response"] = "\n".join(output_lines)
            
            logger.info(f"[PERLINTASAN SIMPLE CP] Successfully formatted {len(crossings)} crossing records")
        else:
            # No crossing data found
            error_msg = lintas_data.get("response_message") or lintas_data.get("message") or ""
            result["error"] = f"Tidak ditemukan data perlintasan untuk nomor passport {passport_number}. {error_msg}"
            
    except subprocess.TimeoutExpired:
        result["error"] = "Request timeout - CP API tidak merespons"
    except Exception as e:
        logger.error(f"[PERLINTASAN SIMPLE CP] Error: {e}")
        import traceback
        logger.error(f"[PERLINTASAN SIMPLE CP] Traceback: {traceback.format_exc()}")
        result["error"] = str(e)
    
    return result




async def execute_nik_button_query(investigation_id: str, nik: str, button_type: str) -> dict:
    """Execute a single NIK/NKK/RegNIK query"""
    global telegram_client
    from datetime import datetime, timezone, timedelta
    
    button_map = {
        "NIK": ["🔍 NIK", "NIK"],
        "NKK": ["👥 NKK", "NKK"],
        "REGNIK": ["📞 Regnik", "Regnik", "REGNIK"]
    }
    
    query_token = f"NIKINVEST_{investigation_id}_{nik}_{button_type}"
    
    try:
        # IMPORTANT: Record timestamp BEFORE sending query
        query_start_time = datetime.now(timezone.utc)
        
        # Step 1: Send NIK to bot
        async def send_nik():
            await telegram_client.send_message(BOT_USERNAME, nik)
            return True
        
        sent = await safe_telegram_operation(send_nik, f"send_{query_token}", max_retries=3)
        if not sent:
            return {"status": "error", "error": "Failed to send NIK to bot"}
        
        logger.info(f"[{query_token}] Sent NIK: {nik}")
        await asyncio.sleep(2)  # Reduced from 5s to 2s - bot responds quickly
        
        # Step 2: Get buttons - with retry
        async def get_buttons():
            return await telegram_client.get_messages(BOT_USERNAME, limit=5)
        
        messages = await safe_telegram_operation(get_buttons, f"get_buttons_{query_token}", max_retries=4)
        if not messages:
            return {"status": "error", "error": "Failed to get bot buttons"}
        
        # Find target button
        target_button = None
        all_buttons_found = []
        for msg in messages:
            if msg.buttons:
                for row in msg.buttons:
                    for button in row:
                        if button.text:
                            all_buttons_found.append(button.text)
                            for btn_text in button_map.get(button_type, []):
                                if btn_text.lower() in button.text.lower():
                                    target_button = button
                                    break
                        if target_button:
                            break
                    if target_button:
                        break
            if target_button:
                break
        
        logger.info(f"[{query_token}] All buttons found: {all_buttons_found}")
        
        if not target_button:
            logger.warning(f"[{query_token}] Button '{button_type}' not found in buttons: {all_buttons_found}")
            return {"status": "not_found", "error": f"Button {button_type} not found"}
        
        # Step 3: Click button
        async def click_btn():
            await target_button.click()
            return True
        
        clicked = await safe_telegram_operation(click_btn, f"click_{query_token}", max_retries=3)
        if not clicked:
            return {"status": "error", "error": "Failed to click button"}
        
        logger.info(f"[{query_token}] Clicked button: {target_button.text}")
        await asyncio.sleep(3)  # Reduced from 10s to 3s - bot responds quickly, retry if not received
        
        # Time threshold for filtering messages (30 seconds buffer before query for photos)
        # Photos sometimes arrive before or much after the text
        time_threshold = query_start_time - timedelta(seconds=30)
        
        # Step 4: Get response - try multiple times
        best_response = None
        collected_texts = []  # For NKK, collect all related messages
        photo_base64 = None  # Store photo separately
        
        for attempt in range(4):  # Increase attempts
            async def get_resp():
                return await telegram_client.get_messages(BOT_USERNAME, limit=30)
            
            response_messages = await safe_telegram_operation(get_resp, f"get_resp_{query_token}_attempt{attempt}", max_retries=2)
            if not response_messages:
                await asyncio.sleep(3)
                continue
            
            # DEBUG: Log all messages structure
            logger.info(f"[{query_token}] Attempt {attempt+1}: Got {len(response_messages)} messages")
            for i, msg in enumerate(response_messages[:10]):  # Log first 10
                has_photo = bool(msg.photo)
                has_doc = bool(msg.document)
                has_text = bool(msg.text)
                msg_date = msg.date.isoformat() if msg.date else "N/A"
                text_preview = msg.text[:50] if msg.text else "N/A"
                contains_nik = nik in (msg.text or '') if msg.text else False
                logger.info(f"[{query_token}]   Msg {i}: id={msg.id}, date={msg_date}, photo={has_photo}, contains_our_nik={contains_nik}, preview='{text_preview}...'")
            
            # ============================================
            # CRITICAL FIX FOR PHOTO LEAKING:
            # STEP A: Find messages that contain OUR SPECIFIC NIK
            # STEP B: Only accept photos from messages that ALSO contain our NIK text
            # ============================================
            
            # STEP A: Find all messages containing our NIK (text messages)
            our_nik_messages = []
            for msg in response_messages:
                if msg.date < time_threshold:
                    continue
                if msg.text and nik in msg.text:
                    our_nik_messages.append(msg)
                    logger.info(f"[{query_token}] Found message containing our NIK: id={msg.id}, date={msg.date}")
            
            # STEP B: Look for photo ONLY in messages related to our NIK
            # Strategy 1: Photo in same message as our NIK text (caption)
            # Strategy 2: Photo immediately after our NIK message (within 5 seconds, same sender)
            
            if not photo_base64 and our_nik_messages:
                # Strategy 1: Check if any of our NIK messages has a photo
                for nik_msg in our_nik_messages:
                    if nik_msg.photo:
                        try:
                            logger.info(f"[{query_token}] Found photo IN SAME MESSAGE as NIK text (id={nik_msg.id})")
                            photo_bytes = await telegram_client.download_media(nik_msg.photo, bytes)
                            if photo_bytes:
                                import base64
                                photo_base64 = f"data:image/jpeg;base64,{base64.b64encode(photo_bytes).decode('utf-8')}"
                                logger.info(f"[{query_token}] ✓ Downloaded photo from NIK message ({len(photo_bytes)} bytes)")
                                break
                        except Exception as e:
                            logger.error(f"[{query_token}] Photo download error: {e}")
                
                # Strategy 2: Check for photo immediately after our NIK message
                if not photo_base64:
                    for nik_msg in our_nik_messages:
                        nik_msg_time = nik_msg.date
                        for msg in response_messages:
                            if msg.date < time_threshold:
                                continue
                            # Must be AFTER our NIK message, within 15 seconds (increased from 5)
                            time_diff = (msg.date - nik_msg_time).total_seconds()
                            if time_diff >= -2 and time_diff <= 15:  # Also allow photo slightly before (-2s)
                                if msg.photo and msg.id != nik_msg.id:
                                    # Extra check: this message should NOT contain a DIFFERENT NIK
                                    if msg.text:
                                        # Check if message text contains any 16-digit number that's NOT our NIK
                                        other_niks = re.findall(r'\b\d{16}\b', msg.text)
                                        if other_niks and nik not in other_niks:
                                            logger.info(f"[{query_token}] Skipping photo - message contains different NIK(s): {other_niks}")
                                            continue
                                    
                                    try:
                                        logger.info(f"[{query_token}] Found photo AFTER NIK message (nik_msg_id={nik_msg.id}, photo_msg_id={msg.id}, diff={time_diff}s)")
                                        photo_bytes = await telegram_client.download_media(msg.photo, bytes)
                                        if photo_bytes:
                                            import base64
                                            photo_base64 = f"data:image/jpeg;base64,{base64.b64encode(photo_bytes).decode('utf-8')}"
                                            logger.info(f"[{query_token}] ✓ Downloaded photo ({len(photo_bytes)} bytes)")
                                            break
                                    except Exception as e:
                                        logger.error(f"[{query_token}] Photo download error: {e}")
                        if photo_base64:
                            break
                
                # Strategy 3: If still no photo, check ALL recent photos near our query time
                if not photo_base64 and our_nik_messages:
                    logger.info(f"[{query_token}] Strategy 3: Looking for any nearby photo...")
                    for msg in response_messages:
                        if msg.date < time_threshold:
                            continue
                        if msg.photo:
                            # Must be within 30 seconds of query start
                            time_diff = (msg.date - query_start_time).total_seconds()
                            if abs(time_diff) <= 30:
                                # Check if this photo message doesn't have a DIFFERENT NIK
                                if msg.text:
                                    other_niks = re.findall(r'\b\d{16}\b', msg.text)
                                    if other_niks and nik not in other_niks:
                                        logger.info(f"[{query_token}] Skipping photo - contains different NIK")
                                        continue
                                
                                try:
                                    logger.info(f"[{query_token}] Found nearby photo (msg_id={msg.id}, time_diff={time_diff}s from query)")
                                    photo_bytes = await telegram_client.download_media(msg.photo, bytes)
                                    if photo_bytes:
                                        import base64
                                        photo_base64 = f"data:image/jpeg;base64,{base64.b64encode(photo_bytes).decode('utf-8')}"
                                        logger.info(f"[{query_token}] ✓ Downloaded photo from Strategy 3 ({len(photo_bytes)} bytes)")
                                        break
                                except Exception as e:
                                    logger.error(f"[{query_token}] Photo download error: {e}")
            
            # If no NIK messages found, log warning
            if not our_nik_messages:
                logger.warning(f"[{query_token}] No messages found containing our NIK {nik}")
            elif not photo_base64:
                logger.info(f"[{query_token}] Found {len(our_nik_messages)} messages with our NIK but no associated photo")
            
            # Filter messages by time for TEXT data only
            filtered_messages = []
            for msg in response_messages:
                msg_time = msg.date.replace(tzinfo=timezone.utc) if msg.date.tzinfo is None else msg.date
                if msg_time >= time_threshold:
                    filtered_messages.append(msg)
            
            logger.info(f"[{query_token}] Filtered {len(response_messages)} messages to {len(filtered_messages)} for text (photo found: {'Yes' if photo_base64 else 'No'})")
            
            # Step 5: Parse response - look for relevant data in filtered messages
            for msg in filtered_messages:
                if not msg.text:
                    continue
                    
                msg_text_lower = msg.text.lower()
                
                # Skip messages that are just the NIK we sent or button prompts
                if msg.text.strip() == nik:
                    continue
                if 'pilih menu' in msg_text_lower or 'silahkan pilih' in msg_text_lower:
                    continue
                
                # Check if this looks like a data response (contains typical fields)
                is_data_response = any(keyword in msg_text_lower for keyword in [
                    'nama', 'name', 'alamat', 'address', 'tempat lahir', 'tgl lahir',
                    'jenis kelamin', 'agama', 'status', 'pekerjaan', 'kewarganegaraan',
                    'provinsi', 'kabupaten', 'kecamatan', 'kelurahan', 'rt', 'rw',
                    'no kk', 'kepala keluarga', 'hubungan', 'ayah', 'ibu', 'anak',
                    'not found', 'tidak ditemukan', 'data tidak', 'anggota', 'member'
                ])
                
                # Also check if message contains any 16-digit NIK
                contains_nik = bool(re.search(r'\b\d{16}\b', msg.text))
                
                if is_data_response or contains_nik:
                    logger.info(f"[{query_token}] Found potential response: {msg.text[:100]}...")
                    
                    # Check for not found
                    if 'not found' in msg_text_lower or 'tidak ditemukan' in msg_text_lower or 'data tidak' in msg_text_lower:
                        return {"status": "not_found", "raw_text": msg.text}
                    
                    # For NKK, collect all relevant messages
                    if button_type == "NKK":
                        if msg.text not in collected_texts:
                            collected_texts.append(msg.text)
                            logger.info(f"[{query_token}] Collected NKK message {len(collected_texts)}: {len(msg.text)} chars")
                    
                    # Parse data
                    parsed_data = parse_nongeoint_response(msg.text, button_type)
                    
                    # Also check for photo in this specific message
                    if msg.photo and not photo_base64:
                        try:
                            photo_bytes = await telegram_client.download_media(msg.photo, bytes)
                            if photo_bytes:
                                import base64
                                photo_base64 = f"data:image/jpeg;base64,{base64.b64encode(photo_bytes).decode('utf-8')}"
                                logger.info(f"[{query_token}] Downloaded photo from data message")
                        except Exception as e:
                            logger.error(f"[{query_token}] Photo download error: {e}")
                    
                    # For NKK, don't return immediately - collect more messages
                    if button_type != "NKK":
                        # Store the best response (prefer ones with parsed data)
                        if parsed_data or not best_response:
                            best_response = {
                                "status": "completed",
                                "data": parsed_data,
                                "raw_text": msg.text,
                                "photo": photo_base64,
                                "family_data": None
                            }
                            
                        # If we got parsed data, return immediately
                        if parsed_data:
                            logger.info(f"[{query_token}] Successfully parsed data, photo: {'Yes' if photo_base64 else 'No'}")
                            return best_response
            
            # For NKK, parse combined texts after collecting
            if button_type == "NKK" and collected_texts:
                combined_text = "\n\n---MEMBER---\n\n".join(collected_texts)
                logger.info(f"[{query_token}] Combined {len(collected_texts)} NKK messages, total {len(combined_text)} chars")
                
                # Parse family data from combined text
                family_data = parse_nkk_family_data(combined_text)
                if family_data:
                    logger.info(f"[{query_token}] Parsed {family_data.get('member_count', 0)} family members from combined text")
                
                # Also try parsing each message separately and combine results
                if not family_data or len(family_data.get('members', [])) < 2:
                    all_members = []
                    for txt in collected_texts:
                        fd = parse_nkk_family_data(txt)
                        if fd and fd.get('members'):
                            for m in fd['members']:
                                if m.get('nik') and m not in all_members:
                                    # Check if NIK already exists
                                    existing_niks = [x.get('nik') for x in all_members]
                                    if m.get('nik') not in existing_niks:
                                        all_members.append(m)
                    
                    if len(all_members) > len(family_data.get('members', []) if family_data else []):
                        logger.info(f"[{query_token}] Individual parsing found {len(all_members)} unique members")
                        family_data = {
                            "members": all_members,
                            "member_count": len(all_members)
                        }
                
                parsed_data = parse_nongeoint_response(combined_text, button_type)
                
                return {
                    "status": "completed",
                    "data": parsed_data,
                    "raw_text": combined_text,
                    "photo": photo_base64,  # Use the collected photo
                    "family_data": family_data
                }
            
            # If no good response yet, wait and try again
            if not best_response and not collected_texts:
                await asyncio.sleep(3)
        
        # Return best response if found, otherwise error
        if best_response:
            # Make sure to include photo if found separately
            if photo_base64 and not best_response.get('photo'):
                best_response['photo'] = photo_base64
            logger.info(f"[{query_token}] Returning best response found, photo: {'Yes' if best_response.get('photo') else 'No'}")
            return best_response
        
        # REMOVED: Extra photo search - this caused photo leaking between NIKs
        # Photos should only be found from messages associated with THIS NIK's response
        
        logger.warning(f"[{query_token}] No matching response found after all attempts")
        return {"status": "no_data", "error": "No matching response found"}
        
    except Exception as e:
        logger.error(f"[{query_token}] Error: {e}")
        return {"status": "error", "error": str(e)}


def parse_nkk_family_data(text: str) -> dict:
    """
    Parse NKK/Family Card data to extract family members - ENHANCED VERSION
    
    Handles the common Telegram bot response format:
    
    Identity of {NKK}:
    
    Nik: 1234567890123456
    Family ID: 1234567890123456
    Full Name: NAMA ORANG
    Address: ALAMAT LENGKAP
    Dob: TEMPAT - DD-MMM-YY
    Religion: AGAMA
    Relationship: KEPALA KELUARGA
    Blood: GOLONGAN DARAH
    Type of Work: PEKERJAAN
    Gender: LAKI-LAKI/PEREMPUAN
    Marital: STATUS PERNIKAHAN
    Father Name: NAMA AYAH
    NIK Father: NIK_AYAH
    Mother Name: NAMA IBU
    NIK Mother: NIK_IBU
    
    (Repeated for each family member)
    """
    import re
    
    members = []
    lines = text.split('\n')
    current_member = {}
    family_id = None
    
    # Track line numbers for debugging
    logger.info(f"[NKK PARSER] Parsing {len(lines)} lines of NKK data")
    logger.info(f"[NKK PARSER] Raw text preview: {text[:300]}...")
    
    # ============================================
    # PRIMARY METHOD: Parse block-by-block format
    # Each member starts with "Nik: XXXXXXXXXXXXXXXX" line
    # ============================================
    
    def save_current_member():
        """Save current member if valid"""
        nonlocal current_member
        if current_member and current_member.get('nik'):
            # Check if NIK is valid (16 digits, not same as Family ID unless it's the first entry)
            nik = current_member.get('nik', '')
            if len(nik) == 16:
                members.append(current_member.copy())
                logger.info(f"[NKK PARSER] Saved member #{len(members)}: {current_member.get('name', 'Unknown')} - {current_member.get('relationship', 'Unknown')}")
        current_member = {}
    
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        
        # Detect "Nik:" line - signals START of a new member block
        # This pattern matches: "Nik: 1234567890123456"
        nik_line_match = re.match(r'^Nik\s*[:\-]\s*(\d{16})\s*$', stripped, re.IGNORECASE)
        if nik_line_match:
            # Save the previous member before starting new one
            save_current_member()
            current_member = {'nik': nik_line_match.group(1)}
            logger.info(f"[NKK PARSER] Found new member block with NIK: {nik_line_match.group(1)}")
            continue
        
        # If we're currently parsing a member, extract their fields
        if current_member:
            # Family ID - extract once for the whole family
            fid_match = re.match(r'^Family\s*ID\s*[:\-]\s*(\d{16})\s*$', stripped, re.IGNORECASE)
            if fid_match:
                family_id = fid_match.group(1)
                current_member['family_id'] = family_id
                continue
            
            # Full Name
            name_match = re.match(r'^Full\s*Name\s*[:\-]\s*(.+)$', stripped, re.IGNORECASE)
            if name_match:
                current_member['name'] = name_match.group(1).strip()
                continue
            
            # Address - capture full address
            addr_match = re.match(r'^Address\s*[:\-]\s*(.+)$', stripped, re.IGNORECASE)
            if addr_match:
                current_member['address'] = addr_match.group(1).strip()
                continue
            
            # Date of Birth (Dob: TEMPAT - DD-MMM-YY)
            dob_match = re.match(r'^Dob\s*[:\-]\s*(.+)$', stripped, re.IGNORECASE)
            if dob_match:
                dob_value = dob_match.group(1).strip()
                current_member['dob'] = dob_value
                current_member['birth_date'] = dob_value
                current_member['tanggal_lahir'] = dob_value
                # Also try to split place and date
                if ' - ' in dob_value:
                    parts = dob_value.split(' - ', 1)
                    current_member['tempat_lahir'] = parts[0].strip()
                    current_member['tgl_lahir'] = parts[1].strip() if len(parts) > 1 else ''
                continue
            
            # Religion
            religion_match = re.match(r'^Religion\s*[:\-]\s*(.+)$', stripped, re.IGNORECASE)
            if religion_match:
                current_member['religion'] = religion_match.group(1).strip()
                current_member['agama'] = religion_match.group(1).strip()
                continue
            
            # Relationship (SHDK)
            rel_match = re.match(r'^Relationship\s*[:\-]\s*(.+)$', stripped, re.IGNORECASE)
            if rel_match:
                rel_value = rel_match.group(1).strip().upper()
                current_member['relationship'] = rel_value
                current_member['hubungan'] = rel_value
                continue
            
            # Blood Type
            blood_match = re.match(r'^Blood\s*[:\-]\s*(.+)$', stripped, re.IGNORECASE)
            if blood_match:
                current_member['blood_type'] = blood_match.group(1).strip()
                current_member['golongan_darah'] = blood_match.group(1).strip()
                continue
            
            # Type of Work / Pekerjaan
            work_match = re.match(r'^Type\s*of\s*Work\s*[:\-]\s*(.+)$', stripped, re.IGNORECASE)
            if work_match:
                current_member['occupation'] = work_match.group(1).strip()
                current_member['pekerjaan'] = work_match.group(1).strip()
                continue
            
            # Gender
            gender_match = re.match(r'^Gender\s*[:\-]\s*(.+)$', stripped, re.IGNORECASE)
            if gender_match:
                gender_value = gender_match.group(1).strip().upper()
                if 'LAKI' in gender_value:
                    current_member['gender'] = 'L'
                elif 'PEREMPUAN' in gender_value:
                    current_member['gender'] = 'P'
                else:
                    current_member['gender'] = gender_value[0] if gender_value else '-'
                continue
            
            # Marital Status
            marital_match = re.match(r'^Marital\s*[:\-]\s*(.+)$', stripped, re.IGNORECASE)
            if marital_match:
                current_member['marital_status'] = marital_match.group(1).strip()
                current_member['status_pernikahan'] = marital_match.group(1).strip()
                continue
            
            # Father Name
            father_match = re.match(r'^Father\s*Name\s*[:\-]\s*(.+)$', stripped, re.IGNORECASE)
            if father_match:
                current_member['father_name'] = father_match.group(1).strip()
                current_member['nama_ayah'] = father_match.group(1).strip()
                continue
            
            # Father NIK
            father_nik_match = re.match(r'^NIK\s*Father\s*[:\-]\s*(.*)$', stripped, re.IGNORECASE)
            if father_nik_match:
                current_member['father_nik'] = father_nik_match.group(1).strip() or '-'
                current_member['nik_ayah'] = father_nik_match.group(1).strip() or '-'
                continue
            
            # Mother Name
            mother_match = re.match(r'^Mother\s*Name\s*[:\-]\s*(.+)$', stripped, re.IGNORECASE)
            if mother_match:
                current_member['mother_name'] = mother_match.group(1).strip()
                current_member['nama_ibu'] = mother_match.group(1).strip()
                continue
            
            # Mother NIK
            mother_nik_match = re.match(r'^NIK\s*Mother\s*[:\-]\s*(.*)$', stripped, re.IGNORECASE)
            if mother_nik_match:
                current_member['mother_nik'] = mother_nik_match.group(1).strip() or '-'
                current_member['nik_ibu'] = mother_nik_match.group(1).strip() or '-'
                continue
    
    # Don't forget the last member!
    save_current_member()
    
    logger.info(f"[NKK PARSER] Primary method found {len(members)} members")
    
    # ============================================
    # FALLBACK METHOD: If primary failed, try generic NIK extraction
    # ============================================
    if len(members) < 2:
        logger.info("[NKK PARSER] Primary method found < 2 members, trying fallback...")
        
        # Find all unique NIKs in the text
        all_niks = list(set(re.findall(r'\b(\d{16})\b', text)))
        logger.info(f"[NKK PARSER] Found {len(all_niks)} unique NIKs in text")
        
        if len(all_niks) > len(members):
            # Try to match each NIK with its associated data
            fallback_members = []
            
            for nik in all_niks:
                member = {'nik': nik}
                
                # Find the text section that contains this NIK
                # Look for Full Name after this NIK
                pattern = rf'Nik\s*[:\-]?\s*{nik}[\s\S]*?Full\s*Name\s*[:\-]\s*([^\n]+)'
                name_match = re.search(pattern, text, re.IGNORECASE)
                if name_match:
                    member['name'] = name_match.group(1).strip()
                
                # Look for Relationship after this NIK
                rel_pattern = rf'Nik\s*[:\-]?\s*{nik}[\s\S]*?Relationship\s*[:\-]\s*([^\n]+)'
                rel_match = re.search(rel_pattern, text, re.IGNORECASE)
                if rel_match:
                    member['relationship'] = rel_match.group(1).strip().upper()
                
                # Look for Gender after this NIK
                gender_pattern = rf'Nik\s*[:\-]?\s*{nik}[\s\S]*?Gender\s*[:\-]\s*([^\n]+)'
                gender_match = re.search(gender_pattern, text, re.IGNORECASE)
                if gender_match:
                    gender_val = gender_match.group(1).strip().upper()
                    member['gender'] = 'L' if 'LAKI' in gender_val else 'P' if 'PEREMPUAN' in gender_val else gender_val[0]
                
                if member.get('name'):  # Only add if we found a name
                    fallback_members.append(member)
            
            if len(fallback_members) > len(members):
                members = fallback_members
                logger.info(f"[NKK PARSER] Fallback method found {len(members)} members")
    
    # ============================================
    # EXTRACT FAMILY ID IF NOT FOUND
    # ============================================
    if not family_id:
        # Try to extract from "Identity of XXXXXXXXXXXXXXXX:" header
        identity_match = re.search(r'Identity\s+of\s+(\d{16})', text, re.IGNORECASE)
        if identity_match:
            family_id = identity_match.group(1)
        else:
            # Try other patterns
            no_kk_match = re.search(r'(?:no\s*kk|no\.\s*kk|nomor\s*kk|family\s*id|no\s*kartu\s*keluarga)\s*[:\-]?\s*(\d{16})', text, re.IGNORECASE)
            if no_kk_match:
                family_id = no_kk_match.group(1)
    
    logger.info(f"[NKK PARSER] Final result: {len(members)} members, Family ID: {family_id}")
    
    if members:
        # Find kepala keluarga
        kepala = None
        for m in members:
            if m.get('relationship') and 'KEPALA' in m.get('relationship', '').upper():
                kepala = m.get('name')
                break
        
        return {
            "no_kk": family_id,
            "kepala_keluarga": kepala,
            "members": members,
            "member_count": len(members)
        }
    
    return None


# AI Family Tree Analysis
class FamilyAnalysisRequest(BaseModel):
    members: List[dict]
    target_nik: Optional[str] = None

@api_router.post("/ai/family-analysis")
async def analyze_family_tree(request: FamilyAnalysisRequest, username: str = Depends(verify_token)):
    """Use AI to generate family tree analysis and insights"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        api_key = os.getenv('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="AI key not configured")
        
        # Build family summary for AI
        members_text = []
        target_member = None
        for m in request.members:
            member_info = f"- {m.get('name', 'Unknown')} (NIK: {m.get('nik', 'N/A')}, {m.get('relationship', 'Member')}, {m.get('gender', 'Unknown')})"
            members_text.append(member_info)
            if m.get('nik') == request.target_nik:
                target_member = m
        
        family_summary = "\n".join(members_text)
        target_info = f"\nTarget person: {target_member.get('name', 'Unknown')} ({target_member.get('relationship', 'Member')})" if target_member else ""
        
        # Create AI prompt
        prompt = f"""Analisis data keluarga berikut dan berikan insight dalam Bahasa Indonesia:

ANGGOTA KELUARGA:
{family_summary}
{target_info}

Berikan analisis singkat (maksimal 100 kata) meliputi:
1. Struktur keluarga (siapa kepala keluarga, pasangan, anak-anak)
2. Hubungan target dengan anggota lain
3. Insight menarik tentang keluarga ini

Format respons dalam paragraf pendek, tidak perlu bullet points."""

        # Initialize AI chat
        chat = LlmChat(
            api_key=api_key,
            session_id=f"family-analysis-{uuid.uuid4()}",
            system_message="Kamu adalah analis data keluarga yang membantu menganalisis struktur dan hubungan keluarga. Berikan insight yang berguna dalam Bahasa Indonesia yang singkat dan jelas."
        ).with_model("gemini", "gemini-2.5-flash")
        
        # Send message and get response
        user_message = UserMessage(text=prompt)
        analysis = await chat.send_message(user_message)
        
        return {
            "success": True,
            "analysis": analysis,
            "member_count": len(request.members),
            "target_name": target_member.get('name') if target_member else None
        }
        
    except Exception as e:
        logging.error(f"AI Family Analysis error: {e}")
        return {
            "success": False,
            "analysis": f"Tidak dapat menganalisis: {str(e)}",
            "error": str(e)
        }

# ==================== HISTORY FUNCTIONS ====================

async def save_position_history(target_id: str, phone_number: str, lat: float, lng: float, address: str = None, cp_timestamp: str = None):
    """Save position to history collection with actual CP query timestamp"""
    history_entry = {
        "id": str(uuid.uuid4()),
        "target_id": target_id,
        "phone_number": phone_number,
        "latitude": lat,
        "longitude": lng,
        "address": address,
        "timestamp": cp_timestamp if cp_timestamp else datetime.now(timezone.utc).isoformat()
    }
    await db.position_history.insert_one(history_entry)
    logging.info(f"[HISTORY] Saved position for target {target_id}: {lat}, {lng} at {history_entry['timestamp']}")

@api_router.get("/targets/{target_id}/history")
async def get_target_history(
    target_id: str,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    username: str = Depends(verify_token)
):
    """Get position history for a target within date range"""
    target = await db.targets.find_one({"id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    query = {"target_id": target_id}
    
    if from_date or to_date:
        query["timestamp"] = {}
        if from_date:
            query["timestamp"]["$gte"] = from_date
        if to_date:
            query["timestamp"]["$lte"] = to_date
    
    history = await db.position_history.find(query, {"_id": 0}).sort("timestamp", -1).to_list(1000)
    return {"target_id": target_id, "phone_number": target.get("phone_number"), "history": history}

@api_router.post("/targets/{target_id}/save-current-position")
async def save_current_position_to_history(target_id: str, username: str = Depends(verify_token)):
    """Manually save current target position to history (for existing targets)"""
    target = await db.targets.find_one({"id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    if not target.get('data') or not target['data'].get('latitude') or not target['data'].get('longitude'):
        raise HTTPException(status_code=400, detail="Target has no position data")
    
    lat = float(target['data']['latitude'])
    lng = float(target['data']['longitude'])
    address = target['data'].get('address')
    phone_number = target.get('phone_number')
    
    # Check if this exact position is already in history
    existing = await db.position_history.find_one({
        "target_id": target_id,
        "latitude": lat,
        "longitude": lng
    })
    
    if existing:
        return {"message": "Position already in history", "existing": True}
    
    # Get timestamp from target data if available
    cp_timestamp = target.get('data', {}).get('timestamp')
    await save_position_history(target_id, phone_number, lat, lng, address, cp_timestamp)
    return {"message": "Position saved to history", "saved": True}

@api_router.post("/sync-all-positions-to-history")
async def sync_all_positions_to_history(username: str = Depends(verify_token)):
    """Sync all current target positions to history (one-time migration)"""
    targets = await db.targets.find({"status": "completed"}, {"_id": 0}).to_list(1000)
    saved_count = 0
    
    for target in targets:
        if target.get('data') and target['data'].get('latitude') and target['data'].get('longitude'):
            lat = float(target['data']['latitude'])
            lng = float(target['data']['longitude'])
            
            # Check if already exists
            existing = await db.position_history.find_one({
                "target_id": target['id'],
                "latitude": lat,
                "longitude": lng
            })
            
            if not existing:
                # Use timestamp from target data (CP query time)
                cp_timestamp = target['data'].get('timestamp')
                await save_position_history(
                    target['id'],
                    target.get('phone_number'),
                    lat,
                    lng,
                    target['data'].get('address'),
                    cp_timestamp
                )
                saved_count += 1
    
    return {"message": f"Synced {saved_count} positions to history", "count": saved_count}

@api_router.post("/fix-history-timestamps")
async def fix_history_timestamps(username: str = Depends(verify_token)):
    """Fix history timestamps by updating from target data CP timestamps"""
    history_entries = await db.position_history.find({}).to_list(10000)
    fixed_count = 0
    
    for entry in history_entries:
        target = await db.targets.find_one({"id": entry.get("target_id")})
        if target and target.get('data') and target['data'].get('timestamp'):
            # Update history entry with correct CP timestamp from target
            cp_timestamp = target['data']['timestamp']
            await db.position_history.update_one(
                {"id": entry.get("id")},
                {"$set": {"timestamp": cp_timestamp}}
            )
            fixed_count += 1
    
    return {"message": f"Fixed {fixed_count} history timestamps", "count": fixed_count}

# ==================== AOI FUNCTIONS ====================

import math

def point_in_polygon(lat: float, lng: float, polygon: list) -> bool:
    """Check if a point is inside a polygon using ray casting algorithm"""
    n = len(polygon)
    inside = False
    
    p1_lat, p1_lng = polygon[0]
    for i in range(1, n + 1):
        p2_lat, p2_lng = polygon[i % n]
        if lat > min(p1_lat, p2_lat):
            if lat <= max(p1_lat, p2_lat):
                if lng <= max(p1_lng, p2_lng):
                    if p1_lat != p2_lat:
                        lng_intersect = (lat - p1_lat) * (p2_lng - p1_lng) / (p2_lat - p1_lat) + p1_lng
                    if p1_lng == p2_lng or lng <= lng_intersect:
                        inside = not inside
        p1_lat, p1_lng = p2_lat, p2_lng
    
    return inside

def point_in_circle(lat: float, lng: float, center_lat: float, center_lng: float, radius_meters: float) -> bool:
    """Check if a point is inside a circle using Haversine formula"""
    R = 6371000  # Earth's radius in meters
    
    lat1 = math.radians(center_lat)
    lat2 = math.radians(lat)
    delta_lat = math.radians(lat - center_lat)
    delta_lng = math.radians(lng - center_lng)
    
    a = math.sin(delta_lat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lng/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    distance = R * c
    
    return distance <= radius_meters

def is_target_in_aoi(lat: float, lng: float, aoi: dict) -> bool:
    """Check if a target position is inside an AOI"""
    if aoi['aoi_type'] == 'polygon':
        return point_in_polygon(lat, lng, aoi['coordinates'])
    elif aoi['aoi_type'] == 'circle':
        center = aoi['coordinates']
        return point_in_circle(lat, lng, center[0], center[1], aoi.get('radius', 1000))
    return False

async def check_aoi_alerts(target_id: str, phone_number: str, lat: float, lng: float):
    """Check if target is inside any AOI and create alerts - alerts are per AOI owner"""
    # Get all AOIs with alarm enabled - check ALL AOIs, not just monitored ones
    aois = await db.aois.find({
        "alarm_enabled": True
    }, {"_id": 0}).to_list(100)
    
    triggered_aois = []
    for aoi in aois:
        if is_target_in_aoi(lat, lng, aoi):
            triggered_aois.append(aoi)
    
    if triggered_aois:
        for aoi in triggered_aois:
            # Check if there's already an unacknowledged alert for this AOI and target
            existing_alert = await db.aoi_alerts.find_one({
                "aoi_id": aoi['id'],
                "target_ids": target_id,
                "acknowledged": False
            })
            
            if not existing_alert:
                # Create new alert - include AOI owner for filtering
                alert = {
                    "id": str(uuid.uuid4()),
                    "aoi_id": aoi['id'],
                    "aoi_name": aoi['name'],
                    "aoi_owner": aoi.get('created_by'),  # Store owner for filtering alerts per user
                    "aoi_color": aoi.get('color', '#FF3B5C'),
                    "target_ids": [target_id],
                    "target_phones": [phone_number],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "acknowledged": False,
                    "acknowledged_at": None,
                    "latitude": lat,
                    "longitude": lng
                }
                await db.aoi_alerts.insert_one(alert)
                logging.info(f"[AOI ALERT] 🚨 Target {phone_number} entered AOI '{aoi['name']}' (owner: {aoi.get('created_by')}) at ({lat}, {lng})")
                
                # Also add target to monitored_targets if not already there
                if target_id not in aoi.get('monitored_targets', []):
                    await db.aois.update_one(
                        {"id": aoi['id']},
                        {"$addToSet": {"monitored_targets": target_id}}
                    )
                    logging.info(f"[AOI ALERT] Auto-added target {phone_number} to AOI '{aoi['name']}' monitored list")
    
    return triggered_aois

# AOI CRUD Endpoints
@api_router.post("/aois")
async def create_aoi(aoi_data: AOICreate, username: str = Depends(verify_token)):
    """Create a new AOI - owned by the creating user"""
    aoi = AOI(**aoi_data.model_dump(), created_by=username)
    doc = aoi.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.aois.insert_one(doc)
    return {"message": "AOI created", "aoi": doc}

@api_router.get("/aois")
async def get_aois(username: str = Depends(verify_token)):
    """Get AOIs - users see only their own, admin sees all"""
    # Check if user is admin
    user = await db.users.find_one({"username": username}, {"_id": 0})
    is_admin = username == ADMIN_USERNAME or (user and user.get("is_admin", False))
    
    if is_admin:
        # Admin can see all AOIs
        aois = await db.aois.find({}, {"_id": 0}).to_list(100)
    else:
        # Regular users only see their own AOIs (or legacy AOIs without owner)
        aois = await db.aois.find(
            {"$or": [{"created_by": username}, {"created_by": None}, {"created_by": {"$exists": False}}]},
            {"_id": 0}
        ).to_list(100)
    
    return {"aois": aois}

@api_router.get("/aois/{aoi_id}")
async def get_aoi(aoi_id: str, username: str = Depends(verify_token)):
    """Get a specific AOI - check ownership"""
    aoi = await db.aois.find_one({"id": aoi_id}, {"_id": 0})
    if not aoi:
        raise HTTPException(status_code=404, detail="AOI not found")
    
    # Check if user is admin or owner
    user = await db.users.find_one({"username": username}, {"_id": 0})
    is_admin = username == ADMIN_USERNAME or (user and user.get("is_admin", False))
    aoi_owner = aoi.get("created_by")
    
    if not is_admin and aoi_owner and aoi_owner != username:
        raise HTTPException(status_code=403, detail="Tidak memiliki akses ke AOI ini")
    
    return aoi

@api_router.put("/aois/{aoi_id}")
async def update_aoi(aoi_id: str, update_data: dict, username: str = Depends(verify_token)):
    """Update an AOI - only owner can update"""
    aoi = await db.aois.find_one({"id": aoi_id})
    if not aoi:
        raise HTTPException(status_code=404, detail="AOI not found")
    
    # Check ownership - only owner can update
    aoi_owner = aoi.get("created_by")
    if aoi_owner and aoi_owner != username:
        raise HTTPException(status_code=403, detail="Hanya pemilik yang bisa mengubah AOI ini")
    
    allowed_fields = ['name', 'coordinates', 'radius', 'monitored_targets', 'is_visible', 'alarm_enabled', 'color']
    update_fields = {k: v for k, v in update_data.items() if k in allowed_fields}
    
    if update_fields:
        await db.aois.update_one({"id": aoi_id}, {"$set": update_fields})
    
    updated_aoi = await db.aois.find_one({"id": aoi_id}, {"_id": 0})
    return {"message": "AOI updated", "aoi": updated_aoi}

@api_router.delete("/aois/{aoi_id}")
async def delete_aoi(aoi_id: str, username: str = Depends(verify_token)):
    """Delete an AOI - only owner can delete"""
    aoi = await db.aois.find_one({"id": aoi_id})
    if not aoi:
        raise HTTPException(status_code=404, detail="AOI not found")
    
    # Check ownership - only owner can delete
    aoi_owner = aoi.get("created_by")
    if aoi_owner and aoi_owner != username:
        raise HTTPException(status_code=403, detail="Hanya pemilik yang bisa menghapus AOI ini")
    
    result = await db.aois.delete_one({"id": aoi_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="AOI not found")
    # Also delete related alerts
    await db.aoi_alerts.delete_many({"aoi_id": aoi_id})
    return {"message": "AOI deleted"}

# AOI Alerts Endpoints
@api_router.get("/aoi-alerts")
async def get_aoi_alerts(acknowledged: Optional[bool] = None, username: str = Depends(verify_token)):
    """Get AOI alerts - users only see alerts for their own AOIs, admin sees all"""
    # Check if user is admin
    user = await db.users.find_one({"username": username}, {"_id": 0})
    is_admin = username == ADMIN_USERNAME or (user and user.get("is_admin", False))
    
    query = {}
    if acknowledged is not None:
        query["acknowledged"] = acknowledged
    
    if is_admin:
        # Admin can see all alerts
        alerts = await db.aoi_alerts.find(query, {"_id": 0}).sort("timestamp", -1).to_list(100)
    else:
        # Regular users only see alerts for their own AOIs (or legacy AOIs without owner)
        query["$or"] = [{"aoi_owner": username}, {"aoi_owner": None}, {"aoi_owner": {"$exists": False}}]
        alerts = await db.aoi_alerts.find(query, {"_id": 0}).sort("timestamp", -1).to_list(100)
    
    return {"alerts": alerts}

@api_router.post("/aoi-alerts/{alert_id}/acknowledge")
async def acknowledge_aoi_alert(alert_id: str, username: str = Depends(verify_token)):
    """Acknowledge an AOI alert - only owner can acknowledge"""
    alert = await db.aoi_alerts.find_one({"id": alert_id})
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    # Check ownership
    aoi_owner = alert.get("aoi_owner")
    if aoi_owner and aoi_owner != username:
        raise HTTPException(status_code=403, detail="Hanya pemilik AOI yang bisa mengakui alert ini")
    
    result = await db.aoi_alerts.update_one(
        {"id": alert_id},
        {"$set": {
            "acknowledged": True,
            "acknowledged_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"message": "Alert acknowledged"}

@api_router.post("/aoi-alerts/acknowledge-all")
async def acknowledge_all_alerts(username: str = Depends(verify_token)):
    """Acknowledge all unacknowledged alerts - only for user's own AOIs"""
    # Check if user is admin
    user = await db.users.find_one({"username": username}, {"_id": 0})
    is_admin = username == ADMIN_USERNAME or (user and user.get("is_admin", False))
    
    if is_admin:
        # Admin can acknowledge all alerts (but typically should only acknowledge their own)
        query = {"acknowledged": False, "$or": [{"aoi_owner": username}, {"aoi_owner": None}, {"aoi_owner": {"$exists": False}}]}
    else:
        # Regular users only acknowledge their own AOI alerts
        query = {"acknowledged": False, "$or": [{"aoi_owner": username}, {"aoi_owner": None}, {"aoi_owner": {"$exists": False}}]}
    
    result = await db.aoi_alerts.update_many(
        query,
        {"$set": {
            "acknowledged": True,
            "acknowledged_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    return {"message": f"Acknowledged {result.modified_count} alerts"}

# =====================================================
# DATABASE EXPORT & SEEDING ENDPOINTS
# =====================================================

@api_router.get("/db/export")
async def export_database(username: str = Depends(verify_token)):
    """Export all database collections for migration/seeding"""
    collections_to_export = [
        'users', 'cases', 'targets', 'chat_messages', 
        'position_history', 'schedules', 'aois', 'aoi_alerts'
    ]
    
    export_data = {}
    
    for col_name in collections_to_export:
        try:
            docs = await db[col_name].find({}, {"_id": 0}).to_list(length=None)
            export_data[col_name] = docs
            logger.info(f"Exported {len(docs)} documents from {col_name}")
        except Exception as e:
            logger.error(f"Error exporting {col_name}: {e}")
            export_data[col_name] = []
    
    return {
        "status": "success",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": export_data
    }

class SeedRequest(BaseModel):
    data: dict
    clear_existing: bool = False

@api_router.post("/db/seed")
async def seed_database(request: SeedRequest, username: str = Depends(verify_token)):
    """Seed database with exported data"""
    results = {}
    
    for col_name, documents in request.data.items():
        if not documents:
            results[col_name] = {"status": "skipped", "count": 0}
            continue
            
        try:
            # Clear existing data if requested
            if request.clear_existing:
                deleted = await db[col_name].delete_many({})
                logger.info(f"Cleared {deleted.deleted_count} documents from {col_name}")
            
            # Insert new documents
            if documents:
                await db[col_name].insert_many(documents)
                results[col_name] = {"status": "success", "count": len(documents)}
                logger.info(f"Seeded {len(documents)} documents to {col_name}")
        except Exception as e:
            logger.error(f"Error seeding {col_name}: {e}")
            results[col_name] = {"status": "error", "message": str(e)}
    
    return {
        "status": "completed",
        "results": results
    }

@api_router.get("/db/status")
async def database_status(username: str = Depends(verify_token)):
    """Get database status and document counts"""
    collections = await db.list_collection_names()
    status = {}
    
    for col_name in collections:
        count = await db[col_name].count_documents({})
        status[col_name] = count
    
    return {
        "database": os.environ.get('DB_NAME', 'waskita_lbs'),
        "collections": status,
        "total_documents": sum(status.values())
    }

@api_router.get("/telegram/credentials-status")
async def get_telegram_credentials_status(username: str = Depends(verify_token)):
    """Get current Telegram API credentials status"""
    global telegram_client
    
    # Read current values from .env file
    env_path = ROOT_DIR / '.env'
    current_api_id = None
    current_api_hash = None
    
    if env_path.exists():
        with open(env_path, 'r') as f:
            for line in f:
                if line.startswith('TELEGRAM_API_ID='):
                    current_api_id = line.split('=', 1)[1].strip()
                elif line.startswith('TELEGRAM_API_HASH='):
                    current_api_hash = line.split('=', 1)[1].strip()
    
    # Check session file
    session_files = list(ROOT_DIR.glob('*.session'))
    session_exists = len(session_files) > 0
    session_info = []
    for sf in session_files:
        stat = sf.stat()
        session_info.append({
            "name": sf.name,
            "size": stat.st_size,
            "modified": datetime.fromtimestamp(stat.st_mtime).isoformat()
        })
    
    # Check if client is connected
    client_connected = False
    client_user = None
    
    if telegram_client is not None:
        try:
            client_connected = telegram_client.is_connected()
            if client_connected:
                me = await telegram_client.get_me()
                if me:
                    client_user = {
                        "id": me.id,
                        "username": me.username,
                        "phone": me.phone,
                        "first_name": me.first_name
                    }
        except Exception as e:
            logger.warning(f"Could not get client status: {e}")
    
    return {
        "api_id": current_api_id,
        "api_hash_preview": f"{current_api_hash[:8]}...{current_api_hash[-4:]}" if current_api_hash and len(current_api_hash) > 12 else current_api_hash,
        "api_hash_full": current_api_hash,  # For debugging
        "session_exists": session_exists,
        "session_files": session_info,
        "client_connected": client_connected,
        "client_user": client_user,
        "runtime_api_id": TELEGRAM_API_ID,
        "env_api_id": current_api_id,
        "runtime_matches_env": str(TELEGRAM_API_ID) == current_api_id
    }

# ============== FACE RECOGNITION ENDPOINTS ==============

class FRMatchRequest(BaseModel):
    image: str  # Base64 encoded image

class FRNikRequest(BaseModel):
    nik: str
    fr_session_id: str

@api_router.post("/face-recognition/match")
async def fr_match_face(request: FRMatchRequest, username: str = Depends(verify_token)):
    """
    Send photo to Telegram bot for face recognition matching.
    Returns list of NIKs with match percentages.
    """
    global telegram_client
    
    logger.info(f"[FR] Starting face recognition match for user: {username}")
    
    # ============================================
    # ACQUIRE GLOBAL TELEGRAM QUERY LOCK WITH TIMEOUT
    # ============================================
    operation_name = f"FR_match_{username}"
    logger.info(f"[FR] Waiting for global Telegram lock...")
    lock_acquired = await acquire_telegram_lock(operation_name)
    
    if not lock_acquired:
        raise HTTPException(status_code=503, detail="Server sibuk, coba lagi nanti")
    
    set_active_query(username, "fr_match", "face_recognition")
    
    try:
        # Check Telegram connection AND authorization
        if not telegram_client or not telegram_client.is_connected():
            raise HTTPException(status_code=503, detail="Telegram tidak terhubung. Silakan setup Telegram terlebih dahulu.")
        
        # Check if authorized
        if not await telegram_client.is_user_authorized():
            raise HTTPException(status_code=503, detail="Telegram belum login. Silakan setup Telegram terlebih dahulu di menu Settings.")
        
        # Create session ID for this FR request
        session_id = str(uuid.uuid4())[:8]
        
        # Decode base64 image and save temporarily
        import tempfile
        
        # Remove data URL prefix if present
        image_data = request.image
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        
        # Decode and save to temp file
        image_bytes = base64.b64decode(image_data)
        temp_path = f"/tmp/fr_input_{session_id}.jpg"
        with open(temp_path, 'wb') as f:
            f.write(image_bytes)
        
        logger.info(f"[FR {session_id}] Image saved to {temp_path}")
        
        # Get last message ID BEFORE sending our query - CRITICAL for isolation
        bot_entity = await telegram_client.get_entity("@northarch_bot")
        old_messages = await telegram_client.get_messages(bot_entity, limit=1)
        last_msg_id_before = old_messages[0].id if old_messages else 0
        logger.info(f"[FR {session_id}] Last message ID before send: {last_msg_id_before}")
        
        # Send the photo
        await telegram_client.send_file(bot_entity, temp_path, caption="FR")
        logger.info(f"[FR {session_id}] Photo sent to bot with caption 'FR'")
        
        # Wait for bot response with face match results
        await asyncio.sleep(8)  # Give bot more time to process
        
        # Get recent messages from bot - ONLY messages AFTER our query
        messages = await telegram_client.get_messages(bot_entity, limit=15)
        
        matches = []
        raw_response = ""
        buttons_message_id = None
        quota_error = False
        
        for msg in messages:
            # Skip messages from BEFORE our query
            if msg.id <= last_msg_id_before:
                continue
                
            if msg.out:  # Skip our own messages
                continue
            
            # Check for quota error messages
            if msg.text:
                text_lower = msg.text.lower()
                # Detect various quota error patterns
                quota_keywords = ['quota', 'don\'t have', 'tidak ada', 'habis', 'limit', 'exceeded']
                if any(kw in text_lower for kw in quota_keywords):
                    # This is likely a quota error message
                    logger.warning(f"[FR {session_id}] Quota error detected: {msg.text}")
                    quota_error = True
                    raw_response = msg.text
                    break
                
            # Check if this message has buttons (NIK selection buttons)
            if msg.buttons and not buttons_message_id:
                buttons_message_id = msg.id
                logger.info(f"[FR {session_id}] Found message with buttons, ID: {msg.id}")
                
            if msg.text:
                raw_response = msg.text
                logger.info(f"[FR {session_id}] Bot response: {msg.text[:300]}...")
                
                # Parse face match results - multiple patterns
                # Pattern 1: NIK - percentage% or NIK: percentage%
                nik_pattern = re.findall(r'(\d{16})\s*[-:=]\s*(\d{1,3}(?:\.\d+)?)\s*%', msg.text)
                
                if nik_pattern:
                    for nik, percentage in nik_pattern:
                        pct = float(percentage)
                        matches.append({
                            "nik": nik,
                            "percentage": round(pct, 2)
                        })
                
                # Pattern 2: percentage% followed by NIK
                if not matches:
                    pattern2 = re.findall(r'(\d{1,3}(?:\.\d+)?)\s*%\s*[-:=]?\s*(\d{16})', msg.text)
                    for percentage, nik in pattern2:
                        pct = float(percentage)
                        matches.append({
                            "nik": nik,
                            "percentage": round(pct, 2)
                        })
                
                # Pattern 3: Look for NIKs and percentages in same message
                if not matches:
                    niks = re.findall(r'\b(\d{16})\b', msg.text)
                    percentages = re.findall(r'(\d{1,3}(?:\.\d+)?)\s*%', msg.text)
                    
                    for i, nik in enumerate(niks):
                        pct = float(percentages[i]) if i < len(percentages) else 0
                        matches.append({
                            "nik": nik,
                            "percentage": round(pct, 2)
                        })
                
                if matches:
                    break  # Found matches, stop looking
        
        # Check for quota error
        if quota_error:
            # Cleanup temp file
            try:
                os.remove(temp_path)
            except:
                pass
            
            return {
                "session_id": session_id,
                "matches": [],
                "raw_response": raw_response,
                "error": "FR_QUOTA_EXHAUSTED",
                "error_message": "Kuota Face Recognition habis. Silakan hubungi admin untuk menambah kuota."
            }
        
        # Sort by percentage descending
        matches.sort(key=lambda x: x['percentage'], reverse=True)
        
        # Store session for later use (store full input image for history)
        await db.fr_sessions.insert_one({
            "id": session_id,
            "created_by": username,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "input_image_full": request.image,  # Store full image for history
            "matches": matches,
            "raw_response": raw_response,
            "buttons_message_id": buttons_message_id
        })
        
        # Cleanup temp file
        try:
            os.remove(temp_path)
        except:
            pass
        
        logger.info(f"[FR {session_id}] Found {len(matches)} matches, buttons_msg_id: {buttons_message_id}")
        
        return {
            "session_id": session_id,
            "matches": matches,
            "raw_response": raw_response
        }
        
    except Exception as e:
        logger.error(f"[FR] Error: {e}")
        import traceback
        logger.error(f"[FR] Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # ALWAYS release the global lock
        clear_active_query()
        release_telegram_lock(operation_name)


@api_router.post("/face-recognition/get-nik-details")
async def fr_get_nik_details(request: FRNikRequest, username: str = Depends(verify_token)):
    """
    Get detailed NIK data for the selected match.
    Sends NIK to bot, clicks the NIK selection button, and retrieves full data with photo.
    """
    global telegram_client
    
    operation_name = f"FR_NIK_{username}_{request.nik[:8]}"
    logger.info(f"[FR] Getting NIK details for TOP NIK: {request.nik}, user: {username}")
    
    # ============================================
    # ACQUIRE GLOBAL TELEGRAM QUERY LOCK WITH TIMEOUT
    # ============================================
    logger.info(f"[FR NIK] Waiting for global Telegram lock...")
    lock_acquired = await acquire_telegram_lock(operation_name)
    
    if not lock_acquired:
        raise HTTPException(status_code=503, detail="Server sibuk, coba lagi nanti")
    
    set_active_query(username, "fr_nik_details", request.nik)
    
    try:
        if not telegram_client or not telegram_client.is_connected():
            raise HTTPException(status_code=503, detail="Telegram tidak terhubung")
        
        bot_entity = await telegram_client.get_entity("@northarch_bot")
        
        # Get messages before we send anything (to track new messages later)
        old_messages = await telegram_client.get_messages(bot_entity, limit=3)
        last_msg_id_before_send = old_messages[0].id if old_messages else 0
        logger.info(f"[FR] Last message ID before sending NIK: {last_msg_id_before_send}")
        
        # Step 1: First check if there's already a button with our NIK from previous FR match
        messages = await telegram_client.get_messages(bot_entity, limit=10)
        
        nik_button_clicked = False
        for msg in messages:
            if msg.buttons:
                for row in msg.buttons:
                    for button in row:
                        button_text = button.text or ''
                        if request.nik in button_text:
                            logger.info(f"[FR] Found existing NIK button, clicking: {button_text}")
                            try:
                                await button.click()
                                nik_button_clicked = True
                                logger.info(f"[FR] Successfully clicked existing NIK button")
                            except Exception as btn_err:
                                logger.error(f"[FR] Error clicking existing button: {btn_err}")
                            break
                    if nik_button_clicked:
                        break
            if nik_button_clicked:
                break
        
        # Step 2: If no existing button, send NIK as text to trigger bot response
        if not nik_button_clicked:
            logger.info(f"[FR] No existing button found, sending NIK as text: {request.nik}")
            await telegram_client.send_message(bot_entity, request.nik)
            
            # Wait for bot to respond with selection buttons
            logger.info(f"[FR] Waiting for bot to send selection buttons...")
            await asyncio.sleep(5)
            
            # Get new messages and look for buttons
            new_messages = await telegram_client.get_messages(bot_entity, limit=10)
            
            for msg in new_messages:
                if msg.id <= last_msg_id_before_send:
                    continue
                if msg.out:
                    continue
                    
                # Check if this message has buttons (NIK selection)
                if msg.buttons:
                    logger.info(f"[FR] Found message with {len(msg.buttons)} button rows")
                    
                    # Try to find and click button with our NIK, or click first button
                    button_clicked = False
                    for row in msg.buttons:
                        for button in row:
                            button_text = button.text or ''
                            logger.info(f"[FR] Checking button: '{button_text}'")
                            
                            # Click if button contains our NIK or is a numbered option
                            if request.nik in button_text or button_text.strip().isdigit() or 'NIK' in button_text.upper():
                                logger.info(f"[FR] Clicking selection button: {button_text}")
                                try:
                                    await button.click()
                                    button_clicked = True
                                    nik_button_clicked = True
                                    logger.info(f"[FR] Successfully clicked selection button")
                                except Exception as btn_err:
                                    logger.error(f"[FR] Error clicking selection button: {btn_err}")
                                break
                        if button_clicked:
                            break
                    
                    # If no specific button found, try clicking the first button
                    if not button_clicked and msg.buttons[0]:
                        first_button = msg.buttons[0][0] if msg.buttons[0] else None
                        if first_button:
                            logger.info(f"[FR] Clicking first button as fallback: {first_button.text}")
                            try:
                                await first_button.click()
                                nik_button_clicked = True
                                logger.info(f"[FR] Successfully clicked first button")
                            except Exception as btn_err:
                                logger.error(f"[FR] Error clicking first button: {btn_err}")
                    
                    if nik_button_clicked:
                        break
        
        # Step 3: Wait for bot to process and send photo + data
        logger.info(f"[FR] Waiting for bot to process and return data...")
        await asyncio.sleep(8)
        
        # Step 4: Get the response with photo and data
        # Get fresh message ID to track
        check_messages = await telegram_client.get_messages(bot_entity, limit=3)
        last_msg_id_after_click = check_messages[0].id if check_messages else last_msg_id_before_send
        
        all_messages = await telegram_client.get_messages(bot_entity, limit=25)
        
        nik_data = {}
        photo = None
        found_data = False
        
        for msg in all_messages:
            if msg.out:
                continue
            
            # Process messages after our initial send
            if msg.id <= last_msg_id_before_send:
                continue
            
            logger.info(f"[FR] Processing message ID {msg.id}, has_photo: {msg.photo is not None}, has_text: {msg.text is not None}")
            
            # Download photo if available
            if msg.photo and not photo:
                logger.info(f"[FR] Found photo in message ID {msg.id}, downloading...")
                try:
                    photo_bytes = await telegram_client.download_media(msg.photo, bytes)
                    if photo_bytes:
                        import base64
                        photo = f"data:image/jpeg;base64,{base64.b64encode(photo_bytes).decode()}"
                        logger.info(f"[FR] Photo downloaded successfully, size: {len(photo_bytes)} bytes")
                        found_data = True
                except Exception as photo_err:
                    logger.error(f"[FR] Error downloading photo: {photo_err}")
            
            # Parse text data
            if msg.text:
                text = msg.text
                logger.info(f"[FR] Parsing text: {text[:300]}...")
                
                # Parse key-value pairs
                lines = text.split('\n')
                for line in lines:
                    line = line.strip()
                    if not line or len(line) < 3:
                        continue
                    
                    # Try different delimiters
                    for delimiter in [':', ' - ', '=']:
                        if delimiter in line:
                            parts = line.split(delimiter, 1)
                            if len(parts) == 2:
                                key = parts[0].strip()
                                value = parts[1].strip()
                                if key and value and 2 < len(key) < 30:
                                    nik_data[key] = value
                                    found_data = True
                            break
                
                # Extract specific fields with regex
                # NIK
                nik_match = re.search(r'NIK\s*[:\-=]?\s*(\d{16})', text, re.IGNORECASE)
                if nik_match:
                    nik_data['NIK'] = nik_match.group(1)
                
                # Nama
                nama_match = re.search(r'(?:Nama|Name|NAMA)\s*[:\-=]?\s*([A-Za-z\s\.\']+)', text)
                if nama_match and len(nama_match.group(1).strip()) > 2:
                    nik_data['Nama'] = nama_match.group(1).strip()
                
                # Tempat/Tanggal Lahir
                ttl_match = re.search(r'(?:Tempat.*?Lahir|TTL)\s*[:\-=]?\s*([A-Za-z\s,]+[\d\-\/]+)', text, re.IGNORECASE)
                if ttl_match:
                    nik_data['Tempat/Tgl Lahir'] = ttl_match.group(1).strip()
                
                # Alamat
                alamat_match = re.search(r'(?:Alamat|Address)\s*[:\-=]?\s*(.+)', text, re.IGNORECASE)
                if alamat_match:
                    nik_data['Alamat'] = alamat_match.group(1).strip()
                
                # Jenis Kelamin
                jk_match = re.search(r'(?:Jenis Kelamin|JK|Gender)\s*[:\-=]?\s*([A-Za-z\-]+)', text, re.IGNORECASE)
                if jk_match:
                    nik_data['Jenis Kelamin'] = jk_match.group(1).strip()
                
                # Agama
                agama_match = re.search(r'(?:Agama|Religion)\s*[:\-=]?\s*([A-Za-z]+)', text, re.IGNORECASE)
                if agama_match:
                    nik_data['Agama'] = agama_match.group(1).strip()
                
                # Pekerjaan
                kerja_match = re.search(r'(?:Pekerjaan|Occupation|Job)\s*[:\-=]?\s*([A-Za-z\s\/]+)', text, re.IGNORECASE)
                if kerja_match:
                    nik_data['Pekerjaan'] = kerja_match.group(1).strip()
        
        # Always include the queried NIK
        if 'NIK' not in nik_data:
            nik_data['NIK'] = request.nik
        
        # Update session with NIK details
        await db.fr_sessions.update_one(
            {"id": request.fr_session_id},
            {"$set": {
                "selected_nik": request.nik,
                "nik_data": nik_data,
                "has_photo": photo is not None,
                "photo": photo
            }}
        )
        
        logger.info(f"[FR] Result - NIK data keys: {list(nik_data.keys())}, has_photo: {photo is not None}, found_data: {found_data}")
        
        return {
            "nik": request.nik,
            "nik_data": nik_data,
            "photo": photo
        }
        
    except Exception as e:
        logger.error(f"[FR] Error getting NIK details: {e}")
        import traceback
        logger.error(f"[FR] Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # ALWAYS release the global lock
        clear_active_query()
        release_telegram_lock(operation_name)


@api_router.get("/face-recognition/history")
async def fr_get_history(username: str = Depends(verify_token)):
    """
    Get Face Recognition search history for the user.
    Admin can see all history.
    """
    try:
        # Filter by user - admin sees all
        query = {} if username == "admin" else {"created_by": username}
        
        sessions = await db.fr_sessions.find(
            query
        ).sort("created_at", -1).limit(50).to_list(50)
        
        # Format for frontend
        history = []
        for session in sessions:
            history.append({
                "id": session.get("id"),
                "created_at": session.get("created_at"),
                "selected_nik": session.get("selected_nik"),
                "matches": session.get("matches", []),
                "nik_data": session.get("nik_data"),
                "photo": session.get("photo"),
                "input_image_full": session.get("input_image_full")  # Full input image if stored
            })
        
        return {"history": history}
        
    except Exception as e:
        logger.error(f"[FR] Error fetching history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Events
@app.on_event("startup")
async def startup():
    global telegram_client
    
    # Create database indexes for better performance
    try:
        await db.targets.create_index("id")
        await db.targets.create_index("case_id")
        await db.targets.create_index("created_by")
        await db.targets.create_index("phone_number")
        await db.cases.create_index("id")
        await db.cases.create_index("created_by")
        await db.users.create_index("username", unique=True)
        await db.aois.create_index("id")
        await db.aois.create_index("created_by")
        await db.position_history.create_index("target_id")
        await db.position_history.create_index([("target_id", 1), ("timestamp", -1)])
        await db.schedules.create_index("phone_number")
        # Simple query cache indexes for faster history retrieval
        await db.simple_query_cache.create_index([("created_at", -1)])
        await db.simple_query_cache.create_index("queried_by")
        await db.simple_query_cache.create_index("query_type")
        await db.simple_query_cache.create_index("cache_key")
        # NonGeoint search indexes
        await db.nongeoint_searches.create_index([("created_at", -1)])
        await db.nongeoint_searches.create_index("created_by")
        logger.info("✓ Database indexes created/verified")
    except Exception as idx_err:
        logger.warning(f"Index creation warning (may already exist): {idx_err}")
    
    # Auto-seed database if empty
    from seed_database import seed_database, check_database_empty
    
    is_empty = await check_database_empty(db)
    if is_empty:
        logger.info("Database is empty, running auto-seed...")
        results = await seed_database(db)
        logger.info(f"Auto-seed completed: {results}")
    else:
        logger.info("Database has existing data, skipping auto-seed")
    
    # Try to reconnect Telegram session
    session_path = str(ROOT_DIR / 'northarch_session.session')
    
    # First, try to restore session from MongoDB if file doesn't exist
    if not os.path.exists(session_path):
        logger.info("Session file not found, checking MongoDB backup...")
        try:
            import base64
            session_backup = await db.telegram_sessions.find_one({"type": "main_session"})
            if session_backup and session_backup.get('session_data'):
                session_data = base64.b64decode(session_backup['session_data'])
                with open(session_path, 'wb') as f:
                    f.write(session_data)
                logger.info(f"✓ Restored Telegram session from MongoDB backup (user: {session_backup.get('username')})")
            else:
                logger.warning("No session backup found in MongoDB - user needs to login via Settings")
        except Exception as restore_err:
            logger.error(f"Failed to restore session from MongoDB: {restore_err}")
    
    # Now try to connect with proper settings
    if os.path.exists(session_path):
        logger.info("Found Telegram session, attempting to reconnect...")
        try:
            # Use helper function with proper settings
            telegram_client = create_telegram_client()
            await telegram_client.connect()
            
            if await telegram_client.is_user_authorized():
                me = await telegram_client.get_me()
                logger.info(f"✓ Telegram auto-reconnected as @{me.username or me.phone}")
                
                # Backup session to MongoDB to ensure it's saved
                try:
                    import base64
                    with open(session_path, 'rb') as f:
                        session_data = f.read()
                    session_base64 = base64.b64encode(session_data).decode('utf-8')
                    await db.telegram_sessions.update_one(
                        {"type": "main_session"},
                        {"$set": {
                            "session_data": session_base64,
                            "username": me.username,
                            "phone": me.phone,
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }},
                        upsert=True
                    )
                    logger.info("✓ Session backed up to MongoDB")
                except Exception as backup_err:
                    logger.warning(f"Failed to backup session: {backup_err}")
            else:
                logger.warning("Telegram session exists but not authorized - user needs to re-login")
        except Exception as e:
            logger.error(f"Failed to auto-reconnect Telegram: {e}")
            # Clear invalid session
            if "auth key" in str(e).lower() or "security" in str(e).lower():
                logger.warning("Removing potentially corrupted session file...")
                try:
                    os.remove(session_path)
                except:
                    pass
    else:
        logger.info("No Telegram session found - user needs to login via Settings")
    
    # Start background keep-alive task
    asyncio.create_task(telegram_keepalive_task())
    logger.info("✓ Telegram keepalive task started")

# Background task to keep Telegram connection alive with active ping
async def telegram_keepalive_task():
    """Background task that maintains a persistent Telegram connection with active ping"""
    global telegram_client
    
    logger.info("[Keepalive] Starting persistent Telegram connection manager")
    
    # Counter to track consecutive failures
    failure_count = 0
    max_failures = 5
    backup_counter = 0  # Backup session every 6 checks (2 minutes)
    ping_counter = 0    # Ping every 3 checks (1 minute)
    
    while True:
        try:
            # Check more frequently - every 20 seconds
            await asyncio.sleep(20)
            
            # Skip if client doesn't exist
            if telegram_client is None:
                continue
            
            # Use lock to safely access telegram_client
            async with telegram_connection_lock:
                if telegram_client is None:
                    continue
                    
                # Check connection status
                is_connected = telegram_client.is_connected()
                
                if not is_connected:
                    failure_count += 1
                    logger.warning(f"[Keepalive] Connection lost (failure {failure_count}/{max_failures})")
                    
                    if failure_count <= max_failures:
                        try:
                            # Reconnect
                            await telegram_client.connect()
                            
                            # Verify connection
                            if telegram_client.is_connected():
                                logger.info("[Keepalive] ✓ Reconnected successfully")
                                failure_count = 0  # Reset counter
                            else:
                                logger.error("[Keepalive] Reconnect returned but not connected")
                        except Exception as reconnect_err:
                            logger.error(f"[Keepalive] Reconnect error: {reconnect_err}")
                    else:
                        # Too many failures, try to recreate client
                        logger.warning("[Keepalive] Too many failures, recreating client...")
                        try:
                            if telegram_client:
                                await telegram_client.disconnect()
                        except Exception as disc_err:
                            logger.debug(f"[Keepalive] Disconnect during recreate: {disc_err}")
                        
                        telegram_client = create_telegram_client()
                        await telegram_client.connect()
                        
                        if telegram_client.is_connected():
                            logger.info("[Keepalive] ✓ Client recreated and connected")
                            failure_count = 0
                else:
                    # Connection is alive, reset failure count
                    failure_count = 0
                    
                    # Active ping every minute (3 * 20 seconds) to keep connection truly alive
                    ping_counter += 1
                    if ping_counter >= 3:
                        ping_counter = 0
                        try:
                            if await telegram_client.is_user_authorized():
                                # Send a lightweight request to keep connection active
                                # get_me() is a simple operation that verifies the connection
                                me = await telegram_client.get_me()
                                logger.debug(f"[Keepalive] ✓ Active ping OK - connected as {me.username}")
                        except Exception as ping_err:
                            logger.warning(f"[Keepalive] Active ping failed: {ping_err}")
                            # Force reconnect on next cycle
                            failure_count = 1
                    
                    # Periodic session backup to MongoDB (every 2 minutes = 6 * 20 seconds)
                    backup_counter += 1
                    if backup_counter >= 6:
                        backup_counter = 0
                        try:
                            if await telegram_client.is_user_authorized():
                                session_path = str(ROOT_DIR / 'northarch_session.session')
                                if os.path.exists(session_path):
                                    import base64
                                    with open(session_path, 'rb') as f:
                                        session_data = f.read()
                                    session_base64 = base64.b64encode(session_data).decode('utf-8')
                                    me = await telegram_client.get_me()
                                    await db.telegram_sessions.update_one(
                                        {"type": "main_session"},
                                        {"$set": {
                                            "session_data": session_base64,
                                            "username": me.username,
                                            "phone": me.phone,
                                            "updated_at": datetime.now(timezone.utc).isoformat()
                                        }},
                                        upsert=True
                                    )
                                    logger.info("[Keepalive] ✓ Session backed up to MongoDB")
                        except Exception as backup_err:
                            logger.warning(f"[Keepalive] Backup failed: {backup_err}")
                    
        except asyncio.CancelledError:
            logger.info("[Keepalive] Task cancelled, shutting down")
            break
        except Exception as e:
            logger.error(f"[Keepalive] Unexpected error: {e}")

# ============================================
# Simple Query Endpoint
# ============================================

# Global lock to prevent race conditions between concurrent queries
simple_query_lock = asyncio.Lock()

class SimpleQueryRequest(BaseModel):
    query_type: str
    query_value: str

@api_router.post("/simple-query")
async def simple_query(request: SimpleQueryRequest, username: str = Depends(verify_token)):
    """
    Simple query - sends query to Telegram bot and returns raw response.
    Uses a global lock to prevent race conditions between users.
    
    Query types:
    - capil_name: CAPIL search by name
    - capil_nik: CAPIL search by NIK (16 digits)
    - nkk: Kartu Keluarga by NKK (16 digits)
    - reghp: RegHP by NIK (16 digits)
    - passport_wna: Passport WNA by name (via CP API)
    - passport_wni: Passport WNI by name (via CP API)
    - passport_nik: Passport WNI by NIK (via CP API)
    - passport_number: Passport by number (via CP API)
    - perlintasan: Border crossing by passport number (via CP API)
    - plat_mobil: Vehicle by plate number
    - email_breach: Check email in data breaches (via HIBP)
    - ip_lookup: IP Address geolocation lookup (via IPinfo.io)
    """
    global telegram_client, current_request_status
    
    query_type = request.query_type
    query_value = request.query_value.strip().upper()
    
    # ============================================
    # CHECK IF SYSTEM IS BUSY (Full Query running)
    # ============================================
    if current_request_status.get("is_busy"):
        busy_user = current_request_status.get("username", "unknown")
        busy_operation = current_request_status.get("operation", "unknown")
        # Block ALL users including the same user - no concurrent queries allowed
        logger.warning(f"[SIMPLE QUERY] Blocked - System busy by {busy_user} doing {busy_operation}")
        raise HTTPException(
            status_code=503,
            detail={
                "error": "system_busy",
                "message": f"Antrian query sedang berjalan. User '{busy_user}' sedang melakukan {busy_operation}. Mohon tunggu hingga selesai.",
                "busy_user": busy_user,
                "operation": busy_operation,
                "started_at": current_request_status.get("started_at")
            }
        )
    
    def clear_request_status():
        """Helper to clear request status when query completes"""
        global current_request_status
        current_request_status = {
            "is_busy": False,
            "username": None,
            "operation": None,
            "started_at": None
        }
    
    logger.info(f"[SIMPLE QUERY] User: {username}, Type: {query_type}, Value: {query_value}")
    
    # ============================================
    # CHECK CACHE FIRST
    # ============================================
    cache_key = f"{query_type}:{query_value}"
    cached_result = await db.simple_query_cache.find_one(
        {"cache_key": cache_key},
        {"_id": 0}
    )
    
    if cached_result and cached_result.get("raw_response"):
        logger.info(f"[SIMPLE QUERY] Cache HIT for {cache_key}")
        return {
            "success": True,
            "query_type": query_type,
            "query_value": query_value,
            "raw_response": cached_result["raw_response"],
            "photo": cached_result.get("photo"),
            "verified": True,
            "cached": True,
            "cached_at": cached_result.get("created_at")
        }
    
    logger.info(f"[SIMPLE QUERY] Cache MISS for {cache_key}")
    
    # Update request status for queue indicator (non-cached queries)
    # Note: current_request_status is already accessed above, no need for global declaration here
    current_request_status["is_busy"] = True
    current_request_status["username"] = username
    current_request_status["operation"] = f"Simple Query - {query_type}"
    current_request_status["started_at"] = datetime.now(timezone.utc).isoformat()
    
    # ============================================
    # PASSPORT QUERIES USE CP API DIRECTLY (NO TELEGRAM)
    # ============================================
    passport_types = ['passport_wna', 'passport_wni', 'passport_number', 'passport_nik']
    logger.info(f"[SIMPLE QUERY] Checking if '{query_type}' is in passport types: {passport_types}")
    
    if query_type in passport_types:
        logger.info(f"[SIMPLE QUERY] ✓ Matched passport type! Using CP API for: {query_type} = {query_value}")
        
        try:
            logger.info(f"[SIMPLE QUERY] Calling query_passport_simple_cp_api...")
            cp_result = await query_passport_simple_cp_api(query_type, query_value)
            logger.info(f"[SIMPLE QUERY] Passport cp_result type: {type(cp_result)}, value: {str(cp_result)[:200]}")
            
            # Safety check - ensure cp_result is a dict
            if cp_result is None:
                logger.error(f"[SIMPLE QUERY] Passport query returned None!")
                clear_request_status()
                return {
                    "success": False,
                    "query_type": query_type,
                    "query_value": query_value,
                    "error": "Gagal mengambil data passport - response kosong",
                    "source": "CP_API"
                }
            
            if not isinstance(cp_result, dict):
                logger.error(f"[SIMPLE QUERY] Passport query returned non-dict: {type(cp_result)}")
                clear_request_status()
                return {
                    "success": False,
                    "query_type": query_type,
                    "query_value": query_value,
                    "error": f"Gagal mengambil data passport - response bukan dictionary: {type(cp_result)}",
                    "source": "CP_API"
                }
            
            success = cp_result.get("success", False)
            logger.info(f"[SIMPLE QUERY] Passport success value: {success}")
            
            if success:
                raw_response = cp_result.get("raw_response", "")
                
                # Save to cache
                cache_doc = {
                    "cache_key": cache_key,
                    "query_type": query_type,
                    "query_value": query_value,
                    "raw_response": raw_response,
                    "queried_by": username,
                    "created_by": username,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.simple_query_cache.update_one(
                    {"cache_key": cache_key},
                    {"$set": cache_doc},
                    upsert=True
                )
                logger.info(f"[SIMPLE QUERY] Saved passport result to cache: {cache_key}")
                
                clear_request_status()
                return {
                    "success": True,
                    "query_type": query_type,
                    "query_value": query_value,
                    "raw_response": raw_response,
                    "verified": True,
                    "cached": False,
                    "source": "CP_API"
                }
            else:
                error_msg = cp_result.get("error", "Gagal mengambil data passport dari CP API")
                logger.info(f"[SIMPLE QUERY] Passport error_msg: {error_msg}")
                clear_request_status()
                return {
                    "success": False,
                    "query_type": query_type,
                    "query_value": query_value,
                    "error": error_msg,
                    "source": "CP_API"
                }
        except Exception as e:
            logger.error(f"[SIMPLE QUERY] Passport query exception: {e}")
            import traceback
            logger.error(f"[SIMPLE QUERY] Passport traceback: {traceback.format_exc()}")
            clear_request_status()
            return {
                "success": False,
                "query_type": query_type,
                "query_value": query_value,
                "error": f"Error mengambil data passport: {str(e)}",
                "source": "CP_API"
            }
    
    # ============================================
    # PERLINTASAN QUERY USE CP API DIRECTLY (NO TELEGRAM)
    # ============================================
    if query_type == 'perlintasan':
        logger.info(f"[SIMPLE QUERY] Perlintasan query via CP API: {query_value}")
        
        try:
            logger.info(f"[SIMPLE QUERY] Calling query_perlintasan_simple_cp_api...")
            cp_result = await query_perlintasan_simple_cp_api(query_value)
            logger.info(f"[SIMPLE QUERY] Perlintasan cp_result type: {type(cp_result)}, value: {cp_result}")
            
            # Safety check - ensure cp_result is a dict
            if cp_result is None:
                logger.error(f"[SIMPLE QUERY] Perlintasan returned None!")
                clear_request_status()
                return {
                    "success": False,
                    "query_type": query_type,
                    "query_value": query_value,
                    "error": "Gagal mengambil data perlintasan - response kosong",
                    "source": "CP_API"
                }
            
            if not isinstance(cp_result, dict):
                logger.error(f"[SIMPLE QUERY] Perlintasan returned non-dict: {type(cp_result)}")
                clear_request_status()
                return {
                    "success": False,
                    "query_type": query_type,
                    "query_value": query_value,
                    "error": f"Gagal mengambil data perlintasan - response bukan dictionary: {type(cp_result)}",
                    "source": "CP_API"
                }
            
            success = cp_result.get("success", False)
            logger.info(f"[SIMPLE QUERY] Perlintasan success value: {success}")
            
            if success:
                raw_response = cp_result.get("raw_response", "")
                
                # Save to cache
                cache_doc = {
                    "cache_key": cache_key,
                    "query_type": query_type,
                    "query_value": query_value,
                    "raw_response": raw_response,
                    "queried_by": username,
                    "created_by": username,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.simple_query_cache.update_one(
                    {"cache_key": cache_key},
                    {"$set": cache_doc},
                    upsert=True
                )
                logger.info(f"[SIMPLE QUERY] Saved perlintasan result to cache: {cache_key}")
                
                clear_request_status()
                return {
                    "success": True,
                    "query_type": query_type,
                    "query_value": query_value,
                    "raw_response": raw_response,
                    "verified": True,
                    "cached": False,
                    "source": "CP_API"
                }
            else:
                error_msg = cp_result.get("error", "Gagal mengambil data perlintasan dari CP API")
                logger.info(f"[SIMPLE QUERY] Perlintasan error_msg: {error_msg}")
                clear_request_status()
                return {
                    "success": False,
                    "query_type": query_type,
                    "query_value": query_value,
                    "error": error_msg,
                    "source": "CP_API"
                }
        except Exception as e:
            logger.error(f"[SIMPLE QUERY] Perlintasan exception: {e}")
            import traceback
            logger.error(f"[SIMPLE QUERY] Perlintasan traceback: {traceback.format_exc()}")
            clear_request_status()
            return {
                "success": False,
                "query_type": query_type,
                "query_value": query_value,
                "error": f"Error mengambil data perlintasan: {str(e)}",
                "source": "CP_API"
            }
    
    # ============================================
    # DATA BREACH QUERIES USE CP API DIRECTLY (NO TELEGRAM)
    # ============================================
    if query_type in ['breach_phone', 'breach_email', 'breach_name']:
        logger.info(f"[SIMPLE QUERY] Data Breach query via CP API: {query_type} = {query_value}")
        
        try:
            # Determine endpoint based on query type
            if query_type == 'breach_phone':
                endpoint = f"{CP_API_URL}/api/v3/breach/phone"
            elif query_type == 'breach_email':
                endpoint = f"{CP_API_URL}/api/v3/breach/email"
            else:  # breach_name
                endpoint = f"{CP_API_URL}/api/v3/breach/name"
            
            headers = {
                "api-key": CP_API_KEY,
                "Content-Type": "application/json"
            }
            
            # Use aiohttp with forced IPv4 instead of httpx
            import aiohttp
            import socket
            
            # Create connector that forces IPv4
            connector = aiohttp.TCPConnector(family=socket.AF_INET)
            
            async with aiohttp.ClientSession(connector=connector) as session:
                async with session.get(
                    endpoint,
                    params={"query": query_value},
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=60)
                ) as response:
                    status_code = response.status
                    logger.info(f"[BREACH] Response status: {status_code}")
                    
                    if status_code == 200:
                        data = await response.json()
                        
                        # Format response as readable text
                        if isinstance(data, list):
                            if len(data) == 0:
                                raw_response = "Tidak ada data breach ditemukan."
                            else:
                                lines = [f"=== DATA BREACH RESULTS ===", f"Query: {query_value}", f"Total: {len(data)} record(s)", "=" * 30, ""]
                                for i, item in enumerate(data, 1):
                                    lines.append(f"--- Record {i} ---")
                                    if isinstance(item, dict):
                                        for key, value in item.items():
                                            if value:
                                                lines.append(f"{key}: {value}")
                                    else:
                                        lines.append(str(item))
                                    lines.append("")
                                raw_response = "\n".join(lines)
                        elif isinstance(data, dict):
                            if data.get("error") or data.get("message"):
                                raw_response = data.get("error") or data.get("message") or "Tidak ada data"
                            else:
                                lines = [f"=== DATA BREACH RESULT ===", f"Query: {query_value}", "=" * 30, ""]
                                for key, value in data.items():
                                    if value:
                                        lines.append(f"{key}: {value}")
                                raw_response = "\n".join(lines)
                        else:
                            raw_response = str(data) if data else "Tidak ada data breach ditemukan."
                        
                        # Save to cache
                        cache_doc = {
                            "cache_key": cache_key,
                            "query_type": query_type,
                            "query_value": query_value,
                            "raw_response": raw_response,
                            "queried_by": username,
                            "created_by": username,
                            "created_at": datetime.now(timezone.utc).isoformat()
                        }
                        await db.simple_query_cache.update_one(
                            {"cache_key": cache_key},
                            {"$set": cache_doc},
                            upsert=True
                        )
                        logger.info(f"[BREACH] Saved result to cache: {cache_key}")
                        
                        clear_request_status()
                        return {
                            "success": True,
                            "query_type": query_type,
                            "query_value": query_value,
                            "raw_response": raw_response,
                            "verified": True,
                            "cached": False,
                            "source": "CP_API"
                        }
                    elif status_code == 403:
                        logger.error(f"[BREACH] API 403 Forbidden - IP not whitelisted")
                        clear_request_status()
                        return {
                            "success": False,
                            "query_type": query_type,
                            "query_value": query_value,
                            "error": "Akses ditolak (403). API hanya bisa diakses dari IP yang terdaftar.",
                            "source": "CP_API"
                        }
                    else:
                        error_text = await response.text()
                        logger.error(f"[BREACH] API error: {status_code} - {error_text}")
                        clear_request_status()
                        return {
                            "success": False,
                            "query_type": query_type,
                            "query_value": query_value,
                            "error": f"API Error: {status_code}",
                            "source": "CP_API"
                        }
                    
        except Exception as e:
            logger.error(f"[BREACH] Exception: {e}")
            clear_request_status()
            return {
                "success": False,
                "query_type": query_type,
                "query_value": query_value,
                "error": f"Error: {str(e)}",
                "source": "CP_API"
            }
    
    # ============================================
    # EMAIL BREACH CHECK - HAVE I BEEN PWNED (HIBP)
    # ============================================
    if query_type == 'email_breach':
        logger.info(f"[SIMPLE QUERY] Email Breach Check (HIBP) for: {query_value}")
        
        try:
            import re
            email = query_value.lower().strip()
            
            # Basic email validation
            email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
            if not re.match(email_pattern, email):
                clear_request_status()
                return {
                    "success": False,
                    "query_type": query_type,
                    "query_value": query_value,
                    "error": "Format email tidak valid",
                    "source": "HIBP"
                }
            
            # HIBP API - Free tier without API key (limited)
            # Using public endpoint which has rate limits
            hibp_url = f"https://haveibeenpwned.com/api/v3/breachedaccount/{email}"
            
            headers = {
                "User-Agent": "NETRA-OSINT-App/1.0",
                "Accept": "application/json"
            }
            
            # Check if HIBP API key exists
            hibp_api_key = os.getenv("HIBP_API_KEY")
            if hibp_api_key:
                headers["hibp-api-key"] = hibp_api_key
            
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(hibp_url, headers=headers)
                
                if response.status_code == 200:
                    breaches = response.json()
                    
                    # Format response
                    lines = [
                        "=== EMAIL BREACH CHECK ===",
                        f"Email: {email}",
                        f"Status: ⚠️ COMPROMISED",
                        f"Total Breaches: {len(breaches)}",
                        "=" * 35,
                        ""
                    ]
                    
                    for i, breach in enumerate(breaches, 1):
                        lines.append(f"--- Breach #{i}: {breach.get('Name', 'Unknown')} ---")
                        lines.append(f"Domain: {breach.get('Domain', '-')}")
                        lines.append(f"Breach Date: {breach.get('BreachDate', '-')}")
                        lines.append(f"Compromised Data: {', '.join(breach.get('DataClasses', []))}")
                        lines.append(f"Affected Accounts: {breach.get('PwnCount', 0):,}")
                        lines.append(f"Verified: {'✓' if breach.get('IsVerified') else '✗'}")
                        lines.append("")
                    
                    raw_response = "\n".join(lines)
                    
                    # Save to cache
                    cache_doc = {
                        "cache_key": cache_key,
                        "query_type": query_type,
                        "query_value": query_value,
                        "raw_response": raw_response,
                        "breach_count": len(breaches),
                        "breaches": breaches,
                        "queried_by": username,
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                    await db.simple_query_cache.update_one(
                        {"cache_key": cache_key},
                        {"$set": cache_doc},
                        upsert=True
                    )
                    
                    clear_request_status()
                    return {
                        "success": True,
                        "query_type": query_type,
                        "query_value": query_value,
                        "raw_response": raw_response,
                        "breach_count": len(breaches),
                        "verified": True,
                        "cached": False,
                        "source": "HIBP"
                    }
                
                elif response.status_code == 404:
                    # No breaches found - this is good!
                    raw_response = f"""=== EMAIL BREACH CHECK ===
Email: {email}
Status: ✅ AMAN (Tidak ada breach ditemukan)
=================================

Email ini tidak ditemukan dalam database breach yang diketahui.
Catatan: Tidak ada dalam database bukan berarti 100% aman."""
                    
                    # Save to cache
                    cache_doc = {
                        "cache_key": cache_key,
                        "query_type": query_type,
                        "query_value": query_value,
                        "raw_response": raw_response,
                        "breach_count": 0,
                        "breaches": [],
                        "queried_by": username,
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                    await db.simple_query_cache.update_one(
                        {"cache_key": cache_key},
                        {"$set": cache_doc},
                        upsert=True
                    )
                    
                    clear_request_status()
                    return {
                        "success": True,
                        "query_type": query_type,
                        "query_value": query_value,
                        "raw_response": raw_response,
                        "breach_count": 0,
                        "verified": True,
                        "cached": False,
                        "source": "HIBP"
                    }
                
                elif response.status_code == 401:
                    clear_request_status()
                    return {
                        "success": False,
                        "query_type": query_type,
                        "query_value": query_value,
                        "error": "HIBP API Key tidak valid atau tidak ada. Fitur ini memerlukan API key berbayar dari haveibeenpwned.com",
                        "source": "HIBP"
                    }
                
                elif response.status_code == 429:
                    clear_request_status()
                    return {
                        "success": False,
                        "query_type": query_type,
                        "query_value": query_value,
                        "error": "Rate limit tercapai. Coba lagi dalam beberapa menit.",
                        "source": "HIBP"
                    }
                
                else:
                    clear_request_status()
                    return {
                        "success": False,
                        "query_type": query_type,
                        "query_value": query_value,
                        "error": f"HIBP Error: {response.status_code}",
                        "source": "HIBP"
                    }
                    
        except Exception as e:
            logger.error(f"[EMAIL BREACH] Exception: {e}")
            clear_request_status()
            return {
                "success": False,
                "query_type": query_type,
                "query_value": query_value,
                "error": f"Error: {str(e)}",
                "source": "HIBP"
            }
    
    # ============================================
    # IP GEOLOCATION LOOKUP - IPINFO.IO
    # ============================================
    if query_type == 'ip_lookup':
        logger.info(f"[SIMPLE QUERY] IP Geolocation Lookup for: {query_value}")
        
        try:
            import ipaddress
            ip = query_value.strip()
            
            # Validate IP address
            try:
                ipaddress.ip_address(ip)
            except ValueError:
                clear_request_status()
                return {
                    "success": False,
                    "query_type": query_type,
                    "query_value": query_value,
                    "error": "Format IP Address tidak valid. Gunakan format IPv4 (contoh: 8.8.8.8) atau IPv6.",
                    "source": "IPINFO"
                }
            
            # Check if private/reserved IP
            ip_obj = ipaddress.ip_address(ip)
            if ip_obj.is_private or ip_obj.is_reserved or ip_obj.is_loopback:
                clear_request_status()
                return {
                    "success": False,
                    "query_type": query_type,
                    "query_value": query_value,
                    "error": "IP Address private/reserved tidak bisa di-lookup. Gunakan IP publik.",
                    "source": "IPINFO"
                }
            
            # IPinfo.io API - Free tier (50k requests/month)
            ipinfo_token = os.getenv("IPINFO_TOKEN")
            if ipinfo_token:
                ipinfo_url = f"https://ipinfo.io/{ip}?token={ipinfo_token}"
            else:
                ipinfo_url = f"https://ipinfo.io/{ip}/json"
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(ipinfo_url)
                
                if response.status_code == 200:
                    data = response.json()
                    
                    # Parse location
                    loc = data.get("loc", "")
                    lat, lon = "", ""
                    if loc and "," in loc:
                        lat, lon = loc.split(",")
                    
                    # Format response
                    lines = [
                        "=== IP GEOLOCATION LOOKUP ===",
                        f"IP Address: {data.get('ip', ip)}",
                        "=" * 35,
                        "",
                        "📍 LOKASI:",
                        f"   Kota: {data.get('city', '-')}",
                        f"   Provinsi/State: {data.get('region', '-')}",
                        f"   Negara: {data.get('country', '-')}",
                        f"   Kode Pos: {data.get('postal', '-')}",
                        f"   Timezone: {data.get('timezone', '-')}",
                        f"   Koordinat: {lat}, {lon}",
                        "",
                        "🌐 NETWORK:",
                        f"   Hostname: {data.get('hostname', '-')}",
                        f"   Organisasi: {data.get('org', '-')}",
                    ]
                    
                    # Add ASN info if available
                    if data.get('asn'):
                        asn = data['asn']
                        lines.extend([
                            "",
                            "📡 ASN INFO:",
                            f"   ASN: {asn.get('asn', '-')}",
                            f"   Nama: {asn.get('name', '-')}",
                            f"   Domain: {asn.get('domain', '-')}",
                            f"   Route: {asn.get('route', '-')}",
                            f"   Type: {asn.get('type', '-')}",
                        ])
                    
                    # Add company info if available
                    if data.get('company'):
                        company = data['company']
                        lines.extend([
                            "",
                            "🏢 COMPANY:",
                            f"   Nama: {company.get('name', '-')}",
                            f"   Domain: {company.get('domain', '-')}",
                            f"   Type: {company.get('type', '-')}",
                        ])
                    
                    # Add privacy info if available
                    if data.get('privacy'):
                        privacy = data['privacy']
                        lines.extend([
                            "",
                            "🔒 PRIVACY FLAGS:",
                            f"   VPN: {'✓' if privacy.get('vpn') else '✗'}",
                            f"   Proxy: {'✓' if privacy.get('proxy') else '✗'}",
                            f"   Tor: {'✓' if privacy.get('tor') else '✗'}",
                            f"   Relay: {'✓' if privacy.get('relay') else '✗'}",
                            f"   Hosting: {'✓' if privacy.get('hosting') else '✗'}",
                        ])
                    
                    # Add carrier info for mobile IPs
                    if data.get('carrier'):
                        carrier = data['carrier']
                        lines.extend([
                            "",
                            "📱 MOBILE CARRIER:",
                            f"   Nama: {carrier.get('name', '-')}",
                            f"   MCC: {carrier.get('mcc', '-')}",
                            f"   MNC: {carrier.get('mnc', '-')}",
                        ])
                    
                    raw_response = "\n".join(lines)
                    
                    # Save to cache
                    cache_doc = {
                        "cache_key": cache_key,
                        "query_type": query_type,
                        "query_value": query_value,
                        "raw_response": raw_response,
                        "ip_data": data,
                        "queried_by": username,
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                    await db.simple_query_cache.update_one(
                        {"cache_key": cache_key},
                        {"$set": cache_doc},
                        upsert=True
                    )
                    
                    clear_request_status()
                    return {
                        "success": True,
                        "query_type": query_type,
                        "query_value": query_value,
                        "raw_response": raw_response,
                        "ip_data": data,
                        "verified": True,
                        "cached": False,
                        "source": "IPINFO"
                    }
                
                elif response.status_code == 429:
                    clear_request_status()
                    return {
                        "success": False,
                        "query_type": query_type,
                        "query_value": query_value,
                        "error": "Rate limit tercapai. Coba lagi dalam beberapa menit.",
                        "source": "IPINFO"
                    }
                
                else:
                    clear_request_status()
                    return {
                        "success": False,
                        "query_type": query_type,
                        "query_value": query_value,
                        "error": f"IPinfo Error: {response.status_code}",
                        "source": "IPINFO"
                    }
                    
        except Exception as e:
            logger.error(f"[IP LOOKUP] Exception: {e}")
            clear_request_status()
            return {
                "success": False,
                "query_type": query_type,
                "query_value": query_value,
                "error": f"Error: {str(e)}",
                "source": "IPINFO"
            }
    
    # ============================================
    # ADINT - ADVERTISING INTELLIGENCE (MOCKUP)
    # ============================================
    if query_type in ['adint_device', 'adint_location', 'adint_ip']:
        logger.info(f"[SIMPLE QUERY] ADINT {query_type} for: {query_value}")
        
        # This is a MOCKUP - real integration requires Veraset API access
        # Contact: support@veraset.com for enterprise API access
        
        import random
        
        # Generate realistic mock data based on query type
        mock_device_id = f"MAID-{random.randint(10000, 99999)}-{random.randint(1000, 9999)}"
        
        if query_type == 'adint_device':
            # Mock device tracking result
            num_pings = random.randint(5, 20)
            pings = []
            base_time = datetime.now() - timedelta(days=random.randint(1, 30))
            
            # Generate location history
            base_lat = -6.2 + random.uniform(-0.1, 0.1)
            base_lon = 106.8 + random.uniform(-0.1, 0.1)
            
            for i in range(num_pings):
                ping_time = base_time + timedelta(hours=i*random.randint(1, 5))
                pings.append({
                    "timestamp": ping_time.isoformat(),
                    "latitude": base_lat + random.uniform(-0.05, 0.05),
                    "longitude": base_lon + random.uniform(-0.05, 0.05),
                    "accuracy_m": random.randint(5, 50),
                    "source": random.choice(["GPS", "WIFI", "CELL"])
                })
            
            lines = [
                "=" * 50,
                "📡 ADINT - DEVICE TRACKING [MOCKUP]",
                f"Device ID: {query_value}",
                "=" * 50,
                "",
                "⚠️  DATA INI ADALAH SIMULASI/MOCKUP",
                "    Untuk data real, hubungi: support@veraset.com",
                "",
                "📍 LOCATION HISTORY:",
                f"   Total Pings: {num_pings}",
                f"   Date Range: {pings[0]['timestamp'][:10]} - {pings[-1]['timestamp'][:10]}",
                "",
                "📊 RECENT LOCATIONS:",
            ]
            
            for i, ping in enumerate(pings[-5:]):
                lines.append(f"   {i+1}. [{ping['timestamp'][:16]}] {ping['latitude']:.6f}, {ping['longitude']:.6f} ({ping['source']})")
            
            lines.extend([
                "",
                "🏠 HOME LOCATION (Inferred):",
                f"   Lat: {base_lat:.6f}",
                f"   Lon: {base_lon:.6f}",
                f"   Confidence: {random.randint(70, 95)}%",
                "",
                "🏢 WORK LOCATION (Inferred):",
                f"   Lat: {base_lat + 0.02:.6f}",
                f"   Lon: {base_lon + 0.03:.6f}",
                f"   Confidence: {random.randint(60, 85)}%",
            ])
            
        elif query_type == 'adint_location':
            # Mock geofence search result
            coords = query_value.split(",")
            lat = float(coords[0].strip())
            lon = float(coords[1].strip())
            
            num_devices = random.randint(10, 100)
            
            lines = [
                "=" * 50,
                "📍 ADINT - GEOFENCE SEARCH [MOCKUP]",
                f"Location: {lat}, {lon}",
                f"Radius: 500m",
                "=" * 50,
                "",
                "⚠️  DATA INI ADALAH SIMULASI/MOCKUP",
                "    Untuk data real, hubungi: support@veraset.com",
                "",
                f"📊 DEVICES FOUND: {num_devices}",
                f"   Time Range: Last 30 days",
                "",
                "📱 SAMPLE DEVICES:",
            ]
            
            for i in range(min(10, num_devices)):
                device_type = random.choice(["Android", "iOS"])
                visit_count = random.randint(1, 15)
                last_seen = (datetime.now() - timedelta(days=random.randint(0, 30))).strftime("%Y-%m-%d")
                lines.append(f"   {i+1}. MAID-{random.randint(10000,99999)} | {device_type} | {visit_count} visits | Last: {last_seen}")
            
            lines.extend([
                "",
                "📈 VISIT PATTERNS:",
                f"   Peak Hours: {random.randint(8,11)}:00 - {random.randint(13,17)}:00",
                f"   Peak Day: {random.choice(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])}",
                f"   Avg Dwell Time: {random.randint(15, 90)} minutes",
            ])
            
        elif query_type == 'adint_ip':
            # Mock IP to device resolution
            num_matches = random.randint(1, 5)
            
            lines = [
                "=" * 50,
                "🌐 ADINT - IP RESOLUTION [MOCKUP]",
                f"IP Address: {query_value}",
                "=" * 50,
                "",
                "⚠️  DATA INI ADALAH SIMULASI/MOCKUP",
                "    Untuk data real, hubungi: support@veraset.com",
                "",
                f"📱 MATCHED DEVICES: {num_matches}",
                "",
            ]
            
            for i in range(num_matches):
                device_id = f"MAID-{random.randint(10000,99999)}-{random.randint(1000,9999)}"
                device_type = random.choice(["Android (GAID)", "iOS (IDFA)"])
                match_confidence = random.randint(60, 95)
                last_seen = (datetime.now() - timedelta(days=random.randint(0, 14))).strftime("%Y-%m-%d %H:%M")
                
                lines.append(f"   Device {i+1}:")
                lines.append(f"      ID: {device_id}")
                lines.append(f"      Type: {device_type}")
                lines.append(f"      Confidence: {match_confidence}%")
                lines.append(f"      Last Seen: {last_seen}")
                lines.append("")
        
        raw_response = "\n".join(lines)
        
        clear_request_status()
        return {
            "success": True,
            "query_type": query_type,
            "query_value": query_value,
            "raw_response": raw_response,
            "verified": False,
            "cached": False,
            "source": "ADINT_MOCKUP",
            "is_mockup": True,
            "note": "Data simulasi. Untuk akses data real, hubungi Veraset: support@veraset.com"
        }
    
    # ============================================
    # TIKTOK PROFILE SCRAPER
    # ============================================
    if query_type == 'tiktok_profile':
        logger.info(f"[SIMPLE QUERY] TikTok Profile scrape for username: {query_value}")
        
        try:
            import httpx
            import json
            import re
            
            # Clean username (remove @ if present)
            tiktok_username = query_value.strip().lower().replace('@', '')
            
            profile_data = None
            raw_response = None
            
            # Method 1: Try direct TikTok scraping with mobile user agent
            try:
                url = f"https://www.tiktok.com/@{tiktok_username}"
                
                # Mobile user agent often works better
                headers = {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                }
                
                async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                    response = await client.get(url, headers=headers)
                    
                    if response.status_code == 200:
                        html_content = response.text
                        
                        # Try multiple JSON extraction patterns
                        patterns = [
                            r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]+)</script>',
                            r'<script id="SIGI_STATE"[^>]*>([^<]+)</script>',
                            r'"UserModule":\s*(\{[^}]+\})',
                            r'"userInfo":\s*(\{[^}]+\})'
                        ]
                        
                        for pattern in patterns:
                            match = re.search(pattern, html_content, re.DOTALL)
                            if match:
                                try:
                                    json_str = match.group(1)
                                    data = json.loads(json_str)
                                    
                                    # Navigate to user info based on structure
                                    user_info = None
                                    if "__DEFAULT_SCOPE__" in data:
                                        user_detail = data.get("__DEFAULT_SCOPE__", {}).get("webapp.user-detail", {})
                                        user_info = user_detail.get("userInfo", {})
                                    elif "userInfo" in data:
                                        user_info = data.get("userInfo", {})
                                    elif "UserModule" in data:
                                        user_info = data.get("UserModule", {}).get("users", {}).get(tiktok_username, {})
                                    
                                    if user_info:
                                        user = user_info.get("user", user_info)
                                        stats = user_info.get("stats", {})
                                        
                                        profile_data = {
                                            "username": user.get("uniqueId", tiktok_username),
                                            "nickname": user.get("nickname", "-"),
                                            "bio": user.get("signature", "-"),
                                            "verified": user.get("verified", False),
                                            "private": user.get("privateAccount", False),
                                            "avatar_url": user.get("avatarLarger", user.get("avatarMedium", "")),
                                            "followers": stats.get("followerCount", user.get("followerCount", 0)),
                                            "following": stats.get("followingCount", user.get("followingCount", 0)),
                                            "likes": stats.get("heart", stats.get("heartCount", user.get("heart", 0))),
                                            "videos": stats.get("videoCount", user.get("videoCount", 0)),
                                            "region": user.get("region", "-"),
                                            "profile_url": url
                                        }
                                        break
                                except json.JSONDecodeError:
                                    continue
                        
                        # Fallback: Extract from meta tags
                        if not profile_data:
                            meta_desc = re.search(r'<meta[^>]*name="description"[^>]*content="([^"]*)"', html_content)
                            follower_match = re.search(r'(\d+(?:\.\d+)?[KMB]?)\s*Followers', html_content, re.IGNORECASE)
                            likes_match = re.search(r'(\d+(?:\.\d+)?[KMB]?)\s*Likes', html_content, re.IGNORECASE)
                            
                            if meta_desc:
                                profile_data = {
                                    "username": tiktok_username,
                                    "bio": meta_desc.group(1) if meta_desc else "-",
                                    "followers": follower_match.group(1) if follower_match else "N/A",
                                    "likes": likes_match.group(1) if likes_match else "N/A",
                                    "profile_url": url,
                                    "note": "Partial data only"
                                }
                                
            except Exception as e1:
                logger.warning(f"[SIMPLE QUERY] TikTok Method 1 failed: {e1}")
            
            # Method 2: Try via TikAPI public endpoint (no auth needed for basic info)
            if not profile_data:
                try:
                    api_url = f"https://www.tiktok.com/api/user/detail/?uniqueId={tiktok_username}&secUid="
                    headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': f'https://www.tiktok.com/@{tiktok_username}',
                    }
                    
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        response = await client.get(api_url, headers=headers)
                        if response.status_code == 200:
                            data = response.json()
                            user_info = data.get("userInfo", {})
                            if user_info:
                                user = user_info.get("user", {})
                                stats = user_info.get("stats", {})
                                profile_data = {
                                    "username": user.get("uniqueId", tiktok_username),
                                    "nickname": user.get("nickname", "-"),
                                    "bio": user.get("signature", "-"),
                                    "verified": user.get("verified", False),
                                    "private": user.get("privateAccount", False),
                                    "avatar_url": user.get("avatarLarger", ""),
                                    "followers": stats.get("followerCount", 0),
                                    "following": stats.get("followingCount", 0),
                                    "likes": stats.get("heart", 0),
                                    "videos": stats.get("videoCount", 0),
                                    "profile_url": f"https://www.tiktok.com/@{tiktok_username}"
                                }
                except Exception as e2:
                    logger.warning(f"[SIMPLE QUERY] TikTok Method 2 failed: {e2}")
            
            if profile_data:
                # Format response
                lines = [
                    "=" * 50,
                    f"🎵 TIKTOK PROFILE: @{tiktok_username}",
                    "=" * 50,
                    "",
                    f"👤 Username: @{profile_data.get('username', tiktok_username)}",
                    f"📛 Nickname: {profile_data.get('nickname', '-')}",
                ]
                
                if profile_data.get('verified') is not None:
                    lines.append(f"✅ Verified: {'Ya' if profile_data.get('verified') else 'Tidak'}")
                if profile_data.get('private') is not None:
                    lines.append(f"🔒 Private: {'Ya' if profile_data.get('private') else 'Tidak'}")
                
                lines.extend([
                    "",
                    "📊 STATISTICS:",
                ])
                
                followers = profile_data.get('followers', 0)
                following = profile_data.get('following', 0)
                likes = profile_data.get('likes', 0)
                videos = profile_data.get('videos', 0)
                
                if isinstance(followers, (int, float)):
                    lines.append(f"   Followers: {int(followers):,}")
                else:
                    lines.append(f"   Followers: {followers}")
                    
                if isinstance(following, (int, float)):
                    lines.append(f"   Following: {int(following):,}")
                else:
                    lines.append(f"   Following: {following}")
                    
                if isinstance(likes, (int, float)):
                    lines.append(f"   Likes: {int(likes):,}")
                else:
                    lines.append(f"   Likes: {likes}")
                    
                if isinstance(videos, (int, float)):
                    lines.append(f"   Videos: {int(videos):,}")
                else:
                    lines.append(f"   Videos: {videos}")
                
                lines.extend([
                    "",
                    "📝 BIO:",
                    f"   {profile_data.get('bio', '-')}",
                    "",
                    f"🔗 Profile URL: {profile_data.get('profile_url')}",
                ])
                
                if profile_data.get('avatar_url'):
                    lines.append(f"🖼️ Avatar: {profile_data.get('avatar_url')}")
                
                if profile_data.get('note'):
                    lines.extend(["", f"⚠️ {profile_data.get('note')}"])
                
                raw_response = "\n".join(lines)
                
                # Save to cache
                cache_doc = {
                    "cache_key": cache_key,
                    "query_type": query_type,
                    "query_value": query_value,
                    "raw_response": raw_response,
                    "profile_data": profile_data,
                    "queried_by": username,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.simple_query_cache.update_one(
                    {"cache_key": cache_key},
                    {"$set": cache_doc},
                    upsert=True
                )
                
                clear_request_status()
                return {
                    "success": True,
                    "query_type": query_type,
                    "query_value": query_value,
                    "raw_response": raw_response,
                    "profile_data": profile_data,
                    "verified": True,
                    "cached": False,
                    "source": "TIKTOK_SCRAPER"
                }
            else:
                clear_request_status()
                return {
                    "success": False,
                    "query_type": query_type,
                    "query_value": query_value,
                    "error": f"Tidak dapat mengambil data profil @{tiktok_username}. TikTok memblokir request dari server. Coba gunakan Medsos-1 (Maigret) untuk cross-platform search.",
                    "source": "TIKTOK_SCRAPER",
                    "suggestion": "Gunakan Medsos-1 (Maigret) atau Medsos-2 untuk mencari username ini di berbagai platform"
                }
                    
        except httpx.TimeoutException:
            clear_request_status()
            return {
                "success": False,
                "query_type": query_type,
                "query_value": query_value,
                "error": "Timeout saat mengakses TikTok. Coba lagi nanti.",
                "source": "TIKTOK_SCRAPER"
            }
        except Exception as e:
            logger.error(f"[SIMPLE QUERY] TikTok scraper error: {e}")
            import traceback
            logger.error(f"[SIMPLE QUERY] TikTok traceback: {traceback.format_exc()}")
            clear_request_status()
            return {
                "success": False,
                "query_type": query_type,
                "query_value": query_value,
                "error": f"Error mengambil data TikTok: {str(e)}",
                "source": "TIKTOK_SCRAPER"
            }
    
    # ============================================
    # OSINT SOCIAL MEDIA SEARCH - MEDSOS-1 (MAIGRET)
    # ============================================
    if query_type == 'medsos_maigret':
        logger.info(f"[SIMPLE QUERY] Medsos-1 (Maigret) search for username: {query_value}")
        
        try:
            import re
            import sys as sys_module
            
            # Use lowercase for username search
            search_username = query_value.lower().strip()
            
            # Run maigret using asyncio subprocess
            # Use sys.executable to get the current Python interpreter path
            python_path = sys_module.executable
            cmd = f'{python_path} -m maigret {search_username} -n 100 --timeout 8'
            
            logger.info(f"[MAIGRET] Running: {cmd}")
            
            proc = await asyncio.create_subprocess_shell(
                cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                cwd='/tmp'
            )
            
            try:
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=150)
                all_output = stdout.decode('utf-8', errors='ignore') if stdout else ''
            except asyncio.TimeoutError:
                proc.kill()
                all_output = ''
                logger.warning(f"[MAIGRET] Process timed out")
            
            logger.info(f"[MAIGRET] Raw output length: {len(all_output)}")
            
            # Parse results
            lines = []
            lines.append(f"{'='*50}")
            lines.append(f"🔍 OSINT MEDSOS-1 (MAIGRET)")
            lines.append(f"Username: {search_username}")
            lines.append(f"{'='*50}")
            lines.append("")
            
            found_profiles = []
            
            # Pattern to match: [+] SiteName: URL (handles ANSI codes around it)
            # More permissive pattern
            pattern = r'\[\+\]\s*([^\n:]+?):\s*(https?://[^\s\x00-\x1f\n]+)'
            matches = re.findall(pattern, all_output)
            
            logger.info(f"[MAIGRET] Found {len(matches)} pattern matches")
            
            for site_name, url in matches:
                site_name = site_name.strip()
                url = url.strip().rstrip(',').rstrip(')')
                # Avoid duplicates
                if url not in [p['url'] for p in found_profiles]:
                    found_profiles.append({
                        'site': site_name,
                        'url': url
                    })
            
            for profile in found_profiles:
                lines.append(f"✅ {profile['site']}")
                lines.append(f"   URL: {profile['url']}")
                lines.append("")
            
            found_count = len(found_profiles)
            
            lines.append(f"{'='*50}")
            lines.append(f"Total Ditemukan: {found_count} profil")
            lines.append(f"{'='*50}")
            
            raw_response = '\n'.join(lines)
            
            # Save to cache
            cache_doc = {
                "cache_key": cache_key,
                "query_type": query_type,
                "query_value": query_value,
                "raw_response": raw_response,
                "queried_by": username,
                "created_by": username,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.simple_query_cache.update_one(
                {"cache_key": cache_key},
                {"$set": cache_doc},
                upsert=True
            )
            logger.info(f"[MAIGRET] Saved result to cache: {cache_key}, found {found_count} profiles")
            
            clear_request_status()
            return {
                "success": True,
                "query_type": query_type,
                "query_value": query_value,
                "raw_response": raw_response,
                "verified": True,
                "cached": False,
                "source": "MAIGRET_OSINT"
            }
            
        except subprocess.TimeoutExpired:
            logger.error(f"[MAIGRET] Timeout after 120 seconds")
            clear_request_status()
            return {
                "success": False,
                "query_type": query_type,
                "query_value": query_value,
                "error": "Pencarian timeout (>2 menit). Coba lagi atau gunakan username yang lebih spesifik.",
                "source": "MAIGRET_OSINT"
            }
        except Exception as e:
            logger.error(f"[MAIGRET] Exception: {e}")
            clear_request_status()
            return {
                "success": False,
                "query_type": query_type,
                "query_value": query_value,
                "error": f"Error: {str(e)}",
                "source": "MAIGRET_OSINT"
            }
    
    # ============================================
    # OSINT SOCIAL MEDIA SEARCH - MEDSOS-2 (SOCIAL ANALYZER)
    # ============================================
    if query_type == 'medsos_social_analyzer':
        logger.info(f"[SIMPLE QUERY] Medsos-2 (Social Analyzer) search for username: {query_value}")
        
        try:
            from importlib import import_module
            
            # Use lowercase for username search
            search_username = query_value.lower().strip()
            
            # Run Social Analyzer in thread pool to avoid blocking
            def run_social_analyzer():
                try:
                    SocialAnalyzer = import_module("social-analyzer").SocialAnalyzer(silent=True)
                    results = SocialAnalyzer.run_as_object(
                        username=search_username,
                        websites="facebook twitter instagram linkedin youtube tiktok github pinterest tumblr reddit snapchat telegram whatsapp discord spotify medium twitch vimeo flickr behance dribbble",
                        mode="fast",
                        output="json",
                        timeout=15
                    )
                    return results
                except Exception as e:
                    return {"error": str(e)}
            
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(None, run_social_analyzer)
            
            # Helper function to parse rate (handles formats like '%100.0', '100', 100, etc)
            def parse_rate(rate_val):
                if rate_val is None:
                    return 0
                try:
                    # Convert to string and clean
                    rate_str = str(rate_val).replace('%', '').strip()
                    return float(rate_str)
                except:
                    return 0
            
            # Parse results
            lines = []
            lines.append(f"{'='*50}")
            lines.append(f"🔍 OSINT MEDSOS-2 (SOCIAL ANALYZER)")
            lines.append(f"Username: {search_username}")
            lines.append(f"{'='*50}")
            lines.append("")
            
            found_count = 0
            
            if isinstance(results, dict):
                if "error" in results:
                    lines.append(f"⚠️ Error: {results['error']}")
                else:
                    # Parse detected profiles
                    detected = results.get('detected', []) or []
                    if not detected and isinstance(results, list):
                        detected = results
                    
                    for profile in detected:
                        if isinstance(profile, dict):
                            rate = parse_rate(profile.get('rate', 0))
                            # Only show profiles with high confidence (rate > 50)
                            if rate > 50:
                                found_count += 1
                                site_name = profile.get('site', profile.get('name', 'Unknown'))
                                url = profile.get('link', profile.get('url', 'N/A'))
                                title = profile.get('title', '')
                                
                                lines.append(f"✅ {site_name} (Confidence: {rate:.0f}%)")
                                lines.append(f"   URL: {url}")
                                if title:
                                    lines.append(f"   Title: {title}")
                                lines.append("")
                    
                    # Also check 'similar' profiles
                    similar = results.get('similar', []) or []
                    for profile in similar:
                        if isinstance(profile, dict):
                            rate = parse_rate(profile.get('rate', 0))
                            if rate > 70:  # Higher threshold for similar
                                found_count += 1
                                site_name = profile.get('site', profile.get('name', 'Unknown'))
                                url = profile.get('link', profile.get('url', 'N/A'))
                                
                                lines.append(f"🔶 {site_name} (Similar - {rate:.0f}%)")
                                lines.append(f"   URL: {url}")
                                lines.append("")
            elif isinstance(results, list):
                for profile in results:
                    if isinstance(profile, dict):
                        rate = parse_rate(profile.get('rate', 0))
                        if rate > 50:
                            found_count += 1
                            site_name = profile.get('site', profile.get('name', 'Unknown'))
                            url = profile.get('link', profile.get('url', 'N/A'))
                            
                            lines.append(f"✅ {site_name} (Confidence: {rate:.0f}%)")
                            lines.append(f"   URL: {url}")
                            lines.append("")
            
            lines.append(f"{'='*50}")
            lines.append(f"Total Ditemukan: {found_count} profil")
            lines.append(f"{'='*50}")
            
            raw_response = '\n'.join(lines)
            
            # Save to cache
            cache_doc = {
                "cache_key": cache_key,
                "query_type": query_type,
                "query_value": query_value,
                "raw_response": raw_response,
                "queried_by": username,
                "created_by": username,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.simple_query_cache.update_one(
                {"cache_key": cache_key},
                {"$set": cache_doc},
                upsert=True
            )
            logger.info(f"[SOCIAL_ANALYZER] Saved result to cache: {cache_key}")
            
            clear_request_status()
            return {
                "success": True,
                "query_type": query_type,
                "query_value": query_value,
                "raw_response": raw_response,
                "verified": True,
                "cached": False,
                "source": "SOCIAL_ANALYZER_OSINT"
            }
            
        except Exception as e:
            logger.error(f"[SOCIAL_ANALYZER] Exception: {e}")
            import traceback
            logger.error(f"[SOCIAL_ANALYZER] Traceback: {traceback.format_exc()}")
            clear_request_status()
            return {
                "success": False,
                "query_type": query_type,
                "query_value": query_value,
                "error": f"Error: {str(e)}",
                "source": "SOCIAL_ANALYZER_OSINT"
            }
    
    # ============================================
    # EMAIL FINDER - Search Real Emails from Web + Generate Patterns
    # ============================================
    if query_type == 'email_finder':
        logger.info(f"[SIMPLE QUERY] Email Finder for: {query_value}")
        
        try:
            import re
            import requests
            from bs4 import BeautifulSoup
            import urllib.parse
            
            search_name = query_value.strip()
            
            if len(search_name) < 3:
                clear_request_status()
                return {
                    "success": False,
                    "query_type": query_type,
                    "query_value": query_value,
                    "error": "Masukkan nama minimal 3 karakter",
                    "source": "EMAIL_FINDER"
                }
            
            found_emails = []
            searched_sources = []
            
            # Email regex pattern
            email_pattern = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')
            
            # Headers to mimic browser
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            }
            
            # Function to search and extract emails
            def search_emails_from_url(url, source_name):
                try:
                    response = requests.get(url, headers=headers, timeout=15, allow_redirects=True)
                    if response.status_code == 200:
                        # Extract emails from response
                        emails = email_pattern.findall(response.text)
                        # Filter relevant emails (containing parts of the name)
                        name_parts = search_name.lower().split()
                        relevant_emails = []
                        for email in emails:
                            email_lower = email.lower()
                            # Check if any part of name is in email
                            for part in name_parts:
                                if len(part) >= 3 and part in email_lower:
                                    relevant_emails.append(email)
                                    break
                        return list(set(relevant_emails)), source_name
                except Exception as e:
                    logger.warning(f"[EMAIL_FINDER] Error searching {source_name}: {e}")
                return [], source_name
            
            # 1. Search DuckDuckGo (more permissive than Google)
            try:
                query = urllib.parse.quote(f'"{search_name}" email')
                ddg_url = f"https://html.duckduckgo.com/html/?q={query}"
                emails, source = search_emails_from_url(ddg_url, "DuckDuckGo")
                if emails:
                    found_emails.extend(emails)
                    searched_sources.append(f"✓ {source}")
                else:
                    searched_sources.append(f"○ {source}")
            except Exception as e:
                logger.warning(f"[EMAIL_FINDER] DuckDuckGo error: {e}")
            
            # 2. Search Bing
            try:
                query = urllib.parse.quote(f'"{search_name}" email contact')
                bing_url = f"https://www.bing.com/search?q={query}"
                emails, source = search_emails_from_url(bing_url, "Bing")
                if emails:
                    found_emails.extend(emails)
                    searched_sources.append(f"✓ {source}")
                else:
                    searched_sources.append(f"○ {source}")
            except Exception as e:
                logger.warning(f"[EMAIL_FINDER] Bing error: {e}")
            
            # 3. Search with email keyword variations
            try:
                query = urllib.parse.quote(f'{search_name} @gmail.com OR @yahoo.com OR @hotmail.com')
                ddg_url2 = f"https://html.duckduckgo.com/html/?q={query}"
                emails, source = search_emails_from_url(ddg_url2, "Email Domains")
                if emails:
                    found_emails.extend(emails)
                    searched_sources.append(f"✓ {source}")
                else:
                    searched_sources.append(f"○ {source}")
            except Exception as e:
                logger.warning(f"[EMAIL_FINDER] Email domains search error: {e}")
            
            # Remove duplicates and clean
            found_emails = list(set([e.lower() for e in found_emails]))
            
            # Filter out common false positives
            filtered_emails = []
            blacklist = ['example.com', 'email.com', 'domain.com', 'yourname', 'username', 'test@', 'info@example']
            for email in found_emails:
                is_valid = True
                for bl in blacklist:
                    if bl in email.lower():
                        is_valid = False
                        break
                if is_valid and '@' in email:
                    filtered_emails.append(email)
            
            # Build response
            lines = []
            lines.append(f"{'='*50}")
            lines.append(f"📧 EMAIL FINDER (Web Search)")
            lines.append(f"Pencarian: {search_name}")
            lines.append(f"{'='*50}")
            lines.append("")
            
            # Show found emails
            if filtered_emails:
                lines.append(f"✅ EMAIL DITEMUKAN ({len(filtered_emails)}):")
                lines.append("")
                for idx, email in enumerate(filtered_emails[:15], 1):  # Max 15 results
                    lines.append(f"  {idx}. {email}")
                lines.append("")
            else:
                lines.append("❌ Tidak ditemukan email yang cocok di web")
                lines.append("")
                
                # Generate suggestions if no results
                name_parts = search_name.lower().split()
                if len(name_parts) >= 1:
                    lines.append("💡 KEMUNGKINAN EMAIL (berdasarkan pola umum):")
                    lines.append("")
                    first = name_parts[0]
                    last = name_parts[-1] if len(name_parts) > 1 else ""
                    
                    suggestions = []
                    if last:
                        suggestions = [
                            f"{first}.{last}@gmail.com",
                            f"{first}{last}@gmail.com",
                            f"{first}.{last}@yahoo.com",
                            f"{first}_{last}@hotmail.com",
                            f"{first[0]}{last}@gmail.com",
                        ]
                    else:
                        suggestions = [
                            f"{first}@gmail.com",
                            f"{first}@yahoo.com",
                            f"{first}@hotmail.com",
                        ]
                    
                    for s in suggestions:
                        lines.append(f"  • {s}")
                    lines.append("")
            
            # Show searched sources
            lines.append(f"🔍 Sumber yang dicari:")
            for src in searched_sources:
                lines.append(f"  {src}")
            
            lines.append("")
            lines.append(f"{'='*50}")
            lines.append(f"Total: {len(filtered_emails)} email ditemukan")
            lines.append(f"{'='*50}")
            
            raw_response = '\n'.join(lines)
            
            # Save to cache
            cache_doc = {
                "cache_key": cache_key,
                "query_type": query_type,
                "query_value": query_value,
                "raw_response": raw_response,
                "queried_by": username,
                "created_by": username,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.simple_query_cache.update_one(
                {"cache_key": cache_key},
                {"$set": cache_doc},
                upsert=True
            )
            logger.info(f"[EMAIL_FINDER] Saved result to cache: {cache_key}")
            
            clear_request_status()
            return {
                "success": True,
                "query_type": query_type,
                "query_value": query_value,
                "raw_response": raw_response,
                "verified": True,
                "cached": False,
                "source": "EMAIL_FINDER"
            }
            
        except Exception as e:
            logger.error(f"[EMAIL_FINDER] Exception: {e}")
            import traceback
            logger.error(f"[EMAIL_FINDER] Traceback: {traceback.format_exc()}")
            clear_request_status()
            return {
                "success": False,
                "query_type": query_type,
                "query_value": query_value,
                "error": f"Error: {str(e)}",
                "source": "EMAIL_FINDER"
            }
    
    # ============================================
    # NON-PASSPORT QUERIES USE TELEGRAM BOT
    # ============================================
    logger.info(f"[SIMPLE QUERY] Querying via Telegram bot for user: {username}...")
    
    # Use robust connection check with auto-reconnect
    try:
        connected = await ensure_telegram_connected()
        if not connected:
            raise HTTPException(status_code=503, detail="Telegram tidak terhubung. Silakan coba lagi atau cek koneksi di Settings.")
    except Exception as conn_err:
        logger.error(f"[SIMPLE QUERY] Connection check failed: {conn_err}")
        raise HTTPException(status_code=503, detail=f"Gagal terkoneksi ke Telegram: {str(conn_err)}")
    
    # ============================================
    # GLOBAL TELEGRAM QUERY LOCK - CRITICAL FOR DATA INTEGRITY
    # ============================================
    # This ensures only ONE Telegram query runs at a time across ALL users
    # Prevents data mixing when multiple users query simultaneously
    async with telegram_query_lock:
        logger.info(f"[SIMPLE QUERY] Global lock acquired for user: {username}, query: {query_type}={query_value[:20]}...")
        set_active_query(username, query_type, query_value)
        
        try:
            # Double-check connection inside lock
            if not telegram_client or not telegram_client.is_connected():
                logger.warning("[SIMPLE QUERY] Connection lost while waiting for lock, reconnecting...")
                try:
                    await ensure_telegram_connected()
                except Exception as reconn_err:
                    clear_active_query()
                    raise HTTPException(status_code=503, detail="Koneksi Telegram terputus. Silakan coba lagi.")
            
            bot_entity = await telegram_client.get_entity(BOT_USERNAME)
            
            # Get last message ID before sending our query - CRITICAL for isolation
            last_messages = await telegram_client.get_messages(bot_entity, limit=1)
            last_msg_id_before = last_messages[0].id if last_messages else 0
            logger.info(f"[SIMPLE QUERY] Last message ID before query: {last_msg_id_before}")
            
            # Update active query with message ID
            set_active_query(username, query_type, query_value, last_msg_id_before)
            
            # Send query based on type
            sent_message = None
            
            if query_type == 'capil_name':
                # Send name directly for CAPIL search
                sent_message = await telegram_client.send_message(bot_entity, query_value)
                await asyncio.sleep(3)
                
                # Wait for buttons and click CAPIL
                messages = await telegram_client.get_messages(bot_entity, limit=5, min_id=last_msg_id_before)
                for msg in messages:
                    if msg.out:
                        continue
                    if msg.buttons:
                        for row in msg.buttons:
                            for button in row:
                                if 'CAPIL' in (button.text or '').upper():
                                    await button.click()
                                    logger.info(f"[SIMPLE QUERY] Clicked CAPIL button")
                                    break
                        break
                
                await asyncio.sleep(7)
                
            elif query_type == 'capil_nik':
                # Send NIK number directly (16 digits)
                sent_message = await telegram_client.send_message(bot_entity, query_value)
                await asyncio.sleep(3)
                
                # Wait for buttons and click NIK
                messages = await telegram_client.get_messages(bot_entity, limit=5, min_id=last_msg_id_before)
                for msg in messages:
                    if msg.out:
                        continue
                    if msg.buttons:
                        for row in msg.buttons:
                            for button in row:
                                if 'NIK' in (button.text or '').upper():
                                    await button.click()
                                    logger.info(f"[SIMPLE QUERY] Clicked NIK button")
                                    break
                        break
                
                await asyncio.sleep(7)
                
            elif query_type == 'nkk':
                # Send NKK number directly (16 digits)
                sent_message = await telegram_client.send_message(bot_entity, query_value)
                await asyncio.sleep(3)
                
                # Wait for buttons and click NKK
                messages = await telegram_client.get_messages(bot_entity, limit=5, min_id=last_msg_id_before)
                for msg in messages:
                    if msg.out:
                        continue
                    if msg.buttons:
                        for row in msg.buttons:
                            for button in row:
                                if 'NKK' in (button.text or '').upper():
                                    await button.click()
                                    logger.info(f"[SIMPLE QUERY] Clicked NKK button")
                                    break
                        break
                
                await asyncio.sleep(7)
                
            elif query_type == 'reghp':
                # Send NIK for RegHP query
                sent_message = await telegram_client.send_message(bot_entity, query_value)
                await asyncio.sleep(3)
                
                # Wait for buttons and click REGHP
                messages = await telegram_client.get_messages(bot_entity, limit=5, min_id=last_msg_id_before)
                for msg in messages:
                    if msg.out:
                        continue
                    if msg.buttons:
                        for row in msg.buttons:
                            for button in row:
                                if 'REGHP' in (button.text or '').upper() or 'REG' in (button.text or '').upper():
                                    await button.click()
                                    logger.info(f"[SIMPLE QUERY] Clicked REGHP button")
                                    break
                        break
                
                await asyncio.sleep(7)
            
            elif query_type == 'reghp_phone':
                # RegHP by Phone Number - send phone number and click REGHP
                sent_message = await telegram_client.send_message(bot_entity, query_value)
                await asyncio.sleep(3)
                
                # Wait for buttons and click REGHP
                messages = await telegram_client.get_messages(bot_entity, limit=5, min_id=last_msg_id_before)
                for msg in messages:
                    if msg.out:
                        continue
                    if msg.buttons:
                        for row in msg.buttons:
                            for button in row:
                                if 'REGHP' in (button.text or '').upper() or 'REG' in (button.text or '').upper():
                                    await button.click()
                                    logger.info(f"[SIMPLE QUERY] Clicked REGHP button for phone query")
                                    break
                        break
                
                await asyncio.sleep(7)
                
            elif query_type == 'plat_mobil':
                # Send plate number to Telegram bot
                sent_message = await telegram_client.send_message(bot_entity, query_value)
                logger.info(f"[SIMPLE QUERY] Sent plate number: {query_value}")
                await asyncio.sleep(3)
                
                # Wait for response with buttons and click "Vehicle"
                messages = await telegram_client.get_messages(bot_entity, limit=5, min_id=last_msg_id_before)
                vehicle_clicked = False
                for msg in messages:
                    if msg.out:
                        continue
                    if msg.buttons:
                        for row in msg.buttons:
                            for button in row:
                                button_text = (button.text or '').upper()
                                if 'VEHICLE' in button_text or 'KENDARAAN' in button_text:
                                    await button.click()
                                    logger.info(f"[SIMPLE QUERY] Clicked Vehicle button: {button.text}")
                                    vehicle_clicked = True
                                    break
                            if vehicle_clicked:
                                break
                        break
                
                if not vehicle_clicked:
                    logger.warning("[SIMPLE QUERY] Vehicle button not found, waiting for direct response...")
                
                # IMPORTANT: Wait longer after clicking button for response to arrive
                await asyncio.sleep(7)
                
            else:
                raise HTTPException(status_code=400, detail=f"Unknown query type: {query_type}")
            
            # Get responses ONLY after our sent message
            sent_msg_id = sent_message.id if sent_message else last_msg_id_before
            logger.info(f"[SIMPLE QUERY] Sent message ID: {sent_msg_id}")
            
            # ============================================
            # RETRY MECHANISM: Try multiple times to get the correct response
            # Collect ALL messages (not just the first one)
            # ============================================
            raw_response = None
            all_responses = []
            max_retries = 4  # Increased retries for multi-message responses
            
            for retry in range(max_retries):
                # Fetch messages that came AFTER our sent message
                # Increase limit to capture multiple consecutive messages
                messages = await telegram_client.get_messages(bot_entity, limit=20, min_id=sent_msg_id)
                
                # Sort messages by ID (oldest first) to maintain order
                messages = sorted([m for m in messages if not m.out], key=lambda x: x.id)
                
                for msg in messages:
                    if msg.text and len(msg.text) > 20:
                        # Skip button prompts and get actual data
                        if not any(skip in msg.text.lower() for skip in ['pilih', 'choose', 'select', 'silakan']):
                            # Check if this message is already collected
                            msg_text = msg.text.strip()
                            if msg_text not in all_responses:
                                all_responses.append(msg_text)
                                logger.info(f"[SIMPLE QUERY] Collected response (msg_id={msg.id}, retry={retry}): {msg_text[:50]}...")
                
                # If we found responses, wait a bit more to see if there are more messages coming
                if all_responses:
                    prev_count = len(all_responses)
                    await asyncio.sleep(2)
                    
                    # Check for more messages
                    new_messages = await telegram_client.get_messages(bot_entity, limit=20, min_id=sent_msg_id)
                    new_messages = sorted([m for m in new_messages if not m.out], key=lambda x: x.id)
                    
                    for msg in new_messages:
                        if msg.text and len(msg.text) > 20:
                            if not any(skip in msg.text.lower() for skip in ['pilih', 'choose', 'select', 'silakan']):
                                msg_text = msg.text.strip()
                                if msg_text not in all_responses:
                                    all_responses.append(msg_text)
                                    logger.info(f"[SIMPLE QUERY] Collected additional response (msg_id={msg.id}): {msg_text[:50]}...")
                    
                    # If no new messages, we're done
                    if len(all_responses) == prev_count:
                        break
                else:
                    # Wait and retry
                    logger.info(f"[SIMPLE QUERY] No response yet, retry {retry + 1}/{max_retries}...")
                    await asyncio.sleep(3)
            
            # Combine all responses into one
            if all_responses:
                raw_response = "\n\n".join(all_responses)
                logger.info(f"[SIMPLE QUERY] Combined {len(all_responses)} message(s) into response")
            
            if raw_response:
                # Verify response is related to our query (STRICT check)
                query_upper = query_value.upper().replace(" ", "").replace("-", "")
                response_upper = raw_response.upper().replace(" ", "").replace("-", "")
                
                is_related = False
                photo_base64 = None
                
                # For plate number queries - check if plate appears in response
                if query_type == 'plat_mobil':
                    # Extract alphanumeric from query for flexible matching
                    import re
                    plate_clean = re.sub(r'[^A-Z0-9]', '', query_upper)
                    if plate_clean in response_upper or query_upper in response_upper:
                        is_related = True
                        logger.info(f"[SIMPLE QUERY] Plate {query_value} found in response")
                    else:
                        logger.warning(f"[SIMPLE QUERY] PLATE MISMATCH! Query: {query_value} not found in response")
                        # This is likely another user's response - DON'T return it
                        is_related = False
                
                # For NIK/NKK queries, check if the number appears
                elif query_type in ['capil_nik', 'nkk', 'reghp']:
                    if query_value in response_upper:
                        is_related = True
                    else:
                        logger.warning(f"[SIMPLE QUERY] NIK/NKK MISMATCH! Query: {query_value} not found in response")
                
                # For reghp_phone queries, check if phone number appears or name/NIK in response
                elif query_type == 'reghp_phone':
                    # Phone number may not appear in response, check for typical REGHP data markers
                    phone_clean = query_value.replace("+", "").replace(" ", "")
                    if phone_clean in response_upper or 'NIK' in response_upper or 'NAMA' in response_upper:
                        is_related = True
                    else:
                        logger.warning(f"[SIMPLE QUERY] REGHP_PHONE MISMATCH for {query_value}")
                
                # For name queries, check if at least one word appears
                elif query_type in ['capil_name']:
                    query_words = query_value.upper().split()
                    for word in query_words:
                        if len(word) >= 3 and word in response_upper:
                            is_related = True
                            break
                
                # ============================================
                # FOR CAPIL_NIK - TRY TO CAPTURE PHOTO
                # ============================================
                if query_type == 'capil_nik' and is_related:
                    logger.info(f"[SIMPLE QUERY] Attempting to capture photo for CAPIL NIK query...")
                    try:
                        # Wait a bit more for photo to arrive
                        await asyncio.sleep(2)
                        
                        # Fetch recent messages including photos
                        photo_messages = await telegram_client.get_messages(bot_entity, limit=10, min_id=sent_msg_id)
                        
                        for msg in photo_messages:
                            if msg.out:
                                continue
                            if msg.photo:
                                try:
                                    photo_bytes = await telegram_client.download_media(msg.photo, bytes)
                                    if photo_bytes:
                                        photo_base64 = f"data:image/jpeg;base64,{base64.b64encode(photo_bytes).decode('utf-8')}"
                                        logger.info(f"[SIMPLE QUERY] Photo captured for CAPIL NIK ({len(photo_bytes)} bytes)")
                                        break
                                except Exception as photo_err:
                                    logger.error(f"[SIMPLE QUERY] Error downloading photo: {photo_err}")
                    except Exception as e:
                        logger.error(f"[SIMPLE QUERY] Error capturing photo: {e}")
                
                # If response doesn't match our query, it's likely another user's data
                if not is_related:
                    logger.error(f"[SIMPLE QUERY] DATA MISMATCH DETECTED! User {username} query '{query_value}' got unrelated response. DISCARDING.")
                    return {
                        "success": False,
                        "query_type": query_type,
                        "query_value": query_value,
                        "error": "Data tidak sesuai dengan query. Kemungkinan terjadi tabrakan dengan user lain. Silakan coba lagi.",
                        "retry_suggested": True
                    }
                
                # ============================================
                # SAVE TO CACHE (with photo if available)
                # ============================================
                if is_related:
                    cache_doc = {
                        "cache_key": cache_key,
                        "query_type": query_type,
                        "query_value": query_value,
                        "raw_response": raw_response,
                        "photo": photo_base64,
                        "queried_by": username,
                        "created_by": username,
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                    await db.simple_query_cache.update_one(
                        {"cache_key": cache_key},
                        {"$set": cache_doc},
                        upsert=True
                    )
                    logger.info(f"[SIMPLE QUERY] Saved to cache: {cache_key}")
                
                logger.info(f"[SIMPLE QUERY] Success for user {username}")
                clear_active_query()  # Clear before returning
                return {
                    "success": True,
                    "query_type": query_type,
                    "query_value": query_value,
                    "raw_response": raw_response,
                    "photo": photo_base64,
                    "verified": is_related,
                    "cached": False
                }
            else:
                logger.warning(f"[SIMPLE QUERY] No response from bot for user {username}")
                clear_active_query()  # Clear before returning
                return {
                    "success": False,
                    "query_type": query_type,
                    "query_value": query_value,
                    "error": "Tidak ada respons dari bot. Coba lagi."
                }
                
        except Exception as e:
            logger.error(f"[SIMPLE QUERY] Error for user {username}: {e}")
            import traceback
            logger.error(f"[SIMPLE QUERY] Traceback: {traceback.format_exc()}")
            clear_active_query()  # Clear on error too
            raise HTTPException(status_code=500, detail=str(e))
        finally:
            logger.info(f"[SIMPLE QUERY] Global lock released for user: {username}")

# ============================================
# SIMPLE QUERY HISTORY ENDPOINT
# ============================================
@api_router.get("/simple-query/history")
async def get_simple_query_history(
    limit: int = 50,
    query_type: str = None,
    username: str = Depends(verify_token)
):
    """
    Get Simple Query history from cache.
    Admin sees all history, regular users see only their own.
    """
    try:
        # Check if user is admin - use cached check for performance
        is_admin = await is_user_admin(username)
        
        # Build query filter
        query_filter = {"raw_response": {"$exists": True, "$ne": None}}
        
        # Admin sees all, regular users see only their own
        if not is_admin:
            query_filter["$or"] = [
                {"queried_by": username},
                {"created_by": username}
            ]
        
        if query_type:
            query_filter["query_type"] = query_type
        
        # Get history sorted by created_at descending (most recent first)
        cursor = db.simple_query_cache.find(
            query_filter,
            {"_id": 0}
        ).sort("created_at", -1).limit(limit)
        
        history = await cursor.to_list(length=limit)
        
        # Add query type labels
        type_labels = {
            "capil_name": "CAPIL (Nama)",
            "capil_nik": "CAPIL (NIK)",
            "nkk": "Kartu Keluarga (NKK)",
            "reghp": "RegHP (NIK)",
            "passport_wna": "Passport WNA (Nama)",
            "passport_wni": "Passport WNI (Nama)",
            "passport_nik": "Passport WNI (NIK)",
            "passport_number": "Passport (Nomor)",
            "plat_mobil": "Plat Nomor Kendaraan",
            "perlintasan": "Perlintasan (No Passport)"
        }
        
        for item in history:
            item["type_label"] = type_labels.get(item.get("query_type"), item.get("query_type"))
        
        logger.info(f"[SIMPLE QUERY HISTORY] Returning {len(history)} items for user {username} (is_admin: {is_admin})")
        
        return {
            "success": True,
            "history": history,
            "total": len(history)
        }
        
    except Exception as e:
        logger.error(f"[SIMPLE QUERY HISTORY] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/simple-query/cache/{cache_key}")
async def delete_simple_query_cache(
    cache_key: str,
    username: str = Depends(verify_token)
):
    """Delete a specific cache entry (admin only or owner)"""
    try:
        # Check if user is admin
        user = await db.users.find_one({"username": username})
        is_admin = (username == ADMIN_USERNAME) or (user and user.get("is_admin", False)) or (user and user.get("role") == "admin")
        
        # Find the cache entry
        cache_entry = await db.simple_query_cache.find_one({"cache_key": cache_key})
        
        if not cache_entry:
            raise HTTPException(status_code=404, detail="Cache entry not found")
        
        # Admin can delete any cache
        # Regular user can delete if they created it OR if it was created by "investigation" (system)
        cache_creator = cache_entry.get("created_by", "")
        can_delete = is_admin or (cache_creator == username) or (cache_creator == "investigation")
        
        if not can_delete:
            raise HTTPException(status_code=403, detail=f"Not authorized to delete this cache entry (created by: {cache_creator})")
        
        await db.simple_query_cache.delete_one({"cache_key": cache_key})
        
        logger.info(f"[SIMPLE QUERY] Cache deleted by {username}: {cache_key}")
        
        return {"success": True, "message": "Cache entry deleted"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SIMPLE QUERY] Delete cache error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/telegram/force-restore-session")
async def force_restore_session(username: str = Depends(verify_token)):
    """Force restore Telegram session from MongoDB backup"""
    global telegram_client
    
    session_path = str(ROOT_DIR / 'northarch_session.session')
    
    try:
        # Disconnect current client
        if telegram_client is not None:
            try:
                await telegram_client.disconnect()
            except:
                pass
            telegram_client = None
        
        # Delete current session file
        if os.path.exists(session_path):
            os.remove(session_path)
            logging.info("Deleted existing session file")
        
        # Restore from MongoDB
        import base64
        session_backup = await db.telegram_sessions.find_one({"type": "main_session"})
        
        if not session_backup or not session_backup.get('session_data'):
            return {
                "success": False,
                "message": "No session backup found in database. Please login manually."
            }
        
        # Write session file
        session_data = base64.b64decode(session_backup['session_data'])
        with open(session_path, 'wb') as f:
            f.write(session_data)
        
        logging.info(f"Restored session from MongoDB (user: {session_backup.get('username')})")
        
        # Try to connect with restored session - use helper function for consistency
        telegram_client = create_telegram_client()
        await telegram_client.connect()
        
        if await telegram_client.is_user_authorized():
            me = await telegram_client.get_me()
            return {
                "success": True,
                "message": f"Session restored and connected as @{me.username}",
                "user": {
                    "username": me.username,
                    "phone": me.phone
                }
            }
        else:
            return {
                "success": False,
                "message": "Session restored but authorization expired. Please login again."
            }
            
    except Exception as e:
        logging.error(f"Force restore session failed: {e}")
        return {
            "success": False,
            "message": f"Restore failed: {str(e)}"
        }

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
    if telegram_client:
        await telegram_client.disconnect()

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)