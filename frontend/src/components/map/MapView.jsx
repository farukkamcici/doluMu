'use client';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import useAppStore from '@/store/useAppStore';
import LocateButton from '@/components/ui/LocateButton';
import { divIcon } from 'leaflet';
import { renderToStaticMarkup } from 'react-dom/server';
import { useEffect } from 'react';
import useRoutePolyline from '@/hooks/useRoutePolyline';

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
  const { userLocation, selectedLine, selectedDirection, showRoute } = useAppStore();
  const { getPolyline } = useRoutePolyline();

  const routeCoordinates = showRoute && selectedLine 
    ? getPolyline(selectedLine.id, selectedDirection) 
    : [];

  return (
    <MapContainer
      center={CENTER}
      zoom={11}
      style={{ height: "100%", width: "100%" }}
      zoomControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap contributors'
      />

      <LocateButton />

      {userLocation && (
        <Marker position={userLocation} icon={userLocationIcon}>
        </Marker>
      )}

      {routeCoordinates.length > 0 && (
        <>
          <Polyline 
            positions={routeCoordinates} 
            color="#3b82f6"
            weight={4}
            opacity={0.7}
          />
          <MapController routeCoordinates={routeCoordinates} />
        </>
      )}
    </MapContainer>
  );
}
