import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/vote/status?username=xxx
export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username");

  if (!username || !/^[a-zA-Z0-9]{4,12}$/.test(username)) {
    return NextResponse.json({ error: "Invalid username" }, { status: 400 });
  }

  // Check account exists
  const accounts = await query<{ id: number; votepoints: number }>(
    "SELECT id, votepoints FROM accounts WHERE name = ?",
    [username]
  );

  if (accounts.length === 0) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Check last vote time per site
  const lastVotes = await query<{ site: string; voted_at: string }>(
    "SELECT site, MAX(voted_at) as voted_at FROM vote_log WHERE account_name = ? GROUP BY site",
    [username]
  );

  const sites: Record<string, { lastVote: string | null; canVote: boolean; nextVoteAt: string | null }> = {};

  for (const row of lastVotes) {
    const lastVote = new Date(row.voted_at);
    const nextVote = new Date(lastVote.getTime() + 24 * 60 * 60 * 1000);
    const canVote = Date.now() > nextVote.getTime();

    sites[row.site] = {
      lastVote: row.voted_at,
      canVote,
      nextVoteAt: canVote ? null : nextVote.toISOString(),
    };
  }

  return NextResponse.json({
    username,
    votePoints: accounts[0].votepoints,
    sites: {
      gtop100: sites.gtop100 || { lastVote: null, canVote: true, nextVoteAt: null },
    },
  });
}
