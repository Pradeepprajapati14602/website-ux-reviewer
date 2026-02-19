import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing.");
}

const adapter = new PrismaPg({ connectionString });

export const prisma = globalThis.prismaGlobal ?? new PrismaClient({
  log: ["error"],
  adapter,
});

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}