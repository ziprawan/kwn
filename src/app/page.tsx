import { prisma } from "@/lib/prisma";
import { TOILET_PUBLIC_SELECT, serializeToilet } from "@/lib/toilets";
import PublicMapShell from "@/components/PublicMapShell";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const toilets = await prisma.toilet.findMany({
    orderBy: [{ name: "asc" }, { createdAt: "desc" }],
    select: TOILET_PUBLIC_SELECT,
  });

  const serialized = toilets.map(serializeToilet);

  return <PublicMapShell initialToilets={serialized} />;
}
