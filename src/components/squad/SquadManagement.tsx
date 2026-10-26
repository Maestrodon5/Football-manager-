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
    const confirmed = window.confirm(
      `Permanently delete ALL ${players.length} player profiles? This also removes their attendance, team assignments, replacement records, and player statistics. This cannot be undone.`
    );
    if (!confirmed) return;
    const confirmationText = window.prompt('Type DELETE ALL PLAYERS to confirm this permanent action:');
    if (confirmationText !== 'DELETE ALL PLAYERS') {
      if (confirmationText !== null) alert('Confirmation text did not match. No players were deleted.');
      return;
    }

    try {
      setDeletingAllPlayers(true);
      const result = await api.deleteAllPlayers();
      alert(result.message || `Deleted ${result.deletedCount} player profiles.`);
      setSearch('');
      setPositionFilter('ALL');
      setSkillFilter('ALL');
      await onPlayersUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to delete all players.');
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
              <button
                type="button"
                onClick={handleDeleteAllPlayers}
                disabled={deletingAllPlayers || players.length === 0}
                title="Permanently delete every player and player-linked records"
                className="py-1.5 px-4 rounded-xl bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-800 font-bold text-xs shadow-md inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deletingAllPlayers ? 'Deleting Players…' : 'Delete All Players'}</span>
              </button>
            </>
          )}
        </div>
      </div>

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
