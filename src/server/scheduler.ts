import { queryOne, queryAll, run, logAudit } from './db.js';
import { generateBalancedTeams } from './teamGenerator.js';
import type { Player } from '../types/football.js';

let schedulerInterval: NodeJS.Timeout | null = null;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function startBackgroundScheduler() {
  if (schedulerInterval) return;

  console.log('[Scheduler] Background weekly scheduler started (Checking every 30s)');

  // Run initial check and then every 30 seconds
  checkScheduledTasks();
  schedulerInterval = setInterval(() => {
    checkScheduledTasks();
  }, 30000);
}

export function stopBackgroundScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[Scheduler] Background weekly scheduler stopped');
  }
}

export function getCurrentTimeInTimezone(tz: string): {
  dayName: string;
  timeStr: string; // HH:mm
  dateStr: string; // YYYY-MM-DD
} {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';

    const weekday = getPart('weekday');
    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    const hour = getPart('hour');
    const minute = getPart('minute');

    return {
      dayName: weekday,
      timeStr: `${hour}:${minute}`,
      dateStr: `${year}-${month}-${day}`,
    };
  } catch (err) {
    // Fallback if timezone invalid
    const now = new Date();
    const dayName = DAY_NAMES[now.getUTCDay()];
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      dayName,
      timeStr: `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`,
      dateStr: now.toISOString().split('T')[0],
    };
  }
}

export function checkScheduledTasks() {
  try {
    const settings = queryOne<any>('SELECT * FROM scheduling_settings WHERE id = "default"');
    if (!settings || !settings.automatic_generation_enabled) {
      return;
    }

    const { dayName, timeStr, dateStr } = getCurrentTimeInTimezone(settings.timezone || 'Africa/Addis_Ababa');

    // Check if today matches scheduled day
    if (dayName.toLowerCase() !== settings.day_of_week.toLowerCase()) {
      return;
    }

    const sessionId = `WS-${dateStr}`;

    // 1. Ensure Weekly Session exists (Idempotent session creation: at most one session per week)
    const existingSession = queryOne<any>('SELECT * FROM weekly_sessions WHERE id = ?', [sessionId]);

    if (!existingSession) {
      const now = new Date().toISOString();
      run(
        `INSERT INTO weekly_sessions (id, session_date, status, attendance_deadline, generation_time, locked_at, created_at, updated_at)
         VALUES (?, ?, 'attendance_open', ?, ?, NULL, ?, ?);`,
        [sessionId, dateStr, settings.attendance_deadline || '14:30', settings.generation_time || '15:00', now, now]
      );

      // Seed attendance from active players
      const activePlayers = queryAll<any>('SELECT id FROM players WHERE active = 1 AND archived_at IS NULL');
      for (const p of activePlayers) {
        run(
          `INSERT INTO attendance_records (id, weekly_session_id, player_id, status, notes, confirmed_at, created_at, updated_at)
           VALUES (?, ?, ?, 'pending', '', NULL, ?, ?);`,
          [`ATT-${sessionId}-${p.id}`, sessionId, p.id, now, now]
        );
      }

      logAudit(
        'SCHEDULED_SESSION_CREATED',
        'WEEKLY_SESSION',
        sessionId,
        { scheduled_day: settings.day_of_week, generation_time: settings.generation_time }
      );
    }

    // 2. Check if team generation time reached
    if (timeStr >= (settings.generation_time || '15:00')) {
      const currentSession = queryOne<any>('SELECT * FROM weekly_sessions WHERE id = ?', [sessionId]);
      if (currentSession && (currentSession.status === 'attendance_open' || currentSession.status === 'pending')) {
        // Run auto team generation!
        const allowedStatuses = ["'available'"];
        if (settings.unconfirmed_player_policy === 'include') {
          allowedStatuses.push("'pending'");
        }

        const playersSql = `
          SELECT p.id, p.full_name as name, p.position, p.skill_level, ar.status as attendance_status
          FROM players p
          JOIN attendance_records ar ON p.id = ar.player_id
          WHERE ar.weekly_session_id = ?
            AND p.active = 1
            AND p.archived_at IS NULL
            AND ar.status IN (${allowedStatuses.join(',')})
        `;
        const eligiblePlayers = queryAll<any>(playersSql, [sessionId]);

        if (eligiblePlayers.length >= 3) {
          const generated = generateBalancedTeams(eligiblePlayers, sessionId);
          const now = new Date().toISOString();

          // Clear previous assignments for this session if any
          run('DELETE FROM team_assignments WHERE weekly_session_id = ?;', [sessionId]);

          // Insert team assignments (enforces UNIQUE(weekly_session_id, player_id))
          (['A', 'B', 'C'] as const).forEach((teamName) => {
            const team = generated.teams[teamName];
            for (const p of team.players) {
              run(
                `INSERT INTO team_assignments (id, weekly_session_id, player_id, team_name, is_replacement, original_player_id, created_at, updated_at)
                 VALUES (?, ?, ?, ?, 0, NULL, ?, ?);`,
                [`TA-${sessionId}-${p.id}`, sessionId, p.id, teamName, now, now]
              );
            }
          });

          // Record in team_generation_runs
          const runId = `TGR-${sessionId}-${Date.now()}`;
          run(
            `INSERT INTO team_generation_runs (id, weekly_session_id, algorithm_version, random_seed, generation_summary, created_at)
             VALUES (?, ?, '2.0.0', ?, ?, ?);`,
            [
              runId,
              sessionId,
              generated.balance_explanation.seed,
              JSON.stringify({ teams: generated.teams, balance: generated.balance_explanation }),
              now,
            ]
          );

          // Update session status
          run(`UPDATE weekly_sessions SET status = 'teams_generated', updated_at = ? WHERE id = ?;`, [
            now,
            sessionId,
          ]);

          logAudit(
            'SCHEDULED_TEAMS_GENERATED',
            'WEEKLY_SESSION',
            sessionId,
            { fairness_rating: generated.balance_explanation.overall_fairness_rating }
          );
        }
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error checking scheduled tasks:', err);
  }
}
