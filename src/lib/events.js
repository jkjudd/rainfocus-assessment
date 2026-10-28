import { isNamedColor, normalizeColor } from "./colors.js";

// Required text fields and their maximum lengths (after trimming).
export const FIELD_LIMITS = {
  name: 100,
  description: 500,
  company: 100,
  email: 254,
  phone: 30,
  address: 200,
  image: 500,
};

// The editable fields of an event, matching the API's example payload. The
// server assigns `id`, and `createdOn` is stamped when an event is created.
export const EMPTY_EVENT_FIELDS = {
  name: "",
  description: "",
  company: "",
  color: "",
  isActive: true,
  date: "",
  time: "",
  email: "",
  phone: "",
  address: "",
  image: "",
};

const FIELD_LABELS = {
  name: "Event name",
  description: "Description",
  company: "Company name",
  email: "Email",
  phone: "Phone",
  address: "Address",
  image: "Image URL",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[\d\s().-]+$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// A real calendar date in YYYY-MM-DD form (rejects 2021-02-30).
function isValidDate(value) {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// Returns { field: message } for each invalid field; an empty object means valid.
export function validateEventFields(fields) {
  const errors = {};

  for (const [field, max] of Object.entries(FIELD_LIMITS)) {
    const value = String(fields[field] ?? "").trim();
    if (!value) {
      errors[field] = `${FIELD_LABELS[field]} is required.`;
    } else if (value.length > max) {
      errors[field] =
        `${FIELD_LABELS[field]} must be ${max} characters or fewer.`;
    }
  }

  const color = normalizeColor(fields.color);
  if (!color) {
    errors.color = "Color is required.";
  } else if (!isNamedColor(color)) {
    errors.color =
      "Use a standard web color name, such as 'red', 'teal', 'orange', etc.";
  }

  const date = String(fields.date ?? "").trim();
  if (!date) {
    errors.date = "Date is required.";
  } else if (!isValidDate(date)) {
    errors.date = "Enter a real date.";
  }

  const time = String(fields.time ?? "").trim();
  if (!time) {
    errors.time = "Time is required.";
  } else if (!TIME_PATTERN.test(time)) {
    errors.time = "Enter a time as hours and minutes, such as 09:30.";
  }

  const email = String(fields.email ?? "").trim();
  if (!errors.email && !EMAIL_PATTERN.test(email)) {
    errors.email = "Enter an email address, such as name@example.com.";
  }

  const phone = String(fields.phone ?? "").trim();
  const digits = phone.replace(/\D/g, "").length;
  if (!errors.phone && (!PHONE_PATTERN.test(phone) || digits < 7)) {
    errors.phone =
      "Enter a phone number of at least 7 digits, such as +1 (831) 446-3332.";
  }

  const image = String(fields.image ?? "").trim();
  if (!errors.image && !isHttpUrl(image)) {
    errors.image = "Enter a web address starting with http:// or https://.";
  }

  if (typeof fields.isActive !== "boolean") {
    errors.isActive = "Choose whether the event is active.";
  }

  return errors;
}

// The values sent to the API: trimmed text, a lowercase color name and a
// boolean active flag.
export function cleanEventFields(fields) {
  return {
    name: fields.name.trim(),
    description: fields.description.trim(),
    company: fields.company.trim(),
    color: normalizeColor(fields.color),
    isActive: fields.isActive,
    date: fields.date.trim(),
    time: fields.time.trim(),
    email: fields.email.trim(),
    phone: fields.phone.trim(),
    address: fields.address.trim(),
    image: fields.image.trim(),
  };
}

// The editable fields of a loaded event. Older events may lack some: text
// fields come back empty, and isActive null (unset) so the user chooses a
// status rather than having one decided for them.
export function pickEventFields(event) {
  const fields = {};
  for (const key of Object.keys(EMPTY_EVENT_FIELDS)) {
    fields[key] = event[key] ?? EMPTY_EVENT_FIELDS[key];
  }
  fields.isActive = typeof event.isActive === "boolean" ? event.isActive : null;
  return fields;
}

const pad = (number) => String(number).padStart(2, "0");

// The API's createdOn format, e.g. "2020-09-05T03:56:56 +06:00", in local time.
export function formatCreatedOn(date = new Date()) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const hours = pad(Math.floor(Math.abs(offset) / 60));
  const minutes = pad(Math.abs(offset) % 60);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    ` ${sign}${hours}:${minutes}`
  );
}

// Parses the API's createdOn format (or plain ISO); null if it isn't a date.
export function parseCreatedOn(value) {
  if (!value) return null;
  const date = new Date(String(value).replace(" ", ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

// "Jan 5, 2021, 6:56 AM" from the event's date ("2021-01-05") and time
// ("06:56"), in the viewer's locale; whichever part is missing or invalid is
// left out, and an empty string means neither is set.
export function formatEventWhen({ date, time } = {}) {
  const dateMatch = DATE_PATTERN.exec(date ?? "");
  const timeMatch = TIME_PATTERN.exec(time ?? "");
  const validDate = dateMatch && isValidDate(date);
  if (!validDate && !timeMatch) return "";
  const [year, month, day] = validDate ? dateMatch.slice(1).map(Number) : [2000, 1, 1];
  const [hours, minutes] = timeMatch ? time.split(":").map(Number) : [0, 0];
  const when = new Date(year, month - 1, day, hours, minutes);
  return new Intl.DateTimeFormat(undefined, {
    ...(validDate && { dateStyle: "medium" }),
    ...(timeMatch && { timeStyle: "short" }),
  }).format(when);
}

const collator = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});

// Alphabetical by company, ignoring case; events from the same company fall back
// to name, then id, so the order is stable.
export function sortEventsByCompany(events) {
  return [...events].sort(
    (a, b) =>
      collator.compare(a.company.trim(), b.company.trim()) ||
      collator.compare(a.name.trim(), b.name.trim()) ||
      collator.compare(String(a.id), String(b.id)),
  );
}
