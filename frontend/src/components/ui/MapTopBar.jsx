'use client';

import { LayoutGroup, motion } from 'framer-motion';

import SearchBar from '@/components/ui/SearchBar';
import TemperatureBadge from '@/components/ui/Nowcast';
import TrafficBadge from '@/components/ui/TrafficBadge';

export default function MapTopBar() {
  const spring = { type: 'spring', stiffness: 500, damping: 30 };

  return (
    <div className="fixed left-0 right-0 top-0 z-[1001] px-4 pt-6 sm:px-5 sm:pt-8 pointer-events-none">
      <LayoutGroup>
        <motion.div
          layout="position"
          transition={spring}
          className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:gap-4 pointer-events-auto"
        >
          <motion.div
            layout="position"
            transition={spring}
            className="w-full"
          >
            <SearchBar />
          </motion.div>

          <div className="flex w-full justify-end gap-3">
            <motion.div layout="position" transition={spring}>
              <TrafficBadge />
            </motion.div>
            <TemperatureBadge />
          </div>
        </motion.div>
      </LayoutGroup>
    </div>
  );
}
