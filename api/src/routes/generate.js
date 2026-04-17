import { Router } from 'express';

const router = Router();

const N8N_WEBHOOK = process.env.N8N_GENERATE_WEBHOOK
  || 'https://n8n-content-engine-production.up.railway.app/webhook/generate-content';

// POST /api/generate
// Proxies to n8n content generation webhook, returns result to dashboard.
router.post('/', async (req, res) => {
  const { business_id, brief, image_model, generate_image, platforms, scheduled_at } = req.body;

  if (!business_id || !brief) {
    return res.status(400).json({ error: 'business_id and brief are required' });
  }

  try {
    const response = await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id,
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

    res.json(data);

  } catch (err) {
    console.error('[generate] fetch error:', err.message);
    res.status(500).json({ error: 'Failed to reach generation service' });
  }
});

export default router;
