import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Initialize default project name
  await prisma.systemSetting.upsert({
    where: { key: "projectName" },
    update: {},
    create: { key: "projectName", value: "inSona商照系统" },
  });

  console.log("Seed data initialized.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
