import { create } from 'zustand';

const useAppStore = create((set) => ({
  selectedLine: null,
  isPanelOpen: false,
  selectedHour: new Date().getHours(), // Default to current hour (0-23)
  userLocation: null,
  alertMessage: null,
  
  setSelectedLine: (line) => set({ selectedLine: line, isPanelOpen: true }),
  closePanel: () => set({ isPanelOpen: false, selectedLine: null }),
  setSelectedHour: (hour) => set({ selectedHour: hour }),
  setUserLocation: (location) => set({ userLocation: location }),
  setAlertMessage: (message) => set({ alertMessage: message }),
}));

export default useAppStore;