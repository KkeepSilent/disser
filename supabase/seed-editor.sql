-- Run in Supabase SQL Editor to create or reset the MVP admin account.
-- The stored password is a bcrypt hash; the login password is 123.
insert into public.app_users (username, password_hash, balance, role)
values (
  'edu',
  '$2a$10$TusEvHk3JQA7QjoIws46PO1MM3wooA9XDqcGYPgPWLtHkrWEulz4C',
  25000,
  'admin'
)
on conflict (username) do update
  set password_hash = excluded.password_hash,
      balance = excluded.balance,
      role = excluded.role,
      updated_at = now();
