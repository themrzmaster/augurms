import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/vote",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/register",
  "/api/server",
  "/api/config",
  "/api/launcher/",
  "/api/vote/",
  "/worldmap",
  "/api/worldmap/",
  "/api/gm/actions/map",
  "/api/gm/cron/check", // polled by external cron; gates itself on gm_schedule.next_run
  "/api/ban-judge/cron/check", // polled by external cron; gates itself on ban_judge_schedule
  "/api/npc/", // handles its own x-npc-secret auth at the route layer
  "/rankings",
  "/api/rankings",
];

// Exact-match paths and prefix-match paths kept separate — a single "/"
// entry in a prefix check would match every request (pathname always starts
// with "/") and effectively disable the whole middleware, which is exactly
// the bug this fixes.
function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => {
    if (p === pathname) return true;
    if (p.endsWith("/") && p.length > 1 && pathname.startsWith(p)) return true;
    return false;
  });
}

function isPublicAsset(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".js")
  );
}

/**
 * Timing-safe comparison to avoid leaking secret length/prefix via response
 * timing. Edge runtime doesn't expose crypto.timingSafeEqual, so we roll it.
 */
function secretsMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicAsset(pathname) || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Server-to-server path: the GM engine (and any internal callers) send
  // `x-gm-secret` so they can hit /api/admin/** without a user session. The
  // secret is set only via environment — never exposed to the browser.
  const gmSecretHeader = request.headers.get("x-gm-secret");
  const gmSecret = process.env.GM_API_SECRET;
  if (gmSecretHeader && gmSecret && secretsMatch(gmSecretHeader, gmSecret)) {
    return NextResponse.next();
  }

  const token = request.cookies.get("augur_session")?.value;

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
