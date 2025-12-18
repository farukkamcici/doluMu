"use client";

import { useState } from 'react';
import axios from 'axios';
import { formatDistanceToNow, format } from 'date-fns';
import { AlertTriangle, Database, DatabaseZap, RefreshCw, Target, Trash2 } from 'lucide-react';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';

export default function BusCachePanel({ status, getAuthHeaders, onRefresh }) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
  const [message, setMessage] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lineForm, setLineForm] = useState({ lineCode: "", targetDate: "" });
  const [cleanupDays, setCleanupDays] = useState(5);

  if (!status) {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/40 p-6">
        <div aria-busy="true">
          <Skeleton className="h-5 w-48" />
          <div className="mt-3">
            <SkeletonText lines={2} />
          </div>
          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
          <span className="sr-only">Loading bus cache status...</span>
        </div>
      </div>
    );
  }

  const today = status.today || {};
  const storage = status.storage || {};
  const runtime = status.runtime || {};
  const pendingLines = runtime.pending_lines || [];

  const refreshStatus = async () => {
    if (typeof onRefresh === 'function') {
      onRefresh();
    }
  };

  const triggerRefresh = async (force = false) => {
    setIsRefreshing(true);
    setMessage("");
    try {
      const headers = getAuthHeaders();
      await axios.post(`${API_URL}/admin/bus/cache/refresh`, { mode: 'all', force }, { headers });
      setMessage(force ? '🚌 Forced refresh scheduled.' : '🚌 Refresh scheduled.');
      setTimeout(refreshStatus, 1500);
    } catch (error) {
      setMessage(`❌ Failed to schedule refresh: ${error.response?.data?.detail || error.message}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const triggerLineRefresh = async () => {
    if (!lineForm.lineCode) {
      setMessage('❌ Line code is required');
      return;
    }

    setIsRefreshing(true);
    setMessage("");
    try {
      const headers = getAuthHeaders();
      await axios.post(
        `${API_URL}/admin/bus/cache/refresh`,
        {
          mode: 'line',
          line_code: lineForm.lineCode,
          target_date: lineForm.targetDate || undefined
        },
        { headers }
      );
      setMessage('✅ Line refresh scheduled');
      setLineForm({ ...lineForm, targetDate: "" });
      setTimeout(refreshStatus, 1500);
    } catch (error) {
      setMessage(`❌ Line refresh failed: ${error.response?.data?.detail || error.message}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const triggerCleanup = async () => {
    if (!cleanupDays || cleanupDays < 1) {
      setMessage('❌ Cleanup days must be >= 1');
      return;
    }

    setIsRefreshing(true);
    setMessage("");
    try {
      const headers = getAuthHeaders();
      await axios.post(`${API_URL}/admin/bus/cache/cleanup?days=${cleanupDays}`, {}, { headers });
      setMessage(`🧹 Cleanup scheduled (cutoff ${cleanupDays} day(s))`);
      setTimeout(refreshStatus, 1500);
    } catch (error) {
      setMessage(`❌ Cleanup failed: ${error.response?.data?.detail || error.message}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-white/10 bg-slate-900/40 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-white text-sm font-semibold flex items-center gap-2">
              <DatabaseZap className="h-4 w-4 text-gray-200" />
              Bus Schedule Cache
            </h3>
            {runtime.last_run && (
              <p className="text-xs text-gray-500">
                Last run {formatDistanceToNow(new Date(runtime.last_run), { addSuffix: true })}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => triggerRefresh(false)}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-white/5 border border-white/10 text-gray-200 hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh All
            </button>
            <button
              onClick={() => triggerRefresh(true)}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-red-950/25 border border-red-900/40 text-red-200 hover:bg-red-950/40 disabled:opacity-50"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Force Refresh
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${message.startsWith('❌') ? 'bg-red-950/30 border border-red-900/40 text-red-200' : 'bg-green-950/30 border border-green-900/40 text-green-200'}`}>
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Stat
            title="Total Lines"
            value={today.lines_total || 0}
            subtext="transport_type_id == 1"
          />
          <Stat
            title="Cached Today"
            value={`${today.lines_cached || 0} / ${today.lines_total || 0}`}
            subtext={`${today.fresh_lines || 0} fresh • ${today.stale_lines || 0} stale • day_type ${today.day_type || '—'}`
          />
          <Stat
            title="Pending Lines"
            value={pendingLines.length}
            subtext={runtime.retry_job_active ? 'Retry job active' : 'No retry job'}
            status={runtime.retry_job_active ? 'warning' : 'success'}
          />
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-black/20 border border-white/10 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <Target className="h-4 w-4 text-gray-300" />
              Refresh Single Line
            </h4>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Line code (e.g., 15F)"
                className="w-full bg-slate-950/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                value={lineForm.lineCode}
                onChange={(e) => setLineForm({ ...lineForm, lineCode: e.target.value })}
              />
              <input
                type="date"
                className="w-full bg-slate-950/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                value={lineForm.targetDate}
                onChange={(e) => setLineForm({ ...lineForm, targetDate: e.target.value })}
              />
              <button
                onClick={triggerLineRefresh}
                disabled={isRefreshing}
                className="w-full inline-flex items-center justify-center gap-2 bg-blue-950/25 border border-blue-900/40 rounded-lg py-2 text-xs font-semibold text-blue-200 hover:bg-blue-950/40 disabled:opacity-50"
              >
                <Target className="h-3.5 w-3.5" />
                Refresh Line
              </button>
            </div>
          </div>

          <div className="bg-black/20 border border-white/10 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-gray-300" />
              Cleanup Old Rows
            </h4>
            <div className="space-y-2">
              <input
                type="number"
                min="1"
                className="w-full bg-slate-950/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                value={cleanupDays}
                onChange={(e) => setCleanupDays(Number(e.target.value))}
              />
              <button
                onClick={triggerCleanup}
                disabled={isRefreshing}
                className="w-full inline-flex items-center justify-center gap-2 bg-amber-950/25 border border-amber-900/40 rounded-lg py-2 text-xs font-semibold text-amber-200 hover:bg-amber-950/40 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Cleanup
              </button>
              <p className="text-[11px] text-gray-500">Rows older than this many days will be deleted.</p>
            </div>
          </div>

          <div className="bg-black/20 border border-white/10 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <Database className="h-4 w-4 text-gray-300" />
              Storage Info
            </h4>
            <ul className="text-xs text-gray-400 space-y-1">
              <li>Entries: <span className="text-white font-bold">{storage.entries_total || 0}</span></li>
              <li>Retention: {storage.retention_days || 5} days</li>
              <li>
                Last Entry: {storage.last_entry_at ? format(new Date(storage.last_entry_at), 'MMM dd HH:mm') : '—'}
              </li>
              <li>
                Retry Job: {runtime.retry_job_active ? 'Active' : 'Idle'}
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-slate-900/40 p-6">
        <h4 className="text-sm font-semibold text-white mb-3">Pending Lines</h4>

        {!pendingLines.length ? (
          <p className="text-xs text-gray-500">No pending lines.</p>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pb-2">Line</th>
                  <th className="pb-2">Attempts</th>
                  <th className="pb-2">Last Error</th>
                </tr>
              </thead>
              <tbody>
                {pendingLines.map((line) => (
                  <tr key={line.line_code} className="border-t border-gray-800 text-gray-300">
                    <td className="py-2 font-mono text-[11px]">{line.line_code}</td>
                    <td className="py-2">
                      <span className={`font-bold ${line.attempts > 5 ? 'text-red-400' : 'text-yellow-300'}`}>
                        {line.attempts || 0}
                      </span>
                    </td>
                    <td className="py-2 text-gray-500 max-w-xs truncate" title={line.last_error || ''}>
                      {line.last_error || 'Pending'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ title, value, subtext, status }) {
  const colorMap = {
    success: 'text-green-400',
    warning: 'text-yellow-400',
    danger: 'text-red-400'
  };

  return (
    <div className="bg-black/20 border border-white/10 rounded-xl p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500">{title}</p>
      <p className={`text-3xl font-bold text-white ${status ? colorMap[status] : ''}`}>{value}</p>
      {subtext && <p className="text-[11px] text-gray-500 mt-1">{subtext}</p>}
    </div>
  );
}
