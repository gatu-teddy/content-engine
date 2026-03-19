-- ============================================================
-- SOCIAL MEDIA CONTENT ENGINE — DATABASE SCHEMA
-- Run against PostgreSQL 15+
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── USERS ───
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  role VARCHAR(20) DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── BUSINESSES ───
CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(200) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  brand_voice TEXT,                          -- Short brand personality description
  brand_summary TEXT,                        -- Auto-compiled or manually edited context summary
  enabled_platforms TEXT[] DEFAULT '{}',     -- e.g. {'x','instagram','linkedin','facebook','tiktok','youtube'}
  default_timezone VARCHAR(50) DEFAULT 'Asia/Dubai',
  default_post_times TEXT[] DEFAULT '{"10:00","13:00","18:00"}',
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PLATFORM CREDENTIALS (encrypted) ───
CREATE TABLE platform_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  platform VARCHAR(30) NOT NULL,            -- 'x', 'instagram', 'facebook', 'linkedin', 'tiktok', 'youtube'
  credentials_encrypted TEXT NOT NULL,       -- JSON blob, encrypted with pgcrypto
  token_expires_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'active',      -- 'active', 'expired', 'revoked'
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, platform)
);

-- ─── CONTEXT DOCUMENTS ───
CREATE TABLE context_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  filename VARCHAR(500) NOT NULL,
  file_url TEXT NOT NULL,                    -- S3/R2 URL
  file_type VARCHAR(20) NOT NULL,           -- 'pdf', 'docx', 'txt'
  file_size_bytes INTEGER,
  extracted_text TEXT,                        -- Parsed text content for prompt injection
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── REFERENCE IMAGES ───
CREATE TABLE reference_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  filename VARCHAR(500) NOT NULL,
  file_url TEXT NOT NULL,                    -- S3/R2 public URL
  label VARCHAR(100),                        -- 'logo', 'product', 'mood_board', 'colour_palette'
  file_size_bytes INTEGER,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CONTENT ───
CREATE TABLE content (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  brief TEXT NOT NULL,                       -- Original content brief from user
  status VARCHAR(30) DEFAULT 'generating',   -- 'generating', 'pending_review', 'approved', 'scheduled', 'publishing', 'published', 'failed', 'rejected'
  variants JSONB,                            -- Platform-specific post variants (full JSON)
  image_url TEXT,                            -- Generated image URL (if applicable)
  image_prompt TEXT,                         -- The prompt used for image generation
  scheduled_at TIMESTAMPTZ,                  -- When to publish (null = manual/immediate)
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PUBLISH LOG (per-platform results) ───
CREATE TABLE publish_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_id UUID REFERENCES content(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  platform VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL,              -- 'success', 'failed', 'retrying'
  post_id TEXT,                              -- Platform-specific post ID
  post_url TEXT,                             -- Direct link to post
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INDEXES ───
CREATE INDEX idx_content_business ON content(business_id);
CREATE INDEX idx_content_status ON content(status);
CREATE INDEX idx_content_scheduled ON content(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX idx_publish_log_content ON publish_log(content_id);
CREATE INDEX idx_publish_log_business ON publish_log(business_id);
CREATE INDEX idx_context_docs_business ON context_documents(business_id);
CREATE INDEX idx_ref_images_business ON reference_images(business_id);
CREATE INDEX idx_platform_creds_business ON platform_credentials(business_id);

-- ─── SEED ADMIN USER (change password on first login) ───
INSERT INTO users (email, password_hash, display_name, role)
VALUES ('max@example.com', crypt('changeme123', gen_salt('bf')), 'Max', 'admin');
