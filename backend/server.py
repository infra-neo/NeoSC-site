from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, BackgroundTasks
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
import uuid
import bcrypt
import jwt
import secrets
import asyncio
import random
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional
from contextlib import asynccontextmanager

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Config
JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ.get("JWT_SECRET", secrets.token_hex(32))

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    created_at: str

class PlanResponse(BaseModel):
    id: str
    name: str
    description: str
    vcpu: int
    ram_gb: int
    disk_gb: int
    price_monthly: float
    price_annual: float
    features: List[str]

class OrderCreate(BaseModel):
    plan_id: str
    billing_period: str = "monthly"
    region: str = "eu-west"

class OrderResponse(BaseModel):
    id: str
    user_id: str
    plan_id: str
    plan_name: str
    status: str
    billing_period: str
    total_price: float
    region: str
    provisioning_step: Optional[str] = None
    created_at: str

class VMResponse(BaseModel):
    id: str
    order_id: str
    name: str
    status: str
    internal_ip: Optional[str] = None
    netbird_ip: Optional[str] = None
    tunnel_hostname: Optional[str] = None
    vcpu: int
    ram_gb: int
    disk_gb: int
    region: str
    has_tsplus: bool
    created_at: str

class VMMetrics(BaseModel):
    cpu_percent: float
    ram_percent: float
    disk_percent: float
    network_in_mb: float
    network_out_mb: float

class SimulatePaymentRequest(BaseModel):
    order_id: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

# ==================== AUTH HELPERS ====================

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=60),
        "type": "access"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def require_admin(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") not in ["admin", "platform_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# ==================== SEED DATA ====================

async def seed_data():
    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@windesk.cloud")
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin123!")
    
    existing_admin = await db.users.find_one({"email": admin_email})
    if not existing_admin:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Platform Admin",
            "role": "platform_admin",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info(f"Admin user created: {admin_email}")
    
    # Seed plans
    plans = [
        {
            "id": "starter",
            "name": "Starter",
            "description": "Ideal para uso personal o pequeños equipos",
            "vcpu": 2,
            "ram_gb": 4,
            "disk_gb": 80,
            "price_monthly": 29.99,
            "price_annual": 299.90,
            "features": ["Windows 11 Pro", "TSplus HTML5", "2 usuarios simultáneos", "Soporte por email"]
        },
        {
            "id": "business",
            "name": "Business",
            "description": "Para equipos en crecimiento",
            "vcpu": 4,
            "ram_gb": 8,
            "disk_gb": 160,
            "price_monthly": 59.99,
            "price_annual": 599.90,
            "features": ["Windows 11 Pro", "TSplus HTML5", "5 usuarios simultáneos", "Soporte prioritario", "Snapshots diarios"]
        },
        {
            "id": "enterprise",
            "name": "Enterprise",
            "description": "Máximo rendimiento para grandes equipos",
            "vcpu": 8,
            "ram_gb": 16,
            "disk_gb": 320,
            "price_monthly": 119.99,
            "price_annual": 1199.90,
            "features": ["Windows 11 Pro", "TSplus HTML5", "10 usuarios simultáneos", "Soporte 24/7", "Snapshots cada hora", "IP dedicada"]
        }
    ]
    
    for plan in plans:
        await db.plans.update_one({"id": plan["id"]}, {"$set": plan}, upsert=True)
    logger.info("Plans seeded")
    
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    
    # Write test credentials
    os.makedirs("/app/memory", exist_ok=True)
    with open("/app/memory/test_credentials.md", "w") as f:
        f.write("# WinDesk Cloud Test Credentials\n\n")
        f.write("## Admin Account\n")
        f.write(f"- Email: {admin_email}\n")
        f.write(f"- Password: {admin_password}\n")
        f.write("- Role: platform_admin\n\n")
        f.write("## Auth Endpoints\n")
        f.write("- POST /api/auth/register\n")
        f.write("- POST /api/auth/login\n")
        f.write("- POST /api/auth/logout\n")
        f.write("- GET /api/auth/me\n")

# ==================== LIFESPAN ====================

@asynccontextmanager
async def lifespan(app: FastAPI):
    await seed_data()
    yield
    client.close()

# ==================== APP SETUP ====================

app = FastAPI(title="WinDesk Cloud API", lifespan=lifespan)
api_router = APIRouter(prefix="/api")

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register")
async def register(data: UserRegister, response: Response):
    email = data.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_doc = {
        "email": email,
        "password_hash": hash_password(data.password),
        "name": data.name,
        "role": "customer",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    
    return {"id": user_id, "email": email, "name": data.name, "role": "customer"}

@api_router.post("/auth/login")
async def login(data: UserLogin, request: Request, response: Response):
    email = data.email.lower()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    
    # Check brute force lockout
    attempts = await db.login_attempts.find_one({"identifier": identifier})
    if attempts and attempts.get("count", 0) >= 5:
        lockout_until = attempts.get("lockout_until")
        if lockout_until and datetime.fromisoformat(lockout_until) > datetime.now(timezone.utc):
            raise HTTPException(status_code=429, detail="Too many login attempts. Please try again later.")
    
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        # Increment failed attempts
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {
                "$inc": {"count": 1},
                "$set": {"lockout_until": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()}
            },
            upsert=True
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Clear failed attempts on success
    await db.login_attempts.delete_one({"identifier": identifier})
    
    user_id = str(user["_id"])
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    
    return {"id": user_id, "email": user["email"], "name": user["name"], "role": user["role"]}

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/", secure=True, samesite="none")
    response.delete_cookie("refresh_token", path="/", secure=True, samesite="none")
    return {"message": "Logged out successfully"}

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "created_at": user.get("created_at", "")
    }

@api_router.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        access_token = create_access_token(str(user["_id"]), user["email"])
        response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=3600, path="/")
        return {"message": "Token refreshed"}
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

@api_router.post("/auth/forgot-password")
async def forgot_password(data: ForgotPasswordRequest):
    email = data.email.lower()
    user = await db.users.find_one({"email": email})
    if user:
        token = secrets.token_urlsafe(32)
        await db.password_reset_tokens.insert_one({
            "token": token,
            "user_id": str(user["_id"]),
            "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
            "used": False
        })
        logger.info(f"Password reset link: /reset-password?token={token}")
    return {"message": "If the email exists, a reset link has been sent"}

@api_router.post("/auth/reset-password")
async def reset_password(data: ResetPasswordRequest):
    token_doc = await db.password_reset_tokens.find_one({"token": data.token, "used": False})
    if not token_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    
    if datetime.fromisoformat(str(token_doc["expires_at"])) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Token expired")
    
    await db.users.update_one(
        {"_id": ObjectId(token_doc["user_id"])},
        {"$set": {"password_hash": hash_password(data.new_password)}}
    )
    await db.password_reset_tokens.update_one({"token": data.token}, {"$set": {"used": True}})
    return {"message": "Password reset successfully"}

# ==================== PLANS ROUTES ====================

@api_router.get("/plans", response_model=List[PlanResponse])
async def get_plans():
    plans = await db.plans.find({}, {"_id": 0}).to_list(100)
    return plans

@api_router.get("/plans/{plan_id}", response_model=PlanResponse)
async def get_plan(plan_id: str):
    plan = await db.plans.find_one({"id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan

# ==================== ORDERS ROUTES ====================

@api_router.post("/orders")
async def create_order(data: OrderCreate, user: dict = Depends(get_current_user)):
    plan = await db.plans.find_one({"id": data.plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    price = plan["price_annual"] if data.billing_period == "annual" else plan["price_monthly"]
    order_id = str(uuid.uuid4())[:8]
    
    order_doc = {
        "id": order_id,
        "user_id": user["id"],
        "plan_id": data.plan_id,
        "plan_name": plan["name"],
        "status": "pending",
        "billing_period": data.billing_period,
        "total_price": price,
        "region": data.region,
        "provisioning_step": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.orders.insert_one(order_doc)
    order_doc.pop("_id", None)
    return order_doc

@api_router.get("/orders", response_model=List[OrderResponse])
async def get_orders(user: dict = Depends(get_current_user)):
    query = {} if user["role"] in ["admin", "platform_admin"] else {"user_id": user["id"]}
    orders = await db.orders.find(query, {"_id": 0}).to_list(100)
    return orders

@api_router.get("/orders/{order_id}", response_model=OrderResponse)
async def get_order(order_id: str, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] not in ["admin", "platform_admin"] and order["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    return order

# ==================== BILLING (DEMO MODE) ====================

async def simulate_provisioning(order_id: str):
    """Simulates VM provisioning process in demo mode"""
    steps = [
        ("creating_vm", 2),
        ("installing_windows", 3),
        ("configuring_network", 2),
        ("installing_tsplus", 2),
        ("configuring_netbird", 1),
        ("creating_tunnel", 1),
        ("finalizing", 1)
    ]
    
    for step, delay in steps:
        await db.orders.update_one({"id": order_id}, {"$set": {"provisioning_step": step, "status": "provisioning"}})
        await asyncio.sleep(delay)
    
    # Get order and plan details
    order = await db.orders.find_one({"id": order_id})
    plan = await db.plans.find_one({"id": order["plan_id"]})
    
    # Create VM record
    vm_doc = {
        "id": f"vm-{order_id}",
        "order_id": order_id,
        "user_id": order["user_id"],
        "name": f"WinDesk-{order_id.upper()}",
        "status": "active",
        "internal_ip": f"10.100.10.{random.randint(100, 250)}",
        "netbird_ip": f"100.79.{random.randint(1, 254)}.{random.randint(1, 254)}",
        "tunnel_hostname": f"{order_id}.desk.kappa4.com",
        "vcpu": plan["vcpu"],
        "ram_gb": plan["ram_gb"],
        "disk_gb": plan["disk_gb"],
        "region": order["region"],
        "has_tsplus": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.vms.insert_one(vm_doc)
    
    # Update order status
    await db.orders.update_one({"id": order_id}, {"$set": {"status": "active", "provisioning_step": "completed"}})
    logger.info(f"VM provisioned for order {order_id}")

@api_router.post("/billing/simulate")
async def simulate_payment(data: SimulatePaymentRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    """Demo mode: Simulates a successful payment and starts provisioning"""
    order = await db.orders.find_one({"id": data.order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if order["status"] != "pending":
        raise HTTPException(status_code=400, detail="Order already processed")
    
    await db.orders.update_one({"id": data.order_id}, {"$set": {"status": "paid"}})
    background_tasks.add_task(simulate_provisioning, data.order_id)
    
    return {"message": "Payment simulated successfully", "order_id": data.order_id}

# ==================== VMS ROUTES ====================

@api_router.get("/vms", response_model=List[VMResponse])
async def get_vms(user: dict = Depends(get_current_user)):
    query = {} if user["role"] in ["admin", "platform_admin"] else {"user_id": user["id"]}
    vms = await db.vms.find(query, {"_id": 0}).to_list(100)
    return vms

@api_router.get("/vms/{vm_id}", response_model=VMResponse)
async def get_vm(vm_id: str, user: dict = Depends(get_current_user)):
    vm = await db.vms.find_one({"id": vm_id}, {"_id": 0})
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
    if user["role"] not in ["admin", "platform_admin"] and vm["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    return vm

@api_router.get("/vms/{vm_id}/metrics", response_model=VMMetrics)
async def get_vm_metrics(vm_id: str, user: dict = Depends(get_current_user)):
    """Returns simulated metrics for demo mode"""
    vm = await db.vms.find_one({"id": vm_id})
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
    if user["role"] not in ["admin", "platform_admin"] and vm["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Simulated metrics
    return VMMetrics(
        cpu_percent=round(random.uniform(10, 60), 1),
        ram_percent=round(random.uniform(30, 70), 1),
        disk_percent=round(random.uniform(20, 50), 1),
        network_in_mb=round(random.uniform(0.5, 10), 2),
        network_out_mb=round(random.uniform(0.1, 5), 2)
    )

@api_router.post("/vms/{vm_id}/restart")
async def restart_vm(vm_id: str, user: dict = Depends(get_current_user)):
    vm = await db.vms.find_one({"id": vm_id})
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
    if user["role"] not in ["admin", "platform_admin"] and vm["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    await db.vms.update_one({"id": vm_id}, {"$set": {"status": "restarting"}})
    await asyncio.sleep(2)
    await db.vms.update_one({"id": vm_id}, {"$set": {"status": "active"}})
    return {"message": "VM restarted successfully"}

@api_router.post("/vms/{vm_id}/snapshot")
async def create_snapshot(vm_id: str, user: dict = Depends(get_current_user)):
    vm = await db.vms.find_one({"id": vm_id})
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
    if user["role"] not in ["admin", "platform_admin"] and vm["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    snapshot_id = f"snap-{uuid.uuid4().hex[:8]}"
    await db.snapshots.insert_one({
        "id": snapshot_id,
        "vm_id": vm_id,
        "user_id": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    return {"message": "Snapshot created", "snapshot_id": snapshot_id}

@api_router.get("/vms/{vm_id}/access-url")
async def get_access_url(vm_id: str, user: dict = Depends(get_current_user)):
    vm = await db.vms.find_one({"id": vm_id}, {"_id": 0})
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
    if user["role"] not in ["admin", "platform_admin"] and vm["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return {
        "tsplus_url": "https://web.tsplus.html5/",
        "rdp_ip": vm["netbird_ip"],
        "internal_ip": vm["internal_ip"]
    }

# ==================== ADMIN ROUTES ====================

@api_router.get("/admin/stats")
async def get_admin_stats(user: dict = Depends(require_admin)):
    total_users = await db.users.count_documents({})
    total_vms = await db.vms.count_documents({})
    active_vms = await db.vms.count_documents({"status": "active"})
    total_orders = await db.orders.count_documents({})
    pending_orders = await db.orders.count_documents({"status": "pending"})
    
    return {
        "total_users": total_users,
        "total_vms": total_vms,
        "active_vms": active_vms,
        "total_orders": total_orders,
        "pending_orders": pending_orders
    }

@api_router.get("/admin/users")
async def get_all_users(user: dict = Depends(require_admin)):
    users = await db.users.find({}, {"password_hash": 0}).to_list(1000)
    for u in users:
        u["id"] = str(u.pop("_id"))
    return users

@api_router.get("/admin/orders")
async def get_all_orders(user: dict = Depends(require_admin)):
    orders = await db.orders.find({}, {"_id": 0}).to_list(1000)
    return orders

# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "WinDesk Cloud API", "version": "1.0.0", "mode": "DEMO"}

@api_router.get("/health")
async def health():
    return {"status": "healthy"}

# Include router and add middleware
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
