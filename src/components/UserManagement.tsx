"use client";

import { FormEvent, useState } from "react";
import { LoaderCircle, UserRoundPlus, Users } from "lucide-react";

type ManagedUser = {
  id: string;
  username: string;
  role: "admin" | "user";
  balance: number;
};

export function UserManagement({ currentUserId, onSelfBalanceChange, onDemoReset }: {
  currentUserId: string;
  onSelfBalanceChange: (balance: number) => void;
  onDemoReset: (balance: number) => void;
}) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [adminKeyInput, setAdminKeyInput] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [balance, setBalance] = useState("0");
  const [role, setRole] = useState<"admin" | "user">("user");

  async function loadUsers(key: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/users", { cache: "no-store", headers: { "x-admin-key": key } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось загрузить пользователей.");
      setUsers(result.users.map((user: ManagedUser) => ({ ...user, balance: Number(user.balance) })));
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить пользователей.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adminKeyInput || loading) return;
    if (await loadUsers(adminKeyInput)) {
      setAdminKey(adminKeyInput);
      setAdminKeyInput("");
    }
  }

  async function resetDemo() {
    setSavingId("reset");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/demo/reset", { method: "POST", headers: { "x-admin-key": adminKey } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось сбросить демо-счёт.");
      onDemoReset(Number(result.balance));
      setNotice("Демо-счёт сброшен.");
      await loadUsers(adminKey);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось сбросить демо-счёт.");
    } finally {
      setSavingId(null);
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSavingId("new");
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify({ username, password, balance: Number(balance), role })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось создать пользователя.");
      setUsername("");
      setPassword("");
      setBalance("0");
      setRole("user");
      setNotice("Пользователь создан.");
      await loadUsers(adminKey);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось создать пользователя.");
    } finally {
      setSavingId(null);
    }
  }

  async function updateUser(userId: string, payload: Partial<Pick<ManagedUser, "username" | "role" | "balance">> & { password?: string }) {
    setError("");
    setNotice("");
    setSavingId(userId);
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось обновить пользователя.");
      if (userId === currentUserId && result.user?.balance !== undefined) onSelfBalanceChange(Number(result.user.balance));
      setNotice("Изменения сохранены.");
      await loadUsers(adminKey);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось обновить пользователя.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteUser(user: ManagedUser) {
    setError("");
    setNotice("");
    setSavingId(user.id);
    try {
      const response = await fetch(`/api/users/${user.id}`, { method: "DELETE", headers: { "x-admin-key": adminKey } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось удалить пользователя.");
      setNotice(`Пользователь ${user.username} удалён.`);
      await loadUsers(adminKey);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось удалить пользователя.");
    } finally {
      setSavingId(null);
    }
  }

  if (!adminKey) return (
    <details className="mb-6 rounded-lg border border-ink/10 bg-white p-5 shadow-panel">
      <summary className="cursor-pointer text-sm font-semibold">Администрирование</summary>
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={unlock}>
        <label className="text-sm font-medium">
          Ключ администратора
          <input autoComplete="off" className="mt-1 block h-10 rounded-md border border-ink/15 px-3" type="password" value={adminKeyInput} onChange={(event) => setAdminKeyInput(event.target.value)} disabled={loading} required />
        </label>
        <button className="h-10 rounded-md bg-ink px-3 text-sm font-semibold text-white disabled:opacity-60" disabled={loading || !adminKeyInput} type="submit">
          {loading ? "Проверяем…" : "Открыть"}
        </button>
      </form>
      {error && <p role="alert" className="mt-2 text-sm text-coral">{error}</p>}
    </details>
  );

  return (
    <section className="mb-6 rounded-lg border border-ink/10 bg-white p-5 shadow-panel">
      <div className="mb-4 flex items-center gap-2">
        <Users className="text-steel" size={19} />
        <h2 className="text-lg font-bold">Пользователи</h2>
        <button className="ml-auto rounded-md border border-coral/40 px-3 py-2 text-sm font-semibold text-coral disabled:opacity-60" disabled={savingId !== null} onClick={() => void resetDemo()} type="button">
          {savingId === "reset" ? "Сбрасываем…" : "Сбросить демо"}
        </button>
      </div>

      <form className="mb-5 grid gap-3 rounded-md bg-paper/70 p-4 md:grid-cols-[1fr_1fr_140px_140px_auto]" onSubmit={createUser}>
        <input className="h-10 rounded-md border border-ink/15 bg-white px-3 text-sm" maxLength={32} onChange={(event) => setUsername(event.target.value)} placeholder="Логин" required value={username} />
        <input className="h-10 rounded-md border border-ink/15 bg-white px-3 text-sm" onChange={(event) => setPassword(event.target.value)} placeholder="Пароль" required type="password" value={password} />
        <input className="h-10 rounded-md border border-ink/15 bg-white px-3 text-sm" min="0" onChange={(event) => setBalance(event.target.value)} placeholder="Баланс" step="0.01" type="number" value={balance} />
        <select aria-label="Роль нового пользователя" className="h-10 rounded-md border border-ink/15 bg-white px-3 text-sm" onChange={(event) => setRole(event.target.value as "admin" | "user")} value={role}>
          <option value="user">Пользователь</option>
          <option value="admin">Администратор</option>
        </select>
        <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-ink px-3 text-sm font-semibold text-white disabled:opacity-60" disabled={!username.trim() || !password || savingId !== null} type="submit">
          {savingId === "new" ? <LoaderCircle className="animate-spin" size={16} /> : <UserRoundPlus size={16} />}
          Добавить
        </button>
      </form>

      {error && <p aria-live="polite" className="mb-3 rounded-md bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}
      {notice && <p aria-live="polite" className="mb-3 rounded-md bg-mint/20 px-3 py-2 text-sm">{notice}</p>}
      {loading ? <p className="text-sm text-ink/60">Загрузка пользователей…</p> : users.length === 0 ? <p className="text-sm text-ink/60">Пользователей пока нет.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-ink/55">
              <tr><th className="px-2 py-2">Логин</th><th className="px-2 py-2">Роль</th><th className="px-2 py-2">Баланс</th><th className="px-2 py-2">Новый пароль</th><th className="px-2 py-2">Действия</th></tr>
            </thead>
            <tbody>
              {users.map((user) => <UserRow
                key={`${user.id}:${user.balance}`}
                busy={savingId !== null}
                isCurrent={user.id === currentUserId}
                onDelete={() => void deleteUser(user)}
                onSave={(payload) => void updateUser(user.id, payload)}
                user={user}
              />)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function UserRow({ user, busy, isCurrent, onSave, onDelete }: {
  user: ManagedUser;
  busy: boolean;
  isCurrent: boolean;
  onSave: (payload: Partial<Pick<ManagedUser, "username" | "role" | "balance">> & { password?: string }) => void;
  onDelete: () => void;
}) {
  const [username, setUsername] = useState(user.username);
  const [password, setPassword] = useState("");
  const [balance, setBalance] = useState(String(user.balance));
  const [role, setRole] = useState(user.role);

  return (
    <tr className="border-t border-ink/10">
      <td className="px-2 py-2"><input aria-label={`Логин ${user.username}`} className="h-9 w-36 rounded border border-ink/15 px-2" disabled={isCurrent} maxLength={32} onChange={(event) => setUsername(event.target.value)} value={username} /></td>
      <td className="px-2 py-2"><select aria-label={`Роль ${user.username}`} className="h-9 rounded border border-ink/15 px-2" disabled={isCurrent} onChange={(event) => setRole(event.target.value as "admin" | "user")} value={role}><option value="user">Пользователь</option><option value="admin">Админ</option></select></td>
      <td className="px-2 py-2"><input aria-label={`Баланс ${user.username}`} className="h-9 w-32 rounded border border-ink/15 px-2" min="0" onChange={(event) => setBalance(event.target.value)} step="0.01" type="number" value={balance} /></td>
      <td className="px-2 py-2"><input aria-label={`Новый пароль ${user.username}`} autoComplete="new-password" className="h-9 w-36 rounded border border-ink/15 px-2" onChange={(event) => setPassword(event.target.value)} placeholder="без изменений" type="password" value={password} /></td>
      <td className="px-2 py-2">
        <div className="flex gap-2">
          <button className="h-9 rounded-md bg-paper px-3 text-xs font-semibold disabled:opacity-60" disabled={busy || !username.trim() || !Number.isFinite(Number(balance))} onClick={() => { onSave({ username: username.trim(), balance: Number(balance), role, ...(password ? { password } : {}) }); setPassword(""); }} type="button">Сохранить</button>
          <button className="h-9 rounded-md border border-coral/40 px-3 text-xs font-semibold text-coral disabled:opacity-40" disabled={busy || isCurrent} onClick={onDelete} type="button">Удалить</button>
        </div>
      </td>
    </tr>
  );
}
