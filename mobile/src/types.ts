export type Profile = {
  id: string;
  email: string;
  fullName: string;
  major: string;
  age: string;
  year: string;
  college: string;
};

export type Person = {
  id: string;
  name: string;
  initials: string;
  subtitle: string;
  college: string;
  color: string;
};

export type EventVisibility = "public" | "private";

export type OwlEvent = {
  id: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  capacity: number;
  visibility: EventVisibility;
  category: string;
  inviteCode?: string;
  host: Person;
  attendees: Person[];
  pending: Person[];
  membership?: "requested" | "invited" | "going" | "declined";
  isOwner?: boolean;
};
