"use client";

import {
  ArrowLeft,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  HeartHandshake,
  Home,
  LockKeyhole,
  MapPin,
  Menu,
  Plus,
  Search,
  Send,
  Sparkles,
  UserRound,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { demoEvents, people } from "@/lib/demo-data";
import { loadCommunityData } from "@/lib/remote-data";
import { riceLocalToISOString } from "@/lib/rice-time";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase";
import type { EventVisibility, OwlEvent, Person, Profile } from "@/lib/types";

type Screen = "welcome" | "check-email" | "onboarding" | "app";
type Tab = "discover" | "events" | "friends" | "profile";
type Toast = { id: number; message: string };

const colleges = ["Baker", "Brown", "Duncan", "Hanszen", "Jones", "Lovett", "Martel", "McMurtry", "Sid Richardson", "Wiess", "Will Rice"];
const years = ["Freshman", "Sophomore", "Junior", "Senior", "Graduate student"];

function OwlMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`owl-mark ${small ? "small" : ""}`} aria-hidden="true">
      <span className="owl-ear left" />
      <span className="owl-ear right" />
      <span className="owl-eye left"><i /></span>
      <span className="owl-eye right"><i /></span>
      <span className="owl-beak" />
    </span>
  );
}

function Avatar({ person, size = "md" }: { person: Person; size?: "sm" | "md" | "lg" }) {
  return <span className={`avatar avatar-${size}`} style={{ background: person.color }}>{person.initials}</span>;
}

function AvatarStack({ people: guests, overflow = 0 }: { people: Person[]; overflow?: number }) {
  return (
    <div className="avatar-stack" aria-label={`${guests.length + overflow} people going`}>
      {guests.slice(0, 3).map((person) => <Avatar key={person.id} person={person} size="sm" />)}
      {overflow > 0 && <span className="avatar avatar-sm overflow">+{overflow}</span>}
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function OwlMeetApp() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [tab, setTab] = useState<Tab>("discover");
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [events, setEvents] = useState<OwlEvent[]>(demoEvents);
  const [friendRequests, setFriendRequests] = useState<Person[]>([people[0], people[3]]);
  const [friends, setFriends] = useState<Person[]>([people[2], people[4]]);
  const [suggestions, setSuggestions] = useState<Person[]>([people[1]]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<OwlEvent | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [filter, setFilter] = useState("All");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const notify = (message: string) => {
    const id = Date.now();
    setToasts((items) => [...items, { id, message }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 2800);
  };

  useEffect(() => {
    void Promise.resolve().then(async () => {
      const saved = window.localStorage.getItem("owlmeet-demo-profile-v1");
      if (saved) {
        setProfile(JSON.parse(saved) as Profile);
        setScreen("app");
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const pendingInvite = window.localStorage.getItem("owlmeet-pending-invite");
      if (pendingInvite) {
        const { error: inviteError } = await supabase.rpc("join_private_event", { code: pendingInvite });
        if (!inviteError) window.localStorage.removeItem("owlmeet-pending-invite");
      }
      const { data: storedProfile } = await supabase.from("profiles").select("id, full_name, major, age, class_year, residential_college, onboarding_complete").eq("id", data.session.user.id).single();
      setEmail(data.session.user.email ?? "");
      if (storedProfile?.onboarding_complete) {
        const nextProfile: Profile = {
          name: storedProfile.full_name,
          email: data.session.user.email ?? "",
          major: storedProfile.major,
          age: storedProfile.age,
          year: storedProfile.class_year,
          college: storedProfile.residential_college,
        };
        setProfile(nextProfile);
        const community = await loadCommunityData(supabase, data.session.user.id);
        setEvents(community.events);
        setFriends(community.friends);
        setFriendRequests(community.requests);
        setSuggestions(community.suggestions);
        setScreen("app");
      } else {
        setScreen("onboarding");
      }
    });
  }, []);

  const sendMagicLink = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!email.trim().toLowerCase().endsWith("@rice.edu")) {
      setError("Please use your Rice University email address.");
      return;
    }
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: window.location.origin },
      });
      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }
    }
    setLoading(false);
    setScreen("check-email");
  };

  const completeOnboarding = async (nextProfile: Profile) => {
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        const { error: saveError } = await supabase.from("profiles").update({
          full_name: nextProfile.name,
          major: nextProfile.major,
          age: nextProfile.age,
          class_year: nextProfile.year,
          residential_college: nextProfile.college,
          onboarding_complete: true,
        }).eq("id", data.user.id);
        if (saveError) {
          setError(saveError.message);
          setLoading(false);
          return;
        }
      }
    } else {
      window.localStorage.setItem("owlmeet-demo-profile-v1", JSON.stringify(nextProfile));
    }
    setProfile(nextProfile);
    setLoading(false);
    setScreen("app");
  };

  const requestSpot = async (eventId: string) => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const { error: requestError } = await supabase.from("event_members").insert({ event_id: eventId, user_id: data.user.id, status: "requested" });
      if (requestError) {
        notify(requestError.message);
        return;
      }
    }
    setEvents((items) => items.map((item) => item.id === eventId ? { ...item, membership: "requested" } : item));
    setSelectedEvent((item) => item?.id === eventId ? { ...item, membership: "requested" } : item);
    notify("Request sent to the host");
  };

  const answerInvite = async (eventId: string, accepted: boolean) => {
    const supabase = getSupabaseBrowserClient();
    let userId = "you";
    if (supabase) {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      userId = data.user.id;
      const { error: answerError } = await supabase.from("event_members").update({ status: accepted ? "going" : "declined" }).eq("event_id", eventId).eq("user_id", data.user.id);
      if (answerError) {
        notify(answerError.message);
        return;
      }
    }
    const self: Person = {
      id: userId,
      name: profile?.name || "You",
      initials: initials(profile?.name),
      major: profile?.major || "",
      year: profile?.year || "",
      college: profile?.college || "",
      color: "#1d4e4a",
    };
    setEvents((items) => items.map((item) => item.id === eventId ? {
      ...item,
      membership: accepted ? "going" : "declined",
      attendees: accepted && !item.attendees.some((person) => person.id === userId)
        ? [...item.attendees, self]
        : item.attendees,
    } : item));
    setSelectedEvent(null);
    notify(accepted ? "You’re going! Added to your plans." : "Invitation declined");
  };

  const approveGuest = async (eventId: string, person: Person) => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { error: approvalError } = await supabase.from("event_members").update({ status: "going" }).eq("event_id", eventId).eq("user_id", person.id);
      if (approvalError) {
        notify(approvalError.message);
        return;
      }
    }
    const update = (item: OwlEvent) => item.id === eventId
      ? { ...item, pending: item.pending.filter((guest) => guest.id !== person.id), attendees: [...item.attendees, person] }
      : item;
    setEvents((items) => items.map(update));
    setSelectedEvent((item) => item ? update(item) : item);
    notify(`${person.name} is going`);
  };

  const declineGuest = async (eventId: string, person: Person) => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { error: declineError } = await supabase.from("event_members").update({ status: "declined" }).eq("event_id", eventId).eq("user_id", person.id);
      if (declineError) {
        notify(declineError.message);
        return;
      }
    }
    const update = (item: OwlEvent) => item.id === eventId ? { ...item, pending: item.pending.filter((guest) => guest.id !== person.id) } : item;
    setEvents((items) => items.map(update));
    setSelectedEvent((item) => item ? update(item) : null);
    notify(`${person.name}’s request was declined`);
  };

  const addEvent = async (newEvent: Omit<OwlEvent, "id" | "host" | "attendees" | "pending" | "isOwner">) => {
    const self: Person = {
      id: "you",
      name: profile?.name || "You",
      initials: (profile?.name || "You").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
      major: profile?.major || "",
      year: profile?.year || "",
      college: profile?.college || "",
      color: "#1d4e4a",
    };
    let id = `event-${Date.now()}`;
    let dateTime: string;
    try {
      dateTime = riceLocalToISOString(newEvent.date, newEvent.time);
    } catch (dateError) {
      notify(dateError instanceof Error ? dateError.message : "Enter a valid date and time");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { data: authData } = await supabase.auth.getUser();
      if (authData.user) {
        const { data, error: insertError } = await supabase.from("events").insert({
          host_id: authData.user.id,
          title: newEvent.title,
          description: newEvent.description,
          location: newEvent.location,
          starts_at: dateTime,
          capacity: newEvent.capacity,
          visibility: newEvent.visibility,
          category: newEvent.category,
        }).select("id, invite_code").single();
        if (insertError) {
          notify(insertError.message);
          return;
        }
        id = data.id;
        newEvent.inviteCode = data.invite_code;
      }
    }
    setEvents((items) => [{ ...newEvent, id, inviteCode: newEvent.inviteCode ?? `demo-${id}`, host: self, attendees: [self], pending: [], isOwner: true }, ...items]);
    setShowCreate(false);
    setTab("events");
    notify("Event created");
  };

  const answerFriendRequest = async (person: Person, accepted: boolean) => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const { error: friendError } = await supabase.from("friendships").update({ status: accepted ? "accepted" : "declined" }).eq("requester_id", person.id).eq("addressee_id", data.user.id);
      if (friendError) {
        notify(friendError.message);
        return;
      }
    }
    setFriendRequests((items) => items.filter((item) => item.id !== person.id));
    if (accepted) {
      setFriends((items) => [...items, person]);
      notify(`You and ${person.name} are now friends`);
    }
  };

  const sendFriendRequest = async (person: Person) => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const { error: requestError } = await supabase.from("friendships").insert({ requester_id: data.user.id, addressee_id: person.id, status: "pending" });
      if (requestError) {
        notify(requestError.message);
        return;
      }
    }
    setSuggestions((items) => items.filter((item) => item.id !== person.id));
    notify(`Friend request sent to ${person.name}`);
  };

  const inviteFriend = async (eventId: string, person: Person) => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { error: inviteError } = await supabase.from("event_members").upsert(
        { event_id: eventId, user_id: person.id, status: "invited" },
        { onConflict: "event_id,user_id" },
      );
      if (inviteError) {
        notify(inviteError.message);
        return;
      }
    }
    notify(`Invitation sent to ${person.name}`);
  };

  const logOut = async () => {
    await getSupabaseBrowserClient()?.auth.signOut();
    window.localStorage.removeItem("owlmeet-demo-profile-v1");
    setProfile(null);
    setScreen("welcome");
    setTab("discover");
  };

  if (screen === "welcome") return <Welcome email={email} setEmail={setEmail} error={error} loading={loading} onSubmit={sendMagicLink} />;
  if (screen === "check-email") return <CheckEmail email={email} onBack={() => setScreen("welcome")} onDemo={() => setScreen("onboarding")} />;
  if (screen === "onboarding") return <Onboarding email={email} loading={loading} error={error} onComplete={completeOnboarding} />;

  const visibleEvents = events.filter((event) => filter === "All" || event.category === filter);
  const upcoming = events.filter((event) => event.isOwner || event.membership === "requested" || event.membership === "invited" || event.membership === "going");

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setTab("discover")}><OwlMark small /><span>OwlMeet</span></button>
        <nav className="desktop-nav" aria-label="Primary navigation">
          <NavButton active={tab === "discover"} onClick={() => setTab("discover")} icon={<Home size={17} />} label="Discover" />
          <NavButton active={tab === "events"} onClick={() => setTab("events")} icon={<CalendarDays size={17} />} label="My events" />
          <NavButton active={tab === "friends"} onClick={() => setTab("friends")} icon={<Users size={17} />} label="Friends" badge={friendRequests.length} />
        </nav>
        <div className="top-actions">
          <button className="icon-btn" aria-label="Notifications"><Bell size={19} /><span className="notification-dot" /></button>
          <button className="profile-chip" onClick={() => setTab("profile")}><span>{profile?.name?.split(" ")[0] || "Owl"}</span><span className="avatar avatar-sm self">{initials(profile?.name)}</span></button>
          <button className="icon-btn mobile-menu" aria-label="Menu" onClick={() => setMenuOpen(!menuOpen)}><Menu size={20} /></button>
        </div>
      </header>

      {menuOpen && <div className="mobile-popover"><button onClick={() => { setTab("profile"); setMenuOpen(false); }}>Profile</button><button onClick={logOut}>Sign out</button></div>}

      <main className="main-content">
        {tab === "discover" && <Discover events={visibleEvents} filter={filter} setFilter={setFilter} profile={profile} onCreate={() => setShowCreate(true)} onSelect={setSelectedEvent} onRequest={(id) => void requestSpot(id)} />}
        {tab === "events" && <MyEvents events={upcoming} onSelect={setSelectedEvent} onCreate={() => setShowCreate(true)} />}
        {tab === "friends" && <FriendsPage requests={friendRequests} friends={friends} suggestions={suggestions} onAccept={(person) => void answerFriendRequest(person, true)} onDecline={(person) => void answerFriendRequest(person, false)} onSend={(person) => void sendFriendRequest(person)} notify={notify} />}
        {tab === "profile" && profile && <ProfilePage profile={profile} events={events} friends={friends} onLogout={logOut} />}
      </main>

      <button className="floating-create" onClick={() => setShowCreate(true)}><Plus size={22} /><span>Create event</span></button>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <NavButton active={tab === "discover"} onClick={() => setTab("discover")} icon={<Home size={20} />} label="Discover" />
        <NavButton active={tab === "events"} onClick={() => setTab("events")} icon={<CalendarDays size={20} />} label="Events" />
        <button className="mobile-create" aria-label="Create event" onClick={() => setShowCreate(true)}><Plus size={26} /></button>
        <NavButton active={tab === "friends"} onClick={() => setTab("friends")} icon={<Users size={20} />} label="Friends" badge={friendRequests.length} />
        <NavButton active={tab === "profile"} onClick={() => setTab("profile")} icon={<UserRound size={20} />} label="Profile" />
      </nav>

      {showCreate && <CreateEventModal onClose={() => setShowCreate(false)} onCreate={addEvent} />}
      {selectedEvent && <EventModal event={selectedEvent} friends={friends} onClose={() => setSelectedEvent(null)} onRequest={(id) => void requestSpot(id)} onInviteAnswer={(id, accepted) => void answerInvite(id, accepted)} onApprove={(id, person) => void approveGuest(id, person)} onDecline={(id, person) => void declineGuest(id, person)} onInvite={(id, person) => void inviteFriend(id, person)} notify={notify} />}
      <div className="toast-region" aria-live="polite">{toasts.map((toast) => <div className="toast" key={toast.id}><Check size={17} />{toast.message}</div>)}</div>
    </div>
  );
}

function Welcome({ email, setEmail, error, loading, onSubmit }: { email: string; setEmail: (value: string) => void; error: string; loading: boolean; onSubmit: (event: FormEvent) => void }) {
  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="story-glow one" /><div className="story-glow two" />
        <div className="auth-brand"><OwlMark small /><span>OwlMeet</span></div>
        <div className="story-copy">
          <span className="eyebrow light"><Sparkles size={15} /> Made for Rice students</span>
          <h1>Find your people.<br /><em>Do something fun.</em></h1>
          <p>Low-pressure plans with people who are ready to meet, right here on campus.</p>
          <div className="mini-event-card">
            <span className="mini-date"><b>05</b>SEP</span>
            <div><strong>Casual ping pong</strong><span><MapPin size={13} /> RMC Game Room · 7:00 PM</span></div>
            <AvatarStack people={people.slice(0, 3)} overflow={1} />
          </div>
        </div>
        <p className="auth-footnote">Built for Owls, by Owls.</p>
      </section>
      <section className="auth-form-panel">
        <div className="auth-card">
          <span className="eyebrow"><span className="status-dot" /> Rice community only</span>
          <h2>Welcome to OwlMeet</h2>
          <p>Enter your Rice email and we’ll send you a secure sign-in link. No password needed.</p>
          <form onSubmit={onSubmit}>
            <Field label="Rice email">
              <div className={`email-input ${error ? "invalid" : ""}`}><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="netid@rice.edu" required autoFocus /></div>
            </Field>
            {error && <p className="form-error">{error}</p>}
            <button className="primary wide" disabled={loading}>{loading ? "Sending…" : <>Continue with Rice email <ChevronRight size={18} /></>}</button>
          </form>
          <div className="trust-note"><LockKeyhole size={17} /><p><strong>Your Rice email keeps OwlMeet trusted.</strong><br />Only verified students can join and see events.</p></div>
          {!hasSupabaseConfig() && <p className="demo-label">Demo mode · No emails will be sent</p>}
        </div>
      </section>
    </main>
  );
}

function CheckEmail({ email, onBack, onDemo }: { email: string; onBack: () => void; onDemo: () => void }) {
  return (
    <main className="center-page">
      <div className="center-card">
        <button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back</button>
        <span className="mail-illustration"><Send size={30} /></span>
        <span className="eyebrow">One quick step</span>
        <h1>Check your inbox</h1>
        <p>We sent a secure sign-in link to <strong>{email}</strong>. The link expires soon.</p>
        {!hasSupabaseConfig() && <button className="primary wide" onClick={onDemo}>Open demo confirmation <ChevronRight size={18} /></button>}
        <button className="text-button" onClick={onBack}>Use a different email</button>
      </div>
    </main>
  );
}

function Onboarding({ email, loading, error, onComplete }: { email: string; loading: boolean; error: string; onComplete: (profile: Profile) => void }) {
  const [form, setForm] = useState({ name: "", major: "", age: "", year: "", college: "" });
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <main className="center-page onboarding-page">
      <div className="onboarding-wrap">
        <div className="onboarding-heading"><OwlMark small /><span className="eyebrow">Profile setup · 1 of 1</span><h1>Help people know you</h1><p>A little context makes saying hello much easier.</p></div>
        <form className="onboarding-card" onSubmit={(event) => { event.preventDefault(); void onComplete({ ...form, age: Number(form.age), email }); }}>
          <Field label="Your name"><input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="What should people call you?" required /></Field>
          <div className="form-grid two"><Field label="Major"><input value={form.major} onChange={(event) => update("major", event.target.value)} placeholder="e.g. Computer Science" required /></Field><Field label="Age"><input value={form.age} onChange={(event) => update("age", event.target.value)} type="number" min="16" max="100" placeholder="18" required /></Field></div>
          <div className="form-grid two"><Field label="Year"><select value={form.year} onChange={(event) => update("year", event.target.value)} required><option value="">Select year</option>{years.map((year) => <option key={year}>{year}</option>)}</select></Field><Field label="Residential college"><select value={form.college} onChange={(event) => update("college", event.target.value)} required><option value="">Select college</option>{colleges.map((college) => <option key={college}>{college}</option>)}</select></Field></div>
          {error && <p className="form-error">{error}</p>}
          <button className="primary wide" disabled={loading}>{loading ? "Saving…" : <>Start meeting Owls <ChevronRight size={18} /></>}</button>
          <p className="privacy-line"><Eye size={14} /> Your age is only shown as part of your profile.</p>
        </form>
      </div>
    </main>
  );
}

function NavButton({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number }) {
  return <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}>{icon}<span>{label}</span>{Boolean(badge) && <b>{badge}</b>}</button>;
}

function Discover({ events, filter, setFilter, profile, onCreate, onSelect, onRequest }: { events: OwlEvent[]; filter: string; setFilter: (filter: string) => void; profile: Profile | null; onCreate: () => void; onSelect: (event: OwlEvent) => void; onRequest: (id: string) => void }) {
  const categories = ["All", "Games", "Food", "Chill", "Outdoors"];
  return (
    <>
      <section className="hero-row">
        <div><span className="eyebrow">Friday, September 4</span><h1>What’s happening, {profile?.name?.split(" ")[0] || "Owl"}?</h1><p>Small plans, friendly faces, and no awkward cold approach.</p></div>
        <button className="primary desktop-create" onClick={onCreate}><Plus size={18} /> Create an event</button>
      </section>
      <section className="prompt-banner"><div className="prompt-icon"><HeartHandshake size={26} /></div><div><strong>Have a plan? Make it social.</strong><span>Even “grabbing lunch” can be an event.</span></div><button onClick={onCreate}>Post a plan <ChevronRight size={16} /></button></section>
      <section className="section-head"><div><h2>Discover events</h2><span>{events.length} plans around campus</span></div><button className="search-button"><Search size={18} /><span>Search</span></button></section>
      <div className="filter-row">{categories.map((category) => <button key={category} className={filter === category ? "active" : ""} onClick={() => setFilter(category)}>{category}</button>)}</div>
      <section className="event-grid">{events.filter((event) => event.visibility === "public").map((event, index) => <EventCard key={event.id} event={event} featured={index === 0 && filter === "All"} onSelect={onSelect} onRequest={onRequest} />)}</section>
    </>
  );
}

function EventCard({ event, featured, onSelect, onRequest }: { event: OwlEvent; featured?: boolean; onSelect: (event: OwlEvent) => void; onRequest: (id: string) => void }) {
  const spots = event.capacity - event.attendees.length;
  const hasActiveMembership = event.membership === "requested" || event.membership === "going";
  return (
    <article className={`event-card ${featured ? "featured" : ""}`} onClick={() => onSelect(event)} onKeyDown={(keyEvent) => { if (keyEvent.key === "Enter" || keyEvent.key === " ") onSelect(event); }} role="button" tabIndex={0}>
      <div className="event-card-top"><span className="date-tile"><b>{dayNumber(event.date)}</b><small>{monthShort(event.date)}</small></span><span className="category-pill">{event.category}</span>{featured && <span className="popular-pill"><Sparkles size={12} /> Popular</span>}</div>
      <h3>{event.title}</h3><p>{event.description}</p>
      <div className="event-meta"><span><Clock3 size={16} /> {event.time}</span><span><MapPin size={16} /> {event.location}</span></div>
      <div className="host-line"><Avatar person={event.host} size="sm" /><span>Hosted by <strong>{event.host.name}</strong></span></div>
      <div className="card-footer"><div><AvatarStack people={event.attendees} /><span>{event.attendees.length} going · {spots} {spots === 1 ? "spot" : "spots"} left</span></div>
        {event.isOwner ? <button className="secondary" onClick={(e) => { e.stopPropagation(); onSelect(event); }}>{event.pending.length ? `${event.pending.length} requests` : "Manage"}</button> : <button className={hasActiveMembership ? "secondary success" : "primary compact"} disabled={hasActiveMembership || event.membership === "declined"} onClick={(e) => { e.stopPropagation(); onRequest(event.id); }}>{event.membership === "going" ? <><Check size={15} /> Going</> : event.membership === "requested" ? <><Check size={15} /> Requested</> : event.membership === "declined" ? "Not approved" : "Request to join"}</button>}
      </div>
    </article>
  );
}

function MyEvents({ events, onSelect, onCreate }: { events: OwlEvent[]; onSelect: (event: OwlEvent) => void; onCreate: () => void }) {
  return <><section className="hero-row compact-hero"><div><span className="eyebrow">Your calendar</span><h1>My events</h1><p>Plans you’re hosting, joining, or invited to.</p></div><button className="primary desktop-create" onClick={onCreate}><Plus size={18} /> Create an event</button></section><div className="event-list">{events.map((event) => <button className="list-event" key={event.id} onClick={() => onSelect(event)}><span className="date-tile"><b>{dayNumber(event.date)}</b><small>{monthShort(event.date)}</small></span><div className="list-event-main"><span className="list-kicker">{event.isOwner ? "Hosting" : event.membership === "invited" ? "Invitation" : event.membership === "going" ? "Going" : "Requested"}</span><h3>{event.title}</h3><p><Clock3 size={15} /> {event.time}<i>·</i><MapPin size={15} /> {event.location}</p></div>{event.membership === "invited" ? <span className="status-pill amber">Needs reply</span> : event.isOwner && event.pending.length ? <span className="status-pill">{event.pending.length} requests</span> : <ChevronRight size={20} />}</button>)}</div></>;
}

function FriendsPage({ requests, friends, suggestions, onAccept, onDecline, onSend, notify }: { requests: Person[]; friends: Person[]; suggestions: Person[]; onAccept: (person: Person) => void; onDecline: (person: Person) => void; onSend: (person: Person) => void; notify: (message: string) => void }) {
  return <><section className="hero-row compact-hero"><div><span className="eyebrow">Your campus circle</span><h1>Friends</h1><p>Connect first, then make the plan.</p></div></section>{requests.length > 0 && <section><div className="section-head"><div><h2>Friend requests</h2><span>{requests.length} waiting</span></div></div><div className="people-grid">{requests.map((person) => <PersonCard key={person.id} person={person}><button className="primary compact" onClick={() => onAccept(person)}><Check size={16} /> Accept</button><button className="icon-btn" onClick={() => onDecline(person)} aria-label={`Decline ${person.name}`}><X size={18} /></button></PersonCard>)}</div></section>}<section><div className="section-head"><div><h2>Your friends</h2><span>{friends.length} connections</span></div></div><div className="people-grid">{friends.map((person) => <PersonCard key={person.id} person={person}><button className="secondary" onClick={() => notify(`Invite picker opened for ${person.name}`)}><Send size={15} /> Invite</button></PersonCard>)}</div></section><section><div className="section-head"><div><h2>People you may know</h2><span>Based on your Rice community</span></div></div><div className="people-grid">{suggestions.map((person) => <PersonCard key={person.id} person={person}><button className="secondary" onClick={() => onSend(person)}><UserRoundCheck size={16} /> Add friend</button></PersonCard>)}</div></section></>;
}

function PersonCard({ person, children }: { person: Person; children: React.ReactNode }) {
  return <article className="person-card"><Avatar person={person} size="lg" /><div><h3>{person.name}</h3><p>{person.major} · {person.year}</p><span>{person.college} College</span></div><div className="person-actions">{children}</div></article>;
}

function ProfilePage({ profile, events, friends, onLogout }: { profile: Profile; events: OwlEvent[]; friends: Person[]; onLogout: () => void }) {
  return <><section className="profile-hero"><span className="avatar avatar-lg self">{initials(profile.name)}</span><div><span className="eyebrow">Verified Rice student <Check size={13} /></span><h1>{profile.name}</h1><p>{profile.major} · {profile.year} · {profile.college} College</p></div></section><div className="stats-row"><div><b>{friends.length}</b><span>Friends</span></div><div><b>{events.filter((event) => event.isOwner).length}</b><span>Events hosted</span></div><div><b>{events.filter((event) => event.membership === "going").length}</b><span>Plans joined</span></div></div><section className="settings-card"><div><span>Email</span><strong>{profile.email}</strong></div><div><span>Age</span><strong>{profile.age}</strong></div><div><span>Profile visibility</span><strong>Rice students only</strong></div><button className="secondary danger" onClick={onLogout}>Sign out</button></section></>;
}

function CreateEventModal({ onClose, onCreate }: { onClose: () => void; onCreate: (event: Omit<OwlEvent, "id" | "host" | "attendees" | "pending" | "isOwner">) => void }) {
  const [form, setForm] = useState({ title: "", description: "", location: "", date: "2026-09-05", time: "7:00 PM", capacity: "6", visibility: "public" as EventVisibility, category: "Games" });
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal create-modal" role="dialog" aria-modal="true" aria-labelledby="create-title"><header><div><span className="eyebrow">Bring people together</span><h2 id="create-title">Create an event</h2></div><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button></header><form onSubmit={(event) => { event.preventDefault(); void onCreate({ ...form, capacity: Number(form.capacity) }); }}><Field label="Event title"><input value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="e.g. Casual ping pong" maxLength={80} required /></Field><Field label="What’s the plan?"><textarea value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Set the vibe and let people know what to expect…" maxLength={600} required /><small className="char-count">{form.description.length}/600</small></Field><Field label="Location"><div className="input-with-icon"><MapPin size={17} /><input value={form.location} onChange={(event) => update("location", event.target.value)} placeholder="Where should everyone meet?" required /></div></Field><div className="form-grid three"><Field label="Date"><input type="date" value={form.date} onChange={(event) => update("date", event.target.value)} required /></Field><Field label="Time"><input value={form.time} onChange={(event) => update("time", event.target.value)} placeholder="7:00 PM" required /></Field><Field label="People"><input type="number" min="2" max="100" value={form.capacity} onChange={(event) => update("capacity", event.target.value)} required /></Field></div><div className="form-grid two"><Field label="Category"><select value={form.category} onChange={(event) => update("category", event.target.value)}>{["Games", "Food", "Chill", "Outdoors", "Study", "Other"].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Who can see it?"><div className="visibility-toggle"><button type="button" className={form.visibility === "public" ? "active" : ""} onClick={() => update("visibility", "public")}><Eye size={15} /> Public</button><button type="button" className={form.visibility === "private" ? "active" : ""} onClick={() => update("visibility", "private")}><EyeOff size={15} /> Private</button></div></Field></div><div className="modal-note"><LockKeyhole size={16} /><span>{form.visibility === "public" ? "Anyone at Rice can discover this event. You approve who joins." : "Only people you invite or share the private link with can see it."}</span></div><footer><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary">Create event <ChevronRight size={17} /></button></footer></form></section></div>;
}

function EventModal({ event, friends, onClose, onRequest, onInviteAnswer, onApprove, onDecline, onInvite, notify }: { event: OwlEvent; friends: Person[]; onClose: () => void; onRequest: (id: string) => void; onInviteAnswer: (id: string, accepted: boolean) => void; onApprove: (eventId: string, person: Person) => void; onDecline: (eventId: string, person: Person) => void; onInvite: (eventId: string, person: Person) => void; notify: (message: string) => void }) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const spacesLeft = event.capacity - event.attendees.length;
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="modal event-detail" role="dialog" aria-modal="true"><header><div className="event-card-top"><span className="date-tile"><b>{dayNumber(event.date)}</b><small>{monthShort(event.date)}</small></span><span className="category-pill">{event.category}</span>{event.visibility === "private" && <span className="private-pill"><LockKeyhole size={12} /> Private</span>}</div><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button></header><h2>{event.title}</h2><p className="detail-description">{event.description}</p><div className="detail-facts"><span><Clock3 size={18} /><b>{event.time}</b><small>{longDate(event.date)}</small></span><span><MapPin size={18} /><b>{event.location}</b><small>Rice University campus</small></span></div><div className="detail-host"><Avatar person={event.host} /><span><small>Hosted by</small><strong>{event.host.name}</strong><em>{event.host.college ? `${event.host.college} · ${event.host.year}` : "Event host"}</em></span></div><section className="attendee-section"><div className="section-head"><div><h3>Going</h3><span>{event.attendees.length} of {event.capacity} · {spacesLeft} spots left</span></div></div><div className="attendee-list">{event.attendees.length ? event.attendees.map((person) => <div key={person.id}><Avatar person={person} size="sm" /><span>{person.name}</span></div>) : <p>No guests yet. Be the first to join.</p>}</div></section>{event.isOwner && event.pending.length > 0 && <section className="request-section"><div className="section-head"><div><h3>Requests</h3><span>Approve people to add them to Going</span></div></div>{event.pending.map((person) => <div className="request-row" key={person.id}><Avatar person={person} /><div><strong>{person.name}</strong><span>{person.major} · {person.college}</span></div><button className="primary compact" onClick={() => onApprove(event.id, person)}><Check size={15} /> Approve</button><button className="icon-btn" onClick={() => onDecline(event.id, person)} aria-label={`Decline ${person.name}`}><X size={17} /></button></div>)}</section>}{event.isOwner && event.visibility === "private" && <div className="host-tools"><button className="secondary" onClick={() => setInviteOpen(!inviteOpen)}><Users size={16} /> Invite friends</button><button className="secondary" onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}/invite/${event.inviteCode ?? event.id}`); notify("Private invite link copied"); }}><Copy size={16} /> Copy invite link</button></div>}{inviteOpen && <div className="invite-picker">{friends.filter((person) => !event.attendees.some((attendee) => attendee.id === person.id)).map((person) => <div key={person.id}><Avatar person={person} size="sm" /><span>{person.name}</span><button className="secondary" onClick={() => onInvite(event.id, person)}>Invite</button></div>)}</div>}<footer>{event.membership === "invited" ? <><button className="secondary" onClick={() => onInviteAnswer(event.id, false)}>Decline</button><button className="primary" onClick={() => onInviteAnswer(event.id, true)}>Accept invitation</button></> : !event.isOwner && <button className={event.membership === "requested" || event.membership === "going" ? "secondary success wide" : "primary wide"} disabled={Boolean(event.membership)} onClick={() => onRequest(event.id)}>{event.membership === "going" ? <><Check size={16} /> You’re going</> : event.membership === "requested" ? <><Check size={16} /> Request sent</> : event.membership === "declined" ? "Request not approved" : "Request to join"}</button>}</footer></section></div>;
}

function initials(name?: string) { return name ? name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() : "OW"; }
function dayNumber(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { day: "2-digit" }); }
function monthShort(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short" }).toUpperCase(); }
function longDate(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }); }
