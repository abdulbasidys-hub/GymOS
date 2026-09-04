// Where each role lands after sign-in. Shared by the router and the login page
// so there's one source of truth for the mapping.

export function homePathFor(role) {
  switch (role) {
    case "superadmin":
      return "/admin";
    case "owner":
      return "/owner";
    case "receptionist":
      return "/desk";
    case "affiliate":
      return "/affiliate";
    default:
      return "/login";
  }
}
