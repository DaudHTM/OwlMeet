revoke all on function public.handle_new_user() from public;
revoke all on function public.set_updated_at() from public;
revoke all on function public.validate_event_member_change() from public;
revoke all on function public.add_event_host_as_attendee() from public;
revoke all on function public.can_view_event(public.events) from public;
revoke all on function public.can_view_event_members(uuid) from public;
revoke all on function public.join_private_event(uuid) from public;

grant execute on function public.can_view_event(public.events) to authenticated;
grant execute on function public.can_view_event_members(uuid) to authenticated;
grant execute on function public.join_private_event(uuid) to authenticated;

-- New Supabase projects do not automatically expose public tables to the Data
-- API. Grant only the operations OwlMeet's authenticated clients require; RLS
-- policies below and in the initial migration still decide which rows are
-- accessible.
grant usage on schema public to authenticated;

grant select on public.profiles to authenticated;
grant update (
  full_name,
  major,
  age,
  class_year,
  residential_college,
  avatar_url,
  onboarding_complete
) on public.profiles to authenticated;

grant select, insert, update, delete on public.friendships to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.event_members to authenticated;

revoke select on public.profiles from authenticated;
grant select (
  id,
  full_name,
  major,
  age,
  class_year,
  residential_college,
  avatar_url,
  onboarding_complete,
  created_at,
  updated_at
) on public.profiles to authenticated;

create or replace function public.validate_event_member_change()
returns trigger language plpgsql set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  event_host uuid;
  going_count integer;
  event_capacity integer;
begin
  if tg_op = 'UPDATE' and (old.event_id <> new.event_id or old.user_id <> new.user_id) then
    raise exception 'Event membership identity cannot be changed';
  end if;

  select host_id, capacity into event_host, event_capacity
  from public.events where id = new.event_id
  for update;

  if tg_op = 'UPDATE' and actor = new.user_id and actor <> event_host then
    if not (
      (old.status = 'invited' and new.status in ('going', 'declined'))
      or (old.status in ('requested', 'going') and new.status = 'declined')
    ) then
      raise exception 'Invalid attendance status change';
    end if;
  end if;

  if new.status = 'going' and (tg_op = 'INSERT' or old.status <> 'going') then
    select count(*) into going_count from public.event_members
    where event_id = new.event_id and status = 'going';
    if going_count >= event_capacity then
      raise exception 'This event is full';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.validate_event_capacity()
returns trigger language plpgsql set search_path = '' as $$
declare going_count integer;
begin
  select count(*) into going_count from public.event_members
  where event_id = new.id and status = 'going';
  if new.capacity < going_count then
    raise exception 'Capacity cannot be lower than the current Going count';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_event_capacity() from public;

create trigger validate_event_capacity
before update of capacity on public.events
for each row execute function public.validate_event_capacity();
