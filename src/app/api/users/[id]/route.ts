import { NextRequest, NextResponse } from "next/server";
import { errorResponse, forbidden, getDemoUser, hasAdminKey } from "@/lib/server/auth";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasAdminKey(request)) return forbidden();
  try {
    const demoUser = await getDemoUser();
    const { id } = await context.params;
    const body = await request.json();

    const username = body.username === undefined ? null : typeof body.username === "string" ? body.username.trim() : "";
    const password = body.password === undefined || body.password === "" ? null : typeof body.password === "string" ? body.password : "";
    const balance = body.balance === undefined ? null : Number(body.balance);
    const role = body.role === undefined ? null : body.role === "admin" || body.role === "user" ? body.role : "";

    if (username !== null && (username.length < 2 || username.length > 32 || !/^[\p{L}\p{N}_-]+$/u.test(username))) {
      return NextResponse.json({ error: "Логин: 2–32 буквы, цифры, дефис или подчёркивание." }, { status: 400 });
    }
    if (password !== null && (!password || password.length > 72)) {
      return NextResponse.json({ error: "Пароль должен содержать до 72 символов." }, { status: 400 });
    }
    if (balance !== null && (!Number.isFinite(balance) || balance < 0 || balance > 1_000_000_000_000)) {
      return NextResponse.json({ error: "Баланс должен быть неотрицательным числом." }, { status: 400 });
    }
    if (role === "") return NextResponse.json({ error: "Недопустимая роль." }, { status: 400 });
    if (id === demoUser.id && username !== null && username.toLowerCase() !== demoUser.username) {
      return NextResponse.json({ error: "Логин демо-счёта задаётся через DEMO_USERNAME." }, { status: 409 });
    }

    const { data, error } = await getSupabaseAdmin().rpc("update_app_user", {
      p_user_id: id,
      p_username: username,
      p_password: password,
      p_balance: balance,
      p_role: role
    });
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "Этот логин уже занят." }, { status: 409 });
      if (error.code === "P0002") return NextResponse.json({ error: "Пользователь не найден." }, { status: 404 });
      throw error;
    }
    return NextResponse.json({ user: Array.isArray(data) ? data[0] : data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasAdminKey(request)) return forbidden();
  try {
    const demoUser = await getDemoUser();
    const { id } = await context.params;
    if (id === demoUser.id) return NextResponse.json({ error: "Нельзя удалить активный демо-счёт." }, { status: 409 });

    const { data, error } = await getSupabaseAdmin()
      .from("app_users")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Пользователь не найден." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
