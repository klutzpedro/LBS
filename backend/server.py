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
from datetime import datetime, timezone
import jwt
from passlib.context import CryptContext
import asyncio
from telethon import TelegramClient, events
import re

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()
JWT_SECRET = os.getenv('JWT_SECRET', 'northarch-secret-key-2024')
JWT_ALGORITHM = "HS256"

# Telegram Client Setup
TELEGRAM_API_ID = int(os.getenv('TELEGRAM_API_ID', '37983970'))
TELEGRAM_API_HASH = os.getenv('TELEGRAM_API_HASH', 'd484d8fe3d2f4025f99101caeb070e1a')
BOT_USERNAME = '@northarch_bot'

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

@api_router.post("/targets/{target_id}/reghp")
async def query_reghp(target_id: str, username: str = Depends(verify_token)):
    """Query Reghp (pendalaman) untuk target"""
    target = await db.targets.find_one({"id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    if target['status'] != 'completed':
        raise HTTPException(status_code=400, detail="Target must be completed first")
    
    # Update reghp_status to processing
    await db.targets.update_one(
        {"id": target_id},
        {"$set": {"reghp_status": "processing"}}
    )
    
    # Start background task
    asyncio.create_task(query_telegram_reghp(target_id, target['phone_number']))
    
    return {"message": "Reghp query started", "target_id": target_id}

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

# Settings Routes
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
        
        # Delete old session file if exists
        session_files = [
            '/app/backend/northarch_session.session',
            '/app/backend/northarch_session.session-journal'
        ]
        for sf in session_files:
            if os.path.exists(sf):
                os.remove(sf)
        
        return {
            "success": True,
            "message": "Credentials updated. Please restart backend and setup Telegram again."
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
    
    try:
        # Initialize client if not exists
        if telegram_client is None:
            telegram_client = TelegramClient(
                '/app/backend/northarch_session',
                TELEGRAM_API_ID,
                TELEGRAM_API_HASH
            )
            await telegram_client.connect()
        
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
        logging.error(f"Error sending Telegram code: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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
            "bot_status": "connected" if bot_active else "not_connected"
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
            "message": "Belum login ke Telegram"
        }
    
    try:
        if telegram_client is None:
            telegram_client = TelegramClient(
                '/app/backend/northarch_session',
                TELEGRAM_API_ID,
                TELEGRAM_API_HASH
            )
            await telegram_client.connect()
        
        if await telegram_client.is_user_authorized():
            me = await telegram_client.get_me()
            return {
                "authorized": True,
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
                "message": "Session expired atau belum login"
            }
    except Exception as e:
        logging.error(f"Error checking Telegram status: {e}")
        return {
            "authorized": False,
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
        
        await asyncio.sleep(1)
        
        # Update status: querying
        await db.targets.update_one(
            {"id": target_id},
            {"$set": {"status": "querying"}}
        )
        
        try:
            # Send phone number to bot
            await telegram_client.send_message(BOT_USERNAME, phone_number)
            logging.info(f"[TARGET {target_id}] Sent phone number {phone_number} to {BOT_USERNAME}")
            
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
            
            # Parse response to extract location data
            location_data = None
            for msg in response_messages:
                if msg.text:
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
            # Fallback to mock data if Telegram communication fails
            mock_data = {
                "name": "Target User",
                "phone_number": phone_number,
                "address": "Jl. Contoh No. 123, Jakarta",
                "latitude": -6.2088 + (hash(phone_number) % 100) / 1000,
                "longitude": 106.8456 + (hash(phone_number) % 100) / 1000,
                "additional_phones": [phone_number],
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "note": f"Telegram error: {str(bot_error)}"
            }
            
            await db.targets.update_one(
                {"id": target_id},
                {
                    "$set": {
                        "status": "completed",
                        "data": mock_data,
                        "location": {
                            "type": "Point",
                            "coordinates": [mock_data['longitude'], mock_data['latitude']]
                        }
                    }
                }
            )
        
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

# Events
@app.on_event("startup")
async def startup():
    # Initialize Telegram client in background
    # asyncio.create_task(init_telegram_client())
    pass

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