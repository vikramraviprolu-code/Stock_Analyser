import { promises as fs } from "fs";
import path from "path";

const CACHE_ROOT = path.join(process.cwd(), ".cache", "stock-analyser");

function safeName(value: string): string {
  return value.replace(/[^a-z0-9_.-]/gi, "_").toLowerCase();
}

async function ensureCacheDir(namespace: string): Promise<string> {
  const directory = path.join(CACHE_ROOT, safeName(namespace));
  await fs.mkdir(directory, { recursive: true });
  return directory;
}

export async function getCached<T>(
  namespace: string,
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  forceRefresh = false
): Promise<{ value: T; cache: "hit" | "miss" | "refresh" }> {
  const directory = await ensureCacheDir(namespace);
  const file = path.join(directory, `${safeName(key)}.json`);

  if (!forceRefresh) {
    try {
      const raw = await fs.readFile(file, "utf8");
      const parsed = JSON.parse(raw) as { savedAt: number; value: T };
      if (Date.now() - parsed.savedAt <= ttlMs) {
        return { value: parsed.value, cache: "hit" };
      }
    } catch {
      // Missing or invalid cache entries are normal and should fall through.
    }
  }

  const value = await loader();
  await fs.writeFile(file, JSON.stringify({ savedAt: Date.now(), value }, null, 2), "utf8");
  return { value, cache: forceRefresh ? "refresh" : "miss" };
}

export const CACHE_TTL = {
  historyDaily: 24 * 60 * 60 * 1000,
  fundamentals24h: 24 * 60 * 60 * 1000,
  peersWeekly: 7 * 24 * 60 * 60 * 1000,
  metadataMonthly: 30 * 24 * 60 * 60 * 1000,
  fxDaily: 24 * 60 * 60 * 1000
};
