'use client';

import { LayoutGroup, motion } from 'framer-motion';

import SearchBar from '@/components/ui/SearchBar';
import TemperatureBadge from '@/components/ui/Nowcast';

export default function MapTopBar() {
  const spring = { type: 'spring', stiffness: 500, damping: 30 };

  return (
    <div className="fixed left-0 right-0 top-0 z-[1001] px-3 pt-3 sm:px-4 sm:pt-4">
      <LayoutGroup>
        <motion.div
          layout
          transition={spring}
          className="mx-auto flex min-h-12 w-full max-w-3xl items-start gap-2 sm:gap-3"
        >
          <motion.div
            layout
            transition={spring}
            className="min-w-0 flex-1"
          >
            <SearchBar />
          </motion.div>
          <motion.div
            layout
            transition={spring}
            className="shrink-0"
          >
            <TemperatureBadge />
          </motion.div>
        </motion.div>
      </LayoutGroup>
    </div>
  );
}
