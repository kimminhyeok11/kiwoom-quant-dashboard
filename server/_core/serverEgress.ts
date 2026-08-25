type FetchResponse = { ok: boolean; text(): Promise<string> };
type Fetcher = (input: string, init?: RequestInit) => Promise<FetchResponse>;

export type ServerEgressIdentity = {
  ip: string | null;
  checkedAt: string;
  cacheStatus: "fresh" | "mismatch" | "unavailable";
};

let cached: { value: ServerEgressIdentity; expiresAt: number } | null = null;

export async function resolveServerEgressIdentity(input: { fetcher?: Fetcher; now?: Date; cacheTtlMs?: number } = {}): Promise<ServerEgressIdentity> {
  const now = input.now ?? new Date();
  if (cached && cached.expiresAt > now.getTime()) return cached.value;
  const checkedAt = now.toISOString();
  try {
    const fetcher = input.fetcher ?? ((url, init) => fetch(url, init));
    const providers = ["https://checkip.amazonaws.com", "https://icanhazip.com"];
    const responses = await Promise.all(providers.map(async url => {
      const response = await fetcher(url, { signal: AbortSignal.timeout(4_000) });
      const ip = (await response.text()).trim();
      if (!response.ok || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) throw new Error("invalid egress IP response");
      return ip;
    }));
    const distinct = Array.from(new Set(responses));
    const value: ServerEgressIdentity = distinct.length === 1
      ? { ip: distinct[0]!, checkedAt, cacheStatus: "fresh" }
      : { ip: null, checkedAt, cacheStatus: "mismatch" };
    cached = { value, expiresAt: now.getTime() + (input.cacheTtlMs ?? 5 * 60_000) };
    return value;
  } catch {
    const value: ServerEgressIdentity = { ip: null, checkedAt, cacheStatus: "unavailable" };
    cached = { value, expiresAt: now.getTime() + (input.cacheTtlMs ?? 60_000) };
    return value;
  }
}

export function clearServerEgressIdentityCache() {
  cached = null;
}
