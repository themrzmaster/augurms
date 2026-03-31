import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const { ref } = await params;

  // Sanitize: alphanumeric, dashes, underscores only, max 64 chars
  const safeRef = ref.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  if (!safeRef) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null;
  const ua = request.headers.get("user-agent")?.slice(0, 512) || null;

  // Fire and forget - don't block redirect on DB write
  execute(
    "INSERT INTO click_tracking (ref, ip, user_agent) VALUES (?, ?, ?)",
    [safeRef, ip, ua],
  ).catch(() => {});

  return NextResponse.redirect(new URL("/", request.url));
}
