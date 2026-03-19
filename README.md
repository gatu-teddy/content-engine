# Social Media Content Engine

Multi-brand AI-powered social media content creation and publishing system.

**Stack:** n8n (backend) · React (dashboard) · Claude (text gen) · Nano Banana (image gen) · PostgreSQL · S3/R2

**Platforms:** X/Twitter · Instagram · Facebook · LinkedIn · TikTok · YouTube Shorts

## Quick Start

```bash
cd docker
cp .env.example .env
# Edit .env with your credentials
docker compose up -d
```

Then import the n8n workflows from `n8n-workflows/` and configure credentials.

Full setup guide: [docs/SETUP.md](docs/SETUP.md)
