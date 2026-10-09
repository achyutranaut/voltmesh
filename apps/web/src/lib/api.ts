export class ApiError extends Error {
  public status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export function getApiBaseUrl(): string {
  return (
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ||
    'http://localhost:3000'
  );
}

export async function apiFetch<T = any>(
  path: string,
  token?: string | null,
  init?: RequestInit
): Promise<T> {
  const baseUrl = getApiBaseUrl().replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${baseUrl}${cleanPath}`;

  const headers = new Headers(init?.headers || {});

  if (!headers.has('Content-Type') && !(init?.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...init,
    headers,
  });

  if (!res.ok) {
    let errorMessage = `API request failed with status ${res.status}`;
    try {
      const data = await res.json();
      if (data && (data.message || data.error)) {
        errorMessage = data.message || data.error;
      }
    } catch {
      try {
        const text = await res.text();
        if (text) errorMessage = text;
      } catch {
        // use fallback message
      }
    }
    throw new ApiError(res.status, errorMessage);
  }

  // If response has no content (e.g. 204)
  if (res.status === 204) {
    return {} as T;
  }

  return (await res.json()) as T;
}

export function mapAdvisorError(err: any): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Please sign in again';
    if (err.status === 403) return 'Not permitted for your role';
    if (err.status === 404) return 'Advisor service not reachable';
    if (err.status === 429) return 'Rate limit reached';
    if (err.status === 503) return 'Advisor unavailable, showing template explanation';
    return err.message;
  }
  const msg = err?.message || '';
  if (msg.includes('401')) return 'Please sign in again';
  if (msg.includes('403')) return 'Not permitted for your role';
  if (msg.includes('404')) return 'Advisor service not reachable';
  if (msg.includes('429')) return 'Rate limit reached';
  if (msg.includes('503')) return 'Advisor unavailable, showing template explanation';
  return msg || 'Advisor service not reachable';
}
