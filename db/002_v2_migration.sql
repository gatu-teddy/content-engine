-- ============================================================
-- CONTENT ENGINE — V2 MIGRATION
-- Adds: automation, cadence, templates, Alex integration, webhooks
-- Run after 001_initial_schema.sql
-- ============================================================

-- ─── BUSINESSES: add automation, cadence, Alex config ───
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS automation_mode VARCHAR(20) DEFAULT 'manual';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS cadence JSONB DEFAULT '{}';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS image_model VARCHAR(50) DEFAULT 'nano_banana_2';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS alex_enabled BOOLEAN DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS alex_webhook_url TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS alex_daily_summary_at VARCHAR(10) DEFAULT '09:00';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS alex_weekly_report_day VARCHAR(10) DEFAULT 'Sunday';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS alex_weekly_report_at VARCHAR(10) DEFAULT '09:00';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS recycling_enabled BOOLEAN DEFAULT true;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS recycling_ratio INTEGER DEFAULT 30;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS ai_optimisations JSONB DEFAULT '{}';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS intent_config JSONB DEFAULT '{}';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS trending_enabled BOOLEAN DEFAULT true;
-- Store previous mode for global pause/resume
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS previous_automation_mode VARCHAR(20);

-- ─── ELEVENLABS / VIDEO CONFIG ───
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS video_enabled_platforms TEXT[] DEFAULT '{}';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS elevenlabs_voice_id VARCHAR(100);
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS music_style VARCHAR(200) DEFAULT 'Luxury ambient — soft piano, aspirational';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS video_duration INTEGER DEFAULT 10;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS video_languages TEXT[] DEFAULT '{en}';

-- ─── PLATFORM CREDENTIALS: add handle column ───
ALTER TABLE platform_credentials ADD COLUMN IF NOT EXISTS handle VARCHAR(200);

-- ─── CONTENT: add video/audio asset columns ───
ALTER TABLE content ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE content ADD COLUMN IF NOT EXISTS voiceover_url TEXT;
ALTER TABLE content ADD COLUMN IF NOT EXISTS music_url TEXT;

-- ─── CONTENT TEMPLATES ───
CREATE TABLE IF NOT EXISTS content_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  brief_template TEXT NOT NULL,
  dynamic_variables JSONB DEFAULT '[]',
  image_prompt_template TEXT,
  platforms TEXT[] DEFAULT '{}',
  frequency VARCHAR(30) DEFAULT 'weekly',
  active BOOLEAN DEFAULT true,
  performance_score DECIMAL(5,2) DEFAULT 0,
  fire_count INTEGER DEFAULT 0,
  last_fired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_business ON content_templates(business_id);
CREATE INDEX IF NOT EXISTS idx_templates_active ON content_templates(business_id) WHERE active = true;

-- Add template_id to content
ALTER TABLE content ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES content_templates(id);

-- ─── WEBHOOK EVENT LOG ───
-- Logs every event sent (or attempted) to Alex
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'info',
  payload JSONB NOT NULL,
  delivered BOOLEAN DEFAULT false,
  delivery_attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_business ON webhook_events(business_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_pending ON webhook_events(delivered) WHERE delivered = false;

-- ─── ANALYTICS CACHE (optional, for fast Alex queries) ───
CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  period VARCHAR(20) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_business ON analytics_snapshots(business_id, period);
