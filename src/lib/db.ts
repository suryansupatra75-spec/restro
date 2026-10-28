import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  sqliteWalInitialized: boolean | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

if (
  process.env.NEXT_RUNTIME !== 'edge' &&
  typeof window === 'undefined' &&
  !globalForPrisma.sqliteWalInitialized
) {
  globalForPrisma.sqliteWalInitialized = true;
  try {
    prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;').catch(() => {});
    prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL;').catch(() => {});
    prisma.$queryRawUnsafe('PRAGMA busy_timeout = 30000;').catch(() => {});
    prisma.$queryRawUnsafe('PRAGMA cache_size = -64000;').catch(() => {}); // 64MB RAM page cache
    prisma.$queryRawUnsafe('PRAGMA mmap_size = 268435456;').catch(() => {}); // 256MB memory-mapped I/O
    prisma.$queryRawUnsafe('PRAGMA temp_store = MEMORY;').catch(() => {}); // Store temporary tables & indexes in RAM
  } catch {
    // Ignore if invoked in an environment without native engine support
  }
}

