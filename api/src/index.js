import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool } from './db.js';
import authRoutes from './routes/auth.js';
import businessRoutes from './routes/businesses.js';
import contentRoutes from './routes/content.js';
import uploadRoutes from './routes/uploads.js';
import alexRoutes from './routes/alex.js';
import templateRoutes from './routes/templates.js';
import webhookRoutes from './routes/webhooks.js';
import oauthRoutes from './routes/oauth.js';
import { authMiddleware } from './middleware/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ─── Health Check ───
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── Routes ───
app.use('/api/auth', authRoutes);
app.use('/api/oauth', oauthRoutes);  // Public — OAuth callbacks from platform redirects
app.use('/api/businesses', authMiddleware, businessRoutes);
app.use('/api/content', authMiddleware, contentRoutes);
app.use('/api/uploads', authMiddleware, uploadRoutes);
app.use('/api/v1/alex', authMiddleware, alexRoutes);
app.use('/api/templates', authMiddleware, templateRoutes);
app.use('/api/webhooks', authMiddleware, webhookRoutes);

// ─── Error Handler ───
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Content Engine API running on port ${PORT}`);
});
