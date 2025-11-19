import MapCaller from '@/components/map/MapCaller';
import SearchBar from '@/components/ui/SearchBar';
import BottomNav from '@/components/ui/BottomNav';
import LineDetailPanel from '@/components/ui/LineDetailPanel';

export default function Home() {
  return (
    <main className="relative flex h-[100dvh] w-screen flex-col overflow-hidden bg-gray-50 font-sans text-gray-900">
      
      {/* Floating Header / Search - Responsive Width */}
      <div className="absolute left-0 right-0 top-0 z-10 p-4 pointer-events-none flex justify-center">
        <div className="w-full max-w-md pointer-events-auto">
           <SearchBar />
        </div>
      </div>

      {/* Full Screen Map Layer */}
      <div className="flex-1 z-0 relative">
        <MapCaller />
      </div>

      {/* Bottom Navigation */}
      <BottomNav />

      {/* Line Detail Panel (conditionally rendered via Zustand) */}
      <LineDetailPanel />
    </main>
  );
}
