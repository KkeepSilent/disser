import { NextRequest, NextResponse } from "next/server";
import { errorResponse, forbidden, hasAdminKey } from "@/lib/server/auth";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export async function GET(request: NextRequest) {
  if (!hasAdminKey(request)) return forbidden();
  try {

    const { data, error } = await getSupabaseAdmin()
      .from("app_users")
      .select("id, username, role, balance, created_at, updated_at")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ users: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  if (!hasAdminKey(request)) return forbidden();
  try {

    const body = await request.json();
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const balance = Number(body.balance);
    const role = body.role === "admin" ? "admin" : body.role === "user" ? "user" : null;
    if (username.length < 2 || username.length > 32 || !/^[\p{L}\p{N}_-]+$/u.test(username)) {
      return NextResponse.json({ error: "Логин: 2–32 буквы, цифры, дефис или подчёркивание." }, { status: 400 });
    }
    if (!password || password.length > 72) return NextResponse.json({ error: "Укажите пароль длиной до 72 символов." }, { status: 400 });
    if (!Number.isFinite(balance) || balance < 0 || balance > 1_000_000_000_000) {
      return NextResponse.json({ error: "Баланс должен быть числом от 0 до 1 000 000 000 000." }, { status: 400 });
    }
    if (!role) return NextResponse.json({ error: "Укажите роль пользователя." }, { status: 400 });

    const { data, error } = await getSupabaseAdmin().rpc("create_app_user", {
      p_username: username,
      p_password: password,
      p_balance: balance,
      p_role: role
    });
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "Этот логин уже занят." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ user: Array.isArray(data) ? data[0] : data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
