import React, { useState } from 'react';
import { X, Copy, Check, Share2, Download, MessageSquare } from 'lucide-react';
import type { WeeklySession } from '../../types/football.js';

interface ShareLineupModalProps {
  session: WeeklySession;
  assignments: any[];
  onClose: () => void;
}

export const ShareLineupModal: React.FC<ShareLineupModalProps> = ({ session, assignments, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);

  // Group assignments into Team A, Team B, Team C
  const teamA = assignments.filter((a) => a.team_id === 'A');
  const teamB = assignments.filter((a) => a.team_id === 'B');
  const teamC = assignments.filter((a) => a.team_id === 'C');

  // Keep shared text simple: team headings and player names only.
  const shareText = `TEAM A
${teamA.map((member) => member.name).filter(Boolean).join('\n') || '(No players assigned)'}

TEAM B
${teamB.map((member) => member.name).filter(Boolean).join('\n') || '(No players assigned)'}${teamC.length ? `

TEAM C
${teamC.map((member) => member.name).filter(Boolean).join('\n') || '(No players assigned)'}` : ''}`;

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareText);
      } else {
        // Clipboard API is often unavailable in installed PWAs and older mobile browsers.
        const textarea = document.createElement('textarea');
        textarea.value = shareText;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        if (!copied) throw new Error('Clipboard access is unavailable on this device.');
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch (err: any) {
      console.error('Copy lineup failed:', err);
      alert('Could not copy automatically. Select the lineup text in the preview, then choose Copy from your device menu.');
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `PitchMaster FC — Teams for ${session.session_date}`,
          text: shareText,
        });
        return;
      } catch (err: any) {
        // Cancellation is not an error; unsupported share targets fall back to copy.
        if (err?.name === 'AbortError') return;
      }
    }
    await handleCopy();
  };

  // Generate and download a canvas lineup graphic
  const handleDownloadGraphic = () => {
    setGeneratingImage(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 1400;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Dark carbon background
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Pitch gradient header
      const grad = ctx.createLinearGradient(0, 0, canvas.width, 160);
      grad.addColorStop(0, '#022c22');
      grad.addColorStop(1, '#064e3b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, 160);

      // Gold border
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 6;
      ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

      // Title
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 42px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚽ PITCHMASTER FC — WEEKLY SQUAD LINEUP', 600, 68);

      ctx.fillStyle = '#fbbf24';
      ctx.font = '500 24px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(
        `Session Date: ${session.session_date} · Kickoff: ${session.scheduled_time || '15:00'} (Africa/Addis_Ababa) · 10v10v10 Rotation`,
        600,
        115
      );

      // Render 3 Columns for Teams A, B, C
      const colWidth = 360;
      const startY = 200;
      const teams = [
        { name: 'TEAM A (EMERALD)', color: '#10b981', bg: '#064e3b', players: teamA, x: 40 },
        { name: 'TEAM B (COBALT)', color: '#38bdf8', bg: '#0369a1', players: teamB, x: 420 },
        { name: 'TEAM C (GOLD)', color: '#fbbf24', bg: '#b45309', players: teamC, x: 800 },
      ];

      teams.forEach((t) => {
        // Team Header Card
        ctx.fillStyle = t.bg;
        ctx.fillRect(t.x, startY, colWidth, 54);
        ctx.strokeStyle = t.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(t.x, startY, colWidth, 54);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t.name, t.x + colWidth / 2, startY + 36);

        // Players
        let py = startY + 84;
        t.players.forEach((p, idx) => {
          ctx.fillStyle = idx % 2 === 0 ? '#0f172a' : '#1e293b';
          ctx.fillRect(t.x, py - 24, colWidth, 48);

          // Number & Name
          ctx.fillStyle = '#f8fafc';
          ctx.font = '600 17px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(`${idx + 1}. ${p.name}`, t.x + 12, py + 6);

          // Position & Skill
          ctx.fillStyle = t.color;
          ctx.font = 'bold 13px "JetBrains Mono", monospace';
          ctx.textAlign = 'right';
          ctx.fillText(`${p.position.slice(0, 2).toUpperCase()} · ${p.skill_level.toUpperCase()}`, t.x + colWidth - 12, py + 6);

          py += 52;
        });
      });

      // Footer
      ctx.fillStyle = '#64748b';
      ctx.font = '16px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        'Generated via PitchMaster FC Manager · Official 15-Minute Winner-Stays System',
        600,
        canvas.height - 40
      );

      // Download
      const link = document.createElement('a');
      link.download = `PitchMaster_Lineup_${session.session_date}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.error('Failed to generate image:', e);
    } finally {
      setGeneratingImage(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Share Confirmed Teams</h2>
              <p className="text-xs text-slate-400">Formatted for squad announcements and device sharing</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Preview */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-wrap select-all max-h-72 overflow-y-auto">
            {shareText}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <button
              onClick={handleCopy}
              className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-sm"
            >
              {copied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copied to Clipboard!' : 'Copy Lineup Text'}</span>
            </button>

            <button
              onClick={handleNativeShare}
              className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition"
            >
              <Share2 className="w-4 h-4 text-emerald-400" />
              <span>Share via Device</span>
            </button>

            <button
              onClick={handleDownloadGraphic}
              disabled={generatingImage}
              className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition"
            >
              <Download className="w-4 h-4 text-amber-400" />
              <span>{generatingImage ? 'Generating...' : 'Save Lineup Graphic'}</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/30 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Total Players Assigned: {assignments.length} (Team A: {teamA.length}, Team B: {teamB.length}, Team C: {teamC.length})
          </span>
          <button
            onClick={onClose}
            className="py-1.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
