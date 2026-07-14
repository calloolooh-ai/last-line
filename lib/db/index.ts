import { PrismaClient } from "@prisma/client";

/**
 * Standard Prisma singleton. Guards against Next.js dev hot-reload spawning a
 * new client (and a new connection pool) on every edit.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
