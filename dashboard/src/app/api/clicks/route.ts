import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const ref = request.nextUrl.searchParams.get("ref");

    // Summary: clicks per ref, total and unique IPs, last 30 days + all time
    const rows = await query(
      `SELECT
        ref,
        COUNT(*) as total_clicks,
        COUNT(DISTINCT ip) as unique_visitors,
        SUM(CASE WHEN clicked_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as clicks_30d,
        COUNT(DISTINCT CASE WHEN clicked_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN ip END) as unique_30d,
        MIN(clicked_at) as first_click,
        MAX(clicked_at) as last_click
      FROM click_tracking
      ${ref ? "WHERE ref = ?" : ""}
      GROUP BY ref
      ORDER BY total_clicks DESC`,
      ref ? [ref] : [],
    );

    // Daily breakdown for the last 30 days
    const daily = await query(
      `SELECT
        ref,
        DATE(clicked_at) as day,
        COUNT(*) as clicks,
        COUNT(DISTINCT ip) as unique_ips
      FROM click_tracking
      WHERE clicked_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      ${ref ? "AND ref = ?" : ""}
      GROUP BY ref, DATE(clicked_at)
      ORDER BY day DESC`,
      ref ? [ref] : [],
    );

    return NextResponse.json({ summary: rows, daily });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 },
    );
  }
}
