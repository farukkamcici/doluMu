'use client';
import { useEffect, useRef } from 'react';
import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useLocale } from 'next-intl';
import type { NetworkLine, NetworkStation } from '@/lib/network';
import { SLOW_KMH } from '@/lib/live/client';
import { cn } from '@/lib/utils';

// OpenFreeMap vector basemap (free, no API key). One base style, recoloured from CSS variables
// for both themes, so a theme switch is a repaint rather than a style reload.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const ISTANBUL: [number, number] = [28.98, 41.03];
const DEFAULT_WIDTH = 4;

export interface MapVehicle {
  id: string;
  lat: number;
  lng: number;
  inService?: boolean;
}

export interface TransitMapProps {
  lines: NetworkLine[];
  stations?: NetworkStation[];
  /** Stroke width (px at zoom 12) per line code; used to show passenger flow. */
  widths?: Record<string, number>;
  /** Highlight one line code and fade the rest. */
  focus?: string | null;
  me?: { lat: number; lng: number } | null;
  /** Line codes with a live disruption: drawn with a signal-red dashed overlay. */
  alerts?: string[];
  /** Live vehicles (buses) to plot; `inService: false` draws them muted. */
  vehicles?: MapVehicle[];
  /** City-wide moving buses as [lng, lat, km/h]; slow ones are drawn in signal red. */
  fleet?: [number, number, number][] | null;
  /** Fly to this point (e.g. a station picked from a list). */
  flyTo?: { lat: number; lng: number; zoom?: number } | null;
  onLineClick?: (code: string) => void;
  onStationClick?: (station: NetworkStation) => void;
  /** Inside a scrolling page: require two fingers / ctrl+scroll to move the map. */
  embedded?: boolean;
  className?: string;
}

// Fallbacks keep layer creation valid if theme CSS hasn't loaded yet (repainted once it has).
const FALLBACK: Record<string, string> = { '--map-land': '#efede7', '--fg': '21 21 20', '--signal': '214 40 31' };
const cssVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || FALLBACK[name] || '#888888';
const cssRgb = (name: string) => `rgb(${cssVar(name).split(/\s+/).join(',')})`;

/** Theme CSS can arrive after the map style (e.g. dev CSS chunks); wait for it before painting. */
function paintWhenReady(map: MLMap, lines: () => { lines: NetworkLine[]; widths?: Record<string, number>; alerts: string[] }, tries = 0) {
  if (!getComputedStyle(document.documentElement).getPropertyValue('--map-land').trim()) {
    if (tries < 50) window.setTimeout(() => paintWhenReady(map, lines, tries + 1), 100);
    return;
  }
  if (!map.getLayer('net-line')) return;
  paintAll(map);
  const { lines: l, widths, alerts } = lines();
  (map.getSource('net') as GeoJSONSource | undefined)?.setData(linesGeoJSON(l, widths, cssRgb('--fg'), alerts));
}

/** Bus marker (lucide "bus-front" on a filled disc), rasterised for MapLibre. */
function busIcon(fill: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="${fill}" stroke="#ffffff" stroke-width="3"/><g transform="translate(12 12)" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6 2 7"/><path d="M10 6h4"/><path d="m22 7-2-1"/><rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16"/><path d="M8 15h.01"/><path d="M16 15h.01"/><path d="M6 19v2"/><path d="M18 21v-2"/></g></svg>`;
  const img = new Image(48, 48);
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return img.decode().then(() => img);
}

async function installBusIcons(map: MLMap) {
  const [live, idle] = await Promise.all([busIcon(cssRgb('--signal')), busIcon('#8a857c')]);
  for (const [name, img] of [['bus-live', live], ['bus-idle', idle]] as const) {
    if (map.hasImage(name)) map.removeImage(name);
    map.addImage(name, img, { pixelRatio: 2 });
  }
}

const HIDDEN = /^(building|aeroway|railway|highway-shield|road_shield|airport|highway-name-(path|minor))/;

/** Recolour the basemap and our own layers from the current theme's CSS variables. */
function paintAll(map: MLMap) {
  const c = {
    land: cssVar('--map-land'),
    water: cssVar('--map-water'),
    park: cssVar('--map-park'),
    road: cssVar('--map-road'),
    casing: cssVar('--map-road-casing'),
    label: cssVar('--map-label'),
    boundary: cssVar('--map-boundary'),
    ink: cssRgb('--fg'),
  };
  for (const { id, type } of map.getStyle().layers ?? []) {
    if (id.startsWith('net-') || id.startsWith('station') || id.startsWith('me') || id === 'vehicles' || id === 'fleet') continue;
    if (HIDDEN.test(id)) {
      map.setLayoutProperty(id, 'visibility', 'none');
    } else if (type === 'background') {
      map.setPaintProperty(id, 'background-color', c.land);
    } else if (type === 'fill') {
      const color = id === 'water' ? c.water : id === 'road_area_pier' ? c.road : /park|landcover/.test(id) ? c.park : c.land;
      map.setPaintProperty(id, 'fill-color', color);
    } else if (type === 'line') {
      const color = id === 'waterway' ? c.water : id.startsWith('boundary') ? c.boundary : /casing|tunnel/.test(id) ? c.casing : c.road;
      map.setPaintProperty(id, 'line-color', color);
    } else if (type === 'symbol') {
      map.setPaintProperty(id, 'text-color', c.label);
      map.setPaintProperty(id, 'text-halo-color', c.land);
    }
  }
  if (map.getLayer('net-casing')) {
    map.setPaintProperty('net-casing', 'line-color', c.land);
    map.setPaintProperty('net-railway-dash', 'line-color', c.land);
    map.setPaintProperty('stations', 'circle-color', c.land);
    map.setPaintProperty('stations', 'circle-stroke-color', c.ink);
    map.setPaintProperty('station-labels', 'text-color', c.ink);
    map.setPaintProperty('station-labels', 'text-halo-color', c.land);
    map.setPaintProperty('fleet', 'circle-color', fleetColor());
  }
}

const fleetColor = (): maplibregl.ExpressionSpecification => ['case', ['<', ['get', 's'], SLOW_KMH], cssRgb('--signal'), cssRgb('--fg')];

function fleetGeoJSON(fleet: [number, number, number][] | null | undefined) {
  return {
    type: 'FeatureCollection' as const,
    features: (fleet ?? []).map(([lng, lat, s]) => ({
      type: 'Feature' as const,
      properties: { s },
      geometry: { type: 'Point' as const, coordinates: [lng, lat] },
    })),
  };
}

function linesGeoJSON(lines: NetworkLine[], widths: Record<string, number> | undefined, ink: string, alerts: string[] = []) {
  return {
    type: 'FeatureCollection' as const,
    features: lines.map((l) => ({
      type: 'Feature' as const,
      properties: {
        code: l.code,
        style: l.style,
        c: l.color ?? ink,
        w: widths?.[l.code] ?? DEFAULT_WIDTH,
        alert: alerts.includes(l.code),
      },
      geometry: { type: 'MultiLineString' as const, coordinates: l.segments },
    })),
  };
}

function vehiclesGeoJSON(vehicles: MapVehicle[]) {
  return {
    type: 'FeatureCollection' as const,
    features: vehicles.map((v) => ({
      type: 'Feature' as const,
      properties: { id: v.id, live: v.inService !== false },
      geometry: { type: 'Point' as const, coordinates: [v.lng, v.lat] },
    })),
  };
}

function stationsGeoJSON(stations: NetworkStation[]) {
  return {
    type: 'FeatureCollection' as const,
    features: stations.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng)).map((s) => ({
      type: 'Feature' as const,
      properties: { id: s.id, name: s.name, transfer: s.lines.length > 1 },
      geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
    })),
  };
}

function boundsOf(lines: NetworkLine[]): LngLatBoundsLike | null {
  const pts = lines.flatMap((l) => l.segments.flat());
  if (pts.length < 2) return null;
  const lngs = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

const width = (factor = 1, extra = 0): maplibregl.ExpressionSpecification => [
  'interpolate',
  ['exponential', 1.6],
  ['zoom'],
  9,
  ['+', ['*', ['get', 'w'], 0.45 * factor], extra * 0.5],
  12,
  ['+', ['*', ['get', 'w'], factor], extra],
  16,
  ['+', ['*', ['get', 'w'], 2.2 * factor], extra * 2],
];

export default function TransitMap({
  lines,
  stations = [],
  widths,
  focus = null,
  me = null,
  alerts = [],
  vehicles = [],
  fleet = null,
  flyTo = null,
  onLineClick,
  onStationClick,
  embedded = false,
  className,
}: TransitMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const fitted = useRef(false);
  const locale = useLocale();
  // Latest props for map event handlers and style reloads.
  const latest = useRef({ lines, stations, widths, focus, me, alerts, vehicles, fleet, onLineClick, onStationClick });
  latest.current = { lines, stations, widths, focus, me, alerts, vehicles, fleet, onLineClick, onStationClick };

  // Create the map once.
  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: STYLE_URL,
      center: ISTANBUL,
      zoom: 10,
      attributionControl: { compact: true },
      cooperativeGestures: embedded,
      dragRotate: false,
      pitchWithRotate: false,
      locale:
        locale === 'tr'
          ? {
              'CooperativeGesturesHandler.WindowsHelpText': 'Haritayı yakınlaştırmak için Ctrl + kaydırın',
              'CooperativeGesturesHandler.MacHelpText': 'Haritayı yakınlaştırmak için ⌘ + kaydırın',
              'CooperativeGesturesHandler.MobileHelpText': 'Haritayı hareket ettirmek için iki parmak kullanın',
            }
          : undefined,
    });
    map.touchZoomRotate.disableRotation();
    if (window.matchMedia('(pointer: fine)').matches) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    }
    mapRef.current = map;
    // Keep the canvas sized to its container (e.g. when the panel goes full screen).
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(container.current);

    const install = () => {
      const ink = cssRgb('--fg');
      const land = cssVar('--map-land');
      const { lines, stations, widths, alerts, vehicles, fleet } = latest.current;

      map.addSource('net', { type: 'geojson', data: linesGeoJSON(lines, widths, ink, alerts) });
      map.addSource('vehicles', { type: 'geojson', data: vehiclesGeoJSON(vehicles) });
      map.addSource('fleet', { type: 'geojson', data: fleetGeoJSON(fleet) });
      map.addSource('stations', { type: 'geojson', data: stationsGeoJSON(stations) });
      map.addSource('me', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

      map.addLayer({
        id: 'net-casing',
        type: 'line',
        source: 'net',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': land, 'line-width': width(1, 3) },
      });
      map.addLayer({
        id: 'net-line',
        type: 'line',
        source: 'net',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'c'], 'line-width': width() },
      });
      // Railway convention for Marmaray: ink line with paper dashes.
      map.addLayer({
        id: 'net-railway-dash',
        type: 'line',
        source: 'net',
        filter: ['==', ['get', 'style'], 'railway'],
        paint: { 'line-color': land, 'line-width': width(0.45), 'line-dasharray': [3, 3] },
      });
      // Live disruption: signal-red dashes over the affected line.
      map.addLayer({
        id: 'net-alert',
        type: 'line',
        source: 'net',
        filter: ['==', ['get', 'alert'], true],
        paint: { 'line-color': cssRgb('--signal'), 'line-width': width(0.5), 'line-dasharray': [1.5, 1.5] },
      });
      map.addLayer({
        id: 'net-hit',
        type: 'line',
        source: 'net',
        paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 18 },
      });
      map.addLayer({
        id: 'fleet',
        type: 'circle',
        source: 'fleet',
        paint: {
          'circle-color': fleetColor(),
          'circle-opacity': ['case', ['<', ['get', 's'], SLOW_KMH], 0.9, 0.45],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 1.3, 12, 2.6, 15, 4.5],
        },
      });
      map.addLayer({
        id: 'stations',
        type: 'circle',
        source: 'stations',
        minzoom: 10.5,
        paint: {
          'circle-color': land,
          'circle-stroke-color': ink,
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 10.5, 1, 14, 2],
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10.5,
            ['case', ['get', 'transfer'], 3, 1.8],
            14,
            ['case', ['get', 'transfer'], 7, 4.5],
          ],
        },
      });
      map.addLayer({
        id: 'station-labels',
        type: 'symbol',
        source: 'stations',
        minzoom: 12.2,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 11.5,
          'text-anchor': 'left',
          'text-offset': [0.8, 0],
          'text-optional': true,
        },
        paint: { 'text-color': ink, 'text-halo-color': land, 'text-halo-width': 1.6 },
      });
      map.addLayer({
        id: 'vehicles',
        type: 'symbol',
        source: 'vehicles',
        layout: {
          'icon-image': ['case', ['get', 'live'], 'bus-live', 'bus-idle'],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 13, 1.05, 16, 1.4],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'symbol-sort-key': ['case', ['get', 'live'], 1, 0],
        },
        paint: { 'icon-opacity': ['case', ['get', 'live'], 1, 0.55] },
      });
      void installBusIcons(map);
      map.addLayer({
        id: 'me-halo',
        type: 'circle',
        source: 'me',
        paint: { 'circle-radius': 14, 'circle-color': '#2f6feb', 'circle-opacity': 0.18 },
      });
      map.addLayer({
        id: 'me',
        type: 'circle',
        source: 'me',
        paint: { 'circle-radius': 6, 'circle-color': '#2f6feb', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
      });
      paintWhenReady(map, () => latest.current);
      applyFocus(map, latest.current.focus);
      applyMe(map, latest.current.me);

      if (!fitted.current) {
        const target = latest.current.focus
          ? latest.current.lines.filter((l) => l.code === latest.current.focus)
          : latest.current.lines;
        const b = boundsOf(target);
        if (b) {
          map.fitBounds(b, { padding: 32, duration: 0 });
          fitted.current = true;
        }
      }
    };

    map.on('style.load', install);

    map.on('click', (e) => {
      const st = map.queryRenderedFeatures(e.point, { layers: ['stations'] })[0];
      if (st && latest.current.onStationClick) {
        const station = latest.current.stations.find((s) => s.id === st.properties?.id);
        if (station) return latest.current.onStationClick(station);
      }
      const hit = map.queryRenderedFeatures(e.point, { layers: ['net-hit'] })[0];
      if (hit && latest.current.onLineClick) latest.current.onLineClick(String(hit.properties?.code));
    });
    for (const layer of ['net-hit', 'stations']) {
      map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
    }

    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // The map is created once; prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme switch: repaint once next-themes has applied the class to <html>. Watching the class
  // (not `resolvedTheme`) matters: child effects run before the provider updates the DOM.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const map = mapRef.current;
      if (!map?.getLayer('net-line')) return;
      paintAll(map);
      (map.getSource('net') as GeoJSONSource).setData(
        linesGeoJSON(latest.current.lines, latest.current.widths, cssRgb('--fg'), latest.current.alerts),
      );
      map.setPaintProperty('net-alert', 'line-color', cssRgb('--signal'));
      void installBusIcons(map);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Data updates.
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource('net') as GeoJSONSource | undefined;
    if (!map || !src) return;
    src.setData(linesGeoJSON(lines, widths, cssRgb('--fg'), latest.current.alerts));
    if (!fitted.current) {
      const b = boundsOf(focus ? lines.filter((l) => l.code === focus) : lines);
      if (b) {
        map.fitBounds(b, { padding: 32, duration: 0 });
        fitted.current = true;
      }
    }
  }, [lines, widths, focus]);

  useEffect(() => {
    const src = mapRef.current?.getSource('stations') as GeoJSONSource | undefined;
    src?.setData(stationsGeoJSON(stations));
  }, [stations]);

  const alertKey = alerts.join(',');
  useEffect(() => {
    const src = mapRef.current?.getSource('net') as GeoJSONSource | undefined;
    src?.setData(linesGeoJSON(latest.current.lines, latest.current.widths, cssRgb('--fg'), latest.current.alerts));
  }, [alertKey]);

  useEffect(() => {
    const src = mapRef.current?.getSource('vehicles') as GeoJSONSource | undefined;
    src?.setData(vehiclesGeoJSON(vehicles));
  }, [vehicles]);

  useEffect(() => {
    const src = mapRef.current?.getSource('fleet') as GeoJSONSource | undefined;
    src?.setData(fleetGeoJSON(fleet));
  }, [fleet]);

  useEffect(() => {
    if (mapRef.current?.getLayer('net-line')) applyFocus(mapRef.current, focus);
  }, [focus]);

  useEffect(() => {
    const gestures = mapRef.current?.cooperativeGestures;
    if (!gestures) return;
    if (embedded) gestures.enable();
    else gestures.disable();
  }, [embedded]);

  useEffect(() => {
    if (mapRef.current?.getSource('me')) applyMe(mapRef.current, me);
  }, [me]);

  useEffect(() => {
    if (flyTo && mapRef.current) {
      mapRef.current.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: flyTo.zoom ?? 14, duration: 900 });
    }
  }, [flyTo]);

  return <div ref={container} className={cn('h-full w-full', className)} />;
}

function applyFocus(map: MLMap, focus: string | null) {
  // A single focused line has few stations: show them (and names) from lower zooms.
  map.setLayerZoomRange('stations', focus ? 8 : 10.5, 24);
  map.setLayerZoomRange('station-labels', focus ? 10.8 : 12.2, 24);
  const opacity: maplibregl.ExpressionSpecification | number = focus
    ? ['case', ['==', ['get', 'code'], focus], 1, 0.18]
    : 1;
  map.setPaintProperty('net-line', 'line-opacity', opacity);
  map.setPaintProperty('net-railway-dash', 'line-opacity', opacity);
}

function applyMe(map: MLMap, me: { lat: number; lng: number } | null) {
  (map.getSource('me') as GeoJSONSource | undefined)?.setData({
    type: 'FeatureCollection',
    features: me
      ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [me.lng, me.lat] } }]
      : [],
  });
}
