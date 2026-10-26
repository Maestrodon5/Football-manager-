import bcrypt from 'bcryptjs';
import type { Database as SqlJsDatabase } from 'sql.js';

export function seedDatabase(db: SqlJsDatabase) {
  const now = new Date().toISOString();

  // 1. Seed Captain Account if not present
  const captainRes = db.exec('SELECT COUNT(*) FROM captain_accounts;');
  const captainCount = (captainRes[0]?.values[0]?.[0] as number) || 0;
  if (captainCount === 0) {
    const adminPass = process.env.ADMIN_PASSWORD || process.env.DEFAULT_CAPTAIN_PASSWORD || 'captain123';
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(adminPass, salt);
    db.run(
      `INSERT INTO captain_accounts (id, email, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?);`,
      ['CAP-001', 'captain@pitchmaster.fc', hash, now, now]
    );
  }

  // 2. Seed Scheduling Settings if not present
  const settingsRes = db.exec('SELECT COUNT(*) FROM scheduling_settings;');
  const settingsCount = (settingsRes[0]?.values[0]?.[0] as number) || 0;
  if (settingsCount === 0) {
    db.run(
      `INSERT INTO scheduling_settings (id, day_of_week, generation_time, attendance_deadline, timezone, automatic_generation_enabled, captain_approval_required, unconfirmed_player_policy, team_count, updated_at)
       VALUES ('default', 'Wednesday', '15:00', '14:30', 'Africa/Addis_Ababa', 1, 1, 'flag_and_exclude', 3, ?);`,
      [now]
    );
  }

  // Never seed player profiles or sample sessions. Player data is always Captain-managed.
}
