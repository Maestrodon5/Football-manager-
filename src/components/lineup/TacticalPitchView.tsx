import React, { useState } from 'react';
import { Shield, Sparkles, UserCheck, ArrowRightLeft, UserX } from 'lucide-react';
import type { TeamId } from '../../types/football.js';

interface TacticalPitchViewProps {
  assignments: any[];
  onSelectPlayer?: (player: any) => void;
  onReplacePlayer?: (player: any) => void;
  isLocked?: boolean;
  isCaptain?: boolean;
}

export const TacticalPitchView: React.FC<TacticalPitchViewProps> = ({
  assignments,
  onSelectPlayer,
  onReplacePlayer,
  isLocked,
  isCaptain,
}) => {
  const [selectedTeam, setSelectedTeam] = useState<TeamId | 'ALL'>('A');

  // Filter players by selected team
  const filteredPlayers =
    selectedTeam === 'ALL'
      ? assignments
      : assignments.filter((a) => a.team_id === selectedTeam);

  const teamA = assignments.filter((a) => a.team_id === 'A');
  const teamB = assignments.filter((a) => a.team_id === 'B');
  const teamC = assignments.filter((a) => a.team_id === 'C');

  // Categorize positions
  const strikers = filteredPlayers.filter((p) => p.position === 'Striker');
  const midfielders = filteredPlayers.filter((p) => p.position === 'Midfielder');
  const defenders = filteredPlayers.filter((p) => p.position === 'Defender');
  const others = filteredPlayers.filter(
    (p) => !['Striker', 'Midfielder', 'Defender'].includes(p.position)
  );

  const getTeamColor = (teamId: string) => {
    if (teamId === 'A') return { badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', ring: 'border-emerald-500' };
    if (teamId === 'B') return { badge: 'bg-blue-500/20 text-blue-400 border-blue-500/40', ring: 'border-blue-500' };
    return { badge: 'bg-amber-500/20 text-amber-400 border-amber-500/40', ring: 'border-amber-500' };
  };

  const getSkillBadge = (skill: string) => {
    if (skill === 'Top') return 'text-amber-400 font-bold';
    if (skill === 'Medium') return 'text-slate-300';
    return 'text-slate-400';
  };

  return (
    <div className="space-y-4">
      {/* Team Filter Pills (interactive functional tabs) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-2.5 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800/80">
          <button
            onClick={() => setSelectedTeam('A')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              selectedTeam === 'A'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Team A ({teamA.length})
          </button>
          <button
            onClick={() => setSelectedTeam('B')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              selectedTeam === 'B'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Team B ({teamB.length})
          </button>
          <button
            onClick={() => setSelectedTeam('C')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              selectedTeam === 'C'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Team C ({teamC.length})
          </button>
          <button
            onClick={() => setSelectedTeam('ALL')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              selectedTeam === 'ALL'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All 30 Players
          </button>
        </div>

        <div className="text-xs text-slate-400 flex items-center gap-3 px-2">
          <span>Strikers: <strong className="text-emerald-400 font-mono">{strikers.length}</strong></span>
          <span>Midfielders: <strong className="text-blue-400 font-mono">{midfielders.length}</strong></span>
          <span>Defenders: <strong className="text-amber-400 font-mono">{defenders.length}</strong></span>
        </div>
      </div>

      {/* Visual Pitch Board */}
      <div className="relative w-full rounded-3xl overflow-hidden border border-emerald-900/50 bg-gradient-to-b from-emerald-950/80 via-emerald-900/60 to-emerald-950/90 shadow-2xl p-4 sm:p-8 min-h-[580px] flex flex-col justify-between">
        {/* Pitch Lines Vector Graphic */}
        <div className="absolute inset-0 pointer-events-none opacity-20">
          {/* Halfway line */}
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white -translate-y-1/2" />
          {/* Center circle */}
          <div className="absolute top-1/2 left-1/2 w-48 h-48 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" />
          <div className="absolute top-1/2 left-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
          {/* Penalty boxes */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-28 border-b-2 border-x-2 border-white rounded-b-xl" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-72 h-28 border-t-2 border-x-2 border-white rounded-t-xl" />
          {/* Outer field border */}
          <div className="absolute inset-4 border-2 border-white/60 rounded-2xl" />
        </div>

        {/* Tactical Zones */}
        {/* Forward Zone (Attack) */}
        <div className="relative z-10 py-3">
          <div className="text-center mb-2">
            <span className="text-[11px] font-bold tracking-wider uppercase text-emerald-400/90 bg-emerald-950/90 px-3 py-0.5 rounded-full border border-emerald-800/60">
              Forward Line · Strikers ({strikers.length})
            </span>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-2 sm:gap-4 max-w-4xl mx-auto">
            {strikers.map((p) => renderPlayerCard(p, getTeamColor, getSkillBadge, onSelectPlayer, onReplacePlayer, isLocked, isCaptain))}
          </div>
        </div>

        {/* Midfield Zone */}
        <div className="relative z-10 py-4 my-2">
          <div className="text-center mb-2">
            <span className="text-[11px] font-bold tracking-wider uppercase text-blue-400/90 bg-blue-950/90 px-3 py-0.5 rounded-full border border-blue-800/60">
              Central Engine · Midfielders ({midfielders.length})
            </span>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-2 sm:gap-4 max-w-4xl mx-auto">
            {midfielders.map((p) => renderPlayerCard(p, getTeamColor, getSkillBadge, onSelectPlayer, onReplacePlayer, isLocked))}
          </div>
        </div>

        {/* Defense Zone */}
        <div className="relative z-10 py-3">
          <div className="text-center mb-2">
            <span className="text-[11px] font-bold tracking-wider uppercase text-amber-400/90 bg-amber-950/90 px-3 py-0.5 rounded-full border border-amber-800/60">
              Defensive Wall · Defenders ({defenders.length})
            </span>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-2 sm:gap-4 max-w-4xl mx-auto">
            {defenders.map((p) => renderPlayerCard(p, getTeamColor, getSkillBadge, onSelectPlayer, onReplacePlayer, isLocked))}
          </div>
        </div>

        {/* Others / Substitutes if any */}
        {others.length > 0 && (
          <div className="relative z-10 pt-2 border-t border-emerald-800/30">
            <div className="flex flex-wrap justify-center items-center gap-2">
              {others.map((p) => renderPlayerCard(p, getTeamColor, getSkillBadge, onSelectPlayer, onReplacePlayer, isLocked))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function renderPlayerCard(
  p: any,
  getTeamColor: (t: string) => { badge: string; ring: string },
  getSkillBadge: (s: string) => string,
  onSelectPlayer?: (p: any) => void,
  onReplacePlayer?: (p: any) => void,
  isLocked?: boolean,
  isCaptain?: boolean
) {
  const colors = getTeamColor(p.team_id);

  return (
    <div
      key={p.player_id || p.id}
      className={`group relative flex items-center gap-2 py-2 px-3 rounded-xl bg-slate-950/90 hover:bg-slate-900 border ${
        p.is_temporary_replacement ? 'border-amber-500' : 'border-slate-800'
      } shadow-lg backdrop-blur-md transition-all hover:scale-105 cursor-pointer`}
      onClick={() => onSelectPlayer && onSelectPlayer(p)}
    >
      {/* Jersey circle with Team ID */}
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border ${colors.ring} ${
          p.team_id === 'A' ? 'bg-emerald-950 text-emerald-300' : p.team_id === 'B' ? 'bg-blue-950 text-blue-300' : 'bg-amber-950 text-amber-300'
        }`}
      >
        {p.team_id}
      </div>

      {/* Name and Details */}
      <div className="text-left">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-100 whitespace-nowrap">{p.name}</span>
          {p.is_temporary_replacement && (
            <span className="text-[10px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
              REP
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <span>{p.position}</span>
          <span>·</span>
          <span className={getSkillBadge(p.skill_level)}>{p.skill_level}</span>
        </div>
      </div>

      {/* Quick Action Trigger */}
      {isCaptain && !isLocked && onReplacePlayer && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onReplacePlayer(p);
          }}
          className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-200 transition hover:bg-slate-700"
          title="Replace player"
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
          <span>Replace</span>
        </button>
      )}
    </div>
  );
}
