export type Profile = {
  name: string;
  email: string;
  major: string;
  age: number;
  year: string;
  college: string;
};

export type Person = {
  id: string;
  name: string;
  initials: string;
  major: string;
  year: string;
  college: string;
  color: string;
};

export type EventVisibility = "public" | "private";
export type EventMembership = "requested" | "invited" | "going" | "declined";

export type OwlEvent = {
  id: string;
  title: string;
  description: string;
  location: string;
  date: string;
  time: string;
  capacity: number;
  visibility: EventVisibility;
  category: string;
  inviteCode?: string;
  host: Person;
  attendees: Person[];
  pending: Person[];
  membership?: EventMembership;
  isOwner?: boolean;
};
