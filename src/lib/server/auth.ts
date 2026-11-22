import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export type AppUser = {
  id: string;
  username: string;
  role: "admin" | "user";
  balance: number;
};

type DemoUser = AppUser & { demo_reset_at: string | null };

export function getDemoBalance() {
  const configured = Math.round(Number(process.env.DEMO_BALANCE?.trim() || "25000") * 100) / 100;
  if (!Number.isFinite(configured) || configured <= 0 || configured > 1_000_000_000_000) {
    throw new Error("DEMO_BALANCE должен быть положительным числом до 1 000 000 000 000.");
  }
  return configured;
}

export async function getDemoUser(): Promise<DemoUser> {
  const username = (process.env.DEMO_USERNAME?.trim() || "edu").toLowerCase();
  if (!/^[\p{L}\p{N}_-]{2,32}$/u.test(username)) {
    throw new Error("DEMO_USERNAME должен содержать от 2 до 32 букв, цифр, дефисов или подчёркиваний.");
  }
  const supabase = getSupabaseAdmin();
  async function findUser() {
    const { data, error } = await supabase.from("app_users")
      .select("id, username, role, balance, demo_reset_at")
      .eq("username", username)
      .maybeSingle<DemoUser>();
    if (error) throw error;
    return data ? { ...data, balance: Number(data.balance) } : null;
  }

  const existing = await findUser();
  if (existing) return existing;

  // The existing RPC hashes a random password to satisfy the legacy NOT NULL column.
  const { data, error } = await supabase.rpc("create_app_user", {
    p_username: username, p_password: randomBytes(32).toString("base64url"),
    p_balance: getDemoBalance(), p_role: "user"
  });
  if (error?.code === "23505") {
    const concurrent = await findUser();
    if (concurrent) return concurrent;
  }
  if (error) throw error;
  const created = Array.isArray(data) ? data[0] : data;
  if (!created) throw new Error("Не удалось создать демо-счёт.");
  return { ...created, balance: Number(created.balance), demo_reset_at: null };
}

export const getPageUser = getDemoUser;
export const requireUser = getDemoUser;

export function matchesSecret(actual: string | null, expected: string | undefined) {
  if (!actual || !expected) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(actual), digest(expected));
}

export function hasAdminKey(request: Request) {
  return matchesSecret(request.headers.get("x-admin-key"), process.env.ADMIN_API_KEY);
}

export function unauthorized() {
  return NextResponse.json({ error: "Требуется вход в систему." }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "Недостаточно прав для этого действия." }, { status: 403 });
}

export function errorResponse(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
      ? error.message
      : "Не удалось выполнить запрос к базе данных.";
  const status = message.includes("SUPABASE_URL") || message.includes("SUPABASE_SERVICE_ROLE_KEY") || message.includes("SUPABASE_SECRET_KEY") ? 503 : 500;
  return NextResponse.json({ error: message }, { status });
}

