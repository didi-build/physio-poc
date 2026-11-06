export function requestedByLabel(input: {
  requestedBy: string;
  requestedByEmail: string;
  currentPractitionerId?: string;
  currentDisplayName?: string;
  sessionIdentityReady: boolean;
}): string {
  if (!input.sessionIdentityReady) {
    return "";
  }
  const current = input.currentPractitionerId ?? "";
  if (current.length > 0 && input.requestedBy === current) {
    const name = input.currentDisplayName?.trim();
    if (name && name.length > 0) {
      return name;
    }
    return "";
  }
  const email = input.requestedByEmail.trim();
  if (email.includes("@")) {
    const local = email.split("@")[0] ?? email;
    if (local.length > 0) {
      return local.charAt(0).toUpperCase() + local.slice(1);
    }
  }
  return email;
}
