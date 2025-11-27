'use client';
import { useTranslations } from 'next-intl';
import useAppStore from '@/store/useAppStore';
import { Clock } from 'lucide-react';

export default function TimeSlider() {
  const t = useTranslations('timeSlider');
  const { selectedHour, setSelectedHour } = useAppStore();

  return (
    <div className="w-full py-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-secondary">
          <Clock size={16} />
          <span className="text-sm font-medium">{t('timeTravel')}</span>
        </div>
        <span className="text-xl font-bold text-primary">
          {selectedHour}:00
        </span>
      </div>
      
      <input
        type="range"
        min="0"
        max="23"
        step="1"
        value={selectedHour}
        onChange={(e) => setSelectedHour(parseInt(e.target.value))}
        className="w-full accent-primary"
      />
      
      <div className="mt-1 flex justify-between text-[10px] text-gray-400">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:00</span>
      </div>
    </div>
  );
}
