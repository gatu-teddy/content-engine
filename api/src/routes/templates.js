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


// GET /api/templates/:id?business_id=xxx
router.get('/:id', async (req, res) => {
  try {
    const { business_id } = req.query;
    const query = business_id
      ? 'SELECT * FROM content_templates WHERE id = $1 AND business_id = $2'
      : 'SELECT * FROM content_templates WHERE id = $1';
    const params = business_id ? [req.params.id, business_id] : [req.params.id];

    const result = await pool.query(query, params);
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


// PUT /api/templates/:id?business_id=xxx
router.put('/:id', async (req, res) => {
  try {
    const { business_id } = req.query;
    const {
      name, brief_template, dynamic_variables,
      image_prompt_template, platforms, frequency, active,
    } = req.body;

    const whereClause = business_id
      ? 'WHERE id = $8 AND business_id = $9'
      : 'WHERE id = $8';
    const params = [
      name, brief_template,
      dynamic_variables ? JSON.stringify(dynamic_variables) : null,
      image_prompt_template,
      platforms, frequency, active,
      req.params.id,
      ...(business_id ? [business_id] : []),
    ];

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
      ${whereClause} RETURNING *`,
      params
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Template not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update template error:', err);
    res.status(500).json({ error: 'Failed to update template' });
  }
});


// DELETE /api/templates/:id?business_id=xxx
router.delete('/:id', async (req, res) => {
  try {
    const { business_id } = req.query;
    const query = business_id
      ? 'DELETE FROM content_templates WHERE id = $1 AND business_id = $2'
      : 'DELETE FROM content_templates WHERE id = $1';
    const params = business_id ? [req.params.id, business_id] : [req.params.id];

    await pool.query(query, params);
    res.json({ deleted: true });
  } catch (err) {
    console.error('Delete template error:', err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});


// POST /api/templates/:id/fire — Record a template firing + advance rotation_state
// Called by the auto-generation cron after content is generated successfully
router.post('/:id/fire', async (req, res) => {
  try {
    const { new_rotation_state } = req.body;

    const result = await pool.query(
      `UPDATE content_templates SET
        fire_count = fire_count + 1,
        last_fired_at = NOW(),
        rotation_state = COALESCE($1::jsonb, rotation_state),
        updated_at = NOW()
      WHERE id = $2 RETURNING *`,
      [
        new_rotation_state ? JSON.stringify(new_rotation_state) : null,
        req.params.id,
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Template not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Fire template error:', err);
    res.status(500).json({ error: 'Failed to fire template' });
  }
});


// PATCH /api/templates/:id/score — Update performance score
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


// ─── Variable resolver ─────────────────────────────────────────
// Handles three variable types:
//   rotate  — cycles through values[] using rotation_state[state_key] as cursor
//   lookup  — resolves a map keyed by the already-resolved value of another variable
//   random  — picks from values[] at random (no state update)
//
// Returns { compiledVars, newRotationState }
function resolveVariables(variables, currentRotationState) {
  const compiledVars = {};
  const newRotationState = { ...currentRotationState };

  for (const v of variables) {
    if (v.type === 'rotate') {
      const cursor = currentRotationState[v.state_key] ?? 0;
      compiledVars[v.name] = v.values[cursor % v.values.length];
      // Advance cursor (wraps automatically next call)
      newRotationState[v.state_key] = (cursor + 1) % v.values.length;

    } else if (v.type === 'lookup') {
      // Source variable must have been resolved already (depends on order in array)
      const sourceValue = compiledVars[v.source];
      compiledVars[v.name] = (v.map && sourceValue !== undefined)
        ? (v.map[sourceValue] ?? '')
        : '';

    } else if (v.type === 'random') {
      compiledVars[v.name] = v.values[Math.floor(Math.random() * v.values.length)];
    }
  }

  return { compiledVars, newRotationState };
}

// ─── Template string substitution ─────────────────────────────
// Templates use {{variable_name}} double-brace syntax.
function substituteVars(template, vars) {
  if (!template) return template;
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return out;
}


// GET /api/templates/next/:business_id — Get the next template to fire
// Used by the auto-generation cron to select which template is due.
//
// Returns:
//   next.template_id          — template UUID
//   next.business_id          — always the requesting business (safe to pass to /generate)
//   next.name                 — template slug name
//   next.compiled_brief       — brief_template with all {{vars}} substituted
//   next.compiled_image_prompt — image_prompt_template with all {{vars}} substituted (or null)
//   next.variables            — resolved variable map used
//   next.new_rotation_state   — updated state; pass this to POST /fire after success
//   next.platforms            — target platforms
//   next.performance_score
router.get('/next/:business_id', async (req, res) => {
  try {
    const { business_id } = req.params;

    const result = await pool.query(
      `SELECT *
       FROM content_templates
       WHERE business_id = $1
         AND active = true
         AND (last_fired_at IS NULL OR last_fired_at +
           CASE frequency
             WHEN 'daily'      THEN INTERVAL '1 day'
             WHEN '3x_weekly'  THEN INTERVAL '2 days'
             WHEN '2x_weekly'  THEN INTERVAL '3 days'
             WHEN 'weekly'     THEN INTERVAL '6 days'
             WHEN 'biweekly'   THEN INTERVAL '13 days'
             WHEN 'monthly'    THEN INTERVAL '27 days'
             ELSE                   INTERVAL '6 days'
           END <= NOW())
       ORDER BY performance_score DESC, last_fired_at ASC NULLS FIRST
       LIMIT 1`,
      [business_id]
    );

    if (result.rows.length === 0) {
      return res.json({ next: null, message: 'No templates due for firing' });
    }

    const template = result.rows[0];
    const variables = template.dynamic_variables || [];
    const currentRotationState = template.rotation_state || {};

    const { compiledVars, newRotationState } = resolveVariables(variables, currentRotationState);

    const compiledBrief = substituteVars(template.brief_template, compiledVars);
    const compiledImagePrompt = substituteVars(template.image_prompt_template, compiledVars);

    res.json({
      next: {
        template_id: template.id,
        business_id: template.business_id,   // always pass back so cron uses the right business
        name: template.name,
        compiled_brief: compiledBrief,
        compiled_image_prompt: compiledImagePrompt,
        variables: compiledVars,
        new_rotation_state: newRotationState, // pass to POST /fire after successful generation
        platforms: template.platforms,
        performance_score: template.performance_score,
      },
    });
  } catch (err) {
    console.error('Next template error:', err);
    res.status(500).json({ error: 'Failed to get next template' });
  }
});


export default router;
