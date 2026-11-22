-- TradeMind schema. Run once in Supabase SQL Editor as the project owner.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null check (char_length(username) between 2 and 32),
  password_hash text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  balance numeric(18, 2) not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists app_sessions_user_id_idx on public.app_sessions(user_id);
create index if not exists app_sessions_expires_at_idx on public.app_sessions(expires_at);

-- Unused legacy lesson tables are not created in fresh installations.

create table if not exists public.simulation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  scenario_id text not null,
  starting_balance numeric(18, 2) not null,
  current_balance numeric(18, 2) not null,
  current_candle_index integer not null default 0 check (current_candle_index >= 0),
  candles jsonb,
  market_source text not null default 'fallback' check (market_source in ('binance', 'fallback')),
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrade installations created from the previous schema without dropping
-- their rows. Existing legacy session rows keep their original user ids; new
-- app sessions are validated against app_users.
alter table public.simulation_sessions add column if not exists scenario_id text;
alter table public.simulation_sessions add column if not exists starting_balance numeric(18, 2) not null default 0;
alter table public.simulation_sessions add column if not exists current_balance numeric(18, 2) not null default 0;
alter table public.simulation_sessions add column if not exists current_candle_index integer not null default 0;
alter table public.simulation_sessions add column if not exists status text not null default 'active';
alter table public.simulation_sessions add column if not exists updated_at timestamptz not null default now();
alter table public.simulation_sessions drop constraint if exists simulation_sessions_user_id_fkey;
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'simulation_sessions_app_user_id_fkey'
      and conrelid = 'public.simulation_sessions'::regclass
  ) then
    alter table public.simulation_sessions
      add constraint simulation_sessions_app_user_id_fkey
      foreign key (user_id) references public.app_users(id) on delete cascade not valid;
  end if;
end $$;
create index if not exists simulation_sessions_user_scenario_idx
  on public.simulation_sessions(user_id, scenario_id, status);
create unique index if not exists simulation_sessions_one_active_per_scenario_idx
  on public.simulation_sessions(user_id, scenario_id) where status = 'active';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'simulation_sessions_candle_index_nonnegative' and conrelid = 'public.simulation_sessions'::regclass) then
    alter table public.simulation_sessions add constraint simulation_sessions_candle_index_nonnegative check (current_candle_index >= 0);
  end if;
end $$;

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.simulation_sessions(id) on delete cascade,
  user_id uuid references public.app_users(id) on delete cascade,
  scenario_id text,
  asset_symbol text not null,
  side text not null check (side in ('buy', 'sell')),
  entry_price numeric not null,
  quantity numeric not null check (quantity > 0),
  entry_candle_index integer not null default 0 check (entry_candle_index >= 0),
  stop_loss numeric,
  risk_percent numeric not null default 0,
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  exit_price numeric,
  realized_pnl numeric,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
alter table public.trades add column if not exists user_id uuid references public.app_users(id) on delete cascade;
alter table public.trades add column if not exists scenario_id text;
alter table public.trades add column if not exists entry_candle_index integer not null default 0;
alter table public.trades add column if not exists status text not null default 'open';
alter table public.trades add column if not exists exit_price numeric;
alter table public.trades add column if not exists realized_pnl numeric;
alter table public.trades add column if not exists closed_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'trades_quantity_positive_check' and conrelid = 'public.trades'::regclass) then
    alter table public.trades add constraint trades_quantity_positive_check check (quantity > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trades_entry_candle_index_nonnegative' and conrelid = 'public.trades'::regclass) then
    alter table public.trades add constraint trades_entry_candle_index_nonnegative check (entry_candle_index >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trades_status_values_check' and conrelid = 'public.trades'::regclass) then
    alter table public.trades add constraint trades_status_values_check check (status in ('open', 'closed', 'cancelled'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'simulation_sessions_status_values_check' and conrelid = 'public.simulation_sessions'::regclass) then
    alter table public.simulation_sessions add constraint simulation_sessions_status_values_check check (status in ('active', 'closed'));
  end if;
end $$;
create index if not exists trades_user_created_idx on public.trades(user_id, created_at desc);
create index if not exists trades_session_created_idx on public.trades(session_id, created_at desc);

create or replace function public.set_app_user_password(
  p_username text,
  p_password text,
  p_balance numeric default 0,
  p_role text default 'user'
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_username is null or char_length(trim(p_username)) not between 2 and 32 then
    raise exception 'username must contain 2 to 32 characters';
  end if;
  if p_password is null or octet_length(p_password) > 72 then
    raise exception 'password must contain 1 to 72 bytes';
  end if;
  if p_balance is null or p_balance < 0 then raise exception 'balance must be non-negative'; end if;
  if p_role is null or p_role not in ('user', 'admin') then raise exception 'invalid role'; end if;

  insert into public.app_users (username, password_hash, balance, role)
  values (lower(trim(p_username)), extensions.crypt(p_password, extensions.gen_salt('bf', 10)), p_balance, p_role)
  on conflict (username) do update
    set password_hash = excluded.password_hash,
        balance = excluded.balance,
        role = excluded.role,
        updated_at = now();
end;
$$;

create or replace function public.authenticate_app_user(p_username text, p_password text)
returns table(id uuid, username text, role text, balance numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.app_users%rowtype;
  v_exists boolean;
  v_hash text;
  v_candidate text;
begin
  select u.* into v_user from public.app_users as u where u.username = lower(trim(coalesce(p_username, '')));
  v_exists := found;
  -- A valid fixed-cost bcrypt salt is used for missing usernames so both
  -- paths perform the same password-hash operation.
  v_hash := coalesce(v_user.password_hash, '$2a$10$' || repeat('.', 22));
  v_candidate := extensions.crypt(coalesce(p_password, ''), v_hash);

  if v_exists and v_candidate = v_user.password_hash then
    return query select v_user.id, v_user.username, v_user.role, v_user.balance;
  end if;
end;
$$;

create or replace function public.create_app_user(
  p_username text, p_password text, p_balance numeric, p_role text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user public.app_users%rowtype;
begin
  if p_username is null or char_length(trim(p_username)) not between 2 and 32 then raise exception 'invalid username'; end if;
  if p_password is null or char_length(p_password) < 1 or octet_length(p_password) > 72 then raise exception 'invalid password'; end if;
  if p_balance is null or p_balance < 0 then raise exception 'invalid balance'; end if;
  if p_role is null or p_role not in ('user', 'admin') then raise exception 'invalid role'; end if;

  insert into public.app_users (username, password_hash, balance, role)
  values (lower(trim(p_username)), extensions.crypt(p_password, extensions.gen_salt('bf', 10)), p_balance, p_role)
  returning * into v_user;
  return jsonb_build_object('id', v_user.id, 'username', v_user.username, 'role', v_user.role,
    'balance', v_user.balance, 'created_at', v_user.created_at, 'updated_at', v_user.updated_at);
end;
$$;

create or replace function public.update_app_user(
  p_user_id uuid, p_username text default null, p_password text default null,
  p_balance numeric default null, p_role text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user public.app_users%rowtype;
begin
  if p_username is not null and char_length(trim(p_username)) not between 2 and 32 then raise exception 'invalid username'; end if;
  if p_password is not null and (char_length(p_password) < 1 or octet_length(p_password) > 72) then raise exception 'invalid password'; end if;
  if p_balance is not null and p_balance < 0 then raise exception 'invalid balance'; end if;
  if p_role is not null and p_role not in ('user', 'admin') then raise exception 'invalid role'; end if;

  update public.app_users
     set username = coalesce(lower(trim(p_username)), username),
         password_hash = case when p_password is null then password_hash else extensions.crypt(p_password, extensions.gen_salt('bf', 10)) end,
         balance = coalesce(p_balance, balance),
         role = coalesce(p_role, role),
         updated_at = now()
   where id = p_user_id
   returning * into v_user;
  if not found then raise exception 'user not found' using errcode = 'P0002'; end if;
  if p_password is not null then delete from public.app_sessions where user_id = p_user_id; end if;

  return jsonb_build_object('id', v_user.id, 'username', v_user.username, 'role', v_user.role,
    'balance', v_user.balance, 'created_at', v_user.created_at, 'updated_at', v_user.updated_at);
end;
$$;

drop function if exists public.place_trade(uuid, uuid, text, text, text, numeric, numeric, numeric);
create or replace function public.place_trade(
  p_user_id uuid,
  p_session_id uuid,
  p_scenario_id text,
  p_asset text,
  p_side text,
  p_entry numeric,
  p_quantity numeric,
  p_stop numeric,
  p_candle_index integer
) returns public.trades
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.app_users%rowtype;
  v_session public.simulation_sessions%rowtype;
  v_notional numeric;
  v_delta numeric;
  v_risk numeric;
  v_trade public.trades%rowtype;
begin
  if p_side is null or p_side not in ('buy', 'sell') then raise exception 'invalid side'; end if;
  if p_quantity is null or p_quantity::text in ('NaN', 'Infinity', '-Infinity') or p_quantity < 0.01
     or p_entry is null or p_entry::text in ('NaN', 'Infinity', '-Infinity') or p_entry <= 0 then
    raise exception 'quantity and price must be positive';
  end if;
  if p_stop is not null and (p_stop::text in ('NaN', 'Infinity', '-Infinity')
     or (p_side = 'buy' and p_stop >= p_entry) or (p_side = 'sell' and p_stop <= p_entry)) then
    raise exception 'stop loss is on the wrong side of the entry price';
  end if;

  select * into v_user from public.app_users where id = p_user_id for update;
  if not found then raise exception 'user not found'; end if;
  select * into v_session from public.simulation_sessions
   where id = p_session_id and user_id = p_user_id and scenario_id = p_scenario_id and status = 'active'
   for update;
  if not found then raise exception 'simulation session not found'; end if;
  if v_session.current_candle_index <> p_candle_index then
    raise exception 'simulation price changed; refresh before opening a trade' using errcode = '40001';
  end if;

  v_notional := round(p_entry * p_quantity, 2);
  if v_user.balance < v_notional then
    raise exception 'insufficient funds: need %, available %', v_notional, v_user.balance using errcode = 'P0001';
  end if;

  -- Long opens spend cash; shorts receive sale proceeds after a full-notional
  -- margin check. Closing uses the opposite cash flow; realized P&L is stored
  -- for the journal and is not added a second time to the balance.
  v_delta := case when p_side = 'buy' then -v_notional else v_notional end;
  v_risk := round((case when p_stop is null then v_notional else abs(p_entry - p_stop) * p_quantity end)
    / nullif(v_user.balance, 0) * 100, 4);

  insert into public.trades (user_id, session_id, scenario_id, asset_symbol, side, entry_price, quantity, entry_candle_index, stop_loss, risk_percent)
  values (p_user_id, p_session_id, p_scenario_id, p_asset, p_side, p_entry, p_quantity, p_candle_index, p_stop, coalesce(v_risk, 0))
  returning * into v_trade;

  update public.app_users set balance = balance + v_delta, updated_at = now() where id = p_user_id returning * into v_user;
  update public.simulation_sessions set current_balance = v_user.balance, updated_at = now() where id = p_session_id;
  return v_trade;
end;
$$;

create or replace function public.advance_simulation_session(
  p_user_id uuid,
  p_session_id uuid,
  p_last_candle_index integer
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.simulation_sessions%rowtype;
begin
  if p_last_candle_index is null or p_last_candle_index < 0 then
    raise exception 'last candle index must be non-negative';
  end if;
  select * into v_session from public.simulation_sessions
   where id = p_session_id and user_id = p_user_id and status = 'active'
   for update;
  if not found then raise exception 'simulation session not found'; end if;
  if v_session.current_candle_index < p_last_candle_index then
    update public.simulation_sessions
       set current_candle_index = current_candle_index + 1, updated_at = now()
     where id = p_session_id
     returning * into v_session;
  end if;
  return v_session.current_candle_index;
end;
$$;

create or replace function public.restart_simulation_session(p_user_id uuid, p_session_id uuid)
returns table(new_session_id uuid, current_candle_index integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.app_users%rowtype;
  v_session public.simulation_sessions%rowtype;
  v_new public.simulation_sessions%rowtype;
begin
  select * into v_user from public.app_users where id = p_user_id for update;
  if not found then raise exception 'user not found'; end if;
  select * into v_session from public.simulation_sessions
   where id = p_session_id and user_id = p_user_id and status = 'active'
   for update;
  if not found then raise exception 'simulation session not found'; end if;
  if exists (select 1 from public.trades where session_id = p_session_id and status = 'open') then
    raise exception 'close all open trades before restarting';
  end if;

  update public.simulation_sessions set status = 'closed', updated_at = now() where id = p_session_id;
  insert into public.simulation_sessions (user_id, scenario_id, starting_balance, current_balance, current_candle_index, status)
  values (p_user_id, v_session.scenario_id, v_user.balance, v_user.balance, 0, 'active')
  returning * into v_new;
  return query select v_new.id, v_new.current_candle_index;
end;
$$;

create or replace function public.close_trade(p_user_id uuid, p_trade_id uuid, p_exit numeric)
returns public.trades
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_user public.app_users%rowtype;
  v_trade public.trades%rowtype;
  v_pnl numeric;
  v_cash numeric;
begin
  if p_exit is null or p_exit::text in ('NaN', 'Infinity', '-Infinity') or p_exit <= 0 then raise exception 'exit price must be positive'; end if;
  select user_id into v_owner from public.trades where id = p_trade_id;
  if not found or v_owner <> p_user_id then raise exception 'trade not found' using errcode = 'P0002'; end if;

  select * into v_user from public.app_users where id = p_user_id for update;
  if not found then raise exception 'user not found'; end if;
  select * into v_trade from public.trades where id = p_trade_id and user_id = p_user_id for update;
  if not found then raise exception 'trade not found' using errcode = 'P0002'; end if;
  if v_trade.status <> 'open' then raise exception 'trade is not open'; end if;

  if v_trade.side = 'buy' then
    v_pnl := round((p_exit - v_trade.entry_price) * v_trade.quantity, 2);
    v_cash := round(p_exit * v_trade.quantity, 2);
  else
    v_pnl := round((v_trade.entry_price - p_exit) * v_trade.quantity, 2);
    v_cash := -round(p_exit * v_trade.quantity, 2);
  end if;
  if v_user.balance + v_cash < 0 then raise exception 'insufficient funds to close position'; end if;

  update public.trades
     set status = 'closed', exit_price = p_exit, realized_pnl = v_pnl, closed_at = now()
   where id = p_trade_id
   returning * into v_trade;
  update public.app_users set balance = balance + v_cash, updated_at = now() where id = p_user_id returning * into v_user;
  update public.simulation_sessions set current_balance = v_user.balance, updated_at = now() where id = v_trade.session_id;
  return v_trade;
end;
$$;

-- Keep every public table behind service-side route handlers. RLS is enabled
-- including any retained legacy tables; there are deliberately no client policies.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('revoke all on table public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;
grant usage on schema public to service_role;
grant select, insert, update, delete on public.app_users, public.app_sessions, public.simulation_sessions, public.trades to service_role;

revoke all on function public.set_app_user_password(text, text, numeric, text) from public, anon, authenticated, service_role;
revoke all on function public.authenticate_app_user(text, text) from public, anon, authenticated;
revoke all on function public.create_app_user(text, text, numeric, text) from public, anon, authenticated;
revoke all on function public.update_app_user(uuid, text, text, numeric, text) from public, anon, authenticated;
revoke all on function public.place_trade(uuid, uuid, text, text, text, numeric, numeric, numeric, integer) from public, anon, authenticated;
revoke all on function public.advance_simulation_session(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.restart_simulation_session(uuid, uuid) from public, anon, authenticated;
revoke all on function public.close_trade(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.authenticate_app_user(text, text) to service_role;
grant execute on function public.create_app_user(text, text, numeric, text) to service_role;
grant execute on function public.update_app_user(uuid, text, text, numeric, text) to service_role;
grant execute on function public.place_trade(uuid, uuid, text, text, text, numeric, numeric, numeric, integer) to service_role;
grant execute on function public.advance_simulation_session(uuid, uuid, integer) to service_role;
grant execute on function public.restart_simulation_session(uuid, uuid) to service_role;
grant execute on function public.close_trade(uuid, uuid, numeric) to service_role;
alter table public.simulation_sessions
  add column if not exists candles jsonb,
  add column if not exists market_source text not null default 'fallback';

create or replace function public.restart_simulation_session(p_user_id uuid, p_session_id uuid, p_candles jsonb, p_market_source text)
returns table(new_session_id uuid, current_candle_index integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_user public.app_users%rowtype;
  v_session public.simulation_sessions%rowtype;
  v_new public.simulation_sessions%rowtype;
begin
  if jsonb_typeof(p_candles) is distinct from 'array' or jsonb_array_length(p_candles) < 2 then
    raise exception 'a scenario needs at least two candles';
  end if;
  if p_market_source not in ('binance', 'fallback') then raise exception 'invalid market source'; end if;
  select * into v_user from public.app_users where id = p_user_id for update;
  if not found then raise exception 'user not found'; end if;
  select * into v_session from public.simulation_sessions
   where id = p_session_id and user_id = p_user_id and status = 'active' for update;
  if not found then raise exception 'simulation session not found'; end if;
  if exists (select 1 from public.trades where session_id = p_session_id and status = 'open') then
    raise exception 'close all open trades before restarting';
  end if;
  update public.simulation_sessions set status = 'closed', updated_at = now() where id = p_session_id;
  insert into public.simulation_sessions (user_id, scenario_id, starting_balance, current_balance, current_candle_index, candles, market_source, status)
  values (p_user_id, v_session.scenario_id, v_user.balance, v_user.balance, 0, p_candles, p_market_source, 'active')
  returning * into v_new;
  return query select v_new.id, v_new.current_candle_index;
end;
$$;

create or replace function public.advance_simulation_session_atomic(p_user_id uuid, p_session_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user public.app_users%rowtype;
  v_session public.simulation_sessions%rowtype;
  v_trade public.trades%rowtype;
  v_candle jsonb;
  v_stopped jsonb := '[]'::jsonb;
  v_previous_index integer;
  v_next_index integer;
  v_stop numeric;
  v_open numeric;
  v_low numeric;
  v_high numeric;
  v_exit numeric;
  v_pnl numeric;
  v_cash numeric;
  v_closed_at timestamptz;
begin
  select * into v_user from public.app_users where id = p_user_id for update;
  if not found then raise exception 'user not found'; end if;
  select * into v_session from public.simulation_sessions
   where id = p_session_id and user_id = p_user_id and status = 'active' for update;
  if not found then raise exception 'simulation session not found'; end if;
  if jsonb_typeof(v_session.candles) is distinct from 'array' or jsonb_array_length(v_session.candles) < 2 then
    raise exception 'simulation candle snapshot is missing';
  end if;
  v_previous_index := v_session.current_candle_index;
  v_next_index := least(v_previous_index + 1, jsonb_array_length(v_session.candles) - 1);
  if v_next_index > v_previous_index then
    v_session.current_candle_index := v_next_index;
    v_candle := v_session.candles -> v_next_index;
    v_open := (v_candle ->> 'open')::numeric;
    v_low := (v_candle ->> 'low')::numeric;
    v_high := (v_candle ->> 'high')::numeric;

    for v_trade in select * from public.trades
      where session_id = p_session_id and user_id = p_user_id and status = 'open'
        and stop_loss is not null and entry_candle_index < v_next_index
      for update loop
      v_stop := v_trade.stop_loss;
      v_exit := null;
      if v_trade.side = 'buy' and v_low <= v_stop then
        v_exit := case when v_open <= v_stop then v_open else v_stop end;
      elsif v_trade.side = 'sell' and v_high >= v_stop then
        v_exit := case when v_open >= v_stop then v_open else v_stop end;
      end if;
      if v_exit is null then continue; end if;

      v_pnl := round(case when v_trade.side = 'buy'
        then (v_exit - v_trade.entry_price) * v_trade.quantity
        else (v_trade.entry_price - v_exit) * v_trade.quantity end, 2);
      v_cash := round(case when v_trade.side = 'buy'
        then v_exit * v_trade.quantity
        else -v_exit * v_trade.quantity end, 2);
      if v_user.balance + v_cash < 0 then raise exception 'insufficient funds to close position'; end if;
      v_closed_at := now();
      update public.trades set status = 'closed', exit_price = v_exit,
        realized_pnl = v_pnl, closed_at = v_closed_at where id = v_trade.id;
      v_user.balance := round(v_user.balance + v_cash, 2);
      v_stopped := v_stopped || jsonb_build_array(jsonb_build_object(
        'trade_id', v_trade.id,
        'exit_price', v_exit,
        'realized_pnl', v_pnl,
        'closed_at', v_closed_at
      ));
    end loop;
    if jsonb_array_length(v_stopped) > 0 then
      update public.app_users set balance = v_user.balance, updated_at = now() where id = p_user_id;
    end if;
    update public.simulation_sessions set current_candle_index = v_next_index,
      current_balance = v_user.balance, updated_at = now() where id = p_session_id;
  else
    v_candle := v_session.candles -> v_next_index;
  end if;
  return jsonb_build_object(
    'candle_index', v_next_index,
    'candle', v_candle,
    'advanced', v_next_index > v_previous_index,
    'stopped_trades', v_stopped,
    'balance', v_user.balance
  );
end;
$$;

revoke all on function public.restart_simulation_session(uuid, uuid, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.advance_simulation_session_atomic(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.restart_simulation_session(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.advance_simulation_session_atomic(uuid, uuid) to service_role;

alter table public.app_users add column if not exists demo_reset_at timestamptz;

create or replace function public.reset_demo_account(p_user_id uuid, p_balance numeric)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reset_at timestamptz;
  v_balance numeric;
begin
  if p_balance is null or p_balance::text in ('NaN', 'Infinity', '-Infinity')
    or p_balance <= 0 or p_balance > 1000000000000 then
    raise exception 'invalid demo balance';
  end if;

  -- Serialize resets with the existing trade and simulation RPCs.
  perform 1 from public.app_users where id = p_user_id for update;
  if not found then raise exception 'demo user not found'; end if;

  v_reset_at := clock_timestamp();
  update public.trades
     set status = 'cancelled', closed_at = v_reset_at
   where user_id = p_user_id and status = 'open';

  update public.simulation_sessions
     set status = 'closed', updated_at = v_reset_at
   where user_id = p_user_id and status = 'active';

  update public.app_users
     set balance = p_balance, demo_reset_at = v_reset_at, updated_at = v_reset_at
   where id = p_user_id
   returning balance into v_balance;

  return v_balance;
end;
$$;

revoke all on function public.reset_demo_account(uuid, numeric) from public, anon, authenticated;
grant execute on function public.reset_demo_account(uuid, numeric) to service_role;
