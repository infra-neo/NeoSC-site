#!/bin/bash
# ============================================================================
# NeoVDI — Guacamole OIDC Configuration Script
# Configura Apache Guacamole para autenticar via Zitadel OIDC
# Con claim groups → user groups y logout redirect a NeoSC Workspaces
# ============================================================================
# 
# EJECUTAR EN EL SERVIDOR GUACAMOLE (149.56.241.64)
# sudo bash setup-guacamole-oidc.sh
#
# ============================================================================

set -e

# ─── VARIABLES ────────────────────────────────────────────────────────────────
ZITADEL_DOMAIN="https://beyondcloud-nxm7ab.us1.zitadel.cloud"
OIDC_CLIENT_ID="368658584004778169"
OIDC_CLIENT_SECRET="fhASdVPulvFAGaLMJI7ODhcfp8Iegcmxo5h6LvbL1gI1fllsc1lhNQDjPWlzuTbs"
GUACAMOLE_URL="https://149.56.241.64:9443"
NEOSC_WORKSPACES_URL="https://action-steps-4.preview.emergentagent.com/workspaces"

# Zitadel OIDC endpoints
OIDC_AUTHORIZATION_ENDPOINT="${ZITADEL_DOMAIN}/oauth/v2/authorize"
OIDC_TOKEN_ENDPOINT="${ZITADEL_DOMAIN}/oauth/v2/token"
OIDC_JWKS_ENDPOINT="${ZITADEL_DOMAIN}/oauth/v2/keys"
OIDC_ISSUER="${ZITADEL_DOMAIN}"
OIDC_USERINFO_ENDPOINT="${ZITADEL_DOMAIN}/oidc/v1/userinfo"

# ─── DETECT GUACAMOLE CONFIG LOCATION ─────────────────────────────────────────
GUAC_HOME=""
if [ -f /etc/guacamole/guacamole.properties ]; then
    GUAC_HOME="/etc/guacamole"
elif [ -f /opt/guacamole/guacamole.properties ]; then
    GUAC_HOME="/opt/guacamole"
else
    # Docker: check common container paths
    CONTAINER_ID=$(docker ps --filter "name=guacamole" -q 2>/dev/null | head -1)
    if [ -n "$CONTAINER_ID" ]; then
        echo "[INFO] Guacamole running in Docker container: $CONTAINER_ID"
        GUAC_HOME="/docker"
    else
        echo "[WARN] Cannot find guacamole.properties. Creating in /etc/guacamole/"
        mkdir -p /etc/guacamole
        GUAC_HOME="/etc/guacamole"
    fi
fi

echo "============================================"
echo "  NeoVDI — Guacamole OIDC Setup"
echo "============================================"
echo "Guacamole Home: $GUAC_HOME"
echo "Zitadel Domain: $ZITADEL_DOMAIN"
echo "Client ID: $OIDC_CLIENT_ID"
echo "Redirect URI: $GUACAMOLE_URL/"
echo "Post-logout: $NEOSC_WORKSPACES_URL"
echo ""

# ─── DOWNLOAD OIDC EXTENSION (if not present) ────────────────────────────────
GUAC_VERSION="1.5.5"
OIDC_JAR="guacamole-auth-sso-openid-${GUAC_VERSION}.jar"

if [ "$GUAC_HOME" = "/docker" ]; then
    echo "[INFO] Docker mode: will configure via docker exec"
    
    # Check if OIDC extension exists
    docker exec $CONTAINER_ID ls /opt/guacamole/extensions/ 2>/dev/null || true
    
    # Download and copy OIDC extension
    if ! docker exec $CONTAINER_ID ls /opt/guacamole/extensions/guacamole-auth-sso-openid*.jar 2>/dev/null; then
        echo "[INFO] Downloading OIDC extension..."
        wget -q "https://apache.org/dyn/closer.lua/guacamole/${GUAC_VERSION}/binary/guacamole-auth-sso-openid-${GUAC_VERSION}.tar.gz?action=download" -O /tmp/guac-oidc.tar.gz 2>/dev/null || \
        wget -q "https://dlcdn.apache.org/guacamole/${GUAC_VERSION}/binary/guacamole-auth-sso-openid-${GUAC_VERSION}.tar.gz" -O /tmp/guac-oidc.tar.gz 2>/dev/null || \
        echo "[WARN] Could not download extension. You may need to manually place it."
        
        if [ -f /tmp/guac-oidc.tar.gz ]; then
            tar -xzf /tmp/guac-oidc.tar.gz -C /tmp/
            docker cp /tmp/guacamole-auth-sso-openid-${GUAC_VERSION}/${OIDC_JAR} $CONTAINER_ID:/opt/guacamole/extensions/
            echo "[OK] OIDC extension copied to container"
        fi
    fi
    
    # Write guacamole.properties
    cat > /tmp/guacamole-oidc.properties << 'PROPEOF'
# ═══════════════════════════════════════════════════════════════════════════
# NeoVDI — Guacamole OIDC Configuration (Zitadel)
# ═══════════════════════════════════════════════════════════════════════════

# OpenID Connect Provider (Zitadel)
openid-authorization-endpoint: OIDC_AUTHORIZATION_ENDPOINT_PLACEHOLDER
openid-jwks-endpoint: OIDC_JWKS_ENDPOINT_PLACEHOLDER
openid-issuer: OIDC_ISSUER_PLACEHOLDER
openid-client-id: OIDC_CLIENT_ID_PLACEHOLDER
openid-client-secret: OIDC_CLIENT_SECRET_PLACEHOLDER
openid-redirect-uri: GUACAMOLE_URL_PLACEHOLDER/
openid-token-endpoint: OIDC_TOKEN_ENDPOINT_PLACEHOLDER

# Scopes: openid + profile + email + groups (for role mapping)
openid-scope: openid profile email urn:zitadel:iam:org:project:roles

# Claim mapping: map Zitadel roles to Guacamole groups
openid-groups-claim: urn:zitadel:iam:org:project:roles
openid-username-claim: preferred_username

# Session timeout (seconds)
openid-max-token-validity: 300

# Post-logout redirect (back to NeoSC Workspaces)
# Note: Guacamole doesn't natively support post-logout redirect via properties,
# but we configure it in the extension and via Zitadel's post_logout_redirect_uri
PROPEOF

    # Replace placeholders
    sed -i "s|OIDC_AUTHORIZATION_ENDPOINT_PLACEHOLDER|${OIDC_AUTHORIZATION_ENDPOINT}|g" /tmp/guacamole-oidc.properties
    sed -i "s|OIDC_JWKS_ENDPOINT_PLACEHOLDER|${OIDC_JWKS_ENDPOINT}|g" /tmp/guacamole-oidc.properties
    sed -i "s|OIDC_ISSUER_PLACEHOLDER|${OIDC_ISSUER}|g" /tmp/guacamole-oidc.properties
    sed -i "s|OIDC_CLIENT_ID_PLACEHOLDER|${OIDC_CLIENT_ID}|g" /tmp/guacamole-oidc.properties
    sed -i "s|OIDC_CLIENT_SECRET_PLACEHOLDER|${OIDC_CLIENT_SECRET}|g" /tmp/guacamole-oidc.properties
    sed -i "s|GUACAMOLE_URL_PLACEHOLDER|${GUACAMOLE_URL}|g" /tmp/guacamole-oidc.properties
    sed -i "s|OIDC_TOKEN_ENDPOINT_PLACEHOLDER|${OIDC_TOKEN_ENDPOINT}|g" /tmp/guacamole-oidc.properties

    # Append to existing guacamole.properties or create new
    docker cp /tmp/guacamole-oidc.properties $CONTAINER_ID:/tmp/guacamole-oidc.properties
    docker exec $CONTAINER_ID sh -c 'cat /tmp/guacamole-oidc.properties >> /etc/guacamole/guacamole.properties 2>/dev/null || cp /tmp/guacamole-oidc.properties /etc/guacamole/guacamole.properties'
    
    echo "[OK] OIDC properties written to container"
    echo ""
    echo "[ACTION] Restart the Guacamole container:"
    echo "  docker restart $CONTAINER_ID"
    
else
    # Non-docker: write directly
    PROPS_FILE="${GUAC_HOME}/guacamole.properties"
    
    # Backup existing
    if [ -f "$PROPS_FILE" ]; then
        cp "$PROPS_FILE" "${PROPS_FILE}.bak.$(date +%Y%m%d)"
        echo "[OK] Backed up existing properties"
    fi
    
    # Append OIDC config
    cat >> "$PROPS_FILE" << EOF

# ═══════════════════════════════════════════════════════════════════════════
# NeoVDI — OIDC Configuration (Zitadel)  — Added $(date)
# ═══════════════════════════════════════════════════════════════════════════
openid-authorization-endpoint: ${OIDC_AUTHORIZATION_ENDPOINT}
openid-jwks-endpoint: ${OIDC_JWKS_ENDPOINT}
openid-issuer: ${OIDC_ISSUER}
openid-client-id: ${OIDC_CLIENT_ID}
openid-client-secret: ${OIDC_CLIENT_SECRET}
openid-redirect-uri: ${GUACAMOLE_URL}/
openid-token-endpoint: ${OIDC_TOKEN_ENDPOINT}
openid-scope: openid profile email urn:zitadel:iam:org:project:roles
openid-groups-claim: urn:zitadel:iam:org:project:roles
openid-username-claim: preferred_username
openid-max-token-validity: 300
EOF
    
    echo "[OK] OIDC config appended to $PROPS_FILE"
    
    # Download extension if needed
    EXTENSIONS_DIR="${GUAC_HOME}/extensions"
    mkdir -p "$EXTENSIONS_DIR"
    if ! ls ${EXTENSIONS_DIR}/guacamole-auth-sso-openid*.jar 2>/dev/null; then
        echo "[INFO] Downloading OIDC SSO extension..."
        cd /tmp
        wget -q "https://dlcdn.apache.org/guacamole/${GUAC_VERSION}/binary/guacamole-auth-sso-openid-${GUAC_VERSION}.tar.gz" -O guac-oidc.tar.gz 2>/dev/null && \
        tar -xzf guac-oidc.tar.gz && \
        cp guacamole-auth-sso-openid-${GUAC_VERSION}/${OIDC_JAR} ${EXTENSIONS_DIR}/ && \
        echo "[OK] Extension installed" || \
        echo "[WARN] Could not download. Download manually from https://guacamole.apache.org/releases/"
    fi
    
    echo ""
    echo "[ACTION] Restart Guacamole:"
    echo "  sudo systemctl restart guacd tomcat9"
    echo "  # or: sudo systemctl restart guacamole"
fi

echo ""
echo "============================================"
echo "  OIDC Configuration Complete"
echo "============================================"
echo ""
echo "Zitadel OIDC App:"
echo "  Client ID:     $OIDC_CLIENT_ID"
echo "  Redirect URI:  $GUACAMOLE_URL/"
echo "  Post-logout:   $NEOSC_WORKSPACES_URL"
echo ""
echo "Claim mapping:"
echo "  groups claim:  urn:zitadel:iam:org:project:roles"
echo "  username:      preferred_username"
echo ""
echo "After restart, users logging into Guacamole via Zitadel"
echo "will be automatically mapped to Guacamole user groups"
echo "based on their Zitadel project roles."
echo ""
echo "To configure logout redirect to NeoSC Workspaces:"
echo "  The post_logout_redirect_uri is configured in Zitadel."
echo "  When user clicks Logout in Guacamole → redirects to Zitadel"
echo "  → Zitadel redirects to $NEOSC_WORKSPACES_URL"
echo "============================================"
