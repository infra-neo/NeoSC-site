from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, BackgroundTasks
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import RedirectResponse
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
import httpx
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

# Zitadel OIDC Config
ZITADEL_DOMAIN = os.environ.get("ZITADEL_DOMAIN", "")
ZITADEL_CLIENT_ID = os.environ.get("ZITADEL_CLIENT_ID", "")
ZITADEL_CALLBACK_URL = os.environ.get("ZITADEL_CALLBACK_URL", "")
ZITADEL_POST_LOGOUT_URL = os.environ.get("ZITADEL_POST_LOGOUT_URL", "")

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

# ==================== GROUP, ROLE, ACL, POLICY MODELS ====================

class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = ""

class GroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    member_ids: Optional[List[str]] = None

class RoleCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    permissions: List[str] = []

class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[List[str]] = None

class ACLCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    resource_type: str  # "vm", "group", "all"
    resource_ids: List[str] = []
    allowed_actions: List[str] = []  # "connect_tsplus", "connect_1panel", "restart", "snapshot", "view"
    enabled: bool = True

class ACLUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    resource_ids: Optional[List[str]] = None
    allowed_actions: Optional[List[str]] = None
    enabled: Optional[bool] = None

class PolicyCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    policy_type: str  # "user_vm", "group_vm"
    subject_type: str  # "user", "group"
    subject_ids: List[str] = []
    vm_ids: List[str] = []
    acl_id: Optional[str] = None
    enabled: bool = True

class PolicyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    subject_ids: Optional[List[str]] = None
    vm_ids: Optional[List[str]] = None
    acl_id: Optional[str] = None
    enabled: Optional[bool] = None

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    group_ids: Optional[List[str]] = None
    enabled: Optional[bool] = None

class VMCreate(BaseModel):
    name: str
    internal_ip: str
    vcpu: int = 2
    ram_gb: int = 4
    disk_gb: int = 80
    region: str = "eu-west"
    has_tsplus: bool = True
    panel_port: Optional[int] = None  # For 1panel access

class VMUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    internal_ip: Optional[str] = None
    panel_port: Optional[int] = None
    assigned_user_ids: Optional[List[str]] = None
    assigned_group_ids: Optional[List[str]] = None

# ==================== ONBOARDING MODELS ====================

class OrganizationSetup(BaseModel):
    name: str
    domain: Optional[str] = None

class AdminSetup(BaseModel):
    admin_name: str
    admin_email: EmailStr
    admin_password: str

class PlanSetup(BaseModel):
    selected_plan: str  # starter, business, enterprise

class OnboardingComplete(BaseModel):
    organization: OrganizationSetup
    admin: AdminSetup
    plan: PlanSetup

class OnboardingStatus(BaseModel):
    is_new_customer: bool
    onboarding_completed: bool
    current_step: int
    organization_name: Optional[str] = None

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
    admin_id = None
    if not existing_admin:
        result = await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Platform Admin",
            "role": "platform_admin",
            "group_ids": [],
            "enabled": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        admin_id = str(result.inserted_id)
        logger.info(f"Admin user created: {admin_email}")
    else:
        admin_id = str(existing_admin["_id"])
    
    # Seed demo users
    demo_users = [
        {"email": "usuario1@windesk.cloud", "name": "Usuario Demo 1", "password": "Demo123!"},
        {"email": "usuario2@windesk.cloud", "name": "Usuario Demo 2", "password": "Demo123!"},
        {"email": "usuario3@windesk.cloud", "name": "Usuario Demo 3", "password": "Demo123!"},
    ]
    
    for demo_user in demo_users:
        existing = await db.users.find_one({"email": demo_user["email"]})
        if not existing:
            await db.users.insert_one({
                "email": demo_user["email"],
                "password_hash": hash_password(demo_user["password"]),
                "name": demo_user["name"],
                "role": "customer",
                "group_ids": [],
                "enabled": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    
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
    
    # Seed 4 pre-built VMs
    prebuilt_vms = [
        {
            "id": "vm-prod-001",
            "order_id": "prebuilt",
            "user_id": None,
            "name": "WinDesk-PROD-001",
            "status": "available",
            "internal_ip": "10.100.10.150",
            "netbird_ip": "100.79.10.150",
            "tunnel_hostname": "prod001.desk.kappa4.com",
            "vcpu": 4,
            "ram_gb": 8,
            "disk_gb": 160,
            "region": "eu-west",
            "has_tsplus": True,
            "panel_port": 33491,
            "assigned_user_ids": [],
            "assigned_group_ids": [],
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "vm-prod-002",
            "order_id": "prebuilt",
            "user_id": None,
            "name": "WinDesk-PROD-002",
            "status": "available",
            "internal_ip": "10.100.10.151",
            "netbird_ip": "100.79.10.151",
            "tunnel_hostname": "prod002.desk.kappa4.com",
            "vcpu": 4,
            "ram_gb": 8,
            "disk_gb": 160,
            "region": "eu-west",
            "has_tsplus": True,
            "panel_port": 33492,
            "assigned_user_ids": [],
            "assigned_group_ids": [],
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "vm-prod-003",
            "order_id": "prebuilt",
            "user_id": None,
            "name": "WinDesk-PROD-003",
            "status": "available",
            "internal_ip": "10.100.10.152",
            "netbird_ip": "100.79.10.152",
            "tunnel_hostname": "prod003.desk.kappa4.com",
            "vcpu": 8,
            "ram_gb": 16,
            "disk_gb": 320,
            "region": "eu-central",
            "has_tsplus": True,
            "panel_port": 33493,
            "assigned_user_ids": [],
            "assigned_group_ids": [],
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "vm-prod-004",
            "order_id": "prebuilt",
            "user_id": None,
            "name": "WinDesk-PROD-004",
            "status": "available",
            "internal_ip": "10.100.10.153",
            "netbird_ip": "100.79.10.153",
            "tunnel_hostname": "prod004.desk.kappa4.com",
            "vcpu": 2,
            "ram_gb": 4,
            "disk_gb": 80,
            "region": "us-east",
            "has_tsplus": True,
            "panel_port": 33494,
            "assigned_user_ids": [],
            "assigned_group_ids": [],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    
    for vm in prebuilt_vms:
        existing_vm = await db.vms.find_one({"id": vm["id"]})
        if not existing_vm:
            await db.vms.insert_one(vm)
    logger.info("Pre-built VMs seeded")
    
    # Seed default roles
    default_roles = [
        {
            "id": "role-admin",
            "name": "Administrador",
            "description": "Acceso total a todas las funciones",
            "permissions": ["manage_users", "manage_groups", "manage_vms", "manage_acls", "manage_policies", "connect_all", "view_all"],
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "role-operator",
            "name": "Operador",
            "description": "Puede gestionar VMs y ver usuarios",
            "permissions": ["manage_vms", "view_users", "connect_assigned"],
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "role-user",
            "name": "Usuario",
            "description": "Solo puede conectarse a VMs asignadas",
            "permissions": ["connect_assigned", "view_own"],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    
    for role in default_roles:
        await db.roles.update_one({"id": role["id"]}, {"$set": role}, upsert=True)
    logger.info("Default roles seeded")
    
    # Seed default groups
    default_groups = [
        {
            "id": "group-desarrollo",
            "name": "Desarrollo",
            "description": "Equipo de desarrollo de software",
            "member_ids": [],
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "group-soporte",
            "name": "Soporte Técnico",
            "description": "Equipo de soporte y help desk",
            "member_ids": [],
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "group-finanzas",
            "name": "Finanzas",
            "description": "Departamento de finanzas y contabilidad",
            "member_ids": [],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    
    for group in default_groups:
        existing = await db.groups.find_one({"id": group["id"]})
        if not existing:
            await db.groups.insert_one(group)
    logger.info("Default groups seeded")
    
    # Seed default ACLs
    default_acls = [
        {
            "id": "acl-full-access",
            "name": "Acceso Completo",
            "description": "Permite todas las acciones en los recursos",
            "resource_type": "all",
            "resource_ids": [],
            "allowed_actions": ["connect_tsplus", "connect_1panel", "restart", "snapshot", "view"],
            "enabled": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "acl-connect-only",
            "name": "Solo Conexión",
            "description": "Solo permite conectarse a las VMs",
            "resource_type": "vm",
            "resource_ids": [],
            "allowed_actions": ["connect_tsplus", "connect_1panel", "view"],
            "enabled": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "acl-view-only",
            "name": "Solo Lectura",
            "description": "Solo puede ver información, sin conectar",
            "resource_type": "vm",
            "resource_ids": [],
            "allowed_actions": ["view"],
            "enabled": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    
    for acl in default_acls:
        await db.acls.update_one({"id": acl["id"]}, {"$set": acl}, upsert=True)
    logger.info("Default ACLs seeded")
    
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.groups.create_index("id", unique=True)
    await db.roles.create_index("id", unique=True)
    await db.acls.create_index("id", unique=True)
    await db.policies.create_index("id", unique=True)
    
    # Write test credentials
    os.makedirs("/app/memory", exist_ok=True)
    with open("/app/memory/test_credentials.md", "w") as f:
        f.write("# WinDesk Cloud Test Credentials\n\n")
        f.write("## Admin Account\n")
        f.write(f"- Email: {admin_email}\n")
        f.write(f"- Password: {admin_password}\n")
        f.write("- Role: platform_admin\n\n")
        f.write("## Demo Users\n")
        f.write("- usuario1@windesk.cloud / Demo123!\n")
        f.write("- usuario2@windesk.cloud / Demo123!\n")
        f.write("- usuario3@windesk.cloud / Demo123!\n\n")
        f.write("## Pre-built VMs\n")
        f.write("- vm-prod-001: 10.100.10.150 (4 vCPU, 8GB RAM)\n")
        f.write("- vm-prod-002: 10.100.10.151 (4 vCPU, 8GB RAM)\n")
        f.write("- vm-prod-003: 10.100.10.152 (8 vCPU, 16GB RAM)\n")
        f.write("- vm-prod-004: 10.100.10.153 (2 vCPU, 4GB RAM)\n")

# ==================== LIFESPAN ====================

@asynccontextmanager
async def lifespan(app: FastAPI):
    await seed_data()
    yield
    client.close()

# ==================== APP SETUP ====================

app = FastAPI(title="WinDesk Cloud API", lifespan=lifespan)

# Session middleware for OAuth state
app.add_middleware(SessionMiddleware, secret_key=JWT_SECRET)

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

# ==================== ZITADEL OIDC ROUTES ====================

import hashlib
import base64

def generate_code_verifier():
    """Generate a random code verifier for PKCE"""
    return secrets.token_urlsafe(64)[:128]

def generate_code_challenge(verifier: str):
    """Generate code challenge from verifier using S256"""
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b'=').decode('ascii')

@api_router.get("/auth/zitadel/login")
async def zitadel_login(request: Request):
    """Initiate Zitadel OIDC login flow with PKCE"""
    if not ZITADEL_DOMAIN or not ZITADEL_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Zitadel not configured")
    
    # Generate PKCE codes
    code_verifier = generate_code_verifier()
    code_challenge = generate_code_challenge(code_verifier)
    state = secrets.token_urlsafe(32)
    
    # Store in session
    request.session['oauth_state'] = state
    request.session['code_verifier'] = code_verifier
    
    # Build authorization URL
    auth_url = (
        f"{ZITADEL_DOMAIN}/oauth/v2/authorize?"
        f"client_id={ZITADEL_CLIENT_ID}&"
        f"redirect_uri={ZITADEL_CALLBACK_URL}&"
        f"response_type=code&"
        f"scope=openid%20profile%20email&"
        f"state={state}&"
        f"code_challenge={code_challenge}&"
        f"code_challenge_method=S256"
    )
    
    return RedirectResponse(url=auth_url, status_code=302)

@api_router.get("/auth/zitadel/callback")
async def zitadel_callback(request: Request, code: str = None, state: str = None, error: str = None):
    """Handle Zitadel OIDC callback"""
    try:
        if error:
            logger.error(f"Zitadel auth error: {error}")
            return RedirectResponse(url=f"{ZITADEL_POST_LOGOUT_URL}/login?error={error}", status_code=302)
        
        # Verify state
        stored_state = request.session.get('oauth_state')
        if not state or state != stored_state:
            logger.error("State mismatch in Zitadel callback")
            return RedirectResponse(url=f"{ZITADEL_POST_LOGOUT_URL}/login?error=state_mismatch", status_code=302)
        
        # Get code verifier
        code_verifier = request.session.get('code_verifier')
        if not code_verifier:
            logger.error("Code verifier not found in session")
            return RedirectResponse(url=f"{ZITADEL_POST_LOGOUT_URL}/login?error=session_error", status_code=302)
        
        # Exchange code for tokens
        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                f'{ZITADEL_DOMAIN}/oauth/v2/token',
                data={
                    'grant_type': 'authorization_code',
                    'client_id': ZITADEL_CLIENT_ID,
                    'code': code,
                    'redirect_uri': ZITADEL_CALLBACK_URL,
                    'code_verifier': code_verifier
                },
                headers={'Content-Type': 'application/x-www-form-urlencoded'}
            )
            
            if token_response.status_code != 200:
                logger.error(f"Token exchange failed: {token_response.text}")
                return RedirectResponse(url=f"{ZITADEL_POST_LOGOUT_URL}/login?error=token_error", status_code=302)
            
            tokens = token_response.json()
            access_token_zitadel = tokens.get('access_token')
            id_token = tokens.get('id_token')
            
            # Fetch userinfo
            userinfo_response = await client.get(
                f'{ZITADEL_DOMAIN}/oidc/v1/userinfo',
                headers={'Authorization': f'Bearer {access_token_zitadel}'}
            )
            
            if userinfo_response.status_code != 200:
                logger.error(f"Userinfo fetch failed: {userinfo_response.text}")
                return RedirectResponse(url=f"{ZITADEL_POST_LOGOUT_URL}/login?error=userinfo_error", status_code=302)
            
            userinfo = userinfo_response.json()
        
        email = userinfo.get('email', '').lower()
        name = userinfo.get('name') or userinfo.get('preferred_username') or email.split('@')[0]
        zitadel_sub = userinfo.get('sub')
        
        if not email:
            return RedirectResponse(url=f"{ZITADEL_POST_LOGOUT_URL}/login?error=no_email", status_code=302)
        
        # Find or create user
        user = await db.users.find_one({"email": email})
        
        if not user:
            # Create new user from Zitadel
            user_doc = {
                "email": email,
                "password_hash": None,
                "name": name,
                "role": "customer",
                "zitadel_sub": zitadel_sub,
                "auth_provider": "zitadel",
                "group_ids": [],
                "enabled": True,
                "email_verified": userinfo.get('email_verified', False),
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            result = await db.users.insert_one(user_doc)
            user_id = str(result.inserted_id)
            logger.info(f"New user created from Zitadel: {email}")
        else:
            user_id = str(user["_id"])
            if not user.get("zitadel_sub"):
                await db.users.update_one(
                    {"_id": user["_id"]},
                    {"$set": {"zitadel_sub": zitadel_sub, "auth_provider": "zitadel"}}
                )
        
        # Create JWT tokens
        access_token = create_access_token(user_id, email)
        refresh_token = create_refresh_token(user_id)
        
        # Store Zitadel ID token for logout
        request.session['zitadel_id_token'] = id_token
        
        # Create redirect response with cookies
        redirect_response = RedirectResponse(url=f"{ZITADEL_POST_LOGOUT_URL}/dashboard", status_code=302)
        redirect_response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=3600, path="/")
        redirect_response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
        
        return redirect_response
        
    except Exception as e:
        logger.error(f"Zitadel callback error: {str(e)}")
        return RedirectResponse(url=f"{ZITADEL_POST_LOGOUT_URL}/login?error=auth_failed", status_code=302)

@api_router.get("/auth/zitadel/logout")
async def zitadel_logout(request: Request, response: Response):
    """Logout from Zitadel"""
    # Get ID token for Zitadel logout
    id_token = request.session.get('zitadel_id_token')
    request.session.clear()
    
    # Create response that clears cookies
    logout_url = f'{ZITADEL_DOMAIN}/oidc/v1/end_session?post_logout_redirect_uri={ZITADEL_POST_LOGOUT_URL}'
    if id_token:
        logout_url += f'&id_token_hint={id_token}'
    
    redirect_response = RedirectResponse(url=logout_url, status_code=302)
    redirect_response.delete_cookie("access_token", path="/", secure=True, samesite="none")
    redirect_response.delete_cookie("refresh_token", path="/", secure=True, samesite="none")
    
    return redirect_response

@api_router.get("/auth/zitadel/config")
async def get_zitadel_config():
    """Return Zitadel configuration for frontend"""
    return {
        "enabled": bool(ZITADEL_DOMAIN and ZITADEL_CLIENT_ID),
        "domain": ZITADEL_DOMAIN,
        "client_id": ZITADEL_CLIENT_ID,
        "callback_url": ZITADEL_CALLBACK_URL
    }

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
    # Admin sees all VMs, regular users only see their own VMs (created via orders)
    # Plus VMs where they are explicitly assigned
    if user["role"] in ["admin", "platform_admin"]:
        query = {}
    else:
        # User sees: VMs they own OR VMs they are assigned to
        user_id = user["id"]
        user_groups = user.get("group_ids", [])
        query = {
            "$or": [
                {"user_id": user_id},
                {"assigned_user_ids": user_id},
                {"assigned_group_ids": {"$in": user_groups}} if user_groups else {"_id": None}
            ]
        }
    vms = await db.vms.find(query, {"_id": 0}).to_list(100)
    return vms

@api_router.get("/vms/{vm_id}", response_model=VMResponse)
async def get_vm(vm_id: str, user: dict = Depends(get_current_user)):
    vm = await db.vms.find_one({"id": vm_id}, {"_id": 0})
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
    
    # Check access: admin, owner, or assigned
    if user["role"] not in ["admin", "platform_admin"]:
        user_id = user["id"]
        user_groups = user.get("group_ids", [])
        is_owner = vm.get("user_id") == user_id
        is_assigned_user = user_id in vm.get("assigned_user_ids", [])
        is_assigned_group = any(g in vm.get("assigned_group_ids", []) for g in user_groups)
        
        if not (is_owner or is_assigned_user or is_assigned_group):
            raise HTTPException(status_code=403, detail="Access denied")
    return vm

@api_router.get("/vms/{vm_id}/metrics", response_model=VMMetrics)
async def get_vm_metrics(vm_id: str, user: dict = Depends(get_current_user)):
    """Returns simulated metrics for demo mode"""
    vm = await db.vms.find_one({"id": vm_id})
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
    
    # Check access
    if user["role"] not in ["admin", "platform_admin"]:
        user_id = user["id"]
        user_groups = user.get("group_ids", [])
        is_owner = vm.get("user_id") == user_id
        is_assigned_user = user_id in vm.get("assigned_user_ids", [])
        is_assigned_group = any(g in vm.get("assigned_group_ids", []) for g in user_groups)
        
        if not (is_owner or is_assigned_user or is_assigned_group):
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
    if user["role"] not in ["admin", "platform_admin"] and vm.get("user_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    snapshot_id = f"snap-{uuid.uuid4().hex[:8]}"
    await db.snapshots.insert_one({
        "id": snapshot_id,
        "vm_id": vm_id,
        "user_id": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    return {"message": "Snapshot created", "snapshot_id": snapshot_id}

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

# ==================== ADMIN USER MANAGEMENT ====================

@api_router.put("/admin/users/{user_id}")
async def update_user(user_id: str, data: UserUpdate, user: dict = Depends(require_admin)):
    existing = await db.users.find_one({"_id": ObjectId(user_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if update_data:
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update_data})
    
    updated = await db.users.find_one({"_id": ObjectId(user_id)}, {"password_hash": 0})
    updated["id"] = str(updated.pop("_id"))
    return updated

@api_router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(require_admin)):
    existing = await db.users.find_one({"_id": ObjectId(user_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    if existing["email"] == user["email"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    await db.users.delete_one({"_id": ObjectId(user_id)})
    return {"message": "User deleted"}

@api_router.post("/admin/users")
async def create_user_admin(data: UserRegister, user: dict = Depends(require_admin)):
    email = data.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_doc = {
        "email": email,
        "password_hash": hash_password(data.password),
        "name": data.name,
        "role": "customer",
        "group_ids": [],
        "enabled": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.insert_one(user_doc)
    return {"id": str(result.inserted_id), "email": email, "name": data.name, "role": "customer"}

# ==================== GROUPS MANAGEMENT ====================

@api_router.get("/admin/groups")
async def get_groups(user: dict = Depends(require_admin)):
    groups = await db.groups.find({}, {"_id": 0}).to_list(1000)
    return groups

@api_router.post("/admin/groups")
async def create_group(data: GroupCreate, user: dict = Depends(require_admin)):
    group_id = f"group-{uuid.uuid4().hex[:8]}"
    group_doc = {
        "id": group_id,
        "name": data.name,
        "description": data.description,
        "member_ids": [],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.groups.insert_one(group_doc)
    group_doc.pop("_id", None)
    return group_doc

@api_router.get("/admin/groups/{group_id}")
async def get_group(group_id: str, user: dict = Depends(require_admin)):
    group = await db.groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group

@api_router.put("/admin/groups/{group_id}")
async def update_group(group_id: str, data: GroupUpdate, user: dict = Depends(require_admin)):
    existing = await db.groups.find_one({"id": group_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Group not found")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if update_data:
        await db.groups.update_one({"id": group_id}, {"$set": update_data})
    
    updated = await db.groups.find_one({"id": group_id}, {"_id": 0})
    return updated

@api_router.delete("/admin/groups/{group_id}")
async def delete_group(group_id: str, user: dict = Depends(require_admin)):
    existing = await db.groups.find_one({"id": group_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Remove group from all users
    await db.users.update_many({"group_ids": group_id}, {"$pull": {"group_ids": group_id}})
    await db.groups.delete_one({"id": group_id})
    return {"message": "Group deleted"}

@api_router.post("/admin/groups/{group_id}/members")
async def add_group_member(group_id: str, user_id: str, user: dict = Depends(require_admin)):
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    target_user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.groups.update_one({"id": group_id}, {"$addToSet": {"member_ids": user_id}})
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$addToSet": {"group_ids": group_id}})
    return {"message": "Member added to group"}

@api_router.delete("/admin/groups/{group_id}/members/{member_id}")
async def remove_group_member(group_id: str, member_id: str, user: dict = Depends(require_admin)):
    await db.groups.update_one({"id": group_id}, {"$pull": {"member_ids": member_id}})
    await db.users.update_one({"_id": ObjectId(member_id)}, {"$pull": {"group_ids": group_id}})
    return {"message": "Member removed from group"}

# ==================== ROLES MANAGEMENT ====================

@api_router.get("/admin/roles")
async def get_roles(user: dict = Depends(require_admin)):
    roles = await db.roles.find({}, {"_id": 0}).to_list(1000)
    return roles

@api_router.post("/admin/roles")
async def create_role(data: RoleCreate, user: dict = Depends(require_admin)):
    role_id = f"role-{uuid.uuid4().hex[:8]}"
    role_doc = {
        "id": role_id,
        "name": data.name,
        "description": data.description,
        "permissions": data.permissions,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.roles.insert_one(role_doc)
    role_doc.pop("_id", None)
    return role_doc

@api_router.put("/admin/roles/{role_id}")
async def update_role(role_id: str, data: RoleUpdate, user: dict = Depends(require_admin)):
    existing = await db.roles.find_one({"id": role_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Role not found")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if update_data:
        await db.roles.update_one({"id": role_id}, {"$set": update_data})
    
    updated = await db.roles.find_one({"id": role_id}, {"_id": 0})
    return updated

@api_router.delete("/admin/roles/{role_id}")
async def delete_role(role_id: str, user: dict = Depends(require_admin)):
    if role_id in ["role-admin", "role-operator", "role-user"]:
        raise HTTPException(status_code=400, detail="Cannot delete default roles")
    
    await db.roles.delete_one({"id": role_id})
    return {"message": "Role deleted"}

# ==================== ACLs MANAGEMENT ====================

@api_router.get("/admin/acls")
async def get_acls(user: dict = Depends(require_admin)):
    acls = await db.acls.find({}, {"_id": 0}).to_list(1000)
    return acls

@api_router.post("/admin/acls")
async def create_acl(data: ACLCreate, user: dict = Depends(require_admin)):
    acl_id = f"acl-{uuid.uuid4().hex[:8]}"
    acl_doc = {
        "id": acl_id,
        "name": data.name,
        "description": data.description,
        "resource_type": data.resource_type,
        "resource_ids": data.resource_ids,
        "allowed_actions": data.allowed_actions,
        "enabled": data.enabled,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.acls.insert_one(acl_doc)
    acl_doc.pop("_id", None)
    return acl_doc

@api_router.put("/admin/acls/{acl_id}")
async def update_acl(acl_id: str, data: ACLUpdate, user: dict = Depends(require_admin)):
    existing = await db.acls.find_one({"id": acl_id})
    if not existing:
        raise HTTPException(status_code=404, detail="ACL not found")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if update_data:
        await db.acls.update_one({"id": acl_id}, {"$set": update_data})
    
    updated = await db.acls.find_one({"id": acl_id}, {"_id": 0})
    return updated

@api_router.delete("/admin/acls/{acl_id}")
async def delete_acl(acl_id: str, user: dict = Depends(require_admin)):
    await db.acls.delete_one({"id": acl_id})
    # Remove ACL reference from policies
    await db.policies.update_many({"acl_id": acl_id}, {"$set": {"acl_id": None}})
    return {"message": "ACL deleted"}

# ==================== POLICIES MANAGEMENT ====================

@api_router.get("/admin/policies")
async def get_policies(user: dict = Depends(require_admin)):
    policies = await db.policies.find({}, {"_id": 0}).to_list(1000)
    return policies

@api_router.post("/admin/policies")
async def create_policy(data: PolicyCreate, user: dict = Depends(require_admin)):
    policy_id = f"policy-{uuid.uuid4().hex[:8]}"
    policy_doc = {
        "id": policy_id,
        "name": data.name,
        "description": data.description,
        "policy_type": data.policy_type,
        "subject_type": data.subject_type,
        "subject_ids": data.subject_ids,
        "vm_ids": data.vm_ids,
        "acl_id": data.acl_id,
        "enabled": data.enabled,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.policies.insert_one(policy_doc)
    policy_doc.pop("_id", None)
    return policy_doc

@api_router.put("/admin/policies/{policy_id}")
async def update_policy(policy_id: str, data: PolicyUpdate, user: dict = Depends(require_admin)):
    existing = await db.policies.find_one({"id": policy_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Policy not found")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if update_data:
        await db.policies.update_one({"id": policy_id}, {"$set": update_data})
    
    updated = await db.policies.find_one({"id": policy_id}, {"_id": 0})
    return updated

@api_router.delete("/admin/policies/{policy_id}")
async def delete_policy(policy_id: str, user: dict = Depends(require_admin)):
    await db.policies.delete_one({"id": policy_id})
    return {"message": "Policy deleted"}

# ==================== ADMIN VM MANAGEMENT ====================

@api_router.get("/admin/vms")
async def get_all_vms(user: dict = Depends(require_admin)):
    vms = await db.vms.find({}, {"_id": 0}).to_list(1000)
    return vms

@api_router.post("/admin/vms")
async def create_vm_admin(data: VMCreate, user: dict = Depends(require_admin)):
    vm_id = f"vm-{uuid.uuid4().hex[:8]}"
    vm_doc = {
        "id": vm_id,
        "order_id": "admin-created",
        "user_id": None,
        "name": data.name,
        "status": "available",
        "internal_ip": data.internal_ip,
        "netbird_ip": f"100.79.{random.randint(1, 254)}.{random.randint(1, 254)}",
        "tunnel_hostname": f"{vm_id}.desk.kappa4.com",
        "vcpu": data.vcpu,
        "ram_gb": data.ram_gb,
        "disk_gb": data.disk_gb,
        "region": data.region,
        "has_tsplus": data.has_tsplus,
        "panel_port": data.panel_port,
        "assigned_user_ids": [],
        "assigned_group_ids": [],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.vms.insert_one(vm_doc)
    vm_doc.pop("_id", None)
    return vm_doc

@api_router.put("/admin/vms/{vm_id}")
async def update_vm_admin(vm_id: str, data: VMUpdate, user: dict = Depends(require_admin)):
    existing = await db.vms.find_one({"id": vm_id})
    if not existing:
        raise HTTPException(status_code=404, detail="VM not found")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if update_data:
        await db.vms.update_one({"id": vm_id}, {"$set": update_data})
    
    updated = await db.vms.find_one({"id": vm_id}, {"_id": 0})
    return updated

@api_router.delete("/admin/vms/{vm_id}")
async def delete_vm_admin(vm_id: str, user: dict = Depends(require_admin)):
    await db.vms.delete_one({"id": vm_id})
    return {"message": "VM deleted"}

@api_router.post("/admin/vms/{vm_id}/assign")
async def assign_vm(vm_id: str, user_ids: List[str] = [], group_ids: List[str] = [], user: dict = Depends(require_admin)):
    vm = await db.vms.find_one({"id": vm_id})
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
    
    update_data = {}
    if user_ids:
        update_data["assigned_user_ids"] = user_ids
    if group_ids:
        update_data["assigned_group_ids"] = group_ids
    if update_data:
        await db.vms.update_one({"id": vm_id}, {"$set": update_data})
    
    updated = await db.vms.find_one({"id": vm_id}, {"_id": 0})
    return updated

# ==================== ACCESS URL WITH 1PANEL SUPPORT ====================

@api_router.get("/vms/{vm_id}/access-url")
async def get_access_url(vm_id: str, user: dict = Depends(get_current_user)):
    vm = await db.vms.find_one({"id": vm_id}, {"_id": 0})
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
    if user["role"] not in ["admin", "platform_admin"] and vm.get("user_id") != user["id"]:
        # Check if user is assigned or in assigned group
        user_id = user["id"]
        user_groups = user.get("group_ids", [])
        assigned_users = vm.get("assigned_user_ids", [])
        assigned_groups = vm.get("assigned_group_ids", [])
        
        has_access = user_id in assigned_users or any(g in assigned_groups for g in user_groups)
        if not has_access and user["role"] not in ["admin", "platform_admin"]:
            raise HTTPException(status_code=403, detail="Access denied")
    
    panel_url = None
    if vm.get("panel_port"):
        panel_url = f"http://{vm['internal_ip']}:{vm['panel_port']}/"
    
    return {
        "tsplus_url": "https://web.tsplus.html5/",
        "panel_url": panel_url,
        "rdp_ip": vm.get("netbird_ip"),
        "internal_ip": vm.get("internal_ip")
    }

# ==================== ONBOARDING ROUTES ====================

@api_router.get("/onboarding/status")
async def get_onboarding_status(user: dict = Depends(get_current_user)):
    """Check if user needs onboarding"""
    # Only platform_admin users go through onboarding
    if user["role"] != "platform_admin":
        return {
            "is_new_customer": False,
            "onboarding_completed": True,
            "current_step": 4,
            "organization_name": None,
            "show_tour": True  # Always show tour for regular users
        }
    
    # Check if organization exists for this admin user
    org = await db.organizations.find_one({"admin_user_id": user["id"]})
    
    if not org:
        # New admin customer - needs onboarding
        return {
            "is_new_customer": True,
            "onboarding_completed": False,
            "current_step": 1,
            "organization_name": None,
            "show_tour": False
        }
    
    return {
        "is_new_customer": False,
        "onboarding_completed": org.get("onboarding_completed", True),
        "current_step": org.get("onboarding_step", 4),
        "organization_name": org.get("name"),
        "show_tour": True  # Always show tour
    }

@api_router.post("/onboarding/organization")
async def setup_organization(data: OrganizationSetup, user: dict = Depends(get_current_user)):
    """Step 1: Setup organization"""
    existing = await db.organizations.find_one({"admin_user_id": user["id"]})
    
    org_data = {
        "admin_user_id": user["id"],
        "name": data.name,
        "domain": data.domain,
        "onboarding_step": 2,
        "onboarding_completed": False,
        "tour_completed": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    if existing:
        await db.organizations.update_one(
            {"admin_user_id": user["id"]},
            {"$set": {"name": data.name, "domain": data.domain, "onboarding_step": 2}}
        )
    else:
        await db.organizations.insert_one(org_data)
    
    return {"message": "Organization setup completed", "next_step": 2}

@api_router.post("/onboarding/admin")
async def setup_admin_user(data: AdminSetup, user: dict = Depends(get_current_user)):
    """Step 2: Setup additional admin (optional) or confirm current admin"""
    org = await db.organizations.find_one({"admin_user_id": user["id"]})
    if not org:
        raise HTTPException(status_code=400, detail="Complete organization setup first")
    
    # Update current user's name if different
    if data.admin_email.lower() == user["email"]:
        await db.users.update_one(
            {"_id": ObjectId(user["id"])},
            {"$set": {"name": data.admin_name}}
        )
    else:
        # Create additional admin user
        existing = await db.users.find_one({"email": data.admin_email.lower()})
        if not existing:
            await db.users.insert_one({
                "email": data.admin_email.lower(),
                "password_hash": hash_password(data.admin_password),
                "name": data.admin_name,
                "role": "platform_admin",
                "organization_id": str(org["_id"]) if "_id" in org else org.get("id"),
                "group_ids": [],
                "enabled": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    
    await db.organizations.update_one(
        {"admin_user_id": user["id"]},
        {"$set": {"onboarding_step": 3}}
    )
    
    return {"message": "Admin setup completed", "next_step": 3}

@api_router.post("/onboarding/plan")
async def setup_plan(data: PlanSetup, user: dict = Depends(get_current_user)):
    """Step 3: Select plan"""
    org = await db.organizations.find_one({"admin_user_id": user["id"]})
    if not org:
        raise HTTPException(status_code=400, detail="Complete organization setup first")
    
    plan = await db.plans.find_one({"id": data.selected_plan})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    await db.organizations.update_one(
        {"admin_user_id": user["id"]},
        {"$set": {"selected_plan": data.selected_plan, "onboarding_step": 4}}
    )
    
    return {"message": "Plan selected", "next_step": 4, "plan": plan["name"]}

@api_router.post("/onboarding/complete")
async def complete_onboarding(user: dict = Depends(get_current_user)):
    """Step 4: Complete onboarding and provision initial resources"""
    org = await db.organizations.find_one({"admin_user_id": user["id"]})
    if not org:
        raise HTTPException(status_code=400, detail="Complete organization setup first")
    
    # Mark onboarding as completed
    await db.organizations.update_one(
        {"admin_user_id": user["id"]},
        {"$set": {"onboarding_completed": True, "onboarding_step": 4}}
    )
    
    # Create a default group for the organization
    org_name = org.get("name", "Default")
    group_id = f"group-{uuid.uuid4().hex[:8]}"
    existing_group = await db.groups.find_one({"name": f"{org_name} - General"})
    if not existing_group:
        await db.groups.insert_one({
            "id": group_id,
            "name": f"{org_name} - General",
            "description": f"Grupo general de {org_name}",
            "member_ids": [user["id"]],
            "organization_id": str(org["_id"]) if "_id" in org else None,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    return {
        "message": "Onboarding completed successfully",
        "organization_name": org.get("name"),
        "show_tour": True
    }

@api_router.post("/onboarding/complete-tour")
async def complete_tour(user: dict = Depends(get_current_user)):
    """Mark the guided tour as completed"""
    await db.organizations.update_one(
        {"admin_user_id": user["id"]},
        {"$set": {"tour_completed": True}}
    )
    return {"message": "Tour completed"}

@api_router.get("/onboarding/summary")
async def get_onboarding_summary(user: dict = Depends(get_current_user)):
    """Get summary of onboarding data for review step"""
    org = await db.organizations.find_one({"admin_user_id": user["id"]})
    if not org:
        raise HTTPException(status_code=404, detail="No organization found")
    
    plan = None
    if org.get("selected_plan"):
        plan = await db.plans.find_one({"id": org["selected_plan"]}, {"_id": 0})
    
    return {
        "organization": {
            "name": org.get("name"),
            "domain": org.get("domain")
        },
        "admin": {
            "name": user["name"],
            "email": user["email"]
        },
        "plan": plan
    }

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
