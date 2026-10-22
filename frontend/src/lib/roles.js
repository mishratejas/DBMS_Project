// Backend (Oracle-side) role names -> the lower-case keys the UI uses.
const ROLE_KEY = {
  ADMIN: "admin", DOCTOR: "doctor", NURSE: "nurse", RECEPTIONIST: "receptionist",
  LAB: "labtech", PHARMACY: "pharmacist", BILLING: "billingclerk", READONLY: "readonly",
};

export function uiRole(role) {
  if (!role) return "";
  return ROLE_KEY[String(role).toUpperCase()] || String(role).toLowerCase();
}

export function hasRole(auth, ...roles) {
  const r = uiRole(auth?.role);
  return r === "admin" || roles.includes(r);
}
