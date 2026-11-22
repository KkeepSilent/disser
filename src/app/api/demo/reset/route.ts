import { NextResponse } from "next/server";
import { errorResponse, forbidden, getDemoBalance, getDemoUser, hasAdminKey, matchesSecret } from "@/lib/server/auth";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const dynamic = "force-dynamic";

async function resetDemo() {
  try {
    const user = await getDemoUser();
    const { data, error } = await getSupabaseAdmin().rpc("reset_demo_account", {
      p_user_id: user.id,
      p_balance: getDemoBalance()
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, balance: Number(data) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  return hasAdminKey(request) ? resetDemo() : forbidden();
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const valid = secret && matchesSecret(request.headers.get("authorization"), `Bearer ${secret}`);
  return valid ? resetDemo() : forbidden();
}
