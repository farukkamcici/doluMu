'use client';
import dynamic from 'next/dynamic';

// Dynamically import MapView with SSR disabled to prevent 'window' errors
const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-gray-100 text-gray-500">
      Loading Map...
    </div>
  )
});

export default function MapCaller() {
  return <MapView />;
}
