import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET: Export all custom items as JSON manifest for the WZ patcher
export async function GET() {
  try {
    const items = await query(
      "SELECT item_id, name, description, category, sub_category, base_item_id, icon_url, stats, requirements, flags FROM custom_items ORDER BY item_id"
    );

    const parsed = (items as any[]).map((item) => ({
      item_id: item.item_id,
      name: item.name,
      description: item.description || "",
      category: item.category,
      sub_category: item.sub_category || "Ring",
      base_item_id: item.base_item_id,
      icon_url: item.icon_url,
      stats: typeof item.stats === "string" ? JSON.parse(item.stats) : item.stats || {},
      requirements: typeof item.requirements === "string" ? JSON.parse(item.requirements) : item.requirements || {},
      flags: typeof item.flags === "string" ? JSON.parse(item.flags) : item.flags || {},
    }));

    return NextResponse.json({
      exported_at: new Date().toISOString(),
      count: parsed.length,
      items: parsed,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
