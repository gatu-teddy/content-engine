# Social Media Content Engine — Setup Guide

## Overview

This is a multi-brand social media content creation engine with:
- **n8n** as the automation backend (content generation, image generation, publishing)
- **React dashboard** as the user interface
- **PostgreSQL** for data storage
- **Claude API** (Anthropic) for text content generation
- **Nano Banana 2** (via fal.ai) for AI image generation
- **S3/Cloudflare R2** for media storage

## Architecture

```
┌──────────────┐    webhooks    ┌──────────────┐    API calls    ┌──────────────┐
│   Dashboard  │ ◄────────────► │     n8n      │ ◄────────────► │  Claude API  │
│   (React)    │                │  (workflows) │                │  Nano Banana │
└──────┬───────┘                └──────┬───────┘                │  Platform    │
       │                               │                        │  APIs        │
       │ REST API                      │ SQL                    └──────────────┘
       │                               │
       ▼                               ▼
┌──────────────┐                ┌──────────────┐
│  API Server  │ ──────────────►│  PostgreSQL  │
│  (Express)   │                │              │
└──────┬───────┘                └──────────────┘
       │
       ▼
┌──────────────┐
│  S3 / R2     │
│  (media)     │
└──────────────┘
```

## Prerequisites

- Docker & Docker Compose installed on your VPS
- A domain with SSL (for n8n webhooks)
- Cloudflare R2 or AWS S3 bucket configured
- API keys ready:
  - Anthropic API key (for Claude)
  - fal.ai API key (for Nano Banana) OR Google Gemini API key
  - Platform developer accounts (see Credential Checklist below)

## Quick Start

### 1. Clone and Configure

```bash
cd /opt
git clone <your-repo> content-engine
cd content-engine/docker
cp .env.example .env
nano .env  # Fill in all values
```

### 2. Launch Services

```bash
docker compose up -d
```

This starts:
- PostgreSQL on port 5432 (auto-runs schema migration)
- n8n on port 5678
- API server on port 3001
- Dashboard on port 3000

### 3. Import n8n Workflows

1. Open n8n at `https://n8n.yourdomain.com`
2. Login with credentials from .env
3. Go to **Workflows** → **Import from File**
4. Import these in order:
   - `n8n-workflows/01_content_generation.json`
   - `n8n-workflows/02_multi_platform_publisher.json`
   - `n8n-workflows/03_scheduled_publisher.json`
5. **Configure credentials** in each workflow:
   - Create a PostgreSQL credential pointing to `postgres:5432/content_engine`
   - Create an HTTP Header Auth credential for Anthropic (`x-api-key: sk-ant-...`)
   - Create an HTTP Header Auth credential for fal.ai (`Authorization: Key ...`)
6. Activate all three workflows

### 4. Configure Reverse Proxy

Use nginx or Caddy to proxy:
- `n8n.yourdomain.com` → `localhost:5678`
- `api.yourdomain.com` → `localhost:3001`
- `app.yourdomain.com` → `localhost:3000`

SSL is required for n8n webhooks and OAuth callbacks.

### 5. First Login

1. Open `https://app.yourdomain.com`
2. Login with: `max@example.com` / `changeme123`
3. **Change your password immediately**
4. Create your first business

## Platform Credential Checklist

### X / Twitter
1. Go to `developer.x.com`
2. Create a project and app
3. Set app permissions to **Read and Write**
4. Generate API Key, API Secret, Access Token, Access Token Secret
5. In dashboard: Business Settings → Platforms → X → Enter all 4 keys

### Instagram + Facebook
1. Go to `developers.facebook.com`
2. Create an app (Business type)
3. Add **Instagram Graph API** product
4. Add **Facebook Login** product
5. Complete **App Review** for `instagram_content_publish` permission
6. Complete **Page Publishing Authorization**
7. Connect your Instagram Business account to a Facebook Page
8. Generate a long-lived Page Access Token (60 days)
9. Get your IG User ID from the API
10. In dashboard: Business Settings → Platforms → Instagram/Facebook → Enter tokens

### LinkedIn
1. Go to `linkedin.com/developers`
2. Create an app (requires a Company Page)
3. Enable **Share on LinkedIn** product
4. Enable **Sign In with LinkedIn using OpenID Connect**
5. Generate an access token using LinkedIn's OAuth tool
6. Get your person URN from `/v2/userinfo`
7. In dashboard: Business Settings → Platforms → LinkedIn → Enter token + URN

### TikTok
1. Go to `developers.tiktok.com`
2. Create an app
3. Add **Content Posting API** product
4. Enable **Direct Post**
5. Get your app approved (audit required for public visibility)
6. Generate user access token via OAuth flow
7. In dashboard: Business Settings → Platforms → TikTok → Enter token

### YouTube
1. Go to Google Cloud Console
2. Create project, enable **YouTube Data API v3**
3. Create OAuth 2.0 credentials
4. Complete OAuth flow to get refresh token
5. In dashboard: Business Settings → Platforms → YouTube → Enter credentials

## Project Structure

```
content-engine/
├── api/                          # Express API server
│   ├── src/
│   │   ├── index.js              # Entry point
│   │   ├── routes/
│   │   │   ├── auth.js           # Login / JWT
│   │   │   ├── businesses.js     # CRUD for businesses, credentials, docs, images
│   │   │   ├── content.js        # Content CRUD, calendar
│   │   │   └── uploads.js        # File upload to S3/R2
│   │   └── middleware/
│   │       └── auth.js           # JWT verification
│   ├── package.json
│   └── Dockerfile
├── dashboard/                    # React frontend (to be built)
│   ├── src/
│   └── Dockerfile
├── n8n-workflows/                # Importable n8n workflow JSONs
│   ├── 01_content_generation.json
│   ├── 02_multi_platform_publisher.json
│   └── 03_scheduled_publisher.json
├── db/
│   └── 001_initial_schema.sql    # PostgreSQL schema
├── docker/
│   ├── docker-compose.yml
│   └── .env.example
├── prompts/                      # Claude prompt templates (reference)
└── docs/
    └── SETUP.md                  # This file
```

## Customisation Notes

### Adding a New Platform
1. Add the platform to the `platform_credentials` table (already supports any string)
2. Add a new branch in the `02_multi_platform_publisher.json` workflow
3. Create the HTTP Request or native n8n node for the platform's API
4. Update the Claude system prompt in `01_content_generation.json` to include the platform's rules

### Changing AI Models
- **Text generation**: Update the model name in the Claude API call (`01_content_generation.json`)
- **Image generation**: Update the fal.ai endpoint (or switch to Google Gemini API direct)

### Token Refresh
- Instagram/Facebook: Tokens last 60 days. Set a reminder or build a cron workflow to refresh
- LinkedIn: 60-day tokens. Must re-authenticate via OAuth
- X/Twitter: OAuth 1.0a tokens don't expire
- TikTok: Use refresh_token flow

## Troubleshooting

- **n8n webhooks not working**: Check WEBHOOK_URL in .env matches your domain with SSL
- **Claude returns malformed JSON**: Check the system prompt hasn't been corrupted
- **Instagram publish fails**: Ensure image is publicly accessible URL, account is Business type
- **LinkedIn 401**: Token expired. Re-authenticate in dashboard settings
- **TikTok content private**: Audit not completed. Submit at developers.tiktok.com
