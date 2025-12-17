"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import * as Tooltip from "@radix-ui/react-tooltip";

const TrafficBadge = () => {
  const tTraffic = useTranslations("traffic");
  const [trafficData, setTrafficData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const lastFetchRef = useRef(null);

  const fetchTrafficData = useCallback(async () => {
    const now = Date.now();
    if (lastFetchRef.current && now - lastFetchRef.current < 300000) return;

    setLoading(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}/traffic/istanbul`,
        { method: "GET", headers: { "Content-Type": "application/json" } }
      );

      if (!response.ok) throw new Error("TRAFFIC_FETCH_FAILED");
      const data = await response.json();

      if (data && data.percent !== null && data.percent !== undefined) {
        setTrafficData(data);
        lastFetchRef.current = now;
      }
    } catch (err) {
      console.error("Traffic fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrafficData();
    const interval = setInterval(fetchTrafficData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchTrafficData]);

  const percent = trafficData?.percent;

  return (
    <Tooltip.Provider delayDuration={0}>
      {/* IMPORTANT: tooltip sadece bizim state ile açılacak */}
      <Tooltip.Root
        open={open}
        onOpenChange={(next) => {
          // hover/focus ile "açılmasına" izin verme; sadece kapanmayı kabul et
          if (!next) setOpen(false);
        }}
      >
        <Tooltip.Trigger asChild>
          {/* button kullan: erişilebilir + mobile click daha stabil */}
          <button
            type="button"
            className="relative shrink-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#1a2332] shadow-[0_6px_20px_rgba(0,0,0,0.4),0_2px_8px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl transition-all duration-200 hover:shadow-[0_8px_24px_rgba(0,0,0,0.5),0_4px_12px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.08)]"
            onPointerDown={(e) => {
              // WeatherBadge click'i vs parent handler'lar buraya taşmasın
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
          >
            <div className="flex h-11 items-center gap-2 px-4">
              <Image
                src="/icons/traffic-light-solid.svg"
                alt=""
                aria-hidden="true"
                width={16}
                height={16}
                unoptimized
                className="h-4 w-4 shrink-0 invert opacity-90"
              />
              <div className="flex items-center px-1">
                <div className="text-base font-bold leading-tight text-text">
                  {loading || percent == null ? "--" : `%${percent}`}
                </div>
              </div>
            </div>
          </button>
        </Tooltip.Trigger>

        <Tooltip.Portal>
          <Tooltip.Content
            className="z-[1300] max-w-[280px] rounded-xl border border-white/10 bg-[#1a2332] px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-xl"
            side="bottom"
            align="center"
            sideOffset={10}
            collisionPadding={12}
            onPointerDownOutside={() => setOpen(false)}
          >
            <div className="space-y-2">
              <div className="text-sm font-semibold text-text">
                {tTraffic("title")}
              </div>
              <div className="text-xs leading-relaxed text-secondary/80">
                {tTraffic("description")}
              </div>
              <div className="pt-1 text-[10px] text-secondary/50">
                {tTraffic("source")}
              </div>
            </div>
            <Tooltip.Arrow className="fill-[#1a2332]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
};

export default TrafficBadge;
