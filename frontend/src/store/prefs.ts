'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const MAX_RECENTS = 6;

interface PrefsState {
  favorites: string[];
  recents: string[];
  toggleFavorite: (code: string) => void;
  clearFavorites: () => void;
  pushRecent: (code: string) => void;
  clearRecents: () => void;
}

// Storage key and `favorites` shape are kept from v1 so existing users keep their favourites.
export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      favorites: [],
      recents: [],
      toggleFavorite: (code) =>
        set((s) => ({
          favorites: s.favorites.includes(code)
            ? s.favorites.filter((c) => c !== code)
            : [...s.favorites, code],
        })),
      clearFavorites: () => set({ favorites: [] }),
      pushRecent: (code) =>
        set((s) => ({ recents: [code, ...s.recents.filter((c) => c !== code)].slice(0, MAX_RECENTS) })),
      clearRecents: () => set({ recents: [] }),
    }),
    {
      name: 'ibb-transport-storage',
      // `window.` so the server render (no window) skips storage instead of touching Node globals.
      storage: createJSONStorage(() => window.localStorage),
      partialize: (s) => ({ favorites: s.favorites, recents: s.recents }),
    },
  ),
);
