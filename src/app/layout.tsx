import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Peta Toilet ITB — Kampus Ganesha",
  description:
    "Peta interaktif lokasi toilet di ITB Kampus Ganesha Bandung lengkap dengan koordinat, foto kondisi terkini, dan rute jalan kaki terdekat.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="font-sans antialiased text-slate-900 bg-slate-50">
        {children}
      </body>
    </html>
  );
}
