// Polite HTTP helper shared by every source adapter.
// Browser UA is required: several UNC hosts (alumni.unc.edu especially)
// return 403 to the default undici agent string.

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT = 25_000;

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with a timeout, a browser UA, and bounded retries on transient failure.
 * Throws on a non-ok response so callers can decide whether the source is
 * optional (see runSource in ingest.mjs, which degrades instead of failing).
 */
export async function get(url, { timeout = DEFAULT_TIMEOUT, retries = 2, headers = {} } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(600 * attempt);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': UA,
          // A bare UA is not enough for the WAF in front of alumni.unc.edu.
          // Sending the header set a real Chrome sends costs nothing and gets
          // through filters that score requests on how browser-like they look.
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/calendar;q=0.8,*/*;q=0.7',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Upgrade-Insecure-Requests': '1',
          ...headers,
        },
      });
      if (!res.ok) {
        // 4xx other than 429 will not fix themselves, so stop early.
        if (res.status !== 429 && res.status < 500) {
          throw new Error(`HTTP ${res.status} for ${url}`);
        }
        lastErr = new Error(`HTTP ${res.status} for ${url}`);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (err.message?.startsWith('HTTP 4')) throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr ?? new Error(`failed to fetch ${url}`);
}

export async function getJson(url, opts) {
  const res = await get(url, opts);
  return res.json();
}

export async function getText(url, opts) {
  const res = await get(url, opts);
  return res.text();
}
