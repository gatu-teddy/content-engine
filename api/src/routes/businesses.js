import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// GET /api/businesses — List all businesses for user
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, 
        (SELECT COUNT(*) FROM content c WHERE c.business_id = b.id AND c.status = 'published') as published_count,
        (SELECT COUNT(*) FROM content c WHERE c.business_id = b.id AND c.status = 'scheduled') as scheduled_count,
        (SELECT COUNT(*) FROM content c WHERE c.business_id = b.id AND c.status = 'pending_review') as pending_count,
        (SELECT COUNT(*) FROM context_documents cd WHERE cd.business_id = b.id) as document_count,
        (SELECT COUNT(*) FROM reference_images ri WHERE ri.business_id = b.id) as image_count
      FROM businesses b WHERE b.owner_id = $1 ORDER BY b.display_name`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List businesses error:', err);
    res.status(500).json({ error: 'Failed to list businesses' });
  }
});

// GET /api/businesses/:id — Get single business
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM businesses WHERE id = $1 AND owner_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Business not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get business error:', err);
    res.status(500).json({ error: 'Failed to get business' });
  }
});

// POST /api/businesses — Create business
router.post('/', async (req, res) => {
  try {
    const { display_name, slug, brand_voice, enabled_platforms, default_timezone } = req.body;
    if (!display_name || !slug) {
      return res.status(400).json({ error: 'display_name and slug are required' });
    }

    const result = await pool.query(
      `INSERT INTO businesses (owner_id, display_name, slug, brand_voice, enabled_platforms, default_timezone)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.id, display_name, slug, brand_voice || '', enabled_platforms || [], default_timezone || 'Asia/Dubai']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Slug already exists' });
    console.error('Create business error:', err);
    res.status(500).json({ error: 'Failed to create business' });
  }
});

// PUT /api/businesses/:id — Update business
router.put('/:id', async (req, res) => {
  try {
    const { display_name, brand_voice, brand_summary, enabled_platforms, default_timezone, default_post_times } = req.body;
    const result = await pool.query(
      `UPDATE businesses SET
        display_name = COALESCE($1, display_name),
        brand_voice = COALESCE($2, brand_voice),
        brand_summary = COALESCE($3, brand_summary),
        enabled_platforms = COALESCE($4, enabled_platforms),
        default_timezone = COALESCE($5, default_timezone),
        default_post_times = COALESCE($6, default_post_times),
        updated_at = NOW()
      WHERE id = $7 AND owner_id = $8 RETURNING *`,
      [display_name, brand_voice, brand_summary, enabled_platforms, default_timezone, default_post_times, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Business not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update business error:', err);
    res.status(500).json({ error: 'Failed to update business' });
  }
});

// DELETE /api/businesses/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM businesses WHERE id = $1 AND owner_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Business not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('Delete business error:', err);
    res.status(500).json({ error: 'Failed to delete business' });
  }
});

// ─── Platform Credentials ───

// GET /api/businesses/:id/credentials — List platform credentials (metadata only, not secrets)
router.get('/:id/credentials', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, platform, status, token_expires_at, handle, last_used_at, created_at
       FROM platform_credentials WHERE business_id = $1`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List credentials error:', err);
    res.status(500).json({ error: 'Failed to list credentials' });
  }
});

// PUT /api/businesses/:id/credentials/:platform — Set/update platform credentials
router.put('/:id/credentials/:platform', async (req, res) => {
  try {
    const { credentials, token_expires_at } = req.body;
    // In production, encrypt credentials before storage
    const encrypted = JSON.stringify(credentials);

    const result = await pool.query(
      `INSERT INTO platform_credentials (business_id, platform, credentials_encrypted, token_expires_at, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT (business_id, platform) DO UPDATE SET
         credentials_encrypted = $3,
         token_expires_at = $4,
         status = 'active',
         updated_at = NOW()
       RETURNING id, platform, status, token_expires_at`,
      [req.params.id, req.params.platform, encrypted, token_expires_at || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update credentials error:', err);
    res.status(500).json({ error: 'Failed to update credentials' });
  }
});

// GET /api/businesses/:id/oauth-url/:platform — Generate OAuth authorization URL
router.get('/:id/oauth-url/:platform', async (req, res) => {
  const { id, platform } = req.params;
  try {
    const bizResult = await pool.query('SELECT id FROM businesses WHERE id = $1 AND owner_id = $2', [id, req.user.id]);
    if (bizResult.rows.length === 0) return res.status(404).json({ error: 'Business not found' });

    const OAUTH_URLS = {
      instagram: 'https://www.facebook.com/v21.0/dialog/oauth?client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&scope=instagram_basic,instagram_content_publish,pages_read_engagement,pages_show_list,business_management&response_type=code',
      facebook: 'https://www.facebook.com/v21.0/dialog/oauth?client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&scope=pages_manage_posts,pages_read_engagement,pages_show_list&response_type=code',
      linkedin: 'https://www.linkedin.com/oauth/v2/authorization?client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&scope=openid%20profile%20w_member_social&response_type=code',
      tiktok: 'https://www.tiktok.com/v2/auth/authorize/?client_key={CLIENT_ID}&redirect_uri={REDIRECT_URI}&scope=user.info.basic,video.publish&response_type=code',
      youtube: 'https://accounts.google.com/o/oauth2/v2/auth?client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&scope=https://www.googleapis.com/auth/youtube.upload&response_type=code&access_type=offline',
    };

    const templateUrl = OAUTH_URLS[platform];
    if (!templateUrl) return res.status(400).json({ error: `Unsupported platform: ${platform}` });

    const CLIENT_ID_MAP = { instagram: 'FACEBOOK_CLIENT_ID', facebook: 'FACEBOOK_CLIENT_ID', linkedin: 'LINKEDIN_CLIENT_ID', tiktok: 'TIKTOK_CLIENT_ID', youtube: 'YOUTUBE_CLIENT_ID' };
    const clientId = process.env[CLIENT_ID_MAP[platform]] || process.env[`${platform.toUpperCase()}_CLIENT_ID`] || 'NOT_CONFIGURED';
    const base = process.env.API_BASE_URL || 'https://engine.yourdomain.com';
    const redirectUri = encodeURIComponent(`${base}/api/oauth/callback/${platform}/${id}`);
    const url = templateUrl.replace('{CLIENT_ID}', clientId).replace('{REDIRECT_URI}', redirectUri);

    res.json({ url, platform, business_id: id });
  } catch (err) {
    console.error('OAuth URL error:', err);
    res.status(500).json({ error: 'Failed to generate OAuth URL' });
  }
});

// DELETE /api/businesses/:id/credentials/:platform
router.delete('/:id/credentials/:platform', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM platform_credentials WHERE business_id = $1 AND platform = $2',
      [req.params.id, req.params.platform]
    );
    res.json({ deleted: true });
  } catch (err) {
    console.error('Delete credentials error:', err);
    res.status(500).json({ error: 'Failed to delete credentials' });
  }
});

// ─── Context Documents ───

// GET /api/businesses/:id/documents
router.get('/:id/documents', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM context_documents WHERE business_id = $1 ORDER BY uploaded_at DESC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List documents error:', err);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

// DELETE /api/businesses/:id/documents/:docId
router.delete('/:id/documents/:docId', async (req, res) => {
  try {
    // TODO: Also delete from S3/R2
    await pool.query(
      'DELETE FROM context_documents WHERE id = $1 AND business_id = $2',
      [req.params.docId, req.params.id]
    );
    res.json({ deleted: true });
  } catch (err) {
    console.error('Delete document error:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// ─── Reference Images ───

// GET /api/businesses/:id/images
router.get('/:id/images', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM reference_images WHERE business_id = $1 ORDER BY uploaded_at DESC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List images error:', err);
    res.status(500).json({ error: 'Failed to list images' });
  }
});

// PUT /api/businesses/:id/images/:imgId — Update image label
router.put('/:id/images/:imgId', async (req, res) => {
  try {
    const { label } = req.body;
    const result = await pool.query(
      'UPDATE reference_images SET label = $1 WHERE id = $2 AND business_id = $3 RETURNING *',
      [label, req.params.imgId, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Image not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update image error:', err);
    res.status(500).json({ error: 'Failed to update image' });
  }
});

// DELETE /api/businesses/:id/images/:imgId
router.delete('/:id/images/:imgId', async (req, res) => {
  try {
    // TODO: Also delete from S3/R2
    await pool.query(
      'DELETE FROM reference_images WHERE id = $1 AND business_id = $2',
      [req.params.imgId, req.params.id]
    );
    res.json({ deleted: true });
  } catch (err) {
    console.error('Delete image error:', err);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

export default router;
