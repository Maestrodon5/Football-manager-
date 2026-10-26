import React, { useEffect, useState, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  Trophy,
  Users,
  Timer,
  ChevronRight,
  AlertCircle,
  Plus,
  Minus,
  Edit2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { api } from '../../services/api.js';
import type { MatchRecord, TeamId } from '../../types/football.js';

interface MatchRotationLiveProps {
  sessionId: string;
  isCaptain: boolean;
  onMatchUpdated: () => void;
  matches: MatchRecord[];
}

export const MatchRotationLive: React.FC<MatchRotationLiveProps> = ({
  sessionId,
  isCaptain,
  onMatchUpdated,
  matches,
}) => {
  // Current active match (either running, paused, or pending)
  const activeMatch = matches.find((m) => m.status !== 'FINISHED') || null;
  const finishedMatches = matches.filter((m) => m.status === 'FINISHED');

  // Live timer state calculated from persisted timestamps
  const [secondsRemaining, setSecondsRemaining] = useState<number>(900);
  const [scoreHome, setScoreHome] = useState<number>(0);
  const [scoreAway, setScoreAway] = useState<number>(0);
  const [showFinishModal, setShowFinishModal] = useState<boolean>(false);
  const [selectedWinner, setSelectedWinner] = useState<TeamId | 'DRAW'>('A');
  const [overrideAway, setOverrideAway] = useState<string>('');
  const [loadingAction, setLoadingAction] = useState<boolean>(false);

  // Sync state whenever activeMatch changes
  useEffect(() => {
    if (activeMatch) {
      setScoreHome(activeMatch.score_home);
      setScoreAway(activeMatch.score_away);
    }
  }, [activeMatch?.id, activeMatch?.score_home, activeMatch?.score_away]);

  // Real-time timer calculation from persisted timestamps (relying on clock, not just interval)
  useEffect(() => {
    if (!activeMatch) {
      setSecondsRemaining(900);
      return;
    }

    const calculateRemaining = () => {
      if (activeMatch.status === 'RUNNING' && activeMatch.last_resumed_at_ms) {
        const nowMs = Date.now();
        const diffSec = Math.floor((nowMs - activeMatch.last_resumed_at_ms) / 1000);
        const currentElapsed = activeMatch.elapsed_seconds + diffSec;
        const rem = Math.max(0, activeMatch.duration_seconds - currentElapsed);
        setSecondsRemaining(rem);
      } else {
        const rem = Math.max(0, activeMatch.duration_seconds - activeMatch.elapsed_seconds);
        setSecondsRemaining(rem);
      }
    };

    calculateRemaining();
    const interval = setInterval(calculateRemaining, 500);

    return () => clearInterval(interval);
  }, [activeMatch?.status, activeMatch?.last_resumed_at_ms, activeMatch?.elapsed_seconds, activeMatch?.duration_seconds]);

  const handleStartRotation = async () => {
    try {
      setLoadingAction(true);
      await api.startMatchRotation(sessionId);
      onMatchUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to start match rotation');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleControl = async (action: 'START' | 'PAUSE' | 'RESUME') => {
    if (!activeMatch) return;
    try {
      setLoadingAction(true);
      await api.controlMatch(activeMatch.id, { action });
      onMatchUpdated();
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleScoreChange = async (homeDelta: number, awayDelta: number) => {
    if (!activeMatch || !isCaptain) return;
    const newHome = Math.max(0, scoreHome + homeDelta);
    const newAway = Math.max(0, scoreAway + awayDelta);
    setScoreHome(newHome);
    setScoreAway(newAway);

    try {
      await api.controlMatch(activeMatch.id, {
        action: 'UPDATE_SCORE',
        score_home: newHome,
        score_away: newAway,
      });
      onMatchUpdated();
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenFinishModal = () => {
    if (!activeMatch) return;
    if (scoreHome > scoreAway) {
      setSelectedWinner(activeMatch.team_home);
    } else if (scoreAway > scoreHome) {
      setSelectedWinner(activeMatch.team_away);
    } else {
      setSelectedWinner('DRAW');
    }
    setShowFinishModal(true);
  };

  const handleConfirmFinish = async () => {
    if (!activeMatch) return;
    try {
      setLoadingAction(true);
      await api.controlMatch(activeMatch.id, {
        action: 'FINISH',
        score_home: scoreHome,
        score_away: scoreAway,
        winner_team: selectedWinner,
        override_next_away: overrideAway || undefined,
      });

      // Confetti celebration for the winner!
      try {
        confetti({ particleCount: 75, spread: 60, origin: { y: 0.6 } });
      } catch (_) {}

      setShowFinishModal(false);
      onMatchUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to finish match');
    } finally {
      setLoadingAction(false);
    }
  };

  // Format mm:ss
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Progress percentage (0 - 100)
  const duration = activeMatch?.duration_seconds || 900;
  const progressPercent = Math.min(100, Math.max(0, ((duration - secondsRemaining) / duration) * 100));

  const teamColors = {
    A: { name: 'Team A (Emerald)', text: 'text-emerald-400', bg: 'bg-emerald-950/60', border: 'border-emerald-600' },
    B: { name: 'Team B (Cobalt)', text: 'text-blue-400', bg: 'bg-blue-950/60', border: 'border-blue-600' },
    C: { name: 'Team C (Gold)', text: 'text-amber-400', bg: 'bg-amber-950/60', border: 'border-amber-600' },
  };

  return (
    <div className="space-y-6">
      {/* Active Match Banner */}
      {activeMatch ? (
        <div className="relative overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 sm:p-8">
          {/* Subtle field gradient */}
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-950/30 via-slate-900/50 to-blue-950/30 pointer-events-none" />

          {/* Top Info Bar */}
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
                <Timer className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white">Match #{activeMatch.match_number}</h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                      activeMatch.status === 'RUNNING'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : activeMatch.status === 'PAUSED'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {activeMatch.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  15-Minute Official Session · Winner Stays Rule
                </p>
              </div>
            </div>

            {/* Waiting Team Indicator */}
            <div className="flex items-center gap-2 py-1.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <Users className="w-4 h-4 text-slate-400" />
              <span className="text-slate-400">Waiting on Bench:</span>
              <strong className={teamColors[activeMatch.waiting_team].text}>
                {teamColors[activeMatch.waiting_team].name}
              </strong>
            </div>
          </div>

          {/* Scoreboard & Center Timer */}
          <div className="relative z-10 py-8 grid grid-cols-1 md:grid-cols-3 items-center gap-6">
            {/* Team Home */}
            <div className={`p-6 rounded-2xl border ${teamColors[activeMatch.team_home].border} ${teamColors[activeMatch.team_home].bg} text-center`}>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Home</span>
              <h4 className={`text-xl font-black mt-1 ${teamColors[activeMatch.team_home].text}`}>
                {teamColors[activeMatch.team_home].name}
              </h4>
              <div className="mt-4 flex items-center justify-center gap-4">
                {isCaptain && (
                  <button
                    onClick={() => handleScoreChange(-1, 0)}
                    disabled={scoreHome <= 0}
                    className="w-10 h-10 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-slate-200 flex items-center justify-center disabled:opacity-30"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                )}
                <span className="text-5xl font-black font-mono text-white tabular-nums">{scoreHome}</span>
                {isCaptain && (
                  <button
                    onClick={() => handleScoreChange(1, 0)}
                    className="w-10 h-10 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-slate-200 flex items-center justify-center"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Center Timer Circular Dial */}
            <div className="flex flex-col items-center justify-center">
              <div className="relative w-44 h-44 rounded-full bg-slate-950 border-4 border-slate-800 flex flex-col items-center justify-center shadow-inner">
                {/* SVG Radial Progress Arc */}
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                  <circle
                    cx="88"
                    cy="88"
                    r="80"
                    fill="none"
                    stroke="#1e293b"
                    strokeWidth="6"
                  />
                  <circle
                    cx="88"
                    cy="88"
                    r="80"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="6"
                    strokeDasharray={502}
                    strokeDashoffset={502 - (502 * progressPercent) / 100}
                    strokeLinecap="round"
                    className="transition-all duration-500"
                  />
                </svg>

                <div className="relative z-10 text-center">
                  <span className="text-xs uppercase font-bold tracking-widest text-slate-400">Time Left</span>
                  <div className="text-3xl font-black font-mono text-white tracking-tight tabular-nums mt-0.5">
                    {formatTime(secondsRemaining)}
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono mt-0.5">15:00 Standard</span>
                </div>
              </div>

              {/* Controls */}
              {isCaptain && (
                <div className="flex items-center gap-2 mt-5">
                  {activeMatch.status === 'RUNNING' ? (
                    <button
                      onClick={() => handleControl('PAUSE')}
                      disabled={loadingAction}
                      className="flex items-center gap-1.5 py-2 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-lg transition"
                    >
                      <Pause className="w-4 h-4" />
                      <span>Pause</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleControl(activeMatch.status === 'PAUSED' ? 'RESUME' : 'START')}
                      disabled={loadingAction}
                      className="flex items-center gap-1.5 py-2 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>{activeMatch.status === 'PAUSED' ? 'Resume' : 'Kickoff'}</span>
                    </button>
                  )}

                  <button
                    onClick={handleOpenFinishModal}
                    disabled={loadingAction}
                    className="flex items-center gap-1.5 py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-xs border border-slate-700 transition"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>End Match</span>
                  </button>
                </div>
              )}
            </div>

            {/* Team Away */}
            <div className={`p-6 rounded-2xl border ${teamColors[activeMatch.team_away].border} ${teamColors[activeMatch.team_away].bg} text-center`}>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Challenger</span>
              <h4 className={`text-xl font-black mt-1 ${teamColors[activeMatch.team_away].text}`}>
                {teamColors[activeMatch.team_away].name}
              </h4>
              <div className="mt-4 flex items-center justify-center gap-4">
                {isCaptain && (
                  <button
                    onClick={() => handleScoreChange(0, -1)}
                    disabled={scoreAway <= 0}
                    className="w-10 h-10 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-slate-200 flex items-center justify-center disabled:opacity-30"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                )}
                <span className="text-5xl font-black font-mono text-white tabular-nums">{scoreAway}</span>
                {isCaptain && (
                  <button
                    onClick={() => handleScoreChange(0, 1)}
                    className="w-10 h-10 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-slate-200 flex items-center justify-center"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl bg-slate-900/80 border border-slate-800 p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-950/80 border border-emerald-800 flex items-center justify-center mx-auto text-emerald-400">
            <Trophy className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">No Active Match In Progress</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
              Ready to start the 15-minute 10v10v10 tournament? Match 1 begins with Team A vs Team B while Team C waits.
            </p>
          </div>
          {isCaptain ? (
            <button
              onClick={handleStartRotation}
              disabled={loadingAction}
              className="py-3 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-xl inline-flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Initialize Match #1 (A vs B)</span>
            </button>
          ) : (
            <p className="text-xs text-amber-400">Waiting for Captain to start the match rotation.</p>
          )}
        </div>
      )}

      {/* Match History & Rotation Audit Table */}
      <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>Match Rotation Ledger ({finishedMatches.length} Completed)</span>
          </h4>
          <span className="text-xs text-slate-500 font-mono">Winner Stays Format</span>
        </div>

        {finishedMatches.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No finished matches recorded for this session yet.</p>
        ) : (
          <div className="space-y-2">
            {finishedMatches.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-slate-400">#{m.match_number}</span>
                  <span className={teamColors[m.team_home].text}>Team {m.team_home}</span>
                  <span className="font-mono font-black text-white px-2 py-0.5 rounded bg-slate-900">
                    {m.score_home} - {m.score_away}
                  </span>
                  <span className={teamColors[m.team_away].text}>Team {m.team_away}</span>
                </div>

                <div className="flex items-center gap-4 text-slate-400 mt-1 sm:mt-0">
                  <span>Bench: Team {m.waiting_team}</span>
                  <span className="font-semibold text-emerald-400">
                    Winner: {m.winner_team === 'DRAW' ? 'Draw' : `Team ${m.winner_team}`}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">{m.duration_seconds / 60}m</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm Match Finish Modal */}
      {showFinishModal && activeMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              <span>Confirm Match #{activeMatch.match_number} Result</span>
            </h3>

            <p className="text-xs text-slate-300">
              Final Score: <strong>Team {activeMatch.team_home}</strong> ({scoreHome}) vs{' '}
              <strong>Team {activeMatch.team_away}</strong> ({scoreAway})
            </p>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 block">Select Winner (Winner Stays):</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedWinner(activeMatch.team_home)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                    selectedWinner === activeMatch.team_home
                      ? 'bg-emerald-600 text-white border-emerald-500'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  Team {activeMatch.team_home}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedWinner(activeMatch.team_away)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                    selectedWinner === activeMatch.team_away
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  Team {activeMatch.team_away}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedWinner('DRAW')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                    selectedWinner === 'DRAW'
                      ? 'bg-amber-600 text-white border-amber-500'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  Draw
                </button>
              </div>
            </div>

            {/* Calculated Next Matchup */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
              <span className="text-slate-400 block">Calculated Next Match:</span>
              <p className="font-semibold text-emerald-400">
                Winner ({selectedWinner === 'DRAW' ? `Team ${activeMatch.team_home}` : `Team ${selectedWinner}`}) plays Waiting (Team {activeMatch.waiting_team}).
              </p>
              <p className="text-[11px] text-slate-500">
                The losing team will rotate out to the bench for 15 minutes.
              </p>
            </div>

            {/* Optional Captain Override */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 block">
                Captain Override: Change Challenger Team (Optional)
              </label>
              <select
                value={overrideAway}
                onChange={(e) => setOverrideAway(e.target.value)}
                className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="">Default (Waiting Team {activeMatch.waiting_team})</option>
                <option value="A">Team A</option>
                <option value="B">Team B</option>
                <option value="C">Team C</option>
              </select>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowFinishModal(false)}
                className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmFinish}
                disabled={loadingAction}
                className="py-2 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg"
              >
                {loadingAction ? 'Advancing...' : 'Confirm & Advance'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
