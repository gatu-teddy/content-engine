import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

const N8N_WEBHOOK = process.env.N8N_GENERATE_WEBHOOK
  || 'https://n8n-content-engine-production.up.railway.app/webhook/generate-content';

// POST /api/generate
// Creates a content record, proxies to n8n with the record ID, returns result.
router.post('/', async (req, res) => {
  const { business_id, brief, image_model, generate_image, platforms, scheduled_at } = req.body;

  if (!business_id || !brief) {
    return res.status(400).json({ error: 'business_id and brief are required' });
  }

  // Create the content record first so n8n has a real ID to UPDATE
  let contentId;
  try {
    const row = await pool.query(
      `INSERT INTO content (business_id, brief, status) VALUES ($1, $2, 'generating') RETURNING id`,
      [business_id, brief]
    );
    contentId = row.rows[0].id;
  } catch (err) {
    console.error('[generate] failed to create content record:', err.message);
    return res.status(500).json({ error: 'Failed to create content record' });
  }

  // ── Fetch brand voice + context vault docs so Claude has full context ──
  let brand_voice = '';
  let context_documents = [];
  let reference_image_urls = [];
  try {
    const [bizRow, docsRow, imgsRow] = await Promise.all([
      pool.query(`SELECT brand_voice FROM businesses WHERE id = $1`, [business_id]),
      pool.query(
        `SELECT filename, file_type, extracted_text, file_url
         FROM context_documents
         WHERE business_id = $1
         ORDER BY uploaded_at DESC`,
        [business_id]
      ),
      pool.query(
        `SELECT file_url, label FROM reference_images WHERE business_id = $1 ORDER BY uploaded_at DESC LIMIT 10`,
        [business_id]
      ),
    ]);
    brand_voice = bizRow.rows[0]?.brand_voice || '';
    context_documents = docsRow.rows.map(d => ({
      filename: d.filename,
      type: d.file_type,
      // Include extracted text if available, otherwise just the URL for reference
      text: d.extracted_text && d.extracted_text !== '[PENDING_EXTRACTION]' ? d.extracted_text : null,
      url: d.file_url,
    }));
    reference_image_urls = imgsRow.rows.map(r => ({ url: r.file_url, label: r.label }));
  } catch (err) {
    console.warn('[generate] Could not fetch context vault — continuing without it:', err.message);
  }

  try {
    const response = await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content_id: contentId,
        business_id,
        brand_voice,
        context_documents,
        reference_image_urls,
        brief,
        image_model: image_model || 'nano_banana_2',
        generate_image: generate_image !== false,
        platforms: platforms || ['instagram', 'facebook'],
        scheduled_at: scheduled_at || null,
        user_id: req.user.id,
      }),
    });

    const text = await response.text();

    if (!response.ok) {
      console.error('[generate] n8n error:', response.status, text);
      return res.status(502).json({ error: 'Generation service error', detail: text });
    }

    if (!text || !text.trim()) {
      console.error('[generate] n8n returned empty response');
      return res.status(502).json({ error: 'Generation service returned empty response' });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error('[generate] n8n response not JSON:', text.slice(0, 200));
      return res.status(502).json({ error: 'Generation service returned invalid response', detail: text.slice(0, 200) });
    }

    const payload = Array.isArray(data) ? data[0] : data;

    // If n8n didn't return image_url (e.g. Parse Image Result branch didn't run),
    // fall back to what was already saved in the DB by n8n's Save to Database node
    let imageUrl = payload.image_url || null;
    if (!imageUrl) {
      try {
        const dbRow = await pool.query(`SELECT image_url FROM content WHERE id = $1`, [contentId]);
        imageUrl = dbRow.rows[0]?.image_url || null;
      } catch { /* non-fatal */ }
    }

    res.json({ ...payload, content_id: contentId, image_url: imageUrl });

  } catch (err) {
    console.error('[generate] fetch error:', err.message);
    // Mark the record as failed
    await pool.query(`UPDATE content SET status = 'failed' WHERE id = $1`, [contentId]).catch(() => {});
    res.status(500).json({ error: 'Failed to reach generation service' });
  }
});

export default router;
