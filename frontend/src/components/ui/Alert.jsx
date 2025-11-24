"use client";

import { useEffect } from 'react';
import useAppStore from '@/store/useAppStore';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const Alert = () => {
  const { alertMessage, setAlertMessage } = useAppStore();

  useEffect(() => {
    if (alertMessage) {
      const timer = setTimeout(() => {
        setAlertMessage(null);
      }, 5000); // Auto-dismiss after 5 seconds
      return () => clearTimeout(timer);
    }
  }, [alertMessage, setAlertMessage]);

  if (!alertMessage) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed top-5 left-1/2 -translate-x-1/2 z-[2000] w-11/12 max-w-md p-4 rounded-lg shadow-lg bg-surface border border-primary/50",
        "transition-all duration-300 ease-in-out",
        alertMessage ? "animate-in slide-in-from-top-5" : "animate-out slide-out-to-top-5"
      )}
    >
      <div className="flex items-center">
        <AlertTriangle className="h-6 w-6 text-primary mr-3" />
        <p className="flex-grow text-text text-sm">{alertMessage}</p>
        <button
          onClick={() => setAlertMessage(null)}
          className="ml-4 p-1 rounded-full text-secondary hover:bg-primary/20 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};

export default Alert;
