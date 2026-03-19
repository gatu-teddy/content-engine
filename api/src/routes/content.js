import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// GET /api/content?business_id=xxx&status=xxx&limit=50&offset=0
router.get('/', async (req, res) => {
  try {
    const { business_id, status, limit = 50, offset = 0 } = req.query;
    let query = 'SELECT * FROM content WHERE 1=1';
    const params = [];
    let idx = 1;

    if (business_id) { query += ` AND business_id = $${idx++}`; params.push(business_id); }
    if (status) { query += ` AND status = $${idx++}`; params.push(status); }

    query += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) FROM content WHERE 1=1';
    const countParams = [];
    let cidx = 1;
    if (business_id) { countQuery += ` AND business_id = $${cidx++}`; countParams.push(business_id); }
    if (status) { countQuery += ` AND status = $${cidx++}`; countParams.push(status); }
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      items: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('List content error:', err);
    res.status(500).json({ error: 'Failed to list content' });
  }
});

// GET /api/content/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM content WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Content not found' });

    // Also fetch publish logs
    const logs = await pool.query(
      'SELECT * FROM publish_log WHERE content_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );

    res.json({ ...result.rows[0], publish_logs: logs.rows });
  } catch (err) {
    console.error('Get content error:', err);
    res.status(500).json({ error: 'Failed to get content' });
  }
});

// POST /api/content — Create new content record (called when generation starts)
router.post('/', async (req, res) => {
  try {
    const { business_id, brief, scheduled_at } = req.body;
    if (!business_id || !brief) {
      return res.status(400).json({ error: 'business_id and brief are required' });
    }

    const result = await pool.query(
      `INSERT INTO content (business_id, brief, status, scheduled_at)
       VALUES ($1, $2, 'generating', $3) RETURNING *`,
      [business_id, brief, scheduled_at || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create content error:', err);
    res.status(500).json({ error: 'Failed to create content' });
  }
});

// PUT /api/content/:id — Update content (variants, status, image, etc.)
router.put('/:id', async (req, res) => {
  try {
    const { variants, status, image_url, image_prompt, scheduled_at } = req.body;
    const result = await pool.query(
      `UPDATE content SET
        variants = COALESCE($1, variants),
        status = COALESCE($2, status),
        image_url = COALESCE($3, image_url),
        image_prompt = COALESCE($4, image_prompt),
        scheduled_at = COALESCE($5, scheduled_at),
        published_at = CASE WHEN $2 = 'published' THEN NOW() ELSE published_at END,
        updated_at = NOW()
      WHERE id = $6 RETURNING *`,
      [
        variants ? JSON.stringify(variants) : null,
        status, image_url, image_prompt, scheduled_at,
        req.params.id
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Content not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update content error:', err);
    res.status(500).json({ error: 'Failed to update content' });
  }
});

// DELETE /api/content/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM content WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error('Delete content error:', err);
    res.status(500).json({ error: 'Failed to delete content' });
  }
});

// GET /api/content/calendar/:business_id?month=2026-03
router.get('/calendar/:business_id', async (req, res) => {
  try {
    const { business_id } = req.params;
    const { month } = req.query; // format: YYYY-MM

    let query = `
      SELECT c.*, 
        json_agg(json_build_object(
          'platform', pl.platform,
          'status', pl.status,
          'post_url', pl.post_url
        )) FILTER (WHERE pl.id IS NOT NULL) as publish_results
      FROM content c
      LEFT JOIN publish_log pl ON pl.content_id = c.id
      WHERE c.business_id = $1
        AND c.status IN ('scheduled', 'published', 'publishing')
    `;
    const params = [business_id];
    let idx = 2;

    if (month) {
      query += ` AND (
        (c.scheduled_at >= $${idx}::date AND c.scheduled_at < ($${idx}::date + interval '1 month'))
        OR (c.published_at >= $${idx}::date AND c.published_at < ($${idx}::date + interval '1 month'))
      )`;
      params.push(`${month}-01`);
      idx++;
    }

    query += ' GROUP BY c.id ORDER BY COALESCE(c.scheduled_at, c.published_at) ASC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Calendar error:', err);
    res.status(500).json({ error: 'Failed to get calendar data' });
  }
});

export default router;
