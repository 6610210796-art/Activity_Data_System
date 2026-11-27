export interface CurrentProfile {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "unit_user";
  department_code: string | null;
  is_active: number | boolean;
}

export type AuthenticatedProfile = Omit<CurrentProfile, "is_active">;

export function resolveAuthenticatedProfile(
  profile: CurrentProfile | undefined,
): AuthenticatedProfile | null {
  if (!profile || Number(profile.is_active) !== 1) return null;
  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    role: profile.role,
    department_code: profile.department_code,
  };
}
