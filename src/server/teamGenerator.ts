import { queryAll } from './db.js';
import type {
  Player,
  Position,
  SkillLevel,
  TeamId,
  GeneratedTeamData,
  TeamGenerationResult,
  AttendanceStatus,
} from '../types/football.js';

interface EligiblePlayer {
  id: string;
  name: string;
  position: Position;
  skill_level: SkillLevel;
  attendance_status: AttendanceStatus;
}

const SKILL_WEIGHTS: Record<SkillLevel, number> = {
  Top: 3,
  Medium: 2,
  Normal: 1,
};

// Build teammate co-occurrence matrix from past sessions
export function buildHistoricalPairingMatrix(excludeSessionId?: string): Map<string, number> {
  const pairingMap = new Map<string, number>();

  let sql = 'SELECT weekly_session_id as session_id, team_name as team_id, player_id FROM team_assignments';
  const params: any[] = [];
  if (excludeSessionId) {
    sql += ' WHERE weekly_session_id != ?';
    params.push(excludeSessionId);
  }

  const assignments = queryAll<{ session_id: string; team_id: string; player_id: string }>(sql, params);

  // Group by session and team
  const groupKey = (sId: string, tId: string) => `${sId}_${tId}`;
  const teams = new Map<string, string[]>();

  for (const a of assignments) {
    const key = groupKey(a.session_id, a.team_id);
    if (!teams.has(key)) {
      teams.set(key, []);
    }
    teams.get(key)!.push(a.player_id);
  }

  // Count pairwise co-occurrences
  for (const playerIds of teams.values()) {
    for (let i = 0; i < playerIds.length; i++) {
      for (let j = i + 1; j < playerIds.length; j++) {
        const id1 = playerIds[i];
        const id2 = playerIds[j];
        const pairKey = id1 < id2 ? `${id1}:${id2}` : `${id2}:${id1}`;
        pairingMap.set(pairKey, (pairingMap.get(pairKey) || 0) + 1);
      }
    }
  }

  return pairingMap;
}

export function generateBalancedTeams(
  availablePlayers: EligiblePlayer[],
  sessionId: string,
  randomSeedMultiplier: number = 1
): TeamGenerationResult {
  const n = availablePlayers.length;
  if (n === 0) {
    throw new Error('No available players to generate teams.');
  }

  const historicalPairings = buildHistoricalPairingMatrix(sessionId);

  // Calculate target team sizes
  const baseCount = Math.floor(n / 3);
  const remainder = n % 3;
  const targetSizes: [number, number, number] = [
    baseCount + (remainder > 0 ? 1 : 0),
    baseCount + (remainder > 1 ? 1 : 0),
    baseCount,
  ];

  // Group players by position, then sort by skill
  const strikers = availablePlayers.filter((p) => p.position === 'Striker');
  const midfielders = availablePlayers.filter((p) => p.position === 'Midfielder');
  const defenders = availablePlayers.filter((p) => p.position === 'Defender');
  const others = availablePlayers.filter(
    (p) => !['Striker', 'Midfielder', 'Defender'].includes(p.position)
  );

  // Multi-candidate search: Generate 250 candidate permutations and select optimal
  let bestCandidate: [EligiblePlayer[], EligiblePlayer[], EligiblePlayer[]] | null = null;
  let bestScore = -Infinity;
  let bestPairingPenalty = 0;
  let bestSkillVariance = 0;

  const CANDIDATE_ROUNDS = 250;

  for (let round = 0; round < CANDIDATE_ROUNDS; round++) {
    const candidate = generateSingleCandidate(
      strikers,
      midfielders,
      defenders,
      others,
      targetSizes
    );

    // Evaluate candidate
    const evaluation = evaluateCandidate(candidate, historicalPairings);
    if (evaluation.totalScore > bestScore) {
      bestScore = evaluation.totalScore;
      bestCandidate = candidate;
      bestPairingPenalty = evaluation.pairingPenalty;
      bestSkillVariance = evaluation.skillVariance;
    }
  }

  if (!bestCandidate) {
    throw new Error('Failed to generate valid teams');
  }

  // Format team results
  const teamConfigs: Array<{ id: TeamId; name: string; color: string }> = [
    { id: 'A', name: 'Team A (Emerald)', color: '#10b981' },
    { id: 'B', name: 'Team B (Cobalt)', color: '#3b82f6' },
    { id: 'C', name: 'Team C (Gold)', color: '#f59e0b' },
  ];

  const teamsObj: Record<TeamId, GeneratedTeamData> = {} as any;

  bestCandidate.forEach((playersInTeam, idx) => {
    const conf = teamConfigs[idx];
    const skillScoreSum = playersInTeam.reduce(
      (sum, p) => sum + (SKILL_WEIGHTS[p.skill_level] || 1),
      0
    );
    const avgSkill = playersInTeam.length > 0 ? skillScoreSum / playersInTeam.length : 0;

    teamsObj[conf.id] = {
      team_id: conf.id,
      name: conf.name,
      color: conf.color,
      players: playersInTeam.map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        skill_level: p.skill_level,
        attendance_status: p.attendance_status,
      })),
      stats: {
        player_count: playersInTeam.length,
        strikers: playersInTeam.filter((p) => p.position === 'Striker').length,
        midfielders: playersInTeam.filter((p) => p.position === 'Midfielder').length,
        defenders: playersInTeam.filter((p) => p.position === 'Defender').length,
        top_count: playersInTeam.filter((p) => p.skill_level === 'Top').length,
        medium_count: playersInTeam.filter((p) => p.skill_level === 'Medium').length,
        normal_count: playersInTeam.filter((p) => p.skill_level === 'Normal').length,
        skill_score_sum: skillScoreSum,
        average_skill: Number(avgSkill.toFixed(2)),
      },
    };
  });

  // Calculate overall fairness and freshness ratings
  const fairnessRating = Math.max(
    0,
    Math.min(100, Math.round(100 - bestSkillVariance * 12))
  );

  const pairingFreshnessScore = Math.max(
    0,
    Math.min(100, Math.round(100 - bestPairingPenalty * 4))
  );

  const limitations: string[] = [];
  if (n < 30) {
    limitations.push(
      `Player Shortfall: ${30 - n} player(s) missing from target 30. Teams have ${teamsObj.A.stats.player_count}, ${teamsObj.B.stats.player_count}, and ${teamsObj.C.stats.player_count} players.`
    );
  }
  if (bestSkillVariance > 2.5) {
    limitations.push('Slight skill distribution variance due to position constraints.');
  }

  const result: TeamGenerationResult = {
    session_id: sessionId,
    version: 1,
    is_locked: false,
    generated_at: new Date().toISOString(),
    teams: {
      A: teamsObj.A,
      B: teamsObj.B,
      C: teamsObj.C,
    },
    balance_explanation: {
      overall_fairness_rating: fairnessRating,
      skill_variance: Number(bestSkillVariance.toFixed(2)),
      position_balance_note: `Balanced across 3 teams: Team A (${teamsObj.A.stats.strikers} ST / ${teamsObj.A.stats.midfielders} MF / ${teamsObj.A.stats.defenders} DF), Team B (${teamsObj.B.stats.strikers} ST / ${teamsObj.B.stats.midfielders} MF / ${teamsObj.B.stats.defenders} DF), Team C (${teamsObj.C.stats.strikers} ST / ${teamsObj.C.stats.midfielders} MF / ${teamsObj.C.stats.defenders} DF).`,
      pairing_freshness_score: pairingFreshnessScore,
      limitations,
      seed: `OPT-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    },
  };

  return result;
}

// Generate one candidate assignment with position stratification and controlled randomness
function generateSingleCandidate(
  strikers: EligiblePlayer[],
  midfielders: EligiblePlayer[],
  defenders: EligiblePlayer[],
  others: EligiblePlayer[],
  targetSizes: [number, number, number]
): [EligiblePlayer[], EligiblePlayer[], EligiblePlayer[]] {
  const teamA: EligiblePlayer[] = [];
  const teamB: EligiblePlayer[] = [];
  const teamC: EligiblePlayer[] = [];

  const teams = [teamA, teamB, teamC];

  // Helper to shuffle array with Fisher-Yates
  const shuffle = <T>(arr: T[]): T[] => {
    const res = [...arr];
    for (let i = res.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [res[i], res[j]] = [res[j], res[i]];
    }
    return res;
  };

  // Helper to distribute position group sorted by skill level (Top -> Med -> Normal) with random offsets
  const distributeGroup = (group: EligiblePlayer[]) => {
    // Sort primarily by skill with slight random jitter so not strictly identical
    const sorted = [...group].sort((a, b) => {
      const diff = (SKILL_WEIGHTS[b.skill_level] || 1) - (SKILL_WEIGHTS[a.skill_level] || 1);
      return diff !== 0 ? diff : Math.random() - 0.5;
    });

    // Distribute across teams in round-robin or least-filled with lowest skill sum
    const teamIndices = shuffle([0, 1, 2]);

    sorted.forEach((player, i) => {
      // Pick team with capacity that currently has lowest skill sum for this group
      let bestTeamIdx = -1;
      let lowestTeamSkill = Infinity;

      for (const tIdx of teamIndices) {
        if (teams[tIdx].length < targetSizes[tIdx]) {
          const currentSkill = teams[tIdx].reduce(
            (s, p) => s + (SKILL_WEIGHTS[p.skill_level] || 1),
            0
          );
          if (currentSkill < lowestTeamSkill) {
            lowestTeamSkill = currentSkill;
            bestTeamIdx = tIdx;
          }
        }
      }

      if (bestTeamIdx !== -1) {
        teams[bestTeamIdx].push(player);
      } else {
        // Fallback to any team with capacity
        const openIdx = teams.findIndex((t, idx) => t.length < targetSizes[idx]);
        if (openIdx !== -1) teams[openIdx].push(player);
      }
    });
  };

  distributeGroup(strikers);
  distributeGroup(midfielders);
  distributeGroup(defenders);
  if (others.length > 0) {
    distributeGroup(others);
  }

  return [teamA, teamB, teamC];
}

// Evaluate fitness of candidate
function evaluateCandidate(
  candidate: [EligiblePlayer[], EligiblePlayer[], EligiblePlayer[]],
  historicalPairings: Map<string, number>
): { totalScore: number; pairingPenalty: number; skillVariance: number } {
  const [teamA, teamB, teamC] = candidate;

  // 1. Skill balance score
  const skillSums = [teamA, teamB, teamC].map((t) =>
    t.reduce((sum, p) => sum + (SKILL_WEIGHTS[p.skill_level] || 1), 0)
  );

  const avgSkill = (skillSums[0] + skillSums[1] + skillSums[2]) / 3;
  const skillVariance =
    (Math.pow(skillSums[0] - avgSkill, 2) +
      Math.pow(skillSums[1] - avgSkill, 2) +
      Math.pow(skillSums[2] - avgSkill, 2)) /
    3;

  // 2. Position distribution balance (strikers, midfielders, defenders)
  const getPosCounts = (team: EligiblePlayer[]) => ({
    st: team.filter((p) => p.position === 'Striker').length,
    mf: team.filter((p) => p.position === 'Midfielder').length,
    df: team.filter((p) => p.position === 'Defender').length,
  });

  const posA = getPosCounts(teamA);
  const posB = getPosCounts(teamB);
  const posC = getPosCounts(teamC);

  const posVariance =
    Math.pow(posA.st - posB.st, 2) +
    Math.pow(posB.st - posC.st, 2) +
    Math.pow(posA.mf - posB.mf, 2) +
    Math.pow(posB.mf - posC.mf, 2) +
    Math.pow(posA.df - posB.df, 2) +
    Math.pow(posB.df - posC.df, 2);

  // 3. Historical teammate pairing penalty
  let pairingPenalty = 0;
  for (const team of [teamA, teamB, teamC]) {
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) {
        const id1 = team[i].id;
        const id2 = team[j].id;
        const pairKey = id1 < id2 ? `${id1}:${id2}` : `${id2}:${id1}`;
        const previousCoOccurrences = historicalPairings.get(pairKey) || 0;
        // Exponential penalty for repeated teammate pairings
        if (previousCoOccurrences > 0) {
          pairingPenalty += Math.pow(previousCoOccurrences, 1.6);
        }
      }
    }
  }

  // Combined weighted score (higher is better)
  // Penalize skill variance heavily, position variance moderately, and repeated pairings
  const totalScore = -(skillVariance * 15 + posVariance * 8 + pairingPenalty * 5);

  return { totalScore, pairingPenalty, skillVariance };
}
