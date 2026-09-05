import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { loadNativeData } from "./src/data";
import { demoMobileEvents, demoPeople } from "./src/demo";
import { riceLocalToISOString } from "./src/rice-time";
import { isDemoMode, supabase } from "./src/supabase";
import type { EventVisibility, OwlEvent, Person, Profile } from "./src/types";

type Screen = "auth" | "check" | "onboarding" | "main";
type Tab = "discover" | "events" | "friends" | "profile";

const colors = {
  ink: "#17312f",
  muted: "#6f7975",
  green: "#1d4e4a",
  greenSoft: "#dce9e3",
  cream: "#f7f3e8",
  paper: "#fffdf8",
  gold: "#e6aa4d",
  goldSoft: "#f8e8c7",
  coral: "#d97956",
  line: "#dedfd7",
};

const years = ["Freshman", "Sophomore", "Junior", "Senior", "Graduate"];
const colleges = ["Baker", "Brown", "Duncan", "Hanszen", "Jones", "Lovett", "Martel", "McMurtry", "Sid Richardson", "Wiess", "Will Rice"];
const pendingInviteKey = "owlmeet-native-pending-invite";

function inviteCodeFromUrl(url: string) {
  const parsed = Linking.parse(url);
  const segments = (parsed.path ?? "").split("/").filter(Boolean);
  if (parsed.hostname === "invite") return segments[0] ?? null;
  if (segments[0] === "invite") return segments[1] ?? null;
  return null;
}

export default function App() {
  const incomingUrl = Linking.useLinkingURL();
  const [screen, setScreen] = useState<Screen>("auth");
  const [tab, setTab] = useState<Tab>("discover");
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [events, setEvents] = useState<OwlEvent[]>(demoMobileEvents);
  const [friends, setFriends] = useState<Person[]>([demoPeople[2], demoPeople[4]]);
  const [requests, setRequests] = useState<Person[]>([demoPeople[0], demoPeople[3]]);
  const [suggestions, setSuggestions] = useState<Person[]>([demoPeople[1]]);
  const [selectedEvent, setSelectedEvent] = useState<OwlEvent | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async (userId: string, userEmail: string) => {
    const data = await loadNativeData(supabase, userId, userEmail);
    setProfile(data.profile);
    setEvents(data.events);
    setFriends(data.friends);
    setRequests(data.requests);
    setSuggestions(data.suggestions);
    setScreen(data.onboardingComplete ? "main" : "onboarding");
  }, []);

  const claimPendingInvite = useCallback(async () => {
    const inviteCode = localStorage.getItem(pendingInviteKey);
    if (!inviteCode) return;
    const { error } = await supabase.rpc("join_private_event", { code: inviteCode });
    if (error) {
      setMessage(error.message);
      return;
    }
    localStorage.removeItem(pendingInviteKey);
    setMessage("Private invitation added to My events");
  }, []);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      if (isDemoMode) {
        const saved = localStorage.getItem("owlmeet-native-demo-profile-v1");
        if (saved) {
          setProfile(JSON.parse(saved) as Profile);
          setScreen("main");
        }
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        await claimPendingInvite();
        await refresh(data.session.user.id, data.session.user.email ?? "");
      }
    });
  }, [claimPendingInvite, refresh]);

  useEffect(() => {
    if (!incomingUrl || isDemoMode) return;
    void Promise.resolve().then(async () => {
      const parsed = Linking.parse(incomingUrl);
      const inviteCode = inviteCodeFromUrl(incomingUrl);
      if (inviteCode) localStorage.setItem(pendingInviteKey, inviteCode);
      const fragment = incomingUrl.includes("#") ? incomingUrl.split("#")[1] : "";
      const fragmentParams = new URLSearchParams(fragment);
      const accessToken = fragmentParams.get("access_token");
      const refreshToken = fragmentParams.get("refresh_token");
      const code = typeof parsed.queryParams?.code === "string" ? parsed.queryParams.code : null;
      if (code) await supabase.auth.exchangeCodeForSession(code);
      else if (accessToken && refreshToken) await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });

      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        if (inviteCode) {
          setScreen("auth");
          setMessage("Sign in with your Rice email to open this private invitation.");
        }
        return;
      }
      await claimPendingInvite();
      await refresh(data.user.id, data.user.email ?? "");
    });
  }, [claimPendingInvite, incomingUrl, refresh]);

  const sendMagicLink = async () => {
    const normalized = email.trim().toLowerCase();
    if (!normalized.endsWith("@rice.edu")) {
      setMessage("Please use your @rice.edu email.");
      return;
    }
    setBusy(true);
    setMessage("");
    if (!isDemoMode) {
      const { error } = await supabase.auth.signInWithOtp({ email: normalized, options: { emailRedirectTo: Linking.createURL("auth/callback") } });
      if (error) {
        setMessage(error.message);
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    setScreen("check");
  };

  const finishOnboarding = async (next: Profile) => {
    setBusy(true);
    if (isDemoMode) {
      localStorage.setItem("owlmeet-native-demo-profile-v1", JSON.stringify(next));
    } else {
      const { error } = await supabase.from("profiles").update({ full_name: next.fullName, major: next.major, age: Number(next.age), class_year: next.year, residential_college: next.college, onboarding_complete: true }).eq("id", next.id);
      if (error) {
        setMessage(error.message);
        setBusy(false);
        return;
      }
    }
    setProfile(next);
    setBusy(false);
    setScreen("main");
  };

  const requestEvent = async (event: OwlEvent) => {
    if (!isDemoMode && profile) {
      const { error } = await supabase.from("event_members").insert({ event_id: event.id, user_id: profile.id, status: "requested" });
      if (error) return Alert.alert("Couldn’t send request", error.message);
    }
    const update = (item: OwlEvent): OwlEvent => item.id === event.id ? { ...item, membership: "requested" } : item;
    setEvents((items) => items.map(update));
    setSelectedEvent((item) => item ? update(item) : null);
    setMessage("Request sent to the host");
  };

  const answerInvitation = async (event: OwlEvent, accepted: boolean) => {
    if (!isDemoMode && profile) {
      const { error } = await supabase.from("event_members").update({ status: accepted ? "going" : "declined" }).eq("event_id", event.id).eq("user_id", profile.id);
      if (error) return Alert.alert("Couldn’t update invitation", error.message);
    }
    setEvents((items) => items.map((item) => item.id === event.id ? { ...item, membership: accepted ? "going" : "declined" } : item));
    setSelectedEvent(null);
    setMessage(accepted ? "You’re going!" : "Invitation declined");
  };

  const approveGuest = async (event: OwlEvent, person: Person) => {
    if (!isDemoMode) {
      const { error } = await supabase.from("event_members").update({ status: "going" }).eq("event_id", event.id).eq("user_id", person.id);
      if (error) return Alert.alert("Couldn’t approve request", error.message);
    }
    const update = (item: OwlEvent): OwlEvent => item.id === event.id ? { ...item, pending: item.pending.filter((guest) => guest.id !== person.id), attendees: [...item.attendees, person] } : item;
    setEvents((items) => items.map(update));
    setSelectedEvent((item) => item ? update(item) : null);
    setMessage(`${person.name} is going`);
  };

  const declineGuest = async (event: OwlEvent, person: Person) => {
    if (!isDemoMode) {
      const { error } = await supabase.from("event_members").update({ status: "declined" }).eq("event_id", event.id).eq("user_id", person.id);
      if (error) return Alert.alert("Couldn’t decline request", error.message);
    }
    const update = (item: OwlEvent): OwlEvent => item.id === event.id ? { ...item, pending: item.pending.filter((guest) => guest.id !== person.id) } : item;
    setEvents((items) => items.map(update));
    setSelectedEvent((item) => item ? update(item) : null);
    setMessage(`${person.name}’s request was declined`);
  };

  const answerFriend = async (person: Person, accepted: boolean) => {
    if (!isDemoMode && profile) {
      const { error } = await supabase.from("friendships").update({ status: accepted ? "accepted" : "declined" }).eq("requester_id", person.id).eq("addressee_id", profile.id);
      if (error) return Alert.alert("Couldn’t update request", error.message);
    }
    setRequests((items) => items.filter((item) => item.id !== person.id));
    if (accepted) setFriends((items) => [...items, person]);
  };

  const addFriend = async (person: Person) => {
    if (!isDemoMode && profile) {
      const { error } = await supabase.from("friendships").insert({ requester_id: profile.id, addressee_id: person.id, status: "pending" });
      if (error) return Alert.alert("Couldn’t send request", error.message);
    }
    setSuggestions((items) => items.filter((item) => item.id !== person.id));
    setMessage(`Friend request sent to ${person.name}`);
  };

  const createEvent = async (draft: EventDraft) => {
    if (!profile) return;
    let startsAt: string;
    try {
      startsAt = riceLocalToISOString(draft.date, draft.time);
    } catch (dateError) {
      return Alert.alert("Check the date and time", dateError instanceof Error ? dateError.message : "Enter a valid date and time");
    }
    const self: Person = { id: profile.id, name: profile.fullName, initials: initials(profile.fullName), subtitle: `${profile.major} · ${profile.year}`, college: profile.college, color: colors.green };
    let id = `demo-${Date.now()}`;
    let inviteCode = id;
    if (!isDemoMode) {
      const { data, error } = await supabase.from("events").insert({ host_id: profile.id, title: draft.title, description: draft.description, location: draft.location, starts_at: startsAt, capacity: Number(draft.capacity), visibility: draft.visibility, category: draft.category }).select("id, invite_code").single();
      if (error) return Alert.alert("Couldn’t create event", error.message);
      id = data.id;
      inviteCode = data.invite_code;
    }
    setEvents((items) => [{ id, inviteCode, ...draft, capacity: Number(draft.capacity), startsAt, host: self, attendees: [self], pending: [], isOwner: true }, ...items]);
    setCreateOpen(false);
    setTab("events");
    setMessage("Event created");
  };

  const signOut = async () => {
    if (!isDemoMode) await supabase.auth.signOut();
    localStorage.removeItem("owlmeet-native-demo-profile-v1");
    setProfile(null);
    setScreen("auth");
    setTab("discover");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      {screen === "auth" && <AuthScreen email={email} setEmail={setEmail} busy={busy} message={message} onContinue={() => void sendMagicLink()} />}
      {screen === "check" && <CheckEmail email={email} onBack={() => setScreen("auth")} onDemo={() => setScreen("onboarding")} />}
      {screen === "onboarding" && <Onboarding email={email} userId={profile?.id ?? "demo-user"} busy={busy} message={message} onFinish={(next) => void finishOnboarding(next)} />}
      {screen === "main" && profile && <MainApp profile={profile} events={events} friends={friends} requests={requests} suggestions={suggestions} tab={tab} setTab={setTab} message={message} clearMessage={() => setMessage("")} onCreate={() => setCreateOpen(true)} onSelect={setSelectedEvent} onFriend={answerFriend} onAddFriend={addFriend} onSignOut={signOut} />}
      <CreateEventModal visible={createOpen} onClose={() => setCreateOpen(false)} onCreate={(draft) => void createEvent(draft)} />
      <EventDetail event={selectedEvent} friends={friends} onClose={() => setSelectedEvent(null)} onRequest={requestEvent} onAnswer={answerInvitation} onApprove={approveGuest} onDecline={declineGuest} />
    </SafeAreaView>
  );
}

function OwlLogo() {
  return <View style={styles.logo}><Text style={styles.logoEyes}>◉◉</Text><Text style={styles.logoBeak}>◆</Text></View>;
}

function AuthScreen({ email, setEmail, busy, message, onContinue }: { email: string; setEmail: (value: string) => void; busy: boolean; message: string; onContinue: () => void }) {
  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}><ScrollView contentContainerStyle={styles.authPage} keyboardShouldPersistTaps="handled"><View style={styles.brandRow}><OwlLogo /><Text style={styles.brand}>OwlMeet</Text></View><View style={styles.authHero}><Text style={styles.eyebrowLight}>✦ MADE FOR RICE STUDENTS</Text><Text style={styles.heroTitle}>Find your people.{"\n"}<Text style={styles.heroAccent}>Do something fun.</Text></Text><Text style={styles.heroCopy}>Low-pressure plans with people who are ready to meet, right here on campus.</Text><View style={styles.previewCard}><DateTile startsAt="2026-09-05T19:00:00-05:00" /><View style={styles.flex}><Text style={styles.previewTitle}>Casual ping pong</Text><Text style={styles.previewMeta}>RMC Game Room · 7:00 PM</Text></View></View></View><View style={styles.authForm}><Text style={styles.eyebrow}>● RICE COMMUNITY ONLY</Text><Text style={styles.pageTitle}>Welcome to OwlMeet</Text><Text style={styles.bodyCopy}>Enter your Rice email and we’ll send a secure sign-in link. No password needed.</Text><Text style={styles.label}>Rice email</Text><TextInput autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="netid@rice.edu" placeholderTextColor="#9da39f" style={styles.input} value={email} onChangeText={setEmail} /><Pressable style={styles.primaryButton} onPress={onContinue} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Continue with Rice email  ›</Text>}</Pressable>{Boolean(message) && <Text style={styles.error}>{message}</Text>}<View style={styles.trustBox}><Text style={styles.trustIcon}>▣</Text><Text style={styles.trustCopy}><Text style={styles.trustStrong}>Your Rice email keeps OwlMeet trusted.{"\n"}</Text>Only verified students can join and see events.</Text></View>{isDemoMode && <Text style={styles.demoText}>Demo mode · No email will be sent</Text>}</View></ScrollView></KeyboardAvoidingView>;
}

function CheckEmail({ email, onBack, onDemo }: { email: string; onBack: () => void; onDemo: () => void }) {
  return <View style={styles.centerPage}><Text style={styles.sendIcon}>➤</Text><Text style={styles.eyebrow}>ONE QUICK STEP</Text><Text style={styles.pageTitle}>Check your inbox</Text><Text style={[styles.bodyCopy, styles.centerText]}>We sent a secure sign-in link to{"\n"}<Text style={styles.bold}>{email}</Text></Text>{isDemoMode && <Pressable style={styles.primaryButton} onPress={onDemo}><Text style={styles.primaryText}>Open demo confirmation  ›</Text></Pressable>}<Pressable onPress={onBack}><Text style={styles.textButton}>Use a different email</Text></Pressable></View>;
}

function Onboarding({ email, userId, busy, message, onFinish }: { email: string; userId: string; busy: boolean; message: string; onFinish: (profile: Profile) => void }) {
  const [form, setForm] = useState({ fullName: "", major: "", age: "", year: "", college: "" });
  const complete = Boolean(form.fullName && form.major && form.age && form.year && form.college);
  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}><ScrollView contentContainerStyle={styles.formPage} keyboardShouldPersistTaps="handled"><OwlLogo /><Text style={styles.eyebrow}>PROFILE SETUP · 1 OF 1</Text><Text style={styles.pageTitle}>Help people know you</Text><Text style={[styles.bodyCopy, styles.centerText]}>A little context makes saying hello much easier.</Text><View style={styles.formCard}><Field label="Your name" value={form.fullName} onChangeText={(value) => setForm({ ...form, fullName: value })} placeholder="What should people call you?" /><Field label="Major" value={form.major} onChangeText={(value) => setForm({ ...form, major: value })} placeholder="e.g. Computer Science" /><Field label="Age" value={form.age} onChangeText={(value) => setForm({ ...form, age: value.replace(/\D/g, "") })} placeholder="18" keyboardType="number-pad" /><ChoiceField label="Year" values={years} selected={form.year} onSelect={(value) => setForm({ ...form, year: value })} /><ChoiceField label="Residential college" values={colleges} selected={form.college} onSelect={(value) => setForm({ ...form, college: value })} />{Boolean(message) && <Text style={styles.error}>{message}</Text>}<Pressable style={[styles.primaryButton, (!complete || busy) && styles.disabled]} disabled={!complete || busy} onPress={() => onFinish({ id: userId, email, ...form })}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Start meeting Owls  ›</Text>}</Pressable></View></ScrollView></KeyboardAvoidingView>;
}

function Field(props: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: "number-pad" }) {
  return <View style={styles.field}><Text style={styles.label}>{props.label}</Text><TextInput {...props} placeholderTextColor="#9da39f" style={styles.input} /></View>;
}

function ChoiceField({ label, values, selected, onSelect }: { label: string; values: string[]; selected: string; onSelect: (value: string) => void }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>{values.map((value) => <Pressable key={value} onPress={() => onSelect(value)} style={[styles.choiceChip, selected === value && styles.choiceChipActive]}><Text style={[styles.choiceText, selected === value && styles.choiceTextActive]}>{value}</Text></Pressable>)}</ScrollView></View>;
}

function MainApp(props: { profile: Profile; events: OwlEvent[]; friends: Person[]; requests: Person[]; suggestions: Person[]; tab: Tab; setTab: (tab: Tab) => void; message: string; clearMessage: () => void; onCreate: () => void; onSelect: (event: OwlEvent) => void; onFriend: (person: Person, accepted: boolean) => void; onAddFriend: (person: Person) => void; onSignOut: () => void }) {
  const plans = props.events.filter((event) => event.isOwner || event.membership === "going" || event.membership === "requested" || event.membership === "invited");
  return <View style={styles.flex}><View style={styles.appHeader}><View style={styles.brandRow}><OwlLogo /><Text style={styles.brand}>OwlMeet</Text></View><Avatar person={{ id: props.profile.id, name: props.profile.fullName, initials: initials(props.profile.fullName), subtitle: "", college: props.profile.college, color: colors.green }} /></View>{Boolean(props.message) && <Pressable style={styles.messageBar} onPress={props.clearMessage}><Text style={styles.messageText}>✓ {props.message}</Text><Text style={styles.messageText}>×</Text></Pressable>}<ScrollView contentContainerStyle={styles.mainScroll}>{props.tab === "discover" && <Discover profile={props.profile} events={props.events.filter((event) => event.visibility === "public")} onCreate={props.onCreate} onSelect={props.onSelect} />}{props.tab === "events" && <MyEvents events={plans} onCreate={props.onCreate} onSelect={props.onSelect} />}{props.tab === "friends" && <Friends requests={props.requests} friends={props.friends} suggestions={props.suggestions} onAnswer={props.onFriend} onAdd={props.onAddFriend} />}{props.tab === "profile" && <ProfileView profile={props.profile} friends={props.friends.length} events={props.events} onSignOut={props.onSignOut} />}</ScrollView><View style={styles.tabBar}><TabButton label="⌂" caption="Discover" active={props.tab === "discover"} onPress={() => props.setTab("discover")} /><TabButton label="▣" caption="Events" active={props.tab === "events"} onPress={() => props.setTab("events")} /><Pressable style={styles.createButton} onPress={props.onCreate}><Text style={styles.createButtonText}>＋</Text></Pressable><TabButton label="♧" caption="Friends" active={props.tab === "friends"} badge={props.requests.length} onPress={() => props.setTab("friends")} /><TabButton label="○" caption="Profile" active={props.tab === "profile"} onPress={() => props.setTab("profile")} /></View></View>;
}

function Discover({ profile, events, onCreate, onSelect }: { profile: Profile; events: OwlEvent[]; onCreate: () => void; onSelect: (event: OwlEvent) => void }) {
  const [category, setCategory] = useState("All");
  const shown = category === "All" ? events : events.filter((event) => event.category === category);
  return <><Text style={styles.eyebrow}>FRIDAY, SEPTEMBER 4</Text><Text style={styles.dashboardTitle}>What’s happening,{"\n"}{profile.fullName.split(" ")[0]}?</Text><Text style={styles.bodyCopy}>Small plans, friendly faces, and no awkward cold approach.</Text><Pressable style={styles.promptCard} onPress={onCreate}><Text style={styles.promptIcon}>♡</Text><View style={styles.flex}><Text style={styles.promptTitle}>Have a plan? Make it social.</Text><Text style={styles.promptCopy}>Even “grabbing lunch” can be an event.</Text></View><Text style={styles.promptArrow}>›</Text></Pressable><View style={styles.sectionHeading}><View><Text style={styles.sectionTitle}>Discover events</Text><Text style={styles.sectionSub}>{shown.length} plans around campus</Text></View></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>{["All", "Games", "Food", "Chill", "Outdoors"].map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[styles.filterChip, category === item && styles.filterChipActive]}><Text style={[styles.filterText, category === item && styles.filterTextActive]}>{item}</Text></Pressable>)}</ScrollView>{shown.map((event) => <EventCard event={event} key={event.id} onPress={() => onSelect(event)} />)}</>;
}

function EventCard({ event, onPress }: { event: OwlEvent; onPress: () => void }) {
  const spots = event.capacity - event.attendees.length;
  return <Pressable style={styles.eventCard} onPress={onPress}><View style={styles.cardTop}><DateTile startsAt={event.startsAt} /><Text style={styles.category}>{event.category}</Text>{event.visibility === "private" && <Text style={styles.privatePill}>PRIVATE</Text>}</View><Text style={styles.eventTitle}>{event.title}</Text><Text numberOfLines={2} style={styles.eventDescription}>{event.description}</Text><View style={styles.metaRow}><Text style={styles.meta}>◷ {eventTime(event.startsAt)}</Text><Text style={styles.meta}>⌖ {event.location}</Text></View><View style={styles.hostRow}><Avatar person={event.host} small /><Text style={styles.hostText}>Hosted by <Text style={styles.bold}>{event.host.name}</Text></Text></View><View style={styles.cardBottom}><Text style={styles.spots}>{event.attendees.length} going · {spots} spots left</Text>{event.isOwner ? <Text style={styles.managePill}>{event.pending.length ? `${event.pending.length} REQUESTS` : "MANAGE"}</Text> : <Text style={styles.joinPill}>{event.membership === "requested" ? "REQUESTED ✓" : "VIEW EVENT"}</Text>}</View></Pressable>;
}

function MyEvents({ events, onCreate, onSelect }: { events: OwlEvent[]; onCreate: () => void; onSelect: (event: OwlEvent) => void }) {
  return <><Text style={styles.eyebrow}>YOUR CALENDAR</Text><Text style={styles.dashboardTitle}>My events</Text><Text style={styles.bodyCopy}>Plans you’re hosting, joining, or invited to.</Text><Pressable style={styles.primaryButton} onPress={onCreate}><Text style={styles.primaryText}>＋ Create an event</Text></Pressable><View style={styles.listGap}>{events.map((event) => <Pressable style={styles.eventListRow} key={event.id} onPress={() => onSelect(event)}><DateTile startsAt={event.startsAt} /><View style={styles.flex}><Text style={styles.listKicker}>{event.isOwner ? "HOSTING" : event.membership === "invited" ? "INVITATION" : event.membership?.toUpperCase()}</Text><Text style={styles.listTitle}>{event.title}</Text><Text style={styles.listMeta}>{eventTime(event.startsAt)} · {event.location}</Text></View><Text style={styles.chevron}>›</Text></Pressable>)}</View></>;
}

function Friends({ requests, friends, suggestions, onAnswer, onAdd }: { requests: Person[]; friends: Person[]; suggestions: Person[]; onAnswer: (person: Person, accepted: boolean) => void; onAdd: (person: Person) => void }) {
  return <><Text style={styles.eyebrow}>YOUR CAMPUS CIRCLE</Text><Text style={styles.dashboardTitle}>Friends</Text><Text style={styles.bodyCopy}>Connect first, then make the plan.</Text>{requests.length > 0 && <><SectionTitle title="Friend requests" subtitle={`${requests.length} waiting`} />{requests.map((person) => <PersonRow key={person.id} person={person}><Pressable style={styles.smallPrimary} onPress={() => onAnswer(person, true)}><Text style={styles.smallPrimaryText}>Accept</Text></Pressable><Pressable style={styles.roundButton} onPress={() => onAnswer(person, false)}><Text>×</Text></Pressable></PersonRow>)}</>}<SectionTitle title="Your friends" subtitle={`${friends.length} connections`} />{friends.map((person) => <PersonRow key={person.id} person={person}><Text style={styles.friendLabel}>FRIEND ✓</Text></PersonRow>)}<SectionTitle title="People you may know" subtitle="From the Rice community" />{suggestions.map((person) => <PersonRow key={person.id} person={person}><Pressable style={styles.outlineButton} onPress={() => onAdd(person)}><Text style={styles.outlineText}>＋ Add</Text></Pressable></PersonRow>)}</>;
}

function PersonRow({ person, children }: { person: Person; children: React.ReactNode }) {
  return <View style={styles.personRow}><Avatar person={person} /><View style={styles.flex}><Text style={styles.personName}>{person.name}</Text><Text style={styles.personMeta}>{person.subtitle}</Text><Text style={styles.personCollege}>{person.college} College</Text></View><View style={styles.rowActions}>{children}</View></View>;
}

function ProfileView({ profile, friends, events, onSignOut }: { profile: Profile; friends: number; events: OwlEvent[]; onSignOut: () => void }) {
  return <><View style={styles.profileHero}><Avatar person={{ id: profile.id, name: profile.fullName, initials: initials(profile.fullName), subtitle: "", college: profile.college, color: colors.green }} large /><View style={styles.flex}><Text style={styles.verified}>VERIFIED RICE STUDENT ✓</Text><Text style={styles.profileName}>{profile.fullName}</Text><Text style={styles.profileMeta}>{profile.major} · {profile.year}{"\n"}{profile.college} College</Text></View></View><View style={styles.stats}><Stat value={friends} label="Friends" /><Stat value={events.filter((event) => event.isOwner).length} label="Hosted" /><Stat value={events.filter((event) => event.membership === "going").length} label="Joined" /></View><View style={styles.settings}><Setting label="Email" value={profile.email} /><Setting label="Age" value={profile.age} /><Setting label="Visibility" value="Rice students only" /><Pressable style={styles.outlineButton} onPress={onSignOut}><Text style={[styles.outlineText, { color: "#a54139" }]}>Sign out</Text></Pressable></View></>;
}

type EventDraft = { title: string; description: string; location: string; date: string; time: string; capacity: string; visibility: EventVisibility; category: string };

function CreateEventModal({ visible, onClose, onCreate }: { visible: boolean; onClose: () => void; onCreate: (draft: EventDraft) => void }) {
  const [draft, setDraft] = useState<EventDraft>({ title: "", description: "", location: "", date: "2026-09-05", time: "7:00 PM", capacity: "6", visibility: "public", category: "Games" });
  const valid = Boolean(draft.title && draft.description && draft.location && draft.date && draft.time && Number(draft.capacity) >= 2);
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={styles.modalPage}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}><View style={styles.modalHeader}><View><Text style={styles.eyebrow}>BRING PEOPLE TOGETHER</Text><Text style={styles.modalTitle}>Create an event</Text></View><Pressable style={styles.roundButton} onPress={onClose}><Text style={styles.closeText}>×</Text></Pressable></View><ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled"><Field label="Event title" value={draft.title} onChangeText={(value) => setDraft({ ...draft, title: value })} placeholder="e.g. Casual ping pong" /><View style={styles.field}><Text style={styles.label}>What’s the plan?</Text><TextInput multiline style={[styles.input, styles.textarea]} placeholder="Set the vibe and what to expect…" placeholderTextColor="#9da39f" value={draft.description} onChangeText={(value) => setDraft({ ...draft, description: value })} /></View><Field label="Location" value={draft.location} onChangeText={(value) => setDraft({ ...draft, location: value })} placeholder="Where should everyone meet?" /><View style={styles.twoColumns}><View style={styles.flex}><Field label="Date" value={draft.date} onChangeText={(value) => setDraft({ ...draft, date: value })} placeholder="YYYY-MM-DD" /></View><View style={styles.flex}><Field label="Time" value={draft.time} onChangeText={(value) => setDraft({ ...draft, time: value })} placeholder="7:00 PM" /></View></View><Field label="Number of people" value={draft.capacity} onChangeText={(value) => setDraft({ ...draft, capacity: value.replace(/\D/g, "") })} placeholder="6" keyboardType="number-pad" /><ChoiceField label="Category" values={["Games", "Food", "Chill", "Outdoors", "Study", "Other"]} selected={draft.category} onSelect={(category) => setDraft({ ...draft, category })} /><ChoiceField label="Who can see it?" values={["public", "private"]} selected={draft.visibility} onSelect={(visibility) => setDraft({ ...draft, visibility: visibility as EventVisibility })} /><View style={styles.trustBox}><Text style={styles.trustCopy}>{draft.visibility === "public" ? "Anyone at Rice can discover it. You approve who joins." : "Only invited friends or people with your private link can see it."}</Text></View><Pressable style={[styles.primaryButton, !valid && styles.disabled]} disabled={!valid} onPress={() => onCreate(draft)}><Text style={styles.primaryText}>Create event  ›</Text></Pressable></ScrollView></KeyboardAvoidingView></SafeAreaView></Modal>;
}

function EventDetail({ event, friends, onClose, onRequest, onAnswer, onApprove, onDecline }: { event: OwlEvent | null; friends: Person[]; onClose: () => void; onRequest: (event: OwlEvent) => void; onAnswer: (event: OwlEvent, accepted: boolean) => void; onApprove: (event: OwlEvent, person: Person) => void; onDecline: (event: OwlEvent, person: Person) => void }) {
  const [inviting, setInviting] = useState(false);
  if (!event) return null;
  const share = async () => {
    const webBaseUrl = (process.env.EXPO_PUBLIC_WEB_URL ?? "https://owlmeet.app").replace(/\/$/, "");
    const url = `${webBaseUrl}/invite/${event.inviteCode ?? event.id}`;
    await Share.share({ title: `Join ${event.title} on OwlMeet`, message: `Join ${event.title}: ${url}`, url });
  };
  const invite = async (person: Person) => {
    if (!isDemoMode) {
      const { error } = await supabase.from("event_members").insert({ event_id: event.id, user_id: person.id, status: "invited" });
      if (error) return Alert.alert("Couldn’t send invitation", error.message);
    }
    Alert.alert("Invitation sent", `${person.name} can now accept or decline.`);
  };
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={styles.modalPage}><View style={styles.modalHeader}><DateTile startsAt={event.startsAt} /><Pressable style={styles.roundButton} onPress={onClose}><Text style={styles.closeText}>×</Text></Pressable></View><ScrollView contentContainerStyle={styles.modalBody}><Text style={styles.modalTitle}>{event.title}</Text><Text style={styles.eventDescription}>{event.description}</Text><View style={styles.factBox}><Text style={styles.factTitle}>◷ {eventTime(event.startsAt)}</Text><Text style={styles.factSub}>{eventDate(event.startsAt)}</Text><Text style={[styles.factTitle, { marginTop: 12 }]}>⌖ {event.location}</Text><Text style={styles.factSub}>Rice University campus</Text></View><View style={styles.hostRow}><Avatar person={event.host} /><View><Text style={styles.factSub}>HOSTED BY</Text><Text style={styles.personName}>{event.host.name}</Text><Text style={styles.personMeta}>{event.host.subtitle}</Text></View></View><SectionTitle title="Going" subtitle={`${event.attendees.length} of ${event.capacity}`} />{event.attendees.length ? event.attendees.map((person) => <PersonRow key={person.id} person={person}><View /></PersonRow>) : <Text style={styles.emptyText}>No guests yet. Be the first.</Text>}{event.isOwner && event.pending.length > 0 && <><SectionTitle title="Requests" subtitle="Approve people into Going" />{event.pending.map((person) => <PersonRow key={person.id} person={person}><Pressable style={styles.smallPrimary} onPress={() => onApprove(event, person)}><Text style={styles.smallPrimaryText}>Approve</Text></Pressable><Pressable style={styles.roundButton} onPress={() => onDecline(event, person)}><Text>×</Text></Pressable></PersonRow>)}</>}{event.isOwner && <><View style={styles.twoColumns}><Pressable style={styles.outlineButton} onPress={() => setInviting(!inviting)}><Text style={styles.outlineText}>Invite friends</Text></Pressable><Pressable style={styles.outlineButton} onPress={() => void share()}><Text style={styles.outlineText}>Share link</Text></Pressable></View>{inviting && friends.map((person) => <PersonRow key={person.id} person={person}><Pressable style={styles.outlineButton} onPress={() => void invite(person)}><Text style={styles.outlineText}>Invite</Text></Pressable></PersonRow>)}</>}{event.membership === "invited" ? <View style={styles.twoColumns}><Pressable style={styles.outlineButton} onPress={() => void onAnswer(event, false)}><Text style={styles.outlineText}>Decline</Text></Pressable><Pressable style={styles.primaryButton} onPress={() => void onAnswer(event, true)}><Text style={styles.primaryText}>Accept invitation</Text></Pressable></View> : !event.isOwner && <Pressable style={[styles.primaryButton, event.membership === "requested" && styles.disabled]} disabled={event.membership === "requested"} onPress={() => void onRequest(event)}><Text style={styles.primaryText}>{event.membership === "requested" ? "Request sent ✓" : "Request to join"}</Text></Pressable>}</ScrollView></SafeAreaView></Modal>;
}

function Avatar({ person, small, large }: { person: Person; small?: boolean; large?: boolean }) { return <View style={[styles.avatar, { backgroundColor: person.color }, small && styles.avatarSmall, large && styles.avatarLarge]}><Text style={[styles.avatarText, small && styles.avatarTextSmall, large && styles.avatarTextLarge]}>{person.initials}</Text></View>; }
function DateTile({ startsAt }: { startsAt: string }) { const date = new Date(startsAt); return <View style={styles.dateTile}><Text style={styles.dateDay}>{date.toLocaleDateString("en-US", { day: "2-digit", timeZone: "America/Chicago" })}</Text><Text style={styles.dateMonth}>{date.toLocaleDateString("en-US", { month: "short", timeZone: "America/Chicago" }).toUpperCase()}</Text></View>; }
function TabButton({ label, caption, active, badge, onPress }: { label: string; caption: string; active: boolean; badge?: number; onPress: () => void }) { return <Pressable style={styles.tabButton} onPress={onPress}><Text style={[styles.tabIcon, active && styles.tabActive]}>{label}</Text><Text style={[styles.tabCaption, active && styles.tabActive]}>{caption}</Text>{Boolean(badge) && <Text style={styles.badge}>{badge}</Text>}</Pressable>; }
function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) { return <View style={styles.sectionHeading}><View><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionSub}>{subtitle}</Text></View></View>; }
function Stat({ value, label }: { value: number; label: string }) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }
function Setting({ label, value }: { label: string; value: string }) { return <View style={styles.setting}><Text style={styles.settingLabel}>{label}</Text><Text style={styles.settingValue}>{value}</Text></View>; }
function initials(name: string) { return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "OW"; }
function eventTime(value: string) { return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }); }
function eventDate(value: string) { return new Date(value).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago" }); }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream }, flex: { flex: 1 }, authPage: { flexGrow: 1, backgroundColor: colors.green }, brandRow: { flexDirection: "row", alignItems: "center", gap: 9 }, brand: { color: colors.ink, fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontWeight: "700", fontSize: 21 }, logo: { width: 34, height: 32, borderRadius: 14, backgroundColor: colors.paper, alignItems: "center", justifyContent: "center" }, logoEyes: { color: colors.green, fontWeight: "900", fontSize: 11, letterSpacing: 2 }, logoBeak: { color: colors.gold, fontSize: 6, marginTop: -3 }, authHero: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 34 }, eyebrowLight: { color: "#b6dbd1", fontSize: 11, letterSpacing: 1.5, fontWeight: "800" }, heroTitle: { color: "#fff", fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 45, lineHeight: 48, fontWeight: "700", marginTop: 19 }, heroAccent: { color: "#f1c06f", fontStyle: "italic", fontWeight: "400" }, heroCopy: { color: "rgba(255,255,255,.72)", fontSize: 16, lineHeight: 24, marginTop: 18 }, previewCard: { flexDirection: "row", gap: 12, alignItems: "center", padding: 13, borderRadius: 15, backgroundColor: "rgba(255,255,255,.1)", borderWidth: 1, borderColor: "rgba(255,255,255,.18)", marginTop: 28 }, previewTitle: { color: "#fff", fontWeight: "800", fontSize: 14 }, previewMeta: { color: "rgba(255,255,255,.6)", fontSize: 11, marginTop: 4 }, authForm: { backgroundColor: colors.paper, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 25, paddingBottom: 45 }, eyebrow: { color: "#2f6d64", fontSize: 10, letterSpacing: 1.4, fontWeight: "800", marginTop: 7 }, pageTitle: { color: colors.ink, fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 35, lineHeight: 40, fontWeight: "700", marginTop: 12 }, bodyCopy: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 9, marginBottom: 22 }, label: { color: colors.ink, fontSize: 12, fontWeight: "700", marginBottom: 7 }, input: { color: colors.ink, backgroundColor: "#fff", borderWidth: 1, borderColor: "#d7dbd4", borderRadius: 11, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14 }, textarea: { minHeight: 105, textAlignVertical: "top" }, primaryButton: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 11, paddingHorizontal: 15, backgroundColor: colors.green, marginTop: 13 }, primaryText: { color: "#fff", fontSize: 13, fontWeight: "800" }, disabled: { opacity: .55 }, error: { color: "#a54139", fontSize: 12, marginTop: 10 }, trustBox: { flexDirection: "row", gap: 10, alignItems: "flex-start", padding: 14, borderRadius: 12, backgroundColor: "#edf4f0", marginTop: 20 }, trustIcon: { color: colors.green, fontSize: 17 }, trustCopy: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 17 }, trustStrong: { color: colors.green, fontWeight: "800" }, demoText: { color: "#9a958a", fontSize: 10, textAlign: "center", marginTop: 15 }, centerPage: { flex: 1, justifyContent: "center", padding: 30, alignItems: "stretch" }, centerText: { textAlign: "center" }, sendIcon: { alignSelf: "center", width: 72, height: 72, paddingTop: 21, color: colors.green, backgroundColor: colors.greenSoft, textAlign: "center", borderRadius: 36, fontSize: 26, marginBottom: 22 }, textButton: { color: colors.green, textAlign: "center", fontWeight: "700", fontSize: 12, padding: 18 }, bold: { fontWeight: "800", color: colors.ink }, formPage: { padding: 24, paddingTop: 36, alignItems: "center" }, formCard: { width: "100%", gap: 17, padding: 20, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, marginTop: 20 }, field: { width: "100%" }, chipRow: { gap: 7, paddingRight: 8 }, choiceChip: { paddingVertical: 9, paddingHorizontal: 13, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: "#fff" }, choiceChipActive: { backgroundColor: colors.green, borderColor: colors.green }, choiceText: { color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "capitalize" }, choiceTextActive: { color: "#fff" }, appHeader: { height: 58, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }, mainScroll: { padding: 18, paddingTop: 32, paddingBottom: 110 }, dashboardTitle: { color: colors.ink, fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 38, lineHeight: 42, fontWeight: "700", marginTop: 9 }, messageBar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 9, backgroundColor: colors.greenSoft }, messageText: { color: colors.green, fontSize: 11, fontWeight: "700" }, promptCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 15, borderRadius: 15, backgroundColor: colors.green, marginTop: 7, marginBottom: 26 }, promptIcon: { width: 39, height: 39, paddingTop: 8, borderRadius: 10, textAlign: "center", color: colors.green, backgroundColor: colors.gold, fontSize: 20, fontWeight: "700" }, promptTitle: { color: "#fff", fontWeight: "800", fontSize: 12 }, promptCopy: { color: "rgba(255,255,255,.65)", fontSize: 10, marginTop: 3 }, promptArrow: { color: "#fff", fontSize: 25 }, sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 26, marginBottom: 14 }, sectionTitle: { color: colors.ink, fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 23, fontWeight: "700" }, sectionSub: { color: colors.muted, fontSize: 10, marginTop: 3 }, filterChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.line }, filterChipActive: { backgroundColor: colors.green, borderColor: colors.green }, filterText: { color: colors.muted, fontWeight: "700", fontSize: 11 }, filterTextActive: { color: "#fff" }, eventCard: { padding: 18, backgroundColor: colors.paper, borderRadius: 17, borderWidth: 1, borderColor: colors.line, marginTop: 12 }, cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 7 }, dateTile: { width: 51, height: 53, borderRadius: 11, backgroundColor: colors.goldSoft, alignItems: "center", justifyContent: "center" }, dateDay: { color: colors.ink, fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 21, lineHeight: 22, fontWeight: "700" }, dateMonth: { color: "#96642f", fontSize: 8, fontWeight: "900", letterSpacing: 1 }, category: { overflow: "hidden", color: colors.green, backgroundColor: colors.greenSoft, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 9, fontSize: 9, fontWeight: "800" }, privatePill: { color: "#765b82", backgroundColor: "#eee5f3", borderRadius: 14, paddingVertical: 6, paddingHorizontal: 9, fontSize: 8, fontWeight: "800" }, eventTitle: { color: colors.ink, fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 23, fontWeight: "700", marginTop: 17 }, eventDescription: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 7 }, metaRow: { gap: 7, marginTop: 15 }, meta: { color: "#41514d", fontSize: 11, fontWeight: "600" }, hostRow: { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 13, marginTop: 15 }, hostText: { color: colors.muted, fontSize: 10 }, cardBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14 }, spots: { color: colors.muted, fontSize: 9 }, joinPill: { color: "#fff", backgroundColor: colors.green, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8, fontSize: 8, fontWeight: "800" }, managePill: { color: colors.green, backgroundColor: colors.greenSoft, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8, fontSize: 8, fontWeight: "800" }, avatar: { width: 39, height: 39, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" }, avatarSmall: { width: 27, height: 27, borderRadius: 14 }, avatarLarge: { width: 72, height: 72, borderRadius: 36, borderWidth: 3 }, avatarText: { color: "#fff", fontSize: 10, fontWeight: "900" }, avatarTextSmall: { fontSize: 7 }, avatarTextLarge: { fontSize: 18 }, tabBar: { position: "absolute", bottom: 0, left: 0, right: 0, height: 74, flexDirection: "row", alignItems: "center", justifyContent: "space-around", backgroundColor: "rgba(255,253,248,.97)", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }, tabButton: { flex: 1, alignItems: "center", gap: 2 }, tabIcon: { color: colors.muted, fontSize: 20 }, tabCaption: { color: colors.muted, fontSize: 8, fontWeight: "700" }, tabActive: { color: colors.green }, badge: { position: "absolute", right: 16, top: 0, color: "#fff", backgroundColor: colors.coral, borderRadius: 8, minWidth: 16, height: 16, textAlign: "center", fontSize: 9, fontWeight: "800", paddingTop: 2 }, createButton: { width: 50, height: 50, marginTop: -25, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: colors.green }, createButtonText: { color: "#fff", fontSize: 29, fontWeight: "300" }, listGap: { gap: 10, marginTop: 22 }, eventListRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 13, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper }, listKicker: { color: colors.green, fontSize: 8, letterSpacing: 1, fontWeight: "900" }, listTitle: { color: colors.ink, fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 17, fontWeight: "700", marginTop: 2 }, listMeta: { color: colors.muted, fontSize: 9, marginTop: 3 }, chevron: { color: colors.muted, fontSize: 25 }, personRow: { flexDirection: "row", alignItems: "center", gap: 11, padding: 13, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, marginBottom: 9 }, personName: { color: colors.ink, fontSize: 13, fontWeight: "800" }, personMeta: { color: colors.muted, fontSize: 9, marginTop: 2 }, personCollege: { color: colors.green, fontSize: 9, marginTop: 2 }, rowActions: { flexDirection: "row", alignItems: "center", gap: 5 }, smallPrimary: { paddingVertical: 8, paddingHorizontal: 11, backgroundColor: colors.green, borderRadius: 8 }, smallPrimaryText: { color: "#fff", fontSize: 9, fontWeight: "800" }, roundButton: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: colors.line }, outlineButton: { minHeight: 39, alignItems: "center", justifyContent: "center", paddingHorizontal: 13, borderRadius: 9, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.line, flex: 1 }, outlineText: { color: colors.green, fontSize: 10, fontWeight: "800" }, friendLabel: { color: colors.green, fontSize: 8, fontWeight: "900" }, profileHero: { flexDirection: "row", alignItems: "center", gap: 15, padding: 20, borderRadius: 18, backgroundColor: colors.green }, verified: { color: "#b7d8ce", fontSize: 8, letterSpacing: 1, fontWeight: "900" }, profileName: { color: "#fff", fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 27, fontWeight: "700", marginTop: 5 }, profileMeta: { color: "rgba(255,255,255,.65)", fontSize: 10, lineHeight: 15, marginTop: 4 }, stats: { flexDirection: "row", marginTop: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper }, stat: { flex: 1, alignItems: "center", paddingVertical: 16 }, statValue: { color: colors.ink, fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 24, fontWeight: "700" }, statLabel: { color: colors.muted, fontSize: 9 }, settings: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, marginTop: 14, gap: 13 }, setting: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingBottom: 12 }, settingLabel: { color: colors.muted, fontSize: 11 }, settingValue: { color: colors.ink, fontSize: 11, fontWeight: "700" }, modalPage: { flex: 1, backgroundColor: colors.paper }, modalHeader: { minHeight: 78, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }, modalTitle: { color: colors.ink, fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 31, fontWeight: "700", marginTop: 4 }, closeText: { color: colors.ink, fontSize: 24 }, modalBody: { padding: 20, paddingBottom: 55, gap: 15 }, twoColumns: { flexDirection: "row", gap: 10 }, factBox: { padding: 15, borderRadius: 12, backgroundColor: "#f1f3ed" }, factTitle: { color: colors.ink, fontSize: 12, fontWeight: "800" }, factSub: { color: colors.muted, fontSize: 9, marginTop: 3 }, emptyText: { color: colors.muted, fontSize: 11, paddingVertical: 8 },
});
