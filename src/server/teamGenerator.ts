import { queryAll } from './db.js';
import type {
  Position, SkillLevel, TeamId, GeneratedTeamData, TeamGenerationResult, AttendanceStatus,
} from '../types/football.js';

interface EligiblePlayer {
  id: string;
  name: string;
  position: Position;
  skill_level: SkillLevel;
  attendance_status: AttendanceStatus;
}

const SKILL_WEIGHTS: Record<SkillLevel, number> = { Top: 3, Medium: 2, Normal: 1 };
const TEAM_CONFIGS: Record<TeamId, { name: string; color: string }> = {
  A: { name: 'Team A (Emerald)', color: '#10b981' },
  B: { name: 'Team B (Cobalt)', color: '#3b82f6' },
  C: { name: 'Team C (Gold)', color: '#f59e0b' },
};

export function buildHistoricalPairingMatrix(excludeSessionId?: string): Map<string, number> {
  const pairingMap = new Map<string, number>();
  let sql = 'SELECT weekly_session_id as session_id, team_name as team_id, player_id FROM team_assignments';
  const params: any[] = [];
  if (excludeSessionId) { sql += ' WHERE weekly_session_id != ?'; params.push(excludeSessionId); }
  const assignments = queryAll<{ session_id: string; team_id: string; player_id: string }>(sql, params);
  const groups = new Map<string, string[]>();
  for (const a of assignments) {
    const key = `${a.session_id}_${a.team_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a.player_id);
  }
  for (const ids of groups.values()) {
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const key = ids[i] < ids[j] ? `${ids[i]}:${ids[j]}` : `${ids[j]}:${ids[i]}`;
      pairingMap.set(key, (pairingMap.get(key) || 0) + 1);
    }
  }
  return pairingMap;
}

export function generateBalancedTeams(
  availablePlayers: EligiblePlayer[],
  sessionId: string,
  randomSeedMultiplier = 1,
  requestedTeamCount: number = 3,
): TeamGenerationResult {
  const teamCount: 2 | 3 = requestedTeamCount === 2 ? 2 : 3;
  const uniquePlayers = [...new Map(availablePlayers.map(p => [p.id, p])).values()];
  const n = uniquePlayers.length;
  if (n < teamCount) throw new Error(`At least ${teamCount} available players are required.`);

  const historicalPairings = buildHistoricalPairingMatrix(sessionId);
  const targetSizes = Array.from({ length: teamCount }, (_, i) => Math.floor(n / teamCount) + (i < n % teamCount ? 1 : 0));
  let best: EligiblePlayer[][] | null = null;
  let bestScore = Infinity;
  let bestPairingPenalty = 0;
  let bestSkillVariance = 0;
  let bestPositionVariance = 0;

  for (let round = 0; round < 350; round++) {
    const candidate = Array.from({ length: teamCount }, () => [] as EligiblePlayer[]);
    const shuffled = [...uniquePlayers].sort(() => Math.random() - 0.5)
      .sort((a, b) => (SKILL_WEIGHTS[b.skill_level] || 1) - (SKILL_WEIGHTS[a.skill_level] || 1));
    for (const player of shuffled) {
      const open = candidate.map((team, i) => ({ team, i })).filter(x => x.team.length < targetSizes[x.i]);
      const ranked = open.map(({ team, i }) => {
        const skill = team.reduce((s, p) => s + (SKILL_WEIGHTS[p.skill_level] || 1), 0);
        const samePosition = team.filter(p => p.position === player.position).length;
        const repeated = team.reduce((sum, p) => {
          const key = p.id < player.id ? `${p.id}:${player.id}` : `${player.id}:${p.id}`;
          return sum + (historicalPairings.get(key) || 0);
        }, 0);
        return { i, value: skill * 1.3 + samePosition * 1.7 + repeated * 4 + Math.random() * 1.25 };
      }).sort((a, b) => a.value - b.value);
      candidate[ranked[0].i].push(player);
    }
    const score = evaluate(candidate, historicalPairings);
    if (score.total < bestScore) {
      bestScore = score.total; best = candidate; bestPairingPenalty = score.pairingPenalty;
      bestSkillVariance = score.skillVariance; bestPositionVariance = score.positionVariance;
    }
  }
  if (!best) throw new Error('Failed to generate valid teams.');

  const allTeamIds: TeamId[] = ['A', 'B', 'C'];
  const teamsObj = {} as Record<TeamId, GeneratedTeamData>;
  allTeamIds.forEach((id, idx) => {
    const players = best![idx] || [];
    const conf = TEAM_CONFIGS[id];
    const skillScoreSum = players.reduce((sum, p) => sum + (SKILL_WEIGHTS[p.skill_level] || 1), 0);
    teamsObj[id] = {
      team_id: id, name: conf.name, color: conf.color,
      players: players.map(p => ({ id: p.id, name: p.name, position: p.position, skill_level: p.skill_level, attendance_status: p.attendance_status })),
      stats: {
        player_count: players.length,
        strikers: players.filter(p => p.position === 'Striker').length,
        midfielders: players.filter(p => p.position === 'Midfielder').length,
        defenders: players.filter(p => p.position === 'Defender').length,
        top_count: players.filter(p => p.skill_level === 'Top').length,
        medium_count: players.filter(p => p.skill_level === 'Medium').length,
        normal_count: players.filter(p => p.skill_level === 'Normal').length,
        skill_score_sum: skillScoreSum,
        average_skill: players.length ? Number((skillScoreSum / players.length).toFixed(2)) : 0,
      },
    };
  });

  const fairness = Math.max(0, Math.min(100, Math.round(100 - bestSkillVariance * 22 - bestPositionVariance * 2)));
  const limitations: string[] = [];
  if (n % teamCount !== 0) limitations.push(`Attendance creates team sizes of ${targetSizes.join(', ')} players.`);
  if (bestSkillVariance > 0.25) limitations.push('Some skill-level variance remains; review the lineup before locking teams.');
  const visible = teamsObj as Record<TeamId, GeneratedTeamData>;
  return {
    session_id: sessionId, version: 1, is_locked: false, generated_at: new Date().toISOString(),
    teams: { A: visible.A, B: visible.B, C: visible.C },
    balance_explanation: {
      overall_fairness_rating: fairness,
      skill_variance: Number(bestSkillVariance.toFixed(3)),
      position_balance_note: `Balanced across ${teamCount} teams: ${allTeamIds.slice(0, teamCount).map(id => `${id} (${visible[id].stats.player_count} players; ${visible[id].stats.strikers} ST / ${visible[id].stats.midfielders} MF / ${visible[id].stats.defenders} DF)`).join('; ')}.`,
      pairing_freshness_score: Math.max(0, Math.min(100, Math.round(100 - bestPairingPenalty * 10))),
      limitations, seed: `OPT-${Date.now()}-${randomSeedMultiplier}-${Math.floor(Math.random() * 999999)}`,
    },
  };
}

function evaluate(teams: EligiblePlayer[][], pairings: Map<string, number>) {
  const skillAverages = teams.map(team => team.length ? team.reduce((s,p) => s + (SKILL_WEIGHTS[p.skill_level] || 1), 0) / team.length : 0);
  const mean = skillAverages.reduce((s,v) => s + v, 0) / skillAverages.length;
  const skillVariance = skillAverages.reduce((s,v) => s + Math.pow(v - mean, 2), 0) / skillAverages.length;
  const positions = teams.map(team => ({
    st: team.filter(p => p.position === 'Striker').length,
    mf: team.filter(p => p.position === 'Midfielder').length,
    df: team.filter(p => p.position === 'Defender').length,
  }));
  const positionVariance = ['st','mf','df'].reduce((sum, key) => {
    const values = positions.map(p => p[key as keyof typeof p]);
    const avg = values.reduce((a,b) => a+b, 0) / values.length;
    return sum + values.reduce((a,b) => a + Math.pow(b - avg, 2), 0) / values.length;
  }, 0);
  let pairingPenalty = 0;
  for (const team of teams) for (let i = 0; i < team.length; i++) for (let j = i + 1; j < team.length; j++) {
    const a = team[i].id, b = team[j].id;
    const count = pairings.get(a < b ? `${a}:${b}` : `${b}:${a}`) || 0;
    pairingPenalty += count === 0 ? 0 : count * count;
  }
  return { total: skillVariance * 30 + positionVariance * 4 + pairingPenalty * 2, skillVariance, positionVariance, pairingPenalty };
}
