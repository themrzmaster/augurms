import { NextRequest, NextResponse } from "next/server";
import { execute, query } from "@/lib/db";
import { runAugurChat } from "@/lib/augur/engine";

const NPC_SECRET = process.env.NPC_SECRET || "augur-npc-secret";

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const secret = request.headers.get("x-npc-secret");
    if (secret !== NPC_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { characterId, characterName, characterLevel, message } = await request.json();

    if (!characterId || !characterName || !message) {
      return NextResponse.json(
        { error: "Required: characterId, characterName, message" },
        { status: 400 },
      );
    }

    // Truncate message to prevent abuse
    const trimmedMessage = String(message).substring(0, 500);

    // Save user message
    await execute(
      "INSERT INTO augur_chat_logs (character_id, character_name, role, content) VALUES (?, ?, 'user', ?)",
      [characterId, characterName, trimmedMessage],
    );

    // Run LLM
    const result = await runAugurChat(
      characterId,
      characterName,
      characterLevel || 1,
      trimmedMessage,
    );

    // Save assistant response
    await execute(
      "INSERT INTO augur_chat_logs (character_id, character_name, role, content, model, tool_calls) VALUES (?, ?, 'assistant', ?, ?, ?)",
      [
        characterId,
        characterName,
        result.text,
        null,
        result.toolCalls ? JSON.stringify(result.toolCalls) : null,
      ],
    );

    return NextResponse.json({ text: result.text });
  } catch (err: any) {
    console.error("Augur chat error:", err);
    return NextResponse.json(
      { text: "The crystal dims... Something went wrong. Try again later." },
      { status: 200 }, // Return 200 so NPC script can show the message
    );
  }
}
