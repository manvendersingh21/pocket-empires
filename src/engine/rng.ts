/** Deterministic 32-bit FNV-1a string hash. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Seeded Mulberry32 PRNG returning floats in [0, 1). */
export function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

export function todayDateKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Epoch: 2026-08-01 = Siege #1 so Nov 2026 dates read like an established daily chronicle. */
export function puzzleNumberForDate(dateKey: string): number {
  const epoch = Date.UTC(2026, 7, 1);
  const parts = dateKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return 1;
  const target = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  const diffDays = Math.floor((target - epoch) / 86_400_000);
  return Math.max(1, diffDays + 1);
}
