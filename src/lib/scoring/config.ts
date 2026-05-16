import { prisma } from "@/lib/db/client";

export async function getScoringConfig() {
  return prisma.scoringConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}
