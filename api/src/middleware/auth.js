import jwt from 'jsonwebtoken';

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Accepts either a valid JWT or the x-cron-secret header.
// Used for routes that the auto-generation cron needs to call.
export function cronOrAuthMiddleware(req, res, next) {
  const cronSecret = req.headers['x-cron-secret'];
  if (cronSecret && cronSecret === process.env.CRON_SECRET) {
    return next();
  }
  return authMiddleware(req, res, next);
}
