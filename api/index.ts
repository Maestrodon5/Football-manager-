import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';

const app = express();
app.use(express.json({ limit: '15mb' }));

function requestHash(path: string, method: string, body: unknown, authorization: string) {
  return createHash('sha256')
    .update(path + "\n" + method + "\n" + JSON.stringify(body ?? null) + "\n" + authorization)
    .digest('hex');
}

async function proxyRequest(req: Request, res: Response) {
  const backendBase = process.env.FLOOT_BACKEND_URL;
  const privateKey = process.env.FLOOT_PROXY_PRIVATE_KEY;
  if (!backendBase || !privateKey) {
    return res.status(503).json({ error: 'Persistent backend is not connected yet. Missing backend configuration.' });
  }

  const path = req.originalUrl || req.url || req.path;
  if (!path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found.' });
  }
  const method = req.method.toUpperCase();
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const body = req.body ?? null;
  const authorization = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  const bodyHash = requestHash(path, method, body, authorization);
  const signedProxyToken = jwt.sign(
    { path, method, bodyHash },
    privateKey.replace(/\\n/g, '\n'),
    { algorithm: 'RS256', issuer: 'pitchmaster-vercel-proxy', audience: 'pitchmaster-backend', expiresIn: '30s' }
  );

  try {
    const target = new URL('/_api/api-dispatch', backendBase);
    const upstream = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Pitchmaster-Proxy': signedProxyToken,
      },
      body: JSON.stringify({ path, method, body, authorization }),
      cache: 'no-store',
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(text);
  } catch (error: any) {
    console.error('[PitchMaster API proxy] Backend request failed:', error?.message || error);
    return res.status(502).json({ error: 'Persistent backend is temporarily unavailable. No success was reported.' });
  }
}

app.all('*', (req, res) => { void proxyRequest(req, res); });

export default async function handler(req: any, res: any) {
  return app(req, res);
}
