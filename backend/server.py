from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Request
from fastapi.responses import StreamingResponse
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
import secrets
import hashlib
import httpx
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import lxd_client
import guacamole_client
from tsplus_manager import tsplus_manager
from notifications_hub import hub as notifications_hub, sse_generator
import html as html_escape_mod

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Zitadel configuration - Multiple providers
ZITADEL_AUTHORITY = os.environ.get('ZITADEL_AUTHORITY', 'https://manager.kappa4.com')
ZITADEL_CLIENT_ID = os.environ.get('ZITADEL_CLIENT_ID', '360979728544301063')
ZITADEL_PROJECT_ID = os.environ.get('ZITADEL_PROJECT_ID', '360327617871609860')

ZITADEL_CLOUD_AUTHORITY = os.environ.get('ZITADEL_CLOUD_AUTHORITY', 'https://beyondcloud-nxm7ab.us1.zitadel.cloud')
ZITADEL_CLOUD_CLIENT_ID = os.environ.get('ZITADEL_CLOUD_CLIENT_ID', '364755586279038416')
ZITADEL_CLOUD_CLIENT_SECRET = os.environ.get('ZITADEL_CLOUD_CLIENT_SECRET', '')
ZITADEL_CLOUD_PROJECT_ID = os.environ.get('ZITADEL_CLOUD_PROJECT_ID', '360845682363341210')

# JumpServer configuration
JUMPSERVER_URL = os.environ.get('JUMPSERVER_URL')
JUMPSERVER_API_TOKEN = os.environ.get('JUMPSERVER_API_TOKEN')
JUMPSERVER_ORG_ID = os.environ.get('JUMPSERVER_ORG_ID')
JUMPSERVER_ASSET_WINDOWS = os.environ.get('JUMPSERVER_ASSET_WINDOWS')
JUMPSERVER_ACCOUNT_RDP = os.environ.get('JUMPSERVER_ACCOUNT_RDP')
JUMPSERVER_USER_ID = os.environ.get('JUMPSERVER_USER_ID')

# Create the main app without a prefix
app = FastAPI(title="NeoSC API", version="1.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ============ MODELS ============

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: str
    organization: str = "Default Organization"
    tenant_id: Optional[str] = None  # Multi-tenant: every user belongs to a tenant
    role: str = "user"
    mfa_enabled: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Tenant(BaseModel):
    """A NeoSC tenant — typically one organization mapped to a NeoGuard org."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    slug: str
    zitadel_org_id: Optional[str] = None
    zitadel_project_id: Optional[str] = None
    plan: str = "starter"  # starter, business, enterprise
    status: str = "active"  # active, suspended, lockdown
    branding: dict = Field(default_factory=lambda: {"primary_color": "#06b6d4", "logo_url": None})
    fresh_mode: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TenantCreate(BaseModel):
    name: str
    slug: Optional[str] = None
    plan: str = "starter"

class UserCreate(BaseModel):
    email: str
    password: str
    name: str
    organization: Optional[str] = "Default Organization"

class UserLogin(BaseModel):
    email: str
    password: str

class AuthToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

class Workspace(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: str  # linux, windows, browser, dev, admin
    description: str
    image_url: str
    status: str = "available"  # available, running, stopped, error
    cpu: str = "2 vCPU"
    memory: str = "4 GB"
    storage: str = "50 GB"

class Session(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_email: str
    workspace_id: str
    workspace_name: str
    workspace_type: str
    status: str = "active"  # active, disconnected, terminated
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    ended_at: Optional[datetime] = None
    ip_address: str = "10.0.0.1"
    tunnel_status: str = "encrypted"
    mfa_verified: bool = True

class AuditLog(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_email: str
    action: str
    resource: str
    details: str
    ip_address: str = "192.168.1.1"
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    success: bool = True

class Organization(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    domain: str
    users_count: int = 0
    workspaces_count: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Policy(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    type: str  # access, network, session
    rules: List[str]
    enabled: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ============ HELPER FUNCTIONS ============

# ─── Workspace Assignment Model ───────────────────────────────────────────────

class WorkspaceAccessRule(BaseModel):
    user_id: str = ""
    user_email: str = ""
    allowed: bool = True
    protocols: List[str] = []  # rdp, vnc, ssh, html5, web

class WorkspaceAssignment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"wa-{uuid.uuid4().hex[:8]}")
    resource_id: str  # app id, lxd instance name, or guacamole connection id
    resource_name: str
    resource_type: str  # app, lxd-vm, lxd-container, guacamole, external
    group_id: str  # NeoVDI / Zitadel group
    group_name: str = ""
    protocols_available: List[str] = []  # rdp, vnc, ssh, html5, web
    user_access: List[dict] = []  # [{user_id, user_email, allowed, protocols}]
    netbird_policy_id: str = ""
    guacamole_connection_id: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    created_by: str = ""

# ─── Helper Functions ─────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def generate_token() -> str:
    return secrets.token_urlsafe(32)


# ────────────────────────────────────────────────────────────────────
# MULTI-TENANT HELPERS
# ────────────────────────────────────────────────────────────────────
DEFAULT_TENANT_SLUG = "neogenesys"

async def ensure_default_tenant() -> dict:
    """Create the default tenant (first run) and migrate orphan documents."""
    existing = await db.tenants.find_one({"slug": DEFAULT_TENANT_SLUG}, {"_id": 0})
    if existing:
        return existing
    tenant = Tenant(
        name="Neogenesys",
        slug=DEFAULT_TENANT_SLUG,
        zitadel_org_id=ZITADEL_ORG_ID,
        zitadel_project_id=ZITADEL_PROJECT_ID,
        plan="enterprise",
        fresh_mode=False,
    )
    doc = tenant.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.tenants.insert_one(doc.copy())
    # Backfill tenant_id on existing users / data
    tid = tenant.id
    for coll in ("users", "workspaces", "applications", "sessions", "market_orders",
                 "audit_logs", "mock_emails", "workspace_assignments", "market_vms"):
        await db[coll].update_many({"tenant_id": {"$exists": False}}, {"$set": {"tenant_id": tid}})
    logger.info(f"Default tenant '{DEFAULT_TENANT_SLUG}' created (id={tid}) and existing data backfilled.")
    return doc


async def get_user_tenant(user: dict) -> dict:
    """Returns the tenant document for the authenticated user.
    Falls back to the default tenant if the user has no tenant_id (legacy)."""
    tid = user.get("tenant_id")
    if tid:
        t = await db.tenants.find_one({"id": tid}, {"_id": 0})
        if t:
            return t
    # Fallback: default tenant
    default = await db.tenants.find_one({"slug": DEFAULT_TENANT_SLUG}, {"_id": 0})
    if not default:
        default = await ensure_default_tenant()
    # Persist the binding so subsequent queries are O(1)
    await db.users.update_one({"id": user["id"]}, {"$set": {"tenant_id": default["id"]}})
    user["tenant_id"] = default["id"]
    return default


async def get_current_tenant_id(user: dict = None) -> str:
    """FastAPI dependency-style helper. Use inline as `tid = await get_current_tenant_id(user)`."""
    if user is None:
        return (await ensure_default_tenant())["id"]
    t = await get_user_tenant(user)
    return t["id"]


# Simple token store (in production, use Redis/JWT)
active_tokens = {}

async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = authorization.replace("Bearer ", "")
    if token not in active_tokens:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    return active_tokens[token]

# ============ AUTH ENDPOINTS ============

@api_router.post("/auth/register", response_model=AuthToken)
async def register(user_data: UserCreate):
    # Check if user exists
    existing = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Resolve tenant: by organization slug or default
    org_name = user_data.organization or "Default Organization"
    tenant = await db.tenants.find_one({"name": org_name}, {"_id": 0})
    if not tenant:
        tenant = await ensure_default_tenant()

    user = User(
        email=user_data.email,
        name=user_data.name,
        organization=org_name,
        tenant_id=tenant["id"],
    )
    
    user_doc = user.model_dump()
    user_doc['timestamp'] = user_doc['created_at'].isoformat()
    user_doc['created_at'] = user_doc['created_at'].isoformat()
    user_doc['password_hash'] = hash_password(user_data.password)
    
    await db.users.insert_one(user_doc)
    
    token = generate_token()
    user_dict = {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "organization": user.organization,
        "role": user.role,
        "mfa_enabled": user.mfa_enabled
    }
    active_tokens[token] = user_dict
    
    # Create audit log
    await create_audit_log(user.id, user.email, "register", "auth", "User registered successfully")
    
    return AuthToken(access_token=token, user=user_dict)

@api_router.post("/auth/login", response_model=AuthToken)
async def login(credentials: UserLogin):
    user_doc = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    
    if not user_doc:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if user_doc.get('password_hash') != hash_password(credentials.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = generate_token()
    user_dict = {
        "id": user_doc['id'],
        "email": user_doc['email'],
        "name": user_doc['name'],
        "organization": user_doc.get('organization', 'Default Organization'),
        "role": user_doc.get('role', 'user'),
        "mfa_enabled": user_doc.get('mfa_enabled', True)
    }
    active_tokens[token] = user_dict
    
    # Create audit log
    await create_audit_log(user_dict['id'], user_dict['email'], "login", "auth", "User logged in successfully")
    
    return AuthToken(access_token=token, user=user_dict)

@api_router.post("/auth/logout")
async def logout(authorization: str = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "")
        if token in active_tokens:
            user = active_tokens[token]
            # Terminate all active sessions for this user
            active_sessions = await db.sessions.find(
                {"user_id": user['id'], "status": "active"},
                {"_id": 0}
            ).to_list(100)
            
            for session in active_sessions:
                await db.sessions.update_one(
                    {"id": session['id']},
                    {"$set": {"status": "terminated", "ended_at": datetime.now(timezone.utc).isoformat()}}
                )
                # Reset workspace status
                if session.get('workspace_id'):
                    await db.workspaces.update_one(
                        {"id": session['workspace_id']},
                        {"$set": {"status": "available"}}
                    )
            
            terminated_count = len(active_sessions)
            await create_audit_log(
                user['id'], user['email'], "logout", "auth", 
                f"User logged out. {terminated_count} active session(s) terminated."
            )
            del active_tokens[token]
            return {"message": "Logged out successfully", "sessions_terminated": terminated_count}
    return {"message": "Logged out successfully", "sessions_terminated": 0}

# SSO Login endpoint for Zitadel OIDC
class SSOLoginRequest(BaseModel):
    id_token: Optional[str] = None
    access_token: str
    profile: dict
    provider: str = "zitadel"
    roles: Optional[List[str]] = []
    groups: Optional[List[str]] = []

@api_router.post("/auth/sso", response_model=AuthToken)
async def sso_login(sso_data: SSOLoginRequest):
    """Handle SSO login from Zitadel OIDC"""
    profile = sso_data.profile
    
    # Extract user info from OIDC profile
    email = profile.get('email') or profile.get('preferred_username') or profile.get('sub')
    name = profile.get('name') or profile.get('given_name') or profile.get('preferred_username') or email.split('@')[0]
    sub = profile.get('sub')
    
    if not email:
        raise HTTPException(status_code=400, detail="Email not found in SSO profile")
    
    # Determine role from Zitadel roles/groups
    roles = sso_data.roles or []
    groups = sso_data.groups or []
    
    # Check if user is admin
    is_admin = any(
        'admin' in r.lower() or 'administrator' in r.lower() or r.lower() == 'owner'
        for r in roles
    ) or any(
        'admin' in g.lower()
        for g in groups
    )
    
    user_role = 'admin' if is_admin else 'user'
    
    # Check if user exists
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if existing_user:
        # Update existing user with SSO info and roles
        await db.users.update_one(
            {"email": email},
            {"$set": {
                "sso_provider": sso_data.provider,
                "sso_sub": sub,
                "last_login": datetime.now(timezone.utc).isoformat(),
                "role": user_role,
                "roles": roles,
                "groups": groups,
                "name": name,
                "picture": profile.get('picture')
            }}
        )
        user_dict = {
            "id": existing_user['id'],
            "email": existing_user['email'],
            "name": name,
            "organization": existing_user.get('organization', 'Zitadel SSO'),
            "role": user_role,
            "roles": roles,
            "groups": groups,
            "mfa_enabled": True,
            "picture": profile.get('picture')
        }
    else:
        # Create new user from SSO
        user = User(
            email=email,
            name=name,
            organization=profile.get('org') or profile.get('urn:zitadel:iam:org:id') or 'Zitadel SSO',
            role=user_role,
            mfa_enabled=True
        )
        
        user_doc = user.model_dump()
        user_doc['created_at'] = user_doc['created_at'].isoformat()
        user_doc['sso_provider'] = sso_data.provider
        user_doc['sso_sub'] = sub
        user_doc['roles'] = roles
        user_doc['groups'] = groups
        user_doc['picture'] = profile.get('picture')
        
        await db.users.insert_one(user_doc)
        
        user_dict = {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "organization": user.organization,
            "role": user_role,
            "roles": roles,
            "groups": groups,
            "mfa_enabled": user.mfa_enabled,
            "picture": profile.get('picture')
        }
    
    # Generate our own token for the user
    token = generate_token()
    active_tokens[token] = user_dict
    
    # Create audit log
    await create_audit_log(user_dict['id'], user_dict['email'], "sso_login", "auth", f"SSO login via {sso_data.provider} as {user_role}")
    
    return AuthToken(access_token=token, user=user_dict)

# Token exchange endpoint (to avoid CORS issues)
class TokenExchangeRequest(BaseModel):
    code: str
    code_verifier: str
    redirect_uri: str
    authority: Optional[str] = None
    client_id: Optional[str] = None
    provider: Optional[str] = 'zitadel_cloud'

@api_router.post("/auth/token-exchange")
async def token_exchange(request: TokenExchangeRequest):
    """Exchange authorization code for tokens (backend-side to avoid CORS)"""
    try:
        # Determine which Zitadel instance to use
        if request.provider == 'zitadel_onprem':
            authority = request.authority or ZITADEL_AUTHORITY
            client_id = request.client_id or ZITADEL_CLIENT_ID
            client_secret = None
            project_id = ZITADEL_PROJECT_ID
        else:
            authority = request.authority or ZITADEL_CLOUD_AUTHORITY
            client_id = request.client_id or ZITADEL_CLOUD_CLIENT_ID
            client_secret = ZITADEL_CLOUD_CLIENT_SECRET
            project_id = ZITADEL_CLOUD_PROJECT_ID
        
        logger.info(f"Token exchange for provider: {request.provider}, authority: {authority}, client_id: {client_id}, redirect_uri: {request.redirect_uri}, has_secret: {bool(client_secret and len(client_secret) > 0)}")
        
        async with httpx.AsyncClient() as http_client:
            # Build token exchange payload
            token_data = {
                'grant_type': 'authorization_code',
                'client_id': client_id,
                'code': request.code,
                'redirect_uri': request.redirect_uri,
                'code_verifier': request.code_verifier,
            }
            
            # Add client_secret for confidential clients (skip for public SPA clients)
            if client_secret and len(client_secret) > 0:
                token_data['client_secret'] = client_secret
            
            # Exchange code for tokens
            token_response = await http_client.post(
                f"{authority}/oauth/v2/token",
                data=token_data,
                headers={'Content-Type': 'application/x-www-form-urlencoded'}
            )
            
            if token_response.status_code != 200:
                error_data = token_response.json() if token_response.text else {}
                logger.error(f"Token exchange failed: {error_data}")
                raise HTTPException(
                    status_code=400, 
                    detail=error_data.get('error_description', 'Token exchange failed')
                )
            
            tokens = token_response.json()
            
            # Get user info
            userinfo_response = await http_client.get(
                f"{authority}/oidc/v1/userinfo",
                headers={'Authorization': f"Bearer {tokens['access_token']}"}
            )
            
            userinfo = {}
            if userinfo_response.status_code == 200:
                userinfo = userinfo_response.json()
            
            # Parse ID token for additional claims
            id_token_claims = {}
            if tokens.get('id_token'):
                try:
                    import base64, json as _json_local
                    parts = tokens['id_token'].split('.')
                    if len(parts) >= 2:
                        payload = parts[1]
                        padding = 4 - len(payload) % 4
                        if padding != 4:
                            payload += '=' * padding
                        id_token_claims = _json_local.loads(base64.urlsafe_b64decode(payload).decode('utf-8'))
                except Exception as e:
                    logger.warning(f"Error parsing ID token: {e}")
            
            # Merge all profile data
            full_profile = {**id_token_claims, **userinfo}
            
            # Extract roles from Zitadel claims
            roles = []
            groups = []
            
            # Check for project-specific roles (on-premise)
            if project_id:
                role_claim_key = f"urn:zitadel:iam:org:project:{project_id}:roles"
            else:
                role_claim_key = None
            
            for key, value in full_profile.items():
                if (role_claim_key and key == role_claim_key) or ':roles' in key or key == 'roles':
                    if isinstance(value, dict):
                        roles.extend(value.keys())
                    elif isinstance(value, list):
                        roles.extend(value)
                if 'groups' in key.lower():
                    if isinstance(value, list):
                        groups.extend(value)
            
            logger.info(f"Extracted roles: {roles}, groups: {groups}")
            
            return {
                'tokens': tokens,
                'profile': full_profile,
                'roles': list(set(roles)),
                'groups': list(set(groups)),
                'provider': request.provider
            }
            
    except httpx.RequestError as e:
        logger.error(f"HTTP request error: {e}")
        raise HTTPException(status_code=502, detail=f"Failed to connect to Zitadel: {str(e)}")

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return user

# ============ WORKSPACES ENDPOINTS ============

# Pomerium URLs for clientless access (from environment)
POMERIUM_TSPLUS_URL = os.environ.get('POMERIUM_TSPLUS_URL', 'http://neosc.beyond.intranet/')
POMERIUM_SAP_URL = os.environ.get('POMERIUM_SAP_URL', 'http://neosc.beyond.intranet/')

# Initialize default workspaces - CLIENTLESS VERSION
DEFAULT_WORKSPACES = [
    {
        "id": "ws-sap-neogenesys",
        "name": "SAP Neogénesys",
        "type": "html5",
        "description": "TSPlus HTML5 Desktop para acceso a SAP. Requiere conexión NetBird activa.",
        "image_url": "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400",
        "status": "available",
        "cpu": "4 vCPU",
        "memory": "8 GB",
        "storage": "100 GB",
        "url": "http://neosc.beyond.intranet/",
        "connection_type": "html5",
        "requires_netbird": True,
        "clientless": False,
        "icon": "sap",
        "launch_mode": "iframe",
        "app_type": "rdp"
    },
    {
        "id": "ws-remote-desktop",
        "name": "Remote Desktop",
        "type": "rdp",
        "description": "Escritorio remoto Windows via TSPlus HTML5.",
        "image_url": "https://images.unsplash.com/photo-1624571409108-e9a41746af53?w=400",
        "status": "available",
        "cpu": "4 vCPU",
        "memory": "8 GB",
        "storage": "100 GB",
        "url": "http://neosc.beyond.intranet/",
        "connection_type": "html5",
        "requires_netbird": True,
        "clientless": False,
        "icon": "windows",
        "launch_mode": "iframe",
        "app_type": "rdp"
    },
    {
        "id": "ws-1panel",
        "name": "1Panel Admin",
        "type": "web",
        "description": "Panel de administración de infraestructura 1Panel.",
        "image_url": "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=400",
        "status": "available",
        "cpu": "2 vCPU",
        "memory": "4 GB",
        "storage": "50 GB",
        "url": "http://panel.beyond.intranet:33491/fdc627551a",
        "connection_type": "web",
        "requires_netbird": True,
        "clientless": False,
        "icon": "panel",
        "launch_mode": "iframe",
        "app_type": "web"
    },
    {
        "id": "ws-linux-desktop",
        "name": "Linux Desktop",
        "type": "linux",
        "description": "Ubuntu 22.04 LTS con entorno de escritorio completo via noVNC.",
        "image_url": "https://images.unsplash.com/photo-1629654297299-c8506221ca97?w=400",
        "status": "available",
        "cpu": "2 vCPU",
        "memory": "4 GB",
        "storage": "50 GB",
        "url": "http://100.107.254.100:6080/",
        "connection_type": "vnc",
        "requires_netbird": True,
        "clientless": False,
        "icon": "linux",
        "launch_mode": "iframe",
        "app_type": "vnc"
    },
    {
        "id": "ws-secure-browser",
        "name": "Secure Browser",
        "type": "browser",
        "description": "Navegador aislado con controles de privacidad y seguridad.",
        "image_url": "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=400",
        "status": "available",
        "cpu": "1 vCPU",
        "memory": "2 GB",
        "storage": "10 GB",
        "url": "",
        "connection_type": "browser",
        "requires_netbird": False,
        "clientless": True,
        "icon": "browser",
        "launch_mode": "iframe",
        "app_type": "web"
    },
    {
        "id": "ws-jumpserver-rdp",
        "name": "Windows RDP (JumpServer)",
        "type": "rdp",
        "description": "Escritorio Windows via JumpServer Luna HTML5. Acceso sin VPN, totalmente clientless.",
        "image_url": "https://images.unsplash.com/photo-1624571409108-e9a41746af53?w=400",
        "status": "available",
        "cpu": "4 vCPU",
        "memory": "8 GB",
        "storage": "100 GB",
        "url": "",
        "connection_type": "jumpserver",
        "requires_netbird": False,
        "clientless": True,
        "icon": "windows",
        "launch_mode": "new_tab",
        "app_type": "rdp",
        "jumpserver_config": {
            "protocol": "rdp",
            "asset_id": "1eda4c9d-44b5-4ced-9e22-2913b8bd3c20",
            "account_id": "92f189b5-a764-4ddd-93df-74ac84d8ad9f"
        }
    }
]

# Default applications (separate from workspaces)
DEFAULT_APPLICATIONS = [
    {
        "id": "app-vscode",
        "name": "VS Code Online",
        "icon": "💻",
        "category": "Development",
        "type": "Web App",
        "status": "online",
        "requires_vpn": False,
        "url": "https://vscode.dev/",
        "sso_type": "OAuth SSO",
        "description": "Editor de código en navegador",
        "allows_iframe": False,
    },
    {
        "id": "app-jupyter",
        "name": "Jupyter Lab",
        "icon": "📓",
        "category": "Data Science",
        "type": "Web App",
        "status": "online",
        "requires_vpn": False,
        "url": "https://jupyter.org/try-jupyter/lab/",
        "sso_type": "OIDC SSO",
        "description": "Notebooks para data science",
        "allows_iframe": False,
    },
    {
        "id": "app-1panel",
        "name": "NeoSC Panel",
        "icon": "🎛️",
        "category": "Infrastructure",
        "type": "Web App",
        "status": "online",
        "requires_vpn": True,
        "url": "https://panel.proxy.kappa4.com/",
        "sso_type": "OIDC SSO",
        "description": "Panel de administración de servidores",
        "allows_iframe": True,
    },
    {
        "id": "app-linux-desktop",
        "name": "Ubuntu Desktop",
        "icon": "🐧",
        "category": "Remote Desktop",
        "type": "VNC",
        "status": "online",
        "requires_vpn": True,
        "url": "http://100.107.254.100:6080/",
        "sso_type": "OAuth SSO",
        "description": "Escritorio Ubuntu 22.04 via noVNC",
        "allows_iframe": True,
    },
    {
        "id": "app-windows-desktop",
        "name": "Windows Desktop",
        "icon": "🪟",
        "category": "Remote Desktop",
        "type": "RDP",
        "status": "online",
        "requires_vpn": True,
        "url": "https://web.proxy.kappa4.com/",
        "sso_type": "OAuth SSO",
        "description": "Escritorio Windows via TSplus HTML5",
        "allows_iframe": True,
    },
    {
        "id": "app-crm",
        "name": "CRM Dashboard",
        "icon": "📈",
        "category": "Business",
        "type": "Web App",
        "status": "online",
        "requires_vpn": False,
        "url": "",
        "sso_type": "SAML SSO",
        "description": "Gestión de clientes y ventas",
        "allows_iframe": False,
    },
]

@api_router.get("/workspaces", response_model=List[dict])
async def get_workspaces(user: dict = Depends(get_current_user)):
    tid = await get_current_tenant_id(user)
    workspaces = await db.workspaces.find({"tenant_id": tid}, {"_id": 0}).to_list(100)
    # Auto-seed only when explicitly requested (legacy behavior); fresh tenants start empty.
    fresh_mode = os.environ.get("FRESH_TENANT_MODE", "true").lower() in ("1", "true", "yes")
    if not workspaces and not fresh_mode:
        for ws in DEFAULT_WORKSPACES:
            seed = ws.copy()
            seed["tenant_id"] = tid
            await db.workspaces.insert_one(seed)
            workspaces.append({k: v for k, v in seed.items() if k != "_id"})
    # Never expose rdp_password. Add a boolean hint for admins to know if it's set.
    for w in workspaces:
        pwd = w.pop("rdp_password", None)
        if user.get("role") == "admin":
            w["rdp_password_set"] = bool(pwd)
    return workspaces

class WorkspaceCreate(BaseModel):
    name: str
    type: str
    description: str
    url: str = ""
    connection_type: str = "html5"
    requires_netbird: bool = False
    clientless: bool = True
    launch_mode: str = "new_tab"
    cpu: str = "2 vCPU"
    memory: str = "4 GB"
    storage: str = "50 GB"
    image_url: str = ""
    icon: str = "default"
    # TSplus Remote Action Engine — credential injection
    rdp_username: Optional[str] = None
    rdp_password: Optional[str] = None
    rdp_domain: Optional[str] = None
    rdp_application_path: Optional[str] = None

class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    url: Optional[str] = None
    connection_type: Optional[str] = None
    requires_netbird: Optional[bool] = None
    clientless: Optional[bool] = None
    launch_mode: Optional[str] = None
    cpu: Optional[str] = None
    memory: Optional[str] = None
    storage: Optional[str] = None
    image_url: Optional[str] = None
    icon: Optional[str] = None
    status: Optional[str] = None
    # TSplus Remote Action Engine — credential injection
    rdp_username: Optional[str] = None
    rdp_password: Optional[str] = None
    rdp_domain: Optional[str] = None
    rdp_application_path: Optional[str] = None
    # Direct link to a NeoVDI (Guacamole) connection for autologon iframe embedding
    guacamole_connection_id: Optional[str] = None

@api_router.post("/workspaces")
async def create_workspace(workspace: WorkspaceCreate, user: dict = Depends(get_current_user)):
    """Create a new workspace (admin only)"""
    if user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    ws_dict = workspace.model_dump()
    ws_dict['id'] = f"ws-{str(uuid.uuid4())[:8]}"
    ws_dict['status'] = 'available'
    ws_dict['tenant_id'] = await get_current_tenant_id(user)
    
    await db.workspaces.insert_one(ws_dict)
    # pymongo mutates ws_dict to include ObjectId('_id') after insert — strip it for JSON serialization
    ws_dict.pop("_id", None)
    # Never expose rdp_password; replace with boolean flag
    pwd = ws_dict.pop("rdp_password", None)
    ws_dict["rdp_password_set"] = bool(pwd)
    await create_audit_log(user['id'], user['email'], "create_workspace", f"workspace:{ws_dict['id']}", f"Created workspace: {workspace.name}")

    return {"message": "Workspace created", "workspace": ws_dict}

@api_router.put("/workspaces/{workspace_id}")
async def update_workspace(workspace_id: str, update: WorkspaceUpdate, user: dict = Depends(get_current_user)):
    """Update workspace configuration (admin only)"""
    if user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tid = await get_current_tenant_id(user)
    # Restrict to current tenant — admins of one tenant cannot edit other tenants' workspaces
    workspace = await db.workspaces.find_one({"id": workspace_id, "$or": [{"tenant_id": tid}, {"tenant_id": {"$exists": False}}]}, {"_id": 0})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    
    if update_data:
        await db.workspaces.update_one({"id": workspace_id}, {"$set": update_data})
        # Sanitize audit: never log credentials
        safe_log = {k: ("***" if k == "rdp_password" else v) for k, v in update_data.items()}
        await create_audit_log(user['id'], user['email'], "update_workspace", f"workspace:{workspace_id}", f"Updated workspace: {safe_log}")
    
    updated = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})
    # Strip password from response (admin can see if it's set via the flag)
    if updated:
        pwd = updated.pop("rdp_password", None)
        updated["rdp_password_set"] = bool(pwd)
    return {"message": "Workspace updated", "workspace": updated}

@api_router.delete("/workspaces/{workspace_id}")
async def delete_workspace(workspace_id: str, user: dict = Depends(get_current_user)):
    """Delete a workspace (admin only)"""
    if user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.workspaces.delete_one({"id": workspace_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    await create_audit_log(user['id'], user['email'], "delete_workspace", f"workspace:{workspace_id}", "Workspace deleted")
    return {"message": "Workspace deleted"}

@api_router.post("/workspaces/reset")
async def reset_workspaces(user: dict = Depends(get_current_user)):
    """Reset workspaces to defaults (admin only)"""
    if user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    await db.workspaces.delete_many({})
    for ws in DEFAULT_WORKSPACES:
        await db.workspaces.insert_one(ws.copy())
    
    await create_audit_log(user['id'], user['email'], "reset_workspaces", "workspaces", "Reset to default workspaces")
    return {"message": "Workspaces reset to defaults", "count": len(DEFAULT_WORKSPACES)}

@api_router.post("/workspaces/{workspace_id}/launch")
async def launch_workspace(workspace_id: str, user: dict = Depends(get_current_user)):
    workspace = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    # Check if workspace is available
    if workspace.get('status') == 'coming_soon':
        raise HTTPException(status_code=400, detail="Este workspace estará disponible próximamente")
    
    # Create a new session
    session = Session(
        user_id=user['id'],
        user_email=user['email'],
        workspace_id=workspace_id,
        workspace_name=workspace['name'],
        workspace_type=workspace['type']
    )
    
    session_doc = session.model_dump()
    session_doc['started_at'] = session_doc['started_at'].isoformat()
    session_doc['clientless'] = workspace.get('clientless', False)
    session_doc['launch_mode'] = workspace.get('launch_mode', 'new_tab')
    session_doc['tenant_id'] = await get_current_tenant_id(user)
    
    await db.sessions.insert_one(session_doc)
    
    # Update workspace status
    await db.workspaces.update_one({"id": workspace_id}, {"$set": {"status": "running"}})
    
    # Create audit log
    await create_audit_log(
        user['id'], user['email'], "launch_workspace", 
        f"workspace:{workspace_id}", f"Launched {workspace['name']} (clientless: {workspace.get('clientless', False)})"
    )
    
    # Determine the connection URL
    connection_url = workspace.get('url', '')
    launch_mode = workspace.get('launch_mode', 'new_tab')
    is_clientless = workspace.get('clientless', False)
    connection_type = workspace.get('connection_type', '')

    # Prefer direct NeoVDI client link if the workspace has a linked connection
    guac_conn_id = workspace.get("guacamole_connection_id")
    if guac_conn_id:
        try:
            link = await guacamole_client.get_connection_link(str(guac_conn_id))
            if link.get("ok"):
                connection_url = link["url"]
        except Exception as e:
            logger.warning(f"guac link build error: {e}")
    
    # For JumpServer workspaces, generate a Luna connection URL
    jumpserver_luna_url = None
    if connection_type == 'jumpserver' and JUMPSERVER_URL and JUMPSERVER_API_TOKEN:
        try:
            js_config = workspace.get('jumpserver_config', {})
            asset_id = js_config.get('asset_id', JUMPSERVER_ASSET_WINDOWS)
            account_id = js_config.get('account_id', JUMPSERVER_ACCOUNT_RDP)
            protocol = js_config.get('protocol', 'rdp')
            
            async with httpx.AsyncClient(verify=False, timeout=15.0) as http_client:
                payload = {
                    "asset": asset_id,
                    "account": account_id,
                    "protocol": protocol,
                    "connect_method": "web",
                    "user": JUMPSERVER_USER_ID,
                }
                
                response = await http_client.post(
                    f"{JUMPSERVER_URL}/api/v1/authentication/super-connection-token/",
                    headers={
                        "Authorization": f"Token {JUMPSERVER_API_TOKEN}",
                        "Content-Type": "application/json",
                        "X-JMS-ORG": JUMPSERVER_ORG_ID,
                    },
                    json=payload,
                )
                
                if response.status_code in (200, 201):
                    data = response.json()
                    token_id = data.get("id")
                    if token_id:
                        jumpserver_luna_url = f"{JUMPSERVER_URL}/lion/connect/?token={token_id}"
                        connection_url = jumpserver_luna_url
                        # JumpServer sessions always open in new window (requires session cookies)
                        launch_mode = 'new_tab'
                else:
                    logger.warning(f"JumpServer token failed: {response.status_code} {response.text}")
        except Exception as e:
            logger.error(f"JumpServer error during workspace launch: {e}")
    
    return {
        "session_id": session.id,
        "workspace": {k: v for k, v in workspace.items() if k != "rdp_password"},
        "connection_url": connection_url,
        "launch_mode": launch_mode,
        "clientless": is_clientless,
        "requires_netbird": workspace.get('requires_netbird', False),
        "connection_type": connection_type,
        "jumpserver_luna_url": jumpserver_luna_url,
        "stream_url": f"/viewer/{session.id}" if launch_mode == 'iframe' else None,
        "tunnel_status": "encrypted" if is_clientless else "pending",
        "security": {
            "encrypted_tunnel": True,
            "identity_verified": True,
            "mfa_enforced": user.get('mfa_enabled', True),
            "session_recording": True,
            "no_open_ports": is_clientless,
            "zero_trust": True,
            "pomerium_protected": is_clientless
        }
    }

@api_router.post("/workspaces/{workspace_id}/stop")
async def stop_workspace(workspace_id: str, user: dict = Depends(get_current_user)):
    # Find active session
    session = await db.sessions.find_one(
        {"workspace_id": workspace_id, "user_id": user['id'], "status": "active"},
        {"_id": 0}
    )
    
    if session:
        await db.sessions.update_one(
            {"id": session['id']},
            {"$set": {"status": "terminated", "ended_at": datetime.now(timezone.utc).isoformat()}}
        )
    
    await db.workspaces.update_one({"id": workspace_id}, {"$set": {"status": "available"}})
    
    await create_audit_log(
        user['id'], user['email'], "stop_workspace",
        f"workspace:{workspace_id}", "Workspace stopped"
    )
    
    return {"message": "Workspace stopped successfully"}


# ============ TSPLUS REMOTE ACTION ENGINE ============

@api_router.post("/workspaces/{workspace_id}/launch-autologon")
async def launch_workspace_autologon(workspace_id: str, user: dict = Depends(get_current_user)):
    """Launch workspace with credential injection — user never sees/types the password."""
    workspace = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    if workspace.get("status") == "coming_soon":
        raise HTTPException(status_code=400, detail="Workspace no disponible aun")

    rdp_username = workspace.get("rdp_username")
    rdp_password = workspace.get("rdp_password")
    rdp_domain = workspace.get("rdp_domain", "")

    if not rdp_username or not rdp_password:
        raise HTTPException(status_code=400, detail="Workspace sin credenciales configuradas. Usar /launch estandar.")

    session = Session(user_id=user["id"], user_email=user["email"], workspace_id=workspace_id,
                      workspace_name=workspace["name"], workspace_type=workspace.get("type", "rdp"))
    session_doc = session.model_dump()
    session_doc["started_at"] = session_doc["started_at"].isoformat()
    session_doc["clientless"] = True
    session_doc["launch_mode"] = workspace.get("launch_mode", "iframe")
    session_doc["connection_type"] = "tsplus_autologon"
    session_doc["tenant_id"] = await get_current_tenant_id(user)
    await db.sessions.insert_one(session_doc)
    await db.workspaces.update_one({"id": workspace_id}, {"$set": {"status": "running"}})

    # Get autologon token from TSplus Farm Manager
    tsplus_token = None
    connection_url = workspace.get("url", "")
    # Prefer a Guacamole client-direct link if the workspace has a linked connection
    guac_conn_id = workspace.get("guacamole_connection_id")
    if guac_conn_id:
        try:
            link = await guacamole_client.get_connection_link(str(guac_conn_id))
            if link.get("ok"):
                connection_url = link["url"]
        except Exception as e:
            logger.warning(f"guac link build error: {e}")
    try:
        autologon = await tsplus_manager.get_autologon_token(
            username=rdp_username, password=rdp_password,
            domain=rdp_domain, application_path=workspace.get("rdp_application_path", ""))
        if autologon.get("token"):
            tsplus_token = autologon["token"]
            connection_url = autologon["session_url"]
    except Exception as e:
        logger.error(f"TSplus autologon error: {e}")

    await db.sessions.update_one({"id": session.id}, {"$set": {
        "tsplus_token": tsplus_token, "rdp_username": rdp_username, "tsplus_session_id": None}})

    await create_audit_log(user["id"], user["email"], "launch_workspace_autologon",
                           f"workspace:{workspace_id}", f"Autologon: {workspace['name']}")
    # Strip password from workspace response
    ws_safe = {k: v for k, v in workspace.items() if k != "rdp_password"}
    ws_safe["rdp_password_set"] = bool(workspace.get("rdp_password"))
    return {
        "session_id": session.id, "workspace": ws_safe,
        "connection_url": connection_url,
        "launch_mode": workspace.get("launch_mode", "iframe"),
        "autologon": tsplus_token is not None, "clientless": True,
        "security": {"credential_injection": True, "password_never_exposed": True,
                     "token_based": tsplus_token is not None, "zero_trust": True},
    }


@api_router.post("/sessions/{session_id}/action")
async def execute_session_action(session_id: str, body: dict, user: dict = Depends(get_current_user)):
    """Execute a control action on an active remote session (logoff, disconnect, lock)."""
    ALLOWED = {"logoff", "disconnect", "lock"}
    session = await db.sessions.find_one({"id": session_id, "user_id": user["id"]}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Sesion no encontrada")
    if session.get("status") not in ("active", None):
        raise HTTPException(status_code=400, detail="Sesion no esta activa")

    action = body.get("action", "")
    if action not in ALLOWED:
        raise HTTPException(status_code=400, detail=f"Accion no valida. Permitidas: {ALLOWED}")

    tsplus_sid = session.get("tsplus_session_id")
    rdp_user = session.get("rdp_username")

    if not tsplus_sid and rdp_user:
        try:
            ts = await tsplus_manager.get_user_session(rdp_user)
            if ts:
                tsplus_sid = ts.get("SessionId") or ts.get("Id")
                await db.sessions.update_one({"id": session_id}, {"$set": {"tsplus_session_id": tsplus_sid}})
        except Exception as e:
            logger.warning(f"TSplus session lookup failed: {e}")

    # For Guacamole sessions, handle disconnect differently
    guac_conn_id = session.get("guacamole_connection_id")
    success = False

    if tsplus_sid:
        if action == "logoff":
            success = await tsplus_manager.logoff_session(tsplus_sid)
        elif action == "disconnect":
            success = await tsplus_manager.disconnect_session(tsplus_sid)
        elif action == "lock":
            success = await tsplus_manager.lock_session(tsplus_sid)
    elif guac_conn_id:
        # For Guacamole connections, we can only kill via API
        if action in ("logoff", "disconnect"):
            await guacamole_client.delete_connection(guac_conn_id)
            success = True
    else:
        # No TSplus or Guacamole session — mark as terminated anyway
        success = True

    if action == "logoff" and success:
        await db.sessions.update_one({"id": session_id},
            {"$set": {"status": "terminated", "ended_at": datetime.now(timezone.utc).isoformat()}})
        await db.workspaces.update_one({"id": session.get("workspace_id")}, {"$set": {"status": "available"}})
    elif action == "disconnect" and success:
        await db.sessions.update_one({"id": session_id},
            {"$set": {"status": "disconnected", "ended_at": datetime.now(timezone.utc).isoformat()}})

    await create_audit_log(user["id"], user["email"], f"session_action_{action}",
                           f"session:{session_id}", f"Action {action} tsplus_sid={tsplus_sid}")
    return {"session_id": session_id, "action": action, "success": success, "tsplus_session_id": tsplus_sid,
            "message": f"Accion '{action}' ejecutada" if success else f"Accion '{action}' enviada"}


@api_router.get("/admin/tsplus/sessions")
async def list_tsplus_sessions(user: dict = Depends(get_current_user)):
    """List active sessions on TSplus Server."""
    require_admin(user)
    try:
        sessions = await tsplus_manager.list_sessions()
        return {"sessions": sessions, "count": len(sessions)}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error: {str(e)}")


@api_router.get("/admin/tsplus/status")
async def tsplus_status(user: dict = Depends(get_current_user)):
    require_admin(user)
    return await tsplus_manager.check_status()


# ============ REAL-TIME NOTIFICATIONS (SSE) ============

@api_router.get("/notifications/stream")
async def notifications_stream(request: Request, token: str = ""):
    """SSE stream. Auth via ?token= query param (EventSource can't set headers)."""
    if not token or token not in active_tokens:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = active_tokens[token]
    user_id = user["id"]
    q = await notifications_hub.subscribe(user_id)

    async def event_stream():
        try:
            async for chunk in sse_generator(q):
                if await request.is_disconnected():
                    break
                yield chunk
        finally:
            await notifications_hub.unsubscribe(user_id, q)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@api_router.post("/notifications/test")
async def notifications_test(body: dict, user: dict = Depends(get_current_user)):
    """Admin-only: send a test notification to a user (or self)."""
    require_admin(user)
    target = body.get("user_id") or user["id"]
    await notifications_hub.publish(target, {
        "type": body.get("type", "info"),
        "title": body.get("title", "Notificación de prueba"),
        "message": body.get("message", "Hola desde NeoSC"),
        "source": "admin_test",
    })
    return {"ok": True, "target": target}


@api_router.post("/admin/sessions/{session_id}/action")
async def admin_session_action(session_id: str, body: dict, user: dict = Depends(get_current_user)):
    """Admin forces an action on ANY user's session and notifies them in real-time."""
    require_admin(user)
    ALLOWED = {"logoff", "disconnect", "lock"}
    action = body.get("action", "")
    if action not in ALLOWED:
        raise HTTPException(status_code=400, detail=f"Accion no valida. Permitidas: {ALLOWED}")

    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Sesion no encontrada")

    target_user_id = session.get("user_id")
    target_email = session.get("user_email")
    tsplus_sid = session.get("tsplus_session_id")
    rdp_user = session.get("rdp_username")
    guac_conn_id = session.get("guacamole_connection_id")

    if not tsplus_sid and rdp_user:
        try:
            ts = await tsplus_manager.get_user_session(rdp_user)
            if ts:
                tsplus_sid = ts.get("SessionId") or ts.get("Id")
                await db.sessions.update_one({"id": session_id}, {"$set": {"tsplus_session_id": tsplus_sid}})
        except Exception as e:
            logger.warning(f"TSplus session lookup failed: {e}")

    success = False
    if tsplus_sid:
        if action == "logoff":
            success = await tsplus_manager.logoff_session(tsplus_sid)
        elif action == "disconnect":
            success = await tsplus_manager.disconnect_session(tsplus_sid)
        elif action == "lock":
            success = await tsplus_manager.lock_session(tsplus_sid)
    elif guac_conn_id and action in ("logoff", "disconnect"):
        await guacamole_client.delete_connection(guac_conn_id)
        success = True
    else:
        success = True

    if action == "logoff" and success:
        await db.sessions.update_one({"id": session_id},
            {"$set": {"status": "terminated", "ended_at": datetime.now(timezone.utc).isoformat(),
                      "terminated_by": user["email"]}})
        await db.workspaces.update_one({"id": session.get("workspace_id")}, {"$set": {"status": "available"}})
    elif action == "disconnect" and success:
        await db.sessions.update_one({"id": session_id},
            {"$set": {"status": "disconnected", "ended_at": datetime.now(timezone.utc).isoformat(),
                      "terminated_by": user["email"]}})

    # Notify the target user in real time
    labels = {"logoff": "cerrada", "disconnect": "desconectada", "lock": "bloqueada"}
    await notifications_hub.publish(target_user_id, {
        "type": f"session.{action}",
        "title": f"Sesión {labels.get(action, action)} por el administrador",
        "message": f"Tu sesión en {session.get('workspace_name', 'workspace')} fue {labels.get(action, action)} por {user['email']}.",
        "session_id": session_id,
        "action": action,
        "admin_email": user["email"],
        "severity": "warning" if action == "lock" else "error",
    })

    await create_audit_log(user["id"], user["email"], f"admin_session_action_{action}",
                           f"session:{session_id}",
                           f"Admin {user['email']} forced {action} on session of {target_email}")
    return {"session_id": session_id, "action": action, "success": success,
            "target_user": target_email, "notified": True}


# ============ EMAIL NOTIFICATIONS (MOCK) ============

async def send_mock_email(to: str, subject: str, body_html: str, category: str = "general") -> str:
    """Store a 'sent' email in MongoDB and log it. Returns the email id."""
    email_id = str(uuid.uuid4())
    doc = {
        "id": email_id,
        "to": to,
        "subject": subject,
        "body_html": body_html,
        "category": category,
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "delivery": "mock",
    }
    await db.mock_emails.insert_one(doc.copy())
    logger.info(f"[MOCK EMAIL] to={to} subject={subject} id={email_id}")
    return email_id


@api_router.get("/admin/emails")
async def list_mock_emails(user: dict = Depends(get_current_user)):
    """List recent mock emails (admin only)."""
    require_admin(user)
    emails = await db.mock_emails.find({}, {"_id": 0, "body_html": 0}).sort("sent_at", -1).to_list(100)
    return {"emails": emails, "count": len(emails)}


@api_router.get("/admin/emails/{email_id}")
async def get_mock_email(email_id: str, user: dict = Depends(get_current_user)):
    """Preview a mock email HTML body (admin only)."""
    require_admin(user)
    email = await db.mock_emails.find_one({"id": email_id}, {"_id": 0})
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    return email


# ============ TENANT USER INVITATIONS (B2B Flow) ============

class InviteUsersBody(BaseModel):
    emails: List[str]
    role: str = "user"
    welcome_message: str = ""
    use_neoguard: bool = True  # When True, creates user in NeoGuard (Zitadel) with native B2C email flow


async def _create_neoguard_user(email: str, given_name: str, family_name: str, origin: str) -> dict:
    """Create a Human user in NeoGuard (Zitadel) with native email verification + init password.
    Returns {'ok': bool, 'user_id': str, 'details': dict, 'error': str}"""
    if not ZITADEL_DOMAIN or not ZITADEL_PAT:
        return {"ok": False, "error": "NeoGuard not configured"}
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            # Zitadel v2 createHumanUser — sends its own email when `email.sendCode` or `sendCode` is present
            payload = {
                "username": email,
                "profile": {
                    "givenName": given_name or email.split("@")[0],
                    "familyName": family_name or "NeoSC",
                },
                "email": {
                    "email": email,
                    "sendCode": {
                        "urlTemplate": f"{origin}/activate?userID={{{{.UserID}}}}&code={{{{.Code}}}}&orgID={{{{.OrgID}}}}",
                    },
                },
            }
            r = await c.post(
                f"{ZITADEL_DOMAIN}/v2/users/human",
                headers=zitadel_headers(org_id=ZITADEL_ORG_ID),
                json=payload,
            )
            if r.status_code >= 400:
                return {"ok": False, "error": f"Zitadel HTTP {r.status_code}: {r.text[:200]}"}
            data = r.json()
            return {"ok": True, "user_id": data.get("userId") or data.get("id"), "details": data}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}


async def _grant_project_role(zitadel_user_id: str, role_key: str) -> dict:
    """Grant a project role to a user. role_key must match one of the defined project roles."""
    if not ZITADEL_DOMAIN or not ZITADEL_PAT or not zitadel_user_id or not ZITADEL_PROJECT_ID:
        return {"ok": False, "error": "Missing config or user id"}
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(
                f"{ZITADEL_DOMAIN}/management/v1/users/{zitadel_user_id}/grants",
                headers=zitadel_headers(org_id=ZITADEL_ORG_ID),
                json={"projectId": ZITADEL_PROJECT_ID, "roleKeys": [role_key]},
            )
            if r.status_code >= 400:
                return {"ok": False, "error": f"HTTP {r.status_code}: {r.text[:160]}"}
            return {"ok": True, "grant_id": r.json().get("userGrantId")}
    except Exception as e:
        return {"ok": False, "error": str(e)[:160]}


@api_router.post("/tenants/invite-users")
async def invite_users(body: InviteUsersBody, user: dict = Depends(get_current_user)):
    """Admin invites end users — creates user in NeoGuard (B2C native email flow) when available,
    falls back to local mock email. Each user gets a role grant on the current project."""
    require_admin(user)
    tenant_org = user.get("organization", "NeoSC Tenant")
    origin = os.environ.get("WEBAPP_PUBLIC_URL") or os.environ.get("FRONTEND_URL") or ""
    if not origin:
        # In preview env fall back to the request origin via env from frontend
        origin = "https://action-steps-4.preview.emergentagent.com"
    results = []
    neoguard_available = bool(ZITADEL_DOMAIN and ZITADEL_PAT) and body.use_neoguard

    for email in body.emails:
        email = email.strip().lower()
        if not email or "@" not in email:
            results.append({"email": email, "status": "invalid"})
            continue
        existing = await db.users.find_one({"email": email}, {"_id": 0})
        if existing:
            results.append({"email": email, "status": "already_exists", "user_id": existing.get("id")})
            continue

        invite_token = generate_token()
        new_user = User(email=email, name=email.split("@")[0], organization=tenant_org, role=body.role)
        user_doc = new_user.model_dump()
        user_doc["created_at"] = user_doc["created_at"].isoformat()
        user_doc["invite_token"] = invite_token
        user_doc["invited_by"] = user["email"]
        user_doc["invite_status"] = "pending"
        # Inject tenant_id from inviter
        user_doc["tenant_id"] = user.get("tenant_id") or (await ensure_default_tenant())["id"]

        delivery = "mock"
        neoguard_result = None
        grant_result = None
        if neoguard_available:
            neoguard_result = await _create_neoguard_user(
                email=email,
                given_name=email.split("@")[0].replace(".", " ").title(),
                family_name="NeoSC",
                origin=origin,
            )
            if neoguard_result.get("ok"):
                user_doc["zitadel_user_id"] = neoguard_result.get("user_id")
                user_doc["sso_provider"] = "neoguard"
                delivery = "neoguard"
                # Grant role on the project (best-effort; may fail if project grants not configured)
                try:
                    grant_result = await _grant_project_role(neoguard_result.get("user_id"), body.role)
                except Exception as e:
                    grant_result = {"ok": False, "error": str(e)[:160]}

        user_doc["delivery"] = delivery
        await db.users.insert_one(user_doc)

        email_id = None
        if delivery == "mock":
            # Keep the mock email as a local preview (no real SMTP)
            invite_url = f"{origin}/login?invite={invite_token}&email={email}"
            safe_welcome = html_escape_mod.escape(body.welcome_message) if body.welcome_message else ""
            safe_tenant = html_escape_mod.escape(tenant_org)
            safe_inviter = html_escape_mod.escape(user['email'])
            html = f"""
            <!DOCTYPE html>
            <html><body style='font-family:system-ui,-apple-system,Inter,sans-serif;background:#0a0e17;color:#fff;padding:32px;'>
                <div style='max-width:560px;margin:0 auto;background:#111827;border:1px solid #1e293b;border-radius:16px;padding:32px;'>
                  <div style='display:flex;align-items:center;gap:12px;margin-bottom:20px;'>
                    <div style='width:36px;height:36px;border-radius:9px;background:linear-gradient(135deg,#06b6d4,#a855f7);display:flex;align-items:center;justify-content:center;font-weight:800;'>N</div>
                    <h1 style='margin:0;font-size:18px;'>NeoSC</h1>
                  </div>
                  <h2 style='color:#06b6d4;margin:0 0 8px;'>Te invitaron a {safe_tenant}</h2>
                  <p style='color:#94a3b8;font-size:14px;line-height:1.6;'>
                    {safe_inviter} te ha invitado al portal NeoSC.
                  </p>
                  {f"<p style='color:#94a3b8;font-size:13px;border-left:3px solid #06b6d4;padding-left:12px;margin:16px 0;'>{safe_welcome}</p>" if safe_welcome else ""}
                  <a href='{invite_url}' style='display:inline-block;background:#06b6d4;color:#000;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:16px;'>Aceptar invitación</a>
                  <p style='color:#64748b;font-size:11px;margin-top:24px;'>Link expira en 7 días.</p>
                </div>
            </body></html>
            """
            email_id = await send_mock_email(
                to=email,
                subject=f"Te invitaron a {tenant_org} en NeoSC",
                body_html=html,
                category="user_invite",
            )

        results.append({
            "email": email,
            "status": "invited",
            "user_id": new_user.id,
            "email_id": email_id,
            "delivery": delivery,
            "neoguard_error": neoguard_result.get("error") if neoguard_result and not neoguard_result.get("ok") else None,
            "grant": grant_result,
            "zitadel_user_id": user_doc.get("zitadel_user_id"),
        })

        # Real-time toast to the inviter
        await notifications_hub.publish(user["id"], {
            "type": "user.invited",
            "title": "Invitación enviada",
            "message": f"Email enviado a {email} vía {delivery}",
            "severity": "success",
        })

    await create_audit_log(user["id"], user["email"], "invite_users",
                           "users", f"Invited {len(body.emails)} · NeoGuard={neoguard_available} · Success: {sum(1 for r in results if r['status']=='invited')}")

    return {"ok": True, "results": results, "total": len(body.emails),
            "delivery_mode": "neoguard" if neoguard_available else "mock"}


@api_router.post("/tenants/invite-resend/{user_id}")
async def resend_invite(user_id: str, current: dict = Depends(get_current_user)):
    """Resend invitation email (NeoGuard: reissue OTP init; mock: re-send stored template)."""
    require_admin(current)
    u = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    zid = u.get("zitadel_user_id")
    if zid and ZITADEL_DOMAIN and ZITADEL_PAT:
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                # Request new verification code (email)
                r = await c.post(
                    f"{ZITADEL_DOMAIN}/v2/users/{zid}/email/resend",
                    headers=zitadel_headers(org_id=ZITADEL_ORG_ID),
                    json={"sendCode": {"urlTemplate": "{{.Code}}"}},
                )
                if r.status_code < 400:
                    return {"ok": True, "delivery": "neoguard", "details": r.json()}
        except Exception as e:
            logger.warning(f"resend via neoguard failed: {e}")
    return {"ok": True, "delivery": "mock"}



@api_router.get("/tenants/invited-users")
async def list_invited_users(user: dict = Depends(get_current_user)):
    """List users invited by current admin (or all, if super-admin)."""
    require_admin(user)
    users = await db.users.find(
        {"invited_by": {"$exists": True}},
        {"_id": 0, "password_hash": 0, "invite_token": 0}
    ).sort("created_at", -1).to_list(200)
    return {"users": users, "count": len(users)}


# ============ APPLICATIONS ENDPOINTS ============

@api_router.get("/applications", response_model=List[dict])
async def get_applications(user: dict = Depends(get_current_user)):
    """Get all available applications"""
    tid = await get_current_tenant_id(user)
    applications = await db.applications.find({"tenant_id": tid}, {"_id": 0}).to_list(100)
    fresh_mode = os.environ.get("FRESH_TENANT_MODE", "true").lower() in ("1", "true", "yes")
    if not applications and not fresh_mode:
        # Initialize with default applications
        for app in DEFAULT_APPLICATIONS:
            seed = app.copy()
            seed["tenant_id"] = tid
            await db.applications.insert_one(seed)
            applications.append({k: v for k, v in seed.items() if k != "_id"})
    return applications

@api_router.post("/applications/{app_id}/launch")
async def launch_application(app_id: str, user: dict = Depends(get_current_user)):
    """Launch an application (similar to workspace launch)"""
    app = await db.applications.find_one({"id": app_id}, {"_id": 0})
    if not app:
        # Check default applications
        app = next((a for a in DEFAULT_APPLICATIONS if a['id'] == app_id), None)
        if not app:
            raise HTTPException(status_code=404, detail="Application not found")
    
    # Create session for this app launch
    session = Session(
        user_id=user['id'],
        user_email=user['email'],
        workspace_id=app_id,
        workspace_name=app['name'],
        workspace_type=app['type']
    )
    
    session_doc = session.model_dump()
    session_doc['started_at'] = session_doc['started_at'].isoformat()
    session_doc['is_application'] = True
    session_doc['allows_iframe'] = app.get('allows_iframe', False)
    session_doc['tenant_id'] = await get_current_tenant_id(user)
    
    await db.sessions.insert_one(session_doc)
    
    await create_audit_log(
        user['id'], user['email'], "launch_application",
        f"application:{app_id}", f"Launched {app['name']}"
    )
    
    return {
        "session_id": session.id,
        "application": app,
        "connection_url": app.get('url', ''),
        "allows_iframe": app.get('allows_iframe', False),
        "requires_vpn": app.get('requires_vpn', False),
    }

# ============ JUMPSERVER ENDPOINTS ============

class JumpServerConnectRequest(BaseModel):
    asset_id: Optional[str] = None
    account_id: Optional[str] = None
    protocol: str = "rdp"
    connect_method: str = "web"

@api_router.post("/jumpserver/connect")
async def jumpserver_connect(request: JumpServerConnectRequest, user: dict = Depends(get_current_user)):
    """Generate a JumpServer Luna connection URL for HTML5 RDP/VNC access"""
    if not JUMPSERVER_URL or not JUMPSERVER_API_TOKEN:
        raise HTTPException(status_code=500, detail="JumpServer not configured")
    
    asset_id = request.asset_id or JUMPSERVER_ASSET_WINDOWS
    account_id = request.account_id or JUMPSERVER_ACCOUNT_RDP
    
    try:
        async with httpx.AsyncClient(verify=False, timeout=15.0) as http_client:
            # Call super-connection-token with fixed API key
            payload = {
                "asset": asset_id,
                "account": account_id,
                "protocol": request.protocol,
                "connect_method": request.connect_method,
                "user": JUMPSERVER_USER_ID,
            }
            
            response = await http_client.post(
                f"{JUMPSERVER_URL}/api/v1/authentication/super-connection-token/",
                headers={
                    "Authorization": f"Token {JUMPSERVER_API_TOKEN}",
                    "Content-Type": "application/json",
                    "X-JMS-ORG": JUMPSERVER_ORG_ID,
                },
                json=payload,
            )
            
            if response.status_code != 200 and response.status_code != 201:
                error_text = response.text
                logger.error(f"JumpServer error ({response.status_code}): {error_text}")
                raise HTTPException(
                    status_code=502,
                    detail=f"JumpServer connection failed: {error_text}"
                )
            
            data = response.json()
            token_id = data.get("id")
            
            if not token_id:
                raise HTTPException(status_code=502, detail="No token received from JumpServer")
            
            luna_url = f"{JUMPSERVER_URL}/lion/connect/?token={token_id}"
            
            # Create audit log
            await create_audit_log(
                user['id'], user['email'], "jumpserver_connect",
                f"jumpserver:{asset_id}", 
                f"Generated Luna connection for {request.protocol} asset {asset_id}"
            )
            
            return {
                "token": token_id,
                "luna_url": luna_url,
                "protocol": request.protocol,
                "expire_time": data.get("expire_time", 300),
            }
            
    except httpx.RequestError as e:
        logger.error(f"JumpServer connection error: {e}")
        raise HTTPException(status_code=502, detail=f"Cannot reach JumpServer: {str(e)}")

@api_router.get("/jumpserver/status")
async def jumpserver_status(user: dict = Depends(get_current_user)):
    """Check JumpServer connectivity"""
    if not JUMPSERVER_URL:
        return {"configured": False, "reachable": False}
    
    try:
        async with httpx.AsyncClient(verify=False, timeout=5.0) as http_client:
            response = await http_client.get(
                f"{JUMPSERVER_URL}/api/health/",
                timeout=5.0
            )
            return {
                "configured": True,
                "reachable": response.status_code < 500,
                "url": JUMPSERVER_URL,
            }
    except Exception:
        return {"configured": True, "reachable": False, "url": JUMPSERVER_URL}

# ============ SESSIONS ENDPOINTS ============

@api_router.get("/sessions", response_model=List[dict])
async def get_sessions(user: dict = Depends(get_current_user)):
    sessions = await db.sessions.find({"user_id": user['id']}, {"_id": 0}).to_list(100)
    return sessions

# ============ TENANTS ENDPOINTS (multi-tenant) ============

@api_router.get("/tenants/me")
async def get_my_tenant(user: dict = Depends(get_current_user)):
    """Returns the tenant the current user belongs to."""
    tenant = await get_user_tenant(user)
    # Add live counters scoped to this tenant
    tid = tenant["id"]
    counters = {
        "users": await db.users.count_documents({"tenant_id": tid}),
        "workspaces": await db.workspaces.count_documents({"tenant_id": tid}),
        "applications": await db.applications.count_documents({"tenant_id": tid}),
        "active_sessions": await db.sessions.count_documents({"tenant_id": tid, "status": {"$in": ["active", None]}}),
        "audit_logs": await db.audit_logs.count_documents({"tenant_id": tid}),
    }
    return {**tenant, "counters": counters}


@api_router.get("/tenants")
async def list_tenants(user: dict = Depends(get_current_user)):
    """List all tenants. Admins of any tenant can list (but data inside each is isolated)."""
    require_admin(user)
    tenants = await db.tenants.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    # Attach quick counters
    for t in tenants:
        tid = t["id"]
        t["counters"] = {
            "users": await db.users.count_documents({"tenant_id": tid}),
            "workspaces": await db.workspaces.count_documents({"tenant_id": tid}),
        }
    return {"tenants": tenants, "count": len(tenants)}


@api_router.post("/tenants")
async def create_tenant(body: TenantCreate, user: dict = Depends(get_current_user)):
    """Create a new tenant (admin only)."""
    require_admin(user)
    slug = (body.slug or body.name).lower().strip()
    import re
    slug = re.sub(r'[^a-z0-9-]+', '-', slug).strip('-') or "tenant"
    existing = await db.tenants.find_one({"slug": slug}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail=f"Tenant slug '{slug}' already exists")
    tenant = Tenant(name=body.name, slug=slug, plan=body.plan)
    doc = tenant.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.tenants.insert_one(doc.copy())
    doc.pop('_id', None)
    await create_audit_log(user["id"], user["email"], "tenant_create",
                           f"tenant:{tenant.id}", f"Created tenant: {tenant.name} ({slug})")
    return {"ok": True, "tenant": doc}


@api_router.put("/tenants/{tenant_id}")
async def update_tenant(tenant_id: str, body: dict, user: dict = Depends(get_current_user)):
    """Update tenant config (admin only). Allowed fields: name, plan, status, branding, fresh_mode."""
    require_admin(user)
    ALLOWED = {"name", "plan", "status", "branding", "fresh_mode"}
    update = {k: v for k, v in body.items() if k in ALLOWED}
    if not update:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    if "status" in update and update["status"] not in ("active", "suspended", "lockdown"):
        raise HTTPException(status_code=400, detail="status must be active|suspended|lockdown")
    result = await db.tenants.update_one({"id": tenant_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tenant not found")
    await create_audit_log(user["id"], user["email"], "tenant_update",
                           f"tenant:{tenant_id}", f"Updated: {update}")
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    return {"ok": True, "tenant": tenant}


@api_router.post("/tenants/{tenant_id}/lockdown")
async def lockdown_tenant_v2(tenant_id: str, user: dict = Depends(get_current_user)):
    """Lockdown a tenant: suspend all running workspaces, terminate sessions, mark tenant status=lockdown."""
    require_admin(user)
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    # Terminate all active sessions in this tenant
    sessions = await db.sessions.find(
        {"tenant_id": tenant_id, "status": {"$in": ["active", None]}}, {"_id": 0}
    ).to_list(500)
    for s in sessions:
        await db.sessions.update_one({"id": s["id"]},
            {"$set": {"status": "terminated", "terminated_by": user["email"],
                      "ended_at": datetime.now(timezone.utc).isoformat()}})
        await notifications_hub.publish(s.get("user_id", ""), {
            "type": "session.logoff", "severity": "error",
            "title": "Tenant en lockdown",
            "message": f"Tu sesión fue terminada por lockdown del tenant {tenant['name']}",
            "session_id": s["id"], "action": "logoff",
        })
    await db.workspaces.update_many({"tenant_id": tenant_id, "status": "running"},
                                    {"$set": {"status": "suspended"}})
    await db.tenants.update_one({"id": tenant_id}, {"$set": {"status": "lockdown"}})
    await create_audit_log(user["id"], user["email"], "tenant_lockdown",
                           f"tenant:{tenant_id}",
                           f"Lockdown {tenant['name']}: {len(sessions)} sessions killed")
    return {"ok": True, "tenant_id": tenant_id, "killed_sessions": len(sessions)}


@api_router.get("/sessions/active", response_model=List[dict])
async def get_active_sessions(user: dict = Depends(get_current_user)):
    sessions = await db.sessions.find(
        {"user_id": user['id'], "status": "active"},
        {"_id": 0}
    ).to_list(100)
    return sessions

@api_router.get("/sessions/{session_id}")
async def get_session(session_id: str, user: dict = Depends(get_current_user)):
    session = await db.sessions.find_one({"id": session_id, "user_id": user['id']}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@api_router.post("/sessions/{session_id}/disconnect")
async def disconnect_session(session_id: str, user: dict = Depends(get_current_user)):
    session = await db.sessions.find_one({"id": session_id, "user_id": user['id']}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    await db.sessions.update_one(
        {"id": session_id},
        {"$set": {"status": "disconnected", "ended_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if session.get('workspace_id'):
        await db.workspaces.update_one(
            {"id": session['workspace_id']},
            {"$set": {"status": "available"}}
        )
    
    await create_audit_log(
        user['id'], user['email'], "disconnect_session",
        f"session:{session_id}", "Session disconnected"
    )
    
    return {"message": "Session disconnected"}

# ============ AUDIT LOGS ENDPOINTS ============

async def create_audit_log(user_id: str, user_email: str, action: str, resource: str, details: str, success: bool = True, tenant_id: Optional[str] = None):
    log = AuditLog(
        user_id=user_id,
        user_email=user_email,
        action=action,
        resource=resource,
        details=details,
        success=success
    )
    log_doc = log.model_dump()
    log_doc['timestamp'] = log_doc['timestamp'].isoformat()
    # Inject tenant_id (resolved from user when not provided)
    if not tenant_id and user_id:
        u = await db.users.find_one({"id": user_id}, {"_id": 0, "tenant_id": 1})
        if u and u.get("tenant_id"):
            tenant_id = u["tenant_id"]
    if tenant_id:
        log_doc['tenant_id'] = tenant_id
    await db.audit_logs.insert_one(log_doc)

@api_router.get("/audit-logs", response_model=List[dict])
async def get_audit_logs(user: dict = Depends(get_current_user)):
    # Admins see audit logs for their tenant only; users see their own
    tid = await get_current_tenant_id(user)
    query = {"tenant_id": tid} if user.get('role') == 'admin' else {"user_id": user['id']}
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("timestamp", -1).to_list(500)
    return logs

# ============ ORGANIZATIONS ENDPOINTS ============

@api_router.get("/organizations", response_model=List[dict])
async def get_organizations(user: dict = Depends(get_current_user)):
    orgs = await db.organizations.find({}, {"_id": 0}).to_list(100)
    if not orgs:
        # Create default organization
        default_org = Organization(
            name=user.get('organization', 'Default Organization'),
            domain="neogenesys.com",
            users_count=1,
            workspaces_count=5
        )
        org_doc = default_org.model_dump()
        org_doc['created_at'] = org_doc['created_at'].isoformat()
        await db.organizations.insert_one(org_doc)
        orgs = [org_doc]
    return orgs

# ============ POLICIES ENDPOINTS ============

DEFAULT_POLICIES = [
    {
        "id": "pol-mfa-required",
        "name": "MFA Required",
        "description": "Enforce multi-factor authentication for all users",
        "type": "access",
        "rules": ["Require MFA for login", "WebAuthn preferred", "TOTP as fallback"],
        "enabled": True
    },
    {
        "id": "pol-network-zero-trust",
        "name": "Zero Trust Network",
        "description": "All connections through encrypted NetBird tunnels",
        "type": "network",
        "rules": ["No direct connections", "WireGuard encryption", "Identity verification"],
        "enabled": True
    },
    {
        "id": "pol-session-recording",
        "name": "Session Recording",
        "description": "Record all workspace sessions for audit",
        "type": "session",
        "rules": ["Record screen activity", "Log keystrokes for audit", "30-day retention"],
        "enabled": True
    }
]

@api_router.get("/policies", response_model=List[dict])
async def get_policies(user: dict = Depends(get_current_user)):
    policies = await db.policies.find({}, {"_id": 0}).to_list(100)
    if not policies:
        for pol in DEFAULT_POLICIES:
            pol_copy = pol.copy()
            pol_copy['created_at'] = datetime.now(timezone.utc).isoformat()
            await db.policies.insert_one(pol_copy)
        policies = DEFAULT_POLICIES
    return policies

@api_router.patch("/policies/{policy_id}")
async def toggle_policy(policy_id: str, user: dict = Depends(get_current_user)):
    policy = await db.policies.find_one({"id": policy_id}, {"_id": 0})
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    
    new_status = not policy.get('enabled', True)
    await db.policies.update_one({"id": policy_id}, {"$set": {"enabled": new_status}})
    
    await create_audit_log(
        user['id'], user['email'], "toggle_policy",
        f"policy:{policy_id}", f"Policy {'enabled' if new_status else 'disabled'}"
    )
    
    return {"message": f"Policy {'enabled' if new_status else 'disabled'}", "enabled": new_status}

# ============ STATS ENDPOINT ============

@api_router.get("/stats")
async def get_stats(user: dict = Depends(get_current_user)):
    active_sessions = await db.sessions.count_documents({"status": "active"})
    total_workspaces = await db.workspaces.count_documents({})
    total_users = await db.users.count_documents({})
    
    return {
        "active_sessions": active_sessions,
        "total_workspaces": total_workspaces or 5,
        "total_users": total_users or 1,
        "security_score": 98,
        "uptime": "99.9%"
    }

# ============ ROOT ENDPOINT ============

@api_router.get("/")
async def root():
    return {"message": "NeoSC API - Neogenesys Secure Connect", "version": "1.0.0"}


# ============ ADMIN GLOBAL — S7 PANEL ============

def require_admin(user: dict):
    if user.get('role') not in ('admin', 'platform_admin'):
        raise HTTPException(status_code=403, detail="Admin access required")

@api_router.get("/admin/global-stats")
async def admin_global_stats(user: dict = Depends(get_current_user)):
    require_admin(user)
    total_tenants = await db.organizations.count_documents({})
    active_tenants = await db.organizations.count_documents({"status": {"$ne": "suspended"}})
    total_vms = await db.market_orders.count_documents({"status": "completed"})
    running_vms = await db.market_orders.count_documents({"status": "completed", "payment_status": "paid"})
    total_users = await db.users.count_documents({})
    active_orders = await db.market_orders.count_documents({"status": {"$in": ["pending", "provisioning"]}})

    # Calculate MRR from completed paid orders
    pipeline = [
        {"$match": {"payment_status": "paid"}},
        {"$group": {"_id": None, "total": {"$sum": "$pricing.total"}}}
    ]
    mrr_result = await db.market_orders.aggregate(pipeline).to_list(1)
    mrr = mrr_result[0]["total"] if mrr_result else 0

    return {
        "active_tenants": active_tenants or total_tenants or 4,
        "running_vms": running_vms or total_vms or 18,
        "mrr": round(mrr, 2) if mrr else 4820.0,
        "active_orders": active_orders or 2,
        "total_users": total_users,
        "total_tenants": total_tenants or 4,
        "security_score": 98,
        "uptime": "99.97%",
    }

@api_router.get("/admin/tenants")
async def admin_tenants(user: dict = Depends(get_current_user)):
    require_admin(user)
    orgs = await db.organizations.find({}, {"_id": 0}).to_list(100)
    if not orgs:
        # Seed demo tenants
        demo_tenants = [
            {"id": "tenant-1", "name": "Neogenesys SA", "domain": "neogenesys.com", "plan": "Business",
             "vms": 2, "users_current": 8, "users_max": 10, "status": "activo", "mrr": 200.0,
             "sso_provider": "zitadel", "created_at": "2025-11-01T00:00:00Z"},
            {"id": "tenant-2", "name": "Constructora MX", "domain": "constructoramx.com", "plan": "Enterprise",
             "vms": 5, "users_current": 22, "users_max": 25, "status": "activo", "mrr": 400.0,
             "sso_provider": "zitadel", "created_at": "2025-12-15T00:00:00Z"},
            {"id": "tenant-3", "name": "Logística Rápida", "domain": "logisticarapida.mx", "plan": "Starter",
             "vms": 1, "users_current": 3, "users_max": 5, "status": "trial", "mrr": 50.0,
             "sso_provider": "local", "created_at": "2026-01-20T00:00:00Z"},
            {"id": "tenant-4", "name": "FinTech Alpha", "domain": "fintechalpha.io", "plan": "Business",
             "vms": 3, "users_current": 9, "users_max": 10, "status": "activo", "mrr": 200.0,
             "sso_provider": "zitadel", "created_at": "2026-02-01T00:00:00Z"},
            {"id": "tenant-5", "name": "Bufete Legal RC", "domain": "bufetelegalrc.com", "plan": "Starter",
             "vms": 1, "users_current": 2, "users_max": 5, "status": "activo", "mrr": 50.0,
             "sso_provider": "local", "created_at": "2026-02-10T00:00:00Z"},
        ]
        for t in demo_tenants:
            await db.organizations.insert_one(t.copy())
        orgs = demo_tenants
    return [
        {k: v for k, v in o.items() if k != '_id'} for o in orgs
    ]

@api_router.post("/admin/tenants/{tenant_id}/lockdown")
async def admin_lockdown_tenant(tenant_id: str, user: dict = Depends(get_current_user)):
    require_admin(user)
    result = await db.organizations.update_one(
        {"id": tenant_id},
        {"$set": {"status": "suspended"}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Tenant not found")
    await create_audit_log(user['id'], user['email'], "tenant_lockdown", f"tenant:{tenant_id}", f"Tenant {tenant_id} suspended")
    return {"message": f"Tenant {tenant_id} suspended"}

@api_router.post("/admin/tenants/{tenant_id}/activate")
async def admin_activate_tenant(tenant_id: str, user: dict = Depends(get_current_user)):
    require_admin(user)
    result = await db.organizations.update_one(
        {"id": tenant_id},
        {"$set": {"status": "activo"}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Tenant not found")
    await create_audit_log(user['id'], user['email'], "tenant_activate", f"tenant:{tenant_id}", f"Tenant {tenant_id} activated")
    return {"message": f"Tenant {tenant_id} activated"}

@api_router.get("/admin/orchestrator")
async def admin_orchestrator(user: dict = Depends(get_current_user)):
    require_admin(user)
    tid = await get_current_tenant_id(user)
    # Real provisioning orders — scoped to tenant
    active_orders = await db.market_orders.find(
        {"tenant_id": tid, "status": {"$in": ["pending", "provisioning", "completed"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(20)

    # Real active sessions count (scoped to tenant)
    active_sessions = await db.sessions.count_documents({"tenant_id": tid, "status": {"$in": ["active", None]}})
    pending_invites = await db.users.count_documents({"tenant_id": tid, "invite_status": "pending"})
    active_workspaces = await db.workspaces.count_documents({"tenant_id": tid, "status": "running"})

    # Real workers — derived from active async tasks in DB
    workers = [
        {"name": "provision@worker-1", "status": "activo",
         "tasks": len([o for o in active_orders if o.get("status") == "provisioning"]),
         "current_task": next((o.get("current_action") for o in active_orders if o.get("status") == "provisioning"), None),
         "description": "VM bootstrap (LXD + Windows + NetBird)"},
        {"name": "tsplus@worker-1", "status": "activo" if active_sessions > 0 else "idle",
         "tasks": active_sessions,
         "current_task": f"serving {active_sessions} session(s)" if active_sessions else None,
         "description": "TSplus Farm + session control"},
        {"name": "notify@worker-1", "status": "activo",
         "tasks": pending_invites,
         "current_task": f"{pending_invites} pending invite(s)" if pending_invites else None,
         "description": "Mock email delivery + SSE notifications"},
        {"name": "workspace@worker-1", "status": "activo" if active_workspaces else "idle",
         "tasks": active_workspaces,
         "current_task": f"{active_workspaces} workspace(s) running" if active_workspaces else None,
         "description": "LXD workspace monitor"},
        {"name": "backup@worker-1", "status": "idle", "tasks": 0, "current_task": None,
         "description": "Scheduled snapshots (off-hours)"},
    ]

    # Real provisioning queue from market_orders
    queue = []
    for order in active_orders:
        if order.get("status") in ("provisioning", "pending"):
            queue.append({
                "order_id": order.get("id", "")[:10],
                "tenant": order.get("organization") or order.get("customer_email", "Unknown"),
                "plan": order.get("neosc_plan") or order.get("plan", "Starter"),
                "status": order.get("status"),
                "step": order.get("current_step", 1),
                "total_steps": order.get("total_steps", 12),
                "current_action": order.get("current_action", "init"),
                "started_at": order.get("created_at"),
            })

    # Fallback demo when no real orders (clearly labeled)
    if not queue:
        queue = [
            {"order_id": "DEMO-9B2F1A", "tenant": "Logística Rápida (demo)", "plan": "Starter",
             "status": "provisioning", "step": 5, "total_steps": 12, "current_action": "install_tsplus",
             "started_at": datetime.now(timezone.utc).isoformat(), "is_demo": True},
            {"order_id": "DEMO-7C3D2E", "tenant": "FinTech Alpha (demo)", "plan": "Business",
             "status": "provisioning", "step": 11, "total_steps": 12, "current_action": "netbird_mesh",
             "started_at": datetime.now(timezone.utc).isoformat(), "is_demo": True},
        ]

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    completed_today = await db.market_orders.count_documents({
        "tenant_id": tid,
        "status": "completed",
        "created_at": {"$gte": today_start}
    })

    return {
        "workers": workers,
        "queue": queue,
        "active_count": len([o for o in active_orders if o.get("status") == "provisioning"]),
        "completed_today": completed_today,
        "active_sessions": active_sessions,
        "pending_invites": pending_invites,
        "active_workspaces": active_workspaces,
    }


@api_router.post("/admin/orders/{order_id}/retry")
async def admin_order_retry(order_id: str, user: dict = Depends(get_current_user)):
    """Retry a failed/stuck provisioning step (re-enqueues the current step)."""
    require_admin(user)
    order = await db.market_orders.find_one({"id": order_id}, {"_id": 0}) \
        or await db.market_orders.find_one({"id": {"$regex": f"^{order_id}"}}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("status") == "completed":
        raise HTTPException(status_code=409, detail="Order already completed — nothing to retry")
    # Reset to provisioning + advance step marker so the background task picks it up
    await db.market_orders.update_one(
        {"id": order["id"]},
        {"$set": {"status": "provisioning", "retry_count": order.get("retry_count", 0) + 1,
                  "last_retry_at": datetime.now(timezone.utc).isoformat()}}
    )
    await create_audit_log(user["id"], user["email"], "order_retry",
                           f"order:{order['id']}",
                           f"Retry step {order.get('current_step', '?')}/{order.get('total_steps', 12)} for {order.get('organization', order.get('customer_email', '?'))}")
    await notifications_hub.publish(user["id"], {
        "type": "order.retry", "severity": "info",
        "title": "Retry ejecutado", "message": f"Reintentando orden {order['id'][:10]}",
    })
    return {"ok": True, "order_id": order["id"], "retry_count": order.get("retry_count", 0) + 1}


@api_router.post("/admin/workspaces/{workspace_id}/suspend")
async def admin_workspace_suspend(workspace_id: str, user: dict = Depends(get_current_user)):
    """Suspend a running workspace (VM)."""
    require_admin(user)
    ws = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    await db.workspaces.update_one({"id": workspace_id}, {"$set": {"status": "suspended"}})
    # Also kill any active sessions on it
    sessions = await db.sessions.find({"workspace_id": workspace_id, "status": {"$in": ["active", None]}}, {"_id": 0}).to_list(10)
    for s in sessions:
        await db.sessions.update_one({"id": s["id"]},
            {"$set": {"status": "terminated", "terminated_by": user["email"],
                      "ended_at": datetime.now(timezone.utc).isoformat()}})
        await notifications_hub.publish(s.get("user_id", ""), {
            "type": "session.logoff", "severity": "error",
            "title": "Workspace suspendido", "message": f"Tu sesión en {ws['name']} fue terminada por un administrador.",
            "session_id": s["id"], "action": "logoff",
        })
    await create_audit_log(user["id"], user["email"], "workspace_suspend",
                           f"workspace:{workspace_id}", f"Suspended {ws['name']} · killed {len(sessions)} sessions")
    return {"ok": True, "workspace_id": workspace_id, "killed_sessions": len(sessions)}

@api_router.get("/admin/system-logs")
async def admin_system_logs(user: dict = Depends(get_current_user)):
    require_admin(user)
    tid = await get_current_tenant_id(user)
    raw = await db.audit_logs.find({"tenant_id": tid}, {"_id": 0}).sort("timestamp", -1).to_list(200)

    # Map action keyword → source + level
    def classify(action: str, success: bool):
        a = (action or "").lower()
        if "error" in a or "fail" in a or not success:
            level = "error"
        elif "warn" in a or "timeout" in a or "retry_failed" in a:
            level = "warn"
        else:
            level = "info"
        if "zitadel" in a or "sso" in a or "oidc" in a:
            source = "zitadel"
        elif "netbird" in a or "policy" in a or "peer" in a:
            source = "netbird"
        elif "lxd" in a or "container" in a or "vm" in a:
            source = "lxd"
        elif "guac" in a or "neovdi" in a:
            source = "neovdi"
        elif "tsplus" in a or "session_action" in a:
            source = "tsplus"
        elif "invite" in a or "email" in a or "tenant" in a:
            source = "tenant"
        elif "workspace" in a or "launch" in a:
            source = "workspace"
        elif "login" in a or "logout" in a or "register" in a or "auth" in a:
            source = "auth"
        elif "market" in a or "order" in a or "payment" in a or "stripe" in a:
            source = "payment"
        else:
            source = "orchestrator"
        return level, source

    logs = []
    for r in raw:
        level, source = classify(r.get("action", ""), r.get("success", True))
        msg = r.get("details") or r.get("action") or "-"
        if r.get("user_email"):
            msg = f"[{r['user_email']}] {msg}"
        logs.append({
            "timestamp": r.get("timestamp"),
            "level": level,
            "source": source,
            "message": msg,
            "action": r.get("action"),
            "resource": r.get("resource"),
            "success": r.get("success", True),
        })

    if not logs:
        logs = [
            {"timestamp": "2026-02-07T10:15:00Z", "level": "info", "source": "orchestrator",
             "message": "Provision completed: ORD-7C3D2E (FinTech Alpha)"},
            {"timestamp": "2026-02-07T10:12:00Z", "level": "info", "source": "worker-1",
             "message": "TSplus licenses activated: 10 users"},
            {"timestamp": "2026-02-07T10:08:00Z", "level": "warn", "source": "netbird",
             "message": "Peer timeout on relay-eu-01, retrying..."},
            {"timestamp": "2026-02-07T10:05:00Z", "level": "info", "source": "zitadel",
             "message": "Org created: FinTech Alpha (zitadel_cloud)"},
            {"timestamp": "2026-02-07T09:58:00Z", "level": "info", "source": "lxd",
             "message": "VM win-ft-alpha-01 started (4 vCPU, 8GB RAM)"},
            {"timestamp": "2026-02-07T09:50:00Z", "level": "error", "source": "payment",
             "message": "Stripe webhook retry #2 for ORD-3A1B5C"},
        ]
    return logs


# ============ ZITADEL MANAGEMENT API PROXY ============

ZITADEL_DOMAIN = os.environ.get("ZITADEL_DOMAIN", "")
ZITADEL_PAT = os.environ.get("ZITADEL_SERVICE_USER_TOKEN", "")
ZITADEL_ORG_ID = os.environ.get("ZITADEL_ORG_ID", "360565543960379216")

def zitadel_headers(org_id: str = None):
    h = {
        "Authorization": f"Bearer {ZITADEL_PAT}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if org_id:
        h["x-zitadel-orgid"] = org_id
    return h

@api_router.get("/admin/zitadel/users")
async def zitadel_list_users(user: dict = Depends(get_current_user)):
    require_admin(user)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(f"{ZITADEL_DOMAIN}/v2/users", headers=zitadel_headers(), json={"queries": [], "limit": 100})
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()

@api_router.post("/admin/zitadel/users")
async def zitadel_create_user(body: dict, user: dict = Depends(get_current_user)):
    require_admin(user)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(f"{ZITADEL_DOMAIN}/v2/users/human", headers=zitadel_headers(), json=body)
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()

@api_router.get("/admin/zitadel/users/{zitadel_user_id}")
async def zitadel_get_user(zitadel_user_id: str, user: dict = Depends(get_current_user)):
    require_admin(user)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{ZITADEL_DOMAIN}/v2/users/{zitadel_user_id}", headers=zitadel_headers())
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()

@api_router.delete("/admin/zitadel/users/{zitadel_user_id}")
async def zitadel_delete_user(zitadel_user_id: str, user: dict = Depends(get_current_user)):
    require_admin(user)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.delete(f"{ZITADEL_DOMAIN}/v2/users/{zitadel_user_id}", headers=zitadel_headers())
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()

@api_router.get("/admin/zitadel/orgs")
async def zitadel_list_orgs(user: dict = Depends(get_current_user)):
    require_admin(user)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(f"{ZITADEL_DOMAIN}/v2/organizations/_search", headers=zitadel_headers(), json={"queries": [], "limit": 100})
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()

@api_router.post("/admin/zitadel/orgs")
async def zitadel_create_org(body: dict, user: dict = Depends(get_current_user)):
    require_admin(user)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(f"{ZITADEL_DOMAIN}/management/v1/orgs", headers=zitadel_headers(), json=body)
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()

@api_router.get("/admin/zitadel/roles")
async def zitadel_list_roles(user: dict = Depends(get_current_user)):
    require_admin(user)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(f"{ZITADEL_DOMAIN}/management/v1/projects/_search", headers=zitadel_headers(), json={})
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()

@api_router.get("/admin/zitadel/grants")
async def zitadel_list_grants(user: dict = Depends(get_current_user)):
    require_admin(user)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(f"{ZITADEL_DOMAIN}/management/v1/users/grants/_search", headers=zitadel_headers(), json={"queries": [], "limit": 100})
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()


@api_router.get("/zitadel/my-org")
async def zitadel_my_org(user: dict = Depends(get_current_user)):
    """Returns the current user's Zitadel organization + project + app + roles (from env config)."""
    oidc_app_client_id = os.environ.get("ZITADEL_CLIENT_ID", "")
    oidc_project_id = os.environ.get("ZITADEL_PROJECT_ID", ZITADEL_PROJECT_ID)
    neovdi_client_id = os.environ.get("ZITADEL_NEOVDI_CLIENT_ID", "368658584004778169")

    result = {
        "org_id": ZITADEL_ORG_ID,
        "org_name": None,
        "domain": ZITADEL_DOMAIN,
        "project_id": oidc_project_id,
        "project_name": None,
        "app_client_id": oidc_app_client_id,
        "neovdi_client_id": neovdi_client_id,
        "roles": [],
        "user_count": 0,
        "user_email": user.get("email"),
        "user_role": user.get("role"),
        "status": "unknown",
    }

    if not ZITADEL_DOMAIN or not ZITADEL_PAT:
        result["status"] = "not_configured"
        return result

    async with httpx.AsyncClient(timeout=10) as c:
        # Org metadata
        try:
            r = await c.get(
                f"{ZITADEL_DOMAIN}/management/v1/orgs/me",
                headers=zitadel_headers(org_id=ZITADEL_ORG_ID),
            )
            if r.status_code < 400:
                d = r.json().get("org", {})
                result["org_name"] = d.get("name")
                result["primary_domain"] = d.get("primaryDomain")
                result["status"] = "connected"
        except Exception as e:
            logger.warning(f"zitadel my-org fetch error: {e}")
            result["status"] = "error"
            result["error"] = str(e)[:120]

        # Project roles
        if oidc_project_id:
            try:
                r = await c.post(
                    f"{ZITADEL_DOMAIN}/management/v1/projects/{oidc_project_id}/roles/_search",
                    headers=zitadel_headers(org_id=ZITADEL_ORG_ID),
                    json={"queries": []},
                )
                if r.status_code < 400:
                    roles = r.json().get("result", []) or []
                    result["roles"] = [
                        {"key": x.get("key"), "display_name": x.get("displayName"), "group": x.get("group")}
                        for x in roles
                    ]
            except Exception as e:
                logger.warning(f"zitadel project roles fetch error: {e}")

        # User count
        try:
            r = await c.post(
                f"{ZITADEL_DOMAIN}/v2/users",
                headers=zitadel_headers(org_id=ZITADEL_ORG_ID),
                json={"queries": [{"organizationIdQuery": {"organizationId": ZITADEL_ORG_ID}}], "limit": 1},
            )
            if r.status_code < 400:
                details = r.json().get("details", {}) or {}
                result["user_count"] = int(details.get("totalResult", 0) or 0)
        except Exception:
            pass

    return result


# ============ NETBIRD API PROXY ============

NETBIRD_API_URL = os.environ.get("NETBIRD_API_URL", "")
NETBIRD_TOKEN = os.environ.get("NETBIRD_API_TOKEN", "")

def netbird_headers():
    return {
        "Authorization": f"Token {NETBIRD_TOKEN}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

@api_router.get("/admin/netbird/peers")
async def netbird_list_peers(user: dict = Depends(get_current_user)):
    require_admin(user)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{NETBIRD_API_URL}/api/peers", headers=netbird_headers())
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()

@api_router.get("/admin/netbird/peers/{peer_id}")
async def netbird_get_peer(peer_id: str, user: dict = Depends(get_current_user)):
    require_admin(user)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{NETBIRD_API_URL}/api/peers/{peer_id}", headers=netbird_headers())
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()

@api_router.put("/admin/netbird/peers/{peer_id}")
async def netbird_update_peer(peer_id: str, body: dict, user: dict = Depends(get_current_user)):
    require_admin(user)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.put(f"{NETBIRD_API_URL}/api/peers/{peer_id}", headers=netbird_headers(), json=body)
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()

@api_router.delete("/admin/netbird/peers/{peer_id}")
async def netbird_delete_peer(peer_id: str, user: dict = Depends(get_current_user)):
    require_admin(user)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.delete(f"{NETBIRD_API_URL}/api/peers/{peer_id}", headers=netbird_headers())
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return {"message": "Peer deleted"}

@api_router.get("/admin/netbird/groups")
async def netbird_list_groups(user: dict = Depends(get_current_user)):
    require_admin(user)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{NETBIRD_API_URL}/api/groups", headers=netbird_headers())
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()

@api_router.post("/admin/netbird/groups")
async def netbird_create_group(body: dict, user: dict = Depends(get_current_user)):
    require_admin(user)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(f"{NETBIRD_API_URL}/api/groups", headers=netbird_headers(), json=body)
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()

@api_router.delete("/admin/netbird/groups/{group_id}")
async def netbird_delete_group(group_id: str, user: dict = Depends(get_current_user)):
    require_admin(user)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.delete(f"{NETBIRD_API_URL}/api/groups/{group_id}", headers=netbird_headers())
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return {"message": "Group deleted"}

@api_router.get("/admin/netbird/setup-keys")
async def netbird_list_setup_keys(user: dict = Depends(get_current_user)):
    require_admin(user)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{NETBIRD_API_URL}/api/setup-keys", headers=netbird_headers())
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()

@api_router.post("/admin/netbird/setup-keys")
async def netbird_create_setup_key(body: dict, user: dict = Depends(get_current_user)):
    require_admin(user)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(f"{NETBIRD_API_URL}/api/setup-keys", headers=netbird_headers(), json=body)
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()

@api_router.get("/admin/netbird/routes")
async def netbird_list_routes(user: dict = Depends(get_current_user)):
    require_admin(user)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{NETBIRD_API_URL}/api/routes", headers=netbird_headers())
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()

@api_router.get("/admin/netbird/users")
async def netbird_list_users(user: dict = Depends(get_current_user)):
    require_admin(user)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{NETBIRD_API_URL}/api/users", headers=netbird_headers())
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()


# ============ TENANT ENROLLMENT SERVICE ============

class TenantEnrollment(BaseModel):
    org_name: str
    slug: str = ""
    rfc: str = ""
    razon_social: str = ""
    email_admin: str
    tier: str = "starter"
    tsplus_host: str = ""
    tsplus_port: int = 443
    tsplus_license: str = ""
    has_ldap: bool = False
    max_users: int = 5

@api_router.post("/admin/tenants/enroll")
async def enroll_tenant(data: TenantEnrollment, user: dict = Depends(get_current_user)):
    require_admin(user)
    import re
    slug = data.slug or re.sub(r'[^a-z0-9]+', '-', data.org_name.lower()).strip('-')
    tenant_id = str(uuid.uuid4())[:8]
    tenant_doc = {
        "id": f"tenant-{tenant_id}",
        "name": data.org_name, "slug": slug, "rfc": data.rfc,
        "razon_social": data.razon_social, "email_admin": data.email_admin,
        "tier": data.tier, "status": "provisioning",
        "max_users": data.max_users, "users_current": 0, "vms": 0, "mrr": 0,
        "sso_provider": "zitadel", "zitadel_org_id": None,
        "netbird_group_id": None, "netbird_setup_key": None,
        "domain": slug + ".neosc.cloud", "enrollment_steps": {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if data.tier in ("plus", "enterprise") and data.tsplus_host:
        tenant_doc["client_infrastructure"] = {
            "tsplus_host": data.tsplus_host, "tsplus_port": data.tsplus_port,
            "tsplus_license": data.tsplus_license, "has_ldap": data.has_ldap, "verified": False,
        }
    await db.organizations.insert_one(tenant_doc.copy())
    await create_audit_log(user["id"], user.get("email",""), "tenant_enroll_start", f"tenant:{tenant_doc['id']}", str({"org_name": data.org_name}), True)
    return {k: v for k, v in tenant_doc.items() if k != '_id'}

@api_router.post("/admin/tenants/{tenant_id}/step/zitadel-org")
async def enroll_step_zitadel_org(tenant_id: str, user: dict = Depends(get_current_user)):
    """Step 1: Full automated Zitadel provisioning — Project + Roles + OIDC App + Admin User + Grant"""
    require_admin(user)
    tenant = await db.organizations.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant: raise HTTPException(status_code=404, detail="Tenant not found")
    result = {"step": "zitadel_org", "status": "error", "details": {}}

    zit_h = zitadel_headers(org_id=ZITADEL_ORG_ID)
    slug = tenant.get("slug", tenant_id)
    admin_email = tenant.get("email_admin", "")

    try:
        async with httpx.AsyncClient(timeout=20) as c:
            # 1. Create project
            project_name = f"NeoSC-{slug}"
            r_proj = await c.post(f"{ZITADEL_DOMAIN}/management/v1/projects", headers=zit_h,
                                  json={"name": project_name, "projectRoleAssertion": True, "projectRoleCheck": True})
            if r_proj.status_code >= 400:
                result["details"] = {"error": f"Project: {r_proj.text[:200]}"}
                return result
            project_id = r_proj.json().get("id", "")

            # 2. Create roles: tenant-admin, tenant-user, tenant-viewer
            roles_created = []
            for rk, rn in [("tenant-admin", "Administrador"), ("tenant-user", "Usuario"), ("tenant-viewer", "Solo lectura")]:
                role_key = f"{slug}-{rk}"
                rr = await c.post(f"{ZITADEL_DOMAIN}/management/v1/projects/{project_id}/roles",
                                  headers=zit_h, json={"roleKey": role_key, "displayName": f"{rn} - {tenant['name']}"})
                if rr.status_code < 400:
                    roles_created.append(role_key)

            # 3. Create OIDC Application (SPA with PKCE)
            callback_base = f"https://{slug}.neosc.cloud"
            r_app = await c.post(f"{ZITADEL_DOMAIN}/management/v1/projects/{project_id}/apps/oidc", headers=zit_h, json={
                "name": f"NeoSC-{slug}-SPA",
                "redirectUris": [f"{callback_base}/auth/callback", "http://localhost:3000/auth/callback"],
                "postLogoutRedirectUris": [callback_base, "http://localhost:3000"],
                "responseTypes": ["OIDC_RESPONSE_TYPE_CODE"],
                "grantTypes": ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE"],
                "appType": "OIDC_APP_TYPE_USER_AGENT",
                "authMethodType": "OIDC_AUTH_METHOD_TYPE_NONE",
                "accessTokenType": "OIDC_TOKEN_TYPE_JWT",
                "devMode": True,
            })
            app_id = ""
            client_id = ""
            if r_app.status_code < 400:
                app_data = r_app.json()
                app_id = app_data.get("appId", "")
                client_id = app_data.get("clientId", "")

            # 4. Create admin user
            zitadel_user_id = ""
            r_user = await c.post(f"{ZITADEL_DOMAIN}/v2/users/human", headers=zit_h, json={
                "username": admin_email,
                "profile": {"givenName": "Admin", "familyName": tenant["name"][:50]},
                "email": {"email": admin_email, "isVerified": True},
                "password": {"password": f"NeoSC-{slug}-2026!", "changeRequired": True},
            })
            if r_user.status_code < 400:
                zitadel_user_id = r_user.json().get("userId", "")
            else:
                # User may already exist - search
                r_search = await c.post(f"{ZITADEL_DOMAIN}/v2/users", headers=zit_h,
                                        json={"queries": [{"emailQuery": {"emailAddress": admin_email, "method": "TEXT_QUERY_METHOD_EQUALS"}}]})
                if r_search.status_code < 400:
                    users = r_search.json().get("result", [])
                    if users:
                        zitadel_user_id = users[0].get("userId", "")

            # 5. Grant admin role to user
            grant_id = ""
            if zitadel_user_id and project_id:
                admin_role_key = f"{slug}-tenant-admin"
                rg = await c.post(f"{ZITADEL_DOMAIN}/management/v1/users/{zitadel_user_id}/grants",
                                  headers=zit_h, json={"projectId": project_id, "roleKeys": [admin_role_key]})
                if rg.status_code < 400:
                    grant_id = rg.json().get("userGrantId", "")

            # Save everything to DB
            zitadel_data = {
                "zitadel_org_id": ZITADEL_ORG_ID,
                "zitadel_project_id": project_id,
                "zitadel_project_name": project_name,
                "zitadel_app_id": app_id,
                "zitadel_client_id": client_id,
                "zitadel_user_id": zitadel_user_id,
                "zitadel_grant_id": grant_id,
                "zitadel_roles": roles_created,
                "enrollment_steps.zitadel_org": "completed",
            }
            await db.organizations.update_one({"id": tenant_id}, {"$set": zitadel_data})
            result = {"step": "zitadel_org", "status": "completed", "details": {
                "project_id": project_id, "project_name": project_name,
                "app_id": app_id, "client_id": client_id,
                "roles": roles_created, "admin_user_id": zitadel_user_id,
                "admin_email": admin_email, "grant_id": grant_id,
            }}
    except Exception as e:
        result["details"] = {"error": str(e)}

    await create_audit_log(user["id"], user.get("email",""), "enroll_zitadel_org", f"tenant:{tenant_id}", str(result["details"]), result["status"] == "completed")
    return result

@api_router.post("/admin/tenants/{tenant_id}/step/netbird-group")
async def enroll_step_netbird_group(tenant_id: str, user: dict = Depends(get_current_user)):
    require_admin(user)
    tenant = await db.organizations.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant: raise HTTPException(status_code=404, detail="Tenant not found")
    result = {"step": "netbird_group", "status": "error", "details": {}}
    try:
        group_name = f"neosc-{tenant.get('slug', tenant_id)}"
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(f"{NETBIRD_API_URL}/api/groups", headers=netbird_headers(), json={"name": group_name})
            if r.status_code < 400:
                data = r.json()
                group_id = data.get("id", "")
                await db.organizations.update_one({"id": tenant_id}, {"$set": {"netbird_group_id": group_id, "enrollment_steps.netbird_group": "completed"}})
                result = {"step": "netbird_group", "status": "completed", "details": {"group_id": group_id, "group_name": group_name}}
            else:
                result["details"] = {"error": r.text[:200]}
    except Exception as e:
        result["details"] = {"error": str(e)}
    await create_audit_log(user["id"], user.get("email",""), "enroll_netbird_group", f"tenant:{tenant_id}", str(result["details"]), result["status"] == "completed")
    return result

@api_router.post("/admin/tenants/{tenant_id}/step/netbird-setup-key")
async def enroll_step_netbird_setup_key(tenant_id: str, user: dict = Depends(get_current_user)):
    require_admin(user)
    tenant = await db.organizations.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant: raise HTTPException(status_code=404, detail="Tenant not found")
    result = {"step": "netbird_setup_key", "status": "error", "details": {}}
    try:
        group_id = tenant.get("netbird_group_id")
        auto_groups = [group_id] if group_id else []
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(f"{NETBIRD_API_URL}/api/setup-keys", headers=netbird_headers(), json={
                "name": f"neosc-enroll-{tenant.get('slug', tenant_id)}",
                "type": "reusable", "expires_in": 86400 * 7, "auto_groups": auto_groups, "usage_limit": 5,
            })
            if r.status_code < 400:
                data = r.json()
                await db.organizations.update_one({"id": tenant_id}, {"$set": {
                    "netbird_setup_key": data.get("key", ""), "netbird_setup_key_id": data.get("id", ""),
                    "enrollment_steps.netbird_setup_key": "completed"
                }})
                result = {"step": "netbird_setup_key", "status": "completed", "details": {"key_id": data.get("id"), "setup_key": data.get("key")}}
            else:
                result["details"] = {"error": r.text[:200]}
    except Exception as e:
        result["details"] = {"error": str(e)}
    await create_audit_log(user["id"], user.get("email",""), "enroll_netbird_setup_key", f"tenant:{tenant_id}", str(result["details"]), result["status"] == "completed")
    return result

@api_router.post("/admin/tenants/{tenant_id}/step/netbird-policy")
async def enroll_step_netbird_policy(tenant_id: str, user: dict = Depends(get_current_user)):
    require_admin(user)
    tenant = await db.organizations.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant: raise HTTPException(status_code=404, detail="Tenant not found")
    group_id = tenant.get("netbird_group_id")
    if not group_id:
        return {"step": "netbird_policy", "status": "error", "details": {"error": "Run step 2 first"}}
    result = {"step": "netbird_policy", "status": "error", "details": {}}
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(f"{NETBIRD_API_URL}/api/policies", headers=netbird_headers(), json={
                "name": f"neosc-allow-{tenant.get('slug', '')}", "enabled": True,
                "rules": [{"name": f"intra-{tenant.get('slug','')}", "enabled": True, "action": "accept",
                           "bidirectional": True, "protocol": "all", "sources": [group_id], "destinations": [group_id]}]
            })
            if r.status_code < 400:
                data = r.json()
                await db.organizations.update_one({"id": tenant_id}, {"$set": {"netbird_policy_id": data.get("id",""), "enrollment_steps.netbird_policy": "completed"}})
                result = {"step": "netbird_policy", "status": "completed", "details": {"policy_id": data.get("id")}}
            else:
                result["details"] = {"error": r.text[:200]}
    except Exception as e:
        result["details"] = {"error": str(e)}
    await create_audit_log(user["id"], user.get("email",""), "enroll_netbird_policy", f"tenant:{tenant_id}", str(result["details"]), result["status"] == "completed")
    return result

@api_router.post("/admin/tenants/{tenant_id}/step/register-infra")
async def enroll_step_register_infra(tenant_id: str, body: dict, user: dict = Depends(get_current_user)):
    require_admin(user)
    tenant = await db.organizations.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant: raise HTTPException(status_code=404, detail="Tenant not found")
    infra = {"tsplus_host": body.get("tsplus_host",""), "tsplus_port": body.get("tsplus_port",443),
             "tsplus_license": body.get("tsplus_license",""), "connection_type": body.get("connection_type","web"),
             "has_ldap": body.get("has_ldap",False), "verified": False}
    await db.organizations.update_one({"id": tenant_id}, {"$set": {"client_infrastructure": infra, "enrollment_steps.register_infra": "completed"}})
    await create_audit_log(user["id"], user.get("email",""), "enroll_register_infra", f"tenant:{tenant_id}", str({"tsplus_host": infra["tsplus_host"]}), True)
    return {"step": "register_infra", "status": "completed", "details": infra}

@api_router.post("/admin/tenants/{tenant_id}/step/finalize")
async def enroll_step_finalize(tenant_id: str, user: dict = Depends(get_current_user)):
    require_admin(user)
    tenant = await db.organizations.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant: raise HTTPException(status_code=404, detail="Tenant not found")
    plan = PLAN_PRICES.get(tenant.get("tier","starter"), PLAN_PRICES["starter"])
    mrr = plan["mo"] / 100.0
    await db.organizations.update_one({"id": tenant_id}, {"$set": {
        "status": "activo", "mrr": mrr, "vms": 1 if tenant.get("tier") == "starter" else 0,
        "users_current": 1, "enrollment_steps.finalize": "completed",
    }})

    # Create a workspace (market_vm) for this tenant so it appears in Workspaces list
    infra = tenant.get("client_infrastructure", {})
    tsplus_host = infra.get("tsplus_host", "")
    tsplus_port = infra.get("tsplus_port", 443)
    protocol = "https" if tsplus_port == 443 else "http"
    connection_url = f"{protocol}://{tsplus_host}:{tsplus_port}" if tsplus_host else "https://web.proxy.kappa4.com/"

    vm_id = f"vm-{tenant_id}"
    existing_vm = await db.market_vms.find_one({"id": vm_id})
    if not existing_vm:
        vm_doc = {
            "id": vm_id,
            "user_id": user["id"],
            "tenant_id": tenant_id,
            "lxd_instance_name": tenant.get("name", "Workspace"),
            "tunnel_hostname": f"{tenant.get('slug', tenant_id)}.neosc.cloud",
            "status": "running",
            "vcpu": 4,
            "ram_gb": 8,
            "disk_gb": 120,
            "tsplus_licenses": tenant.get("max_users", 5),
            "connection_url": connection_url,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.market_vms.insert_one(vm_doc)

        # Create a matching order so it shows up in /market/my-vms
        order_doc = {
            "id": f"order-{tenant_id}",
            "user_id": user["id"],
            "tenant_id": tenant_id,
            "vm_id": vm_id,
            "neosc_plan": tenant.get("tier", "plus"),
            "tsplus_licenses": tenant.get("max_users", 5),
            "billing_period": "monthly",
            "total_cents": plan["mo"],
            "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.market_orders.insert_one(order_doc)

    await create_audit_log(user["id"], user.get("email",""), "tenant_enrollment_complete", f"tenant:{tenant_id}", str({"tier": tenant.get("tier"), "mrr": mrr}), True)
    return {"step": "finalize", "status": "completed", "details": {"tenant_status": "activo", "mrr": mrr}}

@api_router.get("/admin/tenants/{tenant_id}/enrollment-status")
async def get_enrollment_status(tenant_id: str, user: dict = Depends(get_current_user)):
    require_admin(user)
    tenant = await db.organizations.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant: raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


# ============ NEOCONNECT: RELAY CONTAINER DEPLOYMENT ============

@api_router.post("/admin/tenants/{tenant_id}/step/deploy-relay")
async def enroll_step_deploy_relay(tenant_id: str, user: dict = Depends(get_current_user)):
    """Step: Deploy a Linux relay container via LXD with NetBird pre-installed.
    This container acts as a bridge between NeoSC cloud and the client's TSplus infrastructure."""
    require_admin(user)
    tenant = await db.organizations.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant: raise HTTPException(status_code=404, detail="Tenant not found")

    setup_key = tenant.get("netbird_setup_key", "")
    slug = tenant.get("slug", tenant_id)
    container_name = f"neosc-relay-{slug}"

    result = await lxd_client.create_instance(
        name=container_name,
        instance_type="container",
        image_alias="images:almalinux/9",
        cpu="2",
        memory="2GiB",
        disk_size="20GiB",
        description=f"NeoConnect relay for {tenant.get('name', slug)}",
        profiles=["default"],
        storage_pool="dir",
        project=lxd_client.LXD_PROJECT,
        username="neosc",
        password=f"relay-{slug}-2026",
        netbird_setup_key=setup_key,
        addons=["netbird"],
    )

    if result.get("ok"):
        # Start the container
        await lxd_client.change_instance_state(container_name, "start", project=lxd_client.LXD_PROJECT)

        # Save relay info
        await db.organizations.update_one({"id": tenant_id}, {"$set": {
            "relay_container": container_name,
            "relay_project": lxd_client.LXD_PROJECT,
            "enrollment_steps.deploy_relay": "completed",
        }})

        # Also register in market_vms
        vm_doc = {
            "id": f"lxd-{container_name}",
            "user_id": user["id"],
            "tenant_id": tenant_id,
            "lxd_instance_name": container_name,
            "lxd_project": lxd_client.LXD_PROJECT,
            "tunnel_hostname": f"{container_name}.neosc.cloud",
            "status": "running",
            "vcpu": 2, "ram_gb": 2, "disk_gb": 20,
            "tsplus_licenses": 0,
            "instance_type": "container",
            "connection_url": "",
            "ssh_user": "neosc",
            "addons": ["netbird"],
            "netbird_setup_key": setup_key,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "source": "lxd",
            "role": "relay",
        }
        await db.market_vms.update_one({"id": vm_doc["id"]}, {"$set": vm_doc}, upsert=True)

        await create_audit_log(user["id"], user.get("email",""), "deploy_relay", f"tenant:{tenant_id}", f"container:{container_name}", True)
        return {"step": "deploy_relay", "status": "completed", "details": {"container": container_name, "setup_key": setup_key}}

    await create_audit_log(user["id"], user.get("email",""), "deploy_relay", f"tenant:{tenant_id}", str(result.get("error","")), False)
    return {"step": "deploy_relay", "status": "error", "details": {"error": result.get("error", "LXD creation failed")}}


@api_router.post("/admin/tenants/{tenant_id}/auto-provision")
async def auto_provision_tenant(tenant_id: str, user: dict = Depends(get_current_user)):
    """Run all enrollment steps automatically in sequence."""
    require_admin(user)
    tenant = await db.organizations.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant: raise HTTPException(status_code=404, detail="Tenant not found")

    steps_order = ["zitadel-org", "netbird-group", "netbird-setup-key", "netbird-policy", "deploy-relay"]
    results = {}
    failed = False

    for step_key in steps_order:
        step_db_key = step_key.replace("-", "_")
        if tenant.get("enrollment_steps", {}).get(step_db_key) == "completed":
            results[step_key] = {"status": "skipped", "reason": "already completed"}
            continue
        try:
            if step_key == "zitadel-org":
                r = await enroll_step_zitadel_org(tenant_id, user)
            elif step_key == "netbird-group":
                r = await enroll_step_netbird_group(tenant_id, user)
            elif step_key == "netbird-setup-key":
                r = await enroll_step_netbird_setup_key(tenant_id, user)
            elif step_key == "netbird-policy":
                r = await enroll_step_netbird_policy(tenant_id, user)
            elif step_key == "deploy-relay":
                # Refresh tenant to get setup key
                tenant = await db.organizations.find_one({"id": tenant_id}, {"_id": 0})
                r = await enroll_step_deploy_relay(tenant_id, user)
            else:
                continue
            results[step_key] = r
            if r.get("status") != "completed":
                failed = True
                break
        except Exception as e:
            results[step_key] = {"status": "error", "details": {"error": str(e)}}
            failed = True
            break

    return {"auto_provision": "partial" if failed else "completed", "steps": results}


# ============ NEOCONNECT DOWNLOAD LINKS ============

@api_router.get("/admin/tenants/{tenant_id}/neoconnect-info")
async def get_neoconnect_info(tenant_id: str, user: dict = Depends(get_current_user)):
    """Get NeoConnect (NetBird) download links and setup info for a tenant."""
    require_admin(user)
    tenant = await db.organizations.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant: raise HTTPException(status_code=404, detail="Tenant not found")

    setup_key = tenant.get("netbird_setup_key", "")
    mgmt_url = NETBIRD_API_URL or "https://manager.kappa4.com"

    return {
        "setup_key": setup_key,
        "management_url": mgmt_url,
        "downloads": {
            "windows": {
                "url": "https://pkgs.netbird.io/windows/x64",
                "instructions": f'netbird up --setup-key {setup_key} --management-url {mgmt_url}',
                "exe_url": "https://github.com/netbirdio/netbird/releases/latest/download/netbird_installer_0.31.0_windows_amd64.exe",
            },
            "linux": {
                "script": f'curl -fsSL https://pkgs.netbird.io/install.sh | sh && netbird up --setup-key {setup_key} --management-url {mgmt_url}',
            },
            "macos": {
                "url": "https://pkgs.netbird.io/macos/amd64",
                "instructions": f'netbird up --setup-key {setup_key} --management-url {mgmt_url}',
            },
            "docker": {
                "run": f'docker run -d --name netbird --cap-add NET_ADMIN --cap-add SYS_ADMIN -e NB_SETUP_KEY={setup_key} -e NB_MANAGEMENT_URL={mgmt_url} netbirdio/netbird:latest',
            },
        },
        "relay_container": tenant.get("relay_container", ""),
        "relay_status": "deployed" if tenant.get("relay_container") else "not_deployed",
    }


# ============ GUACAMOLE API INTEGRATION ============

@api_router.get("/guacamole/status")
async def guacamole_status(user: dict = Depends(get_current_user)):
    require_admin(user)
    return await guacamole_client.check_status()

@api_router.get("/guacamole/connections")
async def guacamole_list_connections(user: dict = Depends(get_current_user)):
    require_admin(user)
    connections = await guacamole_client.list_connections()
    return {"connections": connections, "count": len(connections)}

@api_router.get("/guacamole/connections/{connection_id}/detail")
async def guacamole_connection_detail(connection_id: str, user: dict = Depends(get_current_user)):
    require_admin(user)
    return await guacamole_client.get_connection_detail(connection_id)

class GuacConnectionCreate(BaseModel):
    name: str
    protocol: str = "rdp"
    hostname: str
    port: int = 3389
    username: str = ""
    password: str = ""
    tenant_id: str = ""

@api_router.post("/guacamole/connections")
async def guacamole_create_connection(payload: GuacConnectionCreate, user: dict = Depends(get_current_user)):
    require_admin(user)
    result = await guacamole_client.create_connection(
        name=payload.name, protocol=payload.protocol,
        hostname=payload.hostname, port=payload.port,
        username=payload.username, password=payload.password,
    )
    if result.get("ok") and payload.tenant_id:
        await db.organizations.update_one(
            {"id": payload.tenant_id},
            {"$push": {"guacamole_connections": {"id": result["id"], "name": payload.name, "protocol": payload.protocol}}}
        )
    await create_audit_log(user["id"], user.get("email",""), "guacamole_create_conn", f"conn:{payload.name}", f"{payload.protocol}://{payload.hostname}:{payload.port}", result.get("ok", False))
    return result

@api_router.delete("/guacamole/connections/{connection_id}")
async def guacamole_delete_connection(connection_id: str, user: dict = Depends(get_current_user)):
    require_admin(user)
    return await guacamole_client.delete_connection(connection_id)

@api_router.get("/guacamole/connections/{connection_id}/link")
async def guacamole_get_link(connection_id: str, user: dict = Depends(get_current_user)):
    return await guacamole_client.get_connection_link(connection_id)

# ─── Guacamole Users ─────────────────────────────────────────────────────────

@api_router.get("/guacamole/users")
async def guacamole_list_users(user: dict = Depends(get_current_user)):
    require_admin(user)
    return await guacamole_client.list_users()

class GuacUserCreate(BaseModel):
    username: str
    password: str = ""

@api_router.post("/guacamole/users")
async def guacamole_create_user(payload: GuacUserCreate, user: dict = Depends(get_current_user)):
    require_admin(user)
    result = await guacamole_client.create_user(payload.username, payload.password)
    await create_audit_log(user["id"], user.get("email",""), "guacamole_create_user", f"guac_user:{payload.username}", "", result.get("ok", False))
    return result

@api_router.post("/guacamole/users/{username}/grant/{connection_id}")
async def guacamole_grant_connection(username: str, connection_id: str, user: dict = Depends(get_current_user)):
    require_admin(user)
    return await guacamole_client.grant_connection_to_user(username, connection_id)

# ─── Guacamole User Groups ───────────────────────────────────────────────────

@api_router.get("/guacamole/groups")
async def guacamole_list_groups(user: dict = Depends(get_current_user)):
    require_admin(user)
    return await guacamole_client.list_user_groups()

class GuacGroupCreate(BaseModel):
    identifier: str

@api_router.post("/guacamole/groups")
async def guacamole_create_group(payload: GuacGroupCreate, user: dict = Depends(get_current_user)):
    require_admin(user)
    return await guacamole_client.create_user_group(payload.identifier)

@api_router.post("/guacamole/groups/{group_id}/add-user/{username}")
async def guacamole_add_user_to_group(group_id: str, username: str, user: dict = Depends(get_current_user)):
    require_admin(user)
    return await guacamole_client.add_user_to_group(group_id, username)

@api_router.post("/guacamole/groups/{group_id}/grant/{connection_id}")
async def guacamole_grant_conn_to_group(group_id: str, connection_id: str, user: dict = Depends(get_current_user)):
    require_admin(user)
    return await guacamole_client.grant_connection_to_group(group_id, connection_id)

# ─── Zitadel → Guacamole OIDC Sync ──────────────────────────────────────────

@api_router.post("/guacamole/sync-zitadel-groups")
async def guacamole_sync_zitadel_groups(user: dict = Depends(get_current_user)):
    """Sync Zitadel organization roles to Guacamole user groups.
    Creates matching groups in Guacamole for each Zitadel role found."""
    require_admin(user)
    results = {"groups_created": [], "users_synced": [], "errors": []}

    # Get Zitadel roles from projects
    zit_h = zitadel_headers(org_id=ZITADEL_ORG_ID)
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            # List projects
            r_proj = await c.post(f"{ZITADEL_DOMAIN}/management/v1/projects/_search", headers=zit_h, json={})
            projects = r_proj.json().get("result", []) if r_proj.status_code < 400 else []

            for proj in projects:
                pid = proj.get("id", "")
                pname = proj.get("name", "")
                # Get roles for this project
                r_roles = await c.post(f"{ZITADEL_DOMAIN}/management/v1/projects/{pid}/roles/_search",
                                       headers=zit_h, json={})
                roles = r_roles.json().get("result", []) if r_roles.status_code < 400 else []

                for role in roles:
                    role_key = role.get("key", "")
                    display = role.get("displayName", role_key)
                    # Create Guacamole group matching the role key directly
                    # (must match what the Zitadel Action injects in "groups" claim)
                    gr = await guacamole_client.create_user_group(role_key)
                    if gr.get("ok"):
                        results["groups_created"].append(role_key)

                    # Get users with this role (grants)
                    r_grants = await c.post(f"{ZITADEL_DOMAIN}/management/v1/users/grants/_search",
                                            headers=zit_h, json={
                                                "queries": [{"projectIdQuery": {"projectId": pid}},
                                                            {"roleKeyQuery": {"roleKey": role_key}}]
                                            })
                    grants = r_grants.json().get("result", []) if r_grants.status_code < 400 else []

                    for grant in grants:
                        email = grant.get("email", "") or grant.get("userName", "")
                        if email:
                            # Create Guacamole user if not exists
                            await guacamole_client.create_user(email)
                            # Add to group (role_key directly, matches Zitadel Action output)
                            await guacamole_client.add_user_to_group(role_key, email)
                            results["users_synced"].append({"user": email, "group": role_key})

    except Exception as e:
        results["errors"].append(str(e))

    await create_audit_log(user["id"], user.get("email",""), "guacamole_sync_zitadel",
                           f"groups:{len(results['groups_created'])}", str(results)[:200])
    return results


# ─── OIDC Script Download ────────────────────────────────────────────────────

@api_router.get("/guacamole/oidc-script")
async def get_oidc_setup_script(user: dict = Depends(get_current_user)):
    """Return the OIDC configuration script for Guacamole."""
    require_admin(user)
    import pathlib
    script_path = pathlib.Path(__file__).parent / "scripts" / "setup-guacamole-oidc.sh"
    if script_path.exists():
        return {"ok": True, "script": script_path.read_text(), "filename": "setup-guacamole-oidc.sh"}
    return {"ok": False, "error": "Script not found"}


@api_router.get("/guacamole/oidc-config")
async def get_oidc_config(user: dict = Depends(get_current_user)):
    """Return the OIDC config values for display in UI."""
    require_admin(user)
    return {
        "zitadel_domain": ZITADEL_DOMAIN,
        "client_id": "368660070466141146",
        "redirect_uri": f"{guacamole_client.GUACAMOLE_URL}/",
        "post_logout_redirect": os.environ.get("ZITADEL_POST_LOGOUT_URL", "") + "/workspaces",
        "authorization_endpoint": f"{ZITADEL_DOMAIN}/oauth/v2/authorize",
        "token_endpoint": f"{ZITADEL_DOMAIN}/oauth/v2/token",
        "jwks_endpoint": f"{ZITADEL_DOMAIN}/oauth/v2/keys",
        "issuer": ZITADEL_DOMAIN,
        "scopes": "openid profile email groups",
        "groups_claim": "groups",
        "username_claim": "preferred_username",
        "guacamole_url": guacamole_client.GUACAMOLE_URL,
        "guacamole_version": "1.6.0",
        "extensions": ["auth-sso-openid", "auth-ldap", "auth-duo", "auth-totp", "auth-sso-saml", "display-statistics", "recording-filename-suffix", "recording-rename-on-connect", "recording-rename-on-disconnect"],
        "note": "Groups claim uses Zitadel Action to inject 'groups' array into the ID token. Configure the Action in Zitadel console under Actions > Flows > Complement Token.",
    }


# ─── NeoVault (JumpServer) Status ────────────────────────────────────────────

JUMPSERVER_URL = os.environ.get("JUMPSERVER_URL", "https://conecta.kappa4.com")

@api_router.get("/neovault/status")
async def neovault_status(user: dict = Depends(get_current_user)):
    require_admin(user)
    try:
        async with httpx.AsyncClient(timeout=10, verify=False) as c:
            r = await c.get(f"{JUMPSERVER_URL}/api/health/", headers={"Accept": "application/json"})
            return {"connected": r.status_code < 500, "url": JUMPSERVER_URL, "status_code": r.status_code}
    except Exception as e:
        return {"connected": False, "url": JUMPSERVER_URL, "error": str(e)}


# ─── App Catalog ─────────────────────────────────────────────────────────────

APP_CATALOG = [
    {"id": "ubuntu-desktop", "name": "Ubuntu Desktop", "desc": "Full Linux desktop environment via noVNC", "icon": "layout",
     "protocol": "vnc", "port": 5901, "image": "images:ubuntu/24.04", "type": "container",
     "category": "desktop", "status": "available", "url": ""},
    {"id": "ubuntu-novnc", "name": "Ubuntu noVNC", "desc": "Ubuntu Desktop via noVNC HTML5", "icon": "monitor",
     "protocol": "web", "port": 6080, "image": "", "type": "external",
     "category": "desktop", "status": "installed", "url": "http://10.46.100.165:6080/vnc.html"},
    {"id": "vscode-server", "name": "VS Code Server", "desc": "Browser-based IDE with extensions", "icon": "code",
     "protocol": "vnc", "port": 5901, "image": "images:ubuntu/24.04", "type": "container",
     "category": "dev", "status": "available", "url": ""},
    {"id": "p4admin", "name": "P4Admin", "desc": "Perforce Administration Tool", "icon": "database",
     "protocol": "vnc", "port": 5901, "image": "images:ubuntu/24.04", "type": "container",
     "category": "dev", "status": "installed", "url": ""},
    {"id": "1panel-daemons", "name": "1Panel Daemons", "desc": "Container management and daemons", "icon": "terminal",
     "protocol": "web", "port": 60072, "image": "", "type": "external",
     "category": "admin", "status": "installed", "url": "http://100.121.80.181:60072/#daemons"},
    {"id": "1panel-login", "name": "1Panel Admin", "desc": "Server admin panel", "icon": "layout",
     "protocol": "web", "port": 40031, "image": "", "type": "external",
     "category": "admin", "status": "installed", "url": "http://100.121.80.181:40031/login"},
    {"id": "docker-app-1", "name": "Docker App", "desc": "Containerized application", "icon": "globe",
     "protocol": "web", "port": 33491, "image": "", "type": "external",
     "category": "apps", "status": "installed", "url": "http://100.121.80.181:33491/"},
    {"id": "storage-panel", "name": "Storage Manager", "desc": "File storage and management panel", "icon": "database",
     "protocol": "web", "port": 443, "image": "", "type": "external",
     "category": "admin", "status": "installed", "url": "https://149.56.241.64/storage"},
    {"id": "browser-kiosk", "name": "Browser Kiosk", "desc": "Isolated Chrome/Firefox browser", "icon": "globe",
     "protocol": "vnc", "port": 5901, "image": "images:ubuntu/24.04", "type": "container",
     "category": "productivity", "status": "available", "url": ""},
    {"id": "libreoffice", "name": "LibreOffice", "desc": "Full office suite", "icon": "file-text",
     "protocol": "vnc", "port": 5901, "image": "images:ubuntu/24.04", "type": "container",
     "category": "productivity", "status": "available", "url": ""},
    {"id": "ssh-terminal", "name": "SSH Terminal", "desc": "Web terminal for SSH access", "icon": "terminal",
     "protocol": "ssh", "port": 22, "image": "images:ubuntu/24.04", "type": "container",
     "category": "admin", "status": "installed", "url": ""},
    {"id": "windows-rdp", "name": "Windows Desktop", "desc": "Full Windows VM via RDP", "icon": "monitor",
     "protocol": "rdp", "port": 3389, "image": "from-instance-win11-vdi", "type": "virtual-machine",
     "category": "desktop", "status": "available", "url": ""},
    {"id": "jumpserver", "name": "NeoVault PAM", "desc": "JumpServer session recording", "icon": "lock",
     "protocol": "web", "port": 443, "image": "", "type": "external",
     "category": "security", "status": "installed", "url": JUMPSERVER_URL},
    {"id": "tsplus-html5", "name": "TSplus HTML5", "desc": "TSplus Remote Desktop via browser", "icon": "monitor",
     "protocol": "web", "port": 443, "image": "", "type": "external",
     "category": "desktop", "status": "available", "url": ""},
]

@api_router.get("/apps/catalog")
async def list_app_catalog(user: dict = Depends(get_current_user)):
    return {"apps": APP_CATALOG, "count": len(APP_CATALOG)}

@api_router.post("/apps/install/{app_id}")
async def install_app(app_id: str, user: dict = Depends(get_current_user)):
    """Install a catalog app by creating an LXD container + Guacamole connection."""
    require_admin(user)
    app = next((a for a in APP_CATALOG if a["id"] == app_id), None)
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    if app["type"] == "external":
        return {"ok": True, "type": "external", "url": app.get("url", ""), "message": "External app — open directly"}

    container_name = f"neosc-app-{app_id}"
    result = await lxd_client.create_instance(
        name=container_name, instance_type=app["type"],
        image_alias=app["image"], cpu="2", memory="4GiB", disk_size="30GiB",
        description=f"NeoSC App: {app['name']}",
        profiles=["default"], storage_pool="dir",
        project=lxd_client.LXD_PROJECT,
        username="neosc", password="neosc-app-2026",
    )
    if result.get("ok"):
        await lxd_client.change_instance_state(container_name, "start", project=lxd_client.LXD_PROJECT)
        # Register in Guacamole
        guac_r = await guacamole_client.create_connection(
            name=f"NeoApp-{app['name']}", protocol=app["protocol"],
            hostname=container_name, port=app["port"],
            username="neosc", password="neosc-app-2026",
        )
        await create_audit_log(user["id"], user.get("email",""), "app_install", f"app:{app_id}", f"container:{container_name}")
        return {"ok": True, "container": container_name, "guacamole": guac_r}

    return {"ok": False, "error": result.get("error", "LXD creation failed")}


# ============ WORKSPACE ASSIGNMENTS — Access Control ============

@api_router.get("/workspace-assignments")
async def list_workspace_assignments(group_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    require_admin(user)
    query = {}
    if group_id:
        query["group_id"] = group_id
    assignments = await db.workspace_assignments.find(query, {"_id": 0}).to_list(200)
    return {"assignments": assignments, "count": len(assignments)}


class AssignResourceBody(BaseModel):
    resource_id: str
    resource_name: str
    resource_type: str  # app, lxd-vm, lxd-container, guacamole, external
    group_id: str
    group_name: str = ""
    protocols_available: List[str] = []  # rdp, vnc, ssh, html5, web
    hostname: str = ""
    port: int = 0

@api_router.post("/workspace-assignments")
async def assign_resource_to_workspace(body: AssignResourceBody, user: dict = Depends(get_current_user)):
    """Assign a resource (app/VM/connection) to a group workspace with protocol controls."""
    require_admin(user)

    # Check if already assigned
    existing = await db.workspace_assignments.find_one(
        {"resource_id": body.resource_id, "group_id": body.group_id}, {"_id": 0})
    if existing:
        return {"ok": False, "error": "Resource already assigned to this group", "assignment_id": existing["id"]}

    # Auto-create Guacamole connection if hostname provided
    guac_conn_id = ""
    if body.hostname and any(p in body.protocols_available for p in ["rdp", "vnc", "ssh"]):
        proto = "rdp" if "rdp" in body.protocols_available else "vnc" if "vnc" in body.protocols_available else "ssh"
        port = body.port or (3389 if proto == "rdp" else 5901 if proto == "vnc" else 22)
        guac_r = await guacamole_client.create_connection(
            name=f"WS-{body.group_id}-{body.resource_name}",
            protocol=proto, hostname=body.hostname, port=port,
        )
        if guac_r.get("ok"):
            guac_conn_id = guac_r.get("id", "")
            # Grant connection to group in Guacamole
            await guacamole_client.grant_connection_to_group(body.group_id, guac_conn_id)

    # Get group members for initial user_access list
    user_access = []
    guac_groups = await guacamole_client.list_user_groups()
    group_data = next((g for g in guac_groups if g["identifier"] == body.group_id), None)
    if group_data and group_data.get("members"):
        for member in group_data["members"]:
            user_access.append({
                "user_email": member,
                "allowed": True,
                "protocols": body.protocols_available[:],
            })

    doc = {
        "id": f"wa-{uuid.uuid4().hex[:8]}",
        "resource_id": body.resource_id,
        "resource_name": body.resource_name,
        "resource_type": body.resource_type,
        "group_id": body.group_id,
        "group_name": body.group_name,
        "protocols_available": body.protocols_available,
        "user_access": user_access,
        "guacamole_connection_id": guac_conn_id,
        "netbird_policy_id": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["id"],
    }
    await db.workspace_assignments.insert_one(doc)

    await create_audit_log(user["id"], user.get("email", ""), "workspace_assign",
                           f"resource:{body.resource_id}", f"group:{body.group_id} protocols:{body.protocols_available}")
    doc.pop("_id", None)
    return {"ok": True, "assignment": doc}


class UpdateUserAccessBody(BaseModel):
    user_access: List[dict]  # [{user_email, allowed, protocols}]

@api_router.put("/workspace-assignments/{assignment_id}/access")
async def update_assignment_access(assignment_id: str, body: UpdateUserAccessBody, user: dict = Depends(get_current_user)):
    """Update per-user access controls for an assignment."""
    require_admin(user)
    result = await db.workspace_assignments.update_one(
        {"id": assignment_id},
        {"$set": {"user_access": [ua for ua in body.user_access]}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await create_audit_log(user["id"], user.get("email", ""), "workspace_access_update",
                           f"assignment:{assignment_id}", f"users:{len(body.user_access)}")
    return {"ok": True, "updated": assignment_id}


@api_router.delete("/workspace-assignments/{assignment_id}")
async def delete_workspace_assignment(assignment_id: str, user: dict = Depends(get_current_user)):
    require_admin(user)
    assignment = await db.workspace_assignments.find_one({"id": assignment_id}, {"_id": 0})
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    # Cleanup Guacamole connection if we created it
    if assignment.get("guacamole_connection_id"):
        await guacamole_client.delete_connection(assignment["guacamole_connection_id"])
    await db.workspace_assignments.delete_one({"id": assignment_id})
    return {"ok": True, "deleted": assignment_id}


@api_router.post("/workspace-assignments/{assignment_id}/sync-netbird")
async def sync_assignment_netbird(assignment_id: str, user: dict = Depends(get_current_user)):
    """Create/update a NetBird policy matching this assignment's group and allowed protocols."""
    require_admin(user)
    assignment = await db.workspace_assignments.find_one({"id": assignment_id}, {"_id": 0})
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Map protocols to ports
    port_map = {"rdp": ["3389"], "vnc": ["5901"], "ssh": ["22"], "html5": ["443", "8443"], "web": ["80", "443", "8080"]}
    ports = []
    for proto in assignment.get("protocols_available", []):
        ports.extend(port_map.get(proto, []))
    ports = sorted(set(ports))

    group_name = assignment.get("group_id", "")
    resource_name = assignment.get("resource_name", "")

    # 1. Find or create the source group in NetBird (matches the Zitadel/Guacamole group)
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            # List groups
            r_groups = await c.get(f"{NETBIRD_API_URL}/api/groups", headers=netbird_headers())
            nb_groups = r_groups.json() if r_groups.status_code == 200 else []

            src_group = next((g for g in nb_groups if g["name"] == group_name), None)
            if not src_group:
                # Create source group
                r_cg = await c.post(f"{NETBIRD_API_URL}/api/groups", headers=netbird_headers(),
                                    json={"name": group_name, "peers": []})
                if r_cg.status_code in (200, 201):
                    src_group = r_cg.json()
                else:
                    return {"ok": False, "error": f"Failed to create group: {r_cg.text[:200]}"}

            src_group_id = src_group["id"]

            # 2. Find the "All" group as destination (or a specific destination group)
            all_group = next((g for g in nb_groups if g["name"] == "All"), None)
            dst_group_id = all_group["id"] if all_group else src_group_id

            # Check for specific destination groups like "LXC", "DataCenter TSPLus", "Routing Peers"
            lxc_group = next((g for g in nb_groups if g["name"] in ("LXC", "Routing Peers")), None)
            if lxc_group:
                dst_group_id = lxc_group["id"]

            # 3. Check if policy already exists
            policy_name = f"neosc-ws-{group_name}-{resource_name}"
            existing_policy_id = assignment.get("netbird_policy_id", "")
            
            policy_payload = {
                "name": policy_name,
                "description": f"NeoSC Workspace: {resource_name} for group {group_name}. Protocols: {', '.join(assignment.get('protocols_available', []))}",
                "enabled": True,
                "rules": [{
                    "name": policy_name,
                    "description": f"Allow {', '.join(ports)} from {group_name} to {resource_name}",
                    "enabled": True,
                    "action": "accept",
                    "bidirectional": True,
                    "protocol": "tcp",
                    "ports": ports,
                    "sources": [src_group_id],
                    "destinations": [dst_group_id],
                }],
            }

            if existing_policy_id:
                # Update existing policy
                r_pol = await c.put(f"{NETBIRD_API_URL}/api/policies/{existing_policy_id}",
                                    headers=netbird_headers(), json=policy_payload)
            else:
                # Create new policy
                r_pol = await c.post(f"{NETBIRD_API_URL}/api/policies",
                                     headers=netbird_headers(), json=policy_payload)

            if r_pol.status_code in (200, 201):
                pol_data = r_pol.json()
                policy_id = pol_data.get("id", "")
                # Save policy ID to assignment
                await db.workspace_assignments.update_one(
                    {"id": assignment_id},
                    {"$set": {"netbird_policy_id": policy_id}}
                )
                await create_audit_log(user["id"], user.get("email", ""), "netbird_policy_sync",
                                       f"assignment:{assignment_id}", f"policy:{policy_id} ports:{ports}")
                return {
                    "ok": True,
                    "policy_id": policy_id,
                    "policy_name": policy_name,
                    "src_group": {"id": src_group_id, "name": group_name},
                    "dst_group": {"id": dst_group_id},
                    "ports": ports,
                    "protocols": assignment.get("protocols_available"),
                }
            else:
                return {"ok": False, "error": f"Policy API: {r_pol.status_code} {r_pol.text[:300]}"}

    except Exception as e:
        return {"ok": False, "error": str(e)}


@api_router.post("/workspace-assignments/sync-all-netbird")
async def sync_all_netbird_policies(user: dict = Depends(get_current_user)):
    """Sync NetBird policies for ALL workspace assignments."""
    require_admin(user)
    assignments = await db.workspace_assignments.find({}, {"_id": 0}).to_list(100)
    results = []
    for a in assignments:
        try:
            r = await sync_assignment_netbird(a["id"], user)
            results.append({"assignment": a["id"], "resource": a["resource_name"], **r})
        except Exception as e:
            results.append({"assignment": a["id"], "resource": a["resource_name"], "ok": False, "error": str(e)})
    return {"synced": len(results), "results": results}


# ============ CLAIMS MAPPING END-TO-END ============
# Zitadel roles → NetBird groups + policies → LXD project ACLs

CLAIMS_MAP_CONFIG = {
    "zitadel_guacamole_project_id": "368643737728850586",
    "zitadel_portal_project_id": "360845682363341210",
    "role_to_lxd_project": {
        "admin": "default",
        "grp-admins": "default",
        "grp-infra": "default",
        "neosc": "NeoSC",
        "user": "NeoSC",
        "viewer": "NeoSC",
    },
    "role_to_netbird_ports": {
        "admin": ["22", "3389", "443", "8443", "5901", "80", "8080", "9443"],
        "grp-admins": ["22", "3389", "443", "8443", "5901", "80", "8080", "9443"],
        "grp-infra": ["22", "3389", "443", "8443", "5901"],
        "user": ["3389", "443", "8443"],
        "viewer": ["443", "8443"],
        "grp-ops": ["3389", "443"],
        "neosc": ["22", "3389", "443", "8443", "5901", "80"],
        "sapuser": ["3389", "443"],
    },
}


@api_router.get("/claims-map/config")
async def get_claims_map_config(user: dict = Depends(get_current_user)):
    require_admin(user)
    return CLAIMS_MAP_CONFIG


@api_router.put("/claims-map/config")
async def update_claims_map_config(body: dict, user: dict = Depends(get_current_user)):
    """Update role→project and role→ports mapping."""
    require_admin(user)
    if "role_to_lxd_project" in body:
        CLAIMS_MAP_CONFIG["role_to_lxd_project"] = body["role_to_lxd_project"]
    if "role_to_netbird_ports" in body:
        CLAIMS_MAP_CONFIG["role_to_netbird_ports"] = body["role_to_netbird_ports"]
    # Persist to DB
    await db.config.update_one({"key": "claims_map"}, {"$set": {"value": CLAIMS_MAP_CONFIG}}, upsert=True)
    return {"ok": True, "config": CLAIMS_MAP_CONFIG}


@api_router.post("/claims-map/sync")
async def sync_claims_end_to_end(user: dict = Depends(get_current_user)):
    """Full end-to-end sync: Zitadel roles → NetBird groups/policies → LXD project ACL mapping.
    
    Flow:
    1. Read all user grants from Zitadel (guacamole + portal projects)
    2. For each role → ensure NetBird group exists with matching name
    3. For each role → ensure NetBird policy with correct port ACL
    4. Build LXD project access map (role → which LXD project they can see)
    5. Store the full mapping in DB for the Workspaces page to consume
    """
    require_admin(user)
    results = {
        "zitadel_grants": 0,
        "netbird_groups_synced": [],
        "netbird_policies_synced": [],
        "lxd_access_map": {},
        "user_map": [],
        "errors": [],
    }

    zit_h = zitadel_headers(org_id=ZITADEL_ORG_ID)
    project_ids = [
        CLAIMS_MAP_CONFIG["zitadel_guacamole_project_id"],
        CLAIMS_MAP_CONFIG["zitadel_portal_project_id"],
    ]

    # Collect all grants
    all_grants = []
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            for pid in project_ids:
                r = await c.post(f"{ZITADEL_DOMAIN}/management/v1/users/grants/_search",
                                 headers=zit_h, json={"queries": [{"projectIdQuery": {"projectId": pid}}], "limit": 100})
                if r.status_code < 400:
                    grants = r.json().get("result", [])
                    all_grants.extend(grants)

        results["zitadel_grants"] = len(all_grants)

        # Build user→roles map
        user_roles = {}
        for g in all_grants:
            email = g.get("email", "") or g.get("userName", "")
            if not email:
                continue
            roles = g.get("roleKeys", [])
            if email not in user_roles:
                user_roles[email] = set()
            user_roles[email].update(roles)

        # Sync NetBird groups and policies per role
        async with httpx.AsyncClient(timeout=15) as c:
            # Get existing NB groups
            r_groups = await c.get(f"{NETBIRD_API_URL}/api/groups", headers=netbird_headers())
            nb_groups = r_groups.json() if r_groups.status_code == 200 else []
            nb_group_map = {g["name"]: g for g in nb_groups}

            # Get existing NB policies
            r_policies = await c.get(f"{NETBIRD_API_URL}/api/policies", headers=netbird_headers())
            nb_policies = r_policies.json() if r_policies.status_code == 200 else []
            nb_policy_map = {p["name"]: p for p in nb_policies}

            all_group = next((g for g in nb_groups if g["name"] == "All"), None)
            routing_group = next((g for g in nb_groups if g["name"] == "Routing Peers"), None)
            dst_group_id = (routing_group or all_group or {}).get("id", "")

            # Process each unique role
            all_roles = set()
            for roles in user_roles.values():
                all_roles.update(roles)

            for role in sorted(all_roles):
                # Skip tenant-specific roles for NetBird (they have their own enrollment flow)
                if role.startswith("tenant-") or role.startswith("test-"):
                    continue

                ports = CLAIMS_MAP_CONFIG["role_to_netbird_ports"].get(role, ["443"])

                # 1. Ensure NetBird group exists
                if role not in nb_group_map:
                    r_cg = await c.post(f"{NETBIRD_API_URL}/api/groups", headers=netbird_headers(),
                                        json={"name": role, "peers": []})
                    if r_cg.status_code in (200, 201):
                        nb_group_map[role] = r_cg.json()
                        results["netbird_groups_synced"].append(role)

                src_gid = nb_group_map.get(role, {}).get("id", "")
                if not src_gid:
                    continue

                # 2. Ensure NetBird policy
                policy_name = f"neosc-claims-{role}"
                if policy_name not in nb_policy_map:
                    pol_payload = {
                        "name": policy_name,
                        "description": f"NeoSC claims map: role={role} ports={','.join(ports)}",
                        "enabled": True,
                        "rules": [{
                            "name": policy_name,
                            "description": f"Allow {role} to access ports {','.join(ports)}",
                            "enabled": True,
                            "action": "accept",
                            "bidirectional": True,
                            "protocol": "tcp",
                            "ports": ports,
                            "sources": [src_gid],
                            "destinations": [dst_group_id] if dst_group_id else [src_gid],
                        }],
                    }
                    r_pol = await c.post(f"{NETBIRD_API_URL}/api/policies", headers=netbird_headers(), json=pol_payload)
                    if r_pol.status_code in (200, 201):
                        results["netbird_policies_synced"].append({"role": role, "policy": policy_name, "ports": ports})
                else:
                    results["netbird_policies_synced"].append({"role": role, "policy": policy_name, "status": "exists"})

        # 3. Build LXD access map
        lxd_access = {}
        for email, roles in user_roles.items():
            projects = set()
            for role in roles:
                proj = CLAIMS_MAP_CONFIG["role_to_lxd_project"].get(role)
                if proj:
                    projects.add(proj)
            lxd_access[email] = sorted(projects)
            results["user_map"].append({
                "email": email,
                "roles": sorted(roles),
                "netbird_groups": sorted(roles),
                "lxd_projects": sorted(projects),
            })

        results["lxd_access_map"] = lxd_access

        # 4. Store the full mapping in DB
        await db.config.update_one(
            {"key": "claims_map_state"},
            {"$set": {
                "value": {
                    "user_map": results["user_map"],
                    "lxd_access_map": lxd_access,
                    "synced_at": datetime.now(timezone.utc).isoformat(),
                },
            }},
            upsert=True,
        )

        # 5. Also sync to Guacamole groups
        for role in sorted(all_roles):
            if role.startswith("tenant-") or role.startswith("test-"):
                continue
            await guacamole_client.create_user_group(role)
            # Add users with this role to the Guacamole group
            for email, roles in user_roles.items():
                if role in roles:
                    await guacamole_client.create_user(email)
                    await guacamole_client.add_user_to_group(role, email)

    except Exception as e:
        results["errors"].append(str(e))

    await create_audit_log(user["id"], user.get("email", ""), "claims_map_sync",
                           f"grants:{results['zitadel_grants']}", f"nb_groups:{len(results['netbird_groups_synced'])} policies:{len(results['netbird_policies_synced'])}")
    return results


@api_router.get("/claims-map/state")
async def get_claims_map_state(user: dict = Depends(get_current_user)):
    """Get the last synced claims mapping state."""
    require_admin(user)
    state = await db.config.find_one({"key": "claims_map_state"}, {"_id": 0})
    if state:
        return state.get("value", {})
    return {"user_map": [], "lxd_access_map": {}, "synced_at": None}



# ============ NEO — AI ASSISTANT ============

NEO_SYSTEM_PROMPT = """Eres Neo, el asistente IA de NeoSC — la plataforma de escritorios Windows remotos seguros.

Tu personalidad:
- Amigable, cercano, usas español mexicano natural (no forzado)
- Eres consultor experto en infraestructura cloud, VDI y ciberseguridad
- Explicas cosas complejas de forma simple
- Usas "tú" (no usted), eres profesional pero relajado
- Puedes usar expresiones como "¡órale!", "va que va", "sale", "¡claro que sí!"

Conocimiento de NeoSC:
PLATAFORMA:
- NeoSC = Neogenesys Secure Connect — VDI cloud seguro sin VPN, sin cliente
- Acceso a escritorios Windows desde cualquier navegador

PRODUCTOS:
- NeoDesk: Escritorio remoto HTML5 vía Apache Guacamole (plan Starter)
- NeoDesk+: Escritorio remoto HTML5 vía TSplus (plan Plus/Enterprise) 
- NeoMesh: Red Zero Trust vía NetBird — reemplaza VPNs tradicionales
- NeoGuard: SSO + MFA vía Zitadel — autenticación segura
- NeoProxy: Identity-Aware Proxy vía Pomerium (plan Plus+)
- NeoVault: Gestión de Acceso Privilegiado vía JumpServer (Enterprise)

PLANES:
- Starter ($29 USD/mes): VM + NeoDesk HTML5, 5 usuarios, 2 vCPU, 4GB RAM, 80GB NVMe. Ideal para equipos pequeños.
- Plus ($79 USD/mes): Conecta tu TSplus existente + NeoProxy + NeoMesh, 25 usuarios, 4 vCPU, 8GB RAM, 120GB NVMe. Ideal para empresas que ya tienen TSplus.
- Enterprise (precio personalizado): Todo Plus + NeoVault PAM, AD/LDAP federado, relay dedicado, SLA 99.9%, soporte 24/7. Para corporativos.

TECNOLOGÍA:
- Zero Trust: Cada conexión se autentica — no hay red "de confianza"
- HTML5: Acceso desde Chrome/Firefox/Safari sin instalar nada
- MFA: Autenticación multifactor obligatoria
- Cifrado E2E: Todo el tráfico cifrado punto a punto

FLUJO ONBOARDING:
1. Elegir plan en el Market
2. Configurar VM (CPU, RAM, Disco)
3. Pago (Stripe/PayPal)
4. Provisioning automático (~3 min)
5. Acceder al escritorio desde el navegador

Tu trabajo:
- DISCOVERY: Si el visitante es nuevo, pregunta qué necesita y recomienda un plan
- ONBOARDING: Si ya es cliente, guíalo en la plataforma
- SOPORTE: Responde preguntas técnicas sobre NeoSC
- Si no sabes algo, dilo honestamente y ofrece contactar a un humano

Mantén respuestas concisas (2-4 párrafos máx). Usa formato Markdown cuando ayude."""

# In-memory chat sessions store
neo_chat_sessions: dict = {}

class NeoMessage(BaseModel):
    message: str
    session_id: str = ""

@api_router.post("/neo/chat")
async def neo_chat(data: NeoMessage, authorization: str = Header(None)):
    """Chat with Neo AI assistant"""
    llm_key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not llm_key:
        raise HTTPException(status_code=500, detail="LLM key not configured")

    session_id = data.session_id or str(uuid.uuid4())

    # Get or create chat session
    if session_id not in neo_chat_sessions:
        chat = LlmChat(
            api_key=llm_key,
            session_id=session_id,
            system_message=NEO_SYSTEM_PROMPT,
        )
        chat.with_model("anthropic", "claude-sonnet-4-5-20250929")
        neo_chat_sessions[session_id] = chat

    chat = neo_chat_sessions[session_id]

    # Load conversation history from DB
    history = await db.neo_conversations.find_one({"session_id": session_id}, {"_id": 0})
    
    try:
        user_msg = UserMessage(text=data.message)
        response = await chat.send_message(user_msg)

        # Save to DB
        msg_entry = {
            "role": "user", "content": data.message,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        assistant_entry = {
            "role": "assistant", "content": response,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

        await db.neo_conversations.update_one(
            {"session_id": session_id},
            {"$push": {"messages": {"$each": [msg_entry, assistant_entry]}},
             "$set": {"updated_at": datetime.now(timezone.utc).isoformat()},
             "$setOnInsert": {"created_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True
        )

        return {"response": response, "session_id": session_id}
    except Exception as e:
        logger.error(f"Neo chat error: {e}")
        raise HTTPException(status_code=500, detail=f"Error en Neo: {str(e)}")


@api_router.get("/neo/history/{session_id}")
async def neo_history(session_id: str):
    """Get chat history for a session"""
    conv = await db.neo_conversations.find_one({"session_id": session_id}, {"_id": 0})
    if not conv:
        return {"messages": [], "session_id": session_id}
    return {"messages": conv.get("messages", []), "session_id": session_id}


@api_router.delete("/neo/history/{session_id}")
async def neo_clear_history(session_id: str):
    """Clear chat history and reset session"""
    await db.neo_conversations.delete_one({"session_id": session_id})
    if session_id in neo_chat_sessions:
        del neo_chat_sessions[session_id]
    return {"message": "Historial limpiado", "session_id": session_id}


# ============ MARKET — WINDOWS VDI SELF-SERVICE ============
# Rutas: /api/market/...
# Branch: feature/windeskcloud-market
#
# Flujo completo:
#   POST /market/orders           → crea orden con config VM
#   POST /market/orders/{id}/simulate-payment → modo demo (sin Stripe)
#   POST /market/orders/{id}/pay  → pago real Stripe/PayPal
#   GET  /market/orders/{id}      → detalle de orden
#   GET  /market/orders/{id}/status → estado de aprovisionamiento (polling)
#   GET  /market/orders/{id}/stream → SSE real-time del orquestador
#   GET  /market/addons           → catálogo de addons disponibles
#   GET  /market/price            → calcular precio sin crear orden

import asyncio
import json as _json
from fastapi.responses import StreamingResponse

# ─── Catálogo de addons ───────────────────────────────────────────────────────
MARKET_ADDONS = [
    {"slug": "backup-daily",  "name": "Backup Diario",        "price_mo": 1500, "category": "storage",  "description": "Snapshot automático + 30 días"},
    {"slug": "sso-google",    "name": "SSO Google Workspace", "price_mo": 1000, "category": "security", "description": "Login con cuenta Google"},
    {"slug": "sso-microsoft", "name": "SSO Microsoft 365",    "price_mo": 1000, "category": "security", "description": "Login con Azure AD / Entra ID"},
    {"slug": "mfa-enforce",   "name": "MFA Obligatorio",      "price_mo":  500, "category": "security", "description": "Forzar 2FA a todos los usuarios"},
    {"slug": "session-rec",   "name": "Grabación Sesiones",   "price_mo": 2500, "category": "security", "description": "Auditoría visual de sesiones"},
    {"slug": "support-prio",  "name": "Soporte 24/7",         "price_mo": 5000, "category": "support",  "description": "Teléfono + chat, respuesta 1h"},
    {"slug": "extra-disk-50", "name": "Disco Extra 50 GB",    "price_mo":  800, "category": "storage",  "description": "50 GB NVMe adicionales"},
    {"slug": "tsplus-extra5", "name": "TSplus +5 licencias",  "price_mo": 3500, "category": "tsplus",   "description": "5 usuarios TSplus adicionales"},
    {"slug": "custom-domain", "name": "Dominio Propio",       "price_mo": 1500, "category": "network",  "description": "Usa tu dominio personalizado"},
    {"slug": "geo-block",     "name": "Bloqueo Geográfico",   "price_mo": 1000, "category": "security", "description": "Restringir acceso por país"},
]

# Precios base de planes NeoSC (en centavos USD) - Masterplan v1
PLAN_PRICES = {
    "starter":    {"mo": 2900,  "yr": 27840,  "base_vcpu": 2,  "base_ram": 4,  "base_disk": 80,  "tsplus": 5,  "max_users": 5,  "label": "Starter", "description": "VM + NeoDesk (Guacamole HTML5)"},
    "plus":       {"mo": 7900,  "yr": 75840,  "base_vcpu": 4,  "base_ram": 8,  "base_disk": 120, "tsplus": 10, "max_users": 25, "label": "Plus", "description": "TSplus existente + NeoProxy + NeoMesh"},
    "enterprise": {"mo": 0,     "yr": 0,      "base_vcpu": 8,  "base_ram": 16, "base_disk": 200, "tsplus": 50, "max_users": 999, "label": "Enterprise", "description": "B2B delegado + NeoVault + On-prem"},
}

# ─── Modelos ──────────────────────────────────────────────────────────────────
class MarketOrderCreate(BaseModel):
    neosc_plan:          str = "plus"
    billing_period:      str = "monthly"     # monthly | annual
    vcpu:                int = 4
    ram_gb:              int = 8
    disk_gb:             int = 80
    region:              str = "bare-metal-mx"
    tsplus_licenses:     int = 10
    tsplus_company_name: str = ""
    addons:              List[str] = []
    custom_hostname:     Optional[str] = None
    total_cents:         Optional[int] = None  # calculado en front, verificado en back


class MarketPayRequest(BaseModel):
    method:    str = "demo"    # stripe | paypal | demo
    card_data: Optional[dict] = None


# ─── Helper: calcular precio ───────────────────────────────────────────────────
def _calculate_price(plan: str, billing: str, vcpu: int, ram_gb: int,
                     disk_gb: int, tsplus_licenses: int, addons: List[str]) -> int:
    """Devuelve el precio mensual en centavos."""
    p = PLAN_PRICES.get(plan, PLAN_PRICES["plus"])
    base = p["yr"] // 12 if billing == "annual" else p["mo"]
    if billing == "annual":
        base = round(base * 0.80)  # 20% descuento adicional sobre base_yr/12

    # Extra recursos
    base += max(0, vcpu     - p["base_vcpu"])  * 500
    base += max(0, ram_gb   - p["base_ram"])   * 200
    base += max(0, disk_gb  - p["base_disk"])  * 10

    # TSplus extra (bloques de 5)
    if tsplus_licenses > p["tsplus"]:
        extra_blocks = (tsplus_licenses - p["tsplus"] + 4) // 5
        base += extra_blocks * 3500

    # Addons
    addon_map = {a["slug"]: a["price_mo"] for a in MARKET_ADDONS}
    for slug in addons:
        base += addon_map.get(slug, 0)

    return base


# ─── Helper: crear provisioning steps en BD ───────────────────────────────────
PROVISION_STEPS = [
    "payment_confirmed",
    "generate_credentials",
    "create_lxd_vm",
    "windows_bootstrap",
    "tsplus_install",
    "netbird_install",
    "tsplus_configure",
    "netbird_configure",
    "zitadel_provision",
    "dns_create",
    "email_welcome",
    "complete",
]

async def _init_provision_steps(order_id: str):
    steps = [
        {
            "order_id": order_id,
            "step_name": name,
            "step_index": i,
            "status": "pending",
            "started_at": None,
            "completed_at": None,
            "log_output": "",
            "error_msg": "",
        }
        for i, name in enumerate(PROVISION_STEPS)
    ]
    await db.provision_steps.insert_many(steps)


# ─── Helper: simular aprovisionamiento (DEMO_MODE) ────────────────────────────
async def _simulate_provisioning(order_id: str):
    """
    Simula el aprovisionamiento paso a paso con delays realistas.
    En producción esto sería Celery + Ansible + pylxd.
    Publica eventos que el SSE stream consume via cursor de MongoDB.
    """
    step_delays = {
        "payment_confirmed":    0.5,
        "generate_credentials": 2,
        "create_lxd_vm":        8,
        "windows_bootstrap":    15,
        "tsplus_install":       20,
        "netbird_install":      8,
        "tsplus_configure":     5,
        "netbird_configure":    5,
        "zitadel_provision":    6,
        "dns_create":           2,
        "email_welcome":        1,
        "complete":             0.5,
    }
    step_logs = {
        "payment_confirmed":    "Pago verificado y confirmado",
        "generate_credentials": "Generando licencia TSplus y setup key Netbird...",
        "create_lxd_vm":        "Creando VM Windows en servidor LXD bare metal...",
        "windows_bootstrap":    "Configurando WinRM + OpenSSH + políticas de seguridad...",
        "tsplus_install":       "Instalando TSplus en modo silencioso + activando licencia perpetua...",
        "netbird_install":      "Instalando Netbird + configurando auto-start permanente...",
        "tsplus_configure":     "Habilitando acceso HTML5 + configurando max sesiones...",
        "netbird_configure":    "Configurando red mesh Zero Trust + DNS interno...",
        "zitadel_provision":    "Creando organización SSO + roles admin/user + OIDC apps...",
        "dns_create":           "Creando registro DNS en Cloudflare...",
        "email_welcome":        "Enviando credenciales al email del cliente...",
        "complete":             "✓ VM Windows lista y accesible vía HTML5",
    }

    for step_name in PROVISION_STEPS:
        delay = step_delays.get(step_name, 2)

        # Marcar como running
        await db.provision_steps.update_one(
            {"order_id": order_id, "step_name": step_name},
            {"$set": {
                "status": "running",
                "started_at": datetime.now(timezone.utc).isoformat(),
                "log_output": f"Iniciando: {step_logs.get(step_name, '')}",
            }}
        )

        await asyncio.sleep(delay)

        # Marcar como success
        log = step_logs.get(step_name, "Completado")
        await db.provision_steps.update_one(
            {"order_id": order_id, "step_name": step_name},
            {"$set": {
                "status": "success",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "log_output": f"✓ {log}",
            }}
        )

    # Crear VM demo en BD y marcar orden como active
    demo_vm = {
        "id": f"vm-{str(uuid.uuid4())[:8]}",
        "order_id": order_id,
        "status": "running",
        "lxd_instance_name": f"windesk-demo-{str(uuid.uuid4())[:6]}",
        "internal_ip": "10.100.10.152",
        "netbird_ip": "100.79.92.225",
        "tunnel_hostname": "demo-tsplus.desk.kappa4.com",
        "has_tsplus": True,
        "tsplus_licenses": 10,
        "vcpu": 4,
        "ram_gb": 8,
        "disk_gb": 80,
        "provisioned_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.market_vms.insert_one(demo_vm)

    await db.market_orders.update_one(
        {"id": order_id},
        {"$set": {
            "status": "active",
            "vm_id": demo_vm["id"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }}
    )


# ─── GET /market/addons ────────────────────────────────────────────────────────
@api_router.get("/market/addons")
async def get_market_addons():
    """Catálogo de addons disponibles (público)."""
    return {"addons": MARKET_ADDONS}


# ─── POST /market/price ────────────────────────────────────────────────────────
@api_router.post("/market/price")
async def calculate_market_price(order: MarketOrderCreate):
    """Calcula el precio sin crear orden (público)."""
    total = _calculate_price(
        order.neosc_plan, order.billing_period,
        order.vcpu, order.ram_gb, order.disk_gb,
        order.tsplus_licenses, order.addons
    )
    return {
        "total_cents": total,
        "total_usd": round(total / 100, 2),
        "billing_period": order.billing_period,
        "currency": "usd",
    }


# ─── POST /market/orders ──────────────────────────────────────────────────────
@api_router.post("/market/orders")
async def create_market_order(
    order: MarketOrderCreate,
    user: dict = Depends(get_current_user)
):
    """Crea una orden de compra de VM Windows."""
    # Verificar/recalcular precio en backend (nunca confiar en el front)
    server_total = _calculate_price(
        order.neosc_plan, order.billing_period,
        order.vcpu, order.ram_gb, order.disk_gb,
        order.tsplus_licenses, order.addons
    )

    order_id = str(uuid.uuid4())
    demo_mode = os.environ.get("DEMO_MODE", "true").lower() == "true"

    order_doc = {
        "id": order_id,
        "user_id": user["id"],
        "user_email": user["email"],
        "status": "pending",
        # Config VM
        "neosc_plan": order.neosc_plan,
        "billing_period": order.billing_period,
        "vcpu": order.vcpu,
        "ram_gb": order.ram_gb,
        "disk_gb": order.disk_gb,
        "region": order.region,
        # TSplus
        "tsplus_licenses": order.tsplus_licenses,
        "tsplus_company_name": order.tsplus_company_name or user.get("organization", ""),
        "tsplus_license_key": None,
        # Addons
        "addons": order.addons,
        # DNS
        "custom_hostname": order.custom_hostname,
        "tunnel_hostname": None,
        # Pricing
        "total_cents": server_total,
        "currency": "usd",
        # Metadata
        "demo_mode": demo_mode,
        "stripe_enabled": not demo_mode,
        "vm_id": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.market_orders.insert_one(order_doc)
    await _init_provision_steps(order_id)
    await create_audit_log(
        user["id"], user["email"],
        "market_order_created", f"order:{order_id}",
        f"Orden creada: {order.neosc_plan} / {order.tsplus_licenses} users TSplus"
    )

    # In DEMO_MODE, auto-start provisioning immediately
    if demo_mode:
        await db.market_orders.update_one(
            {"id": order_id},
            {"$set": {"status": "paid", "payment_method": "demo",
                      "paid_at": datetime.now(timezone.utc).isoformat()}}
        )
        asyncio.create_task(_simulate_provisioning(order_id))

    return {
        "order_id": order_id,
        "total_cents": server_total,
        "total_usd": round(server_total / 100, 2),
        "demo": demo_mode,
        "stripe_enabled": not demo_mode,
        "status": "provisioning" if demo_mode else "pending",
    }


# ─── GET /market/orders/{id} ──────────────────────────────────────────────────
@api_router.get("/market/orders/{order_id}")
async def get_market_order(
    order_id: str,
    user: dict = Depends(get_current_user)
):
    """Detalle de una orden (solo el dueño o admin)."""
    order = await db.market_orders.find_one(
        {"id": order_id}, {"_id": 0}
    )
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if order["user_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Sin acceso")
    return order


# ─── POST /market/orders/{id}/simulate-payment ────────────────────────────────
@api_router.post("/market/orders/{order_id}/simulate-payment")
async def simulate_market_payment(
    order_id: str,
    user: dict = Depends(get_current_user)
):
    """Simula un pago exitoso y dispara el aprovisionamiento (DEMO_MODE)."""
    order = await db.market_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if order["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Sin acceso")
    if order["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Orden en estado: {order['status']}")

    # Marcar como pagada
    await db.market_orders.update_one(
        {"id": order_id},
        {"$set": {
            "status": "paid",
            "payment_method": "demo",
            "paid_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }}
    )

    # Disparar aprovisionamiento en background (asyncio.create_task)
    asyncio.create_task(_simulate_provisioning(order_id))

    await create_audit_log(
        user["id"], user["email"],
        "market_payment_simulated", f"order:{order_id}",
        "Pago simulado (DEMO_MODE) — aprovisionamiento iniciado"
    )

    return {
        "order_id": order_id,
        "status": "provisioning",
        "message": "Pago simulado. Aprovisionamiento iniciado.",
    }


# ─── POST /market/orders/{id}/pay ─────────────────────────────────────────────
@api_router.post("/market/orders/{order_id}/pay")
async def pay_market_order(
    order_id: str,
    pay_req: MarketPayRequest,
    user: dict = Depends(get_current_user)
):
    """Procesa pago real con Stripe o PayPal."""
    order = await db.market_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if order["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Sin acceso")
    if order["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Orden en estado: {order['status']}")

    if pay_req.method == "demo":
        # Redirigir a simulate
        await db.market_orders.update_one(
            {"id": order_id},
            {"$set": {"status": "paid", "payment_method": "demo",
                      "paid_at": datetime.now(timezone.utc).isoformat()}}
        )
        asyncio.create_task(_simulate_provisioning(order_id))
        return {"order_id": order_id, "status": "provisioning"}

    elif pay_req.method == "stripe":
        stripe_key = os.environ.get("STRIPE_SECRET_KEY", "")
        if not stripe_key:
            raise HTTPException(status_code=503, detail="Stripe no configurado — usa modo demo")
        # Aquí iría la integración real de Stripe PaymentIntent
        # Por ahora devolvemos instrucciones
        raise HTTPException(
            status_code=501,
            detail="Stripe en implementación. Usa modo demo para pruebas."
        )

    elif pay_req.method == "paypal":
        paypal_id = os.environ.get("PAYPAL_CLIENT_ID", "")
        if not paypal_id:
            raise HTTPException(status_code=503, detail="PayPal no configurado — usa modo demo")
        raise HTTPException(
            status_code=501,
            detail="PayPal en implementación. Usa modo demo para pruebas."
        )

    raise HTTPException(status_code=400, detail=f"Método de pago no soportado: {pay_req.method}")


# ─── GET /market/orders/{id}/status ───────────────────────────────────────────
@api_router.get("/market/orders/{order_id}/status")
async def get_order_provision_status(
    order_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Polling: devuelve el estado actual de todos los steps del aprovisionamiento.
    Usado como fallback cuando SSE no está disponible.
    """
    order = await db.market_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if order["user_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Sin acceso")

    steps = await db.provision_steps.find(
        {"order_id": order_id},
        {"_id": 0}
    ).sort("step_index", 1).to_list(20)

    vm = None
    if order.get("vm_id"):
        vm = await db.market_vms.find_one({"id": order["vm_id"]}, {"_id": 0})

    return {
        "order_id": order_id,
        "order_status": order["status"],
        "steps": steps,
        "vm": vm,
        "completed_steps": sum(1 for s in steps if s["status"] == "success"),
        "total_steps": len(PROVISION_STEPS),
    }


# ─── GET /market/orders/{id}/stream ───────────────────────────────────────────
@api_router.get("/market/orders/{order_id}/stream")
async def stream_provision_events(
    order_id: str,
    token: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """
    SSE stream: emite eventos de aprovisionamiento en tiempo real.
    Usa long-polling sobre MongoDB change stream (o polling simple cada 2s).
    El cliente React usa EventSource para consumirlo.
    """
    order = await db.market_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if order["user_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Sin acceso")

    async def event_generator():
        """
        Polling loop: cada 2 segundos comprueba si algún step cambió
        y emite el evento SSE correspondiente.
        Se detiene cuando todos los steps están en success o alguno en failed.
        """
        sent_statuses = {}  # step_name -> last known status
        max_iterations = 300  # 10 minutos máximo (300 * 2s)
        iteration = 0

        while iteration < max_iterations:
            steps = await db.provision_steps.find(
                {"order_id": order_id},
                {"_id": 0}
            ).sort("step_index", 1).to_list(20)

            for step in steps:
                name = step["step_name"]
                current_status = step["status"]
                last_status = sent_statuses.get(name)

                if current_status != last_status:
                    sent_statuses[name] = current_status
                    event_data = {
                        "order_id": order_id,
                        "step": name,
                        "status": current_status,
                        "log": step.get("log_output", ""),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "metadata": {}
                    }

                    # Si es el último step completado, incluir datos de la VM
                    if name == "complete" and current_status == "success":
                        current_order = await db.market_orders.find_one(
                            {"id": order_id}, {"_id": 0}
                        )
                        if current_order and current_order.get("vm_id"):
                            vm = await db.market_vms.find_one(
                                {"id": current_order["vm_id"]}, {"_id": 0}
                            )
                            event_data["metadata"]["vm"] = vm

                    yield f"data: {_json.dumps(event_data)}\n\n"

            # Comprobar si terminó (éxito o fallo)
            all_done = all(s["status"] in ("success", "failed", "skipped") for s in steps)
            any_failed = any(s["status"] == "failed" for s in steps)

            if all_done or any_failed:
                # Emitir evento final
                final = {
                    "order_id": order_id,
                    "step": "stream_end",
                    "status": "failed" if any_failed else "success",
                    "log": "Stream finalizado",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
                yield f"data: {_json.dumps(final)}\n\n"
                break

            await asyncio.sleep(2)
            iteration += 1

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Desactivar buffer de Nginx
        }
    )


# ─── GET /market/my-vms ───────────────────────────────────────────────────────
@api_router.get("/market/my-vms")
async def get_my_market_vms(user: dict = Depends(get_current_user)):
    """VMs del usuario: Market orders + LXD instances."""
    # 1. VMs from market orders
    orders = await db.market_orders.find(
        {"user_id": user["id"], "status": "active"},
        {"_id": 0}
    ).to_list(50)

    vms = []
    seen_ids = set()
    for order in orders:
        if order.get("vm_id"):
            vm = await db.market_vms.find_one({"id": order["vm_id"]}, {"_id": 0})
            if vm:
                vm["order"] = {
                    "id": order["id"],
                    "neosc_plan": order.get("neosc_plan", ""),
                    "tsplus_licenses": order.get("tsplus_licenses", 0),
                    "billing_period": order.get("billing_period"),
                    "total_cents": order.get("total_cents"),
                }
                vms.append(vm)
                seen_ids.add(vm["id"])

    # 2. LXD instances (admin sees all, users see their own)
    if user.get("role") == "admin":
        lxd_vms = await db.market_vms.find({"source": "lxd"}, {"_id": 0}).to_list(100)
    else:
        lxd_vms = await db.market_vms.find({"source": "lxd", "user_id": user["id"]}, {"_id": 0}).to_list(100)
    for vm in lxd_vms:
        if vm["id"] not in seen_ids:
            vms.append(vm)
            seen_ids.add(vm["id"])

    # 3. Tenant enrollment VMs (admin sees all)
    if user.get("role") == "admin":
        tenant_vms = await db.market_vms.find({"tenant_id": {"$exists": True}}, {"_id": 0}).to_list(100)
        for vm in tenant_vms:
            if vm["id"] not in seen_ids:
                vms.append(vm)
                seen_ids.add(vm["id"])

    return {"vms": vms}


# ─── DELETE /market/vms/{vm_id} ────────────────────────────────────────────────
@api_router.delete("/market/vms/{vm_id}")
async def delete_market_vm(vm_id: str, user: dict = Depends(get_current_user)):
    """Eliminar una VM del market (solo admin)."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores pueden eliminar VMs")
    vm = await db.market_vms.find_one({"id": vm_id})
    if not vm:
        raise HTTPException(status_code=404, detail="VM no encontrada")
    await db.market_vms.delete_one({"id": vm_id})
    await db.market_orders.update_many({"vm_id": vm_id}, {"$set": {"status": "deleted"}})
    await create_audit_log(user['id'], user['email'], "delete_market_vm", f"vm:{vm_id}", "Market VM deleted")
    return {"ok": True, "message": f"VM {vm_id} eliminada"}



# ─── GET /market/orders (admin: ver todas las órdenes) ────────────────────────
@api_router.get("/market/orders")
async def list_all_market_orders(user: dict = Depends(get_current_user)):
    """Lista todas las órdenes (solo admin)."""
    if user.get("role") != "admin":
        # Usuarios normales solo ven sus propias órdenes
        orders = await db.market_orders.find(
            {"user_id": user["id"]},
            {"_id": 0}
        ).sort("created_at", -1).to_list(50)
    else:
        orders = await db.market_orders.find(
            {}, {"_id": 0}
        ).sort("created_at", -1).to_list(200)

    return {"orders": orders, "total": len(orders)}


# ════════════════════════════════════════════════════════════════════════════════
# LXD / LXC  — NeoCloud VM Provisioning (Real Infrastructure)
# ════════════════════════════════════════════════════════════════════════════════

@api_router.get("/lxd/status")
async def lxd_status(user: dict = Depends(get_current_user)):
    require_admin(user)
    return await lxd_client.check_connection()

@api_router.get("/lxd/projects")
async def lxd_list_projects(user: dict = Depends(get_current_user)):
    require_admin(user)
    projects = await lxd_client.list_projects()
    return {"projects": projects, "current": lxd_client.LXD_PROJECT}

@api_router.get("/lxd/instances")
async def lxd_list_instances(project: Optional[str] = None, type: Optional[str] = None, user: dict = Depends(get_current_user)):
    require_admin(user)
    instances = await lxd_client.list_instances(instance_type=type, project=project)
    return {"instances": instances, "count": len(instances), "project": project or lxd_client.LXD_PROJECT}

@api_router.get("/lxd/instances/{name}")
async def lxd_get_instance(name: str, project: Optional[str] = None, user: dict = Depends(get_current_user)):
    require_admin(user)
    return await lxd_client.get_instance(name, project=project)

@api_router.get("/lxd/instances/{name}/state")
async def lxd_get_instance_state(name: str, project: Optional[str] = None, user: dict = Depends(get_current_user)):
    require_admin(user)
    return await lxd_client.get_instance_state(name, project=project)

class LxdCreateVM(BaseModel):
    name: str
    instance_type: str = "container"
    image_alias: str = ""
    cpu: str = "4"
    memory: str = "8GiB"
    disk_size: str = "120GiB"
    description: str = ""
    profiles: Optional[List[str]] = None
    storage_pool: str = "default"
    project: Optional[str] = None
    # Cloud-init
    username: str = ""
    password: str = ""
    ssh_key: str = ""
    netbird_setup_key: str = ""
    addons: Optional[List[str]] = None  # netbird, docker, cockpit
    # VM-specific (Windows)
    iso_path: str = ""
    enable_tpm: bool = False
    secure_boot: bool = False
    # Sync to workspaces
    add_to_workspaces: bool = True

@api_router.post("/lxd/instances")
async def lxd_create_instance(payload: LxdCreateVM, user: dict = Depends(get_current_user)):
    require_admin(user)
    result = await lxd_client.create_instance(
        name=payload.name,
        instance_type=payload.instance_type,
        image_alias=payload.image_alias,
        cpu=payload.cpu,
        memory=payload.memory,
        disk_size=payload.disk_size,
        description=payload.description,
        profiles=payload.profiles,
        storage_pool=payload.storage_pool,
        project=payload.project,
        username=payload.username,
        password=payload.password,
        ssh_key=payload.ssh_key,
        netbird_setup_key=payload.netbird_setup_key,
        addons=payload.addons,
        iso_path=payload.iso_path,
        enable_tpm=payload.enable_tpm,
        secure_boot=payload.secure_boot,
    )
    if result.get("ok"):
        await create_audit_log(user["id"], user["email"], "lxd_create_vm", f"vm:{payload.name}", f"Created {payload.instance_type}: {payload.name}")
        # Sync to workspaces
        if payload.add_to_workspaces:
            vm_doc = {
                "id": f"lxd-{payload.name}",
                "user_id": user["id"],
                "lxd_instance_name": payload.name,
                "lxd_project": payload.project or lxd_client.LXD_PROJECT,
                "tunnel_hostname": f"{payload.name}.neosc.cloud",
                "status": "provisioning",
                "vcpu": int(payload.cpu) if payload.cpu.isdigit() else 4,
                "ram_gb": int(payload.memory.replace("GiB", "")) if "GiB" in payload.memory else 8,
                "disk_gb": int(payload.disk_size.replace("GiB", "")) if "GiB" in payload.disk_size else 120,
                "tsplus_licenses": 0,
                "instance_type": payload.instance_type,
                "connection_url": "",
                "ssh_user": payload.username,
                "addons": payload.addons or [],
                "netbird_setup_key": payload.netbird_setup_key or "",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "source": "lxd",
            }
            await db.market_vms.update_one({"id": vm_doc["id"]}, {"$set": vm_doc}, upsert=True)

            # Auto-register in Guacamole (NeoVDI)
            try:
                if payload.instance_type == "virtual-machine":
                    # Windows VM → RDP
                    guac_result = await guacamole_client.create_connection(
                        name=f"NeoVDI-{payload.name}",
                        protocol="rdp",
                        hostname=payload.name,
                        port=3389,
                        username=payload.username or "",
                        password=payload.password or "",
                    )
                else:
                    # Linux container → VNC or SSH
                    guac_result = await guacamole_client.create_connection(
                        name=f"NeoVDI-{payload.name}",
                        protocol="vnc",
                        hostname=payload.name,
                        port=5901,
                        username=payload.username or "",
                        password=payload.password or "",
                    )
                if guac_result.get("ok"):
                    vm_doc["guacamole_connection_id"] = guac_result.get("id")
                    vm_doc["connection_url"] = f"{guacamole_client.GUACAMOLE_URL}/#/client/"
                    await db.market_vms.update_one({"id": vm_doc["id"]}, {"$set": {
                        "guacamole_connection_id": guac_result.get("id"),
                        "connection_url": vm_doc["connection_url"],
                    }})
            except Exception as guac_err:
                logger.warning(f"Auto-register Guacamole failed for {payload.name}: {guac_err}")
    return result

class LxdStateAction(BaseModel):
    action: str
    force: bool = False
    project: Optional[str] = None

@api_router.post("/lxd/instances/{name}/state")
async def lxd_change_state(name: str, payload: LxdStateAction, user: dict = Depends(get_current_user)):
    require_admin(user)
    result = await lxd_client.change_instance_state(name, payload.action, payload.force, project=payload.project)
    if result.get("ok"):
        await create_audit_log(user["id"], user["email"], f"lxd_{payload.action}", f"vm:{name}", f"{payload.action}: {name}")
        # Update workspace status
        new_status = "running" if payload.action == "start" else "stopped" if payload.action == "stop" else "available"
        await db.market_vms.update_one({"id": f"lxd-{name}"}, {"$set": {"status": new_status}})
    return result

@api_router.delete("/lxd/instances/{name}")
async def lxd_delete_instance(name: str, force: bool = False, project: Optional[str] = None, user: dict = Depends(get_current_user)):
    require_admin(user)
    result = await lxd_client.delete_instance(name, force=force, project=project)
    if result.get("ok"):
        await create_audit_log(user["id"], user["email"], "lxd_delete", f"vm:{name}", f"Deleted: {name}")
        await db.market_vms.delete_one({"id": f"lxd-{name}"})
    return result

class LxdExecCmd(BaseModel):
    command: List[str]
    project: Optional[str] = None

@api_router.post("/lxd/instances/{name}/exec")
async def lxd_exec(name: str, payload: LxdExecCmd, user: dict = Depends(get_current_user)):
    """Execute a command inside a running instance."""
    require_admin(user)
    result = await lxd_client.exec_command(name, payload.command, project=payload.project)
    await create_audit_log(user["id"], user["email"], "lxd_exec", f"vm:{name}", f"exec: {' '.join(payload.command[:3])}")
    return result

@api_router.get("/lxd/images")
async def lxd_list_images(project: Optional[str] = None, user: dict = Depends(get_current_user)):
    require_admin(user)
    images = await lxd_client.list_images(project=project)
    return {"images": images, "count": len(images)}

@api_router.get("/lxd/profiles")
async def lxd_list_profiles(project: Optional[str] = None, user: dict = Depends(get_current_user)):
    require_admin(user)
    return {"profiles": await lxd_client.list_profiles(project=project)}

@api_router.get("/lxd/storage-pools")
async def lxd_list_storage_pools(project: Optional[str] = None, user: dict = Depends(get_current_user)):
    require_admin(user)
    return {"pools": await lxd_client.list_storage_pools(project=project)}

@api_router.post("/lxd/sync-workspaces")
async def lxd_sync_workspaces(project: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Sync LXD instances to workspaces collection."""
    require_admin(user)
    proj = project or lxd_client.LXD_PROJECT
    instances = await lxd_client.list_instances(project=proj)
    synced = 0
    for inst in instances:
        vm_id = f"lxd-{inst['name']}"
        existing = await db.market_vms.find_one({"id": vm_id})
        if not existing:
            vm_doc = {
                "id": vm_id,
                "user_id": user["id"],
                "lxd_instance_name": inst["name"],
                "lxd_project": proj,
                "tunnel_hostname": f"{inst['name']}.neosc.cloud",
                "status": inst["status"].lower(),
                "vcpu": int(inst["config"]["cpu"]) if inst["config"]["cpu"].isdigit() else 0,
                "ram_gb": int(inst["config"]["memory"].replace("GiB", "")) if "GiB" in (inst["config"]["memory"] or "") else 0,
                "disk_gb": 0,
                "tsplus_licenses": 0,
                "instance_type": inst["type"],
                "connection_url": f"ssh://{inst['ipv4']}" if inst.get("ipv4") else "",
                "ipv4": inst.get("ipv4", ""),
                "addons": [],
                "created_at": inst.get("created_at", ""),
                "source": "lxd",
            }
            await db.market_vms.insert_one(vm_doc)
            synced += 1
        else:
            await db.market_vms.update_one({"id": vm_id}, {"$set": {
                "status": inst["status"].lower(),
                "ipv4": inst.get("ipv4", ""),
            }})
    return {"synced": synced, "total": len(instances), "project": proj}


@api_router.get("/lxd/instances/{name}/devices")
async def lxd_get_instance_devices(name: str, project: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Get all devices of an instance (useful for diagnosing issues)."""
    require_admin(user)
    inst = await lxd_client.get_instance(name, project=project)
    if inst.get("error"):
        raise HTTPException(status_code=404, detail=inst["error"])
    return {
        "name": name,
        "devices": inst.get("devices", {}),
        "profiles": inst.get("profiles", []),
    }


@api_router.delete("/lxd/instances/{name}/devices/{device_name}")
async def lxd_remove_device(name: str, device_name: str, project: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Remove a device from an instance (e.g., orphaned ISO mounts)."""
    require_admin(user)
    result = await lxd_client.remove_instance_device(name, device_name, project=project)
    if result.get("ok"):
        await create_audit_log(user["id"], user["email"], "lxd_remove_device", f"vm:{name}", f"Removed device: {device_name}")
    return result


@api_router.post("/lxd/instances/{name}/fix-devices")
async def lxd_fix_devices(name: str, project: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Fix ISO/disk devices without pool backing (common Windows VM issue).
    Removes disk devices that have 'source' but no 'pool' — these block LXD operations."""
    require_admin(user)
    result = await lxd_client.fix_instance_iso_devices(name, pool="dir", project=project)
    if result.get("ok") and result.get("fixed"):
        await create_audit_log(user["id"], user["email"], "lxd_fix_devices", f"vm:{name}", f"Fixed devices: {result['fixed']}")
    return result



# ─── Seed admin & demo users on startup ────────────────────────────────────────
@app.on_event("startup")
async def seed_data():
    """Seed admin and demo users on startup."""
    # Ensure default tenant exists & legacy data is backfilled with tenant_id
    default_tenant = await ensure_default_tenant()
    default_tid = default_tenant["id"]

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@windesk.cloud")
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin123!")

    existing_admin = await db.users.find_one({"email": admin_email})
    if not existing_admin:
        admin_user = User(
            email=admin_email,
            name="Platform Admin",
            organization="NeoSC Platform",
            tenant_id=default_tid,
            role="admin",
            mfa_enabled=True,
        )
        admin_doc = admin_user.model_dump()
        admin_doc['created_at'] = admin_doc['created_at'].isoformat()
        admin_doc['password_hash'] = hash_password(admin_password)
        await db.users.insert_one(admin_doc)
        logger.info(f"Admin user seeded: {admin_email}")

    demo_users = [
        {"email": "usuario1@windesk.cloud", "name": "Usuario Demo 1", "password": "Demo123!"},
        {"email": "usuario2@windesk.cloud", "name": "Usuario Demo 2", "password": "Demo123!"},
        {"email": "usuario3@windesk.cloud", "name": "Usuario Demo 3", "password": "Demo123!"},
    ]
    for du in demo_users:
        existing = await db.users.find_one({"email": du["email"]})
        if not existing:
            user = User(
                email=du["email"],
                name=du["name"],
                organization="Demo Organization",
                role="user",
            )
            doc = user.model_dump()
            doc['created_at'] = doc['created_at'].isoformat()
            doc['password_hash'] = hash_password(du["password"])
            await db.users.insert_one(doc)

    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.market_orders.create_index("user_id")
    await db.sessions.create_index("user_id")

    logger.info("Seed data completed")


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
