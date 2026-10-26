import React, { useEffect, useState } from 'react';
import {
  X,
  ArrowRightLeft,
  ShieldAlert,
  Sparkles,
  CheckCircle,
  Clock,
  UserCheck,
  AlertCircle,
} from 'lucide-react';
import { api } from '../../services/api.js';
import type { Player, ReplacementType } from '../../types/football.js';

interface ReplacementModalProps {
  sessionId: string;
  originalPlayer: any;
  onClose: () => void;
  onReplacementSuccess: () => void;
}

export const ReplacementModal: React.FC<ReplacementModalProps> = ({
  sessionId,
  originalPlayer,
  onClose,
  onReplacementSuccess,
}) => {
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [selectedReplacementId, setSelectedReplacementId] = useState<string>('');
  const [replacementType, setReplacementType] = useState<ReplacementType>('TEMPORARY');
  const [reason, setReason] = useState<string>('Sudden hamstring tightness during warmup');
  const [endDate, setEndDate] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    async function fetchRecs() {
      try {
        setLoading(true);
        const res = await api.getReplacementRecommendations(sessionId, originalPlayer.player_id || originalPlayer.id);
        setRecommendations(res.recommendations);
        if (res.recommendations.length > 0) {
          setSelectedReplacementId(res.recommendations[0].player.id);
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to load replacement recommendations');
      } finally {
        setLoading(false);
      }
    }
    fetchRecs();
  }, [sessionId, originalPlayer.player_id, originalPlayer.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReplacementId) {
      alert('Please select a replacement player.');
      return;
    }
    if (!reason.trim()) {
      alert('Please provide a reason for the replacement.');
      return;
    }

    if (
      replacementType === 'PERMANENT' &&
      !confirm(
        `Are you sure you want to make this a PERMANENT replacement? ${originalPlayer.name} will be deactivated from future active squad matches.`
      )
    ) {
      return;
    }

    try {
      setSubmitting(true);
      await api.createReplacement(sessionId, {
        original_player_id: originalPlayer.player_id || originalPlayer.id,
        replacement_player_id: selectedReplacementId,
        replacement_type: replacementType,
        reason: reason.trim(),
        end_date: endDate || undefined,
      });

      onReplacementSuccess();
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to apply replacement');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-950 border border-amber-800 flex items-center justify-center text-amber-400">
              <ArrowRightLeft className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Select Player Replacement</h2>
              <p className="text-xs text-slate-400">
                Replacing <strong className="text-emerald-400">{originalPlayer.name}</strong> ({originalPlayer.position} · {originalPlayer.skill_level})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-950/50 border border-red-800 text-xs text-red-200">
              {errorMsg}
            </div>
          )}

          {/* Replacement Type Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">Replacement Scope:</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setReplacementType('TEMPORARY')}
                className={`p-3 rounded-2xl text-left border transition ${
                  replacementType === 'TEMPORARY'
                    ? 'bg-emerald-950/60 border-emerald-500 shadow-md'
                    : 'bg-slate-950 border-slate-800 opacity-60 hover:opacity-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400">Temporary</span>
                  {replacementType === 'TEMPORARY' && <CheckCircle className="w-4 h-4 text-emerald-400" />}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  For this week's match session only. Original player profile and history remain intact.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setReplacementType('PERMANENT')}
                className={`p-3 rounded-2xl text-left border transition ${
                  replacementType === 'PERMANENT'
                    ? 'bg-amber-950/60 border-amber-500 shadow-md'
                    : 'bg-slate-950 border-slate-800 opacity-60 hover:opacity-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400">Permanent</span>
                  {replacementType === 'PERMANENT' && <CheckCircle className="w-4 h-4 text-amber-400" />}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Replaces player permanently in squad. Outgoing player archived; incoming joins active squad.
                </p>
              </button>
            </div>
          </div>

          {/* Intelligent Candidate Recommendations */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Recommended Available Replacements</span>
              </label>
              <span className="text-[11px] text-slate-500">Sorted by Position, Skill & Historical Fairness</span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
                Analyzing squad roster and historical balance...
              </div>
            ) : recommendations.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 text-center">
                No available unassigned players found in reserve.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {recommendations.map((rec, idx) => {
                  const p = rec.player;
                  const isSelected = selectedReplacementId === p.id;
                  const isTopPick = idx === 0;

                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedReplacementId(p.id)}
                      className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-emerald-950/40 border-emerald-500 ring-1 ring-emerald-500/50'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="replacement"
                          checked={isSelected}
                          onChange={() => setSelectedReplacementId(p.id)}
                          className="text-emerald-500"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">{p.name}</span>
                            {isTopPick && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                                BEST MATCH
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                            <span className={rec.same_position ? 'text-emerald-400 font-semibold' : ''}>
                              {p.position}
                            </span>
                            <span>·</span>
                            <span className={rec.same_skill ? 'text-emerald-400 font-semibold' : ''}>
                              {p.skill_level}
                            </span>
                            <span>·</span>
                            <span>{p.total_matches || 0} matches played</span>
                          </div>
                          {rec.compromise_note && (
                            <p className="text-[10px] text-amber-400/90 mt-1">⚠️ {rec.compromise_note}</p>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-mono font-bold text-emerald-400">
                          {rec.score} pts
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Reason Input */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300 block">Reason for Replacement:</label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Travel, Work shift, Hamstring injury, Illness..."
              className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Optional End Date for Temporary */}
          {replacementType === 'TEMPORARY' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 block">
                Expected Return Date (Optional):
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          )}

          {/* Footer actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedReplacementId}
              className="py-2 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg transition"
            >
              {submitting ? 'Applying Replacement...' : 'Confirm Replacement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
