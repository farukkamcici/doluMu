'use client';
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import useAppStore from '@/store/useAppStore';
import LocateButton from '@/components/ui/LocateButton';
import MetroLayer from '@/components/map/MetroLayer';
import { divIcon } from 'leaflet';
import { renderToStaticMarkup } from 'react-dom/server';
import { useEffect, useMemo, useState } from 'react';
import useRoutePolyline from '@/hooks/useRoutePolyline';
import { getTransportType } from '@/lib/transportTypes';

const CENTER = [41.0082, 28.9784]; // Istanbul coordinates

const userLocationIcon = divIcon({
  html: renderToStaticMarkup(
    <div className="relative flex items-center justify-center">
      <div className="absolute w-5 h-5 bg-blue-500 rounded-full border-2 border-white shadow-md"></div>
      <div className="absolute w-8 h-8 bg-blue-500 rounded-full opacity-25 animate-ping"></div>
    </div>
  ),
  className: 'bg-transparent',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

function MapController({ routeCoordinates }) {
  const map = useMap();

  useEffect(() => {
    if (routeCoordinates && routeCoordinates.length > 0) {
      const bounds = routeCoordinates.map(coord => [coord[0], coord[1]]);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [routeCoordinates, map]);

  return null;
}

export default function MapView() {
  const { userLocation, selectedLine, selectedDirection, showRoute, setSelectedLine, openPanel } = useAppStore();
  const { getPolyline, getRouteStops } = useRoutePolyline();
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  
  // Determine if selected line is metro
  const isMetroLine = useMemo(() => {
    if (!selectedLine?.id) return false;
    const lineCode = typeof selectedLine.id === 'string' ? selectedLine.id : '';
    return /^[MFT]/.test(lineCode);
  }, [selectedLine]);

  useEffect(() => {
    let isActive = true;
    // Only fetch bus route polylines if not metro
    if (showRoute && selectedLine && !isMetroLine) {
      const fetchPolyline = async () => {
        const polyline = await getPolyline(selectedLine.id, selectedDirection);
        if (isActive) {
          setRouteCoordinates(polyline);
        }
      };
      fetchPolyline();
    } else {
      setRouteCoordinates([]);
    }

    return () => {
      isActive = false;
      setRouteCoordinates([]);
    };
  }, [showRoute, selectedLine, selectedDirection, getPolyline, isMetroLine]);

  const routeStops = useMemo(() => {
    // Only show bus route stops if not metro (metro uses MetroLayer)
    return showRoute && selectedLine && !isMetroLine
      ? getRouteStops(selectedLine.id, selectedDirection) 
      : [];
  }, [showRoute, selectedLine, selectedDirection, getRouteStops, isMetroLine]);

  // Handler for metro station clicks
  const handleMetroStationClick = (station, lineName) => {
    console.log('Metro station clicked:', station, lineName);
    // TODO: Show station detail panel or popup
    // Could integrate with existing LineDetailPanel or create new component
  };

  return (
    <MapContainer
      center={CENTER}
      zoom={11}
      style={{ height: "100%", width: "100%" }}
      zoomControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        maxZoom={19}
      />

      <LocateButton />

      {userLocation && (
        <Marker position={userLocation} icon={userLocationIcon}>
        </Marker>
      )}

      {/* Metro layer - shows when metro line is selected */}
      {showRoute && isMetroLine && selectedLine && (
        <MetroLayer
          selectedLineCode={selectedLine.id}
          onStationClick={handleMetroStationClick}
        />
      )}

      {/* Bus route polylines - shows when bus line is selected */}
      {routeCoordinates.length > 0 && !isMetroLine && (
        <>
          <Polyline 
            positions={routeCoordinates} 
            color="#3b82f6"
            weight={4}
            opacity={0.7}
            lineCap="round"
            lineJoin="round"
          />
          
          {routeStops.map((stop, index) => {
            const isFirstStop = index === 0;
            const isLastStop = index === routeStops.length - 1;
            
            if (isFirstStop) {
              return (
                <CircleMarker
                  key={stop.code}
                  center={[stop.lat, stop.lng]}
                  radius={6}
                  pathOptions={{
                    color: '#10b981',
                    fillColor: '#10b981',
                    fillOpacity: 1,
                    weight: 2
                  }}
                >
                  <Tooltip direction="top" offset={[0, -5]} opacity={0.9}>
                    <div className="text-xs font-medium">
                      <div className="font-bold text-green-600">Start</div>
                      <div>{stop.name}</div>
                    </div>
                  </Tooltip>
                </CircleMarker>
              );
            }
            
            if (isLastStop) {
              return (
                <CircleMarker
                  key={stop.code}
                  center={[stop.lat, stop.lng]}
                  radius={6}
                  pathOptions={{
                    color: '#ef4444',
                    fillColor: '#ef4444',
                    fillOpacity: 1,
                    weight: 2
                  }}
                >
                  <Tooltip direction="top" offset={[0, -5]} opacity={0.9}>
                    <div className="text-xs font-medium">
                      <div className="font-bold text-red-600">End</div>
                      <div>{stop.name}</div>
                    </div>
                  </Tooltip>
                </CircleMarker>
              );
            }
            
            return (
              <CircleMarker
                key={stop.code}
                center={[stop.lat, stop.lng]}
                radius={4}
                pathOptions={{
                  color: '#3b82f6',
                  fillColor: '#ffffff',
                  fillOpacity: 1,
                  weight: 2
                }}
              >
                <Tooltip direction="top" offset={[0, -5]} opacity={0.9}>
                  <div className="text-xs font-medium">{stop.name}</div>
                </Tooltip>
              </CircleMarker>
            );
          })}
          
          <MapController routeCoordinates={routeCoordinates} />
        </>
      )}
    </MapContainer>
  );
}
