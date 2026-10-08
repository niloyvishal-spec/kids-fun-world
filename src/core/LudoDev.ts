/**
 * Local Ludo developer test mode client.
 *
 * The flag is injected at compile time by vite.config.ts and is guaranteed
 * false for every production build (`vite build`), which removes this code
 * path from the bundle entirely. When enabled, the Ludo scene may consume a
 * one-time forced dice value from the local dev controller (which is only
 * reachable on the developer's own machine).
 */

export const LUDO_DEV_MODE: boolean = __LUDO_DEV__ === true;

const ENDPOINT = '/ludo-dev';

async function post<T>(path: string): Promise<T | null> {
  if (!LUDO_DEV_MODE) return null;
  try {
    const res = await fetch(`${ENDPOINT}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function get<T>(path: string): Promise<T | null> {
  if (!LUDO_DEV_MODE) return null;
  try {
    const res = await fetch(`${ENDPOINT}/${path}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Current pending test dice value (null when none / dev mode off). */
export async function fetchTestDice(): Promise<number | null> {
  const data = await get<{ next: number | null }>('/state');
  return data?.next ?? null;
}

/**
 * Consume the pending test dice value. Returns 1..6 exactly once per set
 * value, or null when no value is pending (caller then rolls randomly).
 */
export async function consumeTestDice(): Promise<number | null> {
  const data = await post<{ value: number | null }>('/consume');
  const v = data?.value;
  return typeof v === 'number' && v >= 1 && v <= 6 ? v : null;
}
