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
