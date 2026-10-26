import fs from 'fs';
import path from 'path';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { runMigrations } from './migrations.js';
import { seedDatabase } from './seed.js';

// Resolve project root deterministically
const PROJECT_ROOT = process.cwd();

// Configure the database path using DATABASE_PATH env var, defaulting to ./data/football-manager.db
const rawDbPath = process.env.DATABASE_PATH || './data/football-manager.db';
export const DB_FILE = path.isAbsolute(rawDbPath)
  ? rawDbPath
  : path.resolve(PROJECT_ROOT, rawDbPath);
export const DB_DIR = path.dirname(DB_FILE);

let dbInstance: SqlJsDatabase | null = null;

export async function getDb(): Promise<SqlJsDatabase> {
  if (dbInstance) return dbInstance;

  // Create parent directory automatically if necessary
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    console.log(`[Database] Created directory: ${DB_DIR}`);
  }

  const SQL = await initSqlJs();

  // Load existing database without overwriting, or create new if not present
  if (fs.existsSync(DB_FILE)) {
    const fileBuffer = fs.readFileSync(DB_FILE);
    dbInstance = new SQL.Database(fileBuffer);
    console.log(`[Database] Loaded existing database from ${DB_FILE}`);
  } else {
    dbInstance = new SQL.Database();
    console.log(`[Database] Initialized new SQLite database at ${DB_FILE}`);
  }

  // Always enable foreign-key enforcement
  dbInstance.run('PRAGMA foreign_keys = ON;');

  // Run versioned migrations
  runMigrations(dbInstance);

  // Seed sample data if database is fresh
  seedDatabase(dbInstance);

  // Persist to disk
  persistDb();

  // Ensure foreign keys remain enabled on the active connection
  dbInstance.run('PRAGMA foreign_keys = ON;');

  return dbInstance;
}

export function persistDb(): void {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE, buffer);
  } catch (err) {
    console.error('[Database] Error persisting SQLite database to disk:', err);
  }
}

export function queryAll<T = any>(sql: string, params: any[] = []): T[] {
  if (!dbInstance) throw new Error('Database not initialized. Call getDb() first.');
  const stmt = dbInstance.prepare(sql);
  if (params && params.length > 0) {
    stmt.bind(params);
  }
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as unknown as T);
  }
  stmt.free();
  return results;
}

export function queryOne<T = any>(sql: string, params: any[] = []): T | null {
  const rows = queryAll<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

let inTransaction = false;

export function run(sql: string, params: any[] = []): void {
  if (!dbInstance) throw new Error('Database not initialized. Call getDb() first.');
  const cleanSql = sql.trim().replace(/;+$/, '');
  dbInstance.run(cleanSql, params);
  if (!inTransaction) {
    persistDb();
  }
}

export function transaction<T>(fn: () => T): T {
  if (!dbInstance) throw new Error('Database not initialized.');
  dbInstance.run('BEGIN TRANSACTION;');
  inTransaction = true;
  try {
    const result = fn();
    dbInstance.run('COMMIT;');
    inTransaction = false;
    persistDb();
    return result;
  } catch (err) {
    try {
      dbInstance.run('ROLLBACK;');
    } catch (_rbErr) {
      // In SQLite/sql.js, certain errors automatically abort/rollback the active transaction
    }
    inTransaction = false;
    throw err;
  }
}

export function logAudit(
  action: string,
  entityType: string,
  entityId: string,
  detailsJson?: Record<string, any>,
  captainAccountId: string = 'CAP-001'
): void {
  const now = new Date().toISOString();
  const id = `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  run(
    `INSERT INTO audit_logs (id, captain_account_id, action, entity_type, entity_id, details_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?);`,
    [
      id,
      captainAccountId,
      action,
      entityType,
      entityId,
      detailsJson ? JSON.stringify(detailsJson) : null,
      now,
    ]
  );
}

export function exportDatabaseBackup(): Record<string, any> {
  return {
    version: '2.0',
    database_type: 'sqlite',
    database_file: path.basename(DB_FILE),
    exported_at: new Date().toISOString(),
    captain_accounts: queryAll('SELECT id, email, created_at, updated_at FROM captain_accounts'),
    players: queryAll('SELECT * FROM players'),
    weekly_sessions: queryAll('SELECT * FROM weekly_sessions'),
    attendance_records: queryAll('SELECT * FROM attendance_records'),
    team_assignments: queryAll('SELECT * FROM team_assignments'),
    team_generation_runs: queryAll('SELECT * FROM team_generation_runs'),
    player_replacements: queryAll('SELECT * FROM player_replacements'),
    matches: queryAll('SELECT * FROM matches'),
    player_participation: queryAll('SELECT * FROM player_participation'),
    scheduling_settings: queryAll('SELECT * FROM scheduling_settings'),
    app_settings: queryAll('SELECT * FROM app_settings'),
    audit_logs: queryAll('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200'),
  };
}

export function restoreDatabaseBackup(data: any): { success: boolean; error?: string } {
  if (!data || typeof data !== 'object') {
    return { success: false, error: 'Invalid backup JSON file' };
  }
  if (!Array.isArray(data.players) || !Array.isArray(data.weekly_sessions)) {
    return { success: false, error: 'Backup is missing required players or weekly_sessions tables' };
  }
  if (!dbInstance) throw new Error('Database not initialized');

  try {
    transaction(() => {
      // Clear dependent tables first
      dbInstance!.run('DELETE FROM player_participation;');
      dbInstance!.run('DELETE FROM matches;');
      dbInstance!.run('DELETE FROM player_replacements;');
      dbInstance!.run('DELETE FROM team_generation_runs;');
      dbInstance!.run('DELETE FROM team_assignments;');
      dbInstance!.run('DELETE FROM attendance_records;');
      dbInstance!.run('DELETE FROM weekly_sessions;');
      dbInstance!.run('DELETE FROM players;');

      // Restore Players
      for (const p of data.players) {
        dbInstance!.run(
          `INSERT INTO players (id, full_name, position, skill_level, active, created_at, updated_at, archived_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
          [p.id, p.full_name || p.name, p.position, p.skill_level, p.active !== undefined ? (p.active ? 1 : 0) : 1, p.created_at, p.updated_at, p.archived_at || null]
        );
      }

      // Restore Weekly Sessions
      for (const s of data.weekly_sessions) {
        dbInstance!.run(
          `INSERT INTO weekly_sessions (id, session_date, status, attendance_deadline, generation_time, locked_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
          [s.id, s.session_date, s.status || 'attendance_open', s.attendance_deadline || '14:30', s.generation_time || '15:00', s.locked_at || null, s.created_at, s.updated_at]
        );
      }

      // Restore Attendance Records
      if (Array.isArray(data.attendance_records)) {
        for (const a of data.attendance_records) {
          dbInstance!.run(
            `INSERT INTO attendance_records (id, weekly_session_id, player_id, status, notes, confirmed_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
            [a.id, a.weekly_session_id || a.session_id, a.player_id, (a.status || 'available').toLowerCase(), a.notes || a.reason || null, a.confirmed_at || null, a.created_at, a.updated_at]
          );
        }
      }

      // Restore Team Assignments
      if (Array.isArray(data.team_assignments)) {
        for (const ta of data.team_assignments) {
          dbInstance!.run(
            `INSERT INTO team_assignments (id, weekly_session_id, player_id, team_name, is_replacement, original_player_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
            [ta.id, ta.weekly_session_id || ta.session_id, ta.player_id, ta.team_name || ta.team_id, ta.is_replacement ? 1 : 0, ta.original_player_id || null, ta.created_at, ta.updated_at || ta.created_at]
          );
        }
      }

      // Restore Matches
      if (Array.isArray(data.matches)) {
        for (const m of data.matches) {
          dbInstance!.run(
            `INSERT INTO matches (id, weekly_session_id, match_number, team_a, team_b, waiting_team, winner_team, loser_team, team_a_score, team_b_score, status, started_at, paused_at, ended_at, elapsed_seconds, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              m.id,
              m.weekly_session_id || m.session_id,
              m.match_number,
              m.team_a || m.team_home,
              m.team_b || m.team_away,
              m.waiting_team,
              m.winner_team || null,
              m.loser_team || null,
              m.team_a_score !== undefined ? m.team_a_score : (m.score_home || 0),
              m.team_b_score !== undefined ? m.team_b_score : (m.score_away || 0),
              (m.status || 'pending').toLowerCase(),
              m.started_at || null,
              m.paused_at || null,
              m.ended_at || null,
              m.elapsed_seconds || 0,
              m.created_at,
              m.updated_at,
            ]
          );
        }
      }

      // Restore Replacements
      if (Array.isArray(data.player_replacements)) {
        for (const r of data.player_replacements) {
          dbInstance!.run(
            `INSERT INTO player_replacements (id, weekly_session_id, original_player_id, replacement_player_id, replacement_type, reason, start_date, end_date, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              r.id,
              r.weekly_session_id || r.session_id,
              r.original_player_id,
              r.replacement_player_id,
              (r.replacement_type || 'temporary').toLowerCase(),
              r.reason,
              r.start_date,
              r.end_date || null,
              r.status || (r.is_reversed ? 'reversed' : 'active'),
              r.created_at,
              r.updated_at || r.created_at,
            ]
          );
        }
      }

      // Restore Scheduling Settings
      if (Array.isArray(data.scheduling_settings) && data.scheduling_settings.length > 0) {
        dbInstance!.run('DELETE FROM scheduling_settings;');
        const ss = data.scheduling_settings[0];
        dbInstance!.run(
          `INSERT INTO scheduling_settings (id, day_of_week, generation_time, attendance_deadline, timezone, automatic_generation_enabled, captain_approval_required, unconfirmed_player_policy, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            ss.id || 'default',
            ss.day_of_week || 'Wednesday',
            ss.generation_time || ss.match_time || '15:00',
            ss.attendance_deadline || ss.confirmation_deadline_time || '14:30',
            ss.timezone || 'Africa/Addis_Ababa',
            ss.automatic_generation_enabled ? 1 : 0,
            ss.captain_approval_required ? 1 : 0,
            ss.unconfirmed_player_policy || 'flag_and_exclude',
            ss.updated_at || new Date().toISOString(),
          ]
        );
      }
    });

    logAudit('BACKUP_RESTORE', 'DATABASE', 'ALL', {
      players_restored: data.players.length,
      sessions_restored: data.weekly_sessions.length,
    });

    return { success: true };
  } catch (err: any) {
    console.error('[Database] Restore failed:', err);
    return { success: false, error: err?.message || 'Restore transaction failed' };
  }
}
