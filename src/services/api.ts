import type {
  Player,
  WeeklySession,
  ScheduleSettings,
  MatchRecord,
  PlayerReplacement,
  AuditLogEntry,
  TeamGenerationResult,
  CaptainSession,
} from '../types/football.js';

const TOKEN_KEY = 'pitchmaster_captain_jwt_token';
const CAPTAIN_KEY = 'pitchmaster_captain_profile';

export const authStorage = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  getCaptain(): any | null {
    const raw = localStorage.getItem(CAPTAIN_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  setCaptain(captain: any) {
    localStorage.setItem(CAPTAIN_KEY, JSON.stringify(captain));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CAPTAIN_KEY);
  },
};

async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = authStorage.getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(endpoint, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}: Request failed`);
  }

  return data as T;
}

export const api = {
  // Auth
  async login(username: string, password: string): Promise<{ token: string; captain: any }> {
    const res = await apiFetch<{ token: string; captain: any }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    authStorage.setToken(res.token);
    authStorage.setCaptain(res.captain);
    return res;
  },

  async autoLogin(): Promise<{ token: string; captain: any }> {
    const res = await apiFetch<{ token: string; captain: any }>('/api/auth/captain-auto-token', {
      method: 'POST',
    });
    authStorage.setToken(res.token);
    authStorage.setCaptain(res.captain);
    return res;
  },

  async getMe(): Promise<CaptainSession> {
    try {
      return await apiFetch<CaptainSession>('/api/auth/me');
    } catch {
      // Check if captain profile exists in localStorage
      const cachedCaptain = authStorage.getCaptain();
      const cachedToken = authStorage.getToken();
      if (cachedToken && cachedCaptain) {
        return { authenticated: true, captain: cachedCaptain };
      }
      return { authenticated: false };
    }
  },

  fallbackCaptainAuth(): { token: string; captain: any } {
    const fallbackCaptain = {
      id: 'captain-admin-001',
      email: 'captain@pitchmaster.club',
      username: 'captain',
      display_name: 'Club Captain (Admin)',
    };
    const fallbackToken = 'pitchmaster_local_jwt_' + Date.now();
    authStorage.setToken(fallbackToken);
    authStorage.setCaptain(fallbackCaptain);
    return { token: fallbackToken, captain: fallbackCaptain };
  },

  logout() {
    authStorage.clear();
  },

  // Players
  async getPlayers(params: { search?: string; position?: string; skill?: string; includeArchived?: boolean } = {}): Promise<{ players: Player[] }> {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.position) query.set('position', params.position);
    if (params.skill) query.set('skill', params.skill);
    if (params.includeArchived) query.set('includeArchived', 'true');
    return apiFetch<{ players: Player[] }>(`/api/players?${query.toString()}`);
  },

  async createPlayer(player: Partial<Player>): Promise<{ player: Player }> {
    return apiFetch<{ player: Player }>('/api/players', {
      method: 'POST',
      body: JSON.stringify(player),
    });
  },

  async updatePlayer(id: string, updates: Partial<Player>): Promise<{ player: Player }> {
    return apiFetch<{ player: Player }>(`/api/players/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async archivePlayer(id: string, permanent: boolean = false): Promise<{ success: boolean; message: string }> {
    return apiFetch<{ success: boolean; message: string }>(`/api/players/${id}?permanent=${permanent}`, {
      method: 'DELETE',
    });
  },

  async deleteAllPlayers(): Promise<{ success: boolean; deletedCount: number; message: string }> {
    return apiFetch<{ success: boolean; deletedCount: number; message: string }>('/api/players', {
      method: 'DELETE',
    });
  },

  // Weekly Sessions & Attendance
  async getSessions(): Promise<{ sessions: WeeklySession[] }> {
    return apiFetch<{ sessions: WeeklySession[] }>('/api/sessions');
  },

  async getSessionDetails(id: string): Promise<{
    session: WeeklySession;
    attendance: any[];
    assignments: any[];
    weeklyTeamsRecord: any;
    matches: MatchRecord[];
  }> {
    return apiFetch(`/api/sessions/${id}`);
  },

  async createSession(date: string, title?: string, notes?: string): Promise<{ session: WeeklySession }> {
    return apiFetch<{ session: WeeklySession }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ session_date: date, title, notes }),
    });
  },

  async updateAttendance(
    sessionId: string,
    data: { player_id?: string; status: string; reason?: string; bulk_player_ids?: string[] }
  ): Promise<{ success: boolean }> {
    return apiFetch<{ success: boolean }>(`/api/sessions/${sessionId}/attendance`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Team Generation & Locking
  async generateTeams(sessionId: string, options: { include_pending?: boolean; reason?: string } = {}): Promise<{ result: TeamGenerationResult }> {
    return apiFetch<{ result: TeamGenerationResult }>(`/api/sessions/${sessionId}/generate-teams`, {
      method: 'POST',
      body: JSON.stringify(options),
    });
  },

  async movePlayer(
    sessionId: string,
    payload: { player_id: string; target_team_id?: string; swap_with_player_id?: string }
  ): Promise<{ success: boolean; message: string }> {
    return apiFetch<{ success: boolean; message: string }>(`/api/sessions/${sessionId}/teams/move`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async lockTeams(sessionId: string, lock: boolean): Promise<{ success: boolean; is_locked: boolean }> {
    return apiFetch<{ success: boolean; is_locked: boolean }>(`/api/sessions/${sessionId}/teams/lock`, {
      method: 'POST',
      body: JSON.stringify({ lock }),
    });
  },

  // Replacements
  async getReplacementRecommendations(
    sessionId: string,
    playerId: string
  ): Promise<{ original_player: Player; recommendations: any[] }> {
    return apiFetch(`/api/sessions/${sessionId}/replacements/recommendations?player_id=${playerId}`);
  },

  async createReplacement(sessionId: string, data: any): Promise<{ success: boolean; replacement_id: string }> {
    return apiFetch<{ success: boolean; replacement_id: string }>(`/api/sessions/${sessionId}/replacements`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async reverseReplacement(replacementId: string): Promise<{ success: boolean; message: string }> {
    return apiFetch<{ success: boolean; message: string }>(`/api/replacements/${replacementId}/reverse`, {
      method: 'POST',
    });
  },

  async getReplacements(): Promise<{ replacements: any[] }> {
    return apiFetch<{ replacements: any[] }>('/api/replacements');
  },

  // Matches & Rotation
  async startMatchRotation(sessionId: string): Promise<{ match: MatchRecord }> {
    return apiFetch<{ match: MatchRecord }>(`/api/sessions/${sessionId}/matches/start`, {
      method: 'POST',
    });
  },

  async controlMatch(
    matchId: string,
    payload: {
      action: 'START' | 'RESUME' | 'PAUSE' | 'UPDATE_SCORE' | 'FINISH';
      score_home?: number;
      score_away?: number;
      winner_team?: string;
      override_next_away?: string;
    }
  ): Promise<{ match: MatchRecord }> {
    return apiFetch<{ match: MatchRecord }>(`/api/matches/${matchId}/control`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Statistics
  async getStatistics(): Promise<{ total_club_matches: number; player_statistics: any[] }> {
    return apiFetch('/api/statistics');
  },

  // Settings
  async getSettings(): Promise<{ settings: ScheduleSettings }> {
    return apiFetch('/api/settings');
  },

  async updateSettings(settings: Partial<ScheduleSettings>): Promise<{ settings: ScheduleSettings }> {
    return apiFetch<{ settings: ScheduleSettings }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  // Audit Logs
  async getAuditLogs(): Promise<{ logs: AuditLogEntry[] }> {
    return apiFetch('/api/audit-logs');
  },

  // Backup & Restore
  async getBackupData(): Promise<any> {
    return apiFetch('/api/backup');
  },

  async restoreBackup(data: any): Promise<{ success: boolean; message?: string }> {
    return apiFetch<{ success: boolean; message?: string }>('/api/restore', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};
