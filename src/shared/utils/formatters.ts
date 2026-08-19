/**
 * Format a phone number for display
 * @param phoneNumber - The phone number to format
 * @returns Formatted phone number
 */
export function formatPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber) return "";

  // Remove all non-digit characters
  const cleaned = phoneNumber.replace(/\D/g, "");

  // Handle different lengths
  if (cleaned.length === 10) {
    // Format as (XXX) XXX-XXXX
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(
      6
    )}`;
  } else if (cleaned.length === 11 && cleaned[0] === "1") {
    // Format as +1 (XXX) XXX-XXXX
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(
      7
    )}`;
  } else if (cleaned.length > 10) {
    // Format international numbers
    return `+${cleaned.slice(0, cleaned.length - 10)} ${cleaned.slice(
      -10,
      -7
    )} ${cleaned.slice(-7, -4)} ${cleaned.slice(-4)}`;
  }

  // Return original if not a standard format
  return phoneNumber;
}

/**
 * Get initials from a name
 * @param name - The name to get initials from
 * @returns Initials (max 2 characters)
 */
export function getInitials(name: string): string {
  if (!name) return "";

  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }

  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Remove leading +1 from phone number
 * @param phoneNumber - The phone number
 * @returns Phone number without leading +1
 */
export function removeLeadingOne(phoneNumber: string): string {
  if (!phoneNumber) return "";

  const cleaned = phoneNumber.replace(/\D/g, "");
  if (cleaned.length === 11 && cleaned[0] === "1") {
    return cleaned.slice(1);
  }

  return cleaned;
}

/**
 * Validate if a string is a valid phone number
 * @param value - The value to validate
 * @returns True if valid phone number
 */
export function isValidPhoneNumber(value: string): boolean {
  if (!value) return false;

  // Remove all non-digit characters
  const cleaned = value.replace(/\D/g, "");

  // Valid phone numbers are 10 digits (US) or 11 digits (with country code 1)
  return cleaned.length === 10 || (cleaned.length === 11 && cleaned[0] === "1");
}

/**
 * Strip phone number to just digits, removing leading 1 if present
 * @param phoneNumber - The phone number to strip
 * @returns Stripped phone number (10 digits)
 */
export function stripPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber) return "";

  const cleaned = phoneNumber.replace(/\D/g, "");

  // Remove leading 1 if present
  if (cleaned.length === 11 && cleaned[0] === "1") {
    return cleaned.slice(1);
  }

  return cleaned;
}
