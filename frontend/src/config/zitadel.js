const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Zitadel Cloud (NeoGuard) — primary identity provider
export const ZITADEL_CLOUD_CONFIG = {
  provider_key: 'zitadel_cloud',
  authority: 'https://beyondcloud-nxm7ab.us1.zitadel.cloud',
  client_id: '361089609645431194',
  redirect_uri: `https://front.kappa4.com/auth/callback`,
  scope: 'openid profile email urn:zitadel:iam:org:project:roles',
  authorization_endpoint: 'https://beyondcloud-nxm7ab.us1.zitadel.cloud/oauth/v2/authorize',
};
