const RICE_TIME_ZONE = "America/Chicago";

export function riceToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RICE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function riceTodayLabel(now = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: RICE_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);
}

function offsetMilliseconds(date: Date) {
  const label = new Intl.DateTimeFormat("en-US", { timeZone: RICE_TIME_ZONE, timeZoneName: "longOffset" })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value ?? "GMT-06:00";
  const match = label.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return -6 * 60 * 60 * 1000;
  return (match[1] === "+" ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3])) * 60 * 1000;
}

export function riceLocalToISOString(date: string, time: string) {
  const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!dateMatch || !timeMatch) throw new Error("Use a valid date and a time like 7:00 PM");
  let hour = Number(timeMatch[1]);
  if (timeMatch[3].toUpperCase() === "PM" && hour < 12) hour += 12;
  if (timeMatch[3].toUpperCase() === "AM" && hour === 12) hour = 0;
  const wallClockAsUtc = Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), hour, Number(timeMatch[2]));
  let instant = wallClockAsUtc - offsetMilliseconds(new Date(wallClockAsUtc));
  instant = wallClockAsUtc - offsetMilliseconds(new Date(instant));
  return new Date(instant).toISOString();
}
