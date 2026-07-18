#!/usr/bin/env python3
"""
Parchea backend/server.py in-place con reemplazos de texto únicos
(no depende de números de línea, tolera código extra alrededor).
Corre esto desde ~/NeoSC-site/backend/

    python3 patch_server.py

Hace backup automático a server.py.bak-preauth antes de tocar nada.
"""
import shutil
import sys

PATH = "server.py"

with open(PATH, "rb") as f:
    raw = f.read()

had_crlf = b"\r\n" in raw
if had_crlf:
    print("⚠️  Detecté saltos de línea CRLF en el archivo — normalizando a LF antes de parchear.")
    raw = raw.replace(b"\r\n", b"\n")

content = raw.decode("utf-8")
original = content
applied = []

def apply(label, old, new, required=True):
    global content
    count = content.count(old)
    if count == 0:
        msg = f"❌ NO ENCONTRADO: {label}"
        if required:
            print(msg)
            print("---- snippet buscado ----")
            print(old)
            print("--------------------------")
            sys.exit(1)
        else:
            print(f"⚠️  Saltado (no encontrado, opcional): {label}")
            return
    if count > 1:
        print(f"❌ AMBIGUO: '{label}' aparece {count} veces — revisar manualmente.")
        sys.exit(1)
    content = content.replace(old, new, 1)
    applied.append(label)
    print(f"✅ {label}")


# 1. Import de bcrypt
apply(
    "import bcrypt",
    "import hashlib\nimport httpx",
    "import hashlib\nimport bcrypt\nimport httpx",
)

# 2. hash_password -> bcrypt + verify_password + _is_legacy_sha256_hash
apply(
    "hash_password -> bcrypt",
    '''def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()''',
    '''def hash_password(password: str) -> str:
    """bcrypt hash — reemplaza el SHA-256 sin salt anterior (inseguro)."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")

def _is_legacy_sha256_hash(stored_hash: str) -> bool:
    return len(stored_hash) == 64 and not stored_hash.startswith("$2")

def verify_password(plain_password: str, stored_hash: str) -> bool:
    if _is_legacy_sha256_hash(stored_hash):
        return hashlib.sha256(plain_password.encode()).hexdigest() == stored_hash
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), stored_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False''',
)

# 3. login() — usar verify_password + migración perezosa a bcrypt
apply(
    "login() usa verify_password",
    '''    if user_doc.get('password_hash') != hash_password(credentials.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = generate_token()''',
    '''    stored_hash = user_doc.get('password_hash', '')
    if not stored_hash or not verify_password(credentials.password, stored_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if _is_legacy_sha256_hash(stored_hash):
        await db.users.update_one(
            {"email": credentials.email},
            {"$set": {"password_hash": hash_password(credentials.password)}}
        )

    token = generate_token()''',
)

# 4. register() — cerrar registro abierto (P0), requiere admin
apply(
    "register() requiere admin",
    '''async def register(user_data: UserCreate):
    # Check if user exists''',
    '''async def register(user_data: UserCreate, current_user: dict = Depends(get_current_user)):
    if current_user.get('role') not in ('admin', 'platform_admin'):
        raise HTTPException(status_code=403, detail="Solo un administrador puede crear usuarios locales")

    # Check if user exists''',
)

# 5. seed_data() — admin sin fallback hardcodeado (reemplazos línea por línea)
apply(
    "seed_data(): admin_email sin default hardcodeado",
    '    admin_email = os.environ.get("ADMIN_EMAIL", "admin@windesk.cloud")',
    '    admin_email = os.environ.get("ADMIN_EMAIL")',
)
apply(
    "seed_data(): admin_password sin default hardcodeado",
    '    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin123!")',
    '    admin_password = os.environ.get("ADMIN_PASSWORD")',
)
apply(
    "seed_data(): guard admin_email/admin_password antes de crear",
    '''    existing_admin = await db.users.find_one({"email": admin_email})
    if not existing_admin:''',
    '''    existing_admin = await db.users.find_one({"email": admin_email}) if (admin_email and admin_password) else None
    if admin_email and admin_password and not existing_admin:''',
)

# 6. seed_data(): warning si no hay admin configurado + demo users opt-in
apply(
    "seed_data(): warning + demo users opt-in con password random",
    '''    demo_users = [
        {"email": "usuario1@windesk.cloud", "name": "Usuario Demo 1", "password": "Demo123!"},
        {"email": "usuario2@windesk.cloud", "name": "Usuario Demo 2", "password": "Demo123!"},
        {"email": "usuario3@windesk.cloud", "name": "Usuario Demo 3", "password": "Demo123!"},
    ]
    for du in demo_users:''',
    '''    if not (admin_email and admin_password):
        logger.warning(
            "ADMIN_EMAIL/ADMIN_PASSWORD no definidos — no se sembró ningún admin local. "
            "Usa scripts/create_local_admin.py para crear el primero manualmente."
        )

    demo_users = [
        {"email": "usuario1@windesk.cloud", "name": "Usuario Demo 1", "password": secrets.token_urlsafe(12)},
        {"email": "usuario2@windesk.cloud", "name": "Usuario Demo 2", "password": secrets.token_urlsafe(12)},
        {"email": "usuario3@windesk.cloud", "name": "Usuario Demo 3", "password": secrets.token_urlsafe(12)},
    ] if os.environ.get("SEED_DEMO_USERS", "false").lower() == "true" else []
    for du in demo_users:''',
)

if content == original:
    print("Nada cambió — algo salió mal.")
    sys.exit(1)

shutil.copy(PATH, PATH + ".bak-preauth")
with open(PATH, "w", encoding="utf-8") as f:
    f.write(content)

print(f"\n✅ {len(applied)} cambios aplicados. Backup guardado en {PATH}.bak-preauth")
