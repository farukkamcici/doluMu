'use client';
import useAppStore from '@/store/useAppStore';
import { X, TrendingUp } from 'lucide-react';
import CrowdChart from './CrowdChart';
import TimeSlider from './TimeSlider';
import { cn } from '@/lib/utils';

export default function LineDetailPanel() {
  const { selectedLine, isPanelOpen, closePanel, selectedHour } = useAppStore();

  if (!isPanelOpen || !selectedLine) return null;

  // Find forecast for selected hour (Dummy logic)
  // In real app, use selectedLine.forecast.find(...)
  const currentForecast = selectedLine.forecast.find(f => f.hour === `${String(selectedHour).padStart(2, '0')}:00`) || { score: 0 };
  
  // Dynamic Status Logic
  const isBusy = currentForecast.score > 70;
  const statusColor = isBusy ? 'text-red-400' : 'text-emerald-400';
  const statusText = isBusy ? 'High Density' : 'Comfortable';

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[2000] flex flex-col rounded-t-3xl bg-surface p-6 shadow-2xl transition-transform duration-300 ease-out">
      
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-primary px-2 py-1 text-xs font-bold text-white">
              {selectedLine.id}
            </span>
            <h2 className="text-xl font-bold text-text">{selectedLine.name}</h2>
          </div>
          <p className="mt-1 text-sm text-secondary opacity-80">
            Direction: Kadıköy
          </p>
        </div>
        <button onClick={closePanel} className="rounded-full bg-background p-2 text-gray-400 hover:bg-white/10">
          <X size={20} />
        </button>
      </div>

      {/* Dynamic Status Card */}
      <div className="mb-6 rounded-2xl bg-background p-4 border border-white/5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">Estimated Crowd at {selectedHour}:00</p>
            <h3 className={cn("text-2xl font-bold", statusColor)}>
              {statusText} (%{currentForecast.score})
            </h3>
          </div>
          <div className={cn("rounded-full p-3 bg-white/5", statusColor)}>
            <TrendingUp size={24} />
          </div>
        </div>
      </div>

      {/* Slider Component */}
      <TimeSlider />

      {/* Chart */}
      <div className="mt-4 h-48 w-full">
        <p className="mb-2 text-xs font-medium text-gray-400">24-Hour Forecast</p>
        <CrowdChart data={selectedLine.forecast} />
      </div>
    </div>
  );
}