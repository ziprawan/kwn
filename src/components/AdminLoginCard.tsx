"use client";

import { useState } from "react";
import { AlertCircle, Loader2, Lock, ShieldCheck } from "lucide-react";

interface AdminLoginCardProps {
  errorCode: string | null;
  devMockEnabled: boolean;
}

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized:
    "Akun Google Anda belum terdaftar sebagai admin. Minta admin utama menambahkan email Anda terlebih dahulu.",
  oauth_not_configured:
    "Google OAuth belum dikonfigurasi di server (.env GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET kosong).",
  cancelled: "Proses login Google dibatalkan.",
  invalid_state:
    "Sesi OAuth kedaluwarsa atau tidak valid. Silakan coba masuk lagi.",
  oauth_exchange_failed: "Gagal memverifikasi token login dengan Google.",
  oauth_failed: "Terjadi kesalahan saat memproses login Google.",
};

export default function AdminLoginCard({
  errorCode,
  devMockEnabled,
}: AdminLoginCardProps) {
  const [isDevLoggingIn, setIsDevLoggingIn] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);

  const errorMessage = errorCode
    ? ERROR_MESSAGES[errorCode] ?? "Gagal masuk ke portal admin."
    : null;

  const handleDevLogin = async () => {
    setDevError(null);
    setIsDevLoggingIn(true);
    try {
      const res = await fetch("/api/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setDevError(data.error || "Gagal masuk mode dev.");
        return;
      }
      window.location.reload();
    } catch {
      setDevError("Gagal terhubung ke server.");
    } finally {
      setIsDevLoggingIn(false);
    }
  };

  return (
    <div className="min-h-dvh w-full bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-teal-700 text-white flex items-center justify-center shadow-sm shrink-0">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              Portal Pengelola Peta Toilet ITB
            </h1>
            <p className="text-xs text-slate-500">
              Khusus admin terdaftar • Kampus Ganesha
            </p>
          </div>
        </div>

        <p className="mt-5 text-sm text-slate-600 leading-relaxed">
          Masuk menggunakan akun Google yang telah diizinkan untuk menandai
          koordinat toilet, mengunggah foto kondisi terkini, serta mengelola
          daftar admin.
        </p>

        {(errorMessage || devError) && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{devError || errorMessage}</p>
          </div>
        )}

        {/* Full navigation required so Next.js Link does not prefetch an external OAuth redirect */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/auth/google"
          className="mt-6 w-full inline-flex items-center justify-center gap-3 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.99] px-4 py-3 text-sm font-semibold text-white shadow-md transition"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.6 12 2.6 6.8 2.6 2.6 6.8 2.6 12s4.2 9.4 9.4 9.4c5.4 0 9-3.8 9-9.1 0-.6-.1-1.1-.2-1.6H12z"
            />
          </svg>
          <span>Masuk dengan Google</span>
        </a>

        {devMockEnabled && (
          <div className="mt-5 rounded-xl bg-amber-50 border border-amber-200 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
              <ShieldCheck className="h-4 w-4 text-amber-700" />
              <span>Mode Development Aktif (DEV_MOCK_LOGIN)</span>
            </div>
            <p className="mt-1 text-[11px] text-amber-800 leading-relaxed">
              Tombol ini hanya muncul saat <code>NODE_ENV=development</code>{" "}
              untuk preview lokal sebelum Google OAuth diisi.
            </p>
            <button
              type="button"
              onClick={handleDevLogin}
              disabled={isDevLoggingIn}
              className="mt-2.5 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-70 px-3 py-2 text-xs font-semibold text-white transition cursor-pointer"
            >
              {isDevLoggingIn && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Masuk sebagai Dev Super-Admin</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
