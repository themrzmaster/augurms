import { NextRequest, NextResponse } from "next/server";
import { readdirSync, readFileSync } from "fs";
import { PATHS } from "@/lib/cosmic";

interface ReactorInfo {
  id: number;
  name: string;
  states: number;
  hasScript: boolean;
}

// Cache reactor list (parsed once from WZ)
let reactorCache: ReactorInfo[] | null = null;

function loadReactors(): ReactorInfo[] {
  if (reactorCache) return reactorCache;

  const reactors: ReactorInfo[] = [];
  try {
    const files = readdirSync(PATHS.reactorWz).filter((f) => f.endsWith(".img.xml"));
    for (const file of files) {
      const id = parseInt(file.replace(".img.xml", ""));
      if (isNaN(id)) continue;

      try {
        const content = readFileSync(`${PATHS.reactorWz}/${file}`, "utf-8");

        // Extract name from info section
        const nameMatch = content.match(/<string name="name" value="([^"]*)"/);
        const name = nameMatch ? nameMatch[1] : "";

        // Count state sections (numbered imgdir children at root level)
        const stateMatches = content.match(/<imgdir name="\d+">/g);
        const states = stateMatches ? stateMatches.length : 0;

        // Check for script
        let hasScript = false;
        try {
          readFileSync(`${PATHS.scripts}/reactor/${id}.js`, "utf-8");
          hasScript = true;
        } catch {}

        reactors.push({ id, name, states, hasScript });
      } catch {}
    }
  } catch {}

  reactorCache = reactors;
  return reactors;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = searchParams.get("q")?.toLowerCase() || "";

  const all = loadReactors();

  let results = all;
  if (query) {
    results = all.filter(
      (r) =>
        r.id.toString().includes(query) ||
        r.name.toLowerCase().includes(query),
    );
  }

  return NextResponse.json(results.slice(0, 50));
}
