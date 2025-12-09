/**
 * MetroScheduleWidget Component
 * 
 * Displays live metro train arrivals with auto-refresh.
 * Follows existing ScheduleWidget design patterns.
 * 
 * Features:
 * - Station + Direction selector
 * - Live countdown to next trains
 * - Estimated arrival times
 * - Auto-refresh every 30 seconds
 * - "No live GPS" disclaimer
 */

'use client';
import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { TrainFront, Loader, MapPin, Navigation, Clock, RefreshCw, Info, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import useMetroTopology from '@/hooks/useMetroTopology';
import useMetroSchedule from '@/hooks/useMetroSchedule';

export default function MetroScheduleWidget({ 
  lineCode, 
  compact = false, 
  limit = 3 
}) {
  const t = useTranslations('schedule');
  const { getLine, getStations } = useMetroTopology();
  
  const [selectedStationId, setSelectedStationId] = useState(null);
  const [selectedDirectionId, setSelectedDirectionId] = useState(null);
  const [showStationPicker, setShowStationPicker] = useState(false);
  const [showDirectionPicker, setShowDirectionPicker] = useState(false);

  // Get line data
  const lineData = useMemo(() => getLine(lineCode), [lineCode, getLine]);
  const stations = useMemo(() => {
    if (!lineData) return [];
    return [...lineData.stations].sort((a, b) => a.order - b.order);
  }, [lineData]);

  // Auto-select first station and its first direction on mount
  useEffect(() => {
    if (stations.length > 0 && !selectedStationId) {
      const firstStation = stations[0];
      setSelectedStationId(firstStation.id);
      
      if (firstStation.directions && firstStation.directions.length > 0) {
        setSelectedDirectionId(firstStation.directions[0].id);
      }
    }
  }, [stations, selectedStationId]);

  // Get current station and its directions
  const currentStation = useMemo(() => {
    return stations.find(s => s.id === selectedStationId);
  }, [stations, selectedStationId]);

  const availableDirections = useMemo(() => {
    return currentStation?.directions || [];
  }, [currentStation]);

  // Fetch live schedule
  const { 
    schedule, 
    loading, 
    error, 
    getNextTrains,
    lastFetchTime 
  } = useMetroSchedule(selectedStationId, selectedDirectionId, {
    enabled: !!(selectedStationId && selectedDirectionId),
    autoRefresh: true
  });

  const upcomingTrains = useMemo(() => {
    return getNextTrains(limit);
  }, [getNextTrains, limit]);

  // Handle station change
  const handleStationChange = (stationId) => {
    setSelectedStationId(stationId);
    setShowStationPicker(false);
    
    // Auto-select first direction of new station
    const newStation = stations.find(s => s.id === stationId);
    if (newStation?.directions && newStation.directions.length > 0) {
      setSelectedDirectionId(newStation.directions[0].id);
    }
  };

  // Handle direction change
  const handleDirectionChange = (directionId) => {
    setSelectedDirectionId(directionId);
    setShowDirectionPicker(false);
  };

  if (!lineData) {
    return (
      <div className={cn(
        "rounded-xl bg-slate-800/50 border border-white/5",
        compact ? "p-2" : "p-4"
      )}>
        <p className="text-xs text-gray-500">{t('noScheduleAvailable')}</p>
      </div>
    );
  }

  const currentDirection = availableDirections.find(d => d.id === selectedDirectionId);

  return (
    <div className={cn(
      "rounded-xl bg-slate-800/50 border border-white/5",
      compact ? "p-2.5 h-full flex flex-col" : "p-4"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrainFront size={14} className="text-purple-400" />
          <h3 className="text-xs font-medium text-gray-300">
            {t('liveArrivals') || 'Live Arrivals'}
          </h3>
        </div>
        {lastFetchTime && (
          <div className="flex items-center gap-1 text-[9px] text-gray-500">
            <Clock size={10} />
            {lastFetchTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      {/* Station Selector */}
      <div className="mb-2 relative">
        <button
          onClick={() => setShowStationPicker(!showStationPicker)}
          className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 border border-white/5 transition-colors text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            <MapPin size={12} className="text-purple-400 shrink-0" />
            <span className="text-xs text-gray-300 truncate">
              {currentStation ? currentStation.description || currentStation.name : t('selectStation') || 'Select Station'}
            </span>
          </div>
          <ChevronDown size={12} className={cn(
            "text-gray-500 shrink-0 transition-transform",
            showStationPicker && "rotate-180"
          )} />
        </button>

        {/* Station Dropdown */}
        {showStationPicker && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-white/10 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
            {stations.map((station) => (
              <button
                key={station.id}
                onClick={() => handleStationChange(station.id)}
                className={cn(
                  "w-full px-3 py-2 text-left text-xs hover:bg-slate-700 transition-colors",
                  selectedStationId === station.id && "bg-purple-500/10 text-purple-300"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 w-5">{station.order}</span>
                  <span className="truncate">{station.description || station.name}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Direction Selector */}
      {availableDirections.length > 0 && (
        <div className="mb-3 relative">
          <button
            onClick={() => setShowDirectionPicker(!showDirectionPicker)}
            className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 border border-white/5 transition-colors text-left"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Navigation size={12} className="text-purple-400 shrink-0" />
              <span className="text-xs text-gray-300 truncate">
                {currentDirection ? currentDirection.name : t('selectDirection') || 'Select Direction'}
              </span>
            </div>
            <ChevronDown size={12} className={cn(
              "text-gray-500 shrink-0 transition-transform",
              showDirectionPicker && "rotate-180"
            )} />
          </button>

          {/* Direction Dropdown */}
          {showDirectionPicker && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-white/10 rounded-lg shadow-xl z-50">
              {availableDirections.map((direction) => (
                <button
                  key={direction.id}
                  onClick={() => handleDirectionChange(direction.id)}
                  className={cn(
                    "w-full px-3 py-2 text-left text-xs hover:bg-slate-700 transition-colors",
                    selectedDirectionId === direction.id && "bg-purple-500/10 text-purple-300"
                  )}
                >
                  {direction.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-6">
          <Loader className="animate-spin text-purple-400" size={20} />
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="flex items-center gap-2 px-3 py-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <Info size={14} className="text-red-400 shrink-0" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {/* No Trains */}
      {!loading && !error && upcomingTrains.length === 0 && selectedStationId && selectedDirectionId && (
        <div className="flex flex-col items-center justify-center py-6 space-y-2">
          <TrainFront size={32} className="text-gray-600" />
          <p className="text-xs text-gray-500 text-center">
            {t('noUpcomingTrains') || 'No upcoming trains'}
          </p>
        </div>
      )}

      {/* Train List */}
      {!loading && !error && upcomingTrains.length > 0 && (
        <>
          <div className="space-y-2 flex-1">
            {upcomingTrains.map((train, idx) => {
              const isNext = idx === 0;
              const minutesText = train.RemainingMinutes === 1 ? t('minute') || 'min' : t('minutes') || 'min';
              
              return (
                <div
                  key={idx}
                  className={cn(
                    "flex items-center justify-between px-3 py-2.5 rounded-lg border",
                    isNext
                      ? "bg-purple-500/10 border-purple-500/30"
                      : "bg-slate-700/30 border-white/5"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "flex items-center justify-center w-6 h-6 rounded-full",
                      isNext ? "bg-purple-500/20" : "bg-slate-600/30"
                    )}>
                      <span className={cn(
                        "text-xs font-bold",
                        isNext ? "text-purple-300" : "text-gray-500"
                      )}>
                        {idx + 1}
                      </span>
                    </div>
                    <div>
                      {train.DestinationStationName && (
                        <p className={cn(
                          "text-xs font-medium",
                          isNext ? "text-purple-200" : "text-gray-400"
                        )}>
                          {train.DestinationStationName}
                        </p>
                      )}
                      {train.ArrivalTime && (
                        <p className="text-[10px] text-gray-500">
                          {train.ArrivalTime}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <p className={cn(
                      "text-sm font-bold",
                      isNext ? "text-purple-400" : "text-gray-300"
                    )}>
                      {train.RemainingMinutes} {minutesText}
                    </p>
                    {train.IsCrowded !== undefined && (
                      <p className={cn(
                        "text-[9px]",
                        train.IsCrowded ? "text-orange-400" : "text-green-400"
                      )}>
                        {train.IsCrowded ? '🔴 Crowded' : '🟢 Available'}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Disclaimer */}
          <div className="mt-3 flex items-start gap-2 px-2 py-2 rounded-lg bg-slate-700/30 border border-white/5">
            <Info size={11} className="text-gray-500 mt-0.5 shrink-0" />
            <p className="text-[10px] text-gray-500 leading-relaxed">
              {t('metroScheduleDisclaimer') || 'Based on scheduled departures. No live GPS tracking available.'}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
