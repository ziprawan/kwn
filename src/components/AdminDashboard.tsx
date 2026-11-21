"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Crosshair,
  ImagePlus,
  Loader2,
  LogOut,
  MapPin,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  ITB_CENTER,
  LatLng,
  ToiletImageItem,
  ToiletPoint,
  formatCoordinates,
  isWithinItbPinBounds,
} from "@/lib/geo";
import { MAX_IMAGE_BYTES, MAX_IMAGES_PER_TOILET } from "@/lib/constants";
import { canRevokeDbAdmin } from "@/lib/admin-permissions";

const ItbToiletMap = dynamic(() => import("@/components/ItbToiletMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-500 text-sm">
      <Loader2 className="w-5 h-5 animate-spin mr-2 text-teal-700" />
      Memuat peta admin...
    </div>
  ),
});

export interface DbAdminItem {
  id: string;
  email: string;
  name: string | null;
  addedBy: string | null;
  createdAt: string;
}

interface DraftUploadItem {
  id: string;
  file: File;
  previewUrl: string;
}

interface AdminDashboardProps {
  currentAdmin: {
    email: string;
    name: string | null;
    source: "env" | "db";
  };
  initialToilets: ToiletPoint[];
  initialEnvAdmins: string[];
  initialDbAdmins: DbAdminItem[];
}

export default function AdminDashboard({
  currentAdmin,
  initialToilets,
  initialEnvAdmins,
  initialDbAdmins,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<"toilets" | "admins">("toilets");
  const [toilets, setToilets] = useState<ToiletPoint[]>(initialToilets);
  const [envAdmins] = useState<string[]>(initialEnvAdmins);
  const [dbAdmins, setDbAdmins] = useState<DbAdminItem[]>(initialDbAdmins);

  // Toilet form state
  const [editingToiletId, setEditingToiletId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [latInput, setLatInput] = useState(String(ITB_CENTER.lat));
  const [lngInput, setLngInput] = useState(String(ITB_CENTER.lng));
  const [draftFiles, setDraftFiles] = useState<DraftUploadItem[]>([]);
  const [existingImages, setExistingImages] = useState<ToiletImageItem[]>([]);
  const [confirmDeleteImageId, setConfirmDeleteImageId] = useState<string | null>(null);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);

  const [isSavingToilet, setIsSavingToilet] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isGettingGps, setIsGettingGps] = useState(false);
  const [toiletFeedback, setToiletFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [focusTarget, setFocusTarget] = useState<{
    lat: number;
    lng: number;
    seq: number;
  } | null>(null);

  // Admin management state
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminName, setNewAdminName] = useState("");
  const [isAddingAdmin, setIsAddingAdmin] = useState(false);
  const [deletingAdminId, setDeletingAdminId] = useState<string | null>(null);
  const [adminFeedback, setAdminFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const createdPreviewUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const urls = createdPreviewUrlsRef.current;
    return () => {
      for (const url of urls) {
        URL.revokeObjectURL(url);
      }
      urls.clear();
    };
  }, []);

  const draftPosition: LatLng | null = useMemo(() => {
    const lat = Number(latInput);
    const lng = Number(lngInput);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }, [latInput, lngInput]);

  const filteredToilets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return toilets;
    return toilets.filter((t) => t.name.toLowerCase().includes(q));
  }, [toilets, searchQuery]);

  const clearDraftFiles = () => {
    setDraftFiles((prev) => {
      for (const item of prev) {
        URL.revokeObjectURL(item.previewUrl);
        createdPreviewUrlsRef.current.delete(item.previewUrl);
      }
      return [];
    });
  };

  const resetToiletForm = () => {
    setEditingToiletId(null);
    setNameInput("");
    setLatInput(String(ITB_CENTER.lat));
    setLngInput(String(ITB_CENTER.lng));
    clearDraftFiles();
    setExistingImages([]);
    setConfirmDeleteImageId(null);
    setConfirmDeleteId(null);
  };

  const startEditingToilet = (toilet: ToiletPoint) => {
    setEditingToiletId(toilet.id);
    setNameInput(toilet.name);
    setLatInput(String(toilet.latitude));
    setLngInput(String(toilet.longitude));
    clearDraftFiles();
    setExistingImages(toilet.images ?? []);
    setConfirmDeleteImageId(null);
    setConfirmDeleteId(null);
    setToiletFeedback(null);
    setActiveTab("toilets");
    setFocusTarget((prev) => ({
      lat: toilet.latitude,
      lng: toilet.longitude,
      seq: (prev?.seq ?? 0) + 1,
    }));
  };

  const handleMapPinClick = (pos: LatLng) => {
    setLatInput(String(pos.lat));
    setLngInput(String(pos.lng));
  };

  const handleUseMyGps = () => {
    setToiletFeedback(null);
    if (!navigator.geolocation) {
      setToiletFeedback({
        type: "error",
        text: "Browser tidak mendukung layanan GPS.",
      });
      return;
    }

    setIsGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setLatInput(String(lat));
        setLngInput(String(lng));
        setFocusTarget((prev) => ({
          lat,
          lng,
          seq: (prev?.seq ?? 0) + 1,
        }));
        if (!isWithinItbPinBounds(lat, lng)) {
          setToiletFeedback({
            type: "error",
            text: "Lokasi GPS Anda saat ini terdeteksi di luar area ITB Ganesha. Klik peta ITB untuk menentukan titik toilet.",
          });
        }
        setIsGettingGps(false);
      },
      () => {
        setToiletFeedback({
          type: "error",
          text: "Gagal mengambil lokasi GPS. Pastikan izin lokasi diaktifkan.",
        });
        setIsGettingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleFilesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (incoming.length === 0) return;

    const remainingSlots =
      MAX_IMAGES_PER_TOILET - existingImages.length - draftFiles.length;
    if (remainingSlots <= 0) {
      setToiletFeedback({
        type: "error",
        text: `Maksimal ${MAX_IMAGES_PER_TOILET} foto per titik toilet.`,
      });
      return;
    }

    const oversizedNames: string[] = [];
    const validFiles: File[] = [];
    for (const file of incoming) {
      if (file.size <= 0) continue;
      if (file.size > MAX_IMAGE_BYTES) {
        oversizedNames.push(file.name);
        continue;
      }
      validFiles.push(file);
    }

    const acceptedFiles = validFiles.slice(0, remainingSlots);
    const exceededLimit = validFiles.length > remainingSlots;

    if (acceptedFiles.length > 0) {
      const nextItems: DraftUploadItem[] = acceptedFiles.map((file, idx) => {
        const previewUrl = URL.createObjectURL(file);
        createdPreviewUrlsRef.current.add(previewUrl);
        return {
          id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2)}`,
          file,
          previewUrl,
        };
      });
      setDraftFiles((prev) => [...prev, ...nextItems]);
    }

    if (oversizedNames.length > 0 || exceededLimit) {
      const reasons: string[] = [];
      if (oversizedNames.length > 0) {
        reasons.push(
          `Ukuran melebihi 5 MB: ${oversizedNames.slice(0, 3).join(", ")}${oversizedNames.length > 3 ? "..." : ""}`
        );
      }
      if (exceededLimit) {
        reasons.push(
          `Maksimal ${MAX_IMAGES_PER_TOILET} foto per titik toilet (sebagian file tidak ditambahkan)`
        );
      }
      setToiletFeedback({
        type: "error",
        text: `${reasons.join(". ")}.`,
      });
    } else {
      setToiletFeedback(null);
    }
  };

  const handleRemoveDraftFile = (draftId: string) => {
    setDraftFiles((prev) => {
      const target = prev.find((item) => item.id === draftId);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        createdPreviewUrlsRef.current.delete(target.previewUrl);
      }
      return prev.filter((item) => item.id !== draftId);
    });
  };

  const handleDeleteExistingImage = async (imageId: string) => {
    if (!editingToiletId) return;
    setDeletingImageId(imageId);
    setToiletFeedback(null);

    try {
      const res = await fetch(
        `/api/toilets/${editingToiletId}/images/${encodeURIComponent(imageId)}`,
        { method: "DELETE" }
      );
      const data = (await res.json()) as {
        ok?: boolean;
        toilet?: ToiletPoint;
        error?: string;
      };

      if (!res.ok || !data.toilet) {
        setToiletFeedback({
          type: "error",
          text: data.error || "Gagal menghapus foto toilet.",
        });
        return;
      }

      const updated = data.toilet;
      setToilets((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
      setExistingImages(updated.images ?? []);
      setConfirmDeleteImageId(null);
      setToiletFeedback({
        type: "success",
        text: "Foto kondisi berhasil dihapus.",
      });
    } catch {
      setToiletFeedback({
        type: "error",
        text: "Terjadi gangguan jaringan saat menghapus foto.",
      });
    } finally {
      setDeletingImageId(null);
    }
  };

  const handleSaveToilet = async (event: React.FormEvent) => {
    event.preventDefault();
    setToiletFeedback(null);

    const trimmedName = nameInput.trim();
    const lat = Number(latInput);
    const lng = Number(lngInput);

    if (!trimmedName) {
      setToiletFeedback({
        type: "error",
        text: "Nama lokasi toilet wajib diisi.",
      });
      return;
    }

    if (!isWithinItbPinBounds(lat, lng)) {
      setToiletFeedback({
        type: "error",
        text: "Koordinat harus berada di dalam area ITB Kampus Ganesha, Bandung.",
      });
      return;
    }

    if (existingImages.length + draftFiles.length > MAX_IMAGES_PER_TOILET) {
      setToiletFeedback({
        type: "error",
        text: `Maksimal ${MAX_IMAGES_PER_TOILET} foto per titik toilet.`,
      });
      return;
    }

    const formData = new FormData();
    formData.append("name", trimmedName);
    formData.append("latitude", String(lat));
    formData.append("longitude", String(lng));
    for (const item of draftFiles) {
      formData.append("images", item.file);
    }

    setIsSavingToilet(true);
    try {
      const endpoint = editingToiletId
        ? `/api/toilets/${editingToiletId}`
        : "/api/toilets";
      const method = editingToiletId ? "PATCH" : "POST";

      const res = await fetch(endpoint, { method, body: formData });
      const data = (await res.json()) as {
        toilet?: ToiletPoint;
        error?: string;
      };

      if (!res.ok || !data.toilet) {
        setToiletFeedback({
          type: "error",
          text: data.error || "Gagal menyimpan data toilet.",
        });
        return;
      }

      const saved = data.toilet;
      if (editingToiletId) {
        setToilets((prev) =>
          prev.map((item) => (item.id === saved.id ? saved : item))
        );
        setNameInput(saved.name);
        setLatInput(String(saved.latitude));
        setLngInput(String(saved.longitude));
        setExistingImages(saved.images ?? []);
        clearDraftFiles();
        setConfirmDeleteImageId(null);
        setConfirmDeleteId(null);
        setToiletFeedback({
          type: "success",
          text: `Titik "${saved.name}" berhasil diperbarui.`,
        });
      } else {
        setToilets((prev) => [saved, ...prev]);
        resetToiletForm();
        setToiletFeedback({
          type: "success",
          text: `Titik "${saved.name}" berhasil ditambahkan ke peta.`,
        });
        setFocusTarget((prev) => ({
          lat: saved.latitude,
          lng: saved.longitude,
          seq: (prev?.seq ?? 0) + 1,
        }));
      }
    } catch {
      setToiletFeedback({
        type: "error",
        text: "Terjadi gangguan jaringan saat menyimpan data.",
      });
    } finally {
      setIsSavingToilet(false);
    }
  };

  const handleDeleteToilet = async (id: string) => {
    setIsDeletingId(id);
    setToiletFeedback(null);
    try {
      const res = await fetch(`/api/toilets/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setToiletFeedback({
          type: "error",
          text: data.error || "Gagal menghapus titik toilet.",
        });
        return;
      }

      setToilets((prev) => prev.filter((item) => item.id !== id));
      if (editingToiletId === id) {
        resetToiletForm();
      }
      setConfirmDeleteId(null);
      setToiletFeedback({
        type: "success",
        text: "Titik toilet berhasil dihapus.",
      });
    } catch {
      setToiletFeedback({
        type: "error",
        text: "Gagal terhubung ke server saat menghapus titik.",
      });
    } finally {
      setIsDeletingId(null);
    }
  };

  const handleAddAdmin = async (event: React.FormEvent) => {
    event.preventDefault();
    setAdminFeedback(null);
    const trimmedEmail = newAdminEmail.trim().toLowerCase();
    if (!trimmedEmail) {
      setAdminFeedback({
        type: "error",
        text: "Masukkan alamat email Google admin baru.",
      });
      return;
    }

    setIsAddingAdmin(true);
    try {
      const res = await fetch("/api/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          name: newAdminName.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        admin?: DbAdminItem;
        error?: string;
      };
      if (!res.ok || !data.admin) {
        setAdminFeedback({
          type: "error",
          text: data.error || "Gagal menambahkan admin baru.",
        });
        return;
      }

      setDbAdmins((prev) => [data.admin!, ...prev]);
      setNewAdminEmail("");
      setNewAdminName("");
      setAdminFeedback({
        type: "success",
        text: `${data.admin.email} sekarang dapat login melalui halaman ini dengan Google.`,
      });
    } catch {
      setAdminFeedback({
        type: "error",
        text: "Terjadi gangguan jaringan saat menambah admin.",
      });
    } finally {
      setIsAddingAdmin(false);
    }
  };

  const handleDeleteAdmin = async (admin: DbAdminItem) => {
    setDeletingAdminId(admin.id);
    setAdminFeedback(null);
    try {
      const res = await fetch(`/api/admins/${admin.id}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setAdminFeedback({
          type: "error",
          text: data.error || "Gagal menghapus admin.",
        });
        return;
      }
      setDbAdmins((prev) => prev.filter((item) => item.id !== admin.id));
      setAdminFeedback({
        type: "success",
        text: `Akses admin untuk ${admin.email} telah dicabut.`,
      });
    } catch {
      setAdminFeedback({
        type: "error",
        text: "Gagal terhubung ke server.",
      });
    } finally {
      setDeletingAdminId(null);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  };

  const totalPhotoCount = existingImages.length + draftFiles.length;
  const isAtPhotoLimit = totalPhotoCount >= MAX_IMAGES_PER_TOILET;

  return (
    <div className="min-h-dvh flex flex-col bg-slate-100">
      {/* Admin Top Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-teal-700 text-white flex items-center justify-center shrink-0">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-bold text-slate-900">
              Admin Peta Toilet ITB
            </h1>
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <span>{currentAdmin.email}</span>
              <span className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-800 border border-teal-200">
                {currentAdmin.source === "env" ? "Super Admin" : "Admin"}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("toilets")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                activeTab === "toilets"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              <span>Titik Toilet ({toilets.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("admins")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                activeTab === "admins"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>Kelola Admin</span>
            </button>
          </div>

          <Link
            href="/"
            className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition"
          >
            Lihat Peta Publik
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 px-3 py-2 text-xs font-semibold text-white transition cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Keluar</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      {activeTab === "toilets" ? (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0">
          {/* Interactive Pinpoint Map */}
          <div className="lg:col-span-7 xl:col-span-8 h-[42vh] sm:h-[50vh] lg:h-[calc(100dvh-65px)] relative border-b lg:border-b-0 lg:border-r border-slate-200">
            <ItbToiletMap
              toilets={toilets}
              selectedToiletId={editingToiletId}
              onSelectToilet={startEditingToilet}
              focusTarget={focusTarget}
              adminPinMode={true}
              adminDraftPosition={draftPosition}
              onAdminMapClick={handleMapPinClick}
            />
            <div className="pointer-events-none absolute top-3 left-3 z-[450] rounded-xl bg-white/95 backdrop-blur-xs px-3 py-2 shadow-md border border-slate-200 text-xs text-slate-700 max-w-xs">
              Klik peta atau geser pin merah <strong className="text-rose-600">PIN BARU</strong> untuk menentukan koordinat, atau klik pin hijau untuk mengedit.
            </div>
          </div>

          {/* Sidebar Form & List */}
          <div className="lg:col-span-5 xl:col-span-4 lg:h-[calc(100dvh-65px)] overflow-y-auto p-4 space-y-5 bg-white">
            {/* Add / Edit Form */}
            <form onSubmit={handleSaveToilet} className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  {editingToiletId ? (
                    <>
                      <Pencil className="h-4 w-4 text-teal-700" />
                      <span>Edit Titik Toilet</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 text-teal-700" />
                      <span>Tambah Titik Toilet Baru</span>
                    </>
                  )}
                </h2>
                {editingToiletId && (
                  <button
                    type="button"
                    onClick={resetToiletForm}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Batal / Tambah Baru
                  </button>
                )}
              </div>

              {toiletFeedback && (
                <div
                  className={`flex items-start gap-2 rounded-xl p-3 text-xs border ${
                    toiletFeedback.type === "success"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                      : "bg-rose-50 border-rose-200 text-rose-800"
                  }`}
                >
                  {toiletFeedback.type === "success" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <p>{toiletFeedback.text}</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Lokasi Toilet
                </label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Contoh: Toilet Labtek V Lantai 1"
                  maxLength={120}
                  required
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Koordinat (Klik Peta / GPS)
                  </label>
                  <button
                    type="button"
                    onClick={handleUseMyGps}
                    disabled={isGettingGps}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800 disabled:opacity-60 cursor-pointer"
                  >
                    {isGettingGps ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Crosshair className="h-3.5 w-3.5" />
                    )}
                    <span>Gunakan GPS Saya</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="block text-[10px] text-slate-500 mb-0.5">
                      Latitude
                    </span>
                    <input
                      type="number"
                      step="any"
                      value={latInput}
                      onChange={(e) => setLatInput(e.target.value)}
                      required
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-500 mb-0.5">
                      Longitude
                    </span>
                    <input
                      type="number"
                      step="any"
                      value={lngInput}
                      onChange={(e) => setLngInput(e.target.value)}
                      required
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Foto Kondisi Terkini (maks. {MAX_IMAGES_PER_TOILET} foto)
                  </label>
                  <span className="text-[11px] font-medium text-slate-500">
                    {totalPhotoCount}/{MAX_IMAGES_PER_TOILET}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mb-2">
                  JPG / PNG / WebP, maks. 5 MB per foto. Semua admin dapat menghapus foto.
                </p>

                {editingToiletId && existingImages.length > 0 && (
                  <div className="mb-2.5">
                    <p className="text-[11px] font-semibold text-slate-600 mb-1.5">
                      Foto Tersimpan ({existingImages.length})
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {existingImages.map((img, index) => (
                        <div
                          key={img.id}
                          className="relative h-28 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 group"
                          title={
                            img.uploadedByEmail
                              ? `Diunggah oleh ${img.uploadedByEmail}`
                              : `Foto ${index + 1}`
                          }
                        >
                          <img
                            src={img.imagePath}
                            alt={`Foto kondisi tersimpan ${index + 1}`}
                            className="w-full h-full object-cover"
                          />

                          {confirmDeleteImageId === img.id ? (
                            <div className="absolute inset-0 bg-slate-950/75 flex flex-col items-center justify-center gap-1.5 p-2 text-center">
                              <span className="text-[11px] font-semibold text-white">
                                Hapus foto ini?
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteExistingImage(img.id)}
                                  disabled={deletingImageId === img.id}
                                  className="inline-flex items-center gap-1 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-60 px-2.5 py-1 text-[11px] font-semibold text-white cursor-pointer"
                                >
                                  {deletingImageId === img.id && (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  )}
                                  <span>Ya</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteImageId(null)}
                                  disabled={deletingImageId === img.id}
                                  className="rounded-lg bg-white/90 hover:bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800 cursor-pointer"
                                >
                                  Batal
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteImageId(img.id)}
                              className="absolute top-1.5 right-1.5 rounded-lg bg-slate-900/75 hover:bg-rose-600 text-white p-1.5 shadow-xs transition cursor-pointer"
                              aria-label={`Hapus foto ${index + 1}`}
                              title="Hapus foto"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {img.uploadedByEmail && (
                            <span className="absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[10px] text-white/95">
                              {img.uploadedByEmail}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {draftFiles.length > 0 && (
                  <div className="mb-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[11px] font-semibold text-teal-800">
                        Siap Diunggah ({draftFiles.length})
                      </p>
                      <button
                        type="button"
                        onClick={clearDraftFiles}
                        className="text-[11px] font-medium text-slate-500 hover:text-rose-700 cursor-pointer"
                      >
                        Hapus antrean
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {draftFiles.map((item) => (
                        <div
                          key={item.id}
                          className="relative h-28 rounded-xl overflow-hidden border border-teal-200 bg-teal-50/40"
                        >
                          <img
                            src={item.previewUrl}
                            alt={item.file.name}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveDraftFile(item.id)}
                            className="absolute top-1.5 right-1.5 rounded-lg bg-slate-900/75 hover:bg-slate-900 text-white p-1 transition cursor-pointer"
                            aria-label={`Batalkan ${item.file.name}`}
                            title="Hapus dari antrean"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                          <span className="absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[10px] text-white">
                            {item.file.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <label
                  className={`flex items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-3 text-xs font-semibold transition ${
                    isAtPhotoLimit
                      ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                      : "border-slate-300 hover:border-teal-600 bg-slate-50 hover:bg-teal-50/40 text-slate-700 cursor-pointer"
                  }`}
                >
                  <ImagePlus className="h-4 w-4 text-teal-700" />
                  <span>
                    {isAtPhotoLimit
                      ? `Batas maksimal ${MAX_IMAGES_PER_TOILET} foto tercapai`
                      : totalPhotoCount > 0
                        ? "Tambah Foto Lagi (Bisa Pilih > 1)"
                        : "Pilih / Ambil Foto Kondisi (Bisa > 1)"}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    disabled={isAtPhotoLimit}
                    onChange={handleFilesChange}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={isSavingToilet}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-70 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition cursor-pointer"
                >
                  {isSavingToilet && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  <span>
                    {editingToiletId ? "Simpan Perubahan" : "Simpan Titik Toilet"}
                  </span>
                </button>

                {editingToiletId && (
                  confirmDeleteId === editingToiletId ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteToilet(editingToiletId)}
                      disabled={isDeletingId === editingToiletId}
                      className="inline-flex items-center gap-1 rounded-xl bg-rose-600 hover:bg-rose-700 px-3 py-2.5 text-xs font-semibold text-white cursor-pointer"
                    >
                      {isDeletingId === editingToiletId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      <span>Konfirmasi Hapus</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(editingToiletId)}
                      className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 px-3 py-2.5 text-xs font-semibold text-rose-700 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Hapus</span>
                    </button>
                  )
                )}
              </div>
            </form>

            {/* Existing Toilets List */}
            <div className="border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Daftar Titik Tersimpan ({toilets.length})
                </h3>
              </div>

              <div className="relative mb-2.5">
                <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama toilet..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:border-teal-600 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                {filteredToilets.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">
                    Belum ada titik toilet. Klik peta di sebelah kiri untuk
                    menambah titik pertama.
                  </p>
                ) : (
                  filteredToilets.map((t) => {
                    const photoCount = t.images?.length ?? (t.imagePath ? 1 : 0);
                    const coverUrl = t.images?.[0]?.imagePath ?? t.imagePath;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => startEditingToilet(t)}
                        className={`w-full text-left rounded-xl border p-2.5 flex items-center gap-3 transition cursor-pointer ${
                          editingToiletId === t.id
                            ? "border-teal-600 bg-teal-50/70"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {coverUrl ? (
                          <div className="relative h-11 w-14 shrink-0">
                            <img
                              src={coverUrl}
                              alt={t.name}
                              className="h-full w-full rounded-lg object-cover bg-slate-100 border border-slate-200"
                            />
                            {photoCount > 1 && (
                              <span className="absolute bottom-0.5 right-0.5 rounded bg-slate-900/80 px-1 py-0.5 leading-none text-[9px] font-bold text-white">
                                +{photoCount - 1}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="h-11 w-14 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0 text-[10px]">
                            No Foto
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 truncate">
                            {t.name}
                          </p>
                          <p className="text-[11px] font-mono text-slate-500">
                            {formatCoordinates(t.latitude, t.longitude)}
                            {photoCount > 0 ? ` • ${photoCount} foto` : ""}
                          </p>
                        </div>
                        <Pencil className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Admin Management Tab */
        <div className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 space-y-6">
          <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-teal-700" />
              <span>Tambah Admin Baru</span>
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Tambahkan alamat email Google rekan Anda agar mereka dapat login
              melalui halaman tersembunyi ini dan ikut menandai toilet.
            </p>

            {adminFeedback && (
              <div
                className={`mt-3 flex items-start gap-2 rounded-xl p-3 text-xs border ${
                  adminFeedback.type === "success"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                    : "bg-rose-50 border-rose-200 text-rose-800"
                }`}
              >
                {adminFeedback.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <p>{adminFeedback.text}</p>
              </div>
            )}

            <form
              onSubmit={handleAddAdmin}
              className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-2.5"
            >
              <input
                type="email"
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                placeholder="email.rekan@gmail.com"
                required
                className="sm:col-span-6 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              />
              <input
                type="text"
                value={newAdminName}
                onChange={(e) => setNewAdminName(e.target.value)}
                placeholder="Nama / catatan (opsional)"
                maxLength={80}
                className="sm:col-span-4 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isAddingAdmin}
                className="sm:col-span-2 inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-70 px-3 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                {isAddingAdmin ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                <span>Tambah</span>
              </button>
            </form>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-teal-700" />
                <span>Super Admin (Konfigurasi .env)</span>
              </h3>
              <div className="mt-2 divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {envAdmins.length === 0 ? (
                  <p className="p-3 text-xs text-slate-500">
                    Tidak ada email di ADMIN_EMAILS.
                  </p>
                ) : (
                  envAdmins.map((email) => (
                    <div
                      key={email}
                      className="px-3.5 py-2.5 flex items-center justify-between bg-slate-50/70"
                    >
                      <span className="text-xs font-semibold text-slate-800">
                        {email}
                      </span>
                      <span className="rounded-full bg-teal-100 text-teal-800 px-2 py-0.5 text-[10px] font-bold">
                        Utama
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Admin Tambahan ({dbAdmins.length})
              </h3>
              <div className="mt-2 divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {dbAdmins.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500 text-center">
                    Belum ada admin tambahan yang didaftarkan.
                  </p>
                ) : (
                  dbAdmins.map((admin) => {
                    const isSelf = admin.email === currentAdmin.email;
                    const canRevoke = canRevokeDbAdmin({
                      actorEmail: currentAdmin.email,
                      actorSource: currentAdmin.source,
                      targetEmail: admin.email,
                      targetAddedBy: admin.addedBy,
                    });

                    return (
                      <div
                        key={admin.id}
                        className="px-3.5 py-3 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">
                            {admin.email}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {admin.name ? `${admin.name} • ` : ""}
                            Ditambahkan oleh {admin.addedBy || "-"}
                          </p>
                        </div>

                        {canRevoke ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteAdmin(admin)}
                            disabled={deletingAdminId === admin.id}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 disabled:opacity-40 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 cursor-pointer shrink-0"
                          >
                            {deletingAdminId === admin.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                            <span>Cabut Akses</span>
                          </button>
                        ) : (
                          <span className="rounded-full bg-slate-100 text-slate-600 px-2.5 py-1 text-[10px] font-semibold shrink-0">
                            {isSelf
                              ? "Akun Anda"
                              : "Ditambahkan admin lain"}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
