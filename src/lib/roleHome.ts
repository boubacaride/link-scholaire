import { UserRole } from "@/types";

/** The dashboard each role lands on after sign-in / when visiting Home ("/").
 *  The /admin dashboard is the SCHOOL ADMINISTRATION landing page only —
 *  teachers, students and parents each have their own home. */
export function roleHome(role: UserRole | undefined | null): string {
  switch (role) {
    case "platform_admin":
    case "school_admin":
      return "/admin";
    case "teacher":
      return "/teacher";
    case "student":
      return "/student";
    case "parent":
      return "/parent";
    default:
      return "/sign-in";
  }
}
