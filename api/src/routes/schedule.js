import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// ═══ GET /api/schedule/optimal/:business_id ═══
// Returns the next optimal posting time for each platform
router.get('/optimal/:business_id', async (req, res) => {
  try {
    const { platform } = req.query;
    const now = new Date();
    const currentDay = now.getDay();  // 0=Sunday
    const currentHour = now.getHours();

    let query = `SELECT * FROM optimal_schedule WHERE business_id = $1`;
    const params = [req.params.business_id];

    if (platform) {
      query += ` AND platform = $2`;
      params.push(platform);
    }

    query += ` ORDER BY day_of_week, optimal_hour`;
    const { rows } = await pool.query(query, params);

    if (rows.length === 0) {
      return res.json({ message: 'No schedule data. Using defaults.' });
    }

    // Find next optimal slot for each platform
    const nextSlots = {};
    const platforms = [...new Set(rows.map(r => r.platform))];

    for (const plat of platforms) {
      const platRows = rows.filter(r => r.platform === plat);

      // Find next future slot
      let next = null;
      // Check today first (if there's a later slot)
      const todaySlot = platRows.find(r => r.day_of_week === currentDay && r.optimal_hour > currentHour);
      if (todaySlot) {
        next = todaySlot;
      } else {
        // Find next day's slot
        for (let d = 1; d <= 7; d++) {
          const checkDay = (currentDay + d) % 7;
          const slot = platRows.find(r => r.day_of_week === checkDay);
          if (slot) { next = slot; break; }
        }
      }

      if (next) {
        const daysAhead = (next.day_of_week - currentDay + 7) % 7 || (next.optimal_hour > currentHour ? 0 : 7);
        const dt = new Date(now);
        dt.setDate(dt.getDate() + daysAhead);
        dt.setHours(next.optimal_hour, next.optimal_minute, 0, 0);

        nextSlots[plat] = {
          datetime: dt.toISOString(),
          day: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][next.day_of_week],
          time: `${String(next.optimal_hour).padStart(2,'0')}:${String(next.optimal_minute).padStart(2,'0')}`,
          confidence: next.confidence,
          sample_size: next.sample_size,
        };
      }
    }

    res.json({ next_optimal: nextSlots });
  } catch (err) {
    console.error('[schedule] Optimal error:', err.message);
    res.status(500).json({ error: 'Failed to get optimal schedule' });
  }
});

// ═══ PUT /api/schedule/optimal/:business_id ═══
// Update optimal time for a platform + day (when data-driven learning kicks in)
router.put('/optimal/:business_id', async (req, res) => {
  try {
    const { platform, day_of_week, optimal_hour, optimal_minute, confidence, sample_size } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO optimal_schedule (business_id, platform, day_of_week, optimal_hour, optimal_minute, confidence, sample_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (business_id, platform, day_of_week) DO UPDATE SET
         optimal_hour = $4, optimal_minute = $5, confidence = $6, sample_size = $7, updated_at = NOW()
       RETURNING *`,
      [req.params.business_id, platform, day_of_week, optimal_hour, optimal_minute || 0,
       confidence || 'data_driven', sample_size || 0]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error('[schedule] Update error:', err.message);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

export default router;
