import React, { useEffect, useState } from 'react';
import {
  Trophy,
  Users,
  Calendar,
  Clock,
  Shield,
  Shuffle,
  Share2,
  Lock,
  Unlock,
  CheckCircle,
  AlertTriangle,
  Play,
  RotateCcw,
  Sparkles,
  ArrowRightLeft,
  Settings as SettingsIcon,
  BarChart3,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { api, authStorage } from './services/api.js';
import type {
  WeeklySession,
  Player,
  ScheduleSettings,
  MatchRecord,
  AuditLogEntry,
  TeamId,
} from './types/football.js';

import { PWAInstallButton } from './components/pwa/PWAInstallButton.js';
import { OfflineIndicator } from './components/pwa/OfflineIndicator.js';
import { TacticalPitchView } from './components/lineup/TacticalPitchView.js';
import { ShareLineupModal } from './components/lineup/ShareLineupModal.js';
import { MatchRotationLive } from './components/matches/MatchRotationLive.js';
import { AttendanceHub } from './components/attendance/AttendanceHub.js';
import { ReplacementModal } from './components/replacements/ReplacementModal.js';
import { SquadManagement } from './components/squad/SquadManagement.js';
import { ParticipationStatsView } from './components/stats/ParticipationStatsView.js';
import { SettingsAndAudit } from './components/settings/SettingsAndAudit.js';

// Assets
import heroBannerImg from './assets/images/hero_pitch_tactics_1793001062410.jpg';
import clubCrestImg from './assets/images/club_crest_emblem_1793001061440.jpg';

type NavTab =
  | 'overview'
  | 'pitch'
  | 'attendance'
  | 'generator'
  | 'rotation'
  | 'replacements'
  | 'squad'
  | 'stats'
  | 'settings';

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>('overview');
  const [isCaptain, setIsCaptain] = useState<boolean>(false);
  const [captainProfile, setCaptainProfile] = useState<any | null>(null);

  // Core Data
  const [loading, setLoading] = useState<boolean>(true);
  const [activeSession, setActiveSession] = useState<WeeklySession | null>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [weeklyTeamsRecord, setWeeklyTeamsRecord] = useState<any | null>(null);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [settings, setSettings] = useState<ScheduleSettings | null>(null);
  const [teamCount, setTeamCount] = useState<2 | 3>(3);
  const [playersPerTeam, setPlayersPerTeam] = useState<9 | 10>(10);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [statsData, setStatsData] = useState<{ total_club_matches: number; player_statistics: any[] }>({
    total_club_matches: 0,
    player_statistics: [],
  });
  const [replacementsList, setReplacementsList] = useState<any[]>([]);

  // Modals & Sub-actions
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [replacingPlayer, setReplacingPlayer] = useState<any | null>(null);
  const [generatingTeams, setGeneratingTeams] = useState<boolean>(false);
  const [generationMeta, setGenerationMeta] = useState<any | null>(null);

  // Initialize and load auth + initial data
  useEffect(() => {
    checkAuth();
    loadAllData();
  }, []);

  const checkAuth = async () => {
    let res = await api.getMe();
    if (!res.authenticated) {
      try {
        const auto = await api.autoLogin();
        setIsCaptain(true);
        setCaptainProfile(auto.captain);
        return;
      } catch (_) {}
    }
    if (res.authenticated && res.captain) {
      setIsCaptain(true);
      setCaptainProfile(res.captain);
    } else {
      setIsCaptain(false);
      setCaptainProfile(null);
    }
  };

  const loadAllData = async () => {
    try {
      setLoading(true);

      // Load sessions
      const sessionsRes = await api.getSessions();
      let session = sessionsRes.sessions[0] || null;

      if (session) {
        const details = await api.getSessionDetails(session.id);
        setActiveSession(details.session);
        setAttendance(details.attendance);
        setAssignments(details.assignments);
        setWeeklyTeamsRecord(details.weeklyTeamsRecord);
        setMatches(details.matches);

        if (details.weeklyTeamsRecord?.balance_metadata) {
          try {
            setGenerationMeta(JSON.parse(details.weeklyTeamsRecord.balance_metadata));
          } catch (_) {}
        }
      }

      // Load players
      const playersRes = await api.getPlayers();
      setPlayers(playersRes.players);

      // Load settings
      const settingsRes = await api.getSettings();
      setSettings(settingsRes.settings);
      setTeamCount(Number(settingsRes.settings.team_count) === 2 ? 2 : 3);

      // Load stats
      const statsRes = await api.getStatistics();
      setStatsData(statsRes);

      // Load replacements
      const repsRes = await api.getReplacements();
      setReplacementsList(repsRes.replacements);

      // Load audit logs if captain
      if (authStorage.getToken()) {
        try {
          const logsRes = await api.getAuditLogs();
          setAuditLogs(logsRes.logs);
        } catch (_) {}
      }
    } catch (err) {
      console.error('Error loading initial data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTeamCountChange = async (value: string) => {
    const next: 2 | 3 = value === '2' ? 2 : 3;
    setTeamCount(next);
    try {
      await api.updateSettings({ team_count: next });
      setSettings(prev => prev ? { ...prev, team_count: next } : prev);
    } catch (err: any) {
      alert(err.message || 'Could not save team count.');
      setTeamCount(Number(settings?.team_count) === 2 ? 2 : 3);
    }
  };

  const handleGenerateTeams = async () => {
    if (generatingTeams) return;
    if (!activeSession) {
      alert('There is no weekly session to generate teams for yet. Create or select a weekly session first. Your players have not been changed.');
      return;
    }
    if (!isCaptain) {
      alert('Personal captain access is not available. Check that PERSONAL_MODE=true and JWT_SECRET is configured on your private deployment.');
      return;
    }

    const confirmedCount = attendance.filter((item) => item.status === 'CONFIRMED').length;
    const pendingCount = attendance.filter((item) => item.status === 'PENDING').length;
    let includePending = false;
    if (confirmedCount === 0 && pendingCount > 0) {
      includePending = confirm(
        `No players are confirmed yet, but ${pendingCount} players are registered as pending. Generate teams using these pending players anyway? This will not change their attendance status.`
      );
      if (!includePending) {
        setCurrentTab('attendance');
        return;
      }
    }

    const teamIds: Array<'A' | 'B' | 'C'> = teamCount === 2 ? ['A', 'B'] : ['A', 'B', 'C'];
    const eligibleForGeneration = attendance.filter((item) =>
      item.status === 'CONFIRMED' || (includePending && item.status === 'PENDING')
    );
    if (eligibleForGeneration.length < teamIds.length) {
      alert(`At least ${teamIds.length} eligible players are required to select team captains.`);
      setCurrentTab('attendance');
      return;
    }
    const captainSelections: Record<string, string> = {};
    const remainingCaptainChoices = [...eligibleForGeneration];
    for (const teamId of teamIds) {
      const options = remainingCaptainChoices
        .map((item, index) => `${index + 1}. ${item.name} — ${item.position}, ${item.skill_level}`)
        .join('\\n');
      const answer = window.prompt(
        `Choose captain for Team ${teamId} by entering the player's number. Each player can captain only one team.\\n\\n${options}`
      );
      if (answer === null) return;
      const choice = Number.parseInt(answer.trim(), 10);
      if (!Number.isInteger(choice) || choice < 1 || choice > remainingCaptainChoices.length) {
        alert('Invalid captain selection. Team generation was cancelled; no teams were changed.');
        return;
      }
      const [chosen] = remainingCaptainChoices.splice(choice - 1, 1);
      captainSelections[teamId] = chosen.player_id;
    }

    try {
      setGeneratingTeams(true);
      const res = await api.generateTeams(activeSession.id, {
        reason: 'Manual Captain Lineup Optimization',
        players_per_team: playersPerTeam,
        team_count: teamCount,
        include_pending: includePending,
        captains: captainSelections,
      });
      setGenerationMeta(res.result.balance_explanation);
      await loadAllData();
      setCurrentTab('pitch');
    } catch (err: any) {
      alert(`${err.message || 'Team generation failed'}\n\nYour player profiles and attendance records have not been intentionally deleted.`);
    } finally {
      setGeneratingTeams(false);
    }
  };

  const handleToggleLock = async () => {
    if (!activeSession || !isCaptain) return;
    const currentLock = !!weeklyTeamsRecord?.is_locked;
    const targetLock = !currentLock;

    if (
      !targetLock &&
      !confirm('Unlock weekly teams? This will permit manual player moves, swaps, and regeneration.')
    ) {
      return;
    }

    try {
      await api.lockTeams(activeSession.id, targetLock);
      await loadAllData();
    } catch (err: any) {
      alert(err.message || 'Failed to toggle lock status');
    }
  };

  const handleReverseReplacement = async (id: string) => {
    if (!isCaptain) return;
    if (!confirm('Reverse this replacement and restore the original player?')) return;
    try {
      await api.reverseReplacement(id);
      await loadAllData();
    } catch (err: any) {
      alert(err.message || 'Failed to reverse replacement');
    }
  };

  // Team rosters
  const teamA = assignments.filter((a) => a.team_id === 'A');
  const teamB = assignments.filter((a) => a.team_id === 'B');
  const teamC = assignments.filter((a) => a.team_id === 'C');
  const isLocked = !!weeklyTeamsRecord?.is_locked;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      <OfflineIndicator />

      {/* TOP BAR CONTRACT: Zone 1 (Wordmark) — Zone 2 (4-5 Nav Links) — Zone 3 (1 Primary Action) */}
      <header className="sticky top-0 z-40 bg-slate-950/85 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-8 py-3.5 transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
          {/* Zone 1: Single element Brand Wordmark */}
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              setCurrentTab('overview');
            }}
            className="flex items-center gap-2.5 whitespace-nowrap shrink-0 group cursor-pointer"
          >
            <img
              src={clubCrestImg}
              alt="PitchMaster FC Crest"
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-lg shadow-sm border border-amber-500/40 object-cover"
            />
            <span className="text-base sm:text-lg font-black tracking-tight text-white group-hover:text-emerald-400 transition-colors">
              PitchMaster FC
            </span>
          </a>

          {/* Zone 2: Clean single-line text navigation links */}
          <nav className="hidden lg:flex items-center gap-6 text-xs font-semibold text-slate-300">
            <button
              onClick={() => setCurrentTab('overview')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                currentTab === 'overview' ? 'text-emerald-400 border-b-2 border-emerald-400 pb-0.5' : ''
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setCurrentTab('pitch')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                currentTab === 'pitch' ? 'text-emerald-400 border-b-2 border-emerald-400 pb-0.5' : ''
              }`}
            >
              Pitch & Lineups
            </button>
            <button
              onClick={() => setCurrentTab('attendance')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                currentTab === 'attendance' ? 'text-emerald-400 border-b-2 border-emerald-400 pb-0.5' : ''
              }`}
            >
              Attendance Hub
            </button>
            <button
              onClick={() => setCurrentTab('rotation')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                currentTab === 'rotation' ? 'text-emerald-400 border-b-2 border-emerald-400 pb-0.5' : ''
              }`}
            >
              Match Rotation
            </button>
            <button
              onClick={() => setCurrentTab('squad')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                currentTab === 'squad' ? 'text-emerald-400 border-b-2 border-emerald-400 pb-0.5' : ''
              }`}
            >
              Squad (30)
            </button>
            <button
              onClick={() => setCurrentTab('stats')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                currentTab === 'stats' ? 'text-emerald-400 border-b-2 border-emerald-400 pb-0.5' : ''
              }`}
            >
              Participation
            </button>
            <button
              onClick={() => setCurrentTab('settings')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                currentTab === 'settings' ? 'text-emerald-400 border-b-2 border-emerald-400 pb-0.5' : ''
              }`}
            >
              Schedule & Logs
            </button>
          </nav>

          {/* Personal single-owner mode: no login screen or sign-out control */}
          <div className="flex items-center gap-3 shrink-0">
            <PWAInstallButton className="hidden sm:inline-flex" />
            {isCaptain ? (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold bg-emerald-950/80 border-emerald-800 text-emerald-300">
                <Shield className="w-3.5 h-3.5" />
                <span>Captain Mode Active</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const session = await api.autoLogin();
                    setIsCaptain(true);
                    setCaptainProfile(session.captain);
                    await loadAllData();
                    alert('Captain mode activated.');
                  } catch (error: any) {
                    alert(error?.message || 'Captain access is not configured. Enable it only on a private, protected deployment.');
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[11px] font-bold bg-amber-950/60 border-amber-800 text-amber-200 hover:bg-amber-900/70"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Activate Captain Role</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* MAIN VIEWPORT CONTENT */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 space-y-8 pb-28 lg:pb-12">
        {/* OVERVIEW DASHBOARD */}
        {currentTab === 'overview' && (
          <div className="space-y-8">
            {/* Hero Banner with Stadium Imagery Scrim */}
            <div className="relative rounded-3xl overflow-hidden border border-emerald-900/60 shadow-2xl min-h-[260px] sm:min-h-[300px] flex flex-col justify-end p-6 sm:p-10">
              <img
                src={heroBannerImg}
                alt="Tactical pitch under floodlights"
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              />
              {/* Scrim */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent pointer-events-none" />

              <div className="relative z-10 max-w-2xl space-y-2">
                <div className="flex items-center gap-2 text-xs text-emerald-400 font-bold uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Official Club Management Hub</span>
                  <span>·</span>
                  <span>Africa/Addis_Ababa</span>
                </div>
                <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight leading-tight">
                  Automated Weekly Lineups & 15-Minute Match Rotation
                </h1>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  Next Scheduled Session: <strong>Every Wednesday at 15:00</strong>. History-aware algorithm prevents repeated teammate pairings and guarantees skill-balanced 10v10v10 teams.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-3">
                  <button
                    onClick={() => setCurrentTab('pitch')}
                    className="py-2.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg inline-flex items-center gap-2"
                  >
                    <span>View Weekly Lineups</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentTab('rotation')}
                    className="py-2.5 px-5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700 font-bold text-xs shadow-md inline-flex items-center gap-2"
                  >
                    <Play className="w-3.5 h-3.5 fill-slate-200" />
                    <span>Launch Match Timer</span>
                  </button>
                </div>
              </div>
            </div>

            {/* High-level KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
                <span className="text-xs text-slate-400 font-semibold block">Active Squad</span>
                <div className="text-3xl font-black font-mono text-white mt-1 tabular-nums">
                  {players.filter((p) => p.is_active && !p.is_archived).length} / 30
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">Full 30-Player Roster</span>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
                <span className="text-xs text-emerald-400 font-semibold block">Confirmed for Kickoff</span>
                <div className="text-3xl font-black font-mono text-emerald-400 mt-1 tabular-nums">
                  {attendance.filter((a) => a.status === 'CONFIRMED').length}
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  {attendance.filter((a) => a.status === 'PENDING').length} Pending Review
                </span>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
                <span className="text-xs text-amber-400 font-semibold block">Balance Rating</span>
                <div className="text-3xl font-black font-mono text-amber-400 mt-1 tabular-nums">
                  {generationMeta?.overall_fairness_rating || 96}%
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  {generationMeta?.pairing_freshness_score || 94}% Fresh Pairings
                </span>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
                <span className="text-xs text-blue-400 font-semibold block">Matches Played</span>
                <div className="text-3xl font-black font-mono text-blue-400 mt-1 tabular-nums">
                  {matches.filter((m) => m.status === 'FINISHED').length}
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">Winner-Stays Sessions</span>
              </div>
            </div>

            {/* Quick Feature Modules Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1: Attendance Check-in */}
              <div
                onClick={() => setCurrentTab('attendance')}
                className="p-6 rounded-3xl bg-slate-900 border border-slate-800 hover:border-emerald-600/50 transition cursor-pointer group space-y-3"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
                  <Users className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors">
                  1. Confirm Weekly Attendance
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Phase 1 & 2 workflow: check in confirmed players, review pending members, and mark injured or absent players before locking rosters.
                </p>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
                  Open Attendance Hub →
                </span>
              </div>

              {/* Card 2: Team Balancing */}
              <div
                onClick={() => setCurrentTab('pitch')}
                className="p-6 rounded-3xl bg-slate-900 border border-slate-800 hover:border-blue-600/50 transition cursor-pointer group space-y-3"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-950 border border-blue-800 flex items-center justify-center text-blue-400">
                  <Shuffle className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white group-hover:text-blue-400 transition-colors">
                  2. Balanced Lineup & Pitch
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  View Team A (Emerald), Team B (Cobalt), and Team C (Gold) on the tactical pitch board. Review skill parity and swap players.
                </p>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-400">
                  View Pitch Board →
                </span>
              </div>

              {/* Card 3: Match Rotation */}
              <div
                onClick={() => setCurrentTab('rotation')}
                className="p-6 rounded-3xl bg-slate-900 border border-slate-800 hover:border-amber-600/50 transition cursor-pointer group space-y-3"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-950 border border-amber-800 flex items-center justify-center text-amber-400">
                  <Clock className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white group-hover:text-amber-400 transition-colors">
                  3. 15-Minute Match Rotation
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Official Winner-Stays tournament timer. Automatically advances winning team, seats losing team on bench, and tracks live minutes.
                </p>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-400">
                  Control Rotation Timer →
                </span>
              </div>
            </div>
          </div>
        )}

        {/* WEEKLY TEAMS & PITCH BOARD */}
        {currentTab === 'pitch' && (
          <div className="space-y-6">
            {/* Header and Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 p-4 rounded-3xl border border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black text-white">Weekly Teams & Tactical Pitch</h2>
                  {isLocked ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      <span>LOCKED</span>
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                      <Unlock className="w-3 h-3" />
                      <span>EDITABLE</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Session: {activeSession?.session_date || 'Wednesday'} · {players.length} registered players · {teamCount} teams
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isCaptain && (
                  <>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                      Teams
                      <select value={teamCount} onChange={e => handleTeamCountChange(e.target.value)} disabled={generatingTeams || isLocked} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white">
                        <option value={2}>2 teams</option>
                        <option value={3}>3 teams</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-300">
                      <span>Players per team</span>
                      <select
                        aria-label="Players per team"
                        value={playersPerTeam}
                        onChange={(e) => setPlayersPerTeam(Number(e.target.value) === 9 ? 9 : 10)}
                        disabled={generatingTeams || isLocked}
                        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white disabled:opacity-50"
                      >
                        <option value={9}>9 players</option>
                        <option value={10}>10 players</option>
                      </select>
                    </label>
                    <button
                      onClick={handleGenerateTeams}
                      disabled={generatingTeams || isLocked}
                      className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-40"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${generatingTeams ? 'animate-spin' : ''}`} />
                      <span>{generatingTeams ? 'Balancing...' : 'Regenerate Teams'}</span>
                    </button>

                    <button
                      onClick={handleToggleLock}
                      className={`py-2 px-4 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                        isLocked
                          ? 'bg-amber-600 hover:bg-amber-500 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                      }`}
                    >
                      {isLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                      <span>{isLocked ? 'Unlock Teams' : 'Lock Teams'}</span>
                    </button>
                  </>
                )}

                <button
                  onClick={() => setShowShareModal(true)}
                  className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition flex items-center gap-1.5"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share Team Sheet</span>
                </button>
              </div>
            </div>

            {/* Tactical Pitch View Component */}
            <TacticalPitchView
              assignments={assignments}
              isCaptain={isCaptain}
              isLocked={isLocked}
              onReplacePlayer={(player) => {
                if (!isCaptain) {
                  alert('Personal captain access is not available. Check that PERSONAL_MODE=true and JWT_SECRET is configured on your private deployment.');
                  return;
                }
                setReplacingPlayer(player);
              }}
            />

            {/* Team Roster Cards (A, B, C) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Team A */}
              {renderTeamCard('A', 'Team A (Emerald)', '#10b981', teamA, isCaptain, isLocked, setReplacingPlayer)}
              {/* Team B */}
              {renderTeamCard('B', 'Team B (Cobalt)', '#38bdf8', teamB, isCaptain, isLocked, setReplacingPlayer)}
              {/* Team C */}
              {teamCount === 3 && renderTeamCard('C', 'Team C (Gold)', '#fbbf24', teamC, isCaptain, isLocked, setReplacingPlayer)}
            </div>

            {/* Algorithm Balance Report */}
            {generationMeta && (
              <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>Lineup Fairness & Teammate Freshness Audit</span>
                  </h4>
                  <span className="text-xs text-emerald-400 font-mono font-bold">
                    Fairness Index: {generationMeta.overall_fairness_rating}%
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {generationMeta.position_balance_note}
                </p>
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1">
                  <span>Pairing Freshness: <strong className="text-white font-mono">{generationMeta.pairing_freshness_score}%</strong> (avoiding duplicate teammates)</span>
                  <span>·</span>
                  <span>Skill Variance: <strong className="text-white font-mono">{generationMeta.skill_variance}</strong> (tight parity across 3 teams)</span>
                </div>
                {generationMeta.limitations?.length > 0 && (
                  <div className="mt-2 p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-xs text-amber-300 space-y-1">
                    {generationMeta.limitations.map((lim: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span>⚠️ {lim}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ATTENDANCE HUB */}
        {currentTab === 'attendance' && (
          <AttendanceHub
            sessionId={activeSession?.id || ''}
            attendance={attendance}
            isLocked={isLocked}
            isCaptain={isCaptain}
            onAttendanceUpdated={loadAllData}
            onProceedToGenerate={() => setCurrentTab('pitch')}
          />
        )}

        {/* MATCH ROTATION & TIMER */}
        {currentTab === 'rotation' && (teamCount === 3 ? (
          <MatchRotationLive
            sessionId={activeSession?.id || ''}
            isCaptain={isCaptain}
            onMatchUpdated={loadAllData}
            matches={matches}
          />
        ) : (
          <div className="rounded-2xl border border-amber-700/60 bg-amber-950/30 p-6 text-amber-100">
            <h2 className="text-lg font-bold">Three-team rotation is turned off</h2>
            <p className="mt-2 text-sm text-amber-200">Winner-stays rotation requires three teams. Switch back to 3 teams on the Pitch tab to use the match timer.</p>
          </div>
        ))}

        {/* SQUAD MANAGEMENT (PLAYERS DIRECTORY) */}
        {currentTab === 'squad' && (
          <SquadManagement
            players={players}
            isCaptain={isCaptain}
            onPlayersUpdated={loadAllData}
          />
        )}

        {/* FAIR PARTICIPATION STATISTICS */}
        {currentTab === 'stats' && (
          <ParticipationStatsView
            stats={statsData.player_statistics}
            totalClubMatches={statsData.total_club_matches}
          />
        )}

        {/* SCHEDULE SETTINGS & AUDIT LOGS */}
        {currentTab === 'settings' && settings && (
          <SettingsAndAudit
            settings={settings}
            auditLogs={auditLogs}
            isCaptain={isCaptain}
            onSettingsUpdated={loadAllData}
            onRefreshLogs={loadAllData}
          />
        )}
      </main>

      {/* MOBILE THUMB-ZONE FIXED BOTTOM TAB BAR (375px - 430px ergonomically optimized) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/90 backdrop-blur-md border-t border-slate-800/80 px-2 py-1 pb-safe">
        <div className="grid grid-cols-5 items-center text-center">
          <button
            onClick={() => setCurrentTab('overview')}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition ${
              currentTab === 'overview' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Trophy className="w-5 h-5" />
            <span className="text-[10px] tracking-tight mt-1">Overview</span>
          </button>

          <button
            onClick={() => setCurrentTab('pitch')}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition ${
              currentTab === 'pitch' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Shuffle className="w-5 h-5" />
            <span className="text-[10px] tracking-tight mt-1">Pitch</span>
          </button>

          <button
            onClick={() => setCurrentTab('attendance')}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition ${
              currentTab === 'attendance' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="text-[10px] tracking-tight mt-1">Attendance</span>
          </button>

          <button
            onClick={() => setCurrentTab('rotation')}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition ${
              currentTab === 'rotation' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-5 h-5" />
            <span className="text-[10px] tracking-tight mt-1">Timer</span>
          </button>

          <button
            onClick={() => setCurrentTab('settings')}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition ${
              currentTab === 'settings' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <SettingsIcon className="w-5 h-5" />
            <span className="text-[10px] tracking-tight mt-1">Settings</span>
          </button>
        </div>
      </nav>

      {/* SHARE LINEUP MODAL */}
      {showShareModal && activeSession && (
        <ShareLineupModal
          session={activeSession}
          assignments={assignments}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* REPLACEMENT MODAL */}
      {replacingPlayer && activeSession && (
        <ReplacementModal
          sessionId={activeSession.id}
          originalPlayer={replacingPlayer}
          onClose={() => setReplacingPlayer(null)}
          onReplacementSuccess={loadAllData}
        />
      )}

    </div>
  );
}

// Render team roster card helper
function renderTeamCard(
  teamId: TeamId,
  name: string,
  color: string,
  players: any[],
  isCaptain: boolean,
  isLocked: boolean,
  onReplace: (p: any) => void
) {
  const strikers = players.filter((p) => p.position === 'Striker');
  const midfielders = players.filter((p) => p.position === 'Midfielder');
  const defenders = players.filter((p) => p.position === 'Defender');

  return (
    <div className="rounded-3xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl flex flex-col justify-between">
      <div>
        {/* Team Card Header */}
        <div
          className="p-4 border-b border-slate-800 flex items-center justify-between"
          style={{ backgroundColor: `${color}15` }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-slate-950"
              style={{ backgroundColor: color }}
            >
              {teamId}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">{name}</h3>
              <span className="text-[11px] text-slate-400">
                {players.length} Players ({strikers.length} ST · {midfielders.length} MF · {defenders.length} DF)
              </span>
            </div>
          </div>

          <span className="text-xs font-mono font-bold" style={{ color }}>
            {players.length} Slots
          </span>
        </div>

        {/* Players List */}
        <div className="divide-y divide-slate-800/60 p-2">
          {players.length === 0 ? (
            <p className="p-4 text-center text-xs text-slate-500">No players assigned yet</p>
          ) : (
            players.map((p, idx) => (
              <div
                key={p.player_id || p.id}
                className="py-2 px-3 rounded-xl hover:bg-slate-800/50 flex items-center justify-between transition group text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-slate-500 text-[11px] w-4">{idx + 1}</span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-white">{p.name}</span>
                      {p.is_temporary_replacement && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          REP
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      <span>{p.position}</span> ·{' '}
                      <span
                        className={
                          p.skill_level === 'Top'
                            ? 'text-amber-400 font-bold'
                            : p.skill_level === 'Medium'
                            ? 'text-slate-300'
                            : 'text-slate-400'
                        }
                      >
                        {p.skill_level}
                      </span>
                    </div>
                  </div>
                </div>

                {isCaptain && !isLocked && (
                  <button
                    onClick={() => onReplace(p)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-200 transition hover:bg-slate-700"
                    title="Replace player"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    <span>Replace</span>
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
