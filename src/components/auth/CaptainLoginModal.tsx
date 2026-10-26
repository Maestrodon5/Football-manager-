import React, { useState } from 'react';
import { ShieldCheck, X, KeyRound, CheckCircle2, ArrowRight } from 'lucide-react';
import { api } from '../../services/api.js';

interface CaptainLoginModalProps {
  onClose: () => void;
  onLoginSuccess: (captain: any) => void;
}

export const CaptainLoginModal: React.FC<CaptainLoginModalProps> = ({ onClose, onLoginSuccess }) => {
  const [passcode, setPasscode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleOneClickAuth = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const res = await api.autoLogin();
      onLoginSuccess(res.captain);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Authorization failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode) return;

    try {
      setLoading(true);
      setErrorMsg('');
      const res = await api.login('captain', passcode.trim());
      onLoginSuccess(res.captain);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid captain passcode');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Captain Access</h3>
              <p className="text-[11px] text-slate-400">Club administrator authorization</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-800 text-xs text-red-200 space-y-2">
            <div className="font-semibold flex items-center gap-1.5">
              <span>{errorMsg}</span>
            </div>
            {errorMsg.includes('404') && (
              <div className="text-[11px] text-red-300/90 leading-normal border-t border-red-900/60 pt-2 space-y-2">
                <p>
                  <strong>Why this happened on Vercel:</strong> Vercel deployed the static frontend without running the backend Express server. We added <code className="bg-red-900/50 px-1 py-0.5 rounded text-amber-200">vercel.json</code> and <code className="bg-red-900/50 px-1 py-0.5 rounded text-amber-200">api/index.ts</code> to enable Vercel Serverless Functions.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const fallback = api.fallbackCaptainAuth();
                    onLoginSuccess(fallback.captain);
                    onClose();
                  }}
                  className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition text-center"
                >
                  ⚡ Unlock Instant Captain Session (Client Mode)
                </button>
              </div>
            )}
          </div>
        )}

        <div className="space-y-4">
          <p className="text-xs text-slate-300 leading-relaxed">
            Verify administrator session to unlock manual lineup adjustments, player replacements, and match rotation controls.
          </p>

          <button
            type="button"
            onClick={handleOneClickAuth}
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg transition flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{loading ? 'Verifying Session...' : 'Authorize Captain Session'}</span>
          </button>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-800"></div>
            <span className="flex-shrink mx-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              Or Custom Passcode
            </span>
            <div className="flex-grow border-t border-slate-800"></div>
          </div>

          <form onSubmit={handlePasscodeSubmit} className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Club access code..."
                  className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !passcode}
                className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold flex items-center gap-1"
              >
                <span>Verify</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="py-1.5 px-4 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-400 text-xs font-semibold"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
