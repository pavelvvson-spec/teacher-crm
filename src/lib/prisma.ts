import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { isDemoRequest, demoDbConfigured } from "@/lib/demo-mode";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaDemo?: PrismaClient };

// Справжня база (дані Саші)
export const realPrisma =
  globalForPrisma.prisma || new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
globalForPrisma.prisma = realPrisma;

// Демо-база з вигаданими даними (лише якщо задано DATABASE_URL_DEMO)
export function getDemoPrisma(): PrismaClient | null {
  if (!demoDbConfigured()) return null;
  if (!globalForPrisma.prismaDemo) {
    globalForPrisma.prismaDemo = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_DEMO }),
    });
  }
  return globalForPrisma.prismaDemo;
}

// Яку базу використати для поточного запиту
async function currentClient(): Promise<PrismaClient> {
  if (demoDbConfigured() && (await isDemoRequest())) {
    return getDemoPrisma() ?? realPrisma;
  }
  return realPrisma;
}

const MODEL_KEYS = new Set(
  Object.values(Prisma.ModelName).map((n) => n.charAt(0).toLowerCase() + n.slice(1))
);

type AnyFn = (...args: unknown[]) => unknown;

function modelProxy(model: string) {
  return new Proxy(
    {},
    {
      get(_t, method) {
        return (...args: unknown[]) =>
          currentClient().then((c) => {
            const delegate = (c as unknown as Record<string, Record<string | symbol, AnyFn>>)[model];
            return delegate[method](...args);
          });
      },
    }
  );
}

// Звичайний `prisma`, яким користується весь код: сам обирає справжню або демо-базу
export const prisma = new Proxy(realPrisma, {
  get(target, prop, receiver) {
    if (typeof prop === "string" && MODEL_KEYS.has(prop)) return modelProxy(prop);
    if (prop === "$transaction") {
      return (arg: unknown, options?: unknown) =>
        currentClient().then((c) => {
          if (typeof arg !== "function") {
            throw new Error("Використовуйте $transaction(async (tx) => …)");
          }
          return (c.$transaction as unknown as AnyFn)(arg, options);
        });
    }
    return Reflect.get(target, prop, receiver);
  },
}) as PrismaClient;
