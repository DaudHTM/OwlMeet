create or replace function public.add_event_host_as_attendee()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.event_members (event_id, user_id, status)
  values (new.id, new.host_id, 'going');
  return new;
end;
$$;

create trigger add_event_host_as_attendee
after insert on public.events
for each row execute function public.add_event_host_as_attendee();
