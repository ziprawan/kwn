"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import {
  ITB_CENTER,
  ITB_DEFAULT_ZOOM,
  ITB_MAX_ZOOM,
  ITB_MIN_ZOOM,
  ITB_SOFT_BOUNDS,
  LatLng,
  ToiletPoint,
} from "@/lib/geo";

interface ItbToiletMapProps {
  toilets: ToiletPoint[];
  selectedToiletId: string | null;
  nearestToiletId?: string | null;
  onSelectToilet: (toilet: ToiletPoint) => void;
  userLocation?: LatLng | null;
  routePath?: [number, number][] | null;
  routeMode?: "walking" | "straight-line" | null;
  recenterTrigger?: number;
  focusTarget?: { lat: number; lng: number; seq: number } | null;
  adminPinMode?: boolean;
  adminDraftPosition?: LatLng | null;
  onAdminMapClick?: (pos: LatLng) => void;
}

const OPENFREEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const ROUTE_SOURCE_ID = "itb-walking-route";
const ROUTE_HALO_LAYER_ID = "itb-route-halo";
const ROUTE_SOLID_LAYER_ID = "itb-route-solid";
const ROUTE_DASHED_LAYER_ID = "itb-route-dashed";

function createToiletMarkerElement(
  toilet: ToiletPoint,
  isSelected: boolean,
  isNearest: boolean
): HTMLDivElement {
  const fill = isNearest ? "#059669" : isSelected ? "#0f172a" : "#0f766e";
  const ring = isNearest
    ? "0 0 0 5px rgba(16, 185, 129, 0.28)"
    : isSelected
      ? "0 0 0 5px rgba(15, 23, 42, 0.22)"
      : "0 4px 10px rgba(15, 23, 42, 0.24)";
  const size = isSelected || isNearest ? 38 : 32;

  const wrapper = document.createElement("div");
  wrapper.className = "toilet-pin-wrap";
  wrapper.setAttribute("data-toilet-marker", "true");
  wrapper.style.position = "relative";
  wrapper.style.width = `${size}px`;
  wrapper.style.height = `${size}px`;
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.justifyContent = "center";
  wrapper.style.cursor = "pointer";

  const tooltip = document.createElement("div");
  tooltip.className = "toilet-pin-tooltip";
  tooltip.textContent = toilet.name;
  tooltip.style.position = "absolute";
  tooltip.style.bottom = `${size + (isNearest ? 22 : 8)}px`;
  tooltip.style.left = "50%";
  tooltip.style.background = "rgba(15, 23, 42, 0.92)";
  tooltip.style.color = "#ffffff";
  tooltip.style.fontSize = "11px";
  tooltip.style.fontWeight = "600";
  tooltip.style.padding = "3px 8px";
  tooltip.style.borderRadius = "8px";
  tooltip.style.whiteSpace = "nowrap";
  tooltip.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.2)";
  wrapper.appendChild(tooltip);

  if (isNearest) {
    const badge = document.createElement("div");
    badge.textContent = "TERDEKAT";
    badge.style.position = "absolute";
    badge.style.top = "-20px";
    badge.style.left = "50%";
    badge.style.transform = "translateX(-50%)";
    badge.style.background = "#059669";
    badge.style.color = "#ffffff";
    badge.style.fontSize = "10px";
    badge.style.fontWeight = "700";
    badge.style.padding = "2px 6px";
    badge.style.borderRadius = "999px";
    badge.style.whiteSpace = "nowrap";
    badge.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
    wrapper.appendChild(badge);
  }

  const pin = document.createElement("div");
  pin.style.width = `${size}px`;
  pin.style.height = `${size}px`;
  pin.style.borderRadius = "999px 999px 999px 4px";
  pin.style.transform = "rotate(-45deg)";
  pin.style.background = fill;
  pin.style.border = "2.5px solid #ffffff";
  pin.style.boxShadow = ring;
  pin.style.display = "flex";
  pin.style.alignItems = "center";
  pin.style.justifyContent = "center";

  const iconSize = Math.round(size * 0.48);
  pin.innerHTML = `
    <svg style="transform:rotate(45deg);" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M7 12h13a1 1 0 0 1 1 1 5 5 0 0 1-5 5h-.598a.5.5 0 0 0-.424.765l1.544 2.47a.5.5 0 0 1-.424.765H5.402a.5.5 0 0 1-.424-.765L7 18" />
      <path d="M8 18a5 5 0 0 1-5-5V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8" />
    </svg>
  `;
  wrapper.appendChild(pin);

  return wrapper;
}

function createUserMarkerElement(): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  wrapper.style.width = "24px";
  wrapper.style.height = "24px";
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.justifyContent = "center";
  wrapper.innerHTML = `
    <div class="user-gps-pulse" style="position:absolute;width:22px;height:22px;border-radius:999px;background:rgba(37,99,235,0.35);"></div>
    <div style="position:relative;width:14px;height:14px;border-radius:999px;background:#2563eb;border:2.5px solid #ffffff;box-shadow:0 2px 6px rgba(37,99,235,0.5);"></div>
  `;
  return wrapper;
}

function createDraftMarkerElement(): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-toilet-marker", "true");
  wrapper.style.position = "relative";
  wrapper.style.width = "36px";
  wrapper.style.height = "36px";
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.justifyContent = "center";
  wrapper.style.cursor = "grab";
  wrapper.innerHTML = `
    <div style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:#e11d48;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.2);">PIN BARU</div>
    <div style="width:36px;height:36px;border-radius:999px 999px 999px 4px;transform:rotate(-45deg);background:#e11d48;border:2.5px solid #ffffff;box-shadow:0 0 0 5px rgba(225,29,72,0.25);display:flex;align-items:center;justify-content:center;">
      <div style="width:10px;height:10px;border-radius:999px;background:#ffffff;"></div>
    </div>
  `;
  return wrapper;
}

export default function ItbToiletMap({
  toilets,
  selectedToiletId,
  nearestToiletId = null,
  onSelectToilet,
  userLocation = null,
  routePath = null,
  routeMode = null,
  recenterTrigger = 0,
  focusTarget = null,
  adminPinMode = false,
  adminDraftPosition = null,
  onAdminMapClick,
}: ItbToiletMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const styleReadyRef = useRef(false);

  const toiletMarkersRef = useRef<maplibregl.Marker[]>([]);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const draftMarkerRef = useRef<maplibregl.Marker | null>(null);

  const onSelectRef = useRef(onSelectToilet);
  const onAdminClickRef = useRef(onAdminMapClick);
  const adminModeRef = useRef(adminPinMode);
  const routeStateRef = useRef({ routePath, routeMode });
  const lastFittedRouteKeyRef = useRef<string | null>(null);

  useEffect(() => {
    onSelectRef.current = onSelectToilet;
  }, [onSelectToilet]);

  useEffect(() => {
    onAdminClickRef.current = onAdminMapClick;
  }, [onAdminMapClick]);

  useEffect(() => {
    adminModeRef.current = adminPinMode;
  }, [adminPinMode]);

  const applyRouteToMap = (
    map: maplibregl.Map,
    nextPath: [number, number][] | null | undefined,
    nextMode: "walking" | "straight-line" | null | undefined
  ) => {
    if (!styleReadyRef.current) return;
    const source = map.getSource(ROUTE_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!source) return;

    if (!nextPath || nextPath.length < 2) {
      source.setData({ type: "FeatureCollection", features: [] });
      map.setLayoutProperty(ROUTE_HALO_LAYER_ID, "visibility", "none");
      map.setLayoutProperty(ROUTE_SOLID_LAYER_ID, "visibility", "none");
      map.setLayoutProperty(ROUTE_DASHED_LAYER_ID, "visibility", "none");
      lastFittedRouteKeyRef.current = null;
      return;
    }

    const lngLatCoords: [number, number][] = nextPath.map(([lat, lng]) => [
      lng,
      lat,
    ]);

    source.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: lngLatCoords,
          },
        },
      ],
    });

    const isDashed = nextMode === "straight-line";
    map.setLayoutProperty(ROUTE_HALO_LAYER_ID, "visibility", "visible");
    map.setLayoutProperty(
      ROUTE_SOLID_LAYER_ID,
      "visibility",
      isDashed ? "none" : "visible"
    );
    map.setLayoutProperty(
      ROUTE_DASHED_LAYER_ID,
      "visibility",
      isDashed ? "visible" : "none"
    );

    const routeKey = JSON.stringify([
      nextPath[0],
      nextPath[nextPath.length - 1],
      nextMode,
    ]);
    if (lastFittedRouteKeyRef.current !== routeKey) {
      lastFittedRouteKeyRef.current = routeKey;
      const bounds = new maplibregl.LngLatBounds(
        lngLatCoords[0],
        lngLatCoords[0]
      );
      for (const coord of lngLatCoords) {
        bounds.extend(coord);
      }
      map.fitBounds(bounds, {
        padding: { top: 84, bottom: 230, left: 48, right: 48 },
        maxZoom: 18,
        duration: 500,
      });
    }
  };

  // Initialize MapLibre GL map once on mount
  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OPENFREEMAP_STYLE_URL,
      center: [ITB_CENTER.lng, ITB_CENTER.lat],
      zoom: ITB_DEFAULT_ZOOM,
      minZoom: ITB_MIN_ZOOM,
      maxZoom: ITB_MAX_ZOOM,
      maxBounds: [
        [ITB_SOFT_BOUNDS[0][1], ITB_SOFT_BOUNDS[0][0]],
        [ITB_SOFT_BOUNDS[1][1], ITB_SOFT_BOUNDS[1][0]],
      ],
      attributionControl: { compact: true },
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right"
    );

    map.on("load", () => {
      styleReadyRef.current = true;

      if (!map.getSource(ROUTE_SOURCE_ID)) {
        map.addSource(ROUTE_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addLayer({
          id: ROUTE_HALO_LAYER_ID,
          type: "line",
          source: ROUTE_SOURCE_ID,
          layout: {
            "line-cap": "round",
            "line-join": "round",
            visibility: "none",
          },
          paint: {
            "line-color": "#ffffff",
            "line-width": 8,
            "line-opacity": 0.9,
          },
        });

        map.addLayer({
          id: ROUTE_SOLID_LAYER_ID,
          type: "line",
          source: ROUTE_SOURCE_ID,
          layout: {
            "line-cap": "round",
            "line-join": "round",
            visibility: "none",
          },
          paint: {
            "line-color": "#0284c7",
            "line-width": 4.5,
            "line-opacity": 0.95,
          },
        });

        map.addLayer({
          id: ROUTE_DASHED_LAYER_ID,
          type: "line",
          source: ROUTE_SOURCE_ID,
          layout: {
            "line-cap": "round",
            "line-join": "round",
            visibility: "none",
          },
          paint: {
            "line-color": "#475569",
            "line-width": 4,
            "line-opacity": 0.9,
            "line-dasharray": [2, 2],
          },
        });
      }

      applyRouteToMap(
        map,
        routeStateRef.current.routePath,
        routeStateRef.current.routeMode
      );
    });

    map.on("click", (event: maplibregl.MapMouseEvent) => {
      const target = event.originalEvent.target as HTMLElement | null;
      if (target?.closest("[data-toilet-marker]")) {
        return;
      }
      if (adminModeRef.current && onAdminClickRef.current) {
        onAdminClickRef.current({
          lat: Number(event.lngLat.lat.toFixed(6)),
          lng: Number(event.lngLat.lng.toFixed(6)),
        });
      }
    });

    mapRef.current = map;

    return () => {
      styleReadyRef.current = false;
      for (const m of toiletMarkersRef.current) {
        m.remove();
      }
      toiletMarkersRef.current = [];
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      draftMarkerRef.current?.remove();
      draftMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Toggle admin crosshair cursor
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.classList.toggle("admin-pin-cursor", adminPinMode);
  }, [adminPinMode]);

  // Render toilet markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const marker of toiletMarkersRef.current) {
      marker.remove();
    }
    toiletMarkersRef.current = [];

    for (const toilet of toilets) {
      const isSelected = toilet.id === selectedToiletId;
      const isNearest = toilet.id === nearestToiletId;
      const el = createToiletMarkerElement(toilet, isSelected, isNearest);
      el.style.zIndex = isNearest ? "30" : isSelected ? "20" : "10";

      el.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelectRef.current(toilet);
      });

      const marker = new maplibregl.Marker({
        element: el,
        anchor: "bottom",
      })
        .setLngLat([toilet.longitude, toilet.latitude])
        .addTo(map);

      toiletMarkersRef.current.push(marker);
    }
  }, [toilets, selectedToiletId, nearestToiletId]);

  // Render user GPS marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    userMarkerRef.current?.remove();
    userMarkerRef.current = null;

    if (!userLocation) return;

    const el = createUserMarkerElement();
    el.style.zIndex = "35";
    userMarkerRef.current = new maplibregl.Marker({
      element: el,
      anchor: "center",
    })
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(map);
  }, [userLocation]);

  // Sync walking route layer
  useEffect(() => {
    routeStateRef.current = { routePath, routeMode };
    if (mapRef.current) {
      applyRouteToMap(mapRef.current, routePath, routeMode);
    }
  }, [routePath, routeMode]);

  // Render draggable admin draft marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    draftMarkerRef.current?.remove();
    draftMarkerRef.current = null;

    if (!adminPinMode || !adminDraftPosition) return;

    const el = createDraftMarkerElement();
    el.style.zIndex = "40";
    const draftMarker = new maplibregl.Marker({
      element: el,
      anchor: "bottom",
      draggable: true,
    })
      .setLngLat([adminDraftPosition.lng, adminDraftPosition.lat])
      .addTo(map);

    draftMarker.on("dragend", () => {
      const pos = draftMarker.getLngLat();
      if (onAdminClickRef.current) {
        onAdminClickRef.current({
          lat: Number(pos.lat.toFixed(6)),
          lng: Number(pos.lng.toFixed(6)),
        });
      }
    });

    draftMarkerRef.current = draftMarker;
  }, [adminPinMode, adminDraftPosition]);

  // Recenter to ITB Ganesha on demand
  useEffect(() => {
    if (!recenterTrigger || !mapRef.current) return;
    mapRef.current.flyTo({
      center: [ITB_CENTER.lng, ITB_CENTER.lat],
      zoom: ITB_DEFAULT_ZOOM,
      duration: 500,
    });
  }, [recenterTrigger]);

  // Focus on specific toilet coordinate when selected from list or GPS
  useEffect(() => {
    if (!focusTarget || !mapRef.current) return;
    const currentZoom = mapRef.current.getZoom();
    mapRef.current.flyTo({
      center: [focusTarget.lng, focusTarget.lat],
      zoom: Math.max(currentZoom, 17.8),
      duration: 450,
    });
  }, [focusTarget]);

  return <div ref={containerRef} className="w-full h-full z-0" />;
}
