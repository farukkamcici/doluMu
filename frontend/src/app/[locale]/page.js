import MapCaller from '@/components/map/MapCaller';
import BottomNav from '@/components/ui/BottomNav';
import LineDetailPanel from '@/components/ui/LineDetailPanel';
import MapTopBar from '@/components/ui/MapTopBar';

export default function Home() {
  return (
    <main className="relative flex h-[100dvh] w-screen flex-col overflow-hidden bg-background font-sans text-text">
      
      {/* Floating Header / Search & Weather - Unified Row */}
      <MapTopBar />

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
