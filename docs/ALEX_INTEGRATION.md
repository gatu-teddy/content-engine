# Alex ↔ Content Engine Integration Guide

## 1. Add These Tools to Alex's System Prompt

Paste the following tool definitions into Alex's system prompt. Alex maps natural language commands to the appropriate API call.

```json
{
  "tools": [
    {
      "name": "content_engine_status",
      "description": "Get current status of all businesses or a specific business. Returns automation mode, cadence, connection health, pending content count, and token warnings.",
      "endpoint": "GET /api/v1/alex/status",
      "parameters": {
        "business_name": {
          "type": "string",
          "required": false,
          "description": "Business name (fuzzy matched). Omit to get all businesses."
        }
      },
      "examples": [
        "How's everything looking?",
        "What's the status of Acme Beauty?",
        "Any issues I should know about?"
      ]
    },
    {
      "name": "content_engine_pause",
      "description": "Pause content generation and publishing. Can pause a specific platform for one business, all platforms for one business, or everything globally. Stores previous modes for restore.",
      "endpoint": "POST /api/v1/alex/pause",
      "parameters": {
        "business_name": {
          "type": "string",
          "required": false,
          "description": "Business name. Omit for global pause across all businesses."
        },
        "platform": {
          "type": "string",
          "required": false,
          "description": "Platform to pause (x, instagram, facebook, linkedin, tiktok, youtube). Omit to pause all platforms."
        },
        "reason": {
          "type": "string",
          "required": false,
          "description": "Optional note for why it's paused."
        }
      },
      "examples": [
        "Pause everything",
        "Pause X across everything",
        "Pause Acme Beauty",
        "Stop posting to TikTok for Metro Property"
      ]
    },
    {
      "name": "content_engine_resume",
      "description": "Resume content generation. Restores previous automation mode. Can resume a specific platform, one business, or all businesses globally.",
      "endpoint": "POST /api/v1/alex/resume",
      "parameters": {
        "business_name": {
          "type": "string",
          "required": false,
          "description": "Business name. Omit for global resume."
        },
        "platform": {
          "type": "string",
          "required": false,
          "description": "Platform to resume. Omit to resume all."
        }
      },
      "examples": [
        "Resume everything",
        "Resume X",
        "Start Acme Beauty back up"
      ]
    },
    {
      "name": "content_engine_cadence",
      "description": "Change posting frequency for a specific platform on a specific business. Options: 3x_daily, 2x_daily, daily, 5x_week, 3x_week, 2x_week, weekly, off.",
      "endpoint": "PATCH /api/v1/alex/cadence",
      "parameters": {
        "business_name": {
          "type": "string",
          "required": true,
          "description": "Business name (fuzzy matched)."
        },
        "platform": {
          "type": "string",
          "required": true,
          "description": "Platform: x, instagram, facebook, linkedin, tiktok, youtube."
        },
        "cadence": {
          "type": "string",
          "required": true,
          "description": "New frequency: 3x_daily, 2x_daily, daily, 5x_week, 3x_week, 2x_week, weekly, off."
        }
      },
      "examples": [
        "Set Instagram to 3x daily for Acme Beauty",
        "Reduce TikTok to weekly for Metro Property",
        "Turn off LinkedIn for HomeBase"
      ]
    },
    {
      "name": "content_engine_approve",
      "description": "Approve pending content for publishing. Can approve a specific piece of content by ID, or bulk approve all pending content (optionally filtered by business).",
      "endpoint": "POST /api/v1/alex/approve",
      "parameters": {
        "content_id": {
          "type": "string",
          "required": false,
          "description": "Specific content UUID to approve. Omit to approve all pending."
        },
        "business_name": {
          "type": "string",
          "required": false,
          "description": "Filter bulk approval to one business."
        }
      },
      "examples": [
        "Approve all pending content",
        "Approve everything for Acme Beauty",
        "Approve that last post"
      ]
    },
    {
      "name": "content_engine_analytics",
      "description": "Get performance analytics. Returns engagement rates, top posts, platform breakdown, pending count, and token warnings. Supports day, week, or month periods.",
      "endpoint": "GET /api/v1/alex/analytics",
      "parameters": {
        "business_name": {
          "type": "string",
          "required": false,
          "description": "Business name. Omit for cross-business analytics."
        },
        "period": {
          "type": "string",
          "required": false,
          "default": "week",
          "description": "Time period: day, week, month."
        }
      },
      "examples": [
        "How's Acme Beauty doing this week?",
        "Show me this month's numbers",
        "What's the best performing platform?"
      ]
    },
    {
      "name": "content_engine_reconnect",
      "description": "Generate an OAuth reconnection URL for an expired or expiring platform token. Returns a URL that the user taps in WhatsApp to re-authenticate.",
      "endpoint": "POST /api/v1/alex/reconnect",
      "parameters": {
        "business_name": {
          "type": "string",
          "required": true,
          "description": "Business name."
        },
        "platform": {
          "type": "string",
          "required": true,
          "description": "Platform to reconnect: instagram, facebook, linkedin, tiktok, youtube."
        }
      },
      "examples": [
        "Reconnect Facebook for Acme Beauty",
        "Fix the Instagram token",
        "Send me the reconnect link for LinkedIn"
      ]
    }
  ]
}
```

## 2. API Authentication

Alex uses the same JWT token as the dashboard. Generate a long-lived service token:

```bash
# Generate a JWT for Alex (set long expiry)
node -e "
  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    { id: 'alex-service', email: 'alex@system', role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '365d' }
  );
  console.log(token);
"
```

Add to every request:
```
Authorization: Bearer <token>
```

## 3. Webhook Receiver (Alex Side)

The Content Engine pushes events to Alex when things happen. Alex needs an HTTP endpoint to receive them.

### Endpoint to build on Alex's server:

```
POST /webhooks/content-engine
```

### Headers sent by the engine:
```
Content-Type: application/json
X-Engine-Event: token_expiring
X-Engine-Severity: warning
X-Webhook-Id: <uuid>
```

### Payload format:
```json
{
  "event": "token_expiring",
  "severity": "warning",
  "business_id": "uuid",
  "business_name": "Acme Beauty Studio",
  "message": "Facebook token expires in 3 days",
  "action_url": "https://api.yourdomain.com/api/v1/alex/reconnect",
  "timestamp": "2026-03-18T06:00:00Z"
}
```

### Event types and what Alex should do:

| Event | Severity | Alex Action |
|-------|----------|-------------|
| token_expiring | warning | Message user during waking hours (8am-10pm). Include reconnect link. |
| token_expired | critical | Message user IMMEDIATELY. Include reconnect link. |
| publish_failed | critical | Message user IMMEDIATELY with error detail. |
| publish_success | info | Batch into daily summary. |
| engagement_spike | info | Highlight in daily summary. |
| engagement_drop | warning | Message during waking hours with platform + numbers. |
| intent_high | info | Batch into daily summary. |
| content_pending | info | Batch into daily summary. |
| rate_limited | warning | Message during waking hours. |
| weekly_report | info | Send full weekly summary on schedule. |

### Severity routing logic for Alex:

```
critical → message immediately, any time of day
warning  → message during 8am-10pm, batch overnight warnings for morning
info     → batch into daily summary at configured time, never interrupt
```

### Alex's webhook handler pseudocode:

```python
@app.post("/webhooks/content-engine")
def handle_engine_webhook(payload):
    event = payload["event"]
    severity = payload["severity"]
    message = payload["message"]
    business = payload["business_name"]
    
    if severity == "critical":
        send_whatsapp_now(f"⚠️ {business}: {message}")
    elif severity == "warning":
        if is_waking_hours():
            send_whatsapp_now(f"⚡ {business}: {message}")
        else:
            queue_for_morning(payload)
    else:  # info
        add_to_daily_summary(payload)
    
    return {"received": True}
```

## 4. Configure in Dashboard

1. Go to Settings → Alex Integration
2. Toggle "Enabled"
3. Set webhook URL: `https://alex.yourdomain.com/webhooks/content-engine`
4. Set daily summary time and weekly report schedule

## 5. Test the Integration

```bash
# Test webhook delivery
curl -X POST https://api.yourdomain.com/api/webhooks/test \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"business_id": "<your-business-uuid>"}'

# Test Alex status query
curl https://api.yourdomain.com/api/v1/alex/status \
  -H "Authorization: Bearer <token>"

# Test pause
curl -X POST https://api.yourdomain.com/api/v1/alex/pause \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"business_name": "Acme Beauty"}'
```

## 6. Example Alex Conversations

**Max:** Pause X across everything
**Alex:** *[calls content_engine_pause with platform="x"]*
**Alex:** Done. X posting is paused across all 3 businesses. Instagram, Facebook, TikTok, LinkedIn, and YouTube continue as normal. Say "resume X" when you're ready.

**Max:** How's Acme Beauty doing this week?
**Alex:** *[calls content_engine_analytics with business_name="Acme Beauty Studio", period="week"]*
**Alex:** This week for Acme Beauty: 14 posts published. Instagram is your best platform with 5 successful publishes. Facebook token expires in 4 days — want me to send you the reconnect link?

**Max:** Yeah fix the Facebook token
**Alex:** *[calls content_engine_reconnect with business_name="Acme Beauty Studio", platform="facebook"]*
**Alex:** Here's your reconnect link: [tap to reconnect Facebook]. It's valid for 10 minutes. After you authenticate, the engine picks up automatically.

**Max:** Approve all pending content
**Alex:** *[calls content_engine_approve]*
**Alex:** Done — 3 posts approved and moved to scheduled. They'll publish at their optimal times.
