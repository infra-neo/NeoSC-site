#!/bin/bash
# ============================================================================
# NeoVDI — Guacamole Docker Config para Disconnect Redirect + OIDC
# ============================================================================
#
# Agrega estas variables al docker-compose.yml de Guacamole:
#
# ============================================================================

cat << 'EOF'
╔══════════════════════════════════════════════════════════════════════════╗
║              NeoVDI — Guacamole Docker Configuration                   ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  AGREGA estas variables al servicio guacamole en docker-compose.yml:   ║
║                                                                        ║
║  environment:                                                          ║
║    # === DISCONNECT / SESSION CLOSE BEHAVIOR ===                       ║
║    # Redirect when user closes session or connection drops             ║
║    WEBAPP_EXIT_URL: "https://TU_DOMINIO_NEOSC/workspaces"             ║
║                                                                        ║
║    # Disable reconnect attempts (go straight to exit URL)              ║
║    WEBAPP_RECONNECT_ENABLED: "false"                                   ║
║                                                                        ║
║    # === OIDC (Zitadel) ===                                            ║
║    OPENID_AUTHORIZATION_ENDPOINT: 'https://beyondcloud-nxm7ab.us1.zitadel.cloud/oauth/v2/authorize'
║    OPENID_JWKS_ENDPOINT: 'https://beyondcloud-nxm7ab.us1.zitadel.cloud/oauth/v2/keys'
║    OPENID_ISSUER: 'https://beyondcloud-nxm7ab.us1.zitadel.cloud'      ║
║    OPENID_CLIENT_ID: '368660070466141146'                              ║
║    OPENID_REDIRECT_URI: 'https://149.56.241.64:9443/'                  ║
║    OPENID_USERNAME_CLAIM_TYPE: "preferred_username"                     ║
║    OPENID_GROUPS_CLAIM_TYPE: "groups"                                   ║
║    OPENID_SCOPE: "openid profile email groups"                         ║
║    OPENID_MAX_TOKEN_VALIDITY: "720"                                    ║
║                                                                        ║
║  Después de actualizar, ejecuta:                                       ║
║    docker compose down && docker compose up -d                         ║
║                                                                        ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  ¿QUÉ HACE WEBAPP_EXIT_URL?                                           ║
║  Cuando una sesión VNC/RDP/SSH se desconecta o el usuario la cierra:   ║
║  - Guacamole NO muestra "Reconectando en X seconds..."                 ║
║  - Redirige automáticamente a la URL configurada                       ║
║  - La sesión Guacamole se destruye                                     ║
║                                                                        ║
║  WEBAPP_RECONNECT_ENABLED=false:                                       ║
║  - Desactiva el intento de reconexión automática                       ║
║  - Si la conexión se pierde, va directo al exit URL                    ║
║                                                                        ║
╚══════════════════════════════════════════════════════════════════════════╝

EJEMPLO docker-compose.yml completo:

  guacamole:
    image: guacamole/guacamole:1.6.0
    environment:
      GUACD_HOSTNAME: guacd
      POSTGRESQL_HOSTNAME: postgres
      POSTGRESQL_DATABASE: guacamole_db
      POSTGRESQL_USER: guacamole_user
      POSTGRESQL_PASSWORD: your_password
      
      # Session behavior
      WEBAPP_EXIT_URL: "https://action-steps-4.preview.emergentagent.com/workspaces"
      WEBAPP_RECONNECT_ENABLED: "false"
      
      # OIDC
      OPENID_AUTHORIZATION_ENDPOINT: 'https://beyondcloud-nxm7ab.us1.zitadel.cloud/oauth/v2/authorize'
      OPENID_JWKS_ENDPOINT: 'https://beyondcloud-nxm7ab.us1.zitadel.cloud/oauth/v2/keys'
      OPENID_ISSUER: 'https://beyondcloud-nxm7ab.us1.zitadel.cloud'
      OPENID_CLIENT_ID: '368660070466141146'
      OPENID_REDIRECT_URI: 'https://149.56.241.64:9443/'
      OPENID_USERNAME_CLAIM_TYPE: "preferred_username"
      OPENID_GROUPS_CLAIM_TYPE: "groups"
      OPENID_SCOPE: "openid profile email groups"
      OPENID_MAX_TOKEN_VALIDITY: "720"
      
      # Extensions
      EXTENSIONS: "auth-ldap,auth-duo,auth-sso-openid,auth-totp,auth-sso-saml,display-statistics,recording-filename-suffix,recording-rename-on-connect,recording-rename-on-disconnect"
    ports:
      - "9443:8080"

EOF
