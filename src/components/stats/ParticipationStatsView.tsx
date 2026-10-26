import React, { useState } from 'react';
import { Trophy, TrendingUp, AlertCircle, ArrowUpDown, Filter } from 'lucide-react';
import type { PlayerParticipation } from '../../types/football.js';

interface ParticipationStatsViewProps {
  stats: any[];
  totalClubMatches: number;
}

export const ParticipationStatsView: React.FC<ParticipationStatsViewProps> = ({
  stats,
  totalClubMatches,
}) => {
  const [sortBy, setSortBy] = useState<'fairness' | 'minutes' | 'matches' | 'name'>('fairness');
  const [sortAsc, setSortAsc] = useState<boolean>(true); // default ascending for fairness to surface players needing minutes!

  const sorted = [...stats].sort((a, b) => {
    let diff = 0;
    if (sortBy === 'fairness') diff = a.fairness_ratio - b.fairness_ratio;
    else if (sortBy === 'minutes') diff = a.total_playing_minutes - b.total_playing_minutes;
    else if (sortBy === 'matches') diff = a.total_matches_played - b.total_matches_played;
    else diff = a.player_name.localeCompare(b.player_name);
    return sortAsc ? diff : -diff;
  });

  const toggleSort = (field: 'fairness' | 'minutes' | 'matches' | 'name') => {
    if (sortBy === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(field);
      setSortAsc(field === 'fairness'); // ascending for fairness so underrepresented players are first
    }
  };

  // Identify players needing more pitch time
  const underrepresented = stats.filter((s) => s.fairness_ratio < 70);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-bold tracking-wider text-emerald-400">
              Fair Participation Monitor
            </span>
          </div>
          <h3 className="text-lg font-bold text-white mt-1">Player Playing Time & Equality Index</h3>
          <p className="text-xs text-slate-400 max-w-xl mt-1">
            Separating team assignment from actual on-pitch match rotation. Total club matches played:{' '}
            <strong className="text-white font-mono">{totalClubMatches}</strong>.
          </p>
        </div>

        <div className="flex items-center gap-4 bg-slate-950 p-3 rounded-2xl border border-slate-800">
          <div className="text-center px-3 border-r border-slate-800">
            <span className="text-[10px] uppercase text-slate-500 font-bold block">Club Matches</span>
            <span className="text-xl font-black font-mono text-emerald-400">{totalClubMatches}</span>
          </div>
          <div className="text-center px-3">
            <span className="text-[10px] uppercase text-slate-500 font-bold block">Low Pitch Time</span>
            <span className="text-xl font-black font-mono text-amber-400">{underrepresented.length}</span>
          </div>
        </div>
      </div>

      {/* Fairness Tip */}
      {underrepresented.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-800/60 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <p className="text-xs text-amber-300">
            Captain Notice: <strong>{underrepresented.length}</strong> players currently have below 70% rotation participation. Prioritize them for substitute minutes or opening match rotation slots.
          </p>
        </div>
      )}

      {/* Statistics Table */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300">Participation Leaderboard</span>
          <span className="text-[11px] text-slate-500">Click headers to sort</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/70 text-slate-400 border-b border-slate-800">
              <tr>
                <th
                  onClick={() => toggleSort('name')}
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-white"
                >
                  <div className="flex items-center gap-1">
                    <span>Player</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4 font-semibold">Position</th>
                <th className="py-3 px-4 font-semibold">Skill Level</th>
                <th
                  onClick={() => toggleSort('matches')}
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-white text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Matches Played</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4 font-semibold text-right">Matches Sat Out</th>
                <th
                  onClick={() => toggleSort('minutes')}
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-white text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Playing Minutes</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('fairness')}
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-white text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Fairness Ratio</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {sorted.map((item) => (
                <tr key={item.player_id} className="hover:bg-slate-800/30 transition">
                  <td className="py-3 px-4 font-sans font-bold text-white whitespace-nowrap">
                    {item.player_name}
                  </td>
                  <td className="py-3 px-4 font-sans text-slate-300">
                    <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px]">
                      {item.position}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-sans">
                    <span
                      className={
                        item.skill_level === 'Top'
                          ? 'text-amber-400 font-semibold'
                          : item.skill_level === 'Medium'
                          ? 'text-slate-300'
                          : 'text-slate-400'
                      }
                    >
                      {item.skill_level}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-emerald-400 font-bold tabular-nums">
                    {item.total_matches_played}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-400 tabular-nums">
                    {item.total_matches_sat_out}
                  </td>
                  <td className="py-3 px-4 text-right text-white font-bold tabular-nums">
                    {item.total_playing_minutes} min
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden hidden sm:block">
                        <div
                          className={`h-full rounded-full ${
                            item.fairness_ratio >= 75
                              ? 'bg-emerald-500'
                              : item.fairness_ratio >= 50
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                          }`}
                          style={{ width: `${Math.min(100, item.fairness_ratio)}%` }}
                        />
                      </div>
                      <span
                        className={`font-bold tabular-nums text-xs ${
                          item.fairness_ratio >= 75
                            ? 'text-emerald-400'
                            : item.fairness_ratio >= 50
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {item.fairness_ratio}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
