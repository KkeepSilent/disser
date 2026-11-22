import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser, unauthorized } from "@/lib/server/auth";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return unauthorized();

    const body = await request.json();
    const sessionId = typeof body.session_id === "string" ? body.session_id : "";
    if (!sessionId) return NextResponse.json({ error: "Не найдена сессия симулятора." }, { status: 400 });

    const { data, error } = await getSupabaseAdmin().rpc("advance_simulation_session_atomic", {
      p_user_id: user.id,
      p_session_id: sessionId
    });
    if (error) {
      const message = error.message ?? "Не удалось продвинуть рынок.";
      const status = message.includes("session not found") ? 404 : 409;
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json(data);
  } catch (error) {
    return errorResponse(error);
  }
}
