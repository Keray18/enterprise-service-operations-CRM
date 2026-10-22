import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isAuthorizedForPath, resolveDefaultWorkspace } from './lib/workspaceResolver';
import { AuthUser } from './providers/AuthProvider';

/**
 * Valid session token character set validation.
 * Rejects control chars, spaces, and dangerous characters before network request.
 * Enterprise CRM session tokens are cryptographically generated random strings.
 */
function isValidSessionTokenFormat(token: string): boolean {
  return /^[a-zA-Z0-9_\-.~]{8,256}$/.test(token);
}

/**
 * Resolves the backend API base URL based on runtime environment configuration.
 * Avoids hard-coded localhost values to support Docker, container clusters, and cloud environments.
 */
function getBackendApiUrl(): string {
  // 1. Explicit internal backend URL for server-to-server calls (e.g. Docker container network http://backend:4000)
  if (process.env.INTERNAL_API_URL) {
    return process.env.INTERNAL_API_URL.replace(/\/+$/, '');
  }
  // 2. Next.js public API URL
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL.replace(/\/+$/, '');
  }
  // 3. Fallback based on backend port if configured
  const port = process.env.PORT || '4000';
  return `http://127.0.0.1:${port}`;
}

export interface SessionVerificationResult {
  isValid: boolean;
  user: AuthUser | null;
  status: 'VALID' | 'INVALID' | 'MALFORMED' | 'NETWORK_ERROR';
}

/**
 * Asynchronously verifies the session token against the authoritative backend Express API.
 * Never trusts cookie presence alone.
 */
export async function verifySessionWithBackend(
  sessionToken: string | undefined,
  correlationId?: string
): Promise<SessionVerificationResult> {
  if (!sessionToken) {
    return { isValid: false, user: null, status: 'INVALID' };
  }

  // Pre-validate token syntax to prevent header injection or malformed requests
  if (!isValidSessionTokenFormat(sessionToken)) {
    return { isValid: false, user: null, status: 'MALFORMED' };
  }

  const backendUrl = getBackendApiUrl();

  try {
    const res = await fetch(`${backendUrl}/api/v1/auth/me`, {
      method: 'GET',
      headers: {
        Cookie: `crm_session=${sessionToken}`,
        ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return { isValid: false, user: null, status: 'INVALID' };
    }

    const json = await res.json();
    if (json.success && json.data?.user) {
      return { isValid: true, user: json.data.user, status: 'VALID' };
    }

    return { isValid: false, user: null, status: 'INVALID' };
  } catch {
    // Network or server error: fail safe
    return { isValid: false, user: null, status: 'NETWORK_ERROR' };
  }
}

/**
 * Next.js Edge Middleware for authoritative boundary gating.
 *
 * Ensures unauthenticated, invalid, expired, or revoked sessions to protected workspaces
 * are intercepted and redirected to /login immediately without serving private workspace
 * bundles or HTML.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const sessionToken = request.cookies.get('crm_session')?.value;
  const correlationId = request.headers.get('x-correlation-id') || `mw-${Date.now()}`;

  // 1. Always allow public static files, Next.js internal chunks, and API proxy calls
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // 2. Handle login route /login
  if (pathname.startsWith('/login')) {
    if (sessionToken) {
      const verification = await verifySessionWithBackend(sessionToken, correlationId);
      if (verification.isValid && verification.user) {
        // Authenticated user opening /login -> redirect directly to authorized workspace
        const target = resolveDefaultWorkspace(verification.user) || '/';
        return NextResponse.redirect(new URL(target, request.url));
      } else {
        // Stale, malformed, or revoked cookie on /login: strip it from the client
        const res = NextResponse.next();
        res.cookies.delete('crm_session');
        res.cookies.delete('crm_csrf');
        return res;
      }
    }
    return NextResponse.next();
  }

  // 3. Handle root route /
  if (pathname === '/') {
    // If no session cookie exists, redirect immediately to login
    if (!sessionToken) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Verify session validity with backend
    const verification = await verifySessionWithBackend(sessionToken, correlationId);
    if (!verification.isValid || !verification.user) {
      const loginUrl = new URL('/login?sessionExpired=true', request.url);
      const res = NextResponse.redirect(loginUrl);
      res.cookies.delete('crm_session');
      res.cookies.delete('crm_csrf');
      return res;
    }

    // Valid authenticated session: redirect to authorized default landing page
    const targetWorkspace = resolveDefaultWorkspace(verification.user);
    if (targetWorkspace) {
      return NextResponse.redirect(new URL(targetWorkspace, request.url));
    }

    // Authenticated user with no workspace assigned: pass through to page.tsx for controlled notice
    return NextResponse.next();
  }

  // 4. Gated operational workspaces: /admin, /call-center, /asf, /warehouse
  const isProtectedWorkspace =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/call-center') ||
    pathname.startsWith('/asf') ||
    pathname.startsWith('/warehouse');

  if (isProtectedWorkspace) {
    // A. Missing session cookie
    if (!sessionToken) {
      const returnUrl = encodeURIComponent(`${pathname}${search}`);
      const loginUrl = new URL(`/login?redirect=${returnUrl}`, request.url);
      return NextResponse.redirect(loginUrl);
    }

    // B. Verify session cookie with backend
    const verification = await verifySessionWithBackend(sessionToken, correlationId);
    if (!verification.isValid || !verification.user) {
      // Expired, revoked, or invalid session attempting to view protected workspace
      const returnUrl = encodeURIComponent(`${pathname}${search}`);
      const loginUrl = new URL(`/login?sessionExpired=true&redirect=${returnUrl}`, request.url);
      const res = NextResponse.redirect(loginUrl);
      res.cookies.delete('crm_session');
      res.cookies.delete('crm_csrf');
      return res;
    }

    // C. Enforce role-based workspace authorization at the server boundary
    const isAuthorized = isAuthorizedForPath(verification.user, pathname);
    if (!isAuthorized) {
      // Authenticated user attempting to access an unauthorized workspace URL.
      // Immediately redirect them to their authorized default landing workspace.
      const targetWorkspace = resolveDefaultWorkspace(verification.user) || '/';
      return NextResponse.redirect(new URL(targetWorkspace, request.url));
    }

    // D. Valid session verified by backend AND authorized for this workspace: allow request through.
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
