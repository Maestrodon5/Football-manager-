import React, { useState } from 'react';
import {
  Settings,
  Clock,
  Shield,
  Download,
  Upload,
  FileText,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  Search,
} from 'lucide-react';
import { api } from '../../services/api.js';
import type { ScheduleSettings, AuditLogEntry } from '../../types/football.js';

interface SettingsAndAuditProps {
  settings: ScheduleSettings;
  auditLogs: AuditLogEntry[];
  isCaptain: boolean;
  onSettingsUpdated: () => void;
  onRefreshLogs: () => void;
}

export const SettingsAndAudit: React.FC<SettingsAndAuditProps> = ({
  settings,
  auditLogs,
  isCaptain,
  onSettingsUpdated,
  onRefreshLogs,
}) => {
  const [activeTab, setActiveTab] = useState<'settings' | 'audit' | 'backup'>('settings');

  // Settings form states
  const [dayOfWeek, setDayOfWeek] = useState(settings.day_of_week);
  const [matchTime, setMatchTime] = useState(settings.match_time);
  const [timezone, setTimezone] = useState(settings.timezone);
  const [deadlineTime, setDeadlineTime] = useState(settings.confirmation_deadline_time);
  const [autoGen, setAutoGen] = useState(settings.auto_generation_enabled);
  const [requireApproval, setRequireApproval] = useState(settings.require_captain_approval);
  const [unconfirmedHandling, setUnconfirmedHandling] = useState(settings.unconfirmed_handling);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // Audit log search
  const [auditSearch, setAuditSearch] = useState('');

  // Backup restore states
  const [restoreJson, setRestoreJson] = useState<string>('');
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{ success: boolean; msg: string } | null>(null);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCaptain) return;

    try {
      setSavingSettings(true);
      await api.updateSettings({
        day_of_week: dayOfWeek,
        match_time: matchTime,
        timezone,
        confirmation_deadline_time: deadlineTime,
        auto_generation_enabled: autoGen,
        require_captain_approval: requireApproval,
        unconfirmed_handling: unconfirmedHandling,
      });
      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 3000);
      onSettingsUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to update settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDownloadBackup = async () => {
    try {
      const data = await api.getBackupData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pitchmaster_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Failed to download backup');
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setRestoreJson(text);
      setShowRestoreConfirm(true);
    };
    reader.readAsText(file);
  };

  const handleExecuteRestore = async () => {
    try {
      setRestoring(true);
      const parsed = JSON.parse(restoreJson);
      const res = await api.restoreBackup(parsed);
      setRestoreResult({ success: true, msg: 'Database successfully restored from backup!' });
      setShowRestoreConfirm(false);
      onSettingsUpdated();
      onRefreshLogs();
    } catch (err: any) {
      setRestoreResult({ success: false, msg: err.message || 'Restore failed' });
    } finally {
      setRestoring(false);
    }
  };

  const filteredLogs = auditLogs.filter((l) => {
    if (!auditSearch) return true;
    const q = auditSearch.toLowerCase();
    return (
      l.action_type.toLowerCase().includes(q) ||
      l.description.toLowerCase().includes(q) ||
      l.actor.toLowerCase().includes(q) ||
      l.entity_id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Navigation tabs */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-900 rounded-2xl border border-slate-800 max-w-md">
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 py-2 px-3 text-xs font-semibold rounded-xl transition ${
            activeTab === 'settings' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          Weekly Schedule
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`flex-1 py-2 px-3 text-xs font-semibold rounded-xl transition ${
            activeTab === 'audit' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          Audit Log ({auditLogs.length})
        </button>
        <button
          onClick={() => setActiveTab('backup')}
          className={`flex-1 py-2 px-3 text-xs font-semibold rounded-xl transition ${
            activeTab === 'backup' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          Backup & Restore
        </button>
      </div>

      {/* Tab 1: Weekly Schedule Settings */}
      {activeTab === 'settings' && (
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 sm:p-8 shadow-xl max-w-3xl">
          <div className="pb-6 border-b border-slate-800">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-400" />
              <span>Weekly Schedule & Automatic Generation Engine</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Configured for automated background scheduling. Runs on server time without requiring a browser tab.
            </p>
          </div>

          <form onSubmit={handleSaveSettings} className="mt-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Scheduled Match Day:
                </label>
                <select
                  disabled={!isCaptain}
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(e.target.value)}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                >
                  <option value="Wednesday">Every Wednesday (Default)</option>
                  <option value="Saturday">Every Saturday</option>
                  <option value="Sunday">Every Sunday</option>
                  <option value="Tuesday">Every Tuesday</option>
                  <option value="Thursday">Every Thursday</option>
                  <option value="Friday">Every Friday</option>
                  <option value="Monday">Every Monday</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Match Kickoff & Team Generation Time:
                </label>
                <input
                  type="time"
                  disabled={!isCaptain}
                  value={matchTime}
                  onChange={(e) => setMatchTime(e.target.value)}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 disabled:opacity-50 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Timezone:
                </label>
                <select
                  disabled={!isCaptain}
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                >
                  <option value="Africa/Addis_Ababa">Africa/Addis_Ababa (EAT, UTC+3) — Default</option>
                  <option value="Africa/Nairobi">Africa/Nairobi (EAT, UTC+3)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST, UTC+4)</option>
                  <option value="Europe/London">Europe/London (GMT/BST)</option>
                  <option value="America/New_York">America/New_York (EST/EDT)</option>
                  <option value="UTC">UTC (Coordinated Universal Time)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Attendance Confirmation Deadline:
                </label>
                <input
                  type="time"
                  disabled={!isCaptain}
                  value={deadlineTime}
                  onChange={(e) => setDeadlineTime(e.target.value)}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 disabled:opacity-50 font-mono"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">Default: 14:30 (30 mins before kickoff)</span>
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-slate-800">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div>
                  <span className="text-xs font-bold text-white block">Automated Weekly Team Generation</span>
                  <span className="text-[11px] text-slate-400">
                    Runs background optimization job at scheduled time even if no tab is open.
                  </span>
                </div>
                <input
                  type="checkbox"
                  disabled={!isCaptain}
                  checked={autoGen}
                  onChange={(e) => setAutoGen(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div>
                  <span className="text-xs font-bold text-white block">Require Captain Approval Before Final Lock</span>
                  <span className="text-[11px] text-slate-400">
                    Leaves teams open for captain review and swaps prior to match start.
                  </span>
                </div>
                <input
                  type="checkbox"
                  disabled={!isCaptain}
                  checked={requireApproval}
                  onChange={(e) => setRequireApproval(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                <span className="text-xs font-bold text-white block">Handling of Unconfirmed Players</span>
                <div className="flex items-center gap-4 text-xs text-slate-300 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      disabled={!isCaptain}
                      name="unconfirmed"
                      checked={unconfirmedHandling === 'FLAG_AND_EXCLUDE'}
                      onChange={() => setUnconfirmedHandling('FLAG_AND_EXCLUDE')}
                      className="text-emerald-500"
                    />
                    <span>Flag for review & exclude from final teams (Recommended)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      disabled={!isCaptain}
                      name="unconfirmed"
                      checked={unconfirmedHandling === 'INCLUDE'}
                      onChange={() => setUnconfirmedHandling('INCLUDE')}
                      className="text-emerald-500"
                    />
                    <span>Include pending players</span>
                  </label>
                </div>
              </div>
            </div>

            {isCaptain && (
              <div className="flex items-center justify-between pt-4">
                {settingsSuccess ? (
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4" />
                    <span>Settings saved successfully!</span>
                  </span>
                ) : (
                  <span />
                )}
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="py-2.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition"
                >
                  {savingSettings ? 'Saving...' : 'Save Schedule Settings'}
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Tab 2: Audit Log */}
      {activeTab === 'audit' && (
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                <span>Captain Audit Log Ledger</span>
              </h3>
              <p className="text-xs text-slate-400">
                Immutable chronological record of squad changes, team generation, replacements, and match records.
              </p>
            </div>

            <div className="flex items-center gap-2 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Filter audit actions or entities..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                className="w-full py-1.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="rounded-2xl bg-slate-950 border border-slate-800 overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900 text-slate-400 sticky top-0 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Timestamp</th>
                  <th className="py-2.5 px-4 font-semibold">Action</th>
                  <th className="py-2.5 px-4 font-semibold">Description</th>
                  <th className="py-2.5 px-4 font-semibold">Entity</th>
                  <th className="py-2.5 px-4 font-semibold">Actor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-900/50 transition">
                    <td className="py-2.5 px-4 text-slate-400 whitespace-nowrap text-[11px]">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 font-bold text-emerald-400 whitespace-nowrap">
                      {log.action_type}
                    </td>
                    <td className="py-2.5 px-4 font-sans text-slate-200 max-w-sm truncate">
                      {log.description}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400 whitespace-nowrap text-[11px]">
                      {log.entity_type} ({log.entity_id})
                    </td>
                    <td className="py-2.5 px-4 text-amber-300 font-semibold whitespace-nowrap">
                      {log.actor}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Backup and Restore */}
      {activeTab === 'backup' && (
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 sm:p-8 shadow-xl max-w-3xl space-y-6">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-400" />
              <span>Squad & History Database Backup & Restore</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Export complete club records including all 30 players, weekly session history, replacements, and match logs in standardized JSON format.
            </p>
          </div>

          {restoreResult && (
            <div
              className={`p-4 rounded-2xl border text-xs flex items-center gap-3 ${
                restoreResult.success
                  ? 'bg-emerald-950/50 border-emerald-800 text-emerald-200'
                  : 'bg-red-950/50 border-red-800 text-red-200'
              }`}
            >
              {restoreResult.success ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-red-400" />}
              <span>{restoreResult.msg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Export Card */}
            <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Export Club Backup</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Downloads a complete snapshot of all tables, player records, and audit logs.
                </p>
              </div>
              <button
                onClick={handleDownloadBackup}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md inline-flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Download JSON Backup</span>
              </button>
            </div>

            {/* Restore Card */}
            <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-amber-950 border border-amber-800 flex items-center justify-center text-amber-400">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Restore Database</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Upload a verified JSON backup to restore previous squad rosters and history.
                </p>
              </div>
              <label className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-2">
                <Upload className="w-4 h-4" />
                <span>Select Backup File</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileSelected}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Restore Confirmation Modal */}
          {showRestoreConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
              <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-950 border border-amber-800 flex items-center justify-center text-amber-400">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Confirm Database Restore</h3>
                    <p className="text-xs text-slate-400">Verify imported backup contents</p>
                  </div>
                </div>

                <p className="text-xs text-slate-300">
                  This operation will replace current squad records with the snapshot contained in the selected backup file. An automatic audit event will record this action.
                </p>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRestoreConfirm(false)}
                    className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteRestore}
                    disabled={restoring}
                    className="py-2 px-5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-lg"
                  >
                    {restoring ? 'Restoring...' : 'Yes, Restore Database'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
