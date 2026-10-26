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

  // 3. Seed 30 Players across Strikers, Midfielders, and Defenders
  const playersRes = db.exec('SELECT COUNT(*) FROM players WHERE archived_at IS NULL;');
  const playerCount = (playersRes[0]?.values[0]?.[0] as number) || 0;

  if (playerCount === 0) {
    // 10 Strikers (3 Top, 4 Medium, 3 Normal)
    // 10 Midfielders (4 Top, 3 Medium, 3 Normal)
    // 10 Defenders (3 Top, 4 Medium, 3 Normal)
    const clubPlayers: Array<{ name: string; position: 'Striker' | 'Midfielder' | 'Defender'; skill: 'Top' | 'Medium' | 'Normal' }> = [
      // Strikers
      { name: 'Kaelen Vance', position: 'Striker', skill: 'Top' },
      { name: 'Marcus Sterling', position: 'Striker', skill: 'Top' },
      { name: 'Dante Thorne', position: 'Striker', skill: 'Top' },
      { name: 'Amari Diallo', position: 'Striker', skill: 'Medium' },
      { name: 'Tariq Al-Mansoor', position: 'Striker', skill: 'Medium' },
      { name: 'Lucas Silva', position: 'Striker', skill: 'Medium' },
      { name: 'Zane O’Connor', position: 'Striker', skill: 'Medium' },
      { name: 'Farhan Begum', position: 'Striker', skill: 'Normal' },
      { name: 'Julian Ruiz', position: 'Striker', skill: 'Normal' },
      { name: 'Devon Clarke', position: 'Striker', skill: 'Normal' },

      // Midfielders
      { name: 'Sami Khedira Jr.', position: 'Midfielder', skill: 'Top' },
      { name: 'Ethan De Jong', position: 'Midfielder', skill: 'Top' },
      { name: 'Mateo Kovac', position: 'Midfielder', skill: 'Top' },
      { name: 'Yusuf Tesfaye', position: 'Midfielder', skill: 'Top' },
      { name: 'Oliver Bishop', position: 'Midfielder', skill: 'Medium' },
      { name: 'Kenji Takahashi', position: 'Midfielder', skill: 'Medium' },
      { name: 'Rashid Idris', position: 'Midfielder', skill: 'Medium' },
      { name: 'Dimitri Popov', position: 'Midfielder', skill: 'Normal' },
      { name: 'Liam Murphy', position: 'Midfielder', skill: 'Normal' },
      { name: 'Elias Nystrom', position: 'Midfielder', skill: 'Normal' },

      // Defenders
      { name: 'Thiago Mendes', position: 'Defender', skill: 'Top' },
      { name: 'Goran Baresi', position: 'Defender', skill: 'Top' },
      { name: 'Malik Boateng', position: 'Defender', skill: 'Top' },
      { name: 'Victor Lindel', position: 'Defender', skill: 'Medium' },
      { name: 'Bruno Santos', position: 'Defender', skill: 'Medium' },
      { name: 'Dawit Abebe', position: 'Defender', skill: 'Medium' },
      { name: 'Aaron Cross', position: 'Defender', skill: 'Medium' },
      { name: 'Noah Becker', position: 'Defender', skill: 'Normal' },
      { name: 'Carlos Ramos', position: 'Defender', skill: 'Normal' },
      { name: 'Kofi Mensah', position: 'Defender', skill: 'Normal' },
    ];

    clubPlayers.forEach((p, idx) => {
      const id = `PLY-${String(idx + 1).padStart(3, '0')}`;
      db.run(
        `INSERT INTO players (id, full_name, position, skill_level, active, created_at, updated_at, archived_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, NULL);`,
        [id, p.name, p.position, p.skill, now, now]
      );
    });

    // 4. Seed Initial Session for upcoming Wednesday
    const today = new Date();
    const currentDay = today.getDay();
    const daysUntilWed = (3 - currentDay + 7) % 7;
    const nextWed = new Date(today);
    nextWed.setDate(today.getDate() + daysUntilWed);
    const sessionDateStr = nextWed.toISOString().split('T')[0];
    const sessionId = `WS-${sessionDateStr}`;

    db.run(
      `INSERT INTO weekly_sessions (id, session_date, status, attendance_deadline, generation_time, locked_at, created_at, updated_at)
       VALUES (?, ?, 'attendance_open', '14:30', '15:00', NULL, ?, ?);`,
      [sessionId, sessionDateStr, now, now]
    );

    // Seed attendance: 28 available, 1 pending, 1 injured
    clubPlayers.forEach((_, idx) => {
      const pId = `PLY-${String(idx + 1).padStart(3, '0')}`;
      let status = 'available';
      let notes = '';
      if (idx === 28) {
        status = 'pending';
      } else if (idx === 29) {
        status = 'injured';
        notes = 'Hamstring recovery';
      }

      db.run(
        `INSERT INTO attendance_records (id, weekly_session_id, player_id, status, notes, confirmed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [`ATT-${sessionId}-${pId}`, sessionId, pId, status, notes, status === 'available' ? now : null, now, now]
      );
    });

    // Seed audit log
    db.run(
      `INSERT INTO audit_logs (id, captain_account_id, action, entity_type, entity_id, details_json, created_at)
       VALUES (?, 'CAP-001', 'SYSTEM_INITIALIZATION', 'SYSTEM', 'INITIAL', ?, ?);`,
      [`AUD-${Date.now()}`, JSON.stringify({ active_players: 30, session_id: sessionId }), now]
    );
  }
}
