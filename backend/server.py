from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
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
    role: str = "user"
    mfa_enabled: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

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

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def generate_token() -> str:
    return secrets.token_urlsafe(32)

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
    
    user = User(
        email=user_data.email,
        name=user_data.name,
        organization=user_data.organization or "Default Organization"
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
    workspaces = await db.workspaces.find({}, {"_id": 0}).to_list(100)
    if not workspaces:
        # Initialize with default workspaces
        for ws in DEFAULT_WORKSPACES:
            await db.workspaces.insert_one(ws.copy())
        workspaces = DEFAULT_WORKSPACES
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

@api_router.post("/workspaces")
async def create_workspace(workspace: WorkspaceCreate, user: dict = Depends(get_current_user)):
    """Create a new workspace (admin only)"""
    if user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    ws_dict = workspace.model_dump()
    ws_dict['id'] = f"ws-{str(uuid.uuid4())[:8]}"
    ws_dict['status'] = 'available'
    
    await db.workspaces.insert_one(ws_dict)
    await create_audit_log(user['id'], user['email'], "create_workspace", f"workspace:{ws_dict['id']}", f"Created workspace: {workspace.name}")
    
    return {"message": "Workspace created", "workspace": ws_dict}

@api_router.put("/workspaces/{workspace_id}")
async def update_workspace(workspace_id: str, update: WorkspaceUpdate, user: dict = Depends(get_current_user)):
    """Update workspace configuration (admin only)"""
    if user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    workspace = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    
    if update_data:
        await db.workspaces.update_one({"id": workspace_id}, {"$set": update_data})
        await create_audit_log(user['id'], user['email'], "update_workspace", f"workspace:{workspace_id}", f"Updated workspace: {update_data}")
    
    updated = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})
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
        "workspace": workspace,
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

# ============ APPLICATIONS ENDPOINTS ============

@api_router.get("/applications", response_model=List[dict])
async def get_applications(user: dict = Depends(get_current_user)):
    """Get all available applications"""
    applications = await db.applications.find({}, {"_id": 0}).to_list(100)
    if not applications:
        # Initialize with default applications
        for app in DEFAULT_APPLICATIONS:
            await db.applications.insert_one(app.copy())
        applications = DEFAULT_APPLICATIONS
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

async def create_audit_log(user_id: str, user_email: str, action: str, resource: str, details: str, success: bool = True):
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
    await db.audit_logs.insert_one(log_doc)

@api_router.get("/audit-logs", response_model=List[dict])
async def get_audit_logs(user: dict = Depends(get_current_user)):
    # Admins can see all, users see their own
    query = {} if user.get('role') == 'admin' else {"user_id": user['id']}
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
    # Get active/recent orders with provisioning status
    active_orders = await db.market_orders.find(
        {"status": {"$in": ["pending", "provisioning", "completed"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(20)

    # Simulated workers (in production this would query Celery)
    workers = [
        {"name": "provision@worker-1", "status": "activo", "tasks": 1, "current_task": "windows_bootstrap"},
        {"name": "provision@worker-2", "status": "activo", "tasks": 0, "current_task": None},
        {"name": "winrm@worker-1", "status": "activo", "tasks": 1, "current_task": "install_tsplus"},
        {"name": "notify@worker-1", "status": "activo", "tasks": 0, "current_task": None},
        {"name": "backup@worker-1", "status": "activo", "tasks": 0, "current_task": None},
    ]

    # Simulated provisioning queue
    queue = []
    for order in active_orders:
        if order.get("status") == "provisioning":
            queue.append({
                "order_id": order.get("id", "")[:10],
                "tenant": order.get("organization", "Unknown"),
                "plan": order.get("neosc_plan", "Starter"),
                "status": "provisioning",
                "step": order.get("current_step", 3),
                "total_steps": 12,
                "current_action": order.get("current_action", "windows_bootstrap"),
            })

    # Add demo entries if queue is empty
    if not queue:
        queue = [
            {"order_id": "ORD-9B2F1A", "tenant": "Logística Rápida", "plan": "Starter",
             "status": "provisioning", "step": 5, "total_steps": 12, "current_action": "install_tsplus"},
            {"order_id": "ORD-7C3D2E", "tenant": "FinTech Alpha", "plan": "Business",
             "status": "provisioning", "step": 11, "total_steps": 12, "current_action": "netbird_mesh"},
        ]

    return {
        "workers": workers,
        "queue": queue,
        "active_count": len([o for o in active_orders if o.get("status") == "provisioning"]),
        "completed_today": len([o for o in active_orders if o.get("status") == "completed"]),
    }

@api_router.get("/admin/system-logs")
async def admin_system_logs(user: dict = Depends(get_current_user)):
    require_admin(user)
    logs = await db.audit_logs.find({}, {"_id": 0}).sort("timestamp", -1).to_list(50)
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
        name=payload.name,
        protocol=payload.protocol,
        hostname=payload.hostname,
        port=payload.port,
        username=payload.username,
        password=payload.password,
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
    """Get a direct Guacamole session link for embedding or redirecting."""
    return await guacamole_client.get_connection_link(connection_id)

@api_router.post("/guacamole/deploy")
async def guacamole_deploy_server(user: dict = Depends(get_current_user)):
    """Deploy a Guacamole server as an LXD container with Docker inside."""
    require_admin(user)
    container_name = "neosc-guacamole"
    existing = await lxd_client.get_instance(container_name, project=lxd_client.LXD_PROJECT)
    if not existing.get("error"):
        return {"ok": True, "status": "already_exists", "container": container_name}

    guac_cloud_init = guacamole_client.get_cloud_init_guacamole()
    cloud_init_lines = [
        "#cloud-config",
        "users:",
        "  - name: guacadmin",
        "    shell: /bin/bash",
        "    sudo: ALL=(ALL) NOPASSWD:ALL",
        "    groups: sudo,adm",
        '    plain_text_passwd: "NeoSC-Guac-2026!"',
        "    lock_passwd: false",
        "ssh_pwauth: true",
        "packages:",
        "  - curl",
        "  - wget",
        "  - openssh-server",
        "  - ca-certificates",
        "runcmd:",
    ]
    for line in guac_cloud_init.strip().split("\n"):
        line = line.strip()
        if line and not line.startswith("#"):
            cloud_init_lines.append(f"  - {line}")

    config = {
        "limits.cpu": "4",
        "limits.memory": "8GiB",
        "security.nesting": "true",
        "user.user-data": "\n".join(cloud_init_lines),
    }
    payload = {
        "name": container_name,
        "type": "container",
        "source": {"type": "image", "alias": "images:almalinux/9"},
        "config": config,
        "devices": {"root": {"path": "/", "pool": "dir", "type": "disk", "size": "50GiB"}},
        "profiles": ["default"],
        "description": "NeoSC Guacamole Server (RDP/VNC gateway)",
    }
    try:
        async with lxd_client._get_client() as client:
            r = await client.post("/1.0/instances", json=payload, params=lxd_client._p())
            data = r.json()
            if r.status_code in (200, 202) and data.get("type") != "error":
                op_url = data.get("operation")
                if op_url:
                    await client.get(f"{op_url}/wait", params={**lxd_client._p(), "timeout": "180"}, timeout=190.0)
                # Start it
                await lxd_client.change_instance_state(container_name, "start", project=lxd_client.LXD_PROJECT)
                await create_audit_log(user["id"], user.get("email",""), "guacamole_deploy", f"vm:{container_name}", "Guacamole server deployed", True)
                return {"ok": True, "container": container_name, "note": "Guacamole will be available on port 8080 after Docker starts (~2 min)"}
            return {"ok": False, "error": data.get("error", r.text[:300])}
    except Exception as e:
        return {"ok": False, "error": str(e)}


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

    return {
        "order_id": order_id,
        "total_cents": server_total,
        "total_usd": round(server_total / 100, 2),
        "demo": demo_mode,
        "stripe_enabled": not demo_mode,
        "status": "pending",
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



# ─── Seed admin & demo users on startup ────────────────────────────────────────
@app.on_event("startup")
async def seed_data():
    """Seed admin and demo users on startup."""
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@windesk.cloud")
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin123!")

    existing_admin = await db.users.find_one({"email": admin_email})
    if not existing_admin:
        admin_user = User(
            email=admin_email,
            name="Platform Admin",
            organization="NeoSC Platform",
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
