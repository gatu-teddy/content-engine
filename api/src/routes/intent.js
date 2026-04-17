import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// ═══ RATE LIMITS — FULLY USER-CONTROLLED ═══
// No hardcoded maximums. The user sets their own cap per platform per business.
// The engine enforces whatever they set. Advisory warnings shown in the dashboard.
const DEFAULT_LIMITS = { reddit: 5, x: 10 };

async function getEffectiveLimit(businessId, platform) {
  const { rows } = await pool.query(
    `SELECT intent_config FROM businesses WHERE id = $1`, [businessId]
  );
  const config = rows[0]?.intent_config || {};
  const userCap = config.dailyCap?.[platform];
  const effective = userCap !== undefined && userCap !== null ? userCap : (DEFAULT_LIMITS[platform] || 5);
  return { effective, userSet: userCap !== undefined };
}

// ═══ GET /api/intent/opportunities/:business_id ═══
// List opportunities with optional status filter
router.get('/opportunities/:business_id', async (req, res) => {
  try {
    const { business_id } = req.params;
    const { status, platform, limit } = req.query;

    let query = `SELECT * FROM intent_opportunities WHERE business_id = $1`;
    const params = [business_id];
    let idx = 2;

    if (status) {
      query += ` AND status = $${idx++}`;
      params.push(status);
    }
    if (platform) {
      query += ` AND platform = $${idx++}`;
      params.push(platform);
    }

    query += ` ORDER BY created_at DESC LIMIT $${idx}`;
    params.push(parseInt(limit) || 50);

    const { rows } = await pool.query(query, params);

    // Get today's reply counts for rate limit display
    const { rows: replyCounts } = await pool.query(
      `SELECT platform, reply_count FROM intent_reply_log
       WHERE business_id = $1 AND window_date = CURRENT_DATE`,
      [business_id]
    );

    const limits = {};
    for (const plat of ['reddit', 'x']) {
      const { effective, userSet } = await getEffectiveLimit(business_id, plat);
      const used = replyCounts.find(r => r.platform === plat)?.reply_count || 0;
      limits[plat] = { used, limit: effective, remaining: Math.max(0, effective - used), custom: userSet };
    }

    res.json({
      opportunities: rows,
      count: rows.length,
      reply_limits: limits,
    });
  } catch (err) {
    console.error('[intent] List error:', err.message);
    res.status(500).json({ error: 'Failed to fetch opportunities' });
  }
});

// ═══ POST /api/intent/opportunities ═══
// Create a new opportunity (called by n8n monitoring workflow)
router.post('/opportunities', async (req, res) => {
  try {
    const { business_id, platform, source_url, source_id, source_author,
            source_text, source_subreddit, matched_keywords, generated_reply,
            relevance_score } = req.body;

    if (!business_id || !platform || !source_id || !source_text) {
      return res.status(400).json({ error: 'Missing required fields: business_id, platform, source_id, source_text' });
    }

    const { rows } = await pool.query(
      `INSERT INTO intent_opportunities
       (business_id, platform, source_url, source_id, source_author, source_text,
        source_subreddit, matched_keywords, generated_reply, relevance_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (business_id, source_id) DO NOTHING
       RETURNING *`,
      [business_id, platform, source_url, source_id, source_author, source_text,
       source_subreddit, matched_keywords || [], generated_reply, relevance_score]
    );

    if (rows.length === 0) {
      return res.json({ created: false, message: 'Opportunity already exists' });
    }

    res.status(201).json({ created: true, opportunity: rows[0] });
  } catch (err) {
    console.error('[intent] Create error:', err.message);
    res.status(500).json({ error: 'Failed to create opportunity' });
  }
});

// ═══ PATCH /api/intent/opportunities/:id ═══
// Update status (approve, dismiss, etc.)
router.patch('/opportunities/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, generated_reply } = req.body;

    const updates = [];
    const params = [id];
    let idx = 2;

    if (status) {
      updates.push(`status = $${idx++}`);
      params.push(status);
    }
    if (generated_reply) {
      updates.push(`generated_reply = $${idx++}`);
      params.push(generated_reply);
    }
    updates.push(`updated_at = NOW()`);

    const { rows } = await pool.query(
      `UPDATE intent_opportunities SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('[intent] Update error:', err.message);
    res.status(500).json({ error: 'Failed to update opportunity' });
  }
});

// ═══ POST /api/intent/post-reply/:id ═══
// Post a reply to a platform (with rate limit enforcement)
router.post('/post-reply/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get the opportunity
    const { rows: [opp] } = await pool.query(
      `SELECT io.*, b.reddit_client_id, b.reddit_client_secret, b.reddit_username, b.reddit_password
       FROM intent_opportunities io
       JOIN businesses b ON b.id = io.business_id
       WHERE io.id = $1`,
      [id]
    );

    if (!opp) return res.status(404).json({ error: 'Opportunity not found' });
    if (opp.status === 'posted') return res.status(400).json({ error: 'Already posted' });
    if (!opp.generated_reply) return res.status(400).json({ error: 'No reply generated' });

    const platform = opp.platform;
    const { effective: limit } = await getEffectiveLimit(opp.business_id, platform);

    // Check daily rate limit
    const { rows: [log] } = await pool.query(
      `INSERT INTO intent_reply_log (business_id, platform, reply_count, window_date)
       VALUES ($1, $2, 0, CURRENT_DATE)
       ON CONFLICT (business_id, platform, window_date) DO UPDATE SET reply_count = intent_reply_log.reply_count
       RETURNING reply_count`,
      [opp.business_id, platform]
    );

    if (log.reply_count >= limit) {
      return res.status(429).json({
        error: `Daily reply limit reached for ${platform}`,
        used: log.reply_count,
        limit,
        resets: 'midnight UTC',
      });
    }

    // ─── Post the reply ───
    let replyId = null;
    let success = false;

    if (platform === 'reddit') {
      // Reddit: POST /api/comment
      // Requires Reddit OAuth for the business's Reddit account
      const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${opp.reddit_client_id}:${opp.reddit_client_secret}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'ContentEngine/1.0',
        },
        body: `grant_type=password&username=${opp.reddit_username}&password=${encodeURIComponent(opp.reddit_password)}`,
      });
      const tokenData = await tokenRes.json();

      if (tokenData.access_token) {
        const commentRes = await fetch('https://oauth.reddit.com/api/comment', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'ContentEngine/1.0',
          },
          body: `thing_id=${opp.source_id}&text=${encodeURIComponent(opp.generated_reply)}`,
        });
        const commentData = await commentRes.json();
        replyId = commentData?.json?.data?.things?.[0]?.data?.id;
        success = !commentData.json?.errors?.length;
      }
    } else if (platform === 'x') {
      // X: POST /2/tweets (reply)
      // Requires per-business X credentials from platform_credentials
      const { rows: [cred] } = await pool.query(
        `SELECT credentials_encrypted FROM platform_credentials
         WHERE business_id = $1 AND platform = 'x'`,
        [opp.business_id]
      );

      if (cred) {
        const xCreds = JSON.parse(cred.credentials_encrypted);
        // X API v2 reply — same as posting a tweet with in_reply_to_tweet_id
        // Uses OAuth 1.0a signing (same as publish workflow)
        const crypto = await import('crypto');
        const oauthParams = {
          oauth_consumer_key: xCreds.api_key,
          oauth_nonce: crypto.randomBytes(16).toString('hex'),
          oauth_signature_method: 'HMAC-SHA1',
          oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
          oauth_token: xCreds.access_token,
          oauth_version: '1.0',
        };

        const body = JSON.stringify({
          text: opp.generated_reply,
          reply: { in_reply_to_tweet_id: opp.source_id },
        });

        // Build OAuth signature
        const baseParams = Object.entries(oauthParams).sort().map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
        const baseString = `POST&${encodeURIComponent('https://api.x.com/2/tweets')}&${encodeURIComponent(baseParams)}`;
        const signingKey = `${encodeURIComponent(xCreds.api_secret)}&${encodeURIComponent(xCreds.access_token_secret)}`;
        oauthParams.oauth_signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

        const authHeader = 'OAuth ' + Object.entries(oauthParams).map(([k, v]) => `${k}="${encodeURIComponent(v)}"`).join(', ');

        const tweetRes = await fetch('https://api.x.com/2/tweets', {
          method: 'POST',
          headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
          body,
        });
        const tweetData = await tweetRes.json();
        replyId = tweetData.data?.id;
        success = !!replyId;
      }
    }

    if (success) {
      // Update opportunity status
      await pool.query(
        `UPDATE intent_opportunities SET status = 'posted', reply_id = $1, posted_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [replyId, id]
      );

      // Increment daily counter
      await pool.query(
        `UPDATE intent_reply_log SET reply_count = reply_count + 1
         WHERE business_id = $1 AND platform = $2 AND window_date = CURRENT_DATE`,
        [opp.business_id, platform]
      );

      res.json({ posted: true, reply_id: replyId, platform });
    } else {
      await pool.query(
        `UPDATE intent_opportunities SET status = 'failed', updated_at = NOW() WHERE id = $1`,
        [id]
      );
      res.status(500).json({ posted: false, error: 'Failed to post reply' });
    }
  } catch (err) {
    console.error('[intent] Post reply error:', err.message);
    res.status(500).json({ error: 'Failed to post reply' });
  }
});

// ═══ GET /api/intent/reply-limits/:business_id ═══
// Get current daily reply limits (respects per-business custom caps)
router.get('/reply-limits/:business_id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT platform, reply_count FROM intent_reply_log
       WHERE business_id = $1 AND window_date = CURRENT_DATE`,
      [req.params.business_id]
    );

    const limits = {};
    for (const plat of ['reddit', 'x']) {
      const { effective, userSet } = await getEffectiveLimit(req.params.business_id, plat);
      const used = rows.find(r => r.platform === plat)?.reply_count || 0;
      limits[plat] = { used, limit: effective, remaining: Math.max(0, effective - used), custom: userSet };
    }

    res.json(limits);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch limits' });
  }
});

// ═══ PUT /api/intent/settings/:business_id ═══
// Save intent config (keywords, platforms, dailyCap, geo, mode) to DB
router.put('/settings/:business_id', async (req, res) => {
  try {
    const { business_id } = req.params;
    const { keywords, platforms, dailyCap, geo, mode, platformAuto } = req.body;
    const intentConfig = {
      keywords: keywords || [],
      platforms: platforms || {},
      dailyCap: dailyCap || {},
      geo: geo || {},
      mode: mode || 'off',
      platformAuto: platformAuto || {},
    };
    const { rows } = await pool.query(
      `UPDATE businesses SET intent_config = $1, updated_at = NOW()
       WHERE id = $2 AND owner_id = $3 RETURNING id`,
      [JSON.stringify(intentConfig), business_id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Business not found' });
    res.json({ saved: true, intent_config: intentConfig });
  } catch (err) {
    console.error('[intent] Save settings error:', err.message);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// ═══ PUT /api/intent/credentials/:business_id ═══
// Save Reddit credentials for this business
router.put('/credentials/:business_id', async (req, res) => {
  try {
    const { business_id } = req.params;
    const { reddit_client_id, reddit_client_secret, reddit_username, reddit_password } = req.body;
    const { rows } = await pool.query(
      `UPDATE businesses SET
        reddit_client_id     = COALESCE($1, reddit_client_id),
        reddit_client_secret = COALESCE($2, reddit_client_secret),
        reddit_username      = COALESCE($3, reddit_username),
        reddit_password      = COALESCE($4, reddit_password),
        updated_at = NOW()
       WHERE id = $5 AND owner_id = $6 RETURNING id`,
      [reddit_client_id || null, reddit_client_secret || null,
       reddit_username || null, reddit_password || null,
       business_id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Business not found' });
    res.json({ saved: true });
  } catch (err) {
    console.error('[intent] Save credentials error:', err.message);
    res.status(500).json({ error: 'Failed to save credentials' });
  }
});

// ═══ POST /api/intent/scan/:business_id ═══
// On-demand Reddit scan: search for posts matching business keywords
router.post('/scan/:business_id', async (req, res) => {
  try {
    const { business_id } = req.params;
    const { rows: [biz] } = await pool.query(
      `SELECT intent_config, reddit_client_id, reddit_client_secret, reddit_username
       FROM businesses WHERE id = $1 AND owner_id = $2`,
      [business_id, req.user.id]
    );
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const config = biz.intent_config || {};
    const keywords = config.keywords || [];
    const platforms = config.platforms || {};

    if (!platforms.reddit) return res.status(400).json({ error: 'Reddit monitoring not enabled' });
    if (keywords.length === 0) return res.status(400).json({ error: 'No keywords configured' });

    const userAgent = `ContentEngine/1.0 (by /u/${biz.reddit_username || 'contentengine'})`;

    // ── Try OAuth client_credentials if we have a Reddit app ──
    // This bypasses IP-based blocking on cloud servers (Railway, etc.)
    let authHeader = null;
    if (biz.reddit_client_id && biz.reddit_client_secret) {
      try {
        const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${biz.reddit_client_id}:${biz.reddit_client_secret}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': userAgent,
          },
          body: 'grant_type=client_credentials',
        });
        const tokenData = await tokenRes.json();
        if (tokenData.access_token) {
          authHeader = `Bearer ${tokenData.access_token}`;
          console.log('[intent] Using Reddit OAuth token for scan');
        } else {
          console.error('[intent] Reddit token error:', JSON.stringify(tokenData));
        }
      } catch (tokenErr) {
        console.error('[intent] Reddit OAuth error:', tokenErr.message);
      }
    }

    const baseUrl = authHeader ? 'https://oauth.reddit.com' : 'https://www.reddit.com';
    const stored = [];
    const errors = [];

    for (const keyword of keywords.slice(0, 5)) {
      try {
        const url = `${baseUrl}/search.json?q=${encodeURIComponent(keyword)}&sort=new&limit=25&t=month`;
        const headers = { 'User-Agent': userAgent };
        if (authHeader) headers['Authorization'] = authHeader;

        const r = await fetch(url, { headers });
        if (!r.ok) {
          const errText = await r.text();
          console.error('[intent] Reddit search failed:', r.status, keyword, errText.slice(0, 200));
          errors.push(`${keyword}: HTTP ${r.status}`);
          continue;
        }
        const data = await r.json();
        const posts = data?.data?.children || [];
        console.log(`[intent] "${keyword}" → ${posts.length} posts`);

        for (const { data: p } of posts) {
          if (!p.id) continue;
          const sourceId = 't3_' + p.id;
          const sourceText = (p.title + (p.selftext ? '\n\n' + p.selftext : '')).slice(0, 1000);
          const textLower = sourceText.toLowerCase();
          const matched = keywords.filter(kw => textLower.includes(kw.toLowerCase()));
          if (matched.length === 0) continue;

          const { rows } = await pool.query(
            `INSERT INTO intent_opportunities
             (business_id, platform, source_url, source_id, source_author,
              source_text, source_subreddit, matched_keywords, relevance_score, status)
             VALUES ($1, 'reddit', $2, $3, $4, $5, $6, $7, $8, 'queued')
             ON CONFLICT (business_id, source_id) DO NOTHING RETURNING *`,
            [business_id, `https://reddit.com${p.permalink}`, sourceId, p.author,
             sourceText, p.subreddit_name_prefixed, matched, matched.length >= 2 ? 0.85 : 0.65]
          );
          if (rows.length > 0) stored.push(rows[0]);
        }
      } catch (kwErr) {
        console.error('[intent] Keyword scan error:', keyword, kwErr.message);
        errors.push(`${keyword}: ${kwErr.message}`);
      }
    }

    const msg = stored.length > 0
      ? `Scan complete: ${stored.length} new opportunities found.`
      : errors.length > 0
        ? `Scan ran but hit errors: ${errors.join('; ')}. Add Reddit credentials in Settings to fix this.`
        : authHeader
          ? `Scan complete: 0 new posts matched your keywords. Try broader terms.`
          : `0 found. Reddit blocks unauthenticated requests from servers — add your Reddit app credentials in Settings to enable scanning.`;

    res.json({ scanned: keywords.length, stored: stored.length, opportunities: stored, errors, message: msg });
  } catch (err) {
    console.error('[intent] Scan error:', err.message);
    res.status(500).json({ error: 'Scan failed: ' + err.message });
  }
});

// ═══ POST /api/intent/generate-reply/:id ═══
// Use Claude to generate a reply for a specific opportunity
router.post('/generate-reply/:id', async (req, res) => {
  try {
    const { rows: [opp] } = await pool.query(
      `SELECT io.*, b.brand_voice, b.display_name
       FROM intent_opportunities io
       JOIN businesses b ON b.id = io.business_id
       WHERE io.id = $1`,
      [req.params.id]
    );
    if (!opp) return res.status(404).json({ error: 'Opportunity not found' });

    const prompt = `You are a social media manager for "${opp.display_name}".
Brand voice: ${opp.brand_voice || 'Professional, helpful and authentic.'}

A ${opp.platform === 'reddit' ? `Reddit post in ${opp.source_subreddit}` : 'tweet'} was found relevant to this business:

Author: u/${opp.source_author}
Post: "${opp.source_text}"

Write a genuine, helpful reply that adds real value. Subtly associate with the business if natural — never be spammy or pushy.
Keep it 2-4 sentences. No hashtags. Sound like a real person.
Reply ONLY with the reply text.`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const aiData = await aiRes.json();
    const reply = aiData.content?.[0]?.text?.trim();
    if (!reply) return res.status(500).json({ error: 'Claude returned no reply' });

    const { rows } = await pool.query(
      `UPDATE intent_opportunities SET generated_reply = $1, status = 'pending', updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [reply, req.params.id]
    );
    res.json({ generated: true, opportunity: rows[0] });
  } catch (err) {
    console.error('[intent] Generate reply error:', err.message);
    res.status(500).json({ error: 'Failed to generate reply' });
  }
});

export default router;
