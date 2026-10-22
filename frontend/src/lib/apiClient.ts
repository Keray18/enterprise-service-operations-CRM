/**
 * Typed API Client for Enterprise Sales CRM
 * Respects standard API response/error envelopes and propagates correlation IDs.
 */

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  meta: {
    correlationId: string;
    timestamp: string;
  };
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    correlationId: string;
    timestamp: string;
  };
}

export class ApiClientError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly correlationId?: string;
  public readonly details?: unknown;

  constructor(message: string, code = 'API_ERROR', statusCode = 500, correlationId?: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.statusCode = statusCode;
    this.correlationId = correlationId;
    this.details = details;
  }
}

let currentCsrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  currentCsrfToken = token;
}

export function getCsrfToken(): string | null {
  return currentCsrfToken;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (currentCsrfToken && !headers.has('x-csrf-token')) {
    headers.set('x-csrf-token', currentCsrfToken);
  }

  try {
    const res = await fetch(url, {
      credentials: 'include',
      ...options,
      headers,
    });

    const correlationId = res.headers.get('x-correlation-id') || undefined;

    let payload: any;
    try {
      payload = await res.json();
    } catch {
      throw new ApiClientError(
        `Failed to parse server response from ${endpoint}`,
        'INVALID_RESPONSE',
        res.status,
        correlationId
      );
    }

    if (!res.ok || payload.success === false) {
      const errPayload = payload as ApiErrorEnvelope;
      throw new ApiClientError(
        errPayload.error?.message || `HTTP ${res.status}: Request failed`,
        errPayload.error?.code || 'HTTP_ERROR',
        res.status,
        errPayload.meta?.correlationId || correlationId,
        errPayload.error?.details
      );
    }

    return (payload as ApiSuccessEnvelope<T>).data;
  } catch (err: unknown) {
    if (err instanceof ApiClientError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new ApiClientError(
      `Network communication error: ${message}`,
      'NETWORK_ERROR',
      0
    );
  }
}

export const apiClient = {
  get: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, body?: unknown, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  put: <T>(endpoint: string, body?: unknown, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  patch: <T>(endpoint: string, body?: unknown, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  delete: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),

  downloadBlob: async (endpoint: string, options?: RequestInit): Promise<Blob> => {
    const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const headers = new Headers(options?.headers);
    if (currentCsrfToken && !headers.has('x-csrf-token')) {
      headers.set('x-csrf-token', currentCsrfToken);
    }
    const res = await fetch(url, {
      credentials: 'include',
      ...options,
      headers,
    });
    if (!res.ok) {
      throw new ApiClientError(`Download failed with status ${res.status}`, 'DOWNLOAD_FAILED', res.status);
    }
    return res.blob();
  },
};

export function triggerBlobDownload(blob: Blob, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (typeof document !== 'undefined' && document.body && document.body.contains(a)) {
      document.body.removeChild(a);
    }
    if (typeof window !== 'undefined' && window.URL) {
      window.URL.revokeObjectURL(url);
    }
  }, 100);
}

