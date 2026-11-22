alter table public.simulation_sessions
  add column if not exists current_candle_index integer not null default 0;
alter table public.trades
  add column if not exists entry_candle_index integer not null default 0;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'simulation_sessions_candle_index_nonnegative' and conrelid = 'public.simulation_sessions'::regclass) then
    alter table public.simulation_sessions add constraint simulation_sessions_candle_index_nonnegative check (current_candle_index >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trades_entry_candle_index_nonnegative' and conrelid = 'public.trades'::regclass) then
    alter table public.trades add constraint trades_entry_candle_index_nonnegative check (entry_candle_index >= 0);
  end if;
end $$;

drop function if exists public.place_trade(uuid, uuid, text, text, text, numeric, numeric, numeric);
create function public.place_trade(
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

create or replace function public.advance_simulation_session(p_user_id uuid, p_session_id uuid, p_last_candle_index integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_session public.simulation_sessions%rowtype;
begin
  if p_last_candle_index is null or p_last_candle_index < 0 then raise exception 'last candle index must be non-negative'; end if;
  select * into v_session from public.simulation_sessions
   where id = p_session_id and user_id = p_user_id and status = 'active' for update;
  if not found then raise exception 'simulation session not found'; end if;
  if v_session.current_candle_index < p_last_candle_index then
    update public.simulation_sessions set current_candle_index = current_candle_index + 1, updated_at = now()
     where id = p_session_id returning * into v_session;
  end if;
  return v_session.current_candle_index;
end;
$$;

create or replace function public.restart_simulation_session(p_user_id uuid, p_session_id uuid)
returns table(new_session_id uuid, current_candle_index integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_user public.app_users%rowtype;
  v_session public.simulation_sessions%rowtype;
  v_new public.simulation_sessions%rowtype;
begin
  select * into v_user from public.app_users where id = p_user_id for update;
  if not found then raise exception 'user not found'; end if;
  select * into v_session from public.simulation_sessions
   where id = p_session_id and user_id = p_user_id and status = 'active' for update;
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

revoke all on function public.place_trade(uuid, uuid, text, text, text, numeric, numeric, numeric, integer) from public, anon, authenticated, service_role;
revoke all on function public.advance_simulation_session(uuid, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.restart_simulation_session(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.place_trade(uuid, uuid, text, text, text, numeric, numeric, numeric, integer) to service_role;
grant execute on function public.advance_simulation_session(uuid, uuid, integer) to service_role;
grant execute on function public.restart_simulation_session(uuid, uuid) to service_role;

-- Preserve the old last-close price for sessions created before candle stepping.
update public.simulation_sessions s
set current_candle_index = case s.scenario_id
  when 'uptrend-basics' then 7
  when 'false-breakout' then 7
  when 'panic-selloff' then 7
end,
updated_at = now()
where s.current_candle_index = 0
  and exists (
    select 1 from public.trades t
    where t.session_id = s.id and t.entry_candle_index = 0
      and ((s.scenario_id = 'uptrend-basics' and t.entry_price = 43760)
        or (s.scenario_id = 'false-breakout' and t.entry_price = 116.7)
        or (s.scenario_id = 'panic-selloff' and t.entry_price = 3014))
  );
