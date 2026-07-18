# Staging — feature/opennebula-vm-lifecycle-guacamole

## ⚠️ Lee esto antes de correr nada

- **Mongo está aislado** (`neosc_staging`, contenedor propio) — no toca tus
  `market_orders`/`market_vms`/`users` de producción.
- **NetBird, Zitadel, OpenNebula y Guacamole NO están aislados.** Este compose
  usa tus credenciales reales (`.env.staging`). Si desde el frontend de
  staging creas una orden de VM, o le das Start/Stop/Reboot a una VM, o abres
  "RDP (Guacamole)" — eso **crea/modifica recursos reales**:
  - una VM real en OpenNebula
  - una conexión real en tu Guacamole
  - un setup-key real en NetBird
  - potencialmente un cargo si tu NetBird/Zitadel son de pago por uso
- Recomendación: prueba primero con una VM de bajo costo/desechable, y
  bórrala al terminar con `DELETE /market/vms/{vm_id}` (ya existe, solo admin)
  o `Trash2` en la UI de Workspaces.

## Levantar

```bash
cd ~/NeoSC-site
git checkout feature/opennebula-vm-lifecycle-guacamole   # o aplica el patch si aún no está en el repo

cp docker/staging/.env.staging.example docker/staging/.env.staging
nano docker/staging/.env.staging
# — copia los valores reales desde el .env que ya usa tu backend en :8001 —

# Si vas a abrir el navegador desde otra máquina (no giving-flounder), cambia
# REACT_APP_BACKEND_URL a la IP NetBird del host, ej:
#   REACT_APP_BACKEND_URL=http://100.121.53.218:8002

docker compose -f docker/staging/docker-compose.staging.yml \
  --env-file docker/staging/.env.staging up -d --build
```

## Bootstrap del primer usuario admin (Mongo de staging está vacío)

Ya tienes `create_local_admin.py` en la raíz del repo — apúntalo a la base
de staging:

```bash
docker exec -it neosc-staging-backend python create_local_admin.py \
  --email admin@staging.local --password "TuPasswordTemporal123!"
# (revisa create_local_admin.py por si los flags exactos difieren)
```

Si el script no soporta correr dentro del contenedor tal cual, corre este
one-liner apuntando Mongo al puerto expuesto (27018):

```bash
MONGO_URL=mongodb://localhost:27018 DB_NAME=neosc_staging \
  python3 create_local_admin.py
```

## Verificar

```bash
curl http://localhost:8002/api/                          # backend vivo
curl http://localhost:8002/api/market/addons              # catálogo (público)
open http://localhost:3001                                # frontend (o navega manualmente)
```

## Probar específicamente lo nuevo de este feature

1. Login como admin en `http://localhost:3001`.
2. Ve a **Market** → crea una orden de VM (te va a cobrar/aprovisionar real
   en OpenNebula).
3. Sigue el progreso — deberías ver el nuevo paso **"guacamole_register"**
   entre `netbird_configure` y `zitadel_provision`.
4. Ve a **Workspaces** — la VM debería mostrar el botón morado
   **"RDP (Guacamole)"** en vez del botón cian genérico de HTML5, si
   `guacamole_connection_id` quedó seteado.
5. Como admin, prueba los botones **Start / Stop / Reboot** — esto es lo que
   NO pude verificar contra tu wrapper real. Si falla con 502, el problema
   más probable es que `POST /vm/{id}/action` no es la ruta real del wrapper
   Node.js — habrá que ajustarla en `backend/opennebula_client.py` según lo
   que confirmes con `curl` directo al wrapper.

## Apagar / limpiar

```bash
docker compose -f docker/staging/docker-compose.staging.yml down
# agrega -v si quieres borrar también el volumen de Mongo de staging
docker compose -f docker/staging/docker-compose.staging.yml down -v
```

Esto NO toca tu proceso backend real en `:8001` (sigue corriendo huérfano,
como ya sabes — issue aparte pendiente en tu roadmap).

## Nota de seguridad aparte (no de este feature, pero la vi al clonar)
`backend/lxd-client.key`, `.crt`, `.pfx` siguen versionados en git — sigue
siendo el P0 pendiente de purgar del historial y rotar que ya tenías
trackeado. No lo toqué en esta rama para no mezclar cambios no relacionados.
