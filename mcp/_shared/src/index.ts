/**
 * Shared helpers for AuditSentry MCP servers. Zero runtime dependencies so every
 * server stays trivially buildable and offline-friendly.
 */

/** True when the user asked for offline mode (no network calls). */
export function isOffline(): boolean {
  return process.env.RUGPROOF_OFFLINE === "1";
}

/** Wrap an MCP tool result as the standard text-content envelope. */
export function textResult(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}

/**
 * Uniform stub envelope so callers (and the test suite) can detect mock data the
 * same way across every server.
 */
export function stub(reason: string, data: Record<string, unknown> = {}) {
  return textResult({ stub: true, reason, ...data });
}

export interface FetchOpts {
  headers?: Record<string, string>;
  method?: string;
  body?: string;
  /** Total attempts before giving up (default 3). */
  retries?: number;
  /** Base backoff in ms; doubles each retry (default 400). */
  backoffMs?: number;
  /** Per-request timeout in ms (default 15000). */
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch() JSON with retry + exponential backoff. Retries on network errors and
 * on 429 / 5xx (honouring Retry-After when present). Returns parsed JSON or
 * throws after the final attempt.
 */
export async function fetchJSON(url: string, opts: FetchOpts = {}): Promise<any> {
  const retries = opts.retries ?? 3;
  const backoffMs = opts.backoffMs ?? 400;
  const timeoutMs = opts.timeoutMs ?? 15000;
  let lastErr: unknown;

  for (let attempt = 0; attempt < retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: opts.method,
        headers: opts.headers,
        body: opts.body,
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : backoffMs * 2 ** attempt;
        if (attempt < retries - 1) { await sleep(wait); continue; }
        throw new Error(`HTTP ${res.status} after ${retries} attempts`);
      }
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries - 1) { await sleep(backoffMs * 2 ** attempt); continue; }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Is a binary on PATH? Used by runner servers to decide real-vs-stub. */
export async function hasBinary(bin: string): Promise<boolean> {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve) => {
    const probe = spawn(process.platform === "win32" ? "where" : "which", [bin]);
    probe.on("error", () => resolve(false));
    probe.on("close", (code) => resolve(code === 0));
  });
}

/**
 * Reject obviously-dangerous argument values before they reach spawn(). We use
 * array-arg spawn (no shell) so classic shell injection isn't possible, but a
 * NUL or newline in a path/flag indicates tampering or a malformed request —
 * fail loudly rather than pass it through. Returns the value or throws.
 */
export function assertSafeArg(value: string, label = "argument"): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  if (value.includes("\0")) throw new Error(`${label} contains a NUL byte`);
  if (/[\r\n]/.test(value)) throw new Error(`${label} contains a newline`);
  if (value.length > 4096) throw new Error(`${label} exceeds 4096 chars`);
  return value;
}

// ---- content-hash file cache (for incremental analysis) -----------------
import { createHash } from "node:crypto";

/** Stable key from arbitrary inputs (e.g. tool + source bytes). */
export function hashKey(...parts: string[]): string {
  const h = createHash("sha256");
  for (const p of parts) h.update(p).update("\0");
  return h.digest("hex").slice(0, 32);
}

async function cacheFile(key: string): Promise<string> {
  const { resolve } = await import("node:path");
  const { homedir } = await import("node:os");
  return resolve(homedir(), ".cache", "auditsentry", `${key}.json`);
}

/** Read a cached value if present and within TTL (ms); else null. */
export async function readCache<T = unknown>(key: string, ttlMs: number): Promise<T | null> {
  if (isOffline() && process.env.RUGPROOF_PRIVACY === "1") return null; // privacy: tmpfs-only handled by caller
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = JSON.parse(await readFile(await cacheFile(key), "utf-8"));
    if (typeof raw.ts === "number" && Date.now() - raw.ts < ttlMs) return raw.value as T;
  } catch { /* miss */ }
  return null;
}

/** Write a value to the content cache. Best-effort (never throws). */
export async function writeCache(key: string, value: unknown): Promise<void> {
  try {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    const file = await cacheFile(key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ ts: Date.now(), value }, null, 2), "utf-8");
  } catch { /* best-effort */ }
}
