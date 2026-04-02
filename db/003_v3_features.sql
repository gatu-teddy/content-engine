-- ═══════════════════════════════════════════════════
-- V3 MIGRATION — Intent Sniping, Trending, Engagement, Localisation
-- ═══════════════════════════════════════════════════

-- ─── INTENT SNIPING: Opportunities table ───
CREATE TABLE IF NOT EXISTS intent_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  platform VARCHAR(20) NOT NULL,  -- 'reddit' or 'x'
  source_url TEXT NOT NULL,
  source_id TEXT NOT NULL,         -- Reddit post/comment ID or X tweet ID
  source_author TEXT,
  source_text TEXT NOT NULL,
  source_subreddit TEXT,           -- Reddit only
  matched_keywords TEXT[],
  generated_reply TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, approved, posted, dismissed, failed
  posted_at TIMESTAMPTZ,
  reply_id TEXT,                   -- ID of the posted reply
  relevance_score NUMERIC(3,2),   -- Claude-scored 0.00-1.00
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(business_id, source_id)  -- prevent duplicate opportunities
);

CREATE INDEX IF NOT EXISTS idx_intent_biz_status ON intent_opportunities(business_id, status);
CREATE INDEX IF NOT EXISTS idx_intent_created ON intent_opportunities(created_at DESC);

-- ─── INTENT SNIPING: Daily reply tracking (rate limit enforcement) ───
CREATE TABLE IF NOT EXISTS intent_reply_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  platform VARCHAR(20) NOT NULL,
  reply_count INTEGER NOT NULL DEFAULT 0,
  window_date DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE(business_id, platform, window_date)
);

-- ─── INTENT SNIPING: Reddit credentials on businesses ───
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS reddit_client_id VARCHAR(100);
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS reddit_client_secret VARCHAR(200);
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS reddit_username VARCHAR(100);
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS reddit_password VARCHAR(200);

-- ─── TRENDING TOPICS ───
CREATE TABLE IF NOT EXISTS trending_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  source VARCHAR(20) NOT NULL,      -- 'reddit', 'google_trends'
  source_detail TEXT,                -- subreddit name or Google Trends category
  relevance_score NUMERIC(3,2),     -- Claude-scored 0.00-1.00
  status VARCHAR(20) NOT NULL DEFAULT 'detected',  -- detected, queued, used, dismissed
  post_count INTEGER DEFAULT 0,     -- how many posts on this topic
  content_id UUID REFERENCES content(id),  -- linked content if used
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trending_biz_status ON trending_topics(business_id, status);

-- ─── ENGAGEMENT TRACKING ───
-- analytics_snapshots already exists from v2, but let's ensure the schema is complete
CREATE TABLE IF NOT EXISTS engagement_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  platform VARCHAR(20) NOT NULL,
  platform_post_id TEXT,           -- the ID on the platform (tweet ID, IG media ID, etc.)
  impressions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,        -- retweets, reposts, shares
  saves INTEGER DEFAULT 0,         -- bookmarks, saves
  clicks INTEGER DEFAULT 0,
  engagement_rate NUMERIC(5,2),    -- calculated: (likes+comments+shares)/impressions * 100
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(content_id, platform, fetched_at)  -- allow multiple snapshots over time
);

CREATE INDEX IF NOT EXISTS idx_engagement_content ON engagement_metrics(content_id);
CREATE INDEX IF NOT EXISTS idx_engagement_fetched ON engagement_metrics(fetched_at DESC);

-- Add platform_post_id to publish_log for linking
ALTER TABLE publish_log ADD COLUMN IF NOT EXISTS platform_post_id TEXT;

-- ─── LOCALISATION / DUBBING ───
CREATE TABLE IF NOT EXISTS dubbing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  source_language VARCHAR(10) NOT NULL DEFAULT 'en',
  target_language VARCHAR(10) NOT NULL,
  elevenlabs_dubbing_id TEXT,      -- ElevenLabs dubbing job ID
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, processing, completed, failed
  source_video_url TEXT,
  dubbed_video_url TEXT,
  duration_seconds INTEGER,
  cost_credits NUMERIC(8,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(content_id, target_language)
);

-- ─── SMART SCHEDULE: Optimal time cache ───
CREATE TABLE IF NOT EXISTS optimal_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  platform VARCHAR(20) NOT NULL,
  day_of_week INTEGER NOT NULL,    -- 0=Sunday, 6=Saturday
  optimal_hour INTEGER NOT NULL,   -- 0-23 in business timezone
  optimal_minute INTEGER NOT NULL DEFAULT 0,
  confidence VARCHAR(20) NOT NULL DEFAULT 'industry_default',  -- industry_default, data_driven
  sample_size INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(business_id, platform, day_of_week)
);

-- Seed with industry-standard optimal times
-- Source: Multiple social media studies (Sprout Social, Hootsuite, Later)
INSERT INTO optimal_schedule (business_id, platform, day_of_week, optimal_hour, optimal_minute, confidence)
SELECT b.id, p.platform, p.dow, p.hour, p.minute, 'industry_default'
FROM businesses b
CROSS JOIN (VALUES
  -- Instagram: Tue-Fri 10am-1pm best, weekends 9-11am
  ('instagram', 1, 10, 0), ('instagram', 2, 11, 0), ('instagram', 3, 10, 0),
  ('instagram', 4, 11, 0), ('instagram', 5, 10, 0), ('instagram', 6, 9, 0), ('instagram', 0, 9, 0),
  -- X: Mon-Fri 8-10am, Tue-Thu best
  ('x', 1, 8, 0), ('x', 2, 9, 0), ('x', 3, 9, 0),
  ('x', 4, 8, 0), ('x', 5, 8, 0), ('x', 6, 10, 0), ('x', 0, 10, 0),
  -- Facebook: Tue-Thu 9am-12pm best
  ('facebook', 1, 9, 0), ('facebook', 2, 10, 0), ('facebook', 3, 10, 0),
  ('facebook', 4, 9, 0), ('facebook', 5, 9, 0), ('facebook', 6, 11, 0), ('facebook', 0, 11, 0),
  -- TikTok: Tue-Thu 2-5pm, weekends 10am-12pm
  ('tiktok', 1, 14, 0), ('tiktok', 2, 15, 0), ('tiktok', 3, 14, 0),
  ('tiktok', 4, 15, 0), ('tiktok', 5, 14, 0), ('tiktok', 6, 10, 0), ('tiktok', 0, 10, 0),
  -- LinkedIn: Tue-Thu 8-10am, lunch 12-1pm
  ('linkedin', 1, 8, 0), ('linkedin', 2, 9, 0), ('linkedin', 3, 8, 0),
  ('linkedin', 4, 9, 0), ('linkedin', 5, 8, 0), ('linkedin', 6, 10, 0), ('linkedin', 0, 10, 0),
  -- YouTube: Thu-Sat 12-3pm best for Shorts
  ('youtube', 1, 13, 0), ('youtube', 2, 14, 0), ('youtube', 3, 13, 0),
  ('youtube', 4, 12, 0), ('youtube', 5, 12, 0), ('youtube', 6, 13, 0), ('youtube', 0, 14, 0)
) AS p(platform, dow, hour, minute)
ON CONFLICT (business_id, platform, day_of_week) DO NOTHING;

-- ─── CONTENT: recycled_from for tracking recycled posts ───
ALTER TABLE content ADD COLUMN IF NOT EXISTS recycled_from UUID REFERENCES content(id);
