import { useTranslations } from 'next-intl';
import BottomNav from '@/components/ui/BottomNav';
import { TRANSPORT_LINES } from '@/lib/dummyData';
import { TrendingUp, ArrowRight } from 'lucide-react';

export default function ForecastPage() {
  const t = useTranslations('forecast');
  
  const sortedLines = [...TRANSPORT_LINES].sort((a, b) => 
    a.current_level === 'High' ? -1 : 1
  );

  return (
    <main className="relative flex min-h-screen flex-col bg-background pb-20 font-sans text-text">
      <div className="p-6 pt-12">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      <div className="flex-1 px-4 space-y-4 overflow-y-auto">
         {sortedLines.length === 0 && <p className="text-center text-gray-400">{t('noData')}</p>}
         
         {sortedLines.map((line) => (
           <div key={line.id} className="flex items-center justify-between rounded-xl bg-surface p-4 border border-white/5">
             <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg font-bold ${line.current_level === 'High' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                  {line.id}
                </div>
                <div>
                  <h3 className="font-semibold">{line.name}</h3>
                  <span className="text-xs text-gray-400">Suggestion: {line.suggestion}</span>
                </div>
             </div>
             <div className="flex items-center gap-2">
                {line.current_level === 'High' && <TrendingUp size={16} className="text-red-400" />}
                <ArrowRight size={16} className="text-gray-500" />
             </div>
           </div>
         ))}
      </div>

      <BottomNav />
    </main>
  );
}
