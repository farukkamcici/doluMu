import BottomNav from '@/components/ui/BottomNav';
import { Info, Moon, Shield } from 'lucide-react';

function SettingItem({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 p-4 last:border-0">
      <div className="flex items-center gap-3">
        <Icon size={20} className="text-secondary" />
        <span>{label}</span>
      </div>
      {value && <span className="text-sm text-gray-400">{value}</span>}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <main className="relative flex min-h-screen flex-col bg-background pb-20 font-sans text-text">
      <div className="p-6 pt-12">
        <h1 className="text-2xl font-bold text-primary">Settings</h1>
      </div>

      <div className="mx-4 overflow-hidden rounded-2xl bg-surface border border-white/5">
        <SettingItem icon={Moon} label="Theme" value="Dark (Default)" />
        <SettingItem icon={Shield} label="Data Source" value="IBB Open Data" />
        <SettingItem icon={Info} label="Version" value="v1.0.0 (MVP)" />
      </div>

      <div className="mt-8 px-6 text-center">
        <p className="text-xs text-gray-500">
          Istanbul Transport Prediction Platform<br/>
          Designed for smoother commutes.
        </p>
      </div>

      <BottomNav />
    </main>
  );
}
