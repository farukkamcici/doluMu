/**
 * useMetroSchedule Hook
 * 
 * Fetches and manages live train arrival data for metro stations.
 * Auto-refreshes every 30 seconds when active.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getMetroSchedule } from '@/lib/metroApi';

const REFRESH_INTERVAL = 30000; // 30 seconds

export default function useMetroSchedule(stationId, directionId, options = {}) {
  const { autoRefresh = true, enabled = true } = options;

  const [schedule, setSchedule] = useState(null);
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

  const fetchSchedule = useCallback(async () => {
    if (!stationId || !directionId || !enabled) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getMetroSchedule(stationId, directionId);

      if (isMounted.current) {
        setSchedule(data);
        setLastFetchTime(new Date());
        setError(null);
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err.message || 'Failed to fetch train schedule');
        setSchedule(null);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [stationId, directionId, enabled]);

  // Initial fetch
  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  // Auto-refresh timer
  useEffect(() => {
    if (!autoRefresh || !enabled || !stationId || !directionId) {
      return;
    }

    refreshTimerRef.current = setInterval(() => {
      fetchSchedule();
    }, REFRESH_INTERVAL);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [autoRefresh, enabled, stationId, directionId, fetchSchedule]);

  /**
   * Get next N arriving trains.
   */
  const getNextTrains = useCallback((count = 3) => {
    if (!schedule?.Success || !schedule?.Data) {
      return [];
    }

    return schedule.Data
      .filter(train => train.RemainingMinutes != null)
      .sort((a, b) => a.RemainingMinutes - b.RemainingMinutes)
      .slice(0, count);
  }, [schedule]);

  /**
   * Check if there are trains arriving soon (within N minutes).
   */
  const hasTrainsSoon = useCallback((withinMinutes = 5) => {
    const nextTrains = getNextTrains(1);
    return nextTrains.length > 0 && nextTrains[0].RemainingMinutes <= withinMinutes;
  }, [getNextTrains]);

  return {
    schedule,
    loading,
    error,
    lastFetchTime,
    getNextTrains,
    hasTrainsSoon,
    refresh: fetchSchedule
  };
}
