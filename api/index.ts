import express, { Request, Response } from 'express';
import { getDb } from '../src/server/db.js';
import { apiRouter } from '../src/server/api.js';

const app = express();

// Parse incoming JSON requests up to 15MB (for team photos, database backup/restore)
app.use(express.json({ limit: '15mb' }));

// Ensure SQLite database is fully initialized and seeded
let dbInitPromise: Promise<any> | null = null;
async function ensureDb() {
  if (!dbInitPromise) {
    dbInitPromise = getDb().catch((err) => {
      console.error('[Vercel Serverless] Failed to initialize SQLite database:', err);
      dbInitPromise = null;
      throw err;
    });
  }
  return dbInitPromise;
}

// Middleware ensuring database ready before processing any request
app.use(async (req: Request, res: Response, next) => {
  try {
    await ensureDb();
    next();
  } catch (err: any) {
    res.status(500).json({ error: 'Database initialization failed: ' + (err?.message || err) });
  }
});

// Health check endpoints
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'PitchMaster FC Manager (Vercel Serverless)',
    timestamp: new Date().toISOString(),
    mode: 'production',
  });
});

app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'PitchMaster FC Manager (Vercel Serverless)',
    timestamp: new Date().toISOString(),
    mode: 'production',
  });
});

// Mount the router on both '/api' and '/' to guarantee matches regardless of rewrite path normalization
app.use('/api', apiRouter);
app.use('/', apiRouter);

// Export for Vercel Serverless Functions
export default async function handler(req: any, res: any) {
  try {
    await ensureDb();
  } catch (err: any) {
    console.error('[Vercel Serverless Handler] DB init error:', err);
    return res.status(500).json({ error: 'Database startup error' });
  }
  return app(req, res);
}
