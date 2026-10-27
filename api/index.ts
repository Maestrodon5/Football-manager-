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

// Preview-only end-to-end test. It creates uniquely named test records, verifies
// persistence and team rules through the same API contract, then removes only those records.
app.get('/api/__integration-test', async (_req, res) => {
  if (process.env.VERCEL_ENV === 'production') return res.status(404).json({ error: 'Not found' });
  const prefix = 'PMTEST-' + Date.now() + '-';
  const createdIds: string[] = [];
  let sessionId = '';
  let auth = '';
  const checks: Array<{ name: string; pass: boolean; details?: unknown }> = [];
  let finalStatus = 200;
  let finalPayload: any = null;
  const record = (name: string, pass: boolean, details?: unknown) => checks.push({ name, pass, details });
  try {
    const health = await callBackend('/api/health', 'GET');
    record('PostgreSQL health', health.status === 200 && health.data.database === 'connected', health.data);
    const login = await callBackend('/api/auth/captain-auto-token', 'POST', {});
    auth = 'Bearer ' + String(login.data.token || '');
    if (login.status !== 200 || auth.length < 30) throw new Error('Captain token issue: ' + JSON.stringify(login.data));

    for (let i = 0; i < 30; i++) {
      const created = await callBackend('/api/players', 'POST', {
        name: prefix + i,
        position: ['Striker', 'Midfielder', 'Defender'][i % 3],
        skill_level: ['Top', 'Medium', 'Normal'][i % 3],
      }, auth);
      if (created.status !== 201 || !created.data.player?.id) throw new Error('Player create failed at index ' + i + ': ' + JSON.stringify(created.data));
      createdIds.push(created.data.player.id);
    }
    const readAfterCreate = await callBackend('/api/players?search=' + encodeURIComponent(prefix), 'GET');
    record('30 players survive separate API reads', readAfterCreate.status === 200 && readAfterCreate.data.players.length === 30, { status: readAfterCreate.status, count: readAfterCreate.data.players?.length });

    const base = new Date(Date.UTC(2098, 0, 1));
    base.setUTCDate(base.getUTCDate() + (Math.floor(Date.now() / 1000) % 350));
    const sessionDate = base.toISOString().slice(0, 10);
    const createdSession = await callBackend('/api/sessions', 'POST', { session_date: sessionDate, title: 'PitchMaster automated integration test' }, auth);
    if (createdSession.status !== 201) throw new Error('Session create failed: ' + JSON.stringify(createdSession.data));
    sessionId = createdSession.data.session.id;

    const attendance = await callBackend('/api/sessions/' + sessionId + '/attendance', 'PUT', { bulk_player_ids: createdIds, status: 'CONFIRMED' }, auth);
    record('Attendance write', attendance.status === 200, attendance.data);
    const generation = await callBackend('/api/sessions/' + sessionId + '/generate-teams', 'POST', {
      team_count: 3, players_per_team: 10, include_pending: false,
      captains: { A: createdIds[0], B: createdIds[1], C: createdIds[2] },
    }, auth);
    record('Random team generation', generation.status === 200, generation.data.error || generation.data.result?.balance_explanation);

    const details = await callBackend('/api/sessions/' + sessionId, 'GET');
    const assignments = details.data.assignments || [];
    const teamCounts = ['A', 'B', 'C'].map(team => assignments.filter((a: any) => a.team_id === team).length);
    record('No duplicate player assignments', assignments.length === 30 && new Set(assignments.map((a: any) => a.player_id)).size === 30, { assignments: assignments.length, unique: new Set(assignments.map((a: any) => a.player_id)).size });
    record('Three teams of ten', teamCounts.every(count => count === 10), teamCounts);
    record('Three distinct persisted captains', details.data.weeklyTeamsRecord?.captains?.length === 3 && new Set(details.data.weeklyTeamsRecord.captains.map((c: any) => c.player_id)).size === 3, details.data.weeklyTeamsRecord?.captains);

    const archive = await callBackend('/api/players/' + createdIds[29], 'DELETE', null, auth);
    const activeAfterRemove = await callBackend('/api/players?search=' + encodeURIComponent(prefix), 'GET');
    const allAfterRemove = await callBackend('/api/players?search=' + encodeURIComponent(prefix) + '&includeArchived=true', 'GET');
    record('Remove persists after another request', archive.status === 200 && activeAfterRemove.data.players.length === 29 && allAfterRemove.data.players.length === 30, { active: activeAfterRemove.data.players?.length, includingArchived: allAfterRemove.data.players?.length });

    const failed = checks.filter(c => !c.pass);
    finalStatus = failed.length ? 500 : 200;
    finalPayload = { status: failed.length ? 'failed' : 'passed', checks };
  } catch (error: any) {
    record('Integration flow', false, error?.message || String(error));
    finalStatus = 500;
    finalPayload = { status: 'failed', checks, error: error?.message || String(error) };
  } finally {
    // Cleanup is isolated to IDs created by this test run.
    try {
      if (sessionId && auth) await callBackend('/api/sessions/' + sessionId, 'DELETE', { confirmation: 'DELETE SESSION' }, auth);
      for (const playerId of createdIds) {
        if (auth) await callBackend('/api/players/' + playerId + '?permanent=true', 'DELETE', null, auth);
      }
    } catch (cleanupError: any) {
      console.error('[PitchMaster integration test] Cleanup warning:', cleanupError?.message || cleanupError);
      finalStatus = 500;
      finalPayload = { ...(finalPayload || {}), status: 'failed', cleanupError: cleanupError?.message || String(cleanupError) };
    }
  }
  return res.status(finalStatus).json(finalPayload);
});

app.all('*', (req, res) => { void proxyRequest(req, res); });

export default async function handler(req: any, res: any) {
  return app(req, res);
}
