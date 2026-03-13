import { NextRequest } from "next/server";
import { runGameMaster } from "@/lib/gamemaster/engine";
import type { GMLogEntry } from "@/lib/gamemaster/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { prompt } = await request.json();

  if (!prompt || typeof prompt !== "string") {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const session = await runGameMaster(prompt, (entry: GMLogEntry) => {
          send({ type: "log", entry });
        });

        send({ type: "done", session: { id: session.id, status: session.status, summary: session.summary, error: session.error } });
      } catch (err: any) {
        send({ type: "error", message: err.message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
