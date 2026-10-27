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

async function callBackend(path: string, method: string, body: unknown = null, authorization = '') {
  const backendBase = process.env.FLOOT_BACKEND_URL;
  const privateKey = process.env.FLOOT_PROXY_PRIVATE_KEY;
  if (!backendBase || !privateKey) throw new Error('Persistent backend configuration is missing.');

  const bodyValue = body ?? null;
  const bodyHash = requestHash(path, method, bodyValue, authorization);
  const signedProxyToken = jwt.sign(
    { path, method, bodyHash },
    privateKey.replace(/\\n/g, '\n'),
    { algorithm: 'RS256', issuer: 'pitchmaster-vercel-proxy', audience: 'pitchmaster-backend', expiresIn: '30s' }
  );

  const target = new URL('/_api/api-dispatch', backendBase);
  const upstream = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Pitchmaster-Proxy': signedProxyToken },
    body: JSON.stringify({ path, method, body: bodyValue, authorization }),
    cache: 'no-store',
  });
  const text = await upstream.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 500) }; }
  return { status: upstream.status, data };
}

async function proxyRequest(req: Request, res: Response) {
  const path = req.originalUrl || req.url || req.path;
  if (!path.startsWith('/api/')) return res.status(404).json({ error: 'API route not found.' });
  const method = req.method.toUpperCase();
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) return res.status(405).json({ error: 'Method not allowed.' });
  const authorization = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  try {
    const result = await callBackend(path, method, req.body ?? null, authorization);
    res.status(result.status).setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(JSON.stringify(result.data));
  } catch (error: any) {
    console.error('[PitchMaster API proxy] Backend request failed:', error?.message || error);
    return res.status(502).json({ error: 'Persistent backend is temporarily unavailable. No success was reported.' });
  }
}

app.all('*', (req, res) => { void proxyRequest(req, res); });

export default async function handler(req: any, res: any) {
  return app(req, res);
}
