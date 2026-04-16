import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Install gate: on every page request, check if Utterlog is installed.
 * If not installed AND request is NOT /install, redirect to /install.
 * If installed AND request IS /install, redirect to /.
 *
 * Status is cached per-request via fetch — in Edge runtime, Next.js dedupes
 * same-URL fetches within the same request.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip static assets, API proxies, /admin (served by Go), Next internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/uploads/') ||
    pathname.match(/\.(?:ico|png|jpg|jpeg|svg|webp|avif|gif|css|js|woff2?|ttf|map)$/)
  ) {
    return NextResponse.next();
  }

  const apiUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';
  const isInstallPage = pathname === '/install' || pathname.startsWith('/install/');

  // Fail CLOSED: on a fresh deploy, if the API is unreachable we assume NOT
  // installed and send the user to /install. The install page itself handles
  // "API unreachable" in its own UI (retry / troubleshooting hints), which is
  // a much better UX than silently showing a broken blog.
  let installed = false;
  let apiReachable = false;
  try {
    const r = await fetch(apiUrl + '/install/status', {
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    });
    apiReachable = r.ok;
    if (r.ok) {
      const j = await r.json();
      installed = j?.data?.installed === true;
    }
  } catch {
    apiReachable = false;
  }

  // If we're already on /install, let it through so the user can see the wizard
  // (which can probe the API on its own and show better errors).
  if (isInstallPage) {
    if (apiReachable && installed) {
      return NextResponse.redirect(new URL('/', req.url));
    }
    return NextResponse.next();
  }

  // Not on /install. If not installed OR API down → send to /install.
  if (!installed) {
    return NextResponse.redirect(new URL('/install', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on every page except static/next internals (they're also filtered above)
    '/((?!_next|api/|uploads/|.*\\.(?:ico|png|jpg|jpeg|svg|webp|avif|gif|css|js|woff2?|ttf|map)$).*)',
  ],
};
