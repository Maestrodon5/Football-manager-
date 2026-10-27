import type { Database as SqlJsDatabase } from 'sql.js';

export interface Migration {
  version: number;
  name: string;
  up: (db: SqlJsDatabase) => void;
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: '001_core_schema',
    up: (db: SqlJsDatabase) => {
      // 1. Captain Accounts
      db.run(`
        CREATE TABLE IF NOT EXISTS captain_accounts (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      // 2. Players
      db.run(`
        CREATE TABLE IF NOT EXISTS players (
          id TEXT PRIMARY KEY,
          full_name TEXT NOT NULL,
          position TEXT NOT NULL CHECK(position IN ('Striker', 'Midfielder', 'Defender')),
          skill_level TEXT NOT NULL CHECK(skill_level IN ('Top', 'Medium', 'Normal')),
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived_at TEXT
        );
      `);

      // 3. Weekly Sessions
      db.run(`
        CREATE TABLE IF NOT EXISTS weekly_sessions (
          id TEXT PRIMARY KEY,
          session_date TEXT UNIQUE NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('pending', 'attendance_open', 'teams_generated', 'teams_locked', 'in_progress', 'completed')),
          attendance_deadline TEXT NOT NULL DEFAULT '14:30',
          generation_time TEXT NOT NULL DEFAULT '15:00',
          locked_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      // 4. Attendance Records
      db.run(`
        CREATE TABLE IF NOT EXISTS attendance_records (
          id TEXT PRIMARY KEY,
          weekly_session_id TEXT NOT NULL REFERENCES weekly_sessions(id) ON DELETE CASCADE,
          player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          status TEXT NOT NULL CHECK(status IN ('pending', 'available', 'absent', 'injured')),
          notes TEXT,
          confirmed_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(weekly_session_id, player_id)
        );
      `);

      // 5. Team Assignments
      db.run(`
        CREATE TABLE IF NOT EXISTS team_assignments (
          id TEXT PRIMARY KEY,
          weekly_session_id TEXT NOT NULL REFERENCES weekly_sessions(id) ON DELETE CASCADE,
          player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          team_name TEXT NOT NULL CHECK(team_name IN ('A', 'B', 'C')),
          is_replacement INTEGER NOT NULL DEFAULT 0,
          original_player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(weekly_session_id, player_id)
        );
      `);

      // 6. Team Generation Runs
      db.run(`
        CREATE TABLE IF NOT EXISTS team_generation_runs (
          id TEXT PRIMARY KEY,
          weekly_session_id TEXT NOT NULL REFERENCES weekly_sessions(id) ON DELETE CASCADE,
          algorithm_version TEXT NOT NULL,
          random_seed TEXT NOT NULL,
          generation_summary TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);

      // 7. Player Replacements
      db.run(`
        CREATE TABLE IF NOT EXISTS player_replacements (
          id TEXT PRIMARY KEY,
          weekly_session_id TEXT NOT NULL REFERENCES weekly_sessions(id) ON DELETE CASCADE,
          original_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          replacement_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          replacement_type TEXT NOT NULL CHECK(replacement_type IN ('temporary', 'permanent')),
          reason TEXT NOT NULL,
          start_date TEXT NOT NULL,
          end_date TEXT,
          status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'reversed')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      // 8. Matches
      db.run(`
        CREATE TABLE IF NOT EXISTS matches (
          id TEXT PRIMARY KEY,
          weekly_session_id TEXT NOT NULL REFERENCES weekly_sessions(id) ON DELETE CASCADE,
          match_number INTEGER NOT NULL,
          team_a TEXT NOT NULL CHECK(team_a IN ('A', 'B', 'C')),
          team_b TEXT NOT NULL CHECK(team_b IN ('A', 'B', 'C')),
          waiting_team TEXT NOT NULL CHECK(waiting_team IN ('A', 'B', 'C')),
          winner_team TEXT CHECK(winner_team IN ('A', 'B', 'C', 'draw')),
          loser_team TEXT CHECK(loser_team IN ('A', 'B', 'C', 'none')),
          team_a_score INTEGER NOT NULL DEFAULT 0,
          team_b_score INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'paused', 'completed')),
          started_at TEXT,
          paused_at TEXT,
          ended_at TEXT,
          elapsed_seconds INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      // 9. Player Participation
      db.run(`
        CREATE TABLE IF NOT EXISTS player_participation (
          id TEXT PRIMARY KEY,
          weekly_session_id TEXT NOT NULL REFERENCES weekly_sessions(id) ON DELETE CASCADE,
          match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
          player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          team_name TEXT NOT NULL CHECK(team_name IN ('A', 'B', 'C')),
          participation_status TEXT NOT NULL DEFAULT 'played' CHECK(participation_status IN ('played', 'benched', 'substitute')),
          playing_seconds INTEGER NOT NULL DEFAULT 900,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      // 10. Scheduling Settings
      db.run(`
        CREATE TABLE IF NOT EXISTS scheduling_settings (
          id TEXT PRIMARY KEY,
          day_of_week TEXT NOT NULL DEFAULT 'Wednesday',
          generation_time TEXT NOT NULL DEFAULT '15:00',
          attendance_deadline TEXT NOT NULL DEFAULT '14:30',
          timezone TEXT NOT NULL DEFAULT 'Africa/Addis_Ababa',
          automatic_generation_enabled INTEGER NOT NULL DEFAULT 1,
          captain_approval_required INTEGER NOT NULL DEFAULT 1,
          unconfirmed_player_policy TEXT NOT NULL DEFAULT 'flag_and_exclude',
          updated_at TEXT NOT NULL
        );
      `);

      // 11. Audit Logs
      db.run(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          captain_account_id TEXT,
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          details_json TEXT,
          created_at TEXT NOT NULL
        );
      `);

      // 12. App Settings
      db.run(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      // Performance & Constraint Indexes
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_players_pos_skill ON players(position, skill_level, active);
        CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance_records(weekly_session_id, status);
        CREATE INDEX IF NOT EXISTS idx_attendance_player ON attendance_records(player_id);
        CREATE INDEX IF NOT EXISTS idx_assignments_session ON team_assignments(weekly_session_id, team_name);
        CREATE INDEX IF NOT EXISTS idx_assignments_player ON team_assignments(player_id);
        CREATE INDEX IF NOT EXISTS idx_replacements_session ON player_replacements(weekly_session_id, status);
        CREATE INDEX IF NOT EXISTS idx_matches_session ON matches(weekly_session_id, match_number);
        CREATE INDEX IF NOT EXISTS idx_participation_match ON player_participation(match_id, player_id);
        CREATE INDEX IF NOT EXISTS idx_participation_player ON player_participation(player_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
      `);
    },
  },
  {
    version: 2,
    name: '002_team_count',
    up: (db: SqlJsDatabase) => {
      const columns = db.exec("PRAGMA table_info(scheduling_settings)");
      const names = new Set((columns[0]?.values || []).map(row => String(row[1])));
      if (!names.has('team_count')) {
        db.run("ALTER TABLE scheduling_settings ADD COLUMN team_count INTEGER NOT NULL DEFAULT 3 CHECK(team_count IN (2, 3));");
      }
    },
  },
  {
    version: 3,
    name: '003_replacement_workflow_and_player_ratings',
    up: (db: SqlJsDatabase) => {
      const playerInfo = db.exec('PRAGMA table_info(players)');
      const playerColumns = new Set((playerInfo[0]?.values || []).map(row => String(row[1])));
      if (!playerColumns.has('secondary_position')) {
        db.run('ALTER TABLE players ADD COLUMN secondary_position TEXT');
      }
      if (!playerColumns.has('skill_rating')) {
        db.run('ALTER TABLE players ADD COLUMN skill_rating INTEGER');
      }
      db.run("UPDATE players SET skill_rating = CASE skill_level WHEN 'Top' THEN 9 WHEN 'Medium' THEN 6 ELSE 3 END WHERE skill_rating IS NULL");

      const replacementInfo = db.exec('PRAGMA table_info(player_replacements)');
      const replacementColumns = new Set((replacementInfo[0]?.values || []).map(row => String(row[1])));
      const additions: Array<[string, string]> = [
        ['source_team_id', 'TEXT'],
        ['destination_team_id', 'TEXT'],
        ['effective_date', 'TEXT'],
        ['profile_modified', 'INTEGER NOT NULL DEFAULT 0'],
        ['created_by', 'TEXT'],
        ['resolution_action', 'TEXT'],
        ['source_fill_player_id', 'TEXT'],
      ];
      for (const [name, definition] of additions) {
        if (!replacementColumns.has(name)) {
          db.run(`ALTER TABLE player_replacements ADD COLUMN ${name} ${definition}`);
        }
      }
    },
  },

];

export function runMigrations(db: SqlJsDatabase) {
  db.run('PRAGMA foreign_keys = ON;');

  db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedVersionsRes = db.exec('SELECT version FROM schema_migrations;');
  const appliedSet = new Set<number>();
  if (appliedVersionsRes.length > 0) {
    for (const row of appliedVersionsRes[0].values) {
      appliedSet.add(row[0] as number);
    }
  }

  for (const mig of migrations) {
    if (!appliedSet.has(mig.version)) {
      console.log(`[Migrations] Applying migration ${mig.version}: ${mig.name}...`);
      db.run('BEGIN TRANSACTION;');
      try {
        mig.up(db);
        const now = new Date().toISOString();
        db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?);', [
          mig.version,
          mig.name,
          now,
        ]);
        db.run('COMMIT;');
        console.log(`[Migrations] Migration ${mig.version} applied successfully.`);
      } catch (err) {
        db.run('ROLLBACK;');
        console.error(`[Migrations] Error applying migration ${mig.version}:`, err);
        throw err;
      }
    }
  }
}
