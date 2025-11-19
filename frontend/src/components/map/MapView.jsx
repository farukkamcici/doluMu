'use client';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const CENTER = [41.0082, 28.9784]; // Istanbul coordinates

export default function MapView() {
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
    </MapContainer>
  );
}
