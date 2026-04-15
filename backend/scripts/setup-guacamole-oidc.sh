#!/bin/bash
# ============================================================================
# NeoVDI — Guacamole OIDC + Zitadel Configuration Reference
# ============================================================================
#
# Tu Guacamole ya está configurado via Docker environment variables.
# Este archivo documenta la configuración actual y los pasos para
# completar la integración Zitadel → Guacamole groups.
#
# ============================================================================

cat << 'EOF'
╔══════════════════════════════════════════════════════════════════════════╗
║                    NeoVDI — OIDC Configuration                         ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  ✅ Guacamole OIDC ya configurado via Docker env vars                  ║
║                                                                        ║
║  Docker Compose environment:                                           ║
║  ─────────────────────────────────────────────────────────────────────  ║
║  OPENID_AUTHORIZATION_ENDPOINT:                                        ║
║    https://beyondcloud-nxm7ab.us1.zitadel.cloud/oauth/v2/authorize     ║
║  OPENID_JWKS_ENDPOINT:                                                 ║
║    https://beyondcloud-nxm7ab.us1.zitadel.cloud/oauth/v2/keys          ║
║  OPENID_ISSUER:                                                        ║
║    https://beyondcloud-nxm7ab.us1.zitadel.cloud                        ║
║  OPENID_CLIENT_ID: 368660070466141146                                  ║
║  OPENID_REDIRECT_URI: https://149.56.241.64:9443/                      ║
║  OPENID_USERNAME_CLAIM_TYPE: preferred_username                        ║
║  OPENID_GROUPS_CLAIM_TYPE: groups                                      ║
║  OPENID_SCOPE: openid profile email groups                             ║
║  OPENID_MAX_TOKEN_VALIDITY: 720                                        ║
║                                                                        ║
║  Extensions: auth-sso-openid, auth-ldap, auth-duo, auth-totp,         ║
║              auth-sso-saml, display-statistics, recording-*            ║
║                                                                        ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  PASO 1: Zitadel Action para inyectar "groups" en el ID token          ║
║  ─────────────────────────────────────────────────────────────────────  ║
║                                                                        ║
║  Guacamole espera un claim "groups" (array de strings) en el token.    ║
║  Zitadel no lo incluye por defecto. Necesitas crear una Action:        ║
║                                                                        ║
║  1. Ir a Zitadel Console → Actions → New Action                       ║
║  2. Nombre: "addGroupsClaim"                                           ║
║  3. Script:                                                            ║
║                                                                        ║
║     function addGroupsClaim(ctx, api) {                                ║
║       if (ctx.v1.user && ctx.v1.user.grants) {                        ║
║         var groups = [];                                               ║
║         ctx.v1.user.grants.grants.forEach(function(grant) {           ║
║           grant.roles.forEach(function(role) {                        ║
║             groups.push(role);                                         ║
║           });                                                          ║
║         });                                                            ║
║         api.v1.claims.setClaim("groups", groups);                     ║
║       }                                                                ║
║     }                                                                  ║
║                                                                        ║
║  4. Ir a Actions → Flows → "Complement Token"                         ║
║  5. Trigger: "Pre Access Token Creation"                               ║
║  6. Asignar la acción "addGroupsClaim"                                 ║
║                                                                        ║
║  Esto hará que cada token OIDC incluya:                                ║
║  { "groups": ["admin", "user", "viewer", ...] }                       ║
║                                                                        ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  PASO 2: Crear grupos en Guacamole que coincidan con roles Zitadel     ║
║  ─────────────────────────────────────────────────────────────────────  ║
║                                                                        ║
║  Opción A: Desde NeoSC Portal → NeoVDI → "Sync Zitadel"              ║
║  Opción B: Desde Guacamole Admin → User Groups → crear manualmente    ║
║                                                                        ║
║  Los grupos deben coincidir exactamente con los valores que la         ║
║  Zitadel Action inyecta en "groups". Ejemplo:                          ║
║    Zitadel role "admin" → Guacamole group "admin"                     ║
║    Zitadel role "user"  → Guacamole group "user"                      ║
║                                                                        ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  PASO 3: Asignar permisos de conexión a cada grupo                     ║
║  ─────────────────────────────────────────────────────────────────────  ║
║                                                                        ║
║  En Guacamole Admin → User Groups → seleccionar grupo                  ║
║  → Connections → marcar las conexiones que puede ver ese grupo         ║
║                                                                        ║
║  O desde NeoSC: POST /api/guacamole/groups/{gid}/grant/{conn_id}      ║
║                                                                        ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  PASO 4: Logout redirect a NeoSC Workspaces                           ║
║  ─────────────────────────────────────────────────────────────────────  ║
║                                                                        ║
║  Configurar en Zitadel → App OIDC → Post Logout Redirect URIs:        ║
║    https://action-steps-4.preview.emergentagent.com/workspaces         ║
║                                                                        ║
║  Cuando el usuario cierra sesión en Guacamole → Zitadel →             ║
║  redirect a la página de Workspaces de NeoSC.                          ║
║                                                                        ║
╚══════════════════════════════════════════════════════════════════════════╝
EOF
