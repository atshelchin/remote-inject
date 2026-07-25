/**
 * Chain metadata (display name + logo) resolved from the public
 * ethereum-data.awesometools.dev dataset, with an offline-safe fallback.
 *
 *   - name : GET /chains/eip155-<id>.json → `.name` (e.g. "Ethereum Mainnet")
 *   - logo : /chainlogos/eip155-<id>.png (CORS-enabled, cache-friendly PNG)
 *
 * The logo URL is returned synchronously so an <img> can render immediately;
 * the name is fetched once per chain and memoised. Both degrade gracefully:
 * unknown chains keep a `Chain <id>` label and the <img> hides itself onerror.
 */

const DATA_BASE = 'https://ethereum-data.awesometools.dev';

/** Built-in names for instant first paint and offline / unreachable-API cases. */
const FALLBACK_NAMES: Record<number, string> = {
  1: 'Ethereum',
  10: 'Optimism',
  56: 'BNB Chain',
  100: 'Gnosis',
  137: 'Polygon',
  250: 'Fantom',
  8453: 'Base',
  42161: 'Arbitrum',
  43114: 'Avalanche',
  59144: 'Linea',
  534352: 'Scroll',
  11155111: 'Sepolia',
};

const nameCache = new Map<number, string>();

/** Direct CDN URL for a chain's logo. Safe to use as an <img> src immediately. */
export function chainLogoUrl(chainId: number): string {
  return `${DATA_BASE}/chainlogos/eip155-${chainId}.png`;
}

/** Synchronous best-effort name (built-in table, else `Chain <id>`). */
export function fallbackChainName(chainId: number): string {
  return FALLBACK_NAMES[chainId] ?? `Chain ${chainId}`;
}

/**
 * Resolve a chain's display name, preferring the canonical dataset name and
 * falling back to the built-in table. Result is memoised per chain id.
 */
export async function fetchChainName(chainId: number): Promise<string> {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) return fallbackChainName(chainId);
  const cached = nameCache.get(chainId);
  if (cached) return cached;
  let name = fallbackChainName(chainId);
  try {
    const res = await fetch(`${DATA_BASE}/chains/eip155-${chainId}.json`, {
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const data = (await res.json()) as { name?: unknown };
      if (typeof data?.name === 'string' && data.name.trim()) name = data.name.trim();
    }
  } catch {
    /* offline or unknown chain — keep the fallback label */
  }
  nameCache.set(chainId, name);
  return name;
}
