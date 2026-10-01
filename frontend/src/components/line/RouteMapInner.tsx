'use client';
import { useEffect, useMemo } from 'react';
import { CircleMarker, MapContainer, Polyline, Tooltip, useMap } from 'react-leaflet';
import { latLngBounds, type LatLngTuple } from 'leaflet';
import { useTheme } from 'next-themes';
import 'leaflet/dist/leaflet.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet';

// OpenFreeMap vector basemap: free, no API key, no request limits.
const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';

function BaseMap() {
  const map = useMap();
  const { resolvedTheme } = useTheme();
  const style = resolvedTheme === 'dark' ? STYLES.dark : STYLES.light;

  useEffect(() => {
    // The plugin reads Leaflet attribution from `attributionControl`, not `attribution`.
    const layer = maplibreGL({ style, attributionControl: { customAttribution: ATTRIBUTION } }).addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, style]);

  return null;
}

function FitBounds({ points }: { points: LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(latLngBounds(points), { padding: [28, 28] });
  }, [map, points]);
  return null;
}

export interface MapStop {
  name: string;
  position: LatLngTuple;
}

interface RouteMapInnerProps {
  path: LatLngTuple[];
  stops: MapStop[];
  color: string;
  labels: { start: string; end: string };
}

export default function RouteMapInner({ path, stops, color, labels }: RouteMapInnerProps) {
  const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const bounds = useMemo(() => (path.length ? path : stops.map((s) => s.position)), [path, stops]);
  const start = bounds[0];
  const end = bounds[bounds.length - 1];

  return (
    <MapContainer
      center={start ?? [41.0082, 28.9784]}
      zoom={12}
      zoomControl={!isTouch}
      scrollWheelZoom={false}
      // One-finger drags should scroll the page on phones; pinch still zooms.
      dragging={!isTouch}
      className="h-full w-full"
    >
      <BaseMap />
      {path.length > 1 ? (
        <>
          <Polyline positions={path} pathOptions={{ color: '#ffffff', weight: 8, opacity: 0.9 }} />
          <Polyline positions={path} pathOptions={{ color, weight: 5, opacity: 1 }} />
        </>
      ) : null}
      {stops.map((stop) => (
        <CircleMarker
          key={`${stop.name}-${stop.position.join(',')}`}
          center={stop.position}
          radius={4.5}
          pathOptions={{ color, weight: 2.5, fillColor: '#ffffff', fillOpacity: 1 }}
        >
          <Tooltip direction="top" offset={[0, -6]} className="stop-tooltip">
            {stop.name}
          </Tooltip>
        </CircleMarker>
      ))}
      {start ? (
        <CircleMarker center={start} radius={7} pathOptions={{ color: '#ffffff', weight: 3, fillColor: color, fillOpacity: 1 }}>
          <Tooltip direction="top" offset={[0, -8]} className="stop-tooltip">
            {stops[0]?.name ?? labels.start}
          </Tooltip>
        </CircleMarker>
      ) : null}
      {end && end !== start ? (
        <CircleMarker center={end} radius={7} pathOptions={{ color: '#ffffff', weight: 3, fillColor: color, fillOpacity: 1 }}>
          <Tooltip direction="top" offset={[0, -8]} className="stop-tooltip">
            {stops[stops.length - 1]?.name ?? labels.end}
          </Tooltip>
        </CircleMarker>
      ) : null}
      <FitBounds points={bounds} />
    </MapContainer>
  );
}
