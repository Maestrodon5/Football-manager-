import React, { useEffect, useMemo, useState } from 'react';
import { X, ArrowRightLeft, AlertTriangle, CheckCircle, UserPlus, Users } from 'lucide-react';
import { api } from '../../services/api.js';
import type { ReplacementType, Position } from '../../types/football.js';

interface ReplacementModalProps {
  sessionId: string;
  originalPlayer: any;
  onClose: () => void;
  onReplacementSuccess: () => void;
}

type Candidate = {
  id: string; name: string; position: Position; secondary_position?: Position | null;
  skill_level: string; skill_rating?: number; current_team?: string | null; total_matches?: number;
};

const positions: Position[] = ['Defender', 'Midfielder', 'Striker'];

export const ReplacementModal: React.FC<ReplacementModalProps> = ({ sessionId, originalPlayer, onClose, onReplacementSuccess }) => {
  const outgoingId = originalPlayer.player_id || originalPlayer.id;
  const destinationTeam = originalPlayer.team_id || originalPlayer.team_name || originalPlayer.current_team || 'A';
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [source, setSource] = useState<'existing' | 'new'>('existing');
  const [replacementType, setReplacementType] = useState<ReplacementType>('TEMPORARY');
  const [reason, setReason] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [sourceTeamAction, setSourceTeamAction] = useState('');
  const [sourceFillPlayerId, setSourceFillPlayerId] = useState('');
  const [editProfile, setEditProfile] = useState(false);
  const [profileChangesSaved, setProfileChangesSaved] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profilePosition, setProfilePosition] = useState<Position>('Midfielder');
  const [profileSecondary, setProfileSecondary] = useState<Position | ''>('');
  const [profileRating, setProfileRating] = useState(6);
  const [newName, setNewName] = useState('');
  const [newPosition, setNewPosition] = useState<Position>('Midfielder');
  const [newSecondary, setNewSecondary] = useState<Position | ''>('');
  const [newRating, setNewRating] = useState(6);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.getReplacementRecommendations(sessionId, outgoingId)
      .then(res => {
        if (!active) return;
        const list = (res.recommendations || []).map((r: any) => r.player as Candidate);
        setCandidates(list);
        if (list.length) {
          setSelectedId(list[0].id);
          setProfileName(list[0].name);
          setProfilePosition(list[0].position);
          setProfileSecondary(list[0].secondary_position || '');
          setProfileRating(Number(list[0].skill_rating || (list[0].skill_level === 'Top' ? 9 : list[0].skill_level === 'Medium' ? 6 : 3)));
        }
      })
      .catch((e: any) => setError(e.message || 'Could not load eligible players.'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionId, outgoingId]);

  const selected = candidates.find(p => p.id === selectedId);
  const unassigned = useMemo(() => candidates.filter(p => !p.current_team && p.id !== selectedId), [candidates, selectedId]);
  const sourceTeam = selected?.current_team || null;
  const edited = Boolean(selected && (
    profileName.trim() !== selected.name ||
    profilePosition !== selected.position ||
    (profileSecondary || null) !== (selected.secondary_position || null) ||
    profileRating !== Number(selected.skill_rating || (selected.skill_level === 'Top' ? 9 : selected.skill_level === 'Medium' ? 6 : 3))
  ));

  const chooseCandidate = (p: Candidate) => {
    setSelectedId(p.id);
    setProfileName(p.name);
    setProfilePosition(p.position);
    setProfileSecondary(p.secondary_position || '');
    setProfileRating(Number(p.skill_rating || (p.skill_level === 'Top' ? 9 : p.skill_level === 'Medium' ? 6 : 3)));
    setEditProfile(false);
    setProfileChangesSaved(false);
    setSourceTeamAction('');
    setSourceFillPlayerId('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!reason.trim()) { setError('Enter a reason for this replacement.'); return; }
    if (source === 'existing' && !selected) { setError('Choose a replacement player.'); return; }
    if (source === 'existing' && edited && !profileChangesSaved) { setError('Review and select Save Player Changes before confirming profile edits.'); return; }
    if (sourceTeam && !sourceTeamAction) { setError('Choose how to resolve the source-team vacancy before continuing.'); return; }
    if (sourceTeamAction === 'fill_vacancy' && !sourceFillPlayerId) { setError('Choose an unassigned player to fill the source-team vacancy.'); return; }
    if (source === 'new' && (!newName.trim() || !Number.isInteger(newRating) || newRating < 1 || newRating > 10)) {
      setError('New player needs a full name and skill rating from 1 to 10.'); return;
    }
    const summary = source === 'new' ? `new player ${newName}` : `${selected?.name}${sourceTeam ? ` from Team ${sourceTeam}` : ' from the unassigned roster'}`;
    const vacancyNote = sourceTeam
      ? (sourceTeamAction === 'fill_vacancy' ? ` Team ${sourceTeam} will receive the selected unassigned player.` : ` Team ${sourceTeam} will have one fewer player; this uneven lineup is explicitly approved.`)
      : '';
    const confirmation = `Replace ${originalPlayer.name} in Team ${destinationTeam} with ${summary}?\n\nType: ${replacementType}.\nReason: ${reason.trim()}.\n${vacancyNote}\n\nReview the affected lineups before confirming.`;
    if (!window.confirm(confirmation)) return;
    try {
      setSubmitting(true);
      await api.createReplacement(sessionId, {
        original_player_id: outgoingId,
        replacement_player_id: source === 'existing' ? selectedId : undefined,
        replacement_type: replacementType,
        reason: reason.trim(),
        effective_date: effectiveDate,
        source_team_action: sourceTeam ? sourceTeamAction : undefined,
        source_fill_player_id: sourceTeamAction === 'fill_vacancy' ? sourceFillPlayerId : undefined,
        profile_changes: source === 'existing' && edited && profileChangesSaved ? {
          full_name: profileName.trim(), position: profilePosition,
          secondary_position: profileSecondary || null, skill_rating: profileRating,
        } : undefined,
        new_player: source === 'new' ? {
          full_name: newName.trim(), position: newPosition,
          secondary_position: newSecondary || null, skill_rating: newRating,
        } : undefined,
      });
      await onReplacementSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Replacement failed. Stored data was not reported as changed.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500';
  const labelClass = 'mb-1 block text-xs font-semibold text-slate-300';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 bg-slate-950/70 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-amber-800 bg-amber-950 p-2 text-amber-300"><ArrowRightLeft className="h-5 w-5" /></div>
            <div>
              <h2 className="text-base font-black text-white">Replace Player</h2>
              <p className="mt-1 text-xs text-slate-300">Outgoing: <strong className="text-white">{originalPlayer.name}</strong> · Team {destinationTeam} · {originalPlayer.position || 'Position not set'} · {originalPlayer.skill_rating ?? originalPlayer.skill_level ?? 'Rating not set'}</p>
              <p className="mt-1 text-[11px] text-slate-500">No goalkeeper position is available. Profile edits are saved only when the replacement is confirmed.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close replacement dialog" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button>
        </header>

        <form onSubmit={submit} className="flex-1 space-y-5 overflow-y-auto p-5">
          {error && <div role="alert" className="rounded-xl border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</div>}

          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-300">1. Replacement type</h3>
            <div className="grid grid-cols-2 gap-3">
              {(['TEMPORARY', 'PERMANENT'] as ReplacementType[]).map(type => (
                <button key={type} type="button" onClick={() => setReplacementType(type)} className={`rounded-xl border p-3 text-left ${replacementType === type ? 'border-emerald-500 bg-emerald-950/40' : 'border-slate-700 bg-slate-950'}`}>
                  <span className="flex items-center gap-2 text-sm font-bold text-white">{type === 'TEMPORARY' ? 'Temporary' : 'Permanent'} {replacementType === type && <CheckCircle className="h-4 w-4 text-emerald-400" />}</span>
                  <span className="mt-1 block text-xs text-slate-400">{type === 'TEMPORARY' ? 'This session only; original roster remains unchanged.' : 'Affects the active roster from the effective date. Historical sessions remain unchanged.'}</span>
                </button>
              ))}
            </div>
            {replacementType === 'PERMANENT' && <div><label className={labelClass}>Effective date</label><input required type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} className={inputClass} /></div>}
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-300">2. Choose replacement source</h3>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setSource('existing')} className={`rounded-xl border p-3 text-sm font-bold ${source === 'existing' ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200' : 'border-slate-700 bg-slate-950 text-slate-300'}`}><Users className="mr-2 inline h-4 w-4" />Registered player</button>
              <button type="button" onClick={() => { setSource('new'); setSelectedId(''); }} className={`rounded-xl border p-3 text-sm font-bold ${source === 'new' ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200' : 'border-slate-700 bg-slate-950 text-slate-300'}`}><UserPlus className="mr-2 inline h-4 w-4" />Add new player</button>
            </div>
            {source === 'existing' && (
              loading ? <p className="py-6 text-center text-sm text-slate-400">Loading active roster and team assignments…</p> :
              candidates.length === 0 ? <p className="rounded-xl border border-slate-700 p-4 text-sm text-slate-400">No eligible registered replacement players are available. Add a new player instead.</p> :
              <div className="max-h-52 space-y-2 overflow-y-auto">
                {candidates.map(p => (
                  <button type="button" key={p.id} onClick={() => chooseCandidate(p)} className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left ${selectedId === p.id ? 'border-emerald-500 bg-emerald-950/30' : 'border-slate-700 bg-slate-950 hover:border-slate-500'}`}>
                    <span><strong className="block text-sm text-white">{p.name}</strong><span className="mt-1 block text-xs text-slate-400">{p.position}{p.secondary_position ? ` / ${p.secondary_position}` : ''} · Rating {p.skill_rating ?? 5} · {p.total_matches || 0} matches</span></span>
                    <span className="text-right text-xs font-bold text-emerald-300">{p.current_team ? `Currently Team ${p.current_team}` : 'Unassigned'}</span>
                  </button>
                ))}
              </div>
            )}
            {source === 'new' && (
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-700 bg-slate-950 p-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><label className={labelClass}>Full name *</label><input required value={newName} onChange={e => setNewName(e.target.value)} className={inputClass} placeholder="Full player name" /></div>
                <div><label className={labelClass}>Primary position *</label><select value={newPosition} onChange={e => setNewPosition(e.target.value as Position)} className={inputClass}>{positions.map(pos => <option key={pos} value={pos}>{pos}</option>)}</select></div>
                <div><label className={labelClass}>Secondary position (optional)</label><select value={newSecondary} onChange={e => setNewSecondary(e.target.value as Position | '')} className={inputClass}><option value="">None</option>{positions.filter(p => p !== newPosition).map(pos => <option key={pos} value={pos}>{pos}</option>)}</select></div>
                <div className="sm:col-span-2"><label className={labelClass}>Skill rating: {newRating}/10</label><input type="range" min="1" max="10" value={newRating} onChange={e => setNewRating(Number(e.target.value))} className="w-full" /><div className="flex justify-between text-[10px] text-slate-500"><span>1 · Developing</span><span>10 · Elite</span></div></div>
              </div>
            )}
          </section>

          {source === 'existing' && selected && (
            <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-bold uppercase tracking-wide text-slate-300">3. Review replacement profile</h3><button type="button" onClick={() => { setEditProfile(v => !v); setProfileChangesSaved(false); }} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold text-emerald-300">{editProfile ? 'Cancel edits' : 'Edit details'}</button></div>
              {editProfile && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><label className={labelClass}>Player name</label><input value={profileName} onChange={e => { setProfileName(e.target.value); setProfileChangesSaved(false); }} className={inputClass} /></div>
                <div><label className={labelClass}>Primary position</label><select value={profilePosition} onChange={e => { setProfilePosition(e.target.value as Position); setProfileChangesSaved(false); }} className={inputClass}>{positions.map(pos => <option key={pos} value={pos}>{pos}</option>)}</select></div>
                <div><label className={labelClass}>Secondary position</label><select value={profileSecondary} onChange={e => { setProfileSecondary(e.target.value as Position | ''); setProfileChangesSaved(false); }} className={inputClass}><option value="">None</option>{positions.filter(p => p !== profilePosition).map(pos => <option key={pos} value={pos}>{pos}</option>)}</select></div>
                <div><label className={labelClass}>Skill rating: {profileRating}/10</label><input type="range" min="1" max="10" value={profileRating} onChange={e => { setProfileRating(Number(e.target.value)); setProfileChangesSaved(false); }} className="w-full" /></div>
                <div className="sm:col-span-2"><p className="text-xs text-amber-200">Changing position or skill rating affects future team generations. Changes to this existing profile are only written if you confirm the replacement.</p><button type="button" onClick={() => setProfileChangesSaved(true)} className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Save Player Changes</button>{profileChangesSaved && <span className="ml-2 text-xs text-emerald-300">Changes staged for confirmation</span>}</div>
              </div>}
              {!editProfile && <p className="text-xs text-slate-400">{selected.name} · {selected.position} · Rating {selected.skill_rating ?? 5}{selected.current_team ? ` · currently assigned to Team ${selected.current_team}` : ' · not assigned to a team in this session'}</p>}
            </section>
          )}

          {source === 'existing' && sourceTeam && (
            <section className="space-y-3 rounded-xl border border-amber-800/70 bg-amber-950/20 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-amber-200">Source team vacancy: Team {sourceTeam}</h3>
              <p className="text-xs leading-relaxed text-slate-300">Moving {selected?.name} to Team {destinationTeam} removes them from Team {sourceTeam}. Choose how to resolve the source team's vacancy; the app will not silently leave the change unresolved.</p>
              <label className="flex items-start gap-2 text-xs text-slate-200"><input type="radio" name="sourceAction" checked={sourceTeamAction === 'fill_vacancy'} onChange={() => setSourceTeamAction('fill_vacancy')} className="mt-0.5" /><span><strong>Fill vacancy</strong> with an unassigned active player</span></label>
              {sourceTeamAction === 'fill_vacancy' && <select value={sourceFillPlayerId} onChange={e => setSourceFillPlayerId(e.target.value)} className={inputClass}><option value="">Choose a player…</option>{unassigned.map(p => <option key={p.id} value={p.id}>{p.name} · {p.position} · rating {p.skill_rating ?? 5}</option>)}</select>}
              <label className="flex items-start gap-2 text-xs text-slate-200"><input type="radio" name="sourceAction" checked={sourceTeamAction === 'allow_uneven'} onChange={() => setSourceTeamAction('allow_uneven')} className="mt-0.5" /><span><strong>Approve uneven source team</strong> — explicitly accept one fewer player in Team {sourceTeam}</span></label>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-300">4. Reason and final review</h3>
            <div><label className={labelClass}>Reason for replacement *</label><input required value={reason} onChange={e => setReason(e.target.value)} className={inputClass} placeholder="Absence, injury, availability, etc." /></div>
            <div className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-300">
              <p className="font-bold text-white">Proposed change</p>
              <p className="mt-1">Team {destinationTeam}: {originalPlayer.name} → {source === 'new' ? (newName || 'New player') : (selected?.name || 'Select a player')}</p>
              {sourceTeam && <p className="mt-1">Team {sourceTeam}: {sourceTeamAction === 'fill_vacancy' ? `fill with ${unassigned.find(p => p.id === sourceFillPlayerId)?.name || 'selected player'}` : sourceTeamAction === 'allow_uneven' ? 'Captain-approved uneven roster' : 'vacancy resolution required'}</p>}
              <p className="mt-1 text-slate-400">Confirming writes to the database in a transaction and records the action in the audit log. Existing confirmed session history is not intentionally rewritten.</p>
            </div>
          </section>

          <footer className="flex justify-end gap-2 border-t border-slate-800 pt-4">
            <button type="button" onClick={onClose} className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200">Cancel</button>
            <button type="submit" disabled={submitting || loading || (source === 'existing' && !selected)} className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-black text-white hover:bg-emerald-500 disabled:opacity-40">{submitting ? 'Applying…' : 'Preview and Confirm Replacement'}</button>
          </footer>
        </form>
      </div>
    </div>
  );
};
