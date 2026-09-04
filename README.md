# OwlMeet

OwlMeet is an event-first social app for Rice University students. Students verify a `@rice.edu` email, create a campus profile, connect with friends, and organize small public or private events.

OwlMeet includes both a responsive installable web app and a native Expo/React Native client for iOS and Android. Both use the same PostgreSQL schema and Supabase authentication.

## Product flows

- Passwordless Rice email sign-in
- Profile onboarding: name, major, age, class year, and residential college
- Friend requests with accept/decline states
- Public events with capacity, join requests, and host approval
- Private events with friend invitations and shareable invite codes
- Host tools and attendee lists

## Run locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. Without environment variables, OwlMeet runs in interactive demo mode. Enter any address ending in `@rice.edu`, choose **Open demo confirmation**, and complete onboarding.

### Native mobile app

```bash
pnpm mobile:check
pnpm mobile
```

The Expo app lives in `mobile/`. Copy `mobile/.env.example` to `mobile/.env`, add the same Supabase project values, and configure `owlmeet://**` as an additional Supabase Auth redirect URL. Without those variables, the native app runs in demo mode as well.

## Connect the PostgreSQL database

OwlMeet uses Supabase for PostgreSQL, email authentication, and row-level security.

1. Create a Supabase project.
2. Apply the SQL files in `supabase/migrations/` in filename order (or run `supabase db push` with the Supabase CLI).
3. Copy `.env.example` to `.env.local` and add the project URL and anon key.
4. In Supabase Auth URL configuration, add the local and deployed app URLs as redirect URLs.
5. Customize the magic-link email template with the OwlMeet name and colors.

The SQL trigger rejects non-Rice accounts even if someone bypasses the interface. Row-level security protects profiles, friendships, public/private event visibility, invitations, and attendance changes.

## Database model

- `profiles` extends Supabase Auth users
- `friendships` stores pending, accepted, and declined connections
- `events` stores event details, capacity, visibility, host, and private invite codes
- `event_members` stores requested, invited, going, and declined attendance states

## Production checklist

- Add real Supabase credentials and test magic-link delivery
- Add notification delivery for requests and invitations
- Add moderation, reporting, blocking, and event cancellation policies
- Configure analytics and error monitoring
