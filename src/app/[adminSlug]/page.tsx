import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  getAdminPortalSlug,
  getEnvAdminEmails,
  getVerifiedAdminSession,
  isDevMockLoginEnabled,
} from "@/lib/auth";
import { TOILET_ADMIN_SELECT, serializeToilet } from "@/lib/toilets";
import AdminLoginCard from "@/components/AdminLoginCard";
import AdminDashboard from "@/components/AdminDashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Portal Pengelola — Peta Toilet ITB",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function HiddenAdminPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ adminSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { adminSlug } = await params;
  if (adminSlug !== getAdminPortalSlug()) {
    notFound();
  }

  const session = await getVerifiedAdminSession();
  if (!session) {
    const query = await searchParams;
    return (
      <AdminLoginCard
        errorCode={query.error ?? null}
        devMockEnabled={isDevMockLoginEnabled()}
      />
    );
  }

  const [toilets, dbAdmins] = await Promise.all([
    prisma.toilet.findMany({
      orderBy: [{ createdAt: "desc" }],
      select: TOILET_ADMIN_SELECT,
    }),
    prisma.admin.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        addedBy: true,
        createdAt: true,
      },
    }),
  ]);

  return (
    <AdminDashboard
      currentAdmin={session}
      initialToilets={toilets.map(serializeToilet)}
      initialEnvAdmins={getEnvAdminEmails()}
      initialDbAdmins={dbAdmins.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      }))}
    />
  );
}
