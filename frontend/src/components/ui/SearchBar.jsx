'use client';
import { Search } from 'lucide-react';
import useAppStore from '@/store/useAppStore';
import { TRANSPORT_LINES } from '@/lib/dummyData';
import { useState } from 'react';

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const { setSelectedLine } = useAppStore();

  const handleSearch = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (val.length > 1) {
      const filtered = TRANSPORT_LINES.filter(l => 
        l.id.toLowerCase().includes(val.toLowerCase()) || 
        l.name.toLowerCase().includes(val.toLowerCase())
      );
      setResults(filtered);
    } else {
      setResults([]);
    }
  };

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-surface/90 p-3 shadow-lg backdrop-blur-md">
         <Search className="ml-1 h-5 w-5 text-secondary" />
         <input 
           type="text" 
           value={query}
           onChange={handleSearch}
           placeholder="Search line (e.g., 500T)" 
           className="flex-1 bg-transparent text-sm text-text outline-none placeholder:text-gray-500" 
         />
      </div>
      
      {/* Dropdown Results */}
      {results.length > 0 && (
        <div className="absolute top-full mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-surface shadow-xl">
          {results.map(line => (
            <button 
              key={line.id}
              onClick={() => {
                setSelectedLine(line);
                setResults([]);
                setQuery('');
              }}
              className="flex w-full items-center justify-between border-b border-white/5 p-4 text-left text-text hover:bg-white/5 last:border-0"
            >
              <span className="font-bold text-primary">{line.id}</span>
              <span className="text-sm opacity-80 truncate ml-2">{line.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
