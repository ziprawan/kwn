"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createToiletIcon(isSelected: boolean, isNearest: boolean): L.DivIcon {
  const fill = isNearest ? "#059669" : isSelected ? "#0f172a" : "#0f766e";
  const ring = isNearest
    ? "0 0 0 5px rgba(16, 185, 129, 0.28)"
    : isSelected
      ? "0 0 0 5px rgba(15, 23, 42, 0.22)"
      : "0 4px 10px rgba(15, 23, 42, 0.24)";
  const size = isSelected || isNearest ? 38 : 32;

  const badgeHtml = isNearest
    ? `<div style="position:absolute;top:-20px;left:50%;transform:translateX(-50%);background:#059669;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.2);">TERDEKAT</div>`
    : "";

  const html = `
    <div style="position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;">
      ${badgeHtml}
      <div style="width:${size}px;height:${size}px;border-radius:999px 999px 999px 4px;transform:rotate(-45deg);background:${fill};border:2.5px solid #ffffff;box-shadow:${ring};display:flex;align-items:center;justify-content:center;">
        <svg style="transform:rotate(45deg);" width="${Math.round(size * 0.48)}" height="${Math.round(size * 0.48)}" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 12h13a1 1 0 0 1 1 1 5 5 0 0 1-5 5h-.598a.5.5 0 0 0-.424.765l1.544 2.47a.5.5 0 0 1-.424.765H5.402a.5.5 0 0 1-.424-.765L7 18" />
          <path d="M8 18a5 5 0 0 1-5-5V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8" />
        </svg>
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    tooltipAnchor: [0, -size - 2],
  });
}

function createUserIcon(): L.DivIcon {
  const html = `
    <div style="position:relative;width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
      <div class="user-gps-pulse" style="position:absolute;width:22px;height:22px;border-radius:999px;background:rgba(37,99,235,0.35);"></div>
      <div style="position:relative;width:14px;height:14px;border-radius:999px;background:#2563eb;border:2.5px solid #ffffff;box-shadow:0 2px 6px rgba(37,99,235,0.5);"></div>
    </div>
  `;
  return L.divIcon({
    html,
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function createDraftPinIcon(): L.DivIcon {
  const html = `
    <div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
      <div style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:#e11d48;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.2);">PIN BARU</div>
      <div style="width:36px;height:36px;border-radius:999px 999px 999px 4px;transform:rotate(-45deg);background:#e11d48;border:2.5px solid #ffffff;box-shadow:0 0 0 5px rgba(225,29,72,0.25);display:flex;align-items:center;justify-content:center;">
        <div style="width:10px;height:10px;border-radius:999px;background:#ffffff;"></div>
      </div>
    </div>
  `;
  return L.divIcon({
    html,
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 36],
  });
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
  const mapRef = useRef<L.Map | null>(null);
  const toiletLayerRef = useRef<L.LayerGroup | null>(null);
  const userLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const draftLayerRef = useRef<L.LayerGroup | null>(null);

  const onSelectRef = useRef(onSelectToilet);
  const onAdminClickRef = useRef(onAdminMapClick);
  const adminModeRef = useRef(adminPinMode);
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

  // Initialize Leaflet map once on mount
  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(containerRef.current, {
      center: [ITB_CENTER.lat, ITB_CENTER.lng],
      zoom: ITB_DEFAULT_ZOOM,
      minZoom: ITB_MIN_ZOOM,
      maxZoom: ITB_MAX_ZOOM,
      maxBounds: ITB_SOFT_BOUNDS,
      maxBoundsViscosity: 0.75,
      zoomControl: false,
    });

    L.control.zoom({ position: "topright" }).addTo(map);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
      maxZoom: ITB_MAX_ZOOM,
    }).addTo(map);

    const routeLayer = L.layerGroup().addTo(map);
    const toiletLayer = L.layerGroup().addTo(map);
    const userLayer = L.layerGroup().addTo(map);
    const draftLayer = L.layerGroup().addTo(map);

    map.on("click", (event: L.LeafletMouseEvent) => {
      if (adminModeRef.current && onAdminClickRef.current) {
        onAdminClickRef.current({
          lat: Number(event.latlng.lat.toFixed(6)),
          lng: Number(event.latlng.lng.toFixed(6)),
        });
      }
    });

    mapRef.current = map;
    routeLayerRef.current = routeLayer;
    toiletLayerRef.current = toiletLayer;
    userLayerRef.current = userLayer;
    draftLayerRef.current = draftLayer;

    return () => {
      map.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
      toiletLayerRef.current = null;
      userLayerRef.current = null;
      draftLayerRef.current = null;
    };
  }, []);

  // Update cursor when adminPinMode changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.style.cursor = adminPinMode ? "crosshair" : "";
  }, [adminPinMode]);

  // Render toilet pins
  useEffect(() => {
    const layer = toiletLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    for (const toilet of toilets) {
      const isSelected = toilet.id === selectedToiletId;
      const isNearest = toilet.id === nearestToiletId;
      const marker = L.marker([toilet.latitude, toilet.longitude], {
        icon: createToiletIcon(isSelected, isNearest),
        zIndexOffset: isNearest ? 700 : isSelected ? 600 : 100,
      });

      marker.bindTooltip(escapeHtml(toilet.name), {
        direction: "top",
        opacity: 0.95,
      });

      marker.on("click", (event) => {
        L.DomEvent.stopPropagation(event);
        onSelectRef.current(toilet);
      });

      marker.addTo(layer);
    }
  }, [toilets, selectedToiletId, nearestToiletId]);

  // Render user GPS marker
  useEffect(() => {
    const layer = userLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!userLocation) return;

    const marker = L.marker([userLocation.lat, userLocation.lng], {
      icon: createUserIcon(),
      zIndexOffset: 800,
    });
    marker.bindTooltip("Lokasi Anda", { direction: "top" });
    marker.addTo(layer);
  }, [userLocation]);

  // Render walking route polyline and fit bounds
  useEffect(() => {
    const layer = routeLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();

    if (!routePath || routePath.length < 2) {
      lastFittedRouteKeyRef.current = null;
      return;
    }

    // White halo for contrast on OSM map
    L.polyline(routePath, {
      color: "#ffffff",
      weight: 8,
      opacity: 0.85,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(layer);

    const routeLine = L.polyline(routePath, {
      color: routeMode === "straight-line" ? "#475569" : "#0284c7",
      weight: 4.5,
      opacity: 0.95,
      dashArray: routeMode === "straight-line" ? "8, 8" : undefined,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(layer);

    const routeKey = JSON.stringify([routePath[0], routePath[routePath.length - 1], routeMode]);
    if (lastFittedRouteKeyRef.current !== routeKey) {
      lastFittedRouteKeyRef.current = routeKey;
      map.fitBounds(routeLine.getBounds(), {
        paddingTopLeft: [48, 84],
        paddingBottomRight: [48, 220],
        maxZoom: 18,
      });
    }
  }, [routePath, routeMode]);

  // Render draggable admin draft marker
  useEffect(() => {
    const layer = draftLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!adminPinMode || !adminDraftPosition) return;

    const draftMarker = L.marker(
      [adminDraftPosition.lat, adminDraftPosition.lng],
      {
        icon: createDraftPinIcon(),
        draggable: true,
        zIndexOffset: 900,
      }
    );

    draftMarker.on("dragend", () => {
      const pos = draftMarker.getLatLng();
      if (onAdminClickRef.current) {
        onAdminClickRef.current({
          lat: Number(pos.lat.toFixed(6)),
          lng: Number(pos.lng.toFixed(6)),
        });
      }
    });

    draftMarker.addTo(layer);
  }, [adminPinMode, adminDraftPosition]);

  // Recenter to ITB Ganesha on demand
  useEffect(() => {
    if (!recenterTrigger || !mapRef.current) return;
    mapRef.current.flyTo([ITB_CENTER.lat, ITB_CENTER.lng], ITB_DEFAULT_ZOOM, {
      duration: 0.45,
    });
  }, [recenterTrigger]);

  // Focus on specific toilet coordinate when chosen from list
  useEffect(() => {
    if (!focusTarget || !mapRef.current) return;
    const currentZoom = mapRef.current.getZoom();
    mapRef.current.flyTo(
      [focusTarget.lat, focusTarget.lng],
      Math.max(currentZoom, 18),
      { duration: 0.4 }
    );
  }, [focusTarget]);

  return <div ref={containerRef} className="w-full h-full z-0" />;
}
