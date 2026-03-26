import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { characterId, accountId, amount, type = "nxCredit" } = await request.json();

    if (!amount || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }
    if (amount > 100000) {
      return NextResponse.json({ error: "amount cannot exceed 100,000 per call" }, { status: 400 });
    }

    const column = type === "maplePoint" ? "maplePoint" : type === "nxPrepaid" ? "nxPrepaid" : "nxCredit";

    let actAccountId = accountId;

    // If characterId provided, look up the account
    if (characterId && !accountId) {
      const chars = await query<{ accountid: number; name: string }>(
        "SELECT accountid, name FROM characters WHERE id = ?",
        [characterId],
      );
      if (chars.length === 0) {
        return NextResponse.json({ error: "Character not found" }, { status: 404 });
      }
      actAccountId = chars[0].accountid;
    }

    if (!actAccountId) {
      return NextResponse.json({ error: "Either characterId or accountId is required" }, { status: 400 });
    }

    // Get current balance
    const accounts = await query<Record<string, number>>(
      `SELECT id, name, ${column} as balance FROM accounts WHERE id = ?`,
      [actAccountId],
    );
    if (accounts.length === 0) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const before = accounts[0].balance || 0;

    await execute(
      `UPDATE accounts SET ${column} = ${column} + ? WHERE id = ?`,
      [amount, actAccountId],
    );

    return NextResponse.json({
      success: true,
      accountId: actAccountId,
      accountName: (accounts[0] as any).name,
      type: column,
      added: amount,
      before,
      after: before + amount,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to grant NX", details: err.message },
      { status: 500 },
    );
  }
}
