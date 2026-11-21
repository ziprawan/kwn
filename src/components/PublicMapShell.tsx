"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Copy,
  ExternalLink,
  ImageOff,
  List,
  Loader2,
  MapPin,
  Navigation,
  Route,
  Search,
  X,
  ZoomIn,
} from "lucide-react";
import {
  LatLng,
  ToiletPoint,
  buildGoogleMapsWalkingUrl,
  findNearestCandidates,
  formatCoordinates,
  formatDistanceId,
  formatDurationId,
  haversineMeters,
} from "@/lib/geo";

const ItbToiletMap = dynamic(() => import("@/components/ItbToiletMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-600 text-sm">
      <Loader2 className="w-5 h-5 animate-spin mr-2 text-teal-700" />
      Memuat peta ITB Kampus Ganesha...
    </div>
  ),
});

interface ActiveRouteState {
  toiletId: string;
  mode: "walking" | "straight-line";
  distanceMeters: number;
  durationSeconds: number | null;
  coordinates: [number, number][];
}

interface PublicMapShellProps {
  initialToilets: ToiletPoint[];
}

export default function PublicMapShell({
  initialToilets,
}: PublicMapShellProps) {
  const [toilets] = useState<ToiletPoint[]>(initialToilets);
  const [selectedToilet, setSelectedToilet] = useState<ToiletPoint | null>(null);
  const [nearestToiletId, setNearestToiletId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [activeRoute, setActiveRoute] = useState<ActiveRouteState | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isRoutingToSelected, setIsRoutingToSelected] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [recenterTrigger, setRecenterTrigger] = useState(0);
  const [focusTarget, setFocusTarget] = useState<{
    lat: number;
    lng: number;
    seq: number;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isListOpen, setIsListOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const selectToilet = useCallback((toilet: ToiletPoint | null) => {
    setSelectedToilet(toilet);
    setActivePhotoIndex(0);
    setLightboxIndex(null);
  }, []);

  const selectedPhotos = useMemo(() => {
    if (!selectedToilet) return [];
    if (selectedToilet.images && selectedToilet.images.length > 0) {
      return selectedToilet.images;
    }
    return selectedToilet.imagePath
      ? [{ id: "cover", imagePath: selectedToilet.imagePath }]
      : [];
  }, [selectedToilet]);

  const safePhotoIndex =
    selectedPhotos.length > 0
      ? Math.min(activePhotoIndex, selectedPhotos.length - 1)
      : 0;
  const activePhoto = selectedPhotos[safePhotoIndex] ?? null;

  const safeLightboxIndex =
    lightboxIndex !== null && selectedPhotos.length > 0
      ? Math.min(lightboxIndex, selectedPhotos.length - 1)
      : null;
  const lightboxPhoto =
    safeLightboxIndex !== null ? selectedPhotos[safeLightboxIndex] ?? null : null;

  useEffect(() => {
    if (safeLightboxIndex === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLightboxIndex(null);
      } else if (event.key === "ArrowLeft" && selectedPhotos.length > 1) {
        setLightboxIndex((prev) =>
          prev === null
            ? 0
            : (prev - 1 + selectedPhotos.length) % selectedPhotos.length
        );
      } else if (event.key === "ArrowRight" && selectedPhotos.length > 1) {
        setLightboxIndex((prev) =>
          prev === null ? 0 : (prev + 1) % selectedPhotos.length
        );
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [safeLightboxIndex, selectedPhotos.length]);

  const filteredToilets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return toilets;
    return toilets.filter((t) => t.name.toLowerCase().includes(q));
  }, [toilets, searchQuery]);

  const requestUserPosition = useCallback((): Promise<LatLng> => {
    return new Promise((resolve, reject) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        reject(new Error("Browser Anda tidak mendukung layanan lokasi (GPS)."));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            reject(
              new Error(
                "Izin lokasi ditolak. Aktifkan izin lokasi di browser Anda untuk mencari toilet terdekat."
              )
            );
          } else if (err.code === err.TIMEOUT) {
            reject(
              new Error(
                "Permintaan lokasi GPS habis waktu. Pastikan sinyal lokasi aktif dan coba lagi."
              )
            );
          } else {
            reject(new Error("Gagal mendapatkan lokasi Anda saat ini."));
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 15000,
        }
      );
    });
  }, []);

  const fetchWalkingRoute = useCallback(
    async (origin: LatLng, target: ToiletPoint): Promise<ActiveRouteState> => {
      try {
        const params = new URLSearchParams({
          fromLat: String(origin.lat),
          fromLng: String(origin.lng),
          toLat: String(target.latitude),
          toLng: String(target.longitude),
        });
        const res = await fetch(`/api/route?${params.toString()}`);
        if (!res.ok) {
          throw new Error("Route request failed");
        }
        const data = (await res.json()) as {
          mode: "walking" | "straight-line";
          distanceMeters: number;
          durationSeconds: number | null;
          coordinates: [number, number][];
        };
        return {
          toiletId: target.id,
          mode: data.mode,
          distanceMeters: data.distanceMeters,
          durationSeconds: data.durationSeconds,
          coordinates: data.coordinates,
        };
      } catch {
        return {
          toiletId: target.id,
          mode: "straight-line",
          distanceMeters: haversineMeters(
            origin.lat,
            origin.lng,
            target.latitude,
            target.longitude
          ),
          durationSeconds: null,
          coordinates: [
            [origin.lat, origin.lng],
            [target.latitude, target.longitude],
          ],
        };
      }
    },
    []
  );

  const handleFindNearest = async () => {
    setStatusError(null);
    setIsLocating(true);
    try {
      const origin = await requestUserPosition();
      setUserLocation(origin);

      if (toilets.length === 0) {
        setStatusError("Belum ada titik toilet yang tersedia di peta.");
        return;
      }

      const [closest] = findNearestCandidates(origin.lat, origin.lng, toilets, 1);
      if (!closest) return;

      setNearestToiletId(closest.toilet.id);
      selectToilet(closest.toilet);
      const route = await fetchWalkingRoute(origin, closest.toilet);
      setActiveRoute(route);
      setIsListOpen(false);
    } catch (err) {
      setStatusError(
        err instanceof Error ? err.message : "Gagal menentukan toilet terdekat."
      );
    } finally {
      setIsLocating(false);
    }
  };

  const handleRouteToSelected = async (target: ToiletPoint) => {
    setStatusError(null);
    setIsRoutingToSelected(true);
    try {
      const origin = userLocation ?? (await requestUserPosition());
      setUserLocation(origin);
      const route = await fetchWalkingRoute(origin, target);
      setActiveRoute(route);
    } catch (err) {
      setStatusError(
        err instanceof Error ? err.message : "Gagal membuat rute jalan kaki."
      );
    } finally {
      setIsRoutingToSelected(false);
    }
  };

  const handleSelectFromList = (toilet: ToiletPoint) => {
    selectToilet(toilet);
    setFocusTarget((prev) => ({
      lat: toilet.latitude,
      lng: toilet.longitude,
      seq: (prev?.seq ?? 0) + 1,
    }));
    setIsListOpen(false);
  };

  const handleCopyCoordinates = async (toilet: ToiletPoint) => {
    const text = formatCoordinates(toilet.latitude, toilet.longitude);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(toilet.id);
      setTimeout(() => {
        setCopiedId((current) => (current === toilet.id ? null : current));
      }, 2000);
    } catch {
      // Fallback silent if clipboard blocked
    }
  };

  const handleClearRoute = () => {
    setActiveRoute(null);
    setNearestToiletId(null);
  };

  const activeDistanceMeters = useMemo(() => {
    if (!selectedToilet) return null;
    if (activeRoute && activeRoute.toiletId === selectedToilet.id) {
      return activeRoute.distanceMeters;
    }
    if (userLocation) {
      return haversineMeters(
        userLocation.lat,
        userLocation.lng,
        selectedToilet.latitude,
        selectedToilet.longitude
      );
    }
    return null;
  }, [selectedToilet, activeRoute, userLocation]);

  const activeDurationLabel =
    selectedToilet &&
    activeRoute &&
    activeRoute.toiletId === selectedToilet.id
      ? formatDurationId(activeRoute.durationSeconds)
      : null;

  return (
    <div className="relative w-screen h-dvh overflow-hidden bg-slate-100 select-none">
      {/* Interactive Map */}
      <ItbToiletMap
        toilets={toilets}
        selectedToiletId={selectedToilet?.id ?? null}
        nearestToiletId={nearestToiletId}
        onSelectToilet={selectToilet}
        userLocation={userLocation}
        routePath={activeRoute?.coordinates ?? null}
        routeMode={activeRoute?.mode ?? null}
        recenterTrigger={recenterTrigger}
        focusTarget={focusTarget}
      />

      {/* Top-left Brand & List Toggle */}
      <div className="pointer-events-none fixed top-3 left-3 right-16 z-[500] flex flex-col items-start gap-2 max-w-md">
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-white/95 backdrop-blur-md px-4 py-2.5 shadow-lg shadow-slate-900/10 border border-slate-200/80">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white shadow-sm">
            <MapPin className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                Peta Toilet ITB
              </h1>
              <span className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800 border border-teal-200/70">
                {toilets.length} Titik
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate">
              Kampus Ganesha, Bandung
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsListOpen((prev) => !prev)}
            className="ml-1 inline-flex items-center gap-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-[0.98] px-3 py-1.5 text-xs font-semibold text-slate-700 transition cursor-pointer"
            aria-expanded={isListOpen}
          >
            <List className="h-3.5 w-3.5" />
            <span>Daftar</span>
          </button>
        </div>

        {/* Searchable Toilet List Dropdown */}
        {isListOpen && (
          <div className="pointer-events-auto w-full max-w-xs sm:max-w-sm rounded-2xl bg-white/98 backdrop-blur-md shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-2.5 border-b border-slate-100 flex items-center gap-2">
              <Search className="h-4 w-4 text-slate-400 shrink-0 ml-1" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari lokasi toilet (mis. Labtek, GKU)..."
                className="w-full text-sm text-slate-800 placeholder:text-slate-400 bg-transparent focus:outline-none py-1"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                  aria-label="Hapus pencarian"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
              {filteredToilets.length === 0 ? (
                <p className="p-4 text-xs text-slate-500 text-center">
                  {toilets.length === 0
                    ? "Belum ada titik toilet yang ditambahkan."
                    : "Tidak ada lokasi yang cocok."}
                </p>
              ) : (
                filteredToilets.map((t) => {
                  const photoCount = t.images?.length ?? (t.imagePath ? 1 : 0);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleSelectFromList(t)}
                      className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-2 hover:bg-teal-50/60 transition cursor-pointer ${
                        selectedToilet?.id === t.id ? "bg-teal-50" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {t.name}
                        </p>
                        <p className="text-[11px] font-mono text-slate-500">
                          {formatCoordinates(t.latitude, t.longitude)}
                          {photoCount > 0 ? ` • ${photoCount} foto` : ""}
                        </p>
                      </div>
                      {userLocation && (
                        <span className="text-xs font-semibold text-teal-700 shrink-0">
                          {formatDistanceId(
                            haversineMeters(
                              userLocation.lat,
                              userLocation.lng,
                              t.latitude,
                              t.longitude
                            )
                          )}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Error / Empty Notice */}
        {statusError && (
          <div className="pointer-events-auto flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-800 shadow-md">
            <p className="leading-relaxed">{statusError}</p>
            <button
              type="button"
              onClick={() => setStatusError(null)}
              className="text-rose-500 hover:text-rose-700 shrink-0 cursor-pointer"
              aria-label="Tutup pesan"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {toilets.length === 0 && !statusError && (
          <div className="pointer-events-auto rounded-xl bg-amber-50/95 border border-amber-200 px-3.5 py-2 text-xs text-amber-900 shadow-sm">
            Belum ada titik toilet yang ditandai pada peta saat ini.
          </div>
        )}
      </div>

      {/* Floating Map Controls (Bottom Right) */}
      <div
        className={`fixed right-3 z-[500] flex flex-col items-end gap-2 transition-all ${
          selectedToilet
            ? selectedPhotos.length > 1
              ? "bottom-[420px] sm:bottom-5"
              : "bottom-[360px] sm:bottom-5"
            : "bottom-5"
        }`}
      >
        {activeRoute && (
          <button
            type="button"
            onClick={handleClearRoute}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/95 hover:bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-lg border border-slate-200 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
            <span>Tutup Rute</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setRecenterTrigger((n) => n + 1)}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/95 hover:bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-lg border border-slate-200 cursor-pointer"
          title="Kembali ke pusat ITB Ganesha"
        >
          <Compass className="h-4 w-4 text-teal-700" />
          <span>Pusat ITB</span>
        </button>

        <button
          type="button"
          onClick={handleFindNearest}
          disabled={isLocating}
          className="inline-flex items-center gap-2 rounded-full bg-teal-700 hover:bg-teal-800 active:scale-[0.98] disabled:opacity-75 px-4 py-3 text-sm font-semibold text-white shadow-xl shadow-teal-900/25 transition cursor-pointer"
        >
          {isLocating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Navigation className="h-4 w-4" />
          )}
          <span>
            {isLocating ? "Mencari Lokasi..." : "Cari Toilet Terdekat"}
          </span>
        </button>
      </div>

      {/* Minimalist Toilet Detail Card (Coordinates, Name, Condition Photos, Directions) */}
      {selectedToilet && (
        <div className="fixed bottom-3 left-3 right-3 sm:right-auto sm:bottom-5 sm:left-4 sm:w-[360px] max-h-[78dvh] overflow-y-auto z-[550] rounded-2xl bg-white shadow-2xl border border-slate-200 select-text">
          <div className="p-3.5 sm:p-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-slate-900 leading-snug">
                    {selectedToilet.name}
                  </h2>
                  {nearestToiletId === selectedToilet.id && (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                      Terdekat
                    </span>
                  )}
                </div>

                {/* Coordinates + Copy */}
                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="font-mono bg-slate-100 px-2 py-0.5 rounded-md">
                    {formatCoordinates(
                      selectedToilet.latitude,
                      selectedToilet.longitude
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyCoordinates(selectedToilet)}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-teal-700 hover:bg-teal-50 transition cursor-pointer"
                    title="Salin koordinat"
                  >
                    {copiedId === selectedToilet.id ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Salin</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => selectToilet(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                aria-label="Tutup detail toilet"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Condition Images */}
            <div className="mt-3">
              {activePhoto ? (
                <>
                  <div
                    className={`relative w-full ${
                      selectedPhotos.length > 1 ? "h-40" : "h-44"
                    } rounded-xl overflow-hidden bg-slate-100 border border-slate-200`}
                  >
                    <button
                      type="button"
                      onClick={() => setLightboxIndex(safePhotoIndex)}
                      className="group relative w-full h-full block cursor-zoom-in"
                      aria-label={`Perbesar foto ${safePhotoIndex + 1} ${selectedToilet.name}`}
                    >
                      <img
                        src={activePhoto.imagePath}
                        alt={`Kondisi ${selectedToilet.name} (${safePhotoIndex + 1}/${selectedPhotos.length})`}
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                      />
                      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-lg bg-slate-900/75 text-white px-2 py-1 text-[11px] font-medium backdrop-blur-xs">
                        <ZoomIn className="h-3 w-3" />
                        Perbesar
                      </span>
                    </button>

                    {selectedPhotos.length > 1 && (
                      <>
                        <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-slate-900/75 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-xs">
                          {safePhotoIndex + 1} / {selectedPhotos.length}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setActivePhotoIndex(
                              (safePhotoIndex - 1 + selectedPhotos.length) %
                                selectedPhotos.length
                            )
                          }
                          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-slate-900/65 hover:bg-slate-900/85 p-1.5 text-white shadow-sm transition cursor-pointer"
                          aria-label="Foto sebelumnya"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setActivePhotoIndex(
                              (safePhotoIndex + 1) % selectedPhotos.length
                            )
                          }
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-slate-900/65 hover:bg-slate-900/85 p-1.5 text-white shadow-sm transition cursor-pointer"
                          aria-label="Foto berikutnya"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>

                  {selectedPhotos.length > 1 && (
                    <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
                      {selectedPhotos.map((photo, idx) => (
                        <button
                          key={photo.id}
                          type="button"
                          onClick={() => setActivePhotoIndex(idx)}
                          className={`relative h-11 w-14 shrink-0 rounded-lg overflow-hidden border-2 transition cursor-pointer ${
                            idx === safePhotoIndex
                              ? "border-teal-600 ring-1 ring-teal-600/30"
                              : "border-slate-200 opacity-75 hover:opacity-100"
                          }`}
                          aria-label={`Lihat foto ${idx + 1}`}
                        >
                          <img
                            src={photo.imagePath}
                            alt={`${selectedToilet.name} thumbnail ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full h-32 rounded-xl bg-slate-100 border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 gap-1.5">
                  <ImageOff className="h-5 w-5" />
                  <span className="text-xs">Belum ada foto kondisi</span>
                </div>
              )}
            </div>

            {/* Distance & Walking Route Info */}
            {activeDistanceMeters !== null && (
              <div className="mt-2.5 flex items-center justify-between text-xs bg-sky-50 text-sky-900 rounded-xl px-3 py-2 border border-sky-100">
                <span className="font-semibold">
                  Jarak: {formatDistanceId(activeDistanceMeters)}
                  {activeDurationLabel ? ` (${activeDurationLabel})` : ""}
                </span>
                {activeRoute?.toiletId === selectedToilet.id &&
                  activeRoute.mode === "straight-line" && (
                    <span className="text-[11px] text-sky-700">
                      Garis lurus
                    </span>
                  )}
              </div>
            )}

            {/* Walking Route & Google Maps Actions */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleRouteToSelected(selectedToilet)}
                disabled={isRoutingToSelected}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-70 px-3 py-2 text-xs font-semibold text-white transition cursor-pointer"
              >
                {isRoutingToSelected ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Route className="h-3.5 w-3.5" />
                )}
                <span>Rute Jalan Kaki</span>
              </button>

              <a
                href={buildGoogleMapsWalkingUrl(
                  selectedToilet.latitude,
                  selectedToilet.longitude,
                  userLocation?.lat,
                  userLocation?.lng
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 border border-teal-200 px-3 py-2 text-xs font-semibold text-teal-800 transition"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Google Maps</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Condition Photo Lightbox */}
      {selectedToilet && lightboxPhoto && safeLightboxIndex !== null && (
        <div
          className="fixed inset-0 z-[1000] bg-slate-950/90 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <div
            className="relative max-w-3xl w-full flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between text-white">
              <div className="min-w-0 pr-4">
                <p className="text-sm font-semibold truncate">
                  {selectedToilet.name}
                </p>
                {selectedPhotos.length > 1 && (
                  <p className="text-xs text-slate-300">
                    Foto {safeLightboxIndex + 1} dari {selectedPhotos.length}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setLightboxIndex(null)}
                className="rounded-full bg-white/15 hover:bg-white/25 p-2 text-white cursor-pointer"
                aria-label="Tutup foto"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative w-full flex items-center justify-center">
              {selectedPhotos.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setLightboxIndex(
                      (safeLightboxIndex - 1 + selectedPhotos.length) %
                        selectedPhotos.length
                    )
                  }
                  className="absolute left-2 z-10 rounded-full bg-slate-900/75 hover:bg-slate-900 p-2 text-white border border-white/15 cursor-pointer"
                  aria-label="Foto sebelumnya"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}

              <img
                src={lightboxPhoto.imagePath}
                alt={`${selectedToilet.name} (${safeLightboxIndex + 1})`}
                className="max-h-[75dvh] w-auto rounded-xl object-contain shadow-2xl border border-white/10"
              />

              {selectedPhotos.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setLightboxIndex(
                      (safeLightboxIndex + 1) % selectedPhotos.length
                    )
                  }
                  className="absolute right-2 z-10 rounded-full bg-slate-900/75 hover:bg-slate-900 p-2 text-white border border-white/15 cursor-pointer"
                  aria-label="Foto berikutnya"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
            </div>

            {selectedPhotos.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto max-w-full py-1">
                {selectedPhotos.map((photo, idx) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => setLightboxIndex(idx)}
                    className={`h-12 w-16 shrink-0 rounded-lg overflow-hidden border-2 transition cursor-pointer ${
                      idx === safeLightboxIndex
                        ? "border-teal-400"
                        : "border-white/20 opacity-60 hover:opacity-100"
                    }`}
                    aria-label={`Pilih foto ${idx + 1}`}
                  >
                    <img
                      src={photo.imagePath}
                      alt={`${selectedToilet.name} preview ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
