export class FetchError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly status?: number
  ) {
    super(message);
  }
}

interface FetchWithRetryOptions {
  attempts?: number;
  label?: string;
  timeoutMs?: number;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryDelayMs(attempt: number): number {
  return [250, 1_000, 4_000][Math.min(attempt, 2)] ?? 4_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const attempts = options.attempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 12_000;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal
      });

      if (!response.ok && isRetryableStatus(response.status) && attempt < attempts - 1) {
        console.warn(
          `[fetchWithRetry] retrying ${options.label ?? url} after status ${response.status} (${attempt + 1}/${attempts})`
        );
        await sleep(retryDelayMs(attempt));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts - 1) {
        break;
      }
      console.warn(`[fetchWithRetry] retrying ${options.label ?? url} after network error (${attempt + 1}/${attempts})`);
      await sleep(retryDelayMs(attempt));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Request failed for ${url}.`);
}

export async function fetchText(url: string, timeoutMs = 12_000): Promise<string> {
  const response = await fetchWithRetry(
    url,
    {
      headers: {
        Accept: "application/json,text/csv,text/plain,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Mozilla/5.0"
      },
      cache: "no-store"
    },
    { label: url, timeoutMs }
  );

  if (!response.ok) {
    throw new FetchError(`Request failed with status ${response.status}`, url, response.status);
  }

  return response.text();
}

export async function fetchJson<T>(url: string, timeoutMs = 9_000): Promise<T> {
  const text = await fetchText(url, timeoutMs);
  return JSON.parse(text) as T;
}
