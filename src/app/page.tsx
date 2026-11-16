import { prisma } from "@/lib/prisma";
import PublicMapShell from "@/components/PublicMapShell";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const toilets = await prisma.toilet.findMany({
    orderBy: [{ name: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      imagePath: true,
      updatedAt: true,
    },
  });

  const serialized = toilets.map((t) => ({
    ...t,
    updatedAt: t.updatedAt.toISOString(),
  }));

  return <PublicMapShell initialToilets={serialized} />;
}
