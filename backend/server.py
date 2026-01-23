from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
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
JWT_SECRET = os.getenv('JWT_SECRET', 'northarch-secret-key-2024')
JWT_ALGORITHM = "HS256"

# CP API Configuration
CP_API_URL = os.getenv('CP_API_URL', 'https://gate-amg.blackopium.xyz')
CP_API_KEY = os.getenv('CP_API_KEY', '4e5c5c4afc0c7ee8e22aa54c0796c084')
CP_API_INITIAL_QUOTA = int(os.getenv('CP_API_QUOTA', '300'))

logger.info(f"CP API URL: {CP_API_URL}")
logger.info(f"CP API Key: {CP_API_KEY[:8]}...{CP_API_KEY[-4:]}")

# Telegram Client Setup - PERMANENT VALUES
# These are the correct API credentials for this application
# IMPORTANT: Always use these values, ignore any incorrect env variables
CORRECT_TELEGRAM_API_ID = 31836139
CORRECT_TELEGRAM_API_HASH = '8a71ab940136be9274ac6f92d9fb7d45'

# Check if env has correct value, otherwise use hardcoded correct value
env_api_id = os.getenv('TELEGRAM_API_ID', '')
env_api_hash = os.getenv('TELEGRAM_API_HASH', '')

# FORCE correct values - ignore incorrect environment variables
if env_api_id and env_api_id != str(CORRECT_TELEGRAM_API_ID):
    logger.warning(f"Incorrect TELEGRAM_API_ID in env ({env_api_id}), using correct value: {CORRECT_TELEGRAM_API_ID}")
    
TELEGRAM_API_ID = CORRECT_TELEGRAM_API_ID
TELEGRAM_API_HASH = CORRECT_TELEGRAM_API_HASH
BOT_USERNAME = '@northarch_bot'

# Log Telegram credentials status
logger.info(f"Telegram API ID: {TELEGRAM_API_ID} (FORCED CORRECT VALUE)")

telegram_client = None
telegram_connection_lock = asyncio.Lock()

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
            # Force reconnect
            if telegram_client:
                try:
                    await telegram_client.disconnect()
                except:
                    pass
                telegram_client = None
            await asyncio.sleep(2)
            
        except Exception as e:
            error_str = str(e).lower()
            if 'connection' in error_str or 'disconnect' in error_str or 'timeout' in error_str:
                logger.warning(f"[Telegram] Network error in {operation_name} (attempt {attempt + 1}/{max_retries}): {e}")
                # Force reconnect
                if telegram_client:
                    try:
                        await telegram_client.disconnect()
                    except:
                        pass
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
    """Check if CP API is reachable AND authorized (not 403)"""
    try:
        # Force IPv4 for whitelisted IP
        transport = httpx.AsyncHTTPTransport(local_address="0.0.0.0")
        async with httpx.AsyncClient(timeout=10.0, transport=transport) as client:
            # Try a simple request to check authorization
            response = await client.get(
                f"{CP_API_URL}/api/v3/cekpos",
                headers={"api-key": CP_API_KEY}
            )
            
            # Check if we get 403 Forbidden (IP not whitelisted)
            if response.status_code == 403:
                logger.warning("[CP API] 403 Forbidden - IP not whitelisted")
                return False
            
            # Check if response is HTML (error page)
            content_type = response.headers.get('content-type', '')
            if 'text/html' in content_type:
                logger.warning("[CP API] Received HTML response - likely blocked")
                return False
            
            # API is connected and authorized
            return True
    except Exception as e:
        logger.error(f"[CP API] Connection check failed: {e}")
        return False

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
    """
    normalized_phone = normalize_phone_number(phone_number)
    logger.info(f"[CP API] Querying position for {normalized_phone}")
    
    try:
        # Force IPv4 for whitelisted IP
        transport = httpx.AsyncHTTPTransport(local_address="0.0.0.0")
        async with httpx.AsyncClient(timeout=30.0, transport=transport) as http_client:
            response = await http_client.post(
                f"{CP_API_URL}/api/v3/cekpos",
                headers={"api-key": CP_API_KEY},
                data={"msisdn": normalized_phone}
            )
            
            data = response.json()
            logger.info(f"[CP API] Response code: {data.get('code')}, message: {data.get('message')}")
            
            if data.get("code") == 0 and data.get("contents"):
                contents = data["contents"]
                
                # Decrement quota on successful query
                await decrement_cp_api_quota()
                
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
            else:
                return {
                    "success": False,
                    "error": data.get("message", "Unknown error"),
                    "code": data.get("code", -1)
                }
                
    except httpx.TimeoutException:
        logger.error(f"[CP API] Timeout for {normalized_phone}")
        return {"success": False, "error": "Request timeout"}
    except Exception as e:
        logger.error(f"[CP API] Error: {e}")
        return {"success": False, "error": str(e)}

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Models
class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    token: str
    username: str

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
    interval_type: str  # minutes, hourly, daily, weekly, monthly
    interval_value: int
    active: bool = True

class Schedule(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    case_id: str
    phone_number: str
    interval_type: str
    interval_value: int
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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AOIAlert(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    aoi_id: str
    aoi_name: str
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
@api_router.post("/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    ADMIN_USERNAME = "admin"
    ADMIN_PASSWORD = "Paparoni290483#"
    
    if request.username != ADMIN_USERNAME or request.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = jwt.encode(
        {"username": request.username},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM
    )
    
    return LoginResponse(token=token, username=request.username)

# ============================================
# CP API Status and Quota Endpoints
# ============================================

@api_router.get("/cp-api/status")
async def get_cp_api_status(username: str = Depends(verify_token)):
    """Get CP API connection status and quota"""
    is_connected = await check_cp_api_connection()
    quota = await get_cp_api_quota()
    quota_doc = await db.api_quota.find_one({"type": "cp_api"}, {"_id": 0})
    
    # Determine status message
    if is_connected:
        status_message = "Connected & Authorized"
    else:
        status_message = "Disconnected (IP not whitelisted or server unreachable)"
    
    return {
        "connected": is_connected,
        "status_message": status_message,
        "quota_remaining": quota,
        "quota_initial": quota_doc.get("initial", CP_API_INITIAL_QUOTA) if quota_doc else CP_API_INITIAL_QUOTA,
        "quota_used": quota_doc.get("used", 0) if quota_doc else 0,
        "last_updated": quota_doc.get("last_updated") if quota_doc else None,
        "api_url": CP_API_URL
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
    """Test CP API with a phone number (uses quota)"""
    result = await query_cp_api(phone_number)
    return result

# Case Routes
@api_router.post("/cases", response_model=Case)
async def create_case(case_data: CaseCreate, username: str = Depends(verify_token)):
    case = Case(**case_data.model_dump())
    doc = case.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.cases.insert_one(doc)
    return case

@api_router.get("/cases", response_model=List[Case])
async def get_cases(username: str = Depends(verify_token)):
    cases = await db.cases.find({}, {"_id": 0}).to_list(1000)
    
    for case in cases:
        if isinstance(case.get('created_at'), str):
            case['created_at'] = datetime.fromisoformat(case['created_at'])
        if isinstance(case.get('updated_at'), str):
            case['updated_at'] = datetime.fromisoformat(case['updated_at'])
    
    return cases

@api_router.get("/cases/{case_id}", response_model=Case)
async def get_case(case_id: str, username: str = Depends(verify_token)):
    case = await db.cases.find_one({"id": case_id}, {"_id": 0})
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    if isinstance(case.get('created_at'), str):
        case['created_at'] = datetime.fromisoformat(case['created_at'])
    if isinstance(case.get('updated_at'), str):
        case['updated_at'] = datetime.fromisoformat(case['updated_at'])
    
    return case

@api_router.delete("/cases/{case_id}")
async def delete_case(case_id: str, username: str = Depends(verify_token)):
    """Delete case and all its targets"""
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
    
    target = Target(**target_data.model_dump(exclude={'manual_mode', 'manual_data'}))
    doc = target.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
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
        
        # Query CP API
        result = await query_cp_api(phone_number)
        
        if result.get("success"):
            # Update target with position
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
                "source": "cp_api"
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
            
            logging.info(f"[CP API NEW] ✓ Position found for {phone_number}: {result['latitude']}, {result['longitude']}")
            
            # Check AOI alerts
            await check_aoi_alerts(target_id, phone_number, result["latitude"], result["longitude"])
            
        else:
            error_msg = result.get("error", "Unknown error")
            logging.warning(f"[CP API NEW] Failed for {phone_number}: {error_msg}")
            
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
    query = {"case_id": case_id} if case_id else {}
    targets = await db.targets.find(query, {"_id": 0}).to_list(1000)
    
    for target in targets:
        if isinstance(target.get('created_at'), str):
            target['created_at'] = datetime.fromisoformat(target['created_at'])
    
    return targets

@api_router.get("/targets/{target_id}", response_model=Target)
async def get_target(target_id: str, username: str = Depends(verify_token)):
    target = await db.targets.find_one({"id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    if isinstance(target.get('created_at'), str):
        target['created_at'] = datetime.fromisoformat(target['created_at'])
    
    return target

@api_router.delete("/targets/{target_id}")
async def delete_target(target_id: str, username: str = Depends(verify_token)):
    """Delete target and all associated data"""
    target = await db.targets.find_one({"id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
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
        logging.info(f"[CP API REFRESH] Querying position for {phone_number}")
        
        # Query CP API
        result = await query_cp_api(phone_number)
        
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
                "source": "cp_api"  # Mark as from CP API
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
        await asyncio.sleep(4)
        
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
        await asyncio.sleep(5)
        
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
            "reused": True
        }
    
    # No existing data, proceed with new query
    # Update reghp_status to processing
    await db.targets.update_one(
        {"id": target_id},
        {"$set": {"reghp_status": "processing"}}
    )
    
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
            "reused": True
        }
    
    # No existing data, proceed with new query
    # Initialize nik_queries if not exists
    if not target.get('nik_queries'):
        await db.targets.update_one(
            {"id": target_id},
            {"$set": {"nik_queries": {}}}
        )
    
    # Update NIK status to processing
    await db.targets.update_one(
        {"id": target_id},
        {"$set": {f"nik_queries.{nik}.status": "processing"}}
    )
    
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
    
    # Start background task with source_nik
    asyncio.create_task(query_telegram_family(target_id, family_id, source_nik))
    
    return {"message": "Family query started", "target_id": target_id, "source_nik": source_nik}

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
    
    schedule = Schedule(**schedule_data.model_dump())
    
    # Calculate next run time
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    if schedule_data.interval_type == 'minutes':
        schedule.next_run = now + timedelta(minutes=schedule_data.interval_value)
    elif schedule_data.interval_type == 'hourly':
        schedule.next_run = now + timedelta(hours=schedule_data.interval_value)
    elif schedule_data.interval_type == 'daily':
        schedule.next_run = now + timedelta(days=schedule_data.interval_value)
    elif schedule_data.interval_type == 'weekly':
        schedule.next_run = now + timedelta(weeks=schedule_data.interval_value)
    elif schedule_data.interval_type == 'monthly':
        schedule.next_run = now + timedelta(days=schedule_data.interval_value * 30)
    
    doc = schedule.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    if doc.get('next_run'):
        doc['next_run'] = doc['next_run'].isoformat()
    if doc.get('last_run'):
        doc['last_run'] = doc['last_run'].isoformat()
    
    await db.schedules.insert_one(doc)
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
    now = datetime.now(timezone.utc)
    interval_type = schedule.get('interval_type', 'hourly')
    interval_value = schedule.get('interval_value', 1)
    
    if interval_type == 'minutes':
        next_run = now + timedelta(minutes=interval_value)
    elif interval_type == 'hourly':
        next_run = now + timedelta(hours=interval_value)
    elif interval_type == 'daily':
        next_run = now + timedelta(days=interval_value)
    elif interval_type == 'weekly':
        next_run = now + timedelta(weeks=interval_value)
    else:
        next_run = now + timedelta(days=interval_value * 30)
    
    await db.schedules.update_one(
        {"id": schedule_id},
        {"$set": {
            "last_run": now.isoformat(),
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
        "correct_api_id": str(CORRECT_TELEGRAM_API_ID),
        "env_api_id": env_api_id,
        "is_correct": TELEGRAM_API_ID == CORRECT_TELEGRAM_API_ID,
        "has_api_hash": bool(TELEGRAM_API_HASH),
        "status": "OK - Using correct API credentials"
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
    global telegram_client
    
    session_exists = os.path.exists(str(ROOT_DIR / 'northarch_session.session'))
    
    if not session_exists:
        return {
            "authorized": False,
            "connected": False,
            "message": "Belum login ke Telegram"
        }
    
    try:
        # Check current connection state
        is_connected = telegram_client is not None and telegram_client.is_connected()
        
        # Recreate client if needed
        if telegram_client is None or not is_connected:
            if telegram_client is not None:
                try:
                    await telegram_client.disconnect()
                except:
                    pass
            
            telegram_client = TelegramClient(
                SESSION_PATH,
                TELEGRAM_API_ID,
                TELEGRAM_API_HASH
            )
            await telegram_client.connect()
            is_connected = telegram_client.is_connected()
        
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
        logging.error(f"Error checking Telegram status: {e}")
        
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
    """Query Telegram bot with robust connection handling"""
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

async def query_telegram_reghp(target_id: str, phone_number: str):
    """Query Reghp data for deeper information with robust connection handling"""
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

async def query_telegram_nik(target_id: str, nik: str):
    """Query NIK detail dengan foto dari bot - with robust connection handling"""
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

async def query_telegram_family(target_id: str, family_id: str, source_nik: str = None):
    """Query Family (NKK) data dengan Family ID - with robust connection handling"""
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
    Now with CACHING: checks if name was searched before
    """
    search_name = request.name.strip().upper()  # Normalize name for caching
    
    # ============================================
    # CHECK CACHE: Look for existing search with same name
    # Only use cache if pagination was properly done (photos_fetched_count <= batch_size for first batch)
    # ============================================
    existing_search = await db.nongeoint_searches.find_one(
        {
            "name_normalized": search_name,
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
    
    search = await db.nongeoint_searches.find_one({"id": search_id}, {"_id": 0})
    if not search:
        logger.warning(f"[NONGEOINT] Search {search_id} not found")
        raise HTTPException(status_code=404, detail="Search not found")
    
    logger.info(f"[NONGEOINT] Found search: {search.get('name')}, status: {search.get('status')}, niks_found: {search.get('niks_found', [])}")
    
    # Also get investigation if exists
    investigation = await db.nik_investigations.find_one({"search_id": search_id}, {"_id": 0})
    if investigation:
        search["investigation"] = investigation
        logger.info(f"[NONGEOINT] Loaded investigation for search {search_id}: status={investigation.get('status')}, results_count={len(investigation.get('results', {}))}")
        # Log each NIK result briefly
        for nik, result in investigation.get('results', {}).items():
            has_nik = 'nik_data' in result
            has_nkk = 'nkk_data' in result  
            has_regnik = 'regnik_data' in result
            logger.info(f"[NONGEOINT]   NIK {nik}: nik_data={has_nik}, nkk_data={has_nkk}, regnik_data={has_regnik}")
    else:
        logger.info(f"[NONGEOINT] No investigation found for search {search_id}")
    
    return search

@api_router.get("/nongeoint/searches")
async def list_nongeoint_searches(username: str = Depends(verify_token)):
    """List all NON GEOINT searches for user with investigation status"""
    searches = await db.nongeoint_searches.find(
        {"created_by": username},
        {"_id": 0}
    ).sort("created_at", -1).limit(20).to_list(20)
    
    # Add investigation status for each search
    for search in searches:
        investigation = await db.nik_investigations.find_one(
            {"search_id": search["id"]}, 
            {"_id": 0, "status": 1, "id": 1}
        )
        if investigation:
            search["has_investigation"] = True
            search["investigation_status"] = investigation.get("status")
            search["investigation_id"] = investigation.get("id")
        else:
            search["has_investigation"] = False
    
    return searches

@api_router.post("/nongeoint/search/{search_id}/fetch-next-batch")
async def fetch_next_photo_batch(search_id: str, username: str = Depends(verify_token)):
    """
    Fetch next batch of photos (10 at a time)
    Called when user wants to see more candidates
    """
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
    
    # Update status
    await db.nongeoint_searches.update_one(
        {"id": search_id},
        {"$set": {
            "status": "fetching_photos",
            "current_batch": current_batch,
            "photo_fetch_progress": 0,
            "photo_fetch_total": len(niks_to_fetch)
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
    global telegram_client
    
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
                    "current_batch": batch_num + 1
                }}
            )
            
            logger.info(f"[NONGEOINT {search_id}] Batch {batch_num + 1} completed. Total photos: {len(existing_photos)}/{len(all_niks)}")
            
        except Exception as e:
            logger.error(f"[NONGEOINT {search_id}] Batch photo fetch error: {e}")
            await db.nongeoint_searches.update_one(
                {"id": search_id},
                {"$set": {"status": "waiting_selection", "error": str(e)}}
            )

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
async def delete_nongeoint_search(search_id: str, username: str = Depends(verify_token)):
    """Delete a NON GEOINT search and its associated investigation"""
    # Check if search exists and belongs to user
    search = await db.nongeoint_searches.find_one({"id": search_id, "created_by": username})
    if not search:
        raise HTTPException(status_code=404, detail="Search not found")
    
    # Delete the search
    await db.nongeoint_searches.delete_one({"id": search_id})
    
    # Also delete associated investigations
    await db.nik_investigations.delete_many({"search_id": search_id})
    
    logger.info(f"[NONGEOINT] Deleted search {search_id} by {username}")
    return {"message": "Search deleted successfully"}

async def process_nongeoint_search(search_id: str, name: str, query_types: List[str]):
    """Process NON GEOINT search with queue system - includes auto photo fetch"""
    global telegram_client
    
    results = {}
    all_niks = []
    nik_photos = {}  # Store photos for each NIK: {nik: {photo, name, raw_data}}
    
    async with nongeoint_queue_lock:
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
        await asyncio.sleep(4)
        
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
        await asyncio.sleep(5)
        
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
            await asyncio.sleep(3)  # Wait for more messages
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
    investigation_id = str(uuid.uuid4())[:8]
    logger.info(f"[NIK INVESTIGATION {investigation_id}] Starting for {len(request.niks)} NIKs")
    
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

async def process_nik_investigation(investigation_id: str, search_id: str, niks: List[str]):
    """Process NIK deep investigation with queue system"""
    global telegram_client
    
    results = {}
    
    async with nongeoint_queue_lock:
        try:
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
            
            # Process each NIK sequentially
            for nik in niks:
                logger.info(f"[NIK INVESTIGATION {investigation_id}] Processing NIK: {nik}")
                
                nik_results = {
                    "nik": nik,
                    "nik_data": None,
                    "nkk_data": None,
                    "regnik_data": None,
                    "status": "processing"
                }
                
                # Query 1: NIK
                logger.info(f"[NIK INVESTIGATION {investigation_id}] Querying NIK for {nik}")
                await db.nik_investigations.update_one(
                    {"id": investigation_id},
                    {"$set": {f"results.{nik}.status": "processing_nik"}}
                )
                nik_result = await execute_nik_button_query(investigation_id, nik, "NIK")
                nik_results["nik_data"] = nik_result
                logger.info(f"[NIK INVESTIGATION {investigation_id}] NIK result status: {nik_result.get('status')}")
                # Save immediately after each query
                await db.nik_investigations.update_one(
                    {"id": investigation_id},
                    {"$set": {f"results.{nik}.nik_data": nik_result}}
                )
                await asyncio.sleep(3)
                
                # Query 2: NKK - MUST USE FAMILY ID from NIK data, not NIK
                family_id = None
                if nik_result.get('data'):
                    # Try to extract Family ID from parsed data
                    family_id = nik_result['data'].get('Family ID') or nik_result['data'].get('No KK') or nik_result['data'].get('NKK') or nik_result['data'].get('family_id')
                
                if not family_id and nik_result.get('raw_text'):
                    # Try to extract from raw text
                    import re
                    family_match = re.search(r'(?:Family ID|No KK|NKK)[:\s]*(\d{16})', nik_result['raw_text'], re.IGNORECASE)
                    if family_match:
                        family_id = family_match.group(1)
                
                logger.info(f"[NIK INVESTIGATION {investigation_id}] Extracted Family ID: {family_id}")
                
                if family_id:
                    logger.info(f"[NIK INVESTIGATION {investigation_id}] Querying NKK with Family ID: {family_id}")
                    await db.nik_investigations.update_one(
                        {"id": investigation_id},
                        {"$set": {f"results.{nik}.status": "processing_nkk"}}
                    )
                    # Use Family ID instead of NIK for NKK query
                    nkk_result = await execute_nik_button_query(investigation_id, family_id, "NKK")
                    nik_results["nkk_data"] = nkk_result
                    logger.info(f"[NIK INVESTIGATION {investigation_id}] NKK result status: {nkk_result.get('status')}")
                else:
                    logger.warning(f"[NIK INVESTIGATION {investigation_id}] No Family ID found, skipping NKK query")
                    nkk_result = {"status": "skipped", "error": "No Family ID found in NIK data"}
                    nik_results["nkk_data"] = nkk_result
                
                # Save immediately after each query
                await db.nik_investigations.update_one(
                    {"id": investigation_id},
                    {"$set": {f"results.{nik}.nkk_data": nkk_result}}
                )
                await asyncio.sleep(3)
                
                # Query 3: RegNIK - Handle multiple phone numbers
                logger.info(f"[NIK INVESTIGATION {investigation_id}] Querying RegNIK for {nik}")
                await db.nik_investigations.update_one(
                    {"id": investigation_id},
                    {"$set": {f"results.{nik}.status": "processing_regnik"}}
                )
                regnik_result = await execute_regnik_query(investigation_id, nik)
                nik_results["regnik_data"] = regnik_result
                logger.info(f"[NIK INVESTIGATION {investigation_id}] RegNIK result status: {regnik_result.get('status')}, phones found: {len(regnik_result.get('phones', []))}")
                
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
            
        except Exception as e:
            logger.error(f"[NIK INVESTIGATION {investigation_id}] Error: {e}")
            await db.nik_investigations.update_one(
                {"id": investigation_id},
                {"$set": {"status": "error", "error": str(e)}}
            )

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
        await asyncio.sleep(4)
        
        # Step 2: Get buttons
        async def get_buttons():
            return await telegram_client.get_messages(BOT_USERNAME, limit=5)
        
        messages = await safe_telegram_operation(get_buttons, f"get_buttons_{query_token}", max_retries=3)
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
        await asyncio.sleep(8)  # Wait longer for response including photo
        
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
                logger.info(f"[{query_token}]   Msg {i}: id={msg.id}, date={msg_date}, photo={has_photo}, doc={has_doc}, text={has_text}, preview='{text_preview}...'")
            
            # CRITICAL FIX: Find the response message that contains our NIK first
            # Then only accept photos from THAT message or messages immediately after it
            target_msg_id = None
            target_msg_date = None
            
            for msg in response_messages:
                # Skip old messages
                if msg.date < time_threshold:
                    continue
                
                if msg.text:
                    msg_text = msg.text.lower()
                    # Check if this message is the response for OUR NIK
                    # It should contain the NIK we queried
                    if nik in msg.text or nik.lower() in msg_text:
                        target_msg_id = msg.id
                        target_msg_date = msg.date
                        logger.info(f"[{query_token}] Found target response message: id={msg.id}, date={msg.date}")
                        break
            
            # PHOTO RETRIEVAL: Only look for photos if we found the target message
            # And only accept photos from messages AFTER or AT the target message
            if not photo_base64 and target_msg_date:
                for msg in response_messages:
                    # Photo must be:
                    # 1. From message at or after our target response
                    # 2. Within 10 seconds of the target response (to prevent grabbing old photos)
                    if not target_msg_date:
                        continue
                    
                    time_diff = (msg.date - target_msg_date).total_seconds()
                    # Accept photos from -2 to +10 seconds relative to target message
                    if time_diff < -2 or time_diff > 10:
                        continue
                    
                    # Check for photo attribute
                    if msg.photo:
                        try:
                            logger.info(f"[{query_token}] Found msg.photo near target message (id={msg.id}, date={msg.date}, diff={time_diff}s), downloading...")
                            photo_bytes = await telegram_client.download_media(msg.photo, bytes)
                            if photo_bytes:
                                import base64
                                photo_base64 = f"data:image/jpeg;base64,{base64.b64encode(photo_bytes).decode('utf-8')}"
                                logger.info(f"[{query_token}] ✓ Downloaded photo successfully ({len(photo_bytes)} bytes)")
                                break  # Got photo, stop looking
                        except Exception as e:
                            logger.error(f"[{query_token}] Photo download error: {e}")
                    
                    # Check for media attribute (alternative way photos might be attached)
                    if hasattr(msg, 'media') and msg.media and not photo_base64:
                        media_type = type(msg.media).__name__
                        logger.info(f"[{query_token}] Found msg.media type: {media_type}")
                        
                        # Try to download if it's a photo type
                        if 'Photo' in media_type:
                            try:
                                logger.info(f"[{query_token}] Attempting to download media as photo...")
                                photo_bytes = await telegram_client.download_media(msg.media, bytes)
                                if photo_bytes:
                                    import base64
                                    photo_base64 = f"data:image/jpeg;base64,{base64.b64encode(photo_bytes).decode('utf-8')}"
                                    logger.info(f"[{query_token}] ✓ Downloaded media photo successfully ({len(photo_bytes)} bytes)")
                                    break
                            except Exception as e:
                                logger.error(f"[{query_token}] Media photo download error: {e}")
                    
                    # Check for document that might be an image
                    if msg.document and not photo_base64:
                        mime = getattr(msg.document, 'mime_type', '') or ''
                        logger.info(f"[{query_token}] Found document with mime: {mime}")
                        if 'image' in mime.lower():
                            try:
                                photo_bytes = await telegram_client.download_media(msg.document, bytes)
                                if photo_bytes:
                                    import base64
                                    ext = 'jpeg' if 'jpeg' in mime or 'jpg' in mime else 'png'
                                    photo_base64 = f"data:image/{ext};base64,{base64.b64encode(photo_bytes).decode('utf-8')}"
                                    logger.info(f"[{query_token}] ✓ Downloaded document image successfully ({len(photo_bytes)} bytes)")
                                    break
                            except Exception as e:
                                logger.error(f"[{query_token}] Document image download error: {e}")
                
                # If no photo found but we have target message, log it
                if not photo_base64 and target_msg_date:
                    logger.info(f"[{query_token}] No photo found within time window of target message")
            
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
                    "photo": None,
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
    """Parse NKK/Family Card data to extract family members - ENHANCED VERSION"""
    import re
    
    members = []
    lines = text.split('\n')
    current_member = {}
    
    # Track line numbers for debugging
    logger.info(f"[NKK PARSER] Parsing {len(lines)} lines of NKK data")
    logger.info(f"[NKK PARSER] Raw text sample: {text[:500]}...")
    
    # Method 1: Parse structured format (each member has NIK, Name, etc on separate lines)
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        
        # Check for NIK pattern (16 digits) - this signals a new member
        nik_match = re.search(r'\b(\d{16})\b', stripped)
        if nik_match:
            # Save previous member if exists
            if current_member and current_member.get('nik'):
                members.append(current_member.copy())
                logger.info(f"[NKK PARSER] Saved member: {current_member.get('name', 'Unknown')}")
            current_member = {'nik': nik_match.group(1)}
        
        # Check for Full Name patterns (prioritize Full Name)
        full_name_match = re.search(r'(?:full\s*name|nama\s*lengkap)\s*[:\-]?\s*(.+)', stripped, re.IGNORECASE)
        if full_name_match and current_member:
            current_member['name'] = full_name_match.group(1).strip()
        elif not current_member.get('name'):
            # Fallback to regular name patterns
            name_match = re.search(r'(?:nama|name)\s*[:\-]?\s*(.+)', stripped, re.IGNORECASE)
            if name_match and current_member:
                current_member['name'] = name_match.group(1).strip()
        
        # Check for relationship patterns (SHDK = Status Hubungan Dalam Keluarga)
        rel_match = re.search(r'(?:relationship|hubungan|shdk|status\s*hubungan|status\s*keluarga)\s*[:\-]?\s*(.+)', stripped, re.IGNORECASE)
        if rel_match and current_member:
            rel_value = rel_match.group(1).strip().upper()
            # Normalize relationship values
            if 'KEPALA' in rel_value or 'HEAD' in rel_value:
                current_member['relationship'] = 'KEPALA KELUARGA'
            elif 'ISTRI' in rel_value or 'WIFE' in rel_value or 'SPOUSE' in rel_value:
                current_member['relationship'] = 'ISTRI'
            elif 'SUAMI' in rel_value or 'HUSBAND' in rel_value:
                current_member['relationship'] = 'SUAMI'
            elif 'ANAK' in rel_value or 'CHILD' in rel_value or 'SON' in rel_value or 'DAUGHTER' in rel_value:
                current_member['relationship'] = 'ANAK'
            else:
                current_member['relationship'] = rel_value
        
        # Check for gender patterns
        gender_match = re.search(r'(?:jenis\s*kelamin|gender|j/k|sex|kelamin)\s*[:\-]?\s*(.+)', stripped, re.IGNORECASE)
        if gender_match and current_member:
            gender_value = gender_match.group(1).strip().upper()
            if 'LAKI' in gender_value or gender_value == 'L' or 'MALE' in gender_value:
                current_member['gender'] = 'L'
            elif 'PEREMPUAN' in gender_value or gender_value == 'P' or 'FEMALE' in gender_value:
                current_member['gender'] = 'P'
            else:
                current_member['gender'] = gender_value
        
        # Check for birth date (DoB) - multiple patterns
        dob_match = re.search(r'(?:dob|date\s*of\s*birth|tgl\s*lahir|tanggal\s*lahir|lahir|birth)\s*[:\-]?\s*(.+)', stripped, re.IGNORECASE)
        if dob_match and current_member:
            dob_value = dob_match.group(1).strip()
            current_member['dob'] = dob_value
            # Also add alternative field names for frontend compatibility
            current_member['birth_date'] = dob_value
            current_member['tanggal_lahir'] = dob_value
    
    # Don't forget the last member
    if current_member and current_member.get('nik'):
        members.append(current_member.copy())
        logger.info(f"[NKK PARSER] Saved last member: {current_member.get('name', 'Unknown')}")
    
    logger.info(f"[NKK PARSER] Method 1 found {len(members)} members")
    
    # Method 2: Try table-like format (common in bot responses)
    # Pattern: NIK | Name | Relationship | Gender or similar
    if len(members) < 2:
        table_pattern = re.findall(
            r'(\d{16})\s*[\|\-,]\s*([^|\-,\n]+?)(?:\s*[\|\-,]\s*([^|\-,\n]+?))?(?:\s*[\|\-,]\s*([LP]|LAKI|PEREMPUAN|MALE|FEMALE))?',
            text, re.IGNORECASE
        )
        if table_pattern:
            members = []  # Reset and use table format
            for match in table_pattern:
                nik, name, relationship, gender = match
                member = {'nik': nik.strip()}
                if name:
                    member['name'] = name.strip()
                if relationship:
                    member['relationship'] = relationship.strip()
                if gender:
                    g = gender.strip().upper()
                    member['gender'] = 'L' if 'L' in g or 'MALE' in g else 'P' if 'P' in g or 'FEMALE' in g else g
                members.append(member)
            logger.info(f"[NKK PARSER] Method 2 (table) found {len(members)} members")
    
    # Method 3: Try numbered list format
    # Pattern: 1. NIK: xxx, Name: xxx, etc
    if len(members) < 2:
        numbered_pattern = re.findall(
            r'(?:\d+[\.\)]\s*)?(?:NIK\s*[:\-]?\s*)?(\d{16})(?:[,\s]+(?:nama|name)\s*[:\-]?\s*([^,\n]+))?(?:[,\s]+(?:hubungan|shdk|relationship)\s*[:\-]?\s*([^,\n]+))?',
            text, re.IGNORECASE
        )
        if numbered_pattern and len(numbered_pattern) > len(members):
            members = []
            for match in numbered_pattern:
                nik, name, relationship = match
                member = {'nik': nik.strip()}
                if name:
                    member['name'] = name.strip()
                if relationship:
                    member['relationship'] = relationship.strip()
                members.append(member)
            logger.info(f"[NKK PARSER] Method 3 (numbered) found {len(members)} members")
    
    # Method 4: Extract all 16-digit NIKs and try to associate with nearby text
    if len(members) < 2:
        all_niks = re.findall(r'\b(\d{16})\b', text)
        if len(all_niks) > len(members):
            # Split text by NIK and parse each section
            members = []
            parts = re.split(r'\b(\d{16})\b', text)
            current_nik = None
            for part in parts:
                if re.match(r'^\d{16}$', part):
                    current_nik = part
                elif current_nik:
                    member = {'nik': current_nik}
                    # Try to extract name from the following text
                    name_in_part = re.search(r'(?:nama|name)?\s*[:\-]?\s*([A-Z][A-Za-z\s]+)', part)
                    if name_in_part:
                        member['name'] = name_in_part.group(1).strip()
                    members.append(member)
                    current_nik = None
            logger.info(f"[NKK PARSER] Method 4 (NIK split) found {len(members)} members")
    
    logger.info(f"[NKK PARSER] Final result: {len(members)} members")
    
    if members:
        # Extract family card number
        no_kk_match = re.search(r'(?:no\s*kk|no\.\s*kk|nomor\s*kk|family\s*id|no\s*kartu\s*keluarga)\s*[:\-]?\s*(\d{16})', text, re.IGNORECASE)
        head_match = re.search(r'(?:kepala\s*keluarga|head\s*of\s*family)\s*[:\-]?\s*(.+)', text, re.IGNORECASE)
        
        return {
            "no_kk": no_kk_match.group(1) if no_kk_match else None,
            "kepala_keluarga": head_match.group(1).strip() if head_match else None,
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
    """Check if target is inside any AOI and create alerts"""
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
                # Create new alert
                alert = {
                    "id": str(uuid.uuid4()),
                    "aoi_id": aoi['id'],
                    "aoi_name": aoi['name'],
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
                logging.info(f"[AOI ALERT] 🚨 Target {phone_number} entered AOI '{aoi['name']}' at ({lat}, {lng})")
                
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
    """Create a new AOI"""
    aoi = AOI(**aoi_data.model_dump())
    doc = aoi.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.aois.insert_one(doc)
    return {"message": "AOI created", "aoi": doc}

@api_router.get("/aois")
async def get_aois(username: str = Depends(verify_token)):
    """Get all AOIs"""
    aois = await db.aois.find({}, {"_id": 0}).to_list(100)
    return {"aois": aois}

@api_router.get("/aois/{aoi_id}")
async def get_aoi(aoi_id: str, username: str = Depends(verify_token)):
    """Get a specific AOI"""
    aoi = await db.aois.find_one({"id": aoi_id}, {"_id": 0})
    if not aoi:
        raise HTTPException(status_code=404, detail="AOI not found")
    return aoi

@api_router.put("/aois/{aoi_id}")
async def update_aoi(aoi_id: str, update_data: dict, username: str = Depends(verify_token)):
    """Update an AOI"""
    aoi = await db.aois.find_one({"id": aoi_id})
    if not aoi:
        raise HTTPException(status_code=404, detail="AOI not found")
    
    allowed_fields = ['name', 'coordinates', 'radius', 'monitored_targets', 'is_visible', 'alarm_enabled', 'color']
    update_fields = {k: v for k, v in update_data.items() if k in allowed_fields}
    
    if update_fields:
        await db.aois.update_one({"id": aoi_id}, {"$set": update_fields})
    
    updated_aoi = await db.aois.find_one({"id": aoi_id}, {"_id": 0})
    return {"message": "AOI updated", "aoi": updated_aoi}

@api_router.delete("/aois/{aoi_id}")
async def delete_aoi(aoi_id: str, username: str = Depends(verify_token)):
    """Delete an AOI"""
    result = await db.aois.delete_one({"id": aoi_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="AOI not found")
    # Also delete related alerts
    await db.aoi_alerts.delete_many({"aoi_id": aoi_id})
    return {"message": "AOI deleted"}

# AOI Alerts Endpoints
@api_router.get("/aoi-alerts")
async def get_aoi_alerts(acknowledged: Optional[bool] = None, username: str = Depends(verify_token)):
    """Get AOI alerts, optionally filtered by acknowledged status"""
    query = {}
    if acknowledged is not None:
        query["acknowledged"] = acknowledged
    
    alerts = await db.aoi_alerts.find(query, {"_id": 0}).sort("timestamp", -1).to_list(100)
    return {"alerts": alerts}

@api_router.post("/aoi-alerts/{alert_id}/acknowledge")
async def acknowledge_aoi_alert(alert_id: str, username: str = Depends(verify_token)):
    """Acknowledge an AOI alert"""
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
    """Acknowledge all unacknowledged alerts"""
    result = await db.aoi_alerts.update_many(
        {"acknowledged": False},
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
        "correct_api_id": CORRECT_TELEGRAM_API_ID,
        "is_correct": TELEGRAM_API_ID == CORRECT_TELEGRAM_API_ID,
        "runtime_matches_env": str(TELEGRAM_API_ID) == current_api_id
    }

# Events
@app.on_event("startup")
async def startup():
    global telegram_client
    
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
                    except:
                        pass
                    
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
        
        # Try to connect with restored session
        telegram_client = TelegramClient(
            SESSION_PATH,
            TELEGRAM_API_ID,
            TELEGRAM_API_HASH
        )
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