import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

// ═══ POST /api/dubbing/start ═══
// Start a dubbing job for a content piece
router.post('/start', async (req, res) => {
  try {
    const { content_id, target_language } = req.body;

    if (!content_id || !target_language) {
      return res.status(400).json({ error: 'Missing: content_id, target_language' });
    }

    // Get the content's video URL
    const { rows: [content] } = await pool.query(
      `SELECT c.*, b.elevenlabs_voice_id FROM content c
       JOIN businesses b ON b.id = c.business_id
       WHERE c.id = $1`,
      [content_id]
    );

    if (!content) return res.status(404).json({ error: 'Content not found' });
    if (!content.video_url) return res.status(400).json({ error: 'Content has no video — dubbing requires a video source' });

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured' });

    // Call ElevenLabs Dubbing API
    // POST /v1/dubbing — accepts file URL + target language
    const formData = new FormData();
    formData.append('source_url', content.video_url);
    formData.append('target_lang', target_language);
    formData.append('source_lang', 'en');
    formData.append('num_speakers', '1');
    formData.append('watermark', 'false');

    const dubRes = await fetch(`${ELEVENLABS_BASE}/dubbing`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: formData,
    });

    const dubData = await dubRes.json();

    if (!dubData.dubbing_id) {
      return res.status(500).json({ error: 'ElevenLabs dubbing failed', detail: dubData });
    }

    // Save the job
    const { rows: [job] } = await pool.query(
      `INSERT INTO dubbing_jobs (content_id, target_language, elevenlabs_dubbing_id, status, source_video_url)
       VALUES ($1, $2, $3, 'processing', $4)
       ON CONFLICT (content_id, target_language) DO UPDATE SET
         elevenlabs_dubbing_id = $3, status = 'processing', source_video_url = $4, created_at = NOW()
       RETURNING *`,
      [content_id, target_language, dubData.dubbing_id, content.video_url]
    );

    res.status(201).json({
      job: job,
      dubbing_id: dubData.dubbing_id,
      expected_duration_seconds: dubData.expected_duration_sec,
    });
  } catch (err) {
    console.error('[dubbing] Start error:', err.message);
    res.status(500).json({ error: 'Failed to start dubbing job' });
  }
});

// ═══ GET /api/dubbing/status/:dubbing_id ═══
// Check status of a dubbing job
router.get('/status/:dubbing_id', async (req, res) => {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const { dubbing_id } = req.params;

    const statusRes = await fetch(`${ELEVENLABS_BASE}/dubbing/${dubbing_id}`, {
      headers: { 'xi-api-key': apiKey },
    });
    const statusData = await statusRes.json();

    // If complete, get the dubbed file URL
    if (statusData.status === 'dubbed') {
      // Download the dubbed video
      const fileRes = await fetch(
        `${ELEVENLABS_BASE}/dubbing/${dubbing_id}/audio/${statusData.target_languages?.[0] || req.query.lang || 'ar'}`,
        { headers: { 'xi-api-key': apiKey } }
      );

      // Update the job in DB
      await pool.query(
        `UPDATE dubbing_jobs SET status = 'completed', completed_at = NOW(),
         duration_seconds = $1
         WHERE elevenlabs_dubbing_id = $2`,
        [statusData.duration_sec, dubbing_id]
      );

      res.json({
        status: 'completed',
        duration_seconds: statusData.duration_sec,
        dubbing_id,
      });
    } else if (statusData.status === 'failed') {
      await pool.query(
        `UPDATE dubbing_jobs SET status = 'failed' WHERE elevenlabs_dubbing_id = $1`,
        [dubbing_id]
      );
      res.json({ status: 'failed', error: statusData.error });
    } else {
      res.json({ status: statusData.status || 'processing', dubbing_id });
    }
  } catch (err) {
    console.error('[dubbing] Status error:', err.message);
    res.status(500).json({ error: 'Failed to check dubbing status' });
  }
});

// ═══ GET /api/dubbing/jobs/:content_id ═══
// List all dubbing jobs for a content piece
router.get('/jobs/:content_id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM dubbing_jobs WHERE content_id = $1 ORDER BY created_at DESC`,
      [req.params.content_id]
    );
    res.json({ jobs: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dubbing jobs' });
  }
});

export default router;
