import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";
import dns from "dns/promises";

export const dynamic = "force-dynamic";

const VOTE_POINTS_REWARD = 1;

// GET — TopG postback callback
// TopG calls: https://augurms.com/api/vote/topg?p_resp=USERNAME&ip=VOTERIP
export async function GET(request: NextRequest) {
  try {
    // Validate request comes from TopG
    const requestIP =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    let topgIPs: string[] = [];
    try {
      topgIPs = await dns.resolve4("monitor.topg.org");
    } catch {
      console.error("Failed to resolve monitor.topg.org");
      return new NextResponse("OK", { status: 200 });
    }

    if (!topgIPs.includes(requestIP)) {
      console.warn(`TopG vote callback from non-TopG IP: ${requestIP}`);
      return new NextResponse("OK", { status: 200 });
    }

    const username = request.nextUrl.searchParams.get("p_resp");
    const voterIP = request.nextUrl.searchParams.get("ip");

    if (!username) {
      return new NextResponse("OK", { status: 200 });
    }

    // Clean parameters
    const cleanUsername = username.replace(/[^A-Za-z0-9_-]/g, "");
    const cleanIP = voterIP?.replace(/[^0-9.]/g, "") || null;

    await creditVote(cleanUsername, cleanIP);

    return new NextResponse("OK", { status: 200 });
  } catch (err: any) {
    console.error("TopG vote callback error:", err);
    return new NextResponse("OK", { status: 200 });
  }
}

async function creditVote(username: string, voterIP: string | null) {
  const accounts = await query<{ id: number; name: string }>(
    "SELECT id, name FROM accounts WHERE name = ?",
    [username]
  );

  if (accounts.length === 0) {
    console.warn(`TopG vote for unknown account: ${username}`);
    return;
  }

  const account = accounts[0];

  // Check if already voted in last 23 hours
  const recent = await query<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM vote_log WHERE account_name = ? AND site = 'topg' AND voted_at > DATE_SUB(NOW(), INTERVAL 23 HOUR)",
    [username]
  );

  if (recent[0]?.cnt > 0) {
    console.warn(`Duplicate TopG vote for ${username}, skipping`);
    return;
  }

  await execute(
    "UPDATE accounts SET votepoints = votepoints + ? WHERE id = ?",
    [VOTE_POINTS_REWARD, account.id]
  );

  await execute(
    "INSERT INTO vote_log (account_name, account_id, site, voter_ip) VALUES (?, ?, 'topg', ?)",
    [username, account.id, voterIP]
  );

  console.log(`TopG vote credited: ${username} (+${VOTE_POINTS_REWARD} VP)`);
}
