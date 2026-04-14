import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

interface RankedCharacter {
  id: number;
  name: string;
  level: number;
  exp: number;
  job: number;
  fame: number;
  meso: number;
  guild: string | null;
  skincolor: number;
  hair: number;
  face: number;
  gender: number;
  equips: number[];
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sort = searchParams.get("sort") || "level";
  const job = searchParams.get("job"); // filter by job family
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

  const validSorts: Record<string, string> = {
    level: "c.level DESC, c.exp DESC",
    fame: "c.fame DESC, c.level DESC",
  };

  const orderBy = validSorts[sort] || validSorts.level;

  try {
    // Build WHERE clause: hide banned accounts and GM characters
    const conditions = [
      "c.name != 'admin'",
      "a.banned = 0",
      "c.gm = 0",
    ];
    const params: any[] = [];

    if (job) {
      const jobId = parseInt(job);
      if (!isNaN(jobId)) {
        // Match job family: e.g. job=1 matches 100-199 (warriors)
        // job=0 matches exactly 0 (beginner)
        if (jobId === 0) {
          conditions.push("c.job = 0");
        } else {
          conditions.push("c.job >= ? AND c.job < ?");
          params.push(jobId * 100, (jobId + 1) * 100);
        }
      }
    }

    // Get top characters with guild name
    // Note: LIMIT is interpolated directly (already validated as int) to avoid mysql2 prepared statement issues
    const characters = await query<{
      id: number;
      name: string;
      level: number;
      exp: number;
      job: number;
      fame: number;
      meso: number;
      guild: string | null;
      skincolor: number;
      hair: number;
      face: number;
      gender: number;
    }>(
      `SELECT c.id, c.name, c.level, c.exp, c.job, c.fame, c.meso,
              g.name AS guild, c.skincolor, c.hair, c.face, c.gender
       FROM characters c
       JOIN accounts a ON a.id = c.accountid
       LEFT JOIN guilds g ON c.guildid = g.guildid AND c.guildid > 0
       WHERE ${conditions.join(" AND ")}
       ORDER BY ${orderBy}
       LIMIT ${limit}`,
      params,
    );

    if (characters.length === 0) {
      return NextResponse.json({ rankings: [] });
    }

    // Get equipped items for all ranked characters in one query
    const charIds = characters.map((c) => c.id);
    const placeholders = charIds.map(() => "?").join(",");

    const equippedItems = await query<{ characterid: number; itemid: number }>(
      `SELECT characterid, itemid FROM inventoryitems
       WHERE characterid IN (${placeholders}) AND inventorytype = -1
       ORDER BY characterid`,
      charIds,
    );

    // Group equips by character
    const equipsByChar = new Map<number, number[]>();
    for (const item of equippedItems) {
      const list = equipsByChar.get(item.characterid) || [];
      list.push(item.itemid);
      equipsByChar.set(item.characterid, list);
    }

    const rankings: RankedCharacter[] = characters.map((c) => ({
      id: c.id,
      name: c.name,
      level: c.level,
      exp: c.exp,
      job: c.job,
      fame: c.fame,
      meso: c.meso,
      guild: c.guild,
      skincolor: c.skincolor,
      hair: c.hair,
      face: c.face,
      gender: c.gender,
      equips: equipsByChar.get(c.id) || [],
    }));

    return NextResponse.json({ rankings });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to fetch rankings", details: err.message },
      { status: 500 },
    );
  }
}
