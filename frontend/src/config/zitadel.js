const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export const ZITADEL_CONFIG = {
  provider_key: 'zitadel_onprem',
  authority: 'https://manager.kappa4.com',
  client_id: '360979728544301063',
  redirect_uri: `${BACKEND_URL}/auth/callback`,
  scope: 'openid profile email urn:zitadel:iam:org:project:roles',
  authorization_endpoint: 'https://manager.kappa4.com/oauth/v2/authorize',
};

export const ZITADEL_CLOUD_CONFIG = {
  provider_key: 'zitadel_cloud',
  authority: 'https://beyondcloud-nxm7ab.us1.zitadel.cloud',
  client_id: '364755586279038416',
  redirect_uri: `${BACKEND_URL}/auth/callback`,
  scope: 'openid profile email urn:zitadel:iam:org:project:roles',
  authorization_endpoint: 'https://beyondcloud-nxm7ab.us1.zitadel.cloud/oauth/v2/authorize',
};
