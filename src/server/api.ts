import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import {
  queryAll,
  queryOne,
  run,
  transaction,
  logAudit,
  exportDatabaseBackup,
  restoreDatabaseBackup,
} from './db.js';
import { generateBalancedTeams } from './teamGenerator.js';

const JWT_SECRET = process.env.JWT_SECRET || 'pitchmaster_development_only_secret';
const hasSecureJwtSecret = process.env.NODE_ENV !== 'production' || Boolean(process.env.JWT_SECRET);

export const apiRouter = express.Router();

// Captain Authentication Middleware
export function requireCaptainAuth(req: Request, res: Response, next: NextFunction) {
  if (!hasSecureJwtSecret) {
    res.status(503).json({ error: 'Captain actions are disabled until a strong JWT_SECRET is configured.' });
    return;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Captain login required to perform this action.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
    (req as any).captain = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired session token.' });
    return;
  }
}

// ----------------------------------------------------
// AUTHENTICATION
// ----------------------------------------------------
apiRouter.post('/auth/login', (req: Request, res: Response) => {
  if (!hasSecureJwtSecret) {
    res.status(503).json({ error: 'Captain authentication is not configured. Set JWT_SECRET in the deployment environment.' });
    return;
  }
  const { username, email, password } = req.body;
  const identifier = (email || username || '').trim().toLowerCase();

  if (!identifier || !password) {
    res.status(400).json({ error: 'Captain email/username and password are required' });
    return;
  }

  // Find captain by email or username
  const captain = queryOne<{ id: string; email: string; password_hash: string }>(
    'SELECT * FROM captain_accounts WHERE LOWER(email) = ? OR LOWER(email) LIKE ? LIMIT 1',
    [identifier, `${identifier}@%`]
  );

  if (!captain || !bcrypt.compareSync(password, captain.password_hash)) {
    res.status(401).json({ error: 'Invalid captain credentials' });
    return;
  }

  const token = jwt.sign({ id: captain.id, email: captain.email }, JWT_SECRET, {
    expiresIn: '7d',
  });

  logAudit('CAPTAIN_LOGIN', 'CAPTAIN_ACCOUNT', captain.id, { email: captain.email }, captain.id);

  res.json({
    token,
    captain: {
      id: captain.id,
      email: captain.email,
      username: captain.email.split('@')[0],
      display_name: 'Team Captain',
    },
  });
});

apiRouter.post('/auth/captain-auto-token', (req: Request, res: Response) => {
  // Passwordless captain access is only intended for a privately protected, single-owner deployment.
  // Never enable PERSONAL_MODE on a public, unprotected URL.
  if (process.env.PERSONAL_MODE !== 'true') {
    res.status(403).json({ error: 'Personal captain mode is disabled. Protect this deployment, then set PERSONAL_MODE=true.' });
    return;
  }
  if (!hasSecureJwtSecret) {
    res.status(503).json({ error: 'Set a strong JWT_SECRET before enabling personal captain access.' });
    return;
  }
  const captain = queryOne<{ id: string; email: string }>('SELECT id, email FROM captain_accounts LIMIT 1');
  if (!captain) {
    res.status(404).json({ error: 'Captain account not found' });
    return;
  }
  const token = jwt.sign({ id: captain.id, email: captain.email }, JWT_SECRET, {
    expiresIn: '7d',
  });
  res.json({
    token,
    captain: {
      id: captain.id,
      email: captain.email,
      username: captain.email.split('@')[0],
      display_name: 'Team Captain',
    },
  });
});

apiRouter.get('/auth/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.json({ authenticated: false });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
    const captain = queryOne<{ id: string; email: string }>(
      'SELECT id, email FROM captain_accounts WHERE id = ?',
      [decoded.id]
    );
    if (!captain) {
      res.json({ authenticated: false });
      return;
    }
    res.json({
      authenticated: true,
      captain: {
        id: captain.id,
        email: captain.email,
        username: captain.email.split('@')[0],
        display_name: 'Team Captain',
      },
    });
  } catch (err) {
    res.json({ authenticated: false });
  }
});

// ----------------------------------------------------
// PLAYERS MANAGEMENT
// ----------------------------------------------------
apiRouter.get('/players', (req: Request, res: Response) => {
  const search = ((req.query.search as string) || '').trim().toLowerCase();
  const position = req.query.position as string;
  const skill = req.query.skill as string;
  const includeArchived = req.query.includeArchived === 'true';

  let sql = `
    SELECT id, full_name, full_name as name, position, skill_level,
           active as is_active,
           CASE WHEN archived_at IS NOT NULL THEN 1 ELSE 0 END as is_archived,
           created_at, updated_at, archived_at
    FROM players
    WHERE 1=1
  `;
  const params: any[] = [];

  if (!includeArchived) {
    sql += ' AND archived_at IS NULL';
  }
  if (position && position !== 'ALL') {
    sql += ' AND position = ?';
    params.push(position);
  }
  if (skill && skill !== 'ALL') {
    sql += ' AND skill_level = ?';
    params.push(skill);
  }
  if (search) {
    sql += ' AND (LOWER(full_name) LIKE ? OR LOWER(id) LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY position, skill_level, full_name';

  const players = queryAll<any>(sql, params);
  res.json({ players });
});

apiRouter.post('/players', requireCaptainAuth, (req: Request, res: Response) => {
  const { name, full_name, position, skill_level } = req.body;
  const playerName = (full_name || name || '').trim();

  if (!playerName || !position || !skill_level) {
    res.status(400).json({ error: 'Player name, valid position, and skill level are required.' });
    return;
  }

  if (!['Striker', 'Midfielder', 'Defender'].includes(position)) {
    res.status(400).json({ error: 'Position must be Striker, Midfielder, or Defender.' });
    return;
  }

  if (!['Top', 'Medium', 'Normal'].includes(skill_level)) {
    res.status(400).json({ error: 'Skill level must be Top, Medium, or Normal.' });
    return;
  }

  const countRes = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM players');
  const nextNum = (countRes?.cnt || 0) + 1;
  const id = `PLY-${String(nextNum).padStart(3, '0')}`;
  const now = new Date().toISOString();

  run(
    `INSERT INTO players (id, full_name, position, skill_level, active, created_at, updated_at, archived_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, NULL);`,
    [id, playerName, position, skill_level, now, now]
  );

  logAudit('PLAYER_CREATED', 'PLAYER', id, { full_name: playerName, position, skill_level });

  const created = queryOne<any>(
    'SELECT id, full_name, full_name as name, position, skill_level, active as is_active, created_at, updated_at FROM players WHERE id = ?',
    [id]
  );
  res.status(201).json({ player: created });
});

apiRouter.put('/players/:id', requireCaptainAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, full_name, position, skill_level, is_active, active } = req.body;
  const targetName = full_name || name;
  const targetActive = active !== undefined ? active : is_active;

  const existing = queryOne<any>('SELECT * FROM players WHERE id = ?', [id]);
  if (!existing) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }

  if (position && !['Striker', 'Midfielder', 'Defender'].includes(position)) {
    res.status(400).json({ error: 'Invalid position' });
    return;
  }

  if (skill_level && !['Top', 'Medium', 'Normal'].includes(skill_level)) {
    res.status(400).json({ error: 'Invalid skill level' });
    return;
  }

  const now = new Date().toISOString();
  run(
    `UPDATE players
     SET full_name = COALESCE(?, full_name),
         position = COALESCE(?, position),
         skill_level = COALESCE(?, skill_level),
         active = COALESCE(?, active),
         updated_at = ?
     WHERE id = ?;`,
    [
      targetName ? targetName.trim() : null,
      position || null,
      skill_level || null,
      targetActive !== undefined ? (targetActive ? 1 : 0) : null,
      now,
      id,
    ]
  );

  logAudit('PLAYER_UPDATED', 'PLAYER', id, { previous: existing, updated: req.body });

  const updated = queryOne<any>(
    'SELECT id, full_name, full_name as name, position, skill_level, active as is_active, created_at, updated_at FROM players WHERE id = ?',
    [id]
  );
  res.json({ player: updated });
});

apiRouter.delete('/players/:id', requireCaptainAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const permanent = req.query.permanent === 'true';

  const existing = queryOne<any>('SELECT * FROM players WHERE id = ?', [id]);
  if (!existing) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }

  if (permanent) {
    run('DELETE FROM players WHERE id = ?;', [id]);
    logAudit('PLAYER_DELETED_PERMANENT', 'PLAYER', id, { name: existing.full_name });
  } else {
    // Preserve history when players are archived
    const now = new Date().toISOString();
    run('UPDATE players SET archived_at = ?, active = 0, updated_at = ? WHERE id = ?;', [now, now, id]);
    logAudit('PLAYER_ARCHIVED', 'PLAYER', id, { name: existing.full_name });
  }

  res.json({ success: true, message: `Player ${existing.full_name} archived successfully.` });
});

// ----------------------------------------------------
// WEEKLY SESSIONS & ATTENDANCE
// ----------------------------------------------------
apiRouter.get('/sessions', (req: Request, res: Response) => {
  const sessions = queryAll<any>(
    `SELECT id, session_date, status, attendance_deadline, generation_time,
            generation_time as scheduled_time,
            ('Match Session — ' || session_date) as title,
            locked_at, created_at, updated_at
     FROM weekly_sessions
     ORDER BY session_date DESC`
  );
  res.json({ sessions });
});

apiRouter.get('/sessions/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const session = queryOne<any>(
    `SELECT id, session_date, status, attendance_deadline, generation_time,
            generation_time as scheduled_time,
            ('Match Session — ' || session_date) as title,
            locked_at, created_at, updated_at
     FROM weekly_sessions
     WHERE id = ?`,
    [id]
  );

  if (!session) {
    res.status(404).json({ error: 'Weekly session not found' });
    return;
  }

  // Attendance records
  const attendanceSql = `
    SELECT ar.id, ar.weekly_session_id as session_id, ar.player_id,
           UPPER(ar.status) as status,
           ar.notes as reason, ar.confirmed_at, ar.updated_at,
           p.full_name as name, p.position, p.skill_level, p.active as is_active
    FROM attendance_records ar
    JOIN players p ON ar.player_id = p.id
    WHERE ar.weekly_session_id = ?
    ORDER BY p.position, p.full_name
  `;
  const attendance = queryAll<any>(attendanceSql, [id]);

  // Team assignments
  const assignmentsSql = `
    SELECT ta.id, ta.weekly_session_id as session_id, ta.team_name as team_id,
           ta.player_id, ta.original_player_id,
           ta.is_replacement as is_temporary_replacement, ta.created_at,
           p.full_name as name, p.position, p.skill_level,
           orig.full_name as original_player_name
    FROM team_assignments ta
    JOIN players p ON ta.player_id = p.id
    LEFT JOIN players orig ON ta.original_player_id = orig.id
    WHERE ta.weekly_session_id = ?
    ORDER BY ta.team_name, p.position, p.full_name
  `;
  const assignments = queryAll<any>(assignmentsSql, [id]);

  // Latest generation run
  const runRecord = queryOne<any>(
    'SELECT * FROM team_generation_runs WHERE weekly_session_id = ? ORDER BY created_at DESC LIMIT 1',
    [id]
  );

  let balanceMetadata = null;
  if (runRecord && runRecord.generation_summary) {
    try {
      const summary = JSON.parse(runRecord.generation_summary);
      balanceMetadata = JSON.stringify(summary.balance || summary);
    } catch (_) {}
  }

  const weeklyTeamsRecord = {
    session_id: id,
    is_locked: session.locked_at !== null || session.status === 'teams_locked',
    locked_at: session.locked_at,
    balance_metadata: balanceMetadata,
  };

  // Matches for this session
  const matches = queryAll<any>(
    `SELECT id, weekly_session_id as session_id, match_number,
            team_a as team_home, team_b as team_away, waiting_team,
            team_a_score as score_home, team_b_score as score_away,
            winner_team, UPPER(status) as status,
            elapsed_seconds, 900 as duration_seconds,
            started_at, paused_at, ended_at, created_at, updated_at
     FROM matches
     WHERE weekly_session_id = ?
     ORDER BY match_number ASC`,
    [id]
  );

  res.json({
    session,
    attendance,
    assignments,
    weeklyTeamsRecord,
    matches,
  });
});

apiRouter.post('/sessions', requireCaptainAuth, (req: Request, res: Response) => {
  const { session_date } = req.body;
  if (!session_date) {
    res.status(400).json({ error: 'Session date is required (YYYY-MM-DD)' });
    return;
  }

  const id = `WS-${session_date}`;
  const existing = queryOne('SELECT id FROM weekly_sessions WHERE session_date = ? OR id = ?', [
    session_date,
    id,
  ]);
  if (existing) {
    res.status(400).json({ error: 'A weekly session already exists for this date.' });
    return;
  }

  const now = new Date().toISOString();

  transaction(() => {
    run(
      `INSERT INTO weekly_sessions (id, session_date, status, attendance_deadline, generation_time, locked_at, created_at, updated_at)
       VALUES (?, ?, 'attendance_open', '14:30', '15:00', NULL, ?, ?);`,
      [id, session_date, now, now]
    );

    // Seed attendance records for all active players (pending)
    const activePlayers = queryAll<any>('SELECT id FROM players WHERE active = 1 AND archived_at IS NULL');
    for (const p of activePlayers) {
      run(
        `INSERT INTO attendance_records (id, weekly_session_id, player_id, status, notes, confirmed_at, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', '', NULL, ?, ?);`,
        [`ATT-${id}-${p.id}`, id, p.id, now, now]
      );
    }
  });

  logAudit('SESSION_CREATED', 'WEEKLY_SESSION', id, { session_date });

  const created = queryOne<any>('SELECT * FROM weekly_sessions WHERE id = ?', [id]);
  res.status(201).json({ session: created });
});

apiRouter.put('/sessions/:id/attendance', requireCaptainAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const { player_id, status, reason, notes, bulk_player_ids } = req.body;

  const session = queryOne('SELECT id FROM weekly_sessions WHERE id = ?', [id]);
  if (!session) {
    res.status(404).json({ error: 'Weekly session not found' });
    return;
  }

  const now = new Date().toISOString();
  const noteText = notes || reason || '';

  // Standardize status to lowercase ('available', 'pending', 'absent', 'injured')
  const mapStatus = (st: string) => {
    const s = (st || '').toLowerCase();
    if (s === 'confirmed' || s === 'available') return 'available';
    if (s === 'absent') return 'absent';
    if (s === 'injured') return 'injured';
    return 'pending';
  };

  const targetStatus = mapStatus(status);

  if (Array.isArray(bulk_player_ids) && bulk_player_ids.length > 0) {
    transaction(() => {
      for (const pId of bulk_player_ids) {
        run(
          `INSERT INTO attendance_records (id, weekly_session_id, player_id, status, notes, confirmed_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(weekly_session_id, player_id) DO UPDATE SET
             status = excluded.status,
             notes = excluded.notes,
             confirmed_at = excluded.confirmed_at,
             updated_at = excluded.updated_at;`,
          [
            `ATT-${id}-${pId}`,
            id,
            pId,
            targetStatus,
            noteText,
            targetStatus === 'available' ? now : null,
            now,
            now,
          ]
        );
      }
    });

    logAudit('ATTENDANCE_BULK_UPDATE', 'ATTENDANCE', id, { count: bulk_player_ids.length, status: targetStatus });
    res.json({ success: true, count: bulk_player_ids.length });
    return;
  }

  if (!player_id) {
    res.status(400).json({ error: 'player_id is required' });
    return;
  }

  run(
    `INSERT INTO attendance_records (id, weekly_session_id, player_id, status, notes, confirmed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(weekly_session_id, player_id) DO UPDATE SET
       status = excluded.status,
       notes = excluded.notes,
       confirmed_at = excluded.confirmed_at,
       updated_at = excluded.updated_at;`,
    [
      `ATT-${id}-${player_id}`,
      id,
      player_id,
      targetStatus,
      noteText,
      targetStatus === 'available' ? now : null,
      now,
      now,
    ]
  );

  logAudit('ATTENDANCE_UPDATED', 'ATTENDANCE', `${id}:${player_id}`, { status: targetStatus, notes: noteText });

  res.json({ success: true });
});

// ----------------------------------------------------
// TEAM GENERATOR & BALANCING
// ----------------------------------------------------
apiRouter.post('/sessions/:id/generate-teams', requireCaptainAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const { include_pending } = req.body;

  const session = queryOne<any>('SELECT * FROM weekly_sessions WHERE id = ?', [id]);
  if (!session) {
    res.status(404).json({ error: 'Weekly session not found' });
    return;
  }

  if (session.locked_at !== null || session.status === 'teams_locked') {
    res.status(400).json({ error: 'Cannot regenerate teams while current teams are LOCKED. Please unlock first.' });
    return;
  }

  const allowedStatuses = ["'available'"];
  if (include_pending) allowedStatuses.push("'pending'");

  const playersSql = `
    SELECT p.id, p.full_name as name, p.position, p.skill_level, ar.status as attendance_status
    FROM players p
    JOIN attendance_records ar ON p.id = ar.player_id
    WHERE ar.weekly_session_id = ?
      AND p.active = 1
      AND p.archived_at IS NULL
      AND ar.status IN (${allowedStatuses.join(',')})
  `;
  const eligiblePlayers = queryAll<any>(playersSql, [id]);

  if (eligiblePlayers.length < 3) {
    res.status(400).json({
      error: `Not enough available players to generate 3 teams (Found ${eligiblePlayers.length}, minimum 3 needed).`,
    });
    return;
  }

  const generated = generateBalancedTeams(eligiblePlayers, id);
  const now = new Date().toISOString();

  transaction(() => {
    // Clear previous assignments for this session
    run('DELETE FROM team_assignments WHERE weekly_session_id = ?;', [id]);

    // Insert new assignments across Team A, B, C (enforces UNIQUE(weekly_session_id, player_id))
    (['A', 'B', 'C'] as const).forEach((teamName) => {
      const team = generated.teams[teamName];
      for (const p of team.players) {
        run(
          `INSERT INTO team_assignments (id, weekly_session_id, player_id, team_name, is_replacement, original_player_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, 0, NULL, ?, ?);`,
          [`TA-${id}-${p.id}`, id, p.id, teamName, now, now]
        );
      }
    });

    // Record in team_generation_runs (retains full history without erasing prior runs)
    const runId = `TGR-${id}-${Date.now()}`;
    run(
      `INSERT INTO team_generation_runs (id, weekly_session_id, algorithm_version, random_seed, generation_summary, created_at)
       VALUES (?, ?, '2.0.0', ?, ?, ?);`,
      [
        runId,
        id,
        generated.balance_explanation.seed,
        JSON.stringify({ teams: generated.teams, balance: generated.balance_explanation }),
        now,
      ]
    );

    // Update session status
    run(`UPDATE weekly_sessions SET status = 'teams_generated', updated_at = ? WHERE id = ?;`, [now, id]);
  });

  logAudit('TEAMS_GENERATED', 'WEEKLY_SESSION', id, {
    fairness_rating: generated.balance_explanation.overall_fairness_rating,
    players_count: eligiblePlayers.length,
  });

  res.json({ result: generated });
});

// Move / Swap Player between teams
apiRouter.put('/sessions/:id/teams/move', requireCaptainAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const { player_id, target_team_id, target_team_name, swap_with_player_id } = req.body;
  const targetTeam = target_team_name || target_team_id;

  const session = queryOne<any>('SELECT locked_at, status FROM weekly_sessions WHERE id = ?', [id]);
  if (session && (session.locked_at !== null || session.status === 'teams_locked')) {
    res.status(400).json({ error: 'Cannot move players while teams are locked. Please unlock first.' });
    return;
  }

  const currentAssignment = queryOne<any>(
    'SELECT * FROM team_assignments WHERE weekly_session_id = ? AND player_id = ?',
    [id, player_id]
  );
  if (!currentAssignment) {
    res.status(404).json({ error: 'Player is not currently assigned to a team in this session.' });
    return;
  }

  const now = new Date().toISOString();

  if (swap_with_player_id) {
    const swapAssignment = queryOne<any>(
      'SELECT * FROM team_assignments WHERE weekly_session_id = ? AND player_id = ?',
      [id, swap_with_player_id]
    );
    if (!swapAssignment) {
      res.status(404).json({ error: 'Target swap player is not assigned.' });
      return;
    }

    transaction(() => {
      run('UPDATE team_assignments SET team_name = ?, updated_at = ? WHERE weekly_session_id = ? AND player_id = ?;', [
        swapAssignment.team_name,
        now,
        id,
        player_id,
      ]);
      run('UPDATE team_assignments SET team_name = ?, updated_at = ? WHERE weekly_session_id = ? AND player_id = ?;', [
        currentAssignment.team_name,
        now,
        id,
        swap_with_player_id,
      ]);
    });

    logAudit('PLAYERS_SWAPPED', 'TEAM_ASSIGNMENT', id, {
      player_1: player_id,
      team_1: currentAssignment.team_name,
      player_2: swap_with_player_id,
      team_2: swapAssignment.team_name,
    });

    res.json({ success: true, message: 'Players swapped successfully.' });
    return;
  }

  if (targetTeam) {
    run('UPDATE team_assignments SET team_name = ?, updated_at = ? WHERE weekly_session_id = ? AND player_id = ?;', [
      targetTeam,
      now,
      id,
      player_id,
    ]);
    logAudit('PLAYER_MOVED', 'TEAM_ASSIGNMENT', id, { player_id, from: currentAssignment.team_name, to: targetTeam });
    res.json({ success: true, message: `Player moved to Team ${targetTeam}.` });
    return;
  }

  res.status(400).json({ error: 'target_team_name or swap_with_player_id is required' });
});

// Lock / Unlock Teams
apiRouter.post('/sessions/:id/teams/lock', requireCaptainAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const { lock } = req.body;
  const now = new Date().toISOString();

  run(
    `UPDATE weekly_sessions
     SET locked_at = ?,
         status = ?,
         updated_at = ?
     WHERE id = ?;`,
    [lock ? now : null, lock ? 'teams_locked' : 'teams_generated', now, id]
  );

  logAudit(lock ? 'TEAMS_LOCKED' : 'TEAMS_UNLOCKED', 'WEEKLY_SESSION', id);

  res.json({ success: true, is_locked: !!lock });
});

// ----------------------------------------------------
// PLAYER REPLACEMENTS
// ----------------------------------------------------
apiRouter.get('/sessions/:id/replacements/recommendations', (req: Request, res: Response) => {
  const { id } = req.params;
  const playerId = req.query.player_id as string;

  if (!playerId) {
    res.status(400).json({ error: 'player_id is required' });
    return;
  }

  const targetPlayer = queryOne<any>('SELECT id, full_name, full_name as name, position, skill_level FROM players WHERE id = ?', [playerId]);
  if (!targetPlayer) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }

  // Unassigned eligible players
  const candidateSql = `
    SELECT p.id, p.full_name as name, p.position, p.skill_level,
           (SELECT COUNT(*) FROM player_participation pp WHERE pp.player_id = p.id) as total_matches,
           COALESCE(ar.status, 'pending') as attendance_status
    FROM players p
    LEFT JOIN attendance_records ar ON p.id = ar.player_id AND ar.weekly_session_id = ?
    WHERE p.active = 1
      AND p.archived_at IS NULL
      AND p.id != ?
      AND p.id NOT IN (SELECT player_id FROM team_assignments WHERE weekly_session_id = ?)
      AND (ar.status IS NULL OR ar.status NOT IN ('absent', 'injured'))
  `;
  const candidates = queryAll<any>(candidateSql, [id, playerId, id]);

  const scored = candidates.map((c) => {
    let score = 100;
    const samePosition = c.position === targetPlayer.position;
    const sameSkill = c.skill_level === targetPlayer.skill_level;

    if (samePosition) score += 40;
    else score -= 20;

    if (sameSkill) score += 30;
    else if (
      (targetPlayer.skill_level === 'Top' && c.skill_level === 'Medium') ||
      (targetPlayer.skill_level === 'Normal' && c.skill_level === 'Medium')
    ) {
      score += 15;
    }

    score -= (c.total_matches || 0) * 2;

    let compromiseNote = '';
    if (!samePosition && !sameSkill) {
      compromiseNote = `Different position (${c.position}) and skill (${c.skill_level})`;
    } else if (!samePosition) {
      compromiseNote = `Plays ${c.position} instead of ${targetPlayer.position}`;
    } else if (!sameSkill) {
      compromiseNote = `${c.skill_level} skill instead of ${targetPlayer.skill_level}`;
    }

    return {
      player: c,
      score,
      same_position: samePosition,
      same_skill: sameSkill,
      compromise_note: compromiseNote,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  res.json({
    original_player: targetPlayer,
    recommendations: scored,
  });
});

apiRouter.post('/sessions/:id/replacements', requireCaptainAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const { original_player_id, replacement_player_id, replacement_type, reason, end_date } = req.body;

  if (!original_player_id || !replacement_player_id || !replacement_type || !reason) {
    res.status(400).json({ error: 'All replacement parameters are required.' });
    return;
  }

  const type = (replacement_type || '').toLowerCase();
  if (!['temporary', 'permanent'].includes(type)) {
    res.status(400).json({ error: 'replacement_type must be temporary or permanent' });
    return;
  }

  // Prevent duplicate assignment in this session
  const alreadyAssigned = queryOne('SELECT id FROM team_assignments WHERE weekly_session_id = ? AND player_id = ?', [
    id,
    replacement_player_id,
  ]);
  if (alreadyAssigned) {
    res.status(400).json({ error: 'Replacement player is already assigned to a team in this session.' });
    return;
  }

  const existingAssignment = queryOne<any>(
    'SELECT * FROM team_assignments WHERE weekly_session_id = ? AND player_id = ?',
    [id, original_player_id]
  );
  if (!existingAssignment) {
    res.status(400).json({ error: 'Original player is not currently assigned to a team.' });
    return;
  }

  const now = new Date().toISOString();
  const repId = `REP-${Date.now()}`;

  transaction(() => {
    // Insert replacement audit record
    run(
      `INSERT INTO player_replacements (id, weekly_session_id, original_player_id, replacement_player_id, replacement_type, reason, start_date, end_date, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?);`,
      [
        repId,
        id,
        original_player_id,
        replacement_player_id,
        type,
        reason,
        now.split('T')[0],
        end_date || null,
        now,
        now,
      ]
    );

    // Update assignment to replacement player
    run(
      `UPDATE team_assignments
       SET player_id = ?, original_player_id = ?, is_replacement = 1, updated_at = ?
       WHERE weekly_session_id = ? AND player_id = ?;`,
      [replacement_player_id, original_player_id, now, id, original_player_id]
    );

    if (type === 'permanent') {
      run('UPDATE players SET active = 0, updated_at = ? WHERE id = ?;', [now, original_player_id]);
      run('UPDATE players SET active = 1, updated_at = ? WHERE id = ?;', [now, replacement_player_id]);
    }
  });

  logAudit('PLAYER_REPLACED', 'PLAYER_REPLACEMENT', repId, {
    original_player_id,
    replacement_player_id,
    type,
    reason,
  });

  res.status(201).json({ success: true, replacement_id: repId });
});

apiRouter.post('/replacements/:id/reverse', requireCaptainAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const replacement = queryOne<any>('SELECT * FROM player_replacements WHERE id = ?', [id]);
  if (!replacement) {
    res.status(404).json({ error: 'Replacement not found' });
    return;
  }
  if (replacement.status === 'reversed') {
    res.status(400).json({ error: 'This replacement has already been reversed.' });
    return;
  }

  const now = new Date().toISOString();

  transaction(() => {
    // Restore team assignment
    run(
      `UPDATE team_assignments
       SET player_id = ?, original_player_id = NULL, is_replacement = 0, updated_at = ?
       WHERE weekly_session_id = ? AND player_id = ?;`,
      [replacement.original_player_id, now, replacement.weekly_session_id, replacement.replacement_player_id]
    );

    // Mark replacement reversed
    run('UPDATE player_replacements SET status = "reversed", updated_at = ? WHERE id = ?;', [now, id]);

    if (replacement.replacement_type === 'permanent') {
      run('UPDATE players SET active = 1, updated_at = ? WHERE id = ?;', [now, replacement.original_player_id]);
    }
  });

  logAudit('REPLACEMENT_REVERSED', 'PLAYER_REPLACEMENT', id);

  res.json({ success: true, message: 'Replacement reversed and original player restored.' });
});

apiRouter.get('/replacements', (req: Request, res: Response) => {
  const sql = `
    SELECT pr.id, pr.weekly_session_id as session_id,
           pr.original_player_id, pr.replacement_player_id,
           pr.replacement_type, pr.reason, pr.start_date, pr.end_date,
           pr.status, (pr.status = 'reversed') as is_reversed,
           pr.created_at, pr.updated_at,
           orig.full_name as original_player_name, orig.position as original_position,
           rep.full_name as replacement_player_name, rep.position as replacement_position
    FROM player_replacements pr
    JOIN players orig ON pr.original_player_id = orig.id
    JOIN players rep ON pr.replacement_player_id = rep.id
    ORDER BY pr.created_at DESC
  `;
  const list = queryAll<any>(sql);
  res.json({ replacements: list });
});

// ----------------------------------------------------
// MATCHES & ROTATION
// ----------------------------------------------------
apiRouter.post('/sessions/:id/matches/start', requireCaptainAuth, (req: Request, res: Response) => {
  const { id } = req.params;

  const existing = queryOne('SELECT id FROM matches WHERE weekly_session_id = ? AND status != "completed"', [id]);
  if (existing) {
    res.status(400).json({ error: 'A match is already pending or running for this session.' });
    return;
  }

  const matchCount = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM matches WHERE weekly_session_id = ?', [id]);
  const matchNumber = (matchCount?.cnt || 0) + 1;
  const now = new Date().toISOString();

  const matchId = `MAT-${id}-${matchNumber}`;
  run(
    `INSERT INTO matches (id, weekly_session_id, match_number, team_a, team_b, waiting_team, winner_team, loser_team, team_a_score, team_b_score, status, started_at, paused_at, ended_at, elapsed_seconds, created_at, updated_at)
     VALUES (?, ?, ?, 'A', 'B', 'C', NULL, NULL, 0, 0, 'pending', NULL, NULL, NULL, 0, ?, ?);`,
    [matchId, id, matchNumber, now, now]
  );

  logAudit('MATCH_INITIALIZED', 'MATCH', matchId, { match_number: matchNumber });

  const match = queryOne<any>(
    `SELECT id, weekly_session_id as session_id, match_number,
            team_a as team_home, team_b as team_away, waiting_team,
            team_a_score as score_home, team_b_score as score_away,
            status, elapsed_seconds, 900 as duration_seconds,
            created_at, updated_at
     FROM matches WHERE id = ?`,
    [matchId]
  );
  res.status(201).json({ match });
});

apiRouter.post('/matches/:id/control', requireCaptainAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const { action, score_home, score_away, winner_team, override_next_away } = req.body;

  const match = queryOne<any>('SELECT * FROM matches WHERE id = ?', [id]);
  if (!match) {
    res.status(404).json({ error: 'Match not found' });
    return;
  }

  const now = new Date().toISOString();

  if (action === 'START' || action === 'RESUME') {
    run(
      `UPDATE matches
       SET status = 'in_progress', started_at = COALESCE(started_at, ?), paused_at = NULL, updated_at = ?
       WHERE id = ?;`,
      [now, now, id]
    );
    logAudit('MATCH_RESUMED', 'MATCH', id);
  } else if (action === 'PAUSE') {
    run(
      `UPDATE matches
       SET status = 'paused', paused_at = ?, updated_at = ?
       WHERE id = ?;`,
      [now, now, id]
    );
    logAudit('MATCH_PAUSED', 'MATCH', id);
  } else if (action === 'UPDATE_SCORE') {
    run(
      `UPDATE matches
       SET team_a_score = ?, team_b_score = ?, updated_at = ?
       WHERE id = ?;`,
      [score_home !== undefined ? score_home : match.team_a_score, score_away !== undefined ? score_away : match.team_b_score, now, id]
    );
  } else if (action === 'FINISH') {
    let winner = winner_team ? winner_team.toUpperCase() : null;
    let loser = 'none';

    if (!winner) {
      if ((score_home !== undefined ? score_home : match.team_a_score) > (score_away !== undefined ? score_away : match.team_b_score)) {
        winner = match.team_a;
        loser = match.team_b;
      } else if ((score_away !== undefined ? score_away : match.team_b_score) > (score_home !== undefined ? score_home : match.team_a_score)) {
        winner = match.team_b;
        loser = match.team_a;
      } else {
        winner = 'draw';
        loser = 'none';
      }
    } else {
      if (winner === match.team_a) loser = match.team_b;
      else if (winner === match.team_b) loser = match.team_a;
    }

    transaction(() => {
      run(
        `UPDATE matches
         SET status = 'completed', winner_team = ?, loser_team = ?, team_a_score = ?, team_b_score = ?, ended_at = ?, elapsed_seconds = 900, updated_at = ?
         WHERE id = ?;`,
        [winner, loser, score_home !== undefined ? score_home : match.team_a_score, score_away !== undefined ? score_away : match.team_b_score, now, now, id]
      );

      // Record player participation for active match
      const assignments = queryAll<any>(
        'SELECT player_id, team_name FROM team_assignments WHERE weekly_session_id = ? AND team_name IN (?, ?)',
        [match.weekly_session_id, match.team_a, match.team_b]
      );

      for (const a of assignments) {
        run(
          `INSERT INTO player_participation (id, weekly_session_id, match_id, player_id, team_name, participation_status, playing_seconds, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'played', 900, ?, ?);`,
          [`PP-${match.id}-${a.player_id}`, match.weekly_session_id, match.id, a.player_id, a.team_name, now, now]
        );
      }

      // Calculate next matchup: Winner stays! Loser rotates to bench. Waiting team enters.
      let nextTeamA: string;
      let nextTeamB: string = match.waiting_team;
      let nextWaiting: string;

      if (winner === match.team_a) {
        nextTeamA = match.team_a;
        nextWaiting = match.team_b;
      } else if (winner === match.team_b) {
        nextTeamA = match.team_b;
        nextWaiting = match.team_a;
      } else {
        // Draw: home team stays by default
        nextTeamA = match.team_a;
        nextWaiting = match.team_b;
      }

      if (override_next_away) {
        nextTeamB = override_next_away;
      }

      const nextNum = match.match_number + 1;
      const nextMatchId = `MAT-${match.weekly_session_id}-${nextNum}`;

      run(
        `INSERT INTO matches (id, weekly_session_id, match_number, team_a, team_b, waiting_team, winner_team, loser_team, team_a_score, team_b_score, status, started_at, paused_at, ended_at, elapsed_seconds, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 0, 0, 'pending', NULL, NULL, NULL, 0, ?, ?);`,
        [nextMatchId, match.weekly_session_id, nextNum, nextTeamA, nextTeamB, nextWaiting, now, now]
      );
    });

    logAudit('MATCH_FINISHED', 'MATCH', id, { winner, loser });
  }

  const updatedMatch = queryOne<any>(
    `SELECT id, weekly_session_id as session_id, match_number,
            team_a as team_home, team_b as team_away, waiting_team,
            team_a_score as score_home, team_b_score as score_away,
            winner_team, UPPER(status) as status,
            elapsed_seconds, 900 as duration_seconds,
            started_at, paused_at, ended_at, created_at, updated_at
     FROM matches WHERE id = ?`,
    [id]
  );
  res.json({ match: updatedMatch });
});

// ----------------------------------------------------
// FAIR PARTICIPATION STATISTICS
// ----------------------------------------------------
apiRouter.get('/statistics', (req: Request, res: Response) => {
  const players = queryAll<any>('SELECT id, full_name as player_name, position, skill_level FROM players WHERE archived_at IS NULL ORDER BY full_name');

  const statsSql = `
    SELECT p.id as player_id,
           COUNT(pp.id) as matches_played,
           COALESCE(SUM(pp.playing_seconds), 0) / 60 as total_minutes
    FROM players p
    LEFT JOIN player_participation pp ON p.id = pp.player_id
    GROUP BY p.id
  `;
  const matchStats = queryAll<any>(statsSql);
  const matchStatsMap = new Map(matchStats.map((s) => [s.player_id, s]));

  const totalClubMatches = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM matches WHERE status = "completed"')?.cnt || 0;

  const result = players.map((p) => {
    const s = matchStatsMap.get(p.id);
    const played = s ? s.matches_played : 0;
    const minutes = s ? s.total_minutes : 0;
    const satOut = Math.max(0, totalClubMatches - played);
    const fairnessRatio = totalClubMatches > 0 ? Number(((played / totalClubMatches) * 100).toFixed(1)) : 100;

    return {
      player_id: p.id,
      player_name: p.player_name,
      position: p.position,
      skill_level: p.skill_level,
      total_matches_played: played,
      total_matches_sat_out: satOut,
      total_playing_minutes: minutes,
      attendance_count: played,
      temporary_replacement_count: 0,
      fairness_ratio: fairnessRatio,
    };
  });

  res.json({
    total_club_matches: totalClubMatches,
    player_statistics: result,
  });
});

// ----------------------------------------------------
// SCHEDULING SETTINGS & APP SETTINGS
// ----------------------------------------------------
apiRouter.get('/settings', (req: Request, res: Response) => {
  const settings = queryOne<any>(
    `SELECT id, day_of_week,
            generation_time, generation_time as match_time,
            attendance_deadline, attendance_deadline as confirmation_deadline_time,
            timezone,
            automatic_generation_enabled as auto_generation_enabled,
            captain_approval_required as require_captain_approval,
            unconfirmed_player_policy as unconfirmed_handling,
            updated_at
     FROM scheduling_settings WHERE id = 'default'`
  );
  res.json({ settings });
});

apiRouter.put('/settings', requireCaptainAuth, (req: Request, res: Response) => {
  const {
    day_of_week,
    match_time,
    generation_time,
    timezone,
    confirmation_deadline_time,
    attendance_deadline,
    auto_generation_enabled,
    automatic_generation_enabled,
    require_captain_approval,
    captain_approval_required,
    unconfirmed_handling,
    unconfirmed_player_policy,
  } = req.body;

  const genTime = generation_time || match_time;
  const deadTime = attendance_deadline || confirmation_deadline_time;
  const autoGen = automatic_generation_enabled !== undefined ? automatic_generation_enabled : auto_generation_enabled;
  const capApproval = captain_approval_required !== undefined ? captain_approval_required : require_captain_approval;
  const unconfPolicy = unconfirmed_player_policy || unconfirmed_handling;

  const now = new Date().toISOString();
  run(
    `UPDATE scheduling_settings
     SET day_of_week = COALESCE(?, day_of_week),
         generation_time = COALESCE(?, generation_time),
         attendance_deadline = COALESCE(?, attendance_deadline),
         timezone = COALESCE(?, timezone),
         automatic_generation_enabled = COALESCE(?, automatic_generation_enabled),
         captain_approval_required = COALESCE(?, captain_approval_required),
         unconfirmed_player_policy = COALESCE(?, unconfirmed_player_policy),
         updated_at = ?
     WHERE id = 'default';`,
    [
      day_of_week || null,
      genTime || null,
      deadTime || null,
      timezone || null,
      autoGen !== undefined ? (autoGen ? 1 : 0) : null,
      capApproval !== undefined ? (capApproval ? 1 : 0) : null,
      unconfPolicy || null,
      now,
    ]
  );

  logAudit('SETTINGS_UPDATED', 'SCHEDULING_SETTINGS', 'default', req.body);

  const updated = queryOne<any>(
    `SELECT id, day_of_week,
            generation_time, generation_time as match_time,
            attendance_deadline, attendance_deadline as confirmation_deadline_time,
            timezone,
            automatic_generation_enabled as auto_generation_enabled,
            captain_approval_required as require_captain_approval,
            unconfirmed_player_policy as unconfirmed_handling,
            updated_at
     FROM scheduling_settings WHERE id = 'default'`
  );
  res.json({ settings: updated });
});

// ----------------------------------------------------
// AUDIT LOGS
// ----------------------------------------------------
apiRouter.get('/audit-logs', requireCaptainAuth, (req: Request, res: Response) => {
  const logs = queryAll<any>(
    `SELECT id, captain_account_id, action as action_type,
            (action || ' on ' || entity_type || ' (' || entity_id || ')') as description,
            entity_type, entity_id, details_json, created_at as timestamp,
            'Captain' as actor
     FROM audit_logs
     ORDER BY created_at DESC
     LIMIT 200`
  );
  res.json({ logs });
});

// ----------------------------------------------------
// BACKUP AND RESTORE
// ----------------------------------------------------
apiRouter.get('/backup', requireCaptainAuth, (req: Request, res: Response) => {
  const backup = exportDatabaseBackup();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="pitchmaster_backup_${Date.now()}.json"`);
  res.json(backup);
});

apiRouter.post('/restore', requireCaptainAuth, (req: Request, res: Response) => {
  const result = restoreDatabaseBackup(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error || 'Failed to restore database.' });
    return;
  }
  res.json({ success: true, message: 'Database restored successfully.' });
});
