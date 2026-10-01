"use client";

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import 'maplibre-gl/dist/maplibre-gl.css';
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet';

// OpenFreeMap vector basemap: free, no API key, no request limits.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';

export default function BaseMapLayer() {
  const map = useMap();

  useEffect(() => {
    const layer = maplibreGL({ style: STYLE_URL, attribution: ATTRIBUTION }).addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map]);

  return null;
}
