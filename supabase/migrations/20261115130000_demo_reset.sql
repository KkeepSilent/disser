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
