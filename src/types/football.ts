/**
 * Core Domain Models for Football Club Manager
 */

export type Position = 'Striker' | 'Midfielder' | 'Defender' | string;

export type SkillLevel = 'Top' | 'Medium' | 'Normal';

export type AttendanceStatus = 'PENDING' | 'CONFIRMED' | 'ABSENT' | 'INJURED';

export type TeamId = 'A' | 'B' | 'C';

export type ReplacementType = 'TEMPORARY' | 'PERMANENT';

export type SessionStatus = 'PREPARING' | 'TEAMS_GENERATED' | 'TEAMS_LOCKED' | 'COMPLETED';

export type MatchStatus = 'PENDING' | 'RUNNING' | 'PAUSED' | 'FINISHED';

export interface Player {
  id: string;
  name: string;
  position: Position;
  skill_level: SkillLevel;
  is_active: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  attendance_status?: AttendanceStatus;
  current_team?: TeamId | null;
  historical_matches_played?: number;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  player_id: string;
  status: AttendanceStatus;
  reason?: string;
  updated_at: string;
}

export interface WeeklySession {
  id: string;
  session_date: string; // YYYY-MM-DD
  title: string;
  status: SessionStatus;
  scheduled_time: string; // e.g. "15:00"
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface TeamAssignment {
  id: string;
  session_id: string;
  team_id: TeamId;
  player_id: string;
  player_name?: string;
  position?: Position;
  skill_level?: SkillLevel;
  original_player_id?: string | null;
  is_temporary_replacement: boolean;
  replacement_id?: string | null;
  created_at: string;
}

export interface GeneratedTeamData {
  team_id: TeamId;
  name: string;
  color: string;
  players: {
    id: string;
    name: string;
    position: Position;
    skill_level: SkillLevel;
    attendance_status: AttendanceStatus;
    is_replacement?: boolean;
    original_player_name?: string;
  }[];
  stats: {
    player_count: number;
    strikers: number;
    midfielders: number;
    defenders: number;
    top_count: number;
    medium_count: number;
    normal_count: number;
    skill_score_sum: number;
    average_skill: number;
  };
}

export interface TeamGenerationResult {
  session_id: string;
  version: number;
  is_locked: boolean;
  generated_at: string;
  locked_at?: string | null;
  teams: {
    A: GeneratedTeamData;
    B: GeneratedTeamData;
    C: GeneratedTeamData;
  };
  balance_explanation: {
    overall_fairness_rating: number; // 0 - 100%
    skill_variance: number;
    position_balance_note: string;
    pairing_freshness_score: number; // 0 - 100%
    limitations: string[];
    seed: string;
  };
}

export interface PlayerReplacement {
  id: string;
  session_id: string;
  original_player_id: string;
  original_player_name?: string;
  replacement_player_id: string;
  replacement_player_name?: string;
  replacement_type: ReplacementType;
  reason: string;
  start_date: string;
  end_date?: string | null;
  is_reversed: boolean;
  reversed_at?: string | null;
  created_at: string;
}

export interface MatchRecord {
  id: string;
  session_id: string;
  match_number: number;
  team_home: TeamId;
  team_away: TeamId;
  waiting_team: TeamId;
  score_home: number;
  score_away: number;
  winner_team?: TeamId | 'DRAW' | null;
  status: MatchStatus;
  start_time_ms?: number | null;
  duration_seconds: number; // default 900 (15 min)
  elapsed_seconds: number;
  last_resumed_at_ms?: number | null;
  created_at: string;
  updated_at: string;
}

export interface PlayerParticipation {
  player_id: string;
  player_name: string;
  position: Position;
  skill_level: SkillLevel;
  total_matches_played: number;
  total_matches_sat_out: number;
  total_playing_minutes: number;
  attendance_count: number;
  temporary_replacement_count: number;
  fairness_ratio: number; // playing time vs max possible
}

export interface ScheduleSettings {
  id: string;
  day_of_week: string; // "Wednesday"
  team_count: 2 | 3;
  match_time: string; // "15:00"
  timezone: string; // "Africa/Addis_Ababa"
  confirmation_deadline_time: string; // "14:30"
  auto_generation_enabled: boolean;
  require_captain_approval: boolean;
  unconfirmed_handling: 'FLAG_AND_EXCLUDE' | 'INCLUDE';
  reminders_enabled: boolean;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action_type: string;
  description: string;
  entity_type: string;
  entity_id: string;
  change_details?: Record<string, any>;
  actor: string;
}

export interface CaptainSession {
  authenticated: boolean;
  captain?: {
    id: string;
    username: string;
    display_name: string;
  };
}
