'use client';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import useAppStore from '@/store/useAppStore';
import LocateButton from '@/components/ui/LocateButton';
import { divIcon } from 'leaflet';
import { renderToStaticMarkup } from 'react-dom/server';

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


export default function MapView() {
  const { userLocation } = useAppStore();

  return (
    <MapContainer
      center={CENTER}
      zoom={11}
      style={{ height: "100%", width: "100%" }}
      zoomControl={false} // Hide default buttons for mobile look
    >
      {/* OpenStreetMap Tiles (Light Theme) */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap contributors'
      />

      <LocateButton />

      {userLocation && (
        <Marker position={userLocation} icon={userLocationIcon}>
        </Marker>
      )}
    </MapContainer>
  );
}
