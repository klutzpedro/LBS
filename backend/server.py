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

# Telegram Client Setup - PERMANENT VALUES
# These are the correct API credentials for this application
# IMPORTANT: Always use these values, ignore any incorrect env variables
CORRECT_TELEGRAM_API_ID = 37983970
CORRECT_TELEGRAM_API_HASH = 'd484d8fe3d2f4025f99101caeb070e1a'

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
    ADMIN_PASSWORD = "Paparoni83"
    
    if request.username != ADMIN_USERNAME or request.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = jwt.encode(
        {"username": request.username},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM
    )
    
    return LoginResponse(token=token, username=request.username)

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
        # Start background task to query bot
        asyncio.create_task(query_telegram_bot(target.id, target_data.phone_number))
    
    return target

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
    - Queries new position from Telegram
    - Keeps all existing pendalaman data intact
    """
    target = await db.targets.find_one({"id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    phone_number = target.get('phone_number')
    
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
    
    logging.info(f"[REFRESH] Starting position refresh for {phone_number} (target: {target_id})")
    
    # Start background task to query new position
    asyncio.create_task(query_telegram_bot_refresh(target_id, phone_number))
    
    return {
        "message": "Position refresh started",
        "target_id": target_id,
        "phone_number": phone_number,
        "previous_position_saved": True
    }

async def query_telegram_bot_refresh(target_id: str, phone_number: str):
    """
    Query Telegram bot for updated position.
    Similar to query_telegram_bot but updates existing target instead of creating new.
    """
    global telegram_client
    
    try:
        if telegram_client is None or not telegram_client.is_connected():
            logging.error("[REFRESH] Telegram client not connected")
            await db.targets.update_one(
                {"id": target_id},
                {"$set": {"status": "error", "error": "Telegram tidak terkoneksi"}}
            )
            return
        
        # Get current target for chat history
        target = await db.targets.find_one({"id": target_id}, {"_id": 0})
        
        bot_username = "northarch_bot"
        
        # Send phone number query (no prefix needed)
        message_text = f"{phone_number}"
        await telegram_client.send_message(bot_username, message_text)
        logging.info(f"[REFRESH] Sent: {message_text} to @{bot_username}")
        
        # Save sent message to chat history
        await db.chat_messages.insert_one({
            "target_id": target_id,
            "direction": "sent",
            "content": message_text,
            "timestamp": datetime.now(timezone.utc)
        })
        
        # Wait for response (max 60 seconds)
        await asyncio.sleep(3)
        
        received_response = False
        for attempt in range(20):  # Try for 60 seconds
            messages = await telegram_client.get_messages(bot_username, limit=5)
            
            for msg in messages:
                if msg.text and phone_number in msg.text:
                    logging.info(f"[REFRESH] Got response for {phone_number}")
                    
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
                        logging.info(f"[REFRESH] Updated position for {phone_number}: {lat}, {lng}")
                        
                        # Check AOI alerts for new position
                        await check_aoi_alerts(target_id, phone_number, lat, lng)
                        
                        received_response = True
                        break
                    else:
                        # No coordinates found - might be "not found" response
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
            # Timeout - revert to completed status with previous data
            await db.targets.update_one(
                {"id": target_id},
                {"$set": {
                    "status": "completed" if target.get('data') else "error",
                    "error": "Timeout waiting for bot response"
                }}
            )
            logging.warning(f"[REFRESH] Timeout for {phone_number}")
            
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
    
    # Set target to processing state
    await db.targets.update_one(
        {"id": target_id},
        {"$set": {"status": "processing"}}
    )
    
    # Process in background - update position via Telegram
    asyncio.create_task(query_telegram_bot(target_id, phone_number))
    
    logging.info(f"[SCHEDULE] Executing scheduled update for {phone_number} (schedule: {schedule_id})")
    
    return {
        "message": f"Updating position for {phone_number}",
        "target_id": target_id,
        "next_run": next_run.isoformat()
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
            # Initialize client if not exists or reconnect if disconnected
            if telegram_client is None or not telegram_client.is_connected():
                # Close existing client if any
                if telegram_client:
                    try:
                        await telegram_client.disconnect()
                    except:
                        pass
                
                telegram_client = TelegramClient(
                    '/app/backend/northarch_session',
                    TELEGRAM_API_ID,
                    TELEGRAM_API_HASH
                )
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
            logger.warning(f"Send code attempt {attempt} failed: {e}")
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
        session_path = '/app/backend/northarch_session.session'
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
    
    session_exists = os.path.exists('/app/backend/northarch_session.session')
    
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
                '/app/backend/northarch_session',
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
        # Disconnect existing client
        if telegram_client is not None:
            try:
                await telegram_client.disconnect()
                logging.info("Disconnected existing Telegram client")
            except Exception as e:
                logging.warning(f"Error disconnecting client: {e}")
        
        # Reset global variables
        telegram_client = None
        telegram_phone_code_hash = None
        
        # Delete session files
        session_files = [
            '/app/backend/northarch_session.session',
            '/app/backend/northarch_session.session-journal'
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
        
        return {
            "success": True,
            "message": "Telegram connection reset successfully",
            "deleted_files": deleted_files,
            "status": "You need to setup Telegram again"
        }
    except Exception as e:
        logging.error(f"Error resetting Telegram connection: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def query_telegram_bot(target_id: str, phone_number: str):
    try:
        # Update status: connecting
        await db.targets.update_one(
            {"id": target_id},
            {"$set": {"status": "connecting"}}
        )
        
        # Initialize Telethon client if not already initialized
        global telegram_client
        if telegram_client is None:
            telegram_client = TelegramClient(
                '/app/backend/northarch_session',
                TELEGRAM_API_ID,
                TELEGRAM_API_HASH
            )
            await telegram_client.start()
            logging.info("Telegram client started")
        
        # Create unique token for this query
        query_token = f"CP_{phone_number}_{target_id[:8]}"
        
        await asyncio.sleep(1)
        
        # Update status: querying
        await db.targets.update_one(
            {"id": target_id},
            {"$set": {"status": "querying"}}
        )
        
        try:
            # Send phone number with token marker
            message_text = f"{phone_number}"
            await telegram_client.send_message(BOT_USERNAME, message_text)
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
            
            # Get latest messages from bot
            messages = await telegram_client.get_messages(BOT_USERNAME, limit=5)
            logging.info(f"[TARGET {target_id}] Retrieved {len(messages)} messages from bot")
            
            # Look for message with buttons
            cp_clicked = False
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
                                # Click the CP button
                                await button.click()
                                logging.info(f"[TARGET {target_id}] ✓ Clicked CP button: {button.text}")
                                
                                # Save click action
                                await db.chat_messages.insert_one({
                                    "id": str(uuid.uuid4()),
                                    "target_id": target_id,
                                    "timestamp": datetime.now(timezone.utc).isoformat(),
                                    "direction": "sent",
                                    "message": f"🔘 Clicked button: {button.text}",
                                    "has_buttons": False
                                })
                                
                                cp_clicked = True
                                break
                    if cp_clicked:
                        break
            
            if not cp_clicked:
                logging.warning(f"[TARGET {target_id}] ⚠ CP button not found in messages")
            
            # Wait longer for bot to process and respond
            logging.info(f"[TARGET {target_id}] Waiting for location response...")
            await asyncio.sleep(8)
            
            # Update status: parsing
            await db.targets.update_one(
                {"id": target_id},
                {"$set": {"status": "parsing"}}
            )
            
            # Get the response after clicking CP - get more messages
            response_messages = await telegram_client.get_messages(BOT_USERNAME, limit=20)
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
    """Query Reghp data for deeper information"""
    try:
        global telegram_client
        
        if telegram_client is None:
            telegram_client = TelegramClient(
                '/app/backend/northarch_session',
                TELEGRAM_API_ID,
                TELEGRAM_API_HASH
            )
            await telegram_client.start()
            logging.info("Telegram client started for Reghp query")
        
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
        
        # Send phone number to bot
        await telegram_client.send_message(BOT_USERNAME, phone_number)
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
        
        # Get messages and look for "Reghp" button
        messages = await telegram_client.get_messages(BOT_USERNAME, limit=5)
        
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
                            await button.click()
                            logging.info(f"[{query_token}] ✓ Clicked Reghp button")
                            
                            # Log button clicked
                            await db.chat_messages.insert_one({
                                "target_id": target_id,
                                "message": f"[PENDALAMAN] ✅ Klik tombol REGHP...",
                                "direction": "sent",
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                                "query_type": "reghp"
                            })
                            
                            reghp_clicked = True
                            break
                if reghp_clicked:
                    break
        
        if not reghp_clicked:
            logging.warning(f"[{query_token}] Reghp button not found")
            
            # Log button not found
            await db.chat_messages.insert_one({
                "target_id": target_id,
                "message": f"[PENDALAMAN] ⚠️ Tombol REGHP tidak ditemukan",
                "direction": "received",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "query_type": "reghp"
            })
        
        # Wait for response
        await asyncio.sleep(8)
        
        # Get Reghp response - ONLY messages containing our phone number
        response_messages = await telegram_client.get_messages(BOT_USERNAME, limit=15)
        
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
                    "message": f"[PENDALAMAN] ⚠️ REGHP: Data Not Found",
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
                "message": f"[PENDALAMAN] ❌ REGHP gagal - tidak ada response",
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
    """Query NIK detail dengan foto dari bot"""
    try:
        global telegram_client
        
        if telegram_client is None:
            telegram_client = TelegramClient(
                '/app/backend/northarch_session',
                TELEGRAM_API_ID,
                TELEGRAM_API_HASH
            )
            await telegram_client.start()
            logging.info("Telegram client started for NIK query")
        
        query_token = f"NIK_{nik}_{target_id[:8]}"
        logging.info(f"[{query_token}] Starting NIK query")
        
        # IMPORTANT: Add delay to prevent concurrent queries mixing
        await asyncio.sleep(2)
        
        # Send NIK to bot
        await telegram_client.send_message(BOT_USERNAME, nik)
        logging.info(f"[{query_token}] Sent NIK: {nik} to bot")
        
        await asyncio.sleep(5)  # Increased wait
        
        # Get messages and look for "NIK" button
        messages = await telegram_client.get_messages(BOT_USERNAME, limit=5)
        
        nik_clicked = False
        for msg in messages:
            if msg.buttons:
                button_texts = [[btn.text for btn in row] for row in msg.buttons]
                logging.info(f"[{query_token}] Buttons found: {button_texts}")
                
                for row in msg.buttons:
                    for button in row:
                        if button.text and 'NIK' in button.text.upper():
                            await button.click()
                            logging.info(f"[{query_token}] ✓ Clicked NIK button")
                            nik_clicked = True
                            break
                if nik_clicked:
                    break
        
        if not nik_clicked:
            logging.warning(f"[{query_token}] NIK button not found")
        
        # Wait longer for response with photo
        await asyncio.sleep(12)  # Increased from 10
        
        # Get NIK response - ONLY messages containing our exact NIK
        response_messages = await telegram_client.get_messages(BOT_USERNAME, limit=20)
        
        nik_info = None
        photo_path = None
        found_matching_response = False
        
        for msg in response_messages:
            # STRICT TOKENIZATION: Must contain exact NIK we queried
            if msg.text and nik in msg.text:
                logging.info(f"[{query_token}] Found message containing NIK {nik}")
                
                # Verify this is the RIGHT response (contains our NIK)
                # Check if it's identity data (not just mention)
                if ('identity of' in msg.text.lower() and nik in msg.text.lower()) or \
                   (f'NIK: {nik}' in msg.text or f'NIK:{nik}' in msg.text):
                    
                    logging.info(f"[{query_token}] ✓ CONFIRMED: This is response for NIK {nik}")
                    found_matching_response = True
                    
                    # Parse identity data
                    if 'identity' in msg.text.lower() or 'full name' in msg.text.lower():
                        logging.info(f"[{query_token}] Parsing identity data...")
                        
                        nik_info = {
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
                            # Must start with capital letter and have : near beginning (within first 25 chars)
                            is_new_key = False
                            if ':' in line:
                                colon_pos = line.index(':')
                                # New key if colon is in first part and line doesn't seem like continuation
                                if colon_pos < 25 and not line.startswith(' ') and line[0].isupper():
                                    potential_key = line.split(':', 1)[0].strip()
                                    # Valid keys are usually short (< 20 chars) and don't have "KOTA" or "RT" etc
                                    if len(potential_key) < 20 and not any(word in potential_key for word in ['KOTA', 'RT.', 'RW.', 'KEL.', 'KEC.', 'KODE POS']):
                                        is_new_key = True
                            
                            if is_new_key:
                                # Save previous key-value
                                if current_key:
                                    parsed_data[current_key] = current_value.strip()
                                
                                # Parse new key-value
                                parts = line.split(':', 1)
                                current_key = parts[0].strip()
                                current_value = parts[1].strip() if len(parts) == 2 else ""
                            else:
                                # Continuation line (multi-line value like Address)
                                if current_key and line:
                                    current_value += " " + line
                        
                        # Save last key-value
                        if current_key:
                            parsed_data[current_key] = current_value.strip()
                        
                        nik_info['parsed_data'] = parsed_data
                        logging.info(f"[{query_token}] Parsed {len(parsed_data)} fields: {list(parsed_data.keys())}")
                        
                        # VERIFY: Check if parsed NIK matches queried NIK
                        if parsed_data.get('NIK') == nik:
                            logging.info(f"[{query_token}] ✓✓ NIK VERIFIED: Data matches queried NIK")
                        else:
                            logging.error(f"[{query_token}] ✗✗ NIK MISMATCH: Parsed NIK {parsed_data.get('NIK')} != Queried NIK {nik}")
                            nik_info = None  # Discard wrong data
                            break
            
            # Check for photo in messages (must be near our NIK response)
            if msg.photo and not photo_path and found_matching_response:
                # Download photo only if we found matching text response
                photo_bytes = await telegram_client.download_media(msg.photo, bytes)
                if photo_bytes:
                    import base64
                    photo_base64 = base64.b64encode(photo_bytes).decode('utf-8')
                    photo_path = f"data:image/jpeg;base64,{photo_base64}"
                    logging.info(f"[{query_token}] ✓ Photo downloaded ({len(photo_bytes)} bytes)")
        
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
    """Query Family (NKK) data dengan Family ID - Stores per NIK"""
    try:
        global telegram_client
        
        if telegram_client is None:
            telegram_client = TelegramClient(
                '/app/backend/northarch_session',
                TELEGRAM_API_ID,
                TELEGRAM_API_HASH
            )
            await telegram_client.start()
            logging.info("Telegram client started for Family query")
        
        query_token = f"FAMILY_{family_id}_{target_id[:8]}"
        logging.info(f"[{query_token}] Starting Family query for NIK: {source_nik}")
        
        # Add delay
        await asyncio.sleep(2)
        
        # Send Family ID to bot
        await telegram_client.send_message(BOT_USERNAME, family_id)
        logging.info(f"[{query_token}] Sent Family ID: {family_id}")
        
        await asyncio.sleep(5)
        
        # Look for NKK button
        messages = await telegram_client.get_messages(BOT_USERNAME, limit=5)
        
        nkk_clicked = False
        for msg in messages:
            if msg.buttons:
                button_texts = [[btn.text for btn in row] for row in msg.buttons]
                logging.info(f"[{query_token}] Buttons: {button_texts}")
                
                for row in msg.buttons:
                    for button in row:
                        if button.text and ('NKK' in button.text.upper() or 'FAMILY' in button.text.upper()):
                            await button.click()
                            logging.info(f"[{query_token}] ✓ Clicked NKK button")
                            nkk_clicked = True
                            break
                if nkk_clicked:
                    break
        
        if not nkk_clicked:
            logging.warning(f"[{query_token}] NKK button not found")
        
        # Wait for family data response
        await asyncio.sleep(10)
        
        # Get family response - Look for family/household data with multiple members
        response_messages = await telegram_client.get_messages(BOT_USERNAME, limit=20)
        
        family_info = None
        for msg in response_messages:
            if msg.text and family_id in msg.text:
                # Look for NKK/Family Card data (multiple members)
                # Keywords: "Kartu Keluarga", "NKK", "Household", "Anggota"
                text_lower = msg.text.lower()
                
                if any(keyword in text_lower for keyword in ['kartu keluarga', 'nkk', 'household', 'anggota keluarga', 'family card']):
                    logging.info(f"[{query_token}] ✓ Found NKK/Family Card response")
                    
                    # Parse family members from NKK format
                    # Format bisa berbeda - bisa list atau table
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
    session_path = '/app/backend/northarch_session.session'
    
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
                logger.info(f"Restored Telegram session from MongoDB backup (user: {session_backup.get('username')})")
        except Exception as restore_err:
            logger.warning(f"Failed to restore session from MongoDB: {restore_err}")
    
    # Now try to connect
    if os.path.exists(session_path):
        logger.info("Found Telegram session, attempting to reconnect...")
        try:
            telegram_client = TelegramClient(
                '/app/backend/northarch_session',
                TELEGRAM_API_ID,
                TELEGRAM_API_HASH
            )
            await telegram_client.connect()
            
            if await telegram_client.is_user_authorized():
                me = await telegram_client.get_me()
                logger.info(f"Telegram auto-reconnected as {me.username or me.phone}")
            else:
                logger.warning("Telegram session exists but not authorized")
        except Exception as e:
            logger.error(f"Failed to auto-reconnect Telegram: {e}")
    else:
        logger.info("No Telegram session found")
    
    # Start background keep-alive task
    asyncio.create_task(telegram_keepalive_task())

# Background task to keep Telegram connection alive
async def telegram_keepalive_task():
    """Background task that periodically checks and maintains Telegram connection"""
    global telegram_client
    
    logger.info("Starting Telegram keepalive background task")
    
    while True:
        try:
            await asyncio.sleep(60)  # Check every 60 seconds
            
            if telegram_client is None:
                continue
                
            # Check if connected
            if not telegram_client.is_connected():
                logger.warning("[Keepalive] Telegram client disconnected, attempting reconnect...")
                try:
                    await telegram_client.connect()
                    if telegram_client.is_connected():
                        logger.info("[Keepalive] Telegram reconnected successfully")
                except Exception as reconnect_err:
                    logger.error(f"[Keepalive] Reconnect failed: {reconnect_err}")
            
            # Ping to keep session alive (only if connected and authorized)
            if telegram_client.is_connected():
                try:
                    if await telegram_client.is_user_authorized():
                        # Simple ping by getting self
                        await telegram_client.get_me()
                        logger.debug("[Keepalive] Telegram session ping successful")
                except Exception as ping_err:
                    logger.warning(f"[Keepalive] Ping failed: {ping_err}")
                    
        except Exception as e:
            logger.error(f"[Keepalive] Error in keepalive task: {e}")

@api_router.post("/telegram/force-restore-session")
async def force_restore_session(username: str = Depends(verify_token)):
    """Force restore Telegram session from MongoDB backup"""
    global telegram_client
    
    session_path = '/app/backend/northarch_session.session'
    
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
            '/app/backend/northarch_session',
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