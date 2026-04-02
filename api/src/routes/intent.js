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

export default router;
