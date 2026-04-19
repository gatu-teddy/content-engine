import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════
// OAUTH CALLBACK HANDLER
// Receives authorization code from platform OAuth redirects,
// exchanges for access tokens, and stores encrypted credentials.
//
// Callback URL pattern:
//   GET /api/oauth/callback/:platform/:businessId?code=xxx&state=xxx
//
// Each platform has its own token exchange logic.
// ═══════════════════════════════════════════════════════════════


// ─── Platform-specific token exchange configs ───
const PLATFORM_CONFIG = {
  instagram: {
    token_url: 'https://graph.facebook.com/v21.0/oauth/access_token',
    // Instagram uses the same token endpoint as Facebook
    // Short-lived token → exchange for long-lived (60 days)
    long_lived_url: 'https://graph.facebook.com/v21.0/oauth/access_token',
    client_id_env: 'FACEBOOK_CLIENT_ID',
    client_secret_env: 'FACEBOOK_CLIENT_SECRET',
    token_lifetime_days: 60,
  },
  facebook: {
    token_url: 'https://graph.facebook.com/v21.0/oauth/access_token',
    long_lived_url: 'https://graph.facebook.com/v21.0/oauth/access_token',
    client_id_env: 'FACEBOOK_CLIENT_ID',
    client_secret_env: 'FACEBOOK_CLIENT_SECRET',
    token_lifetime_days: 60,
  },
  linkedin: {
    token_url: 'https://www.linkedin.com/oauth/v2/accessToken',
    client_id_env: 'LINKEDIN_CLIENT_ID',
    client_secret_env: 'LINKEDIN_CLIENT_SECRET',
    token_lifetime_days: 60,
  },
  tiktok: {
    token_url: 'https://open.tiktokapis.com/v2/oauth/token/',
    client_id_env: 'TIKTOK_CLIENT_ID',
    client_secret_env: 'TIKTOK_CLIENT_SECRET',
    token_lifetime_days: 30, // TikTok tokens are shorter
  },
  youtube: {
    token_url: 'https://oauth2.googleapis.com/token',
    client_id_env: 'YOUTUBE_CLIENT_ID',
    client_secret_env: 'YOUTUBE_CLIENT_SECRET',
    token_lifetime_days: null, // uses refresh_token, no fixed expiry
  },
  x: {
    token_url: 'https://api.twitter.com/2/oauth2/token',
    client_id_env: 'X_CLIENT_ID',
    client_secret_env: 'X_CLIENT_SECRET',
    token_lifetime_days: null, // short-lived (~2 hrs); expires_in drives expiry, refresh_token used
  },
};


// ─── Build redirect URI (must match what was sent in authorize URL) ───
function getRedirectUri(platform, businessId) {
  const base = process.env.API_BASE_URL || 'https://engine.yourdomain.com';
  return `${base}/api/oauth/callback/${platform}/${businessId}`;
}


// ─── GET /api/oauth/callback/:platform/:businessId ───
router.get('/callback/:platform/:businessId', async (req, res) => {
  const { platform, businessId } = req.params;
  const { code, error, error_description } = req.query;

  // Handle OAuth denial
  if (error) {
    console.error(`[oauth] ${platform} denied: ${error} — ${error_description}`);
    return res.redirect(
      `${process.env.DASHBOARD_URL || 'https://app.yourdomain.com'}/connections?error=${encodeURIComponent(error_description || error)}`
    );
  }

  if (!code) {
    return res.status(400).json({ error: 'No authorization code received' });
  }

  const config = PLATFORM_CONFIG[platform];
  if (!config) {
    return res.status(400).json({ error: `Unsupported platform: ${platform}` });
  }

  try {
    // Verify business exists
    const bizResult = await pool.query('SELECT id, display_name FROM businesses WHERE id = $1', [businessId]);
    if (bizResult.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const clientId = process.env[config.client_id_env];
    const clientSecret = process.env[config.client_secret_env];

    if (!clientId || !clientSecret) {
      console.error(`[oauth] Missing env vars: ${config.client_id_env} or ${config.client_secret_env}`);
      return res.status(500).json({ error: `OAuth not configured for ${platform}` });
    }

    const redirectUri = getRedirectUri(platform, businessId);

    // ─── Exchange authorization code for access token ───
    let tokens;

    if (platform === 'instagram' || platform === 'facebook') {
      tokens = await exchangeMetaToken(config, clientId, clientSecret, code, redirectUri, platform);
    } else if (platform === 'linkedin') {
      tokens = await exchangeLinkedInToken(config, clientId, clientSecret, code, redirectUri);
    } else if (platform === 'tiktok') {
      tokens = await exchangeTikTokToken(config, clientId, clientSecret, code, redirectUri);
    } else if (platform === 'youtube') {
      tokens = await exchangeGoogleToken(config, clientId, clientSecret, code, redirectUri);
    } else if (platform === 'x') {
      // Decode PKCE verifier from state param (encoded by oauth-url endpoint)
      const { state } = req.query;
      let codeVerifier = null;
      try {
        const stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
        codeVerifier = stateData.cv;
      } catch {
        console.error('[oauth] X: failed to decode state/PKCE verifier');
      }
      tokens = await exchangeXToken(clientId, clientSecret, code, redirectUri, codeVerifier);
    }

    if (!tokens || tokens.error) {
      console.error(`[oauth] Token exchange failed for ${platform}:`, tokens?.error);
      return res.redirect(
        `${process.env.DASHBOARD_URL || 'https://app.yourdomain.com'}/connections?error=${encodeURIComponent(tokens?.error || 'Token exchange failed')}`
      );
    }

    // ─── For Meta platforms with multiple pages, redirect to page picker ───
    if ((platform === 'instagram' || platform === 'facebook') && tokens.all_pages?.length > 1) {
      const pickToken = Math.random().toString(36).slice(2) + Date.now().toString(36);
      await pool.query(
        `INSERT INTO oauth_pending (token, business_id, platform, pages_json, access_token, expires_at)
         VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '10 minutes')`,
        [pickToken, businessId, platform, JSON.stringify(tokens.all_pages), tokens.long_lived_token]
      );
      return res.redirect(
        `${process.env.DASHBOARD_URL || 'https://app.yourdomain.com'}/connections?pick=${pickToken}&platform=${platform}&business=${businessId}`
      );
    }

    // ─── Calculate expiry date ───
    const expiresAt = config.token_lifetime_days
      ? new Date(Date.now() + config.token_lifetime_days * 24 * 60 * 60 * 1000)
      : (tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null);

    // ─── Store credentials (upsert) ───
    const credentialsJson = JSON.stringify(tokens.credentials);

    // Extract a display handle from the credentials
    const handle = tokens.credentials.page_name
      || tokens.credentials.name
      || (tokens.credentials.ig_user_id ? `@${tokens.credentials.ig_user_id}` : null)
      || tokens.credentials.open_id
      || null;

    await pool.query(
      `INSERT INTO platform_credentials (business_id, platform, credentials_encrypted, token_expires_at, status, handle, last_used_at)
       VALUES ($1, $2, $3, $4, 'active', $5, NOW())
       ON CONFLICT (business_id, platform) DO UPDATE SET
         credentials_encrypted = $3,
         token_expires_at = $4,
         status = 'active',
         handle = $5,
         last_used_at = NOW(),
         updated_at = NOW()`,
      [businessId, platform, credentialsJson, expiresAt, handle]
    );

    console.log(`[oauth] ${platform} connected for business ${businessId} (expires: ${expiresAt || 'never'})`);

    // Redirect back to dashboard connections page
    res.redirect(
      `${process.env.DASHBOARD_URL || 'https://app.yourdomain.com'}/connections?connected=${platform}`
    );

  } catch (err) {
    console.error(`[oauth] Callback error for ${platform}:`, err);
    res.redirect(
      `${process.env.DASHBOARD_URL || 'https://app.yourdomain.com'}/connections?error=${encodeURIComponent('Connection failed')}`
    );
  }
});


// ═══════════════════════════════════════════════════════════════
// PLATFORM-SPECIFIC TOKEN EXCHANGE
// ═══════════════════════════════════════════════════════════════

async function exchangeMetaToken(config, clientId, clientSecret, code, redirectUri, platform) {
  // Step 1: Exchange code for short-lived token
  const tokenUrl = `${config.token_url}?client_id=${clientId}&client_secret=${clientSecret}&code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  const resp = await fetch(tokenUrl);
  const data = await resp.json();

  if (data.error) {
    return { error: data.error.message || data.error };
  }

  const shortToken = data.access_token;

  // Step 2: Exchange short-lived for long-lived token (60 days)
  const longUrl = `${config.long_lived_url}?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${shortToken}`;

  const longResp = await fetch(longUrl);
  const longData = await longResp.json();

  const accessToken = longData.access_token || shortToken;

  // Step 3: Get all pages the user manages
  const pagesResp = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${accessToken}`);
  const pagesData = await pagesResp.json();
  const pages = pagesData.data || [];

  // If multiple pages, return them all for picker
  if (pages.length > 1) {
    // For instagram, fetch IG accounts for each page so picker can show them
    let enrichedPages = pages;
    if (platform === 'instagram') {
      enrichedPages = await Promise.all(pages.map(async p => {
        const igResp = await fetch(`https://graph.facebook.com/v21.0/${p.id}?fields=instagram_business_account&access_token=${accessToken}`);
        const igData = await igResp.json();
        return { ...p, ig_user_id: igData.instagram_business_account?.id || null };
      }));
    }
    return { all_pages: enrichedPages, long_lived_token: accessToken, expires_in: longData.expires_in || 60 * 24 * 60 * 60 };
  }

  // Single page — build credentials directly
  const page = pages[0];
  let credentials = { access_token: accessToken };

  if (page) {
    if (platform === 'instagram') {
      const igResp = await fetch(`https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${accessToken}`);
      const igData = await igResp.json();
      credentials = {
        access_token: page.access_token || accessToken,
        page_id: page.id,
        page_name: page.name,
        ig_user_id: igData.instagram_business_account?.id || null,
      };
    } else {
      credentials = {
        access_token: accessToken,
        page_access_token: page.access_token,
        page_id: page.id,
        page_name: page.name,
      };
    }
  }

  return { credentials, expires_in: longData.expires_in || 60 * 24 * 60 * 60 };
}


async function exchangeLinkedInToken(config, clientId, clientSecret, code, redirectUri) {
  const resp = await fetch(config.token_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  const data = await resp.json();
  if (data.error) return { error: data.error_description || data.error };

  // Get user info for author URN
  const userResp = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { 'Authorization': `Bearer ${data.access_token}` },
  });
  const userData = await userResp.json();

  return {
    credentials: {
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      author_urn: `urn:li:person:${userData.sub}`,
      name: userData.name,
    },
    expires_in: data.expires_in,
  };
}


async function exchangeTikTokToken(config, clientId, clientSecret, code, redirectUri) {
  const resp = await fetch(config.token_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  const data = await resp.json();
  if (data.error || data.data?.error_code) {
    return { error: data.error_description || data.data?.description || 'TikTok auth failed' };
  }

  const tokenData = data.data || data;
  return {
    credentials: {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      open_id: tokenData.open_id,
    },
    expires_in: tokenData.expires_in,
  };
}


async function exchangeGoogleToken(config, clientId, clientSecret, code, redirectUri) {
  const resp = await fetch(config.token_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const data = await resp.json();
  if (data.error) return { error: data.error_description || data.error };

  return {
    credentials: {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_type: data.token_type,
    },
    expires_in: data.expires_in,
  };
}


async function exchangeXToken(clientId, clientSecret, code, redirectUri, codeVerifier) {
  const resp = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: codeVerifier || '',
    }),
  });

  const data = await resp.json();
  if (data.error) return { error: data.error_description || data.error };

  // Fetch the authenticated user's handle
  let handle = null;
  try {
    const userResp = await fetch('https://api.twitter.com/2/users/me', {
      headers: { 'Authorization': `Bearer ${data.access_token}` },
    });
    const userData = await userResp.json();
    handle = userData.data?.username ? `@${userData.data.username}` : null;
  } catch { /* non-fatal */ }

  return {
    credentials: {
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      name: handle,
    },
    expires_in: data.expires_in, // ~7200 (2 hrs)
  };
}


// ─── GET /api/oauth/pending/:token — fetch pages for picker ───
router.get('/pending/:token', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT business_id, platform, pages_json FROM oauth_pending WHERE token = $1 AND expires_at > NOW()`,
      [req.params.token]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Token expired or not found' });
    const row = result.rows[0];
    res.json({ business_id: row.business_id, platform: row.platform, pages: JSON.parse(row.pages_json) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending OAuth' });
  }
});

// ─── POST /api/oauth/select-page — finalize page selection ───
router.post('/select-page', async (req, res) => {
  const { token, page_id } = req.body;
  if (!token || !page_id) return res.status(400).json({ error: 'token and page_id required' });

  try {
    const result = await pool.query(
      `SELECT * FROM oauth_pending WHERE token = $1 AND expires_at > NOW()`,
      [token]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Token expired or not found' });

    const { business_id, platform, pages_json, access_token } = result.rows[0];
    const pages = JSON.parse(pages_json);
    const page = pages.find(p => p.id === page_id);
    if (!page) return res.status(400).json({ error: 'Page not found' });

    // Build credentials for chosen page
    let credentials;
    if (platform === 'instagram') {
      let ig_user_id = page.ig_user_id || null;
      if (!ig_user_id) {
        const igResp = await fetch(`https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${access_token}`);
        const igData = await igResp.json();
        ig_user_id = igData.instagram_business_account?.id || null;
      }
      credentials = { access_token: page.access_token || access_token, page_id: page.id, page_name: page.name, ig_user_id };
    } else {
      credentials = { access_token, page_access_token: page.access_token, page_id: page.id, page_name: page.name };
    }

    const handle = page.name || null;
    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO platform_credentials (business_id, platform, credentials_encrypted, token_expires_at, status, handle, last_used_at)
       VALUES ($1, $2, $3, $4, 'active', $5, NOW())
       ON CONFLICT (business_id, platform) DO UPDATE SET
         credentials_encrypted = $3, token_expires_at = $4, status = 'active', handle = $5, last_used_at = NOW(), updated_at = NOW()`,
      [business_id, platform, JSON.stringify(credentials), expiresAt, handle]
    );

    // Clean up pending token
    await pool.query(`DELETE FROM oauth_pending WHERE token = $1`, [token]);

    console.log(`[oauth] ${platform} page selected (${page.name}) for business ${business_id}`);
    res.json({ success: true, platform, handle });
  } catch (err) {
    console.error('[oauth] select-page error:', err);
    res.status(500).json({ error: 'Failed to save page selection' });
  }
});

// ─── Token refresh endpoint (called by cron or manually) ───
router.post('/refresh/:platform/:businessId', async (req, res) => {
  const { platform, businessId } = req.params;

  try {
    const credResult = await pool.query(
      `SELECT credentials_encrypted FROM platform_credentials WHERE business_id = $1 AND platform = $2`,
      [businessId, platform]
    );
    if (credResult.rows.length === 0) return res.status(404).json({ error: 'No credentials found' });

    const creds = JSON.parse(credResult.rows[0].credentials_encrypted);
    const config = PLATFORM_CONFIG[platform];
    if (!config) return res.status(400).json({ error: `Unsupported platform: ${platform}` });

    const clientId = process.env[config.client_id_env];
    const clientSecret = process.env[config.client_secret_env];

    let newTokens;

    if (platform === 'instagram' || platform === 'facebook') {
      // Meta long-lived token refresh
      const refreshUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${creds.access_token}`;
      const resp = await fetch(refreshUrl);
      const data = await resp.json();
      if (data.error) return res.json({ error: data.error.message });
      newTokens = { ...creds, access_token: data.access_token };
    } else if (platform === 'linkedin' && creds.refresh_token) {
      const resp = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: creds.refresh_token,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
      const data = await resp.json();
      if (data.error) return res.json({ error: data.error_description });
      newTokens = { ...creds, access_token: data.access_token, refresh_token: data.refresh_token || creds.refresh_token };
    } else if (platform === 'tiktok' && creds.refresh_token) {
      const resp = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: creds.refresh_token,
        }),
      });
      const data = await resp.json();
      const tokenData = data.data || data;
      if (data.error || tokenData.error_code) return res.json({ error: tokenData.description || 'Refresh failed' });
      newTokens = { ...creds, access_token: tokenData.access_token, refresh_token: tokenData.refresh_token || creds.refresh_token };
    } else if (platform === 'youtube' && creds.refresh_token) {
      const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: creds.refresh_token,
        }),
      });
      const data = await resp.json();
      if (data.error) return res.json({ error: data.error_description });
      newTokens = { ...creds, access_token: data.access_token };
    } else if (platform === 'x' && creds.refresh_token) {
      const resp = await fetch('https://api.twitter.com/2/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: creds.refresh_token,
        }),
      });
      const data = await resp.json();
      if (data.error) return res.json({ error: data.error_description || data.error });
      newTokens = { ...creds, access_token: data.access_token, refresh_token: data.refresh_token || creds.refresh_token };
    } else {
      return res.json({ error: `No refresh mechanism for ${platform} or no refresh token stored` });
    }

    // Calculate new expiry
    const expiresAt = config.token_lifetime_days
      ? new Date(Date.now() + config.token_lifetime_days * 24 * 60 * 60 * 1000)
      : null;

    await pool.query(
      `UPDATE platform_credentials SET
        credentials_encrypted = $1, token_expires_at = $2, status = 'active', updated_at = NOW()
       WHERE business_id = $3 AND platform = $4`,
      [JSON.stringify(newTokens), expiresAt, businessId, platform]
    );

    res.json({ success: true, platform, expires_at: expiresAt });
  } catch (err) {
    console.error(`[oauth] Refresh error for ${platform}:`, err);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});


export default router;
