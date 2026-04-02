import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// ═══ GET /api/engagement/:business_id ═══
// Get engagement summary for a business
router.get('/:business_id', async (req, res) => {
  try {
    const { period } = req.query;  // 'week', 'month', 'all'
    const days = period === 'month' ? 30 : period === 'all' ? 365 : 7;

    const { rows } = await pool.query(
      `SELECT em.*, c.brief, c.status AS content_status
       FROM engagement_metrics em
       JOIN content c ON c.id = em.content_id
       WHERE c.business_id = $1 AND em.fetched_at > NOW() - INTERVAL '1 day' * $2
       ORDER BY em.fetched_at DESC`,
      [req.params.business_id, days]
    );

    // Aggregate per platform
    const platforms = {};
    for (const row of rows) {
      if (!platforms[row.platform]) {
        platforms[row.platform] = { impressions: 0, likes: 0, comments: 0, shares: 0, saves: 0, posts: 0 };
      }
      const p = platforms[row.platform];
      p.impressions += row.impressions || 0;
      p.likes += row.likes || 0;
      p.comments += row.comments || 0;
      p.shares += row.shares || 0;
      p.saves += row.saves || 0;
      p.posts += 1;
    }

    // Calculate overall engagement rate
    const totalImpressions = Object.values(platforms).reduce((s, p) => s + p.impressions, 0);
    const totalEngagements = Object.values(platforms).reduce((s, p) => s + p.likes + p.comments + p.shares, 0);
    const overallRate = totalImpressions > 0 ? ((totalEngagements / totalImpressions) * 100).toFixed(2) : 0;

    // Top performing posts
    const { rows: topPosts } = await pool.query(
      `SELECT em.*, c.brief
       FROM engagement_metrics em
       JOIN content c ON c.id = em.content_id
       WHERE c.business_id = $1 AND em.fetched_at > NOW() - INTERVAL '1 day' * $2
       ORDER BY em.engagement_rate DESC NULLS LAST
       LIMIT 5`,
      [req.params.business_id, days]
    );

    res.json({
      period,
      platforms,
      overall: {
        impressions: totalImpressions,
        engagements: totalEngagements,
        engagement_rate: parseFloat(overallRate),
        posts_tracked: rows.length,
      },
      top_posts: topPosts,
    });
  } catch (err) {
    console.error('[engagement] Summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch engagement data' });
  }
});

// ═══ POST /api/engagement/snapshot ═══
// Store a new engagement snapshot (called by n8n polling workflow)
router.post('/snapshot', async (req, res) => {
  try {
    const { content_id, platform, platform_post_id,
            impressions, reach, likes, comments, shares, saves, clicks } = req.body;

    if (!content_id || !platform) {
      return res.status(400).json({ error: 'Missing: content_id, platform' });
    }

    const imp = impressions || 0;
    const eng = (likes || 0) + (comments || 0) + (shares || 0);
    const rate = imp > 0 ? ((eng / imp) * 100) : 0;

    const { rows } = await pool.query(
      `INSERT INTO engagement_metrics
       (content_id, platform, platform_post_id, impressions, reach, likes, comments, shares, saves, clicks, engagement_rate)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [content_id, platform, platform_post_id, impressions || 0, reach || 0,
       likes || 0, comments || 0, shares || 0, saves || 0, clicks || 0, rate.toFixed(2)]
    );

    // Update template performance_score if content has a template
    await pool.query(
      `UPDATE content_templates SET performance_score = (
        SELECT COALESCE(AVG(em.engagement_rate), performance_score)
        FROM content c
        JOIN engagement_metrics em ON em.content_id = c.id
        WHERE c.template_id = content_templates.id
          AND em.fetched_at > NOW() - INTERVAL '30 days'
       )
       WHERE id = (SELECT template_id FROM content WHERE id = $1 AND template_id IS NOT NULL)`,
      [content_id]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[engagement] Snapshot error:', err.message);
    res.status(500).json({ error: 'Failed to store snapshot' });
  }
});

// ═══ GET /api/engagement/content/:content_id ═══
// Get engagement history for a specific content piece
router.get('/content/:content_id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM engagement_metrics WHERE content_id = $1 ORDER BY fetched_at DESC`,
      [req.params.content_id]
    );
    res.json({ snapshots: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch content engagement' });
  }
});

export default router;
