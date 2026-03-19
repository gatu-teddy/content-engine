import { Router } from 'express';
import { pool } from '../db.js';
import { emitEvent, checkTokenExpiry } from '../services/webhooks.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════
// WEBHOOK EVENT MANAGEMENT
// Internal endpoints for viewing event logs, retrying deliveries,
// and testing the webhook pipeline.
// ═══════════════════════════════════════════════════════════════


// GET /api/webhooks/events — List webhook events
router.get('/events', async (req, res) => {
  try {
    const { business_id, event_type, delivered, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM webhook_events WHERE 1=1';
    const params = [];
    let idx = 1;

    if (business_id) { query += ` AND business_id = $${idx++}`; params.push(business_id); }
    if (event_type) { query += ` AND event_type = $${idx++}`; params.push(event_type); }
    if (delivered !== undefined) { query += ` AND delivered = $${idx++}`; params.push(delivered === 'true'); }

    query += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);
    res.json({ events: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('List webhook events error:', err);
    res.status(500).json({ error: 'Failed to list events' });
  }
});


// POST /api/webhooks/retry/:eventId — Retry a failed delivery
router.post('/retry/:eventId', async (req, res) => {
  try {
    const event = await pool.query('SELECT * FROM webhook_events WHERE id = $1', [req.params.eventId]);
    if (event.rows.length === 0) return res.status(404).json({ error: 'Event not found' });

    const evt = event.rows[0];
    if (evt.delivered) return res.json({ message: 'Event already delivered', event_id: evt.id });

    // Get business webhook URL
    const biz = await pool.query('SELECT alex_webhook_url, alex_enabled FROM businesses WHERE id = $1', [evt.business_id]);
    if (!biz.rows[0]?.alex_webhook_url || !biz.rows[0]?.alex_enabled) {
      return res.json({ message: 'Alex not enabled for this business', event_id: evt.id });
    }

    // Re-deliver
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(biz.rows[0].alex_webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Engine-Event': evt.event_type,
          'X-Engine-Severity': evt.severity,
          'X-Webhook-Id': evt.id,
          'X-Retry': 'true',
        },
        body: JSON.stringify(evt.payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      await pool.query(
        `UPDATE webhook_events SET delivered = $1, delivery_attempts = delivery_attempts + 1, last_attempt_at = NOW(), last_error = $2 WHERE id = $3`,
        [response.ok, response.ok ? null : `HTTP ${response.status}`, evt.id]
      );

      res.json({ success: response.ok, status: response.status, event_id: evt.id });
    } catch (fetchErr) {
      clearTimeout(timeout);
      await pool.query(
        `UPDATE webhook_events SET delivery_attempts = delivery_attempts + 1, last_attempt_at = NOW(), last_error = $1 WHERE id = $2`,
        [fetchErr.message, evt.id]
      );
      res.json({ success: false, error: fetchErr.message, event_id: evt.id });
    }
  } catch (err) {
    console.error('Retry webhook error:', err);
    res.status(500).json({ error: 'Failed to retry' });
  }
});


// POST /api/webhooks/test — Send a test event to a business's webhook
router.post('/test', async (req, res) => {
  try {
    const { business_id } = req.body;
    if (!business_id) return res.status(400).json({ error: 'business_id is required' });

    const result = await emitEvent(business_id, 'PUBLISH_SUCCESS', {
      message: 'This is a test webhook event from Content Engine',
      content_id: 'test-' + Date.now(),
      platform: 'test',
      post_url: 'https://example.com/test-post',
    });

    res.json(result);
  } catch (err) {
    console.error('Test webhook error:', err);
    res.status(500).json({ error: 'Failed to send test event' });
  }
});


// POST /api/webhooks/check-tokens — Manually trigger token expiry check
router.post('/check-tokens', async (req, res) => {
  try {
    const result = await checkTokenExpiry();
    res.json(result);
  } catch (err) {
    console.error('Token check error:', err);
    res.status(500).json({ error: 'Failed to check tokens' });
  }
});


export default router;
