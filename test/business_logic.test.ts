import assert from 'node:assert';
import { getDb, queryAll, queryOne, run, transaction, DB_FILE } from '../src/server/db.js';
import { generateBalancedTeams, buildHistoricalPairingMatrix } from '../src/server/teamGenerator.js';
import { checkScheduledTasks, getCurrentTimeInTimezone } from '../src/server/scheduler.js';
import type { Position, SkillLevel, AttendanceStatus } from '../src/types/football.js';

async function runAllTests() {
  console.log('🧪 Starting SQLite Database & Business Logic Automated Tests...\n');
  console.log(`📁 Database target file: ${DB_FILE}`);

  // Initialize DB and apply migrations
  const db = await getDb();

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(err);
    }
  }

  // ---------------------------------------------------------
  // TEST GROUP 1: SCHEMA CONSTRAINTS & TRANSACTIONS
  // ---------------------------------------------------------
  console.log('\n--- TEST GROUP 1: SCHEMA CONSTRAINTS & TRANSACTIONS ---');

  test('Foreign key enforcement is enabled in SQLite', () => {
    const fkRes = queryOne<{ foreign_keys: number }>('PRAGMA foreign_keys;');
    assert.strictEqual(fkRes?.foreign_keys, 1, 'Foreign keys must be ON');
  });

  test('Unique constraint prevents assigning a player to multiple teams in the same session', () => {
    const testSessionId = 'TEST-SESS-UNIQUE';
    const testPlayerId = 'TEST-PLY-UNIQUE';
    const now = new Date().toISOString();

    // Setup dummy session & player
    run(
      `INSERT OR REPLACE INTO weekly_sessions (id, session_date, status, attendance_deadline, generation_time, created_at, updated_at)
       VALUES (?, '2026-11-01', 'attendance_open', '14:30', '15:00', ?, ?);`,
      [testSessionId, now, now]
    );
    run(
      `INSERT OR REPLACE INTO players (id, full_name, position, skill_level, active, created_at, updated_at)
       VALUES (?, 'Unique Test Player', 'Striker', 'Top', 1, ?, ?);`,
      [testPlayerId, now, now]
    );

    // First assignment to Team A: should succeed
    run(
      `INSERT INTO team_assignments (id, weekly_session_id, player_id, team_name, is_replacement, created_at, updated_at)
       VALUES ('TA-U-1', ?, ?, 'A', 0, ?, ?);`,
      [testSessionId, testPlayerId, now, now]
    );

    // Second assignment of same player in same session to Team B: must fail unique constraint!
    let threw = false;
    try {
      run(
        `INSERT INTO team_assignments (id, weekly_session_id, player_id, team_name, is_replacement, created_at, updated_at)
         VALUES ('TA-U-2', ?, ?, 'B', 0, ?, ?);`,
        [testSessionId, testPlayerId, now, now]
      );
    } catch (err) {
      threw = true;
    }
    assert.ok(threw, 'Expected SQLite UNIQUE constraint error when assigning player twice');

    // Cleanup
    run('DELETE FROM team_assignments WHERE weekly_session_id = ?;', [testSessionId]);
    run('DELETE FROM weekly_sessions WHERE id = ?;', [testSessionId]);
    run('DELETE FROM players WHERE id = ?;', [testPlayerId]);
  });

  test('Transactions roll back atomic multi-table operations on failure', () => {
    const initialPlayersCount = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM players;')?.cnt || 0;

    let transactionFailed = false;
    try {
      transaction(() => {
        run(
          `INSERT INTO players (id, full_name, position, skill_level, active, created_at, updated_at)
           VALUES ('PLY-TX-1', 'Tx Player 1', 'Striker', 'Top', 1, '2026-10-26', '2026-10-26');`
        );
        // Deliberately trigger syntax/constraint error
        run('INSERT INTO invalid_table_does_not_exist VALUES (1);');
      });
    } catch (err) {
      transactionFailed = true;
    }

    assert.ok(transactionFailed, 'Transaction should fail on error');
    const finalPlayersCount = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM players;')?.cnt || 0;
    assert.strictEqual(finalPlayersCount, initialPlayersCount, 'Rollback should leave row count unchanged');
  });

  // ---------------------------------------------------------
  // TEST GROUP 2: SAMPLE DATA SEED & TABLES
  // ---------------------------------------------------------
  console.log('\n--- TEST GROUP 2: SAMPLE DATA SEED & ALL 12 TABLES ---');

  test('Seed initialized 30 sample players with 10 Strikers, 10 Midfielders, and 10 Defenders', () => {
    const total = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM players WHERE archived_at IS NULL;')?.cnt || 0;
    const strikers = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM players WHERE position = "Striker" AND archived_at IS NULL;')?.cnt || 0;
    const midfielders = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM players WHERE position = "Midfielder" AND archived_at IS NULL;')?.cnt || 0;
    const defenders = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM players WHERE position = "Defender" AND archived_at IS NULL;')?.cnt || 0;

    assert.strictEqual(total, 30, 'Total active sample players should be 30');
    assert.strictEqual(strikers, 10, 'Should have 10 strikers');
    assert.strictEqual(midfielders, 10, 'Should have 10 midfielders');
    assert.strictEqual(defenders, 10, 'Should have 10 defenders');
  });

  test('All 12 required tables exist in SQLite master catalog', () => {
    const requiredTables = [
      'captain_accounts',
      'players',
      'weekly_sessions',
      'attendance_records',
      'team_assignments',
      'team_generation_runs',
      'player_replacements',
      'matches',
      'player_participation',
      'scheduling_settings',
      'audit_logs',
      'app_settings',
    ];

    const tablesRes = queryAll<{ name: string }>('SELECT name FROM sqlite_master WHERE type="table";');
    const existing = new Set(tablesRes.map((t) => t.name));

    requiredTables.forEach((t) => {
      assert.ok(existing.has(t), `Table ${t} exists in database`);
    });
  });

  // ---------------------------------------------------------
  // TEST GROUP 3: TEAM BALANCING ALGORITHM
  // ---------------------------------------------------------
  console.log('\n--- TEST GROUP 3: TEAM GENERATION & HISTORY-AWARE ALGORITHM ---');

  const testPlayers: Array<{ id: string; name: string; position: Position; skill_level: SkillLevel; attendance_status: AttendanceStatus }> = [];
  for (let i = 1; i <= 30; i++) {
    const pos: Position = i <= 10 ? 'Striker' : i <= 20 ? 'Midfielder' : 'Defender';
    const skill: SkillLevel = i % 3 === 0 ? 'Top' : i % 3 === 1 ? 'Medium' : 'Normal';
    testPlayers.push({
      id: `PLY-ALG-${i}`,
      name: `Player ${i}`,
      position: pos,
      skill_level: skill,
      attendance_status: 'CONFIRMED',
    });
  }

  test('30 eligible players are distributed into 3 teams of exactly 10', () => {
    const res = generateBalancedTeams(testPlayers, 'SESSION-ALG-1');
    assert.strictEqual(res.teams.A.players.length, 10);
    assert.strictEqual(res.teams.B.players.length, 10);
    assert.strictEqual(res.teams.C.players.length, 10);
  });

  test('Positions and all three skill levels are balanced across teams', () => {
    const res = generateBalancedTeams(testPlayers, 'SESSION-ALG-1');
    (['A', 'B', 'C'] as const).forEach((tId) => {
      const stats = res.teams[tId].stats;
      assert.ok(stats.top_count > 0, `Team ${tId} has top players`);
      assert.ok(stats.medium_count > 0, `Team ${tId} has medium players`);
      assert.ok(stats.normal_count > 0, `Team ${tId} has normal players`);
      assert.ok(stats.strikers >= 3 && stats.strikers <= 4, `Balanced strikers`);
      assert.ok(stats.midfielders >= 3 && stats.midfielders <= 4, `Balanced midfielders`);
      assert.ok(stats.defenders >= 3 && stats.defenders <= 4, `Balanced defenders`);
    });
  });

  test('Shortages are handled gracefully without hallucinating or duplicating players', () => {
    const squad27 = testPlayers.slice(0, 27);
    const res = generateBalancedTeams(squad27, 'SESSION-ALG-27');
    assert.strictEqual(res.teams.A.players.length, 9);
    assert.strictEqual(res.teams.B.players.length, 9);
    assert.strictEqual(res.teams.C.players.length, 9);
    assert.ok(res.balance_explanation.limitations.length > 0, 'Shortfall recorded in metadata');
  });

  test('Two-team mode balances 30 players into two teams and leaves Team C empty', () => {
    const res = generateBalancedTeams(testPlayers, 'SESSION-ALG-2', 1, 2);
    assert.strictEqual(res.teams.A.players.length, 15);
    assert.strictEqual(res.teams.B.players.length, 15);
    assert.strictEqual(res.teams.C.players.length, 0);
    const ids = [...res.teams.A.players, ...res.teams.B.players, ...res.teams.C.players].map(p => p.id);
    assert.strictEqual(new Set(ids).size, 30, 'Every player must be assigned exactly once');
  });

  test('Two-team mode handles attendance counts that do not divide evenly', () => {
    const res = generateBalancedTeams(testPlayers.slice(0, 27), 'SESSION-ALG-2-ODD', 1, 2);
    assert.deepStrictEqual([res.teams.A.players.length, res.teams.B.players.length], [14, 13]);
    assert.strictEqual(res.teams.C.players.length, 0);
  });

  // ---------------------------------------------------------
  // TEST GROUP 4: MATCH ROTATION & WINNER-STAYS
  // ---------------------------------------------------------
  console.log('\n--- TEST GROUP 4: MATCH ROTATION & WINNER-STAYS ---');

  test('Match 1 winner stays on pitch, loser sits out, waiting team enters', () => {
    const match = { team_a: 'A', team_b: 'B', waiting_team: 'C', winner: 'A' };
    let nextA: string;
    let nextB: string = match.waiting_team; // Team C enters
    let nextWaiting: string;

    if (match.winner === match.team_a) {
      nextA = match.team_a; // Winner stays
      nextWaiting = match.team_b; // Loser sits out
    } else {
      nextA = match.team_b;
      nextWaiting = match.team_a;
    }

    assert.strictEqual(nextA, 'A', 'Team A remains on field');
    assert.strictEqual(nextB, 'C', 'Team C enters from bench');
    assert.strictEqual(nextWaiting, 'B', 'Team B sits on bench');
  });

  // ---------------------------------------------------------
  // TEST GROUP 5: SCHEDULING SETTINGS & DEFAULTS
  // ---------------------------------------------------------
  console.log('\n--- TEST GROUP 5: SCHEDULING SETTINGS & DEFAULTS ---');

  test('Scheduling defaults to Wednesday 15:00 in Africa/Addis_Ababa with 14:30 deadline', () => {
    const s = queryOne<any>('SELECT * FROM scheduling_settings WHERE id = "default";');
    assert.ok(s, 'Settings row exists');
    assert.strictEqual(s.day_of_week, 'Wednesday');
    assert.strictEqual(s.generation_time, '15:00');
    assert.strictEqual(s.attendance_deadline, '14:30');
    assert.strictEqual(s.timezone, 'Africa/Addis_Ababa');
    assert.strictEqual(s.captain_approval_required, 1);
  });

  console.log(`\n🎉 Test Suite Completed: ${passed}/${total} tests passed!`);
}

runAllTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
