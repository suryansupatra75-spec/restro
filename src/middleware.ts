import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from './lib/auth';

const protectedRoutes = ['/dashboard', '/profile', '/onboarding', '/super-admin'];
const authRoutes = ['/login', '/register'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  
  const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

  // Get session cookie
  const session = request.cookies.get('session')?.value;
  let isAuthenticated = false;

  if (session) {
    const payload = await verifyToken(session);
    if (payload) isAuthenticated = true;
  }

  // Redirect unauthenticated users trying to access protected routes
  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    const redirectRes = NextResponse.redirect(loginUrl);
    redirectRes.headers.set('x-request-id', requestId);
    return redirectRes;
  }

  // Redirect authenticated users away from auth routes (login/register)
  if (isAuthRoute && isAuthenticated) {
    const dashboardUrl = new URL('/dashboard', request.url);
    const redirectRes = NextResponse.redirect(dashboardUrl);
    redirectRes.headers.set('x-request-id', requestId);
    return redirectRes;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set('x-request-id', requestId);

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
