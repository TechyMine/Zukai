-- ==============================================================================
-- Migration 014: Fix get_learning_stats column reference
-- Project: Zukai Audio Learning App
-- Description: Corrects column reference from is_completed to completed on public.playback_progress
-- ==============================================================================

create or replace function public.get_learning_stats()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_total_minutes numeric := 0.0;
  v_tracks_completed int := 0;
  v_streak_days int := 0;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object(
      'total_minutes', 0,
      'tracks_completed', 0,
      'streak_days', 0
    );
  end if;

  -- 1. Total minutes listened
  select coalesce(round(sum(position_seconds) / 60.0, 1), 0.0)
    into v_total_minutes
    from public.playback_progress
   where user_id = v_user_id;

  -- 2. Tracks completed (column name is completed)
  select count(*)
    into v_tracks_completed
    from public.playback_progress
   where user_id = v_user_id
     and completed = true;

  -- 3. Streak days (consecutive distinct days with activity up to today)
  with active_days as (
    select distinct date_trunc('day', updated_at at time zone 'UTC')::date as act_date
      from public.playback_progress
     where user_id = v_user_id
  ),
  ordered_days as (
    select act_date,
           row_number() over (order by act_date desc) as rn
      from active_days
  )
  select count(*)
    into v_streak_days
    from ordered_days
   where act_date >= current_date - interval '1 day' * (rn - 1);

  return jsonb_build_object(
    'total_minutes', coalesce(v_total_minutes, 0.0),
    'tracks_completed', coalesce(v_tracks_completed, 0),
    'streak_days', greatest(coalesce(v_streak_days, 0), 1)
  );
end;
$$;
