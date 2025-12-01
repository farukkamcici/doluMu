'use client';
import { useState, useEffect, useCallback } from 'react';

let stopsCache = null;
let routesCache = null;
let loadingPromise = null;

export default function useRoutePolyline() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (stopsCache && routesCache) {
      return;
    }

    if (loadingPromise) {
      return;
    }

    loadingPromise = (async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [stopsRes, routesRes] = await Promise.all([
          fetch('/data/stops_geometry.json'),
          fetch('/data/line_routes.json')
        ]);

        if (!stopsRes.ok || !routesRes.ok) {
          throw new Error('Failed to fetch route data');
        }

        const [stopsData, routesData] = await Promise.all([
          stopsRes.json(),
          routesRes.json()
        ]);

        stopsCache = stopsData.stops;
        routesCache = routesData.routes;
      } catch (err) {
        console.error('Error loading route data:', err);
        setError(err.message);
        stopsCache = {};
        routesCache = {};
      } finally {
        setIsLoading(false);
        loadingPromise = null;
      }
    })();

    loadingPromise.catch(() => {});
  }, []);

  const getPolyline = useCallback((lineCode, direction = 'G') => {
    if (!stopsCache || !routesCache) {
      return [];
    }

    const lineRoutes = routesCache[lineCode];
    if (!lineRoutes) {
      return [];
    }

    const stopCodes = lineRoutes[direction];
    if (!stopCodes || !Array.isArray(stopCodes)) {
      return [];
    }

    const coordinates = [];
    for (const stopCode of stopCodes) {
      const stop = stopsCache[stopCode];
      if (stop && stop.lat && stop.lng) {
        coordinates.push([stop.lat, stop.lng]);
      }
    }

    return coordinates;
  }, []);

  const getAvailableDirections = useCallback((lineCode) => {
    if (!routesCache) {
      return [];
    }

    const lineRoutes = routesCache[lineCode];
    if (!lineRoutes) {
      return [];
    }

    return Object.keys(lineRoutes);
  }, []);

  return {
    getPolyline,
    getAvailableDirections,
    isLoading,
    error
  };
}
