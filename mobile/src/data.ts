import type { SupabaseClient } from "@supabase/supabase-js";
import type { OwlEvent, Person, Profile } from "./types";

type RawProfile = { id: string; email?: string; full_name: string | null; major: string | null; age?: number | null; class_year: string | null; residential_college: string | null; onboarding_complete?: boolean };
type RawMember = { status: "requested" | "invited" | "going" | "declined"; user_id: string; profile: RawProfile | RawProfile[] | null };
type RawEvent = { id: string; host_id: string; title: string; description: string; location: string; starts_at: string; capacity: number; visibility: "public" | "private"; category: string; invite_code: string; host: RawProfile | RawProfile[] | null; members: RawMember[] | null };
type RawFriendship = { status: "pending" | "accepted" | "declined"; requester_id: string; addressee_id: string; requester: RawProfile | RawProfile[] | null; addressee: RawProfile | RawProfile[] | null };

function one<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function toPerson(profile: RawProfile | null): Person {
  const name = profile?.full_name?.trim() || "Rice student";
  const colors = ["#d97956", "#5d85c3", "#9871b5", "#3f8d74", "#b7814e"];
  const color = colors[name.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length];
  return {
    id: profile?.id ?? "unknown",
    name,
    initials: name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
    subtitle: [profile?.major, profile?.class_year].filter(Boolean).join(" · "),
    college: profile?.residential_college ?? "",
    color,
  };
}

function toEvent(event: RawEvent, userId: string): OwlEvent {
  const members = event.members ?? [];
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    startsAt: event.starts_at,
    capacity: event.capacity,
    visibility: event.visibility,
    category: event.category,
    inviteCode: event.invite_code,
    host: toPerson(one(event.host)),
    attendees: members.filter((member) => member.status === "going").map((member) => toPerson(one(member.profile))),
    pending: members.filter((member) => member.status === "requested").map((member) => toPerson(one(member.profile))),
    membership: members.find((member) => member.user_id === userId)?.status,
    isOwner: event.host_id === userId,
  };
}

export async function loadNativeData(client: SupabaseClient, userId: string, email: string) {
  const [profileResult, eventsResult, friendshipsResult, profilesResult] = await Promise.all([
    client.from("profiles").select("id, full_name, major, age, class_year, residential_college, onboarding_complete").eq("id", userId).single(),
    client.from("events").select(`
      id, host_id, title, description, location, starts_at, capacity, visibility, category, invite_code,
      host:profiles!events_host_id_fkey(id, full_name, major, class_year, residential_college),
      members:event_members(status, user_id, profile:profiles!event_members_user_id_fkey(id, full_name, major, class_year, residential_college))
    `).gte("starts_at", new Date(Date.now() - 86400000).toISOString()).order("starts_at"),
    client.from("friendships").select(`
      status, requester_id, addressee_id,
      requester:profiles!friendships_requester_id_fkey(id, full_name, major, class_year, residential_college),
      addressee:profiles!friendships_addressee_id_fkey(id, full_name, major, class_year, residential_college)
    `),
    client.from("profiles").select("id, full_name, major, class_year, residential_college").eq("onboarding_complete", true).limit(40),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (friendshipsResult.error) throw friendshipsResult.error;
  if (profilesResult.error) throw profilesResult.error;

  const rawProfile = profileResult.data as RawProfile;
  const profile: Profile = {
    id: rawProfile.id,
    email,
    fullName: rawProfile.full_name ?? "",
    major: rawProfile.major ?? "",
    age: rawProfile.age ? String(rawProfile.age) : "",
    year: rawProfile.class_year ?? "",
    college: rawProfile.residential_college ?? "",
  };
  const friendships = friendshipsResult.data as unknown as RawFriendship[];
  const connectedIds = new Set(friendships.flatMap((item) => [item.requester_id, item.addressee_id]));

  return {
    profile,
    onboardingComplete: Boolean(rawProfile.onboarding_complete),
    events: (eventsResult.data as unknown as RawEvent[]).map((event) => toEvent(event, userId)),
    friends: friendships.filter((item) => item.status === "accepted").map((item) => toPerson(one(item.requester_id === userId ? item.addressee : item.requester))),
    requests: friendships.filter((item) => item.status === "pending" && item.addressee_id === userId).map((item) => toPerson(one(item.requester))),
    suggestions: (profilesResult.data as RawProfile[]).filter((item) => item.id !== userId && !connectedIds.has(item.id)).map(toPerson),
  };
}
