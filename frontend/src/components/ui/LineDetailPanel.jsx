'use client';
import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence, useAnimation, useDragControls } from 'framer-motion';
import useAppStore from '@/store/useAppStore';
import useRoutePolyline from '@/hooks/useRoutePolyline';
import useMediaQuery from '@/hooks/useMediaQuery';
import { 
  X, 
  Loader, 
  ServerCrash, 
  Users, 
  Info, 
  MapPin, 
  Route, 
  Star,
  ChevronDown,
  ChevronUp,
  ArrowLeftRight,
  Minimize2,
  RotateCcw
} from 'lucide-react';
import TimeSlider from './TimeSlider';
import CrowdChart from './CrowdChart';
import ScheduleWidget from '../line-detail/ScheduleWidget';
import ScheduleModal from '../line-detail/ScheduleModal';
import { cn } from '@/lib/utils';
import { getForecast } from '@/lib/api';
import { getTransportType } from '@/lib/transportTypes';
import { useGetTransportLabel } from '@/hooks/useGetTransportLabel';

const crowdLevelConfig = {
  "Low": { color: "text-emerald-400", progressColor: "bg-emerald-500", badge: "bg-emerald-500/20 border-emerald-500/30" },
  "Medium": { color: "text-yellow-400", progressColor: "bg-yellow-500", badge: "bg-yellow-500/20 border-yellow-500/30" },
  "High": { color: "text-orange-400", progressColor: "bg-orange-500", badge: "bg-orange-500/20 border-orange-500/30" },
  "Very High": { color: "text-red-400", progressColor: "bg-red-500", badge: "bg-red-500/20 border-red-500/30" },
  "Unknown": { color: "text-gray-400", progressColor: "bg-gray-500", badge: "bg-gray-500/20 border-gray-500/30" },
};

export default function LineDetailPanel() {
  const t = useTranslations('lineDetail');
  const getTransportLabel = useGetTransportLabel();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const controls = useAnimation();
  const dragControls = useDragControls();
  const constraintsRef = useRef(null);
  
  const { 
    selectedLine, 
    isPanelOpen, 
    closePanel, 
    selectedHour, 
    toggleFavorite, 
    isFavorite,
    selectedDirection,
    setSelectedDirection,
    showRoute,
    setShowRoute
  } = useAppStore();
  
  const { getAvailableDirections, getPolyline, getDirectionInfo, getRouteStops } = useRoutePolyline();
  const [forecastData, setForecastData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isChartExpanded, setIsChartExpanded] = useState(false);
  const [hasRouteData, setHasRouteData] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [showCapacityTooltip, setShowCapacityTooltip] = useState(false);
  const [panelSize, setPanelSize] = useState({ width: 384, height: 600 });
  const resizeRef = useRef(null);
  const panelRef = useRef(null);
  const initialPositionSet = useRef(false);
  const INITIAL_PANEL_SIZE = { width: 384, height: 600 };
  const INITIAL_PANEL_POSITION = { top: '5rem', left: '1rem' };

  useEffect(() => {
    if (isPanelOpen && selectedLine) {
      setLoading(true);
      setError(null);
      setForecastData([]);
      
      const targetDate = new Date();
      
      getForecast(selectedLine.id, targetDate)
        .then(data => {
          setForecastData(data);
          setError(null);
        })
        .catch(err => {
          const errorMessage = err.message || "Could not fetch forecast. Please try again later.";
          setError(errorMessage);
          setForecastData([]);
          console.error('Forecast fetch error:', err);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setForecastData([]);
      setError(null);
    }
  }, [isPanelOpen, selectedLine]);

  useEffect(() => {
    if (!isDesktop && showCapacityTooltip) {
      const handleClickOutside = () => setShowCapacityTooltip(false);
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showCapacityTooltip, isDesktop]);

  useEffect(() => {
    if (showRoute) {
      setIsMinimized(true);
    }
  }, [showRoute]);

  useEffect(() => {
    let isMounted = true;
    
    if (selectedLine && isPanelOpen) {
      const checkRouteData = async () => {
        const availableDirs = getAvailableDirections(selectedLine.id);
        if (availableDirs.length > 0) {
          const polyline = await getPolyline(selectedLine.id, selectedDirection);
          if (isMounted) {
            setHasRouteData(polyline && polyline.length > 0);
          }
        } else {
          if (isMounted) {
            setHasRouteData(false);
          }
        }
      };
      
      checkRouteData();
    } else {
      setHasRouteData(false);
    }

    return () => {
      isMounted = false;
    };
  }, [selectedLine, selectedDirection, isPanelOpen, getAvailableDirections, getPolyline]);

  useEffect(() => {
    if (!isDesktop && isMinimized) {
      controls.start({ y: 0 });
    }
  }, [isMinimized, isDesktop, controls]);

  useEffect(() => {
    if (isDesktop && isPanelOpen && !initialPositionSet.current && panelRef.current) {
      const viewportHeight = window.innerHeight;
      const panelHeight = panelSize.height;
      
      if (panelHeight > viewportHeight - 160) {
        setPanelSize(prev => ({
          width: prev.width,
          height: viewportHeight - 160
        }));
      }
      
      initialPositionSet.current = true;
    }
    
    if (!isPanelOpen) {
      initialPositionSet.current = false;
    }
  }, [isPanelOpen, isDesktop, panelSize.height]);

  if (!isPanelOpen || !selectedLine) return null;

  const currentHourData = forecastData.find(f => f.hour === selectedHour);
  const crowdLevel = currentHourData?.crowd_level;
  const status = currentHourData ? crowdLevelConfig[crowdLevel] : null;
  const metadata = selectedLine.metadata;
  const transportType = metadata ? getTransportType(metadata.transport_type_id) : null;
  const isFav = isFavorite(selectedLine.id);
  const availableDirections = getAvailableDirections(selectedLine.id);
  const directionInfo = getDirectionInfo(selectedLine.id);

  const vibrate = (pattern) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  };

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
    vibrate(10);
  };

  const handleDragEnd = (event, info) => {
    const threshold = 100;
    const velocity = info.velocity.y;
    
    if (velocity > 500 || info.offset.y > threshold) {
      setIsMinimized(true);
      controls.start({ y: 0 });
      vibrate(10);
    } else if (velocity < -500 || info.offset.y < -threshold) {
      setIsMinimized(false);
      controls.start({ y: 0 });
      vibrate(10);
    } else {
      controls.start({ y: 0 });
    }
  };

  const handleDirectionChange = (dir) => {
    setSelectedDirection(dir);
    vibrate(5);
  };

  const handleShowRouteToggle = () => {
    if (hasRouteData) {
      setShowRoute(!showRoute);
      vibrate(10);
    }
  };

  const handleResize = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = panelSize.width;
    const startHeight = panelSize.height;
    const aspectRatio = startWidth / startHeight;

    const onMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      
      const newWidth = Math.max(320, Math.min(900, startWidth + deltaX));
      const newHeight = newWidth / aspectRatio;
      
      setPanelSize({ width: newWidth, height: newHeight });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'nwse-resize';
  };

  return (
    <>
      <AnimatePresence>
        {!isDesktop && !isMinimized && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[898] bg-black/60 backdrop-blur-sm"
            onClick={closePanel}
          />
        )}
      </AnimatePresence>
      
      <motion.div
        ref={constraintsRef}
        className="fixed inset-0 z-[899] pointer-events-none"
      >
        <motion.div
          ref={panelRef}
          drag={isDesktop ? true : "y"}
          dragListener={isDesktop ? false : true}
          dragControls={isDesktop ? dragControls : undefined}
          dragConstraints={isDesktop ? false : { top: 0, bottom: 0 }}
          dragElastic={isDesktop ? 0 : 0.2}
          dragMomentum={false}
          dragTransition={{ bounceStiffness: 600, bounceDamping: 20 }}
          onDragEnd={!isDesktop ? handleDragEnd : undefined}
          animate={controls}
          className={cn(
            "bg-slate-900/95 backdrop-blur-md shadow-2xl overflow-hidden pointer-events-auto",
            isDesktop 
              ? "absolute rounded-xl" 
              : "fixed bottom-16 left-0 right-0 rounded-t-3xl"
          )}
          style={!isDesktop ? {
            height: isMinimized ? 'auto' : (isChartExpanded ? 'min(75vh, calc(100vh - 5rem))' : 'min(55vh, calc(100vh - 6rem))'),
            maxHeight: 'calc(100vh - 5rem)',
            transition: 'height 0.3s ease-out'
          } : {
            top: INITIAL_PANEL_POSITION.top,
            left: INITIAL_PANEL_POSITION.left,
            width: `${panelSize.width}px`,
            height: isMinimized ? 'auto' : 'fit-content',
            minHeight: isMinimized ? 'auto' : `${panelSize.height}px`,
            maxHeight: 'calc(100vh - 8rem)'
          }}
        >
        <div className={cn(
          "flex flex-col",
          isMinimized ? "" : isDesktop ? "min-h-full" : "h-full"
        )}>
          
          <div 
            onPointerDown={(e) => {
              if (isDesktop && !e.target.closest('button')) {
                dragControls.start(e);
              }
            }}
            className={cn(
              "flex items-center justify-between py-2 px-3 border-b border-white/5 touch-none",
              isDesktop ? "cursor-move select-none" : "cursor-pointer justify-center"
            )}
            onClick={!isDesktop ? toggleMinimize : undefined}
          >
            <div className="w-12 h-1 bg-gray-600 rounded-full md:hidden mx-auto" />
            
            {isDesktop && (
              <div className="flex items-center gap-2">
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMinimized(!isMinimized);
                    vibrate(5);
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-white/10 transition-colors text-gray-400 hover:text-gray-200 cursor-pointer"
                  title={isMinimized ? t('expand') : t('minimize')}
                >
                  <Minimize2 size={12} />
                  <span className="text-[10px] font-medium">{isMinimized ? t('expand') : t('minimize')}</span>
                </button>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPanelSize(INITIAL_PANEL_SIZE);
                    if (panelRef.current) {
                      const style = panelRef.current.style;
                      style.transform = 'translate(0px, 0px)';
                      style.top = INITIAL_PANEL_POSITION.top;
                      style.left = INITIAL_PANEL_POSITION.left;
                    }
                    vibrate(5);
                  }}
                  className="p-1.5 rounded-md hover:bg-white/10 transition-colors text-gray-400 hover:text-gray-200 cursor-pointer"
                  title="Reset Position"
                >
                  <RotateCcw size={12} />
                </button>
              </div>
            )}
            
            {isDesktop && <div className="flex-1 min-w-0" />}
            
            {isDesktop && (
              <button 
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  closePanel();
                }}
                className="rounded-full bg-background p-1.5 text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {isMinimized ? (
            <div className="px-4 py-2.5 pb-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="rounded-lg bg-primary px-2.5 py-1 text-sm font-bold text-white shrink-0">
                    {selectedLine.id}
                  </span>
                  {metadata?.line && (
                    <span className="text-xs text-gray-300 truncate">
                      {metadata.line}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {currentHourData && status && (
                    <div className={cn(
                      "rounded-lg px-2 py-1 border text-xs font-bold",
                      status.badge,
                      status.color
                    )}>
                      {currentHourData.occupancy_pct}%
                    </div>
                  )}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(selectedLine.id);
                      vibrate(5);
                    }}
                    className={cn(
                      "rounded-full bg-background p-1.5 hover:bg-white/10 transition-colors",
                      isFav ? "text-yellow-400" : "text-gray-400"
                    )}
                    aria-label={isFav ? t('removeFromFavorites') : t('addToFavorites')}
                  >
                    <Star size={16} fill={isFav ? "currentColor" : "none"} />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      closePanel();
                    }}
                    className="rounded-full bg-background p-1.5 text-gray-400 hover:bg-white/10"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {showRoute && availableDirections.length > 1 && (
                <div className="flex items-center gap-2">
                  <MapPin size={12} className="text-primary shrink-0 animate-pulse" />
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="text-xs text-gray-300 truncate flex-1">
                      {directionInfo[selectedDirection]?.label || (selectedDirection === 'G' ? 'Gidiş' : selectedDirection === 'D' ? 'Dönüş' : selectedDirection)}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const currentIndex = availableDirections.indexOf(selectedDirection);
                        const nextIndex = (currentIndex + 1) % availableDirections.length;
                        handleDirectionChange(availableDirections[nextIndex]);
                      }}
                      className="shrink-0 p-1 rounded-md bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
                      title={t('changeDirection')}
                    >
                      <ArrowLeftRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800/30 hover:scrollbar-thumb-gray-500">
              <div className="px-4 pt-3 pb-2 flex-shrink-0">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-primary px-2.5 py-1 text-sm font-bold text-white shrink-0">
                        {selectedLine.id}
                      </span>
                      {metadata?.line && (
                        <span className="text-xs text-gray-300 truncate">
                          {metadata.line}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 ml-2">
                    <button 
                      onClick={() => {
                        toggleFavorite(selectedLine.id);
                        vibrate(5);
                      }} 
                      className={cn(
                        "rounded-full bg-background p-1.5 hover:bg-white/10 transition-colors",
                        isFav ? "text-yellow-400" : "text-gray-400"
                      )}
                      aria-label={isFav ? t('removeFromFavorites') : t('addToFavorites')}
                    >
                      <Star size={16} fill={isFav ? "currentColor" : "none"} />
                    </button>
                    {!isDesktop && (
                      <button 
                        onClick={closePanel} 
                        className="rounded-full bg-background p-1.5 text-gray-400 hover:bg-white/10"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>

                <div className={cn(
                  "grid gap-2",
                  isDesktop ? "md:grid-cols-12 md:items-stretch" : "grid-cols-1"
                )}>
                  <div className={cn(
                    "rounded-xl bg-background p-2.5 border border-white/5 flex flex-col",
                    isDesktop ? "md:col-span-8" : ""
                  )}>
                    {loading && (
                      <div className="flex items-center justify-center py-3 flex-1">
                        <Loader className="animate-spin text-primary" size={18} />
                      </div>
                    )}
                    
                    {error && !loading && (
                      <div className="flex items-center justify-center gap-2 text-red-400 py-3 flex-1">
                        <ServerCrash size={14} />
                        <span className="text-[11px]">{error}</span>
                      </div>
                    )}
                    
                    {currentHourData && status && !loading && !error && (
                      <div className="space-y-1.5 flex-1 flex flex-col justify-center">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[10px] text-gray-400 mb-0.5">
                              {t('estimatedCrowd', { hour: selectedHour })}
                            </p>
                            <h3 className={cn("text-base font-bold", status.color)}>
                              {t(`crowdLevels.${crowdLevel}`)}
                            </h3>
                          </div>
                          <div className={cn(
                            "rounded-md px-2.5 py-1.5 border text-xs font-semibold",
                            status.badge,
                            status.color
                          )}>
                            {currentHourData.occupancy_pct}%
                          </div>
                        </div>
                        
                        <div className="w-full bg-background rounded-full h-1">
                          <div 
                            className={cn("h-1 rounded-full", status.progressColor)} 
                            style={{ width: `${currentHourData.occupancy_pct}%` }}
                          />
                        </div>
                        
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-gray-400">
                            {t('predicted')}: <span className="font-semibold text-gray-300">
                              {Math.round(currentHourData.predicted_value).toLocaleString()}
                            </span> <span className="text-gray-500">{t('passengers')}</span>
                          </span>
                          <div className="relative">
                            <span 
                              className="flex items-center gap-1 text-gray-400 cursor-help"
                              onMouseEnter={() => isDesktop && setShowCapacityTooltip(true)}
                              onMouseLeave={() => isDesktop && setShowCapacityTooltip(false)}
                              onClick={(e) => {
                                if (!isDesktop) {
                                  e.stopPropagation();
                                  setShowCapacityTooltip(!showCapacityTooltip);
                                  vibrate(5);
                                }
                              }}
                            >
                              <span className="text-[9px] text-gray-500">{t('maxCapacity')}</span>
                              <Users size={10} className="text-gray-500" /> 
                              <span className="font-semibold text-gray-300">{currentHourData.max_capacity.toLocaleString()}</span>
                            </span>
                            {showCapacityTooltip && (
                              <div className="absolute right-0 bottom-full mb-2 px-2 py-1.5 bg-slate-800 border border-white/10 rounded-lg shadow-xl z-50 whitespace-nowrap">
                                <p className="text-[10px] text-gray-300">{t('maxCapacityTooltip')}</p>
                                <div className="absolute right-3 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-800"></div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className={cn(isDesktop ? "md:col-span-4" : "")}>
                    <ScheduleWidget 
                      lineCode={selectedLine.id} 
                      direction={selectedDirection}
                      onShowFullSchedule={() => setIsScheduleModalOpen(true)}
                      compact={true}
                    />
                  </div>
                </div>
              </div>

              <div className="px-4 pb-2 flex-shrink-0">
                <div className="rounded-xl bg-background p-3 border border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <MapPin size={14} className="text-secondary" />
                      <p className="text-xs font-medium text-gray-300">{t('routeView')}</p>
                    </div>
                    <button
                      onClick={() => {
                        if (hasRouteData) {
                          setShowRoute(!showRoute);
                        }
                      }}
                      disabled={!hasRouteData}
                      className={cn(
                        "px-3 py-1 rounded-lg text-xs font-medium transition-colors",
                        !hasRouteData && "opacity-40 cursor-not-allowed",
                        showRoute && hasRouteData
                          ? "bg-primary text-white" 
                          : "bg-background border border-white/10 text-gray-400 hover:bg-white/5"
                      )}
                      title={!hasRouteData ? t('noRouteData') : ""}
                    >
                      {showRoute ? t('hide') : t('show')}
                    </button>
                  </div>
                  
                  {showRoute && availableDirections.length > 1 && (
                    <div className="flex gap-2 mt-2">
                      {availableDirections.map(dir => {
                        const info = directionInfo[dir];
                        const label = info?.label || (dir === 'G' ? 'Gidiş' : dir === 'D' ? 'Dönüş' : dir);
                        
                        return (
                          <button
                            key={dir}
                            onClick={() => {
                              setSelectedDirection(dir);
                              vibrate(5);
                            }}
                            className={cn(
                              "flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors truncate",
                              selectedDirection === dir
                                ? "bg-primary/20 text-primary border border-primary/30"
                                : "bg-background border border-white/10 text-gray-400 hover:bg-white/5"
                            )}
                            title={label}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="px-4 space-y-3 pb-6 flex-shrink-0">
                <TimeSlider />

                <div className="rounded-xl bg-background border border-white/5 overflow-hidden">
                  {!isDesktop && (
                    <button
                      onClick={() => {
                        setIsChartExpanded(!isChartExpanded);
                        vibrate(5);
                      }}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-colors"
                    >
                      <p className="text-xs font-medium text-gray-400">
                        {t('forecast24h')}
                      </p>
                      {isChartExpanded ? (
                        <ChevronUp size={14} className="text-gray-400" />
                      ) : (
                        <ChevronDown size={14} className="text-gray-400" />
                      )}
                    </button>
                  )}
                  
                  {isDesktop && (
                    <div className="w-full px-3 py-2 flex items-center">
                      <p className="text-xs font-medium text-gray-400">
                        {t('forecast24h')}
                      </p>
                    </div>
                  )}
                  
                  <AnimatePresence>
                    {(isChartExpanded || isDesktop) && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-3 pb-3 h-44">
                          {loading ? (
                            <div className="h-full flex items-center justify-center">
                              <Loader className="animate-spin text-primary" size={20} />
                            </div>
                          ) : (
                            <CrowdChart data={forecastData} />
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {isDesktop && !isMinimized && (
          <div
            ref={resizeRef}
            onMouseDown={handleResize}
            className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize group flex items-end justify-end p-1"
            style={{ touchAction: 'none' }}
          >
            <div className="w-4 h-4 border-r-2 border-b-2 border-gray-500 group-hover:border-primary transition-colors rounded-br" />
          </div>
        )}
        </motion.div>
      </motion.div>

      <ScheduleModal 
        lineCode={selectedLine.id}
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        initialDirection={selectedDirection}
        directionInfo={directionInfo}
      />
    </>
  );
}
