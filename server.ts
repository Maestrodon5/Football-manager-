import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getDb } from './src/server/db.js';
import { apiRouter } from './src/server/api.js';
import { startBackgroundScheduler } from './src/server/scheduler.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '15mb' }));

  // Initialize Database
  console.log('[Database] Initializing persistent SQLite database...');
  await getDb();
  console.log('[Database] Database initialized and verified.');

  // Start Background Scheduler
  startBackgroundScheduler();

  // Mount API Router
  app.use('/api', apiRouter);

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'PitchMaster FC Manager',
      timestamp: new Date().toISOString(),
      mode: isProd ? 'production' : 'development',
    });
  });

  if (!isProd) {
    // Development mode: Mount Vite dev server middleware
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[Server] Vite middleware mounted in development mode.');
  } else {
    // Production mode: Serve built static files
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
    console.log('[Server] Serving production build from dist.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n⚽ PitchMaster FC Manager running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
