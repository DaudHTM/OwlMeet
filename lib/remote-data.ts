import type { SupabaseClient } from "@supabase/supabase-js";
import type { OwlEvent, Person } from "./types";

type RawProfile = { id: string; full_name: string | null; major: string | null; class_year: string | null; residential_college: string | null };
type RawMember = { status: "requested" | "invited" | "going" | "declined"; user_id: string; profile: RawProfile | RawProfile[] | null };
type RawEvent = { id: string; host_id: string; title: string; description: string; location: string; starts_at: string; capacity: number; visibility: "public" | "private"; category: string; invite_code: string; host: RawProfile | RawProfile[] | null; members: RawMember[] | null };
type RawFriendship = { status: "pending" | "accepted" | "declined"; requester_id: string; addressee_id: string; requester: RawProfile | RawProfile[] | null; addressee: RawProfile | RawProfile[] | null };

function single<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function personFromProfile(profile: RawProfile | null): Person {
  const name = profile?.full_name?.trim() || "Rice student";
  const palette = ["#d97956", "#5d85c3", "#9871b5", "#3f8d74", "#b7814e"];
  const colorIndex = name.split("").reduce((total, letter) => total + letter.charCodeAt(0), 0) % palette.length;
  return {
    id: profile?.id ?? "unknown",
    name,
    initials: name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
    major: profile?.major ?? "Major not added",
    year: profile?.class_year ?? "",
    college: profile?.residential_college ?? "",
    color: palette[colorIndex],
  };
}

function riceDate(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function riceTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function mapEvent(raw: RawEvent, userId: string): OwlEvent {
  const members = raw.members ?? [];
  const currentMembership = members.find((member) => member.user_id === userId);
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    location: raw.location,
    date: riceDate(raw.starts_at),
    time: riceTime(raw.starts_at),
    capacity: raw.capacity,
    visibility: raw.visibility,
    category: raw.category,
    inviteCode: raw.invite_code,
    host: personFromProfile(single(raw.host)),
    attendees: members.filter((member) => member.status === "going").map((member) => personFromProfile(single(member.profile))),
    pending: members.filter((member) => member.status === "requested").map((member) => personFromProfile(single(member.profile))),
    requested: currentMembership?.status === "requested" || currentMembership?.status === "going",
    invited: currentMembership?.status === "invited",
    isOwner: raw.host_id === userId,
  };
}

export async function loadCommunityData(client: SupabaseClient, userId: string) {
  const [eventsResult, friendshipsResult, profilesResult] = await Promise.all([
    client.from("events").select(`
      id, host_id, title, description, location, starts_at, capacity, visibility, category, invite_code,
      host:profiles!events_host_id_fkey(id, full_name, major, class_year, residential_college),
      members:event_members(status, user_id, profile:profiles!event_members_user_id_fkey(id, full_name, major, class_year, residential_college))
    `).gte("starts_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).order("starts_at", { ascending: true }),
    client.from("friendships").select(`
      status, requester_id, addressee_id,
      requester:profiles!friendships_requester_id_fkey(id, full_name, major, class_year, residential_college),
      addressee:profiles!friendships_addressee_id_fkey(id, full_name, major, class_year, residential_college)
    `),
    client.from("profiles").select("id, full_name, major, class_year, residential_college").eq("onboarding_complete", true).limit(40),
  ]);
  if (eventsResult.error) throw eventsResult.error;
  if (friendshipsResult.error) throw friendshipsResult.error;
  if (profilesResult.error) throw profilesResult.error;

  const friendships = friendshipsResult.data as unknown as RawFriendship[];
  const connectedIds = new Set(friendships.flatMap((item) => [item.requester_id, item.addressee_id]));
  return {
    events: (eventsResult.data as unknown as RawEvent[]).map((event) => mapEvent(event, userId)),
    friends: friendships.filter((item) => item.status === "accepted").map((item) => personFromProfile(single(item.requester_id === userId ? item.addressee : item.requester))),
    requests: friendships.filter((item) => item.status === "pending" && item.addressee_id === userId).map((item) => personFromProfile(single(item.requester))),
    suggestions: (profilesResult.data as RawProfile[]).filter((item) => item.id !== userId && !connectedIds.has(item.id)).map((item) => personFromProfile(item)),
  };
}
