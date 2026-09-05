-- Apply security fixes introduced after the initial OwlMeet project was
-- provisioned. This migration is intentionally safe to run on the existing
-- Supabase database.

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;

revoke update on public.friendships from authenticated;
grant update (status) on public.friendships to authenticated;

create index if not exists friendships_requester_idx
  on public.friendships(requester_id, status);

create or replace function public.can_view_event(target_event public.events)
returns boolean language sql stable security definer set search_path = '' as $$
  select target_event.visibility = 'public'
    or target_event.host_id = (select auth.uid())
    or exists (
      select 1 from public.event_members m
      where m.event_id = target_event.id
        and m.user_id = (select auth.uid())
        and m.status in ('requested', 'invited', 'going')
    );
$$;

drop policy if exists "Users can view relevant event members"
  on public.event_members;

do $$
begin
  if to_regprocedure('public.can_view_event_members(uuid)') is not null then
    execute 'revoke all on function public.can_view_event_members(uuid) from public, anon, authenticated';
    execute 'drop function public.can_view_event_members(uuid)';
  end if;
end;
$$;

create or replace function public.can_view_event_member(
  target_event_id uuid,
  target_user_id uuid,
  target_status public.event_member_status
)
returns boolean language sql stable security definer set search_path = '' as $$
  select target_user_id = (select auth.uid())
  or exists (
    select 1 from public.events e
    where e.id = target_event_id
      and e.host_id = (select auth.uid())
  )
  or (
    target_status = 'going'
    and exists (
      select 1 from public.events e
      where e.id = target_event_id
        and (
          e.visibility = 'public'
          or exists (
            select 1 from public.event_members mine
            where mine.event_id = target_event_id
              and mine.user_id = (select auth.uid())
              and mine.status in ('requested', 'invited', 'going')
          )
        )
    )
  );
$$;

revoke all on function public.can_view_event_member(
  uuid,
  uuid,
  public.event_member_status
) from public;
grant execute on function public.can_view_event_member(
  uuid,
  uuid,
  public.event_member_status
) to authenticated;

create policy "Users can view relevant event members"
on public.event_members
for select to authenticated
using (public.can_view_event_member(event_id, user_id, status));
