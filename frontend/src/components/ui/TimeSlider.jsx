'use client';
import { useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import useAppStore from '@/store/useAppStore';

export default function TimeSlider() {
  const t = useTranslations('timeSlider');
  const { selectedHour, setSelectedHour } = useAppStore();

  const lastHapticAtRef = useRef(0);
  const lastHapticValueRef = useRef(selectedHour);

  const triggerSoftHaptic = useCallback((value) => {
    if (typeof window === 'undefined') return;
    if (typeof navigator === 'undefined') return;
    if (typeof navigator.vibrate !== 'function') return;

    const now = new Date().getTime();
    const minIntervalMs = 60;

    if (value === lastHapticValueRef.current) return;
    if (now - lastHapticAtRef.current < minIntervalMs) return;

    lastHapticAtRef.current = now;
    lastHapticValueRef.current = value;
    navigator.vibrate(8);
  }, []);

  return (
    <div className="w-full">
      <div className="relative">
        <input
          type="range"
          min="0"
          max="23"
          step="1"
          value={selectedHour}
          onChange={(e) => {
            const nextHour = parseInt(e.target.value);
            setSelectedHour(nextHour);
            triggerSoftHaptic(nextHour);
          }}
          className="w-full h-2 rounded-full appearance-none cursor-pointer slider-thumb"
          style={{
            background: `linear-gradient(to right, rgb(59 130 246) 0%, rgb(59 130 246) ${(selectedHour / 23) * 100}%, rgba(51, 65, 85, 0.5) ${(selectedHour / 23) * 100}%, rgba(51, 65, 85, 0.5) 100%)`
          }}
        />
      </div>
      
      <div className="mt-2 flex justify-between text-[10px] text-gray-500">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:00</span>
      </div>

      <style jsx>{`
        .slider-thumb::-webkit-slider-thumb {
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: rgb(59 130 246);
          cursor: pointer;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2), 0 2px 4px rgba(0, 0, 0, 0.3);
          transition: all 0.15s ease;
        }

        .slider-thumb::-webkit-slider-thumb:hover {
          box-shadow: 0 0 0 5px rgba(59, 130, 246, 0.3), 0 4px 8px rgba(0, 0, 0, 0.4);
          transform: scale(1.1);
        }

        .slider-thumb::-webkit-slider-thumb:active {
          box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.4), 0 2px 4px rgba(0, 0, 0, 0.3);
          transform: scale(1.15);
        }

        .slider-thumb::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: rgb(59 130 246);
          border: none;
          cursor: pointer;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2), 0 2px 4px rgba(0, 0, 0, 0.3);
          transition: all 0.15s ease;
        }

        .slider-thumb::-moz-range-thumb:hover {
          box-shadow: 0 0 0 5px rgba(59, 130, 246, 0.3), 0 4px 8px rgba(0, 0, 0, 0.4);
          transform: scale(1.1);
        }

        .slider-thumb::-moz-range-thumb:active {
          box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.4), 0 2px 4px rgba(0, 0, 0, 0.3);
          transform: scale(1.15);
        }
      `}</style>
    </div>
  );
}
