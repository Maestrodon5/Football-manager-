import React, { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  UserCheck,
  UserX,
  ShieldAlert,
  Search,
  Filter,
} from 'lucide-react';
import { api } from '../../services/api.js';
import type { AttendanceStatus, Player } from '../../types/football.js';

interface AttendanceHubProps {
  sessionId: string;
  attendance: any[];
  isLocked: boolean;
  isCaptain: boolean;
  onAttendanceUpdated: () => void;
  onProceedToGenerate?: () => void;
}

export const AttendanceHub: React.FC<AttendanceHubProps> = ({
  sessionId,
  attendance,
  isLocked,
  isCaptain,
  onAttendanceUpdated,
  onProceedToGenerate,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [selectedPlayerForNote, setSelectedPlayerForNote] = useState<any | null>(null);
  const [statusReason, setStatusReason] = useState<string>('');
  const [targetStatus, setTargetStatus] = useState<AttendanceStatus>('ABSENT');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Stats
  const total = attendance.length;
  const confirmed = attendance.filter((a) => a.status === 'CONFIRMED').length;
  const pending = attendance.filter((a) => a.status === 'PENDING').length;
  const absent = attendance.filter((a) => a.status === 'ABSENT').length;
  const injured = attendance.filter((a) => a.status === 'INJURED').length;

  const shortfall = 30 - confirmed;

  // Filter list
  const filtered = attendance.filter((a) => {
    if (filterStatus !== 'ALL' && a.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return a.name.toLowerCase().includes(q) || a.position.toLowerCase().includes(q);
    }
    return true;
  });

  const handleQuickStatusChange = async (playerId: string, status: AttendanceStatus) => {
    if (!isCaptain || isLocked) return;
    try {
      setUpdatingId(playerId);
      await api.updateAttendance(sessionId, { player_id: playerId, status });
      onAttendanceUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to update attendance');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleBulkConfirmPending = async () => {
    if (!isCaptain || isLocked) return;
    const pendingIds = attendance.filter((a) => a.status === 'PENDING').map((a) => a.player_id);
    if (pendingIds.length === 0) return;

    if (!confirm(`Confirm attendance for all ${pendingIds.length} pending players?`)) return;

    try {
      await api.updateAttendance(sessionId, {
        bulk_player_ids: pendingIds,
        status: 'CONFIRMED',
      });
      onAttendanceUpdated();
    } catch (err: any) {
      alert(err.message || 'Bulk confirmation failed');
    }
  };

  const handleOpenReasonModal = (player: any, status: 'ABSENT' | 'INJURED') => {
    setSelectedPlayerForNote(player);
    setTargetStatus(status);
    setStatusReason(player.reason || '');
  };

  const handleSaveReasonModal = async () => {
    if (!selectedPlayerForNote || !isCaptain) return;
    try {
      await api.updateAttendance(sessionId, {
        player_id: selectedPlayerForNote.player_id,
        status: targetStatus,
        reason: statusReason,
      });
      setSelectedPlayerForNote(null);
      onAttendanceUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    }
  };

  return (
    <div className="space-y-6">
      {/* Attendance Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Registered</span>
            <UsersIcon />
          </div>
          <div className="text-2xl font-black font-mono text-white mt-1 tabular-nums">{total}</div>
          <span className="text-[11px] text-slate-500">Club Squad</span>
        </div>

        <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/60">
          <div className="flex items-center justify-between">
            <span className="text-xs text-emerald-300 font-medium">Confirmed</span>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black font-mono text-emerald-400 mt-1 tabular-nums">{confirmed}</div>
          <span className="text-[11px] text-emerald-400/70">Eligible for Play</span>
        </div>

        <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-800/60">
          <div className="flex items-center justify-between">
            <span className="text-xs text-amber-300 font-medium">Pending</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black font-mono text-amber-400 mt-1 tabular-nums">{pending}</div>
          <span className="text-[11px] text-amber-400/70">Awaiting Check-in</span>
        </div>

        <div className="p-4 rounded-2xl bg-red-950/40 border border-red-800/60">
          <div className="flex items-center justify-between">
            <span className="text-xs text-red-300 font-medium">Absent</span>
            <XCircle className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl font-black font-mono text-red-400 mt-1 tabular-nums">{absent}</div>
          <span className="text-[11px] text-red-400/70">Not Attending</span>
        </div>

        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-800/60 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-rose-300 font-medium">Injured</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black font-mono text-rose-400 mt-1 tabular-nums">{injured}</div>
          <span className="text-[11px] text-rose-400/70">Medical Rest</span>
        </div>
      </div>

      {/* Shortfall or Readiness Alert */}
      {shortfall > 0 ? (
        <div className="p-4 rounded-2xl bg-amber-950/50 border border-amber-800/80 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-6 h-6 text-amber-400 flex-shrink-0" />
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-amber-200">
                Attendance Shortfall: {shortfall} player(s) missing for standard 30-player 3-team match
              </h4>
              <p className="text-xs text-amber-400/80 mt-0.5">
                Current confirmed count is <strong>{confirmed}</strong>. Teams will be balanced as evenly as possible (e.g. {Math.floor(confirmed / 3)} per team) if generated now.
              </p>
            </div>
          </div>
          {isCaptain && pending > 0 && !isLocked && (
            <button
              onClick={handleBulkConfirmPending}
              className="py-2 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md whitespace-nowrap"
            >
              Confirm All {pending} Pending
            </button>
          )}
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-emerald-950/50 border border-emerald-800/80 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-emerald-400 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-emerald-200">Squad Fully Confirmed (30 / 30 Players)</h4>
              <p className="text-xs text-emerald-400/80 mt-0.5">
                All 30 roster spots are confirmed available. Perfect 10v10v10 teams can be generated.
              </p>
            </div>
          </div>
          {onProceedToGenerate && !isLocked && (
            <button
              onClick={onProceedToGenerate}
              className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md"
            >
              Proceed to Generate Teams →
            </button>
          )}
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 p-3 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search players by name or position..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
          {(['ALL', 'CONFIRMED', 'PENDING', 'ABSENT', 'INJURED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                filterStatus === st ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {st === 'ALL' ? 'All' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Players Attendance List */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Player</th>
                <th className="py-3 px-4 font-semibold">Position</th>
                <th className="py-3 px-4 font-semibold">Skill Level</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Reason / Notes</th>
                {isCaptain && <th className="py-3 px-4 font-semibold text-right">Captain Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-3 px-4 font-bold text-white whitespace-nowrap">
                    {item.name}
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 font-mono text-[11px]">
                      {item.position}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`font-semibold ${
                        item.skill_level === 'Top'
                          ? 'text-amber-400'
                          : item.skill_level === 'Medium'
                          ? 'text-slate-300'
                          : 'text-slate-400'
                      }`}
                    >
                      {item.skill_level}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        item.status === 'CONFIRMED'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : item.status === 'PENDING'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                          : item.status === 'ABSENT'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-400 max-w-xs truncate">
                    {item.reason || '—'}
                  </td>
                  {isCaptain && (
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {!isLocked ? (
                        <div className="inline-flex items-center gap-1">
                          {item.status !== 'CONFIRMED' && (
                            <button
                              onClick={() => handleQuickStatusChange(item.player_id, 'CONFIRMED')}
                              disabled={updatingId === item.player_id}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] shadow-sm"
                            >
                              Confirm
                            </button>
                          )}
                          {item.status !== 'ABSENT' && (
                            <button
                              onClick={() => handleOpenReasonModal(item, 'ABSENT')}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px] border border-slate-700"
                            >
                              Absent
                            </button>
                          )}
                          {item.status !== 'INJURED' && (
                            <button
                              onClick={() => handleOpenReasonModal(item, 'INJURED')}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-400 font-semibold text-[11px] border border-slate-700"
                            >
                              Injured
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-500 text-[11px]">Teams Locked</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reason Modal */}
      {selectedPlayerForNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-white">
              Mark {selectedPlayerForNote.name} as {targetStatus}
            </h3>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Reason / Notes:</label>
              <textarea
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder="e.g. Travel, Work shift, Hamstring strain..."
                rows={3}
                className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedPlayerForNote(null)}
                className="py-1.5 px-3 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveReasonModal}
                className="py-1.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
              >
                Save Status
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function UsersIcon() {
  return (
    <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}
