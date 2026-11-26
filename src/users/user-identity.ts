// Email and username are compared case-insensitively: both are stored trimmed
// and lowercased. Login must look users up with the same functions.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}
