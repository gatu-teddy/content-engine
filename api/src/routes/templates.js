import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════
// CONTENT TEMPLATES — CRUD
// Templates are reusable content brief structures.
// The auto-generation cron pulls from these.
// ═══════════════════════════════════════════════════════════════


// GET /api/templates?business_id=xxx
router.get('/', async (req, res) => {
  try {
    const { business_id, active_only } = req.query;
    if (!business_id) return res.status(400).json({ error: 'business_id is required' });

    let query = `SELECT * FROM content_templates WHERE business_id = $1`;
    const params = [business_id];

    if (active_only === 'true') {
      query += ` AND active = true`;
    }

    query += ` ORDER BY performance_score DESC, name ASC`;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('List templates error:', err);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});


// GET /api/templates/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM content_templates WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Template not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get template error:', err);
    res.status(500).json({ error: 'Failed to get template' });
  }
});


// POST /api/templates
router.post('/', async (req, res) => {
  try {
    const {
      business_id, name, brief_template, dynamic_variables,
      image_prompt_template, platforms, frequency, active,
    } = req.body;

    if (!business_id || !name || !brief_template) {
      return res.status(400).json({ error: 'business_id, name, and brief_template are required' });
    }

    const result = await pool.query(
      `INSERT INTO content_templates
        (business_id, name, brief_template, dynamic_variables, image_prompt_template, platforms, frequency, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        business_id, name, brief_template,
        JSON.stringify(dynamic_variables || []),
        image_prompt_template || null,
        platforms || [],
        frequency || 'weekly',
        active !== false,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create template error:', err);
    res.status(500).json({ error: 'Failed to create template' });
  }
});


// PUT /api/templates/:id
router.put('/:id', async (req, res) => {
  try {
    const {
      name, brief_template, dynamic_variables,
      image_prompt_template, platforms, frequency, active,
    } = req.body;

    const result = await pool.query(
      `UPDATE content_templates SET
        name = COALESCE($1, name),
        brief_template = COALESCE($2, brief_template),
        dynamic_variables = COALESCE($3, dynamic_variables),
        image_prompt_template = COALESCE($4, image_prompt_template),
        platforms = COALESCE($5, platforms),
        frequency = COALESCE($6, frequency),
        active = COALESCE($7, active),
        updated_at = NOW()
      WHERE id = $8 RETURNING *`,
      [
        name, brief_template,
        dynamic_variables ? JSON.stringify(dynamic_variables) : null,
        image_prompt_template,
        platforms, frequency, active,
        req.params.id,
      ]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Template not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update template error:', err);
    res.status(500).json({ error: 'Failed to update template' });
  }
});


// DELETE /api/templates/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM content_templates WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error('Delete template error:', err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});


// POST /api/templates/:id/fire — Record a template firing
// Called by the auto-generation cron after using a template
router.post('/:id/fire', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE content_templates SET
        fire_count = fire_count + 1,
        last_fired_at = NOW(),
        updated_at = NOW()
      WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Template not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Fire template error:', err);
    res.status(500).json({ error: 'Failed to fire template' });
  }
});


// PATCH /api/templates/:id/score — Update performance score
// Called by the analytics system after engagement data is collected
router.patch('/:id/score', async (req, res) => {
  try {
    const { score } = req.body;
    if (score === undefined || score < 0 || score > 100) {
      return res.status(400).json({ error: 'score must be between 0 and 100' });
    }

    const result = await pool.query(
      `UPDATE content_templates SET performance_score = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [score, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Template not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update score error:', err);
    res.status(500).json({ error: 'Failed to update score' });
  }
});


// GET /api/templates/next/:business_id — Get the next template to fire
// Used by the auto-generation cron to select the best template
router.get('/next/:business_id', async (req, res) => {
  try {
    const { business_id } = req.params;

    // Selection logic:
    // 1. Active templates only
    // 2. Due based on frequency (not fired recently enough)
    // 3. Weighted by performance_score (higher = more likely)
    // 4. Tie-break: least recently fired
    const result = await pool.query(
      `SELECT ct.*,
        CASE
          WHEN ct.frequency = '3x_week' THEN INTERVAL '2 days'
          WHEN ct.frequency = '2x_week' THEN INTERVAL '3 days'
          WHEN ct.frequency = 'daily' THEN INTERVAL '1 day'
          WHEN ct.frequency = 'weekly' THEN INTERVAL '6 days'
          WHEN ct.frequency = 'monthly' THEN INTERVAL '27 days'
          ELSE INTERVAL '6 days'
        END as frequency_interval
       FROM content_templates ct
       WHERE ct.business_id = $1
         AND ct.active = true
         AND (ct.last_fired_at IS NULL OR ct.last_fired_at + 
           CASE
             WHEN ct.frequency = '3x_week' THEN INTERVAL '2 days'
             WHEN ct.frequency = '2x_week' THEN INTERVAL '3 days'
             WHEN ct.frequency = 'daily' THEN INTERVAL '1 day'
             WHEN ct.frequency = 'weekly' THEN INTERVAL '6 days'
             WHEN ct.frequency = 'monthly' THEN INTERVAL '27 days'
             ELSE INTERVAL '6 days'
           END <= NOW())
       ORDER BY ct.performance_score DESC, ct.last_fired_at ASC NULLS FIRST
       LIMIT 1`,
      [business_id]
    );

    if (result.rows.length === 0) {
      return res.json({ next: null, message: 'No templates due for firing' });
    }

    const template = result.rows[0];

    // Pick dynamic variable values (cycle to avoid repeats)
    const variables = template.dynamic_variables || [];
    const compiledVars = {};

    for (const v of variables) {
      if (v.values && v.values.length > 0) {
        // Simple cycling based on fire_count
        const index = template.fire_count % v.values.length;
        compiledVars[v.name] = v.values[index];
      }
    }

    // Compile brief from template
    let compiledBrief = template.brief_template;
    for (const [key, value] of Object.entries(compiledVars)) {
      compiledBrief = compiledBrief.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }

    res.json({
      next: {
        template_id: template.id,
        name: template.name,
        compiled_brief: compiledBrief,
        variables: compiledVars,
        platforms: template.platforms,
        image_prompt: template.image_prompt_template,
        performance_score: template.performance_score,
      },
    });
  } catch (err) {
    console.error('Next template error:', err);
    res.status(500).json({ error: 'Failed to get next template' });
  }
});


export default router;
