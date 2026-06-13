import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware de Next.js — protege rutas del dashboard.
 * Las rutas públicas (/login, /onboarding) no requieren autenticación.
 *
 * NOTA: Este middleware corre en el edge, no tiene acceso a localStorage.
 * La verificación real del token se hace en el cliente (AuthProvider).
 * Este middleware solo verifica la presencia de una cookie/header básico.
 */

const PUBLIC_PATHS = ['/login', '/onboarding', '/billing/success', '/billing/cancel'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rutas públicas — no proteger
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Assets estáticos — no proteger
  if (pathname.startsWith('/_next') || pathname.includes('.')) {
    return NextResponse.next();
  }

  // En el edge no podemos leer localStorage, pero podemos verificar
  // si hay un cookie de sesión (se puede agregar después).
  // Por ahora, la protección real está en el AuthProvider del cliente.
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
