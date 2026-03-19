import { pool } from '../db.js';

// ═══════════════════════════════════════════════════════════════
// WEBHOOK EVENT SYSTEM
// Pushes events from the Content Engine to Alex's webhook endpoint.
// Events are logged in webhook_events table for audit and retry.
//
// SEVERITY ROUTING (recommended for Alex):
//   critical — message user immediately (token expired, publish failed)
//   warning  — message during waking hours 8am-10pm, batch overnight
//   info     — batch into daily summary, never interrupt
// ═══════════════════════════════════════════════════════════════

const EVENT_TYPES = {
  TOKEN_EXPIRING:    { type: 'token_expiring',    severity: 'warning' },
  TOKEN_EXPIRED:     { type: 'token_expired',     severity: 'critical' },
  PUBLISH_FAILED:    { type: 'publish_failed',    severity: 'critical' },
  PUBLISH_SUCCESS:   { type: 'publish_success',   severity: 'info' },
  ENGAGEMENT_SPIKE:  { type: 'engagement_spike',  severity: 'info' },
  ENGAGEMENT_DROP:   { type: 'engagement_drop',   severity: 'warning' },
  INTENT_HIGH:       { type: 'intent_high',       severity: 'info' },
  CONTENT_PENDING:   { type: 'content_pending',   severity: 'info' },
  RATE_LIMITED:      { type: 'rate_limited',       severity: 'warning' },
  WEEKLY_REPORT:     { type: 'weekly_report',     severity: 'info' },
};


/**
 * Emit a webhook event to Alex.
 *
 * @param {string} businessId - UUID of the business
 * @param {string} eventType - One of the EVENT_TYPES keys
 * @param {object} data - Event-specific data merged into payload
 * @returns {object} - { success, event_id, delivered }
 */
export async function emitEvent(businessId, eventType, data = {}) {
  const eventDef = EVENT_TYPES[eventType];
  if (!eventDef) {
    console.error(`Unknown event type: ${eventType}`);
    return { success: false, error: 'Unknown event type' };
  }

  try {
    // Get business info and Alex config
    const bizResult = await pool.query(
      `SELECT id, display_name, alex_enabled, alex_webhook_url FROM businesses WHERE id = $1`,
      [businessId]
    );
    const biz = bizResult.rows[0];
    if (!biz) return { success: false, error: 'Business not found' };

    // Build payload
    const payload = {
      event: eventDef.type,
      severity: eventDef.severity,
      business_id: biz.id,
      business_name: biz.display_name,
      timestamp: new Date().toISOString(),
      ...data,
    };

    // Log the event regardless of delivery
    const eventRow = await pool.query(
      `INSERT INTO webhook_events (business_id, event_type, severity, payload, delivered)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [businessId, eventDef.type, eventDef.severity, JSON.stringify(payload), false]
    );
    const eventId = eventRow.rows[0].id;

    // If Alex is not enabled, log but don't deliver
    if (!biz.alex_enabled || !biz.alex_webhook_url) {
      console.log(`[webhook] Event ${eventDef.type} logged for ${biz.display_name} (Alex disabled, not delivered)`);
      return { success: true, event_id: eventId, delivered: false, reason: 'alex_disabled' };
    }

    // Deliver to Alex webhook
    const delivered = await deliverWebhook(biz.alex_webhook_url, payload, eventId);

    return { success: true, event_id: eventId, delivered };
  } catch (err) {
    console.error(`[webhook] Error emitting ${eventType}:`, err);
    return { success: false, error: err.message };
  }
}


/**
 * Deliver payload to a webhook URL with retry logic.
 */
async function deliverWebhook(url, payload, eventId, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Engine-Event': payload.event,
          'X-Engine-Severity': payload.severity,
          'X-Webhook-Id': eventId,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Update delivery status
      await pool.query(
        `UPDATE webhook_events SET
          delivered = $1,
          delivery_attempts = $2,
          last_attempt_at = NOW(),
          last_error = $3
        WHERE id = $4`,
        [response.ok, attempt, response.ok ? null : `HTTP ${response.status}`, eventId]
      );

      if (response.ok) {
        console.log(`[webhook] Delivered ${payload.event} to ${url} (attempt ${attempt})`);
        return true;
      }

      console.warn(`[webhook] Delivery failed: HTTP ${response.status} (attempt ${attempt}/${maxRetries})`);
    } catch (err) {
      await pool.query(
        `UPDATE webhook_events SET
          delivery_attempts = $1,
          last_attempt_at = NOW(),
          last_error = $2
        WHERE id = $3`,
        [attempt, err.message, eventId]
      );
      console.warn(`[webhook] Delivery error: ${err.message} (attempt ${attempt}/${maxRetries})`);
    }

    // Wait before retry (exponential backoff: 1s, 2s, 4s)
    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }
  }

  console.error(`[webhook] Failed to deliver ${payload.event} after ${maxRetries} attempts`);
  return false;
}


// ═══════════════════════════════════════════════════════════════
// CONVENIENCE EMITTERS
// Call these from anywhere in the codebase.
// ═══════════════════════════════════════════════════════════════

export async function emitTokenExpiring(businessId, platform, daysUntilExpiry) {
  return emitEvent(businessId, 'TOKEN_EXPIRING', {
    message: `${platform} token expires in ${daysUntilExpiry} days`,
    platform,
    days_until_expiry: daysUntilExpiry,
    action_url: `${process.env.API_BASE_URL || ''}/api/v1/alex/reconnect`,
  });
}

export async function emitTokenExpired(businessId, platform) {
  return emitEvent(businessId, 'TOKEN_EXPIRED', {
    message: `${platform} token has expired. Publishing will fail.`,
    platform,
    action_url: `${process.env.API_BASE_URL || ''}/api/v1/alex/reconnect`,
  });
}

export async function emitPublishFailed(businessId, contentId, platform, error) {
  return emitEvent(businessId, 'PUBLISH_FAILED', {
    message: `Failed to publish to ${platform}: ${error}`,
    content_id: contentId,
    platform,
    error_detail: error,
  });
}

export async function emitPublishSuccess(businessId, contentId, platform, postUrl) {
  return emitEvent(businessId, 'PUBLISH_SUCCESS', {
    message: `Published to ${platform}`,
    content_id: contentId,
    platform,
    post_url: postUrl,
  });
}

export async function emitEngagementSpike(businessId, contentId, platform, metric, value) {
  return emitEvent(businessId, 'ENGAGEMENT_SPIKE', {
    message: `Engagement spike on ${platform}: ${metric} at ${value}`,
    content_id: contentId,
    platform,
    metric,
    value,
  });
}

export async function emitEngagementDrop(businessId, platform, currentRate, previousRate) {
  return emitEvent(businessId, 'ENGAGEMENT_DROP', {
    message: `${platform} engagement dropped ${Math.round((1 - currentRate / previousRate) * 100)}% week-over-week`,
    platform,
    current_rate: currentRate,
    previous_rate: previousRate,
  });
}

export async function emitIntentHigh(businessId, source, snippet, replyStatus) {
  return emitEvent(businessId, 'INTENT_HIGH', {
    message: `High-intent post detected on ${source}`,
    source,
    snippet: snippet?.substring(0, 200),
    reply_status: replyStatus,
  });
}

export async function emitContentPending(businessId, contentId, brief) {
  return emitEvent(businessId, 'CONTENT_PENDING', {
    message: `Content awaiting approval`,
    content_id: contentId,
    brief: brief?.substring(0, 100),
  });
}

export async function emitRateLimited(businessId, platform, retryAfter) {
  return emitEvent(businessId, 'RATE_LIMITED', {
    message: `Rate limited by ${platform}. Retry after ${retryAfter}s.`,
    platform,
    retry_after_seconds: retryAfter,
  });
}

export async function emitWeeklyReport(businessId, reportData) {
  return emitEvent(businessId, 'WEEKLY_REPORT', {
    message: `Weekly performance report`,
    report: reportData,
  });
}


// ═══════════════════════════════════════════════════════════════
// TOKEN EXPIRY CHECKER
// Run this on a cron (e.g. daily at 06:00) to check for
// expiring/expired tokens and emit warnings.
// ═══════════════════════════════════════════════════════════════

export async function checkTokenExpiry() {
  try {
    // Tokens expiring within 7 days
    const expiring = await pool.query(
      `SELECT pc.business_id, pc.platform, pc.token_expires_at,
              b.display_name, b.alex_enabled
       FROM platform_credentials pc
       JOIN businesses b ON b.id = pc.business_id
       WHERE pc.token_expires_at IS NOT NULL
         AND pc.status = 'active'
         AND pc.token_expires_at > NOW()
         AND pc.token_expires_at <= NOW() + INTERVAL '7 days'`
    );

    for (const cred of expiring.rows) {
      const days = Math.ceil((new Date(cred.token_expires_at) - new Date()) / (1000 * 60 * 60 * 24));
      // Only alert at 7 days and 3 days
      if (days === 7 || days === 3 || days === 1) {
        await emitTokenExpiring(cred.business_id, cred.platform, days);
      }
    }

    // Tokens already expired (update status + alert)
    const expired = await pool.query(
      `UPDATE platform_credentials SET status = 'expired', updated_at = NOW()
       WHERE token_expires_at IS NOT NULL
         AND token_expires_at <= NOW()
         AND status = 'active'
       RETURNING business_id, platform`
    );

    for (const cred of expired.rows) {
      await emitTokenExpired(cred.business_id, cred.platform);
    }

    console.log(`[token-check] Checked tokens: ${expiring.rows.length} expiring, ${expired.rows.length} expired`);
    return { expiring: expiring.rows.length, expired: expired.rows.length };
  } catch (err) {
    console.error('[token-check] Error:', err);
    return { error: err.message };
  }
}


export { EVENT_TYPES };
