import React, { useState } from 'react';
import {
  UserPlus,
  Search,
  Edit2,
  Archive,
  Trash2,
  Shield,
  Activity,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../../services/api.js';
import type { Player, Position, SkillLevel } from '../../types/football.js';

interface SquadManagementProps {
  players: Player[];
  isCaptain: boolean;
  onPlayersUpdated: () => void;
}

export const SquadManagement: React.FC<SquadManagementProps> = ({
  players,
  isCaptain,
  onPlayersUpdated,
}) => {
  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState('ALL');
  const [skillFilter, setSkillFilter] = useState('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [deleteConfirmPlayer, setDeleteConfirmPlayer] = useState<Player | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formPosition, setFormPosition] = useState<Position>('Midfielder');
  const [formSkill, setFormSkill] = useState<SkillLevel>('Medium');
  const [formIsActive, setFormIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingAllPlayers, setDeletingAllPlayers] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deleteAllConfirmation, setDeleteAllConfirmation] = useState('');
  const [permanentDeleteMode, setPermanentDeleteMode] = useState(false);

  // Filter players
  const filtered = players.filter((p) => {
    if (positionFilter !== 'ALL' && p.position !== positionFilter) return false;
    if (skillFilter !== 'ALL' && p.skill_level !== skillFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
    }
    return true;
  });

  const handleOpenAdd = () => {
    setFormName('');
    setFormPosition('Midfielder');
    setFormSkill('Medium');
    setFormIsActive(true);
    setShowAddModal(true);
  };

  const handleOpenEdit = (player: Player) => {
    setEditingPlayer(player);
    setFormName(player.name);
    setFormPosition(player.position);
    setFormSkill(player.skill_level);
    setFormIsActive(player.is_active);
  };

  const handleSavePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    try {
      setSubmitting(true);
      if (editingPlayer) {
        await api.updatePlayer(editingPlayer.id, {
          name: formName.trim(),
          position: formPosition,
          skill_level: formSkill,
          is_active: formIsActive,
        });
      } else {
        await api.createPlayer({
          name: formName.trim(),
          position: formPosition,
          skill_level: formSkill,
        });
      }
      setShowAddModal(false);
      setEditingPlayer(null);
      onPlayersUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to save player');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAllPlayers = async () => {
    if (!isCaptain || deletingAllPlayers) return;
    const requiredText = permanentDeleteMode
      ? 'PERMANENTLY DELETE ALL PLAYER DATA'
      : 'DELETE ALL PLAYERS';
    if (deleteAllConfirmation !== requiredText) return;

    try {
      setDeletingAllPlayers(true);
      if (permanentDeleteMode) {
        const result = await api.permanentlyDeleteAllPlayers(deleteAllConfirmation);
        alert(result.message || `Permanently deleted ${result.deletedCount} player profiles.`);
      } else {
        const result = await api.deleteAllPlayers();
        alert(result.message || `Archived ${result.archivedCount} player profiles.`);
      }
      setShowDeleteAllModal(false);
      setDeleteAllConfirmation('');
      setPermanentDeleteMode(false);
      setSearch('');
      setPositionFilter('ALL');
      setSkillFilter('ALL');
      await onPlayersUpdated();
    } catch (err: any) {
      alert(err.message || 'Player operation failed. No success was reported.');
    } finally {
      setDeletingAllPlayers(false);
    }
  };

  const handleConfirmArchive = async (permanent: boolean) => {
    if (!deleteConfirmPlayer) return;
    try {
      await api.archivePlayer(deleteConfirmPlayer.id, permanent);
      setDeleteConfirmPlayer(null);
      onPlayersUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to delete/archive player');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 p-4 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-3 flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search players by name, position or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Position Filter */}
          <select
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
            className="py-1.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none"
          >
            <option value="ALL">All Positions</option>
            <option value="Striker">Striker</option>
            <option value="Midfielder">Midfielder</option>
            <option value="Defender">Defender</option>
          </select>

          {/* Skill Filter */}
          <select
            value={skillFilter}
            onChange={(e) => setSkillFilter(e.target.value)}
            className="py-1.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none"
          >
            <option value="ALL">All Skills</option>
            <option value="Top">Top</option>
            <option value="Medium">Medium</option>
            <option value="Normal">Normal</option>
          </select>

          {isCaptain && (
            <>
              <button
                onClick={handleOpenAdd}
                className="py-1.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Player</span>
              </button>
            </>
          )}
        </div>
      </div>

      {isCaptain && (
        <section className="rounded-2xl border border-rose-900/70 bg-rose-950/20 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-rose-800 bg-rose-950 p-2 text-rose-300"><AlertTriangle className="h-5 w-5" /></div>
            <div className="flex-1">
              <h3 className="text-sm font-black uppercase tracking-wide text-rose-200">Danger Zone</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">
                {players.length} active/visible player profile(s). The recommended action archives players and preserves historical sessions, attendance and statistics.
                Permanent deletion is separate and may remove player-linked history.
              </p>
            </div>
          </div>
          <button type="button" onClick={() => { setPermanentDeleteMode(false); setDeleteAllConfirmation(''); setShowDeleteAllModal(true); }}
            disabled={deletingAllPlayers || players.length === 0}
            className="rounded-xl border border-rose-700 bg-rose-900/60 px-4 py-2 text-xs font-bold text-rose-100 hover:bg-rose-900 disabled:opacity-40">
            <Trash2 className="mr-2 inline h-4 w-4" /> Delete All Players (Archive)
          </button>
        </section>
      )}

      {showDeleteAllModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-all-title" className="w-full max-w-lg space-y-4 rounded-2xl border border-rose-800 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-7 w-7 text-rose-400" />
              <div><h3 id="delete-all-title" className="text-base font-black text-white">{permanentDeleteMode ? 'Permanently Delete All Player Data?' : 'Archive All Players?'}</h3>
              <p className="text-xs text-slate-400">{players.length} currently visible player profile(s) may be affected.</p></div>
            </div>
            <p className="text-sm leading-relaxed text-slate-300">
              {permanentDeleteMode
                ? 'This permanently deletes player profiles and player-linked attendance, assignments, replacements and participation rows. Session and audit history is retained where database constraints allow. This cannot be undone.'
                : 'This removes all players from the active roster by archiving them. Their profiles and historical records remain available; they will no longer be selected for future team generation.'}
            </p>
            <label className="block space-y-2 text-xs font-semibold text-slate-200">
              Type <span className="font-mono text-rose-300">{permanentDeleteMode ? 'PERMANENTLY DELETE ALL PLAYER DATA' : 'DELETE ALL PLAYERS'}</span> to enable confirmation.
              <input autoComplete="off" value={deleteAllConfirmation} onChange={e => setDeleteAllConfirmation(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-rose-500"
                placeholder={permanentDeleteMode ? 'PERMANENTLY DELETE ALL PLAYER DATA' : 'DELETE ALL PLAYERS'} />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-4">
              <button type="button" onClick={() => { setShowDeleteAllModal(false); setDeleteAllConfirmation(''); setPermanentDeleteMode(false); }}
                className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200">Cancel</button>
              <div className="flex flex-wrap gap-2">
                {!permanentDeleteMode ? (
                  <button type="button" onClick={() => { setPermanentDeleteMode(true); setDeleteAllConfirmation(''); }}
                    className="rounded-xl border border-rose-800 px-3 py-2 text-xs font-bold text-rose-300">Show permanent-delete option</button>
                ) : (
                  <button type="button" onClick={() => { setPermanentDeleteMode(false); setDeleteAllConfirmation(''); }}
                    className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300">Back to archive</button>
                )}
                <button type="button" onClick={handleDeleteAllPlayers} disabled={deletingAllPlayers || deleteAllConfirmation !== (permanentDeleteMode ? 'PERMANENTLY DELETE ALL PLAYER DATA' : 'DELETE ALL PLAYERS')}
                  className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-black text-white hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-40">
                  {deletingAllPlayers ? 'Processing…' : permanentDeleteMode ? 'Permanently Delete All Player Data' : 'Confirm Archive All Players'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Players Directory Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((player) => (
          <div
            key={player.id}
            className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">{player.name}</h4>
                  <span className="text-[11px] font-mono text-slate-500">{player.id}</span>
                </div>
                <span
                  className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
                    player.skill_level === 'Top'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      : player.skill_level === 'Medium'
                      ? 'bg-slate-800 text-slate-300'
                      : 'bg-slate-950 text-slate-400 border border-slate-800'
                  }`}
                >
                  {player.skill_level}
                </span>
              </div>

              <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 font-mono text-[11px]">
                  {player.position}
                </span>
                <span>·</span>
                <span className={player.is_active ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                  {player.is_active ? 'Active Squad' : 'Inactive'}
                </span>
              </div>
            </div>

            {isCaptain && (
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-end gap-1.5">
                <button
                  onClick={() => handleOpenEdit(player)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  title="Edit player"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setDeleteConfirmPlayer(player)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-rose-400 transition"
                  title="Archive/Delete player"
                >
                  <Archive className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add / Edit Player Modal */}
      {(showAddModal || editingPlayer) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">
                {editingPlayer ? `Edit ${editingPlayer.name}` : 'Register New Player'}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingPlayer(null);
                }}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePlayer} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Full Name:</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Marcus Sterling"
                  className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Position:</label>
                <select
                  value={formPosition}
                  onChange={(e) => setFormPosition(e.target.value as Position)}
                  className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="Striker">Striker</option>
                  <option value="Midfielder">Midfielder</option>
                  <option value="Defender">Defender</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Skill Level (Top, Medium, Normal):
                </label>
                <select
                  value={formSkill}
                  onChange={(e) => setFormSkill(e.target.value as SkillLevel)}
                  className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="Top">Top (Advanced / Impact Player)</option>
                  <option value="Medium">Medium (Consistent Regular)</option>
                  <option value="Normal">Normal (Standard Club Player)</option>
                </select>
              </div>

              {editingPlayer && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="rounded text-emerald-500"
                  />
                  <label htmlFor="isActive" className="text-xs text-slate-300">
                    Active in Current Squad Selection
                  </label>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingPlayer(null);
                  }}
                  className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="py-2 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md"
                >
                  {submitting ? 'Saving...' : 'Save Player'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Archive / Delete Confirmation Modal */}
      {deleteConfirmPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-950 border border-amber-800 flex items-center justify-center text-amber-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Archive Player?</h3>
                <p className="text-xs text-slate-400">{deleteConfirmPlayer.name}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              Archiving hides the player from weekly team generation while permanently preserving all their past match participation, attendance, and statistical history.
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleConfirmArchive(false)}
                className="py-2 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-md"
              >
                Archive Player (Recommended)
              </button>
              <button
                type="button"
                onClick={() => handleConfirmArchive(true)}
                className="py-2 px-4 rounded-xl bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-semibold"
              >
                Permanently Delete (Destructive)
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirmPlayer(null)}
                className="py-1.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
