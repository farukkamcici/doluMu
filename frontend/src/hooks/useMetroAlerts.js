/**
 * useMetroAlerts Hook
 * 
 * Fetches and manages metro network status and service alerts.
 * Auto-refreshes every 5 minutes.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getMetroNetworkStatus } from '@/lib/metroApi';

const REFRESH_INTERVAL = 300000; // 5 minutes

export default function useMetroAlerts(options = {}) {
  const { autoRefresh = true, enabled = true } = options;

  const [networkStatus, setNetworkStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetchTime, setLastFetchTime] = useState(null);

  const isMounted = useRef(true);
  const refreshTimerRef = useRef(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, []);

  const fetchStatus = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getMetroNetworkStatus();

      if (isMounted.current) {
        setNetworkStatus(data);
        setLastFetchTime(new Date());
        setError(null);
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err.message || 'Failed to fetch metro status');
        setNetworkStatus(null);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [enabled]);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-refresh timer
  useEffect(() => {
    if (!autoRefresh || !enabled) {
      return;
    }

    refreshTimerRef.current = setInterval(() => {
      fetchStatus();
    }, REFRESH_INTERVAL);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [autoRefresh, enabled, fetchStatus]);

  /**
   * Get status for specific line.
   */
  const getLineStatus = useCallback((lineCode) => {
    return networkStatus?.lines?.[lineCode] || null;
  }, [networkStatus]);

  /**
   * Get alerts for specific line.
   */
  const getLineAlerts = useCallback((lineCode) => {
    const lineStatus = getLineStatus(lineCode);
    return lineStatus?.alerts || [];
  }, [getLineStatus]);

  /**
   * Check if line has active alerts.
   */
  const hasAlerts = useCallback((lineCode) => {
    const alerts = getLineAlerts(lineCode);
    return alerts.length > 0;
  }, [getLineAlerts]);

  /**
   * Get all lines with active alerts.
   */
  const getLinesWithAlerts = useCallback(() => {
    if (!networkStatus?.lines) return [];

    return Object.entries(networkStatus.lines)
      .filter(([_, line]) => line.alerts && line.alerts.length > 0)
      .map(([lineCode, line]) => ({
        lineCode,
        lineName: line.line_name,
        status: line.status,
        alertCount: line.alerts.length,
        alerts: line.alerts
      }));
  }, [networkStatus]);

  /**
   * Check if line is operational.
   */
  const isLineOperational = useCallback((lineCode) => {
    const lineStatus = getLineStatus(lineCode);
    return lineStatus?.status === 'ACTIVE';
  }, [getLineStatus]);

  return {
    networkStatus,
    loading,
    error,
    lastFetchTime,
    getLineStatus,
    getLineAlerts,
    hasAlerts,
    getLinesWithAlerts,
    isLineOperational,
    refresh: fetchStatus
  };
}
