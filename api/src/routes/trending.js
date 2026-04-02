import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// ═══ GET /api/trending/:business_id ═══
router.get('/:business_id', async (req, res) => {
  try {
    const { status } = req.query;
    let query = `SELECT * FROM trending_topics WHERE business_id = $1 AND expires_at > NOW()`;
    const params = [req.params.business_id];

    if (status) {
      query += ` AND status = $2`;
      params.push(status);
    }

    query += ` ORDER BY relevance_score DESC NULLS LAST, detected_at DESC LIMIT 30`;

    const { rows } = await pool.query(query, params);
    res.json({ topics: rows, count: rows.length });
  } catch (err) {
    console.error('[trending] List error:', err.message);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

// ═══ POST /api/trending ═══
// Create a trend (called by n8n trend scanning workflow)
router.post('/', async (req, res) => {
  try {
    const { business_id, topic, source, source_detail, relevance_score } = req.body;

    if (!business_id || !topic || !source) {
      return res.status(400).json({ error: 'Missing: business_id, topic, source' });
    }

    const { rows } = await pool.query(
      `INSERT INTO trending_topics (business_id, topic, source, source_detail, relevance_score)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [business_id, topic, source, source_detail, relevance_score]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[trending] Create error:', err.message);
    res.status(500).json({ error: 'Failed to create trend' });
  }
});

// ═══ PATCH /api/trending/:id ═══
// Update trend status (queue for content, dismiss, mark used)
router.patch('/:id', async (req, res) => {
  try {
    const { status, content_id } = req.body;
    const updates = ['updated_at = NOW()'];
    const params = [req.params.id];
    let idx = 2;

    if (status) { updates.push(`status = $${idx++}`); params.push(status); }
    if (content_id) { updates.push(`content_id = $${idx++}`); params.push(content_id); }
    if (status === 'used') { updates.push(`post_count = post_count + 1`); }

    // trending_topics doesn't have updated_at column, use detected_at context
    const { rows } = await pool.query(
      `UPDATE trending_topics SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Trend not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[trending] Update error:', err.message);
    res.status(500).json({ error: 'Failed to update trend' });
  }
});

// ═══ DELETE /api/trending/expired ═══
// Cleanup expired trends
router.delete('/expired', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM trending_topics WHERE expires_at < NOW()`
    );
    res.json({ deleted: rowCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clean expired trends' });
  }
});

export default router;
