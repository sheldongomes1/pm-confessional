import { createHash } from "node:crypto";
import { embedText, type EmbeddingTaskType } from "@workspace/integrations-gemini-direct";

type CacheEntry = { vec: number[]; expiresAt: number };

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;

const cache = new Map<string, CacheEntry>();

function normalize(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function keyFor(query: string, taskType: EmbeddingTaskType): string {
  const norm = normalize(query);
  return createHash("sha256").update(`${taskType}:${norm}`).digest("hex");
}

/**
 * Embed a query with an in-memory LRU cache. Repeat queries skip the
 * Gemini network call entirely. Map preserves insertion order, so to
 * implement LRU we delete + re-set on hit.
 *
 * Returns { vec, hit } so callers can record cache_hit in their timing
 * headers.
 */
export async function embedQueryCached(
  query: string,
  taskType: EmbeddingTaskType = "RETRIEVAL_QUERY",
): Promise<{ vec: number[]; hit: boolean }> {
  const key = keyFor(query, taskType);
  const now = Date.now();

  const existing = cache.get(key);
  if (existing && existing.expiresAt > now) {
    // LRU bump: re-insert at end.
    cache.delete(key);
    cache.set(key, existing);
    return { vec: existing.vec, hit: true };
  }
  if (existing) cache.delete(key);

  const vec = await embedText(query, taskType);
  cache.set(key, { vec, expiresAt: now + TTL_MS });

  // Evict oldest entries when over capacity.
  while (cache.size > MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }

  return { vec, hit: false };
}

export function clearEmbeddingCache(): void {
  cache.clear();
}
