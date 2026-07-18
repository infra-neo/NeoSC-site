#!/usr/bin/env python3
"""
Crea (o resetea la contraseña de) un usuario admin local en MongoDB,
usando el mismo hashing (bcrypt) que server.py.

Necesario porque /api/auth/register ahora requiere estar autenticado
como admin — este script es la única vía para crear el primer admin
sin pasar por la API.

Uso:
    cd backend
    python3 scripts/create_local_admin.py
"""
import asyncio
import getpass
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import bcrypt
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


async def main():
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        print("❌ MONGO_URL o DB_NAME no definidos en backend/.env")
        sys.exit(1)

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    email = input("Email del admin: ").strip().lower()
    if not email or "@" not in email:
        print("❌ Email inválido.")
        sys.exit(1)

    name = input("Nombre para mostrar [Platform Admin]: ").strip() or "Platform Admin"

    password = getpass.getpass("Password (mínimo 12 caracteres): ")
    if len(password) < 12:
        print("❌ La contraseña debe tener al menos 12 caracteres.")
        sys.exit(1)
    password_confirm = getpass.getpass("Confirma password: ")
    if password != password_confirm:
        print("❌ Las contraseñas no coinciden.")
        sys.exit(1)

    existing = await db.users.find_one({"email": email})
    password_hash = hash_password(password)

    if existing:
        confirm = input(
            f"⚠️  Ya existe un usuario con {email} (role={existing.get('role')}). "
            f"¿Actualizar su password y rol a admin? [y/N]: "
        ).strip().lower()
        if confirm != "y":
            print("Cancelado.")
            sys.exit(0)
        await db.users.update_one(
            {"email": email},
            {"$set": {"password_hash": password_hash, "role": "admin", "name": name}},
        )
        print(f"✅ Usuario {email} actualizado a admin con nueva password.")
    else:
        doc = {
            "id": str(uuid.uuid4()),
            "email": email,
            "name": name,
            "organization": "NeoSC Platform",
            "tenant_id": None,
            "role": "admin",
            "mfa_enabled": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "password_hash": password_hash,
        }
        await db.users.insert_one(doc)
        print(f"✅ Admin local '{email}' creado.")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
