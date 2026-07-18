#!/bin/bash
# start-neosc.sh — levanta MongoDB, backend (FastAPI/uvicorn) y frontend (React)
# Uso: ./start-neosc.sh
#
# Asume la estructura ya usada en esta sesión:
#   ~/NeoSC-site/backend/.venv
#   ~/NeoSC-site/frontend
# Ajusta REPO_DIR si tu ruta es distinta.

set -uo pipefail

REPO_DIR="/home/soporte/NeoSC-site"
BACKEND_PORT=8001
FRONTEND_PORT=3000

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; }

echo "=== NeoSC — levantando stack completo ==="
echo ""

# ── 1) MongoDB ──────────────────────────────────────────────────────────────
echo "1) MongoDB"
if systemctl is-active --quiet mongod 2>/dev/null; then
  ok "mongod ya está activo"
else
  warn "mongod no está activo, iniciando..."
  sudo systemctl start mongod
  sleep 2
  if systemctl is-active --quiet mongod; then
    ok "mongod iniciado"
  else
    fail "mongod no pudo iniciar — revisa: sudo systemctl status mongod"
    exit 1
  fi
fi
echo ""

# ── 2) Backend (FastAPI/uvicorn) ────────────────────────────────────────────
echo "2) Backend (uvicorn :$BACKEND_PORT)"
if curl -s -o /dev/null -w "" "http://localhost:$BACKEND_PORT/api/market/templates" 2>/dev/null; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$BACKEND_PORT/api/market/templates")
  if [ "$CODE" = "200" ]; then
    ok "backend ya responde (200)"
  else
    warn "algo responde en :$BACKEND_PORT pero no da 200 (código $CODE) — reiniciando"
    pkill -f "uvicorn server:app" 2>/dev/null
    sleep 1
  fi
fi

if ! curl -s -o /dev/null "http://localhost:$BACKEND_PORT/api/market/templates" 2>/dev/null; then
  if [ ! -d "$REPO_DIR/backend/.venv" ]; then
    fail "no existe $REPO_DIR/backend/.venv — crea el venv primero (python3 -m venv .venv && pip install -r requirements.txt)"
    exit 1
  fi
  cd "$REPO_DIR/backend"
  source .venv/bin/activate
  nohup uvicorn server:app --host 0.0.0.0 --port "$BACKEND_PORT" > /tmp/backend.log 2>&1 &
  disown
  cd - > /dev/null

  echo -n "   esperando que levante"
  for i in $(seq 1 15); do
    sleep 1
    echo -n "."
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$BACKEND_PORT/api/market/templates" 2>/dev/null | grep -q "200"; then
      echo ""
      ok "backend arriba (PID $(pgrep -f 'uvicorn server:app' | head -1))"
      break
    fi
    if [ "$i" = "15" ]; then
      echo ""
      fail "backend no respondió a tiempo — revisa: tail -50 /tmp/backend.log"
      exit 1
    fi
  done
fi
echo ""

# ── 3) Frontend (React/craco) ───────────────────────────────────────────────
echo "3) Frontend (yarn start :$FRONTEND_PORT)"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$FRONTEND_PORT" 2>/dev/null)
if [ "$CODE" = "200" ]; then
  ok "frontend ya responde (200)"
else
  if [ ! -d "$REPO_DIR/frontend/node_modules" ]; then
    fail "no existe $REPO_DIR/frontend/node_modules — corre 'yarn install' primero"
    exit 1
  fi
  cd "$REPO_DIR/frontend"
  nohup yarn start > /tmp/frontend.log 2>&1 &
  disown
  cd - > /dev/null

  echo -n "   esperando que compile y levante (puede tardar ~20-30s)"
  for i in $(seq 1 40); do
    sleep 1
    echo -n "."
    CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$FRONTEND_PORT" 2>/dev/null)
    if [ "$CODE" = "200" ]; then
      echo ""
      ok "frontend arriba (PID $(pgrep -f 'craco start' | head -1))"
      break
    fi
    if [ "$i" = "40" ]; then
      echo ""
      fail "frontend no respondió a tiempo — revisa: tail -50 /tmp/frontend.log"
      exit 1
    fi
  done
fi
echo ""

# ── Resumen ──────────────────────────────────────────────────────────────
echo "=== Listo ==="
echo "  MongoDB:  activo (systemd)"
echo "  Backend:  http://localhost:$BACKEND_PORT/api  (log: /tmp/backend.log)"
echo "  Frontend: http://localhost:$FRONTEND_PORT       (log: /tmp/frontend.log)"
echo ""
echo "  Para exponerlo públicamente, sigue necesitando Caddy en :8080"
echo "  (merge frontend+backend) + tu túnel de Cloudflare/NetBird — no lo"
echo "  incluí aquí porque depende de cuál método estés usando esta semana."
