import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════
// ALEX INTEGRATION ENDPOINTS
// These are the API endpoints Alex calls via tool use.
// Same JWT auth as the dashboard.
// Base path: /api/v1/alex/...
// ═══════════════════════════════════════════════════════════════


// ─── HELPER: resolve business by name or ID ───
async function resolveBusiness(identifier, userId) {
  if (!identifier) return null;

  // Try UUID first
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(identifier)) {
    const r = await pool.query('SELECT * FROM businesses WHERE id = $1 AND owner_id = $2', [identifier, userId]);
    return r.rows[0] || null;
  }

  // Fuzzy match by name (case-insensitive, partial)
  const r = await pool.query(
    `SELECT * FROM businesses WHERE owner_id = $1 AND LOWER(display_name) LIKE LOWER($2) ORDER BY display_name LIMIT 1`,
    [userId, `%${identifier}%`]
  );
  return r.rows[0] || null;
}


// ═══════════════════════════════════════════════════════════════
// 1. STATUS — Get current status of all or one business
// Tool: content_engine_status
// ═══════════════════════════════════════════════════════════════
router.get('/status', async (req, res) => {
  try {
    const { business_name } = req.query;

    let businesses;
    if (business_name) {
      const biz = await resolveBusiness(business_name, req.user.id);
      if (!biz) return res.status(404).json({ error: `Business "${business_name}" not found` });
      businesses = [biz];
    } else {
      const r = await pool.query('SELECT * FROM businesses WHERE owner_id = $1 ORDER BY display_name', [req.user.id]);
      businesses = r.rows;
    }

    const results = [];
    for (const biz of businesses) {
      // Get content counts
      const counts = await pool.query(
        `SELECT status, COUNT(*)::int as count FROM content WHERE business_id = $1 GROUP BY status`,
        [biz.id]
      );
      const statusCounts = {};
      counts.rows.forEach(r => { statusCounts[r.status] = r.count; });

      // Get credential health
      const creds = await pool.query(
        `SELECT platform, status, token_expires_at FROM platform_credentials WHERE business_id = $1`,
        [biz.id]
      );
      const connections = creds.rows.map(c => ({
        platform: c.platform,
        status: c.status,
        expires_at: c.token_expires_at,
        days_until_expiry: c.token_expires_at
          ? Math.ceil((new Date(c.token_expires_at) - new Date()) / (1000 * 60 * 60 * 24))
          : null,
      }));
      const warnings = connections.filter(c => c.days_until_expiry !== null && c.days_until_expiry <= 7);

      results.push({
        id: biz.id,
        name: biz.display_name,
        automation_mode: biz.automation_mode || 'manual',
        cadence: biz.cadence || {},
        platforms: biz.enabled_platforms || [],
        content: {
          published: statusCounts.published || 0,
          scheduled: statusCounts.scheduled || 0,
          pending_review: statusCounts.pending_review || 0,
          generating: statusCounts.generating || 0,
        },
        connections,
        warnings: warnings.length > 0 ? warnings : undefined,
      });
    }

    res.json(business_name ? results[0] : { businesses: results, count: results.length });
  } catch (err) {
    console.error('Alex status error:', err);
    res.status(500).json({ error: 'Failed to get status' });
  }
});


// ═══════════════════════════════════════════════════════════════
// 2. PAUSE — Pause content generation
// Tool: content_engine_pause
// Supports: global, per-business, per-platform
// ═══════════════════════════════════════════════════════════════
router.post('/pause', async (req, res) => {
  try {
    const { business_name, platform, reason } = req.body;

    // Global pause (all businesses)
    if (!business_name) {
      const r = await pool.query(
        `UPDATE businesses SET
          previous_automation_mode = automation_mode,
          automation_mode = 'manual',
          updated_at = NOW()
        WHERE owner_id = $1 AND automation_mode != 'manual'
        RETURNING id, display_name, previous_automation_mode`,
        [req.user.id]
      );

      return res.json({
        action: 'global_pause',
        paused: r.rows.length,
        businesses: r.rows.map(b => ({
          id: b.id,
          name: b.display_name,
          previous_mode: b.previous_automation_mode,
        })),
        reason: reason || null,
      });
    }

    // Per-business pause
    const biz = await resolveBusiness(business_name, req.user.id);
    if (!biz) return res.status(404).json({ error: `Business "${business_name}" not found` });

    // If platform specified, turn off that platform's cadence
    if (platform) {
      const cadence = biz.cadence || {};
      const previousCadence = cadence[platform];
      cadence[platform] = 'off';

      await pool.query(
        `UPDATE businesses SET cadence = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(cadence), biz.id]
      );

      return res.json({
        action: 'platform_pause',
        business: biz.display_name,
        platform,
        previous_cadence: previousCadence || 'off',
        cadence,
      });
    }

    // Pause entire business
    await pool.query(
      `UPDATE businesses SET
        previous_automation_mode = automation_mode,
        automation_mode = 'manual',
        updated_at = NOW()
      WHERE id = $1`,
      [biz.id]
    );

    return res.json({
      action: 'business_pause',
      id: biz.id,
      name: biz.display_name,
      previous_mode: biz.automation_mode,
      mode: 'manual',
    });
  } catch (err) {
    console.error('Alex pause error:', err);
    res.status(500).json({ error: 'Failed to pause' });
  }
});


// ═══════════════════════════════════════════════════════════════
// 3. RESUME — Resume content generation
// Tool: content_engine_resume
// Restores previous automation mode
// ═══════════════════════════════════════════════════════════════
router.post('/resume', async (req, res) => {
  try {
    const { business_name, platform } = req.body;

    // Global resume
    if (!business_name) {
      const r = await pool.query(
        `UPDATE businesses SET
          automation_mode = COALESCE(previous_automation_mode, 'semi_auto'),
          previous_automation_mode = NULL,
          updated_at = NOW()
        WHERE owner_id = $1 AND previous_automation_mode IS NOT NULL
        RETURNING id, display_name, automation_mode`,
        [req.user.id]
      );

      return res.json({
        action: 'global_resume',
        resumed: r.rows.length,
        businesses: r.rows.map(b => ({
          id: b.id,
          name: b.display_name,
          mode: b.automation_mode,
        })),
      });
    }

    // Per-business resume
    const biz = await resolveBusiness(business_name, req.user.id);
    if (!biz) return res.status(404).json({ error: `Business "${business_name}" not found` });

    // If platform specified, Alex needs to say what cadence to set
    // For now, restore to 'daily' as default if it was 'off'
    if (platform) {
      const cadence = biz.cadence || {};
      cadence[platform] = cadence[platform] === 'off' ? 'daily' : cadence[platform];

      await pool.query(
        `UPDATE businesses SET cadence = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(cadence), biz.id]
      );

      return res.json({
        action: 'platform_resume',
        business: biz.display_name,
        platform,
        cadence,
      });
    }

    // Resume entire business
    const restoredMode = biz.previous_automation_mode || 'semi_auto';
    await pool.query(
      `UPDATE businesses SET
        automation_mode = $1,
        previous_automation_mode = NULL,
        updated_at = NOW()
      WHERE id = $2`,
      [restoredMode, biz.id]
    );

    return res.json({
      action: 'business_resume',
      id: biz.id,
      name: biz.display_name,
      mode: restoredMode,
    });
  } catch (err) {
    console.error('Alex resume error:', err);
    res.status(500).json({ error: 'Failed to resume' });
  }
});


// ═══════════════════════════════════════════════════════════════
// 4. CADENCE — Change posting frequency
// Tool: content_engine_cadence
// ═══════════════════════════════════════════════════════════════
const VALID_CADENCES = ['3x_daily', '2x_daily', 'daily', '5x_week', '3x_week', '2x_week', 'weekly', 'off'];

router.patch('/cadence', async (req, res) => {
  try {
    const { business_name, platform, cadence: newCadence } = req.body;

    if (!business_name) return res.status(400).json({ error: 'business_name is required' });
    if (!platform) return res.status(400).json({ error: 'platform is required' });
    if (!newCadence || !VALID_CADENCES.includes(newCadence)) {
      return res.status(400).json({ error: `Invalid cadence. Options: ${VALID_CADENCES.join(', ')}` });
    }

    const biz = await resolveBusiness(business_name, req.user.id);
    if (!biz) return res.status(404).json({ error: `Business "${business_name}" not found` });

    const cadence = biz.cadence || {};
    const previousCadence = cadence[platform] || 'off';
    cadence[platform] = newCadence;

    await pool.query(
      `UPDATE businesses SET cadence = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(cadence), biz.id]
    );

    // Calculate weekly posts
    const CADENCE_POSTS = { '3x_daily': 21, '2x_daily': 14, 'daily': 7, '5x_week': 5, '3x_week': 3, '2x_week': 2, 'weekly': 1, 'off': 0 };
    const weeklyPosts = Object.values(cadence).reduce((sum, c) => sum + (CADENCE_POSTS[c] || 0), 0);

    res.json({
      id: biz.id,
      name: biz.display_name,
      platform,
      previous_cadence: previousCadence,
      cadence: newCadence,
      all_cadences: cadence,
      weekly_posts: weeklyPosts,
    });
  } catch (err) {
    console.error('Alex cadence error:', err);
    res.status(500).json({ error: 'Failed to update cadence' });
  }
});


// ═══════════════════════════════════════════════════════════════
// 5. APPROVE — Approve pending content
// Tool: content_engine_approve
// ═══════════════════════════════════════════════════════════════
router.post('/approve', async (req, res) => {
  try {
    const { content_id, business_name } = req.body;

    // Approve specific content
    if (content_id) {
      const r = await pool.query(
        `UPDATE content SET status = 'scheduled', updated_at = NOW()
         WHERE id = $1 AND status = 'pending_review' RETURNING id, brief`,
        [content_id]
      );
      if (r.rows.length === 0) return res.status(404).json({ error: 'Content not found or not pending' });
      return res.json({ approved: 1, content: [{ id: r.rows[0].id, brief: r.rows[0].brief }] });
    }

    // Approve all pending for a business (or all businesses)
    let query = `UPDATE content SET status = 'scheduled', updated_at = NOW() WHERE status = 'pending_review'`;
    const params = [];

    if (business_name) {
      const biz = await resolveBusiness(business_name, req.user.id);
      if (!biz) return res.status(404).json({ error: `Business "${business_name}" not found` });
      query += ` AND business_id = $1`;
      params.push(biz.id);
    }

    query += ` RETURNING id, brief, business_id`;
    const r = await pool.query(query, params);

    res.json({
      approved: r.rows.length,
      content: r.rows.map(c => ({ id: c.id, brief: c.brief?.substring(0, 80) })),
    });
  } catch (err) {
    console.error('Alex approve error:', err);
    res.status(500).json({ error: 'Failed to approve content' });
  }
});


// ═══════════════════════════════════════════════════════════════
// 6. ANALYTICS — Performance data
// Tool: content_engine_analytics
// ═══════════════════════════════════════════════════════════════
router.get('/analytics', async (req, res) => {
  try {
    const { business_name, period = 'week' } = req.query;

    // Determine date range
    const now = new Date();
    let periodStart;
    switch (period) {
      case 'day':
        periodStart = new Date(now); periodStart.setDate(now.getDate() - 1); break;
      case 'month':
        periodStart = new Date(now); periodStart.setMonth(now.getMonth() - 1); break;
      default: // week
        periodStart = new Date(now); periodStart.setDate(now.getDate() - 7);
    }

    // Build business filter
    let bizFilter = '';
    const params = [req.user.id, periodStart.toISOString()];
    if (business_name) {
      const biz = await resolveBusiness(business_name, req.user.id);
      if (!biz) return res.status(404).json({ error: `Business "${business_name}" not found` });
      bizFilter = `AND c.business_id = $3`;
      params.push(biz.id);
    }

    // Posts published in period
    const published = await pool.query(
      `SELECT c.id, c.brief, c.published_at, c.template_id, b.display_name as business_name
       FROM content c
       JOIN businesses b ON b.id = c.business_id
       WHERE b.owner_id = $1 AND c.status = 'published' AND c.published_at >= $2 ${bizFilter}
       ORDER BY c.published_at DESC`,
      params
    );

    // Publish log breakdown by platform
    const platformBreakdown = await pool.query(
      `SELECT pl.platform, pl.status, COUNT(*)::int as count
       FROM publish_log pl
       JOIN content c ON c.id = pl.content_id
       JOIN businesses b ON b.id = c.business_id
       WHERE b.owner_id = $1 AND pl.created_at >= $2 ${bizFilter.replace('c.business_id', 'pl.business_id')}
       GROUP BY pl.platform, pl.status`,
      params
    );

    // Pending content
    const pending = await pool.query(
      `SELECT COUNT(*)::int as count FROM content c
       JOIN businesses b ON b.id = c.business_id
       WHERE b.owner_id = $1 AND c.status = 'pending_review' ${bizFilter}`,
      [req.user.id, ...(business_name ? [params[2]] : [])]
    );

    // Token warnings
    const tokenWarnings = await pool.query(
      `SELECT pc.platform, pc.token_expires_at, b.display_name as business_name, b.id as business_id
       FROM platform_credentials pc
       JOIN businesses b ON b.id = pc.business_id
       WHERE b.owner_id = $1 AND pc.token_expires_at IS NOT NULL
         AND pc.token_expires_at <= NOW() + INTERVAL '7 days'
         AND pc.status != 'revoked'
       ORDER BY pc.token_expires_at ASC`,
      [req.user.id]
    );

    // Platform stats
    const platforms = {};
    platformBreakdown.rows.forEach(r => {
      if (!platforms[r.platform]) platforms[r.platform] = { success: 0, failed: 0 };
      if (r.status === 'success') platforms[r.platform].success = r.count;
      if (r.status === 'failed') platforms[r.platform].failed = r.count;
    });

    res.json({
      period: `${periodStart.toISOString().split('T')[0]} to ${now.toISOString().split('T')[0]}`,
      posts_published: published.rows.length,
      pending_review: pending.rows[0]?.count || 0,
      platforms,
      token_warnings: tokenWarnings.rows.map(t => ({
        business: t.business_name,
        business_id: t.business_id,
        platform: t.platform,
        expires_at: t.token_expires_at,
        days_until_expiry: Math.ceil((new Date(t.token_expires_at) - now) / (1000 * 60 * 60 * 24)),
      })),
      recent_posts: published.rows.slice(0, 10).map(p => ({
        id: p.id,
        brief: p.brief?.substring(0, 100),
        business: p.business_name,
        published_at: p.published_at,
      })),
    });
  } catch (err) {
    console.error('Alex analytics error:', err);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});


// ═══════════════════════════════════════════════════════════════
// 7. RECONNECT — Generate OAuth reconnection URL
// Tool: content_engine_reconnect
// ═══════════════════════════════════════════════════════════════
const OAUTH_URLS = {
  instagram: 'https://www.facebook.com/v21.0/dialog/oauth?client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&scope=instagram_basic,instagram_content_publish,instagram_manage_insights&response_type=code',
  facebook: 'https://www.facebook.com/v21.0/dialog/oauth?client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&scope=pages_manage_posts,pages_read_engagement,pages_show_list&response_type=code',
  linkedin: 'https://www.linkedin.com/oauth/v2/authorization?client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&scope=openid%20profile%20w_member_social&response_type=code',
  tiktok: 'https://www.tiktok.com/v2/auth/authorize/?client_key={CLIENT_ID}&redirect_uri={REDIRECT_URI}&scope=user.info.basic,video.publish&response_type=code',
  youtube: 'https://accounts.google.com/o/oauth2/v2/auth?client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&scope=https://www.googleapis.com/auth/youtube.upload&response_type=code&access_type=offline',
  // X/Twitter uses OAuth 1.0a — no expiry, no reconnect needed
};

router.post('/reconnect', async (req, res) => {
  try {
    const { business_name, platform } = req.body;

    if (!business_name) return res.status(400).json({ error: 'business_name is required' });
    if (!platform) return res.status(400).json({ error: 'platform is required' });

    const biz = await resolveBusiness(business_name, req.user.id);
    if (!biz) return res.status(404).json({ error: `Business "${business_name}" not found` });

    if (platform === 'x') {
      return res.json({
        platform: 'x',
        message: 'X/Twitter uses OAuth 1.0a tokens that do not expire. No reconnection needed.',
      });
    }

    const templateUrl = OAUTH_URLS[platform];
    if (!templateUrl) {
      return res.status(400).json({ error: `Unsupported platform: ${platform}` });
    }

    // Build OAuth URL with env vars
    // Instagram uses the Facebook app (same Meta developer portal)
    const CLIENT_ID_MAP = { instagram: 'FACEBOOK_CLIENT_ID', facebook: 'FACEBOOK_CLIENT_ID', linkedin: 'LINKEDIN_CLIENT_ID', tiktok: 'TIKTOK_CLIENT_ID', youtube: 'YOUTUBE_CLIENT_ID' };
    const clientId = process.env[CLIENT_ID_MAP[platform]] || process.env[`${platform.toUpperCase()}_CLIENT_ID`] || 'NOT_CONFIGURED';
    const redirectUri = encodeURIComponent(
      `${process.env.API_BASE_URL || 'https://engine.yourdomain.com'}/api/oauth/callback/${platform}/${biz.id}`
    );

    const oauthUrl = templateUrl
      .replace('{CLIENT_ID}', clientId)
      .replace('{REDIRECT_URI}', redirectUri);

    // Update credential status to show reconnection in progress
    await pool.query(
      `UPDATE platform_credentials SET status = 'expired', updated_at = NOW()
       WHERE business_id = $1 AND platform = $2`,
      [biz.id, platform]
    );

    res.json({
      platform,
      business: biz.display_name,
      oauth_url: oauthUrl,
      expires_in: 600, // URL valid for 10 minutes
      message: `Tap the link to reconnect ${platform}. After authenticating, the engine will update automatically.`,
    });
  } catch (err) {
    console.error('Alex reconnect error:', err);
    res.status(500).json({ error: 'Failed to generate reconnect URL' });
  }
});


export default router;
