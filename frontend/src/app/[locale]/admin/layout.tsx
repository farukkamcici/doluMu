import type { ReactNode } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';

// The admin panel keeps its own dark styling regardless of the app theme.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dark min-h-screen bg-slate-950 text-white">
      <AuthProvider>{children}</AuthProvider>
    </div>
  );
}
