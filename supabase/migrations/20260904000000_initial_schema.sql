create extension if not exists "pgcrypto";

create type public.friendship_status as enum ('pending', 'accepted', 'declined');
create type public.event_visibility as enum ('public', 'private');
create type public.event_member_status as enum ('requested', 'invited', 'going', 'declined');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique check (lower(email) like '%@rice.edu'),
  full_name text,
  major text,
  age smallint check (age between 16 and 100),
  class_year text,
  residential_college text,
  avatar_url text,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_complete_when_onboarded check (
    not onboarding_complete
    or (
      nullif(btrim(full_name), '') is not null
      and nullif(btrim(major), '') is not null
      and age is not null
      and class_year is not null
      and class_year in ('Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'Graduate student')
      and residential_college is not null
      and residential_college in (
        'Baker',
        'Brown',
        'Duncan',
        'Hanszen',
        'Jones',
        'Lovett',
        'Martel',
        'McMurtry',
        'Sid Richardson',
        'Wiess',
        'Will Rice'
      )
    )
  )
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

create unique index friendships_unique_pair on public.friendships (
  least(requester_id, addressee_id),
  greatest(requester_id, addressee_id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  description text not null check (char_length(description) between 1 and 600),
  location text not null check (char_length(location) between 2 and 160),
  starts_at timestamptz not null,
  capacity smallint not null check (capacity between 2 and 100),
  visibility public.event_visibility not null default 'public',
  category text not null default 'Other',
  invite_code uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_members (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.event_member_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index events_starts_at_idx on public.events(starts_at);
create index events_host_id_idx on public.events(host_id);
create index event_members_user_id_idx on public.event_members(user_id);
create index friendships_addressee_idx on public.friendships(addressee_id, status);
create index friendships_requester_idx on public.friendships(requester_id, status);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger friendships_updated_at before update on public.friendships
for each row execute function public.set_updated_at();
create trigger events_updated_at before update on public.events
for each row execute function public.set_updated_at();
create trigger event_members_updated_at before update on public.event_members
for each row execute function public.set_updated_at();

create or replace function public.enforce_rice_auth_email()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.email is null or lower(new.email) not like '%@rice.edu' then
    raise exception 'OwlMeet requires a verified @rice.edu email address';
  end if;
  return new;
end;
$$;

create trigger enforce_rice_auth_email
before insert or update of email on auth.users
for each row execute function public.enforce_rice_auth_email();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if lower(new.email) not like '%@rice.edu' then
    raise exception 'OwlMeet requires a verified @rice.edu email address';
  end if;
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.events enable row level security;
alter table public.event_members enable row level security;

create policy "Rice users can view profiles" on public.profiles
for select to authenticated using (true);
create policy "Users can update their own profile" on public.profiles
for update to authenticated using ((select auth.uid()) = id)
with check ((select auth.uid()) = id and lower(email) like '%@rice.edu');

create policy "Participants can view friendships" on public.friendships
for select to authenticated using ((select auth.uid()) in (requester_id, addressee_id));
create policy "Users can send friend requests" on public.friendships
for insert to authenticated with check (
  (select auth.uid()) = requester_id and requester_id <> addressee_id and status = 'pending'
);
create policy "Recipients can answer requests" on public.friendships
for update to authenticated using ((select auth.uid()) = addressee_id)
with check ((select auth.uid()) = addressee_id and status in ('accepted', 'declined'));
create policy "Participants can remove friendships" on public.friendships
for delete to authenticated using ((select auth.uid()) in (requester_id, addressee_id));

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

create policy "Users can view accessible events" on public.events
for select to authenticated using (public.can_view_event(events));
create policy "Users can create events" on public.events
for insert to authenticated with check ((select auth.uid()) = host_id);
create policy "Hosts can update events" on public.events
for update to authenticated using ((select auth.uid()) = host_id)
with check ((select auth.uid()) = host_id);
create policy "Hosts can delete events" on public.events
for delete to authenticated using ((select auth.uid()) = host_id);

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

create policy "Users can view relevant event members" on public.event_members
for select to authenticated using (
  public.can_view_event_member(event_id, user_id, status)
);
create policy "Users can request public events" on public.event_members
for insert to authenticated with check (
  user_id = (select auth.uid()) and status = 'requested'
  and exists (select 1 from public.events e where e.id = event_id and e.visibility = 'public')
);
create policy "Hosts can invite users" on public.event_members
for insert to authenticated with check (
  status = 'invited'
  and exists (select 1 from public.events e where e.id = event_id and e.host_id = (select auth.uid()))
  and exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = (select auth.uid()) and f.addressee_id = user_id)
        or (f.addressee_id = (select auth.uid()) and f.requester_id = user_id))
  )
);
create policy "Hosts or invited users can update attendance" on public.event_members
for update to authenticated using (
  user_id = (select auth.uid())
  or exists (select 1 from public.events e where e.id = event_id and e.host_id = (select auth.uid()))
) with check (
  user_id = (select auth.uid())
  or exists (select 1 from public.events e where e.id = event_id and e.host_id = (select auth.uid()))
);
create or replace function public.validate_event_member_change()
returns trigger language plpgsql set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  event_host uuid;
  going_count integer;
  event_capacity integer;
begin
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

create trigger validate_event_member_change
before insert or update on public.event_members
for each row execute function public.validate_event_member_change();

create or replace function public.protect_event_host_attendance()
returns trigger language plpgsql set search_path = '' as $$
declare event_host uuid;
begin
  select host_id into event_host
  from public.events
  where id = old.event_id;

  if old.user_id = event_host and new.status <> 'going' then
    raise exception 'The event host must remain in Going';
  end if;
  return new;
end;
$$;

create trigger protect_event_host_attendance
before update on public.event_members
for each row execute function public.protect_event_host_attendance();

create or replace function public.join_private_event(code uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target_id uuid;
begin
  select id into target_id from public.events where invite_code = code and visibility = 'private';
  if target_id is null then raise exception 'Invalid invitation'; end if;
  insert into public.event_members(event_id, user_id, status)
  values (target_id, (select auth.uid()), 'invited')
  on conflict (event_id, user_id) do nothing;
  return target_id;
end;
$$;
grant execute on function public.join_private_event(uuid) to authenticated;
