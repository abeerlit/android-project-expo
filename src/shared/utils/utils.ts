import { DateTime } from "luxon";

export const toPascalCase = (str: string): string => {
  return str
    .split("-") // Split by hyphen
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalize each word
    .join(""); // Join back without hyphens
};

export const isValidEmail = (email: string) => {
  if (!email) return false;

  const emailValidationRegex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
  return emailValidationRegex.test(email);
};

export const isSameDay = (date1: number, date2: number) => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return (
    d1.getDate() === d2.getDate() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getFullYear() === d2.getFullYear()
  );
};

export const getDateText = (timestamp: number) => {
  const messageDate = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);

  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(timestamp, today.getTime())) {
    return "Today";
  } else if (isSameDay(timestamp, yesterday.getTime())) {
    return "Yesterday";
  } else {
    return messageDate.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }
};

export const phoneNumberFormatter = (number: string): string => {
  if (!number) {
    return number;
  }

  const isListen = number.startsWith("*6");
  const isCoach = number.startsWith("*5");

  if (isListen) {
    return `Listen ${number.slice(2)}`;
  }

  if (isCoach) {
    return `Coach ${number.slice(2)}`;
  }

  // If contains special dial characters (* or #), return as-is
  if (number.includes("*") || number.includes("#")) {
    return number;
  }

  // Remove non-digit characters from the input
  const allNumericNumber = number.replace(/\D/g, "");

  if (allNumericNumber.length <= 10) {
    // Format as a US-style phone number
    return allNumericNumber.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3");
  } else {
    // Extract the country code
    const countryCode = allNumericNumber.substring(
      0,
      allNumericNumber.length - 10
    );

    // Extract the remaining phone number
    const remainingDigits = allNumericNumber.substring(
      allNumericNumber.length - 10
    );

    // Format the remaining phone number
    const formattedNumber = remainingDigits.replace(
      /(\d{3})(\d{3})(\d{4})/,
      "($1) $2-$3"
    );

    // Adding '+' before country code
    return "+" + countryCode + " " + formattedNumber;
  }
};

export const formatRelativeTime = (time: string) => {
  const now = DateTime.now();
  const yesterday = DateTime.now().minus({ days: 1 });

  const isToday = DateTime.fromISO(time).hasSame(now, "day");
  const isYesterday = DateTime.fromISO(time).hasSame(yesterday, "day");

  if (isToday) {
    return DateTime.fromISO(time).toFormat("h:mm a");
  }

  if (isYesterday) {
    return "Yesterday";
  }

  return DateTime.fromISO(time).toFormat("ccc LLL d");
};

export const getFileSize = (size: number) => {
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export const isHtml = (str: string) => {
  return /<[a-z][\s\S]*>/i.test(str);
};

export const formatPreciseTime = (unixTimestamp: number): string => {
  return DateTime.fromSeconds(unixTimestamp / 1000).toFormat("h:mm a");
};

/** Minimum numeric digits required for a typed transfer destination (extensions, etc.). */
export const MIN_TRANSFER_DIAL_DIGITS = 2;

/** Max stored length for a keypad-entered transfer number (after normalization). */
export const MAX_TRANSFER_DESTINATION_LENGTH = 24;

/**
 * Normalizes user-entered digits for blind/attended transfer (same family as dialer `makeCall`).
 * Preserves listen/coach patterns and * / # for feature codes; strips formatting elsewhere.
 */
export function normalizeTransferDestination(input: string): string {
  const t = input.trim();
  if (!t) {
    return "";
  }
  if (t.startsWith("*6") || t.startsWith("*5")) {
    return t.replace(/\s/g, "");
  }
  if (t.includes("*") || t.includes("#")) {
    return t.replace(/[\s()-]/g, "");
  }
  if (t.startsWith("+")) {
    return "+" + t.slice(1).replace(/\D/g, "");
  }
  return t.replace(/\D/g, "");
}

export function countDialDigits(value: string): number {
  return value.replace(/\D/g, "").length;
}

export function isValidTransferDestination(raw: string): boolean {
  const n = normalizeTransferDestination(raw);
  if (!n || n.length > MAX_TRANSFER_DESTINATION_LENGTH) {
    return false;
  }
  if (n.startsWith("*6") || n.startsWith("*5")) {
    return n.length >= 2;
  }
  const digits = countDialDigits(n);
  return digits >= MIN_TRANSFER_DIAL_DIGITS;
}
