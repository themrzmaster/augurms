import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";

export const dynamic = "force-dynamic";

const VOTE_POINTS_REWARD = 1;

// POST — GTop100 pingback callback (JSON or form POST)
export async function POST(request: NextRequest) {
  const pingbackKey = process.env.GTOP100_PINGBACK_KEY;
  if (!pingbackKey) {
    console.error("GTOP100_PINGBACK_KEY not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const contentType = request.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      // JSON format — batched votes (up to 50)
      const data = await request.json();

      if (data.pingbackkey !== pingbackKey) {
        return NextResponse.json({ error: "Invalid key" }, { status: 403 });
      }

      if (!data.Common || !Array.isArray(data.Common)) {
        return NextResponse.json({ error: "Invalid data" }, { status: 400 });
      }

      for (const entry of data.Common) {
        const mapped: Record<string, any> = {};
        for (const sub of entry) {
          Object.assign(mapped, sub);
        }

        const voterIP = mapped.ip || null;
        const success = Math.abs(Number(mapped.success ?? 1));
        const username = mapped.pb_name || null;

        if (success === 0 && username) {
          await creditVote(username, voterIP);
        }
      }

      return new NextResponse("OK", { status: 200 });
    } else {
      // Standard POST format — single vote
      const formData = await request.formData();
      const key = formData.get("pingbackkey") as string;
      const voterIP = formData.get("VoterIP") as string;
      const success = Math.abs(Number(formData.get("Successful") ?? 1));
      const username = formData.get("pingUsername") as string;

      if (key !== pingbackKey) {
        return NextResponse.json({ error: "Invalid key" }, { status: 403 });
      }

      if (success === 0 && username) {
        await creditVote(username, voterIP);
      }

      return new NextResponse("OK", { status: 200 });
    }
  } catch (err: any) {
    console.error("Vote callback error:", err);
    return new NextResponse("OK", { status: 200 }); // Always 200 to prevent retries
  }
}

async function creditVote(username: string, voterIP: string | null) {
  // Check account exists
  const accounts = await query<{ id: number; name: string }>(
    "SELECT id, name FROM accounts WHERE name = ?",
    [username]
  );

  if (accounts.length === 0) {
    console.warn(`Vote for unknown account: ${username}`);
    return;
  }

  const account = accounts[0];

  // Check if already voted in last 23 hours (small buffer for timing)
  const recent = await query<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM vote_log WHERE account_name = ? AND site = 'gtop100' AND voted_at > DATE_SUB(NOW(), INTERVAL 23 HOUR)",
    [username]
  );

  if (recent[0]?.cnt > 0) {
    console.warn(`Duplicate vote for ${username}, skipping`);
    return;
  }

  // Credit vote points
  await execute(
    "UPDATE accounts SET votepoints = votepoints + ? WHERE id = ?",
    [VOTE_POINTS_REWARD, account.id]
  );

  // Log the vote
  await execute(
    "INSERT INTO vote_log (account_name, account_id, site, voter_ip) VALUES (?, ?, 'gtop100', ?)",
    [username, account.id, voterIP]
  );

  console.log(`Vote credited: ${username} (+${VOTE_POINTS_REWARD} VP)`);
}
