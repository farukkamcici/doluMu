/**
 * MetroLayer Component
 * 
 * Renders metro lines and stations on Leaflet map.
 * Integrates with existing bus route visualization.
 * 
 * Features:
 * - Polylines for metro lines (using line colors from topology)
 * - Station markers with different styles (start/intermediate/end)
 * - Click handlers for station details
 * - Responsive to selected line state
 */

'use client';
import { Polyline, CircleMarker, Popup, Marker, useMap } from 'react-leaflet';
import { useEffect, useMemo, useState } from 'react';
import { divIcon } from 'leaflet';
import { renderToStaticMarkup } from 'react-dom/server';
import useMetroTopology from '@/hooks/useMetroTopology';
import useAppStore from '@/store/useAppStore';
import { Train, Zap } from 'lucide-react';

/**
 * Custom metro station marker icon
 */
const createMetroStationIcon = (color, isTerminus = false) => {
  const size = isTerminus ? 12 : 8;
  const IconComponent = isTerminus ? Train : Zap;
  
  return divIcon({
    html: renderToStaticMarkup(
      <div className="relative flex items-center justify-center">
        <div 
          className="absolute rounded-full border-2 border-white shadow-lg"
          style={{ 
            width: `${size}px`, 
            height: `${size}px`,
            backgroundColor: color
          }}
        ></div>
        {isTerminus && (
          <div className="absolute" style={{ marginTop: '-2px' }}>
            <IconComponent size={6} color="white" />
          </div>
        )}
      </div>
    ),
    className: 'bg-transparent',
    iconSize: [size * 2, size * 2],
    iconAnchor: [size, size],
  });
};

/**
 * MetroStationMarker - Individual station marker with popup
 */
function MetroStationMarker({ station, lineColor, lineName, isStart, isEnd, onStationClick }) {
  const isTerminus = isStart || isEnd;
  const icon = useMemo(() => createMetroStationIcon(lineColor, isTerminus), [lineColor, isTerminus]);

  const handleClick = () => {
    if (onStationClick) {
      onStationClick(station, lineName);
    }
  };

  return (
    <CircleMarker
      center={[station.coordinates.lat, station.coordinates.lng]}
      radius={isTerminus ? 8 : 5}
      pathOptions={{
        color: lineColor,
        fillColor: lineColor,
        fillOpacity: 1,
        weight: 2
      }}
      eventHandlers={{
        click: handleClick
      }}
    >
      <Popup>
        <div className="text-sm">
          <div className="font-bold text-gray-900 dark:text-gray-100">
            {station.description || station.name}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            {lineName} - {isStart ? 'Start' : isEnd ? 'End' : `Stop ${station.order}`}
          </div>
          
          {/* Accessibility badges */}
          {station.accessibility && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {station.accessibility.elevator && (
                <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                  🛗 Elevator
                </span>
              )}
              {station.accessibility.escalator && (
                <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                  🎢 Escalator
                </span>
              )}
              {station.accessibility.wc && (
                <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">
                  🚻 WC
                </span>
              )}
              {station.accessibility.masjid && (
                <span className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded">
                  🕌 Masjid
                </span>
              )}
            </div>
          )}

          {/* Directions */}
          {station.directions && station.directions.length > 0 && (
            <div className="mt-2 text-xs">
              <div className="font-semibold text-gray-700 dark:text-gray-300">Directions:</div>
              {station.directions.map(dir => (
                <div key={dir.id} className="text-gray-600 dark:text-gray-400">
                  → {dir.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </Popup>
    </CircleMarker>
  );
}

/**
 * MetroLineLayer - Renders a single metro line
 */
function MetroLineLayer({ lineCode, lineData, onStationClick }) {
  const coordinates = useMemo(() => {
    const stations = [...lineData.stations].sort((a, b) => a.order - b.order);
    return stations.map(s => [s.coordinates.lat, s.coordinates.lng]);
  }, [lineData.stations]);

  const sortedStations = useMemo(() => {
    return [...lineData.stations].sort((a, b) => a.order - b.order);
  }, [lineData.stations]);

  const color = lineData.color || '#3b82f6';

  return (
    <>
      {/* Polyline connecting all stations */}
      <Polyline
        positions={coordinates}
        pathOptions={{
          color: color,
          weight: 4,
          opacity: 0.7,
          lineCap: 'round',
          lineJoin: 'round'
        }}
      />

      {/* Station markers */}
      {sortedStations.map((station, index) => {
        const isStart = index === 0;
        const isEnd = index === sortedStations.length - 1;

        return (
          <MetroStationMarker
            key={station.id}
            station={station}
            lineColor={color}
            lineName={lineData.name}
            isStart={isStart}
            isEnd={isEnd}
            onStationClick={onStationClick}
          />
        );
      })}
    </>
  );
}

/**
 * MetroLayer - Main component
 */
export default function MetroLayer({ showAllLines = false, selectedLineCode = null, onStationClick }) {
  const { topology, loading, error, getLine, getLines } = useMetroTopology();
  const { selectedLine } = useAppStore();
  const map = useMap();

  // Determine which metro lines to show
  const linesToRender = useMemo(() => {
    if (!topology) return [];

    if (showAllLines) {
      // Show all metro lines
      return Object.entries(getLines()).map(([code, data]) => ({ code, data }));
    }

    if (selectedLineCode) {
      // Show specific line by code
      const lineData = getLine(selectedLineCode);
      return lineData ? [{ code: selectedLineCode, data: lineData }] : [];
    }

    // Check if selected line from store is a metro line
    if (selectedLine && selectedLine.id) {
      // Metro line codes start with M, F, or T
      const lineCode = selectedLine.id;
      if (typeof lineCode === 'string' && /^[MFT]/.test(lineCode)) {
        const lineData = getLine(lineCode);
        return lineData ? [{ code: lineCode, data: lineData }] : [];
      }
    }

    return [];
  }, [topology, showAllLines, selectedLineCode, selectedLine, getLine, getLines]);

  // Auto-fit map bounds when metro line is shown
  useEffect(() => {
    if (linesToRender.length === 1 && map) {
      const lineData = linesToRender[0].data;
      const coordinates = lineData.stations.map(s => [s.coordinates.lat, s.coordinates.lng]);
      
      if (coordinates.length > 0) {
        try {
          map.fitBounds(coordinates, { padding: [50, 50] });
        } catch (err) {
          console.error('Error fitting bounds:', err);
        }
      }
    }
  }, [linesToRender, map]);

  if (loading) {
    return null;
  }

  if (error) {
    console.error('Metro topology error:', error);
    return null;
  }

  if (linesToRender.length === 0) {
    return null;
  }

  return (
    <>
      {linesToRender.map(({ code, data }) => (
        <MetroLineLayer
          key={code}
          lineCode={code}
          lineData={data}
          onStationClick={onStationClick}
        />
      ))}
    </>
  );
}
