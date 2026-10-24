import { PrismaClient } from "@prisma/client";
import { loadSampleData, seed } from "./seed-lib";

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing ${name}. Set it in your environment (see .env.example) before seeding.`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const demoPassword = required("SEED_DEMO_PASSWORD");
  const adminEmail = required("ADMIN_EMAIL");
  const adminPassword = required("ADMIN_PASSWORD");
  for (const [k, v] of [["SEED_DEMO_PASSWORD", demoPassword], ["ADMIN_PASSWORD", adminPassword]] as const) {
    if (v.length < 8) {
      console.error(`${k} must be at least 8 characters.`);
      process.exit(1);
    }
  }

  const prisma = new PrismaClient();
  try {
    const data = loadSampleData();
    const result = await seed(prisma, data, {
      demoPassword,
      admin: { email: adminEmail, password: adminPassword, name: process.env.ADMIN_NAME?.trim() || "BookLeaf Ops" },
      resetPasswords: process.env.SEED_RESET_PASSWORDS === "true",
    });
    console.log(`Seed complete: ${result.authors} authors, ${result.books} books, admin ${adminEmail}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Seed failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
