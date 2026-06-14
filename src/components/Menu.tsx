"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Map the static English labels/sections to translation keys.
const SECTION_KEY: Record<string, string> = {
  MENU: "nav.sections.menu",
  FINANCE: "nav.sections.finance",
  PLATFORM: "nav.sections.platform",
  OTHER: "nav.sections.other",
};
const NAV_KEY: Record<string, string> = {
  Home: "nav.home",
  Teachers: "nav.teachers",
  Students: "nav.students",
  Parents: "nav.parents",
  Subjects: "nav.subjects",
  Classes: "nav.classes",
  Content: "nav.content",
  Labs: "nav.labs",
  "Classe Virtuelle": "nav.virtualClass",
  Exams: "nav.exams",
  Assignments: "nav.assignments",
  Grades: "nav.grades",
  Attendance: "nav.attendance",
  Events: "nav.events",
  Messages: "nav.messages",
  Announcements: "nav.announcements",
  "Student Fees": "nav.fees",
  Payroll: "nav.payroll",
  Schools: "nav.schools",
  Subscriptions: "nav.subscriptions",
  Profile: "nav.profile",
  Settings: "nav.settings",
  Logout: "nav.logout",
};

const menuItems = [
  {
    title: "MENU",
    items: [
      {
        icon: "/home.png",
        label: "Home",
        href: "/",
        visible: ["platform_admin", "school_admin", "teacher", "student", "parent"],
      },
      {
        icon: "/teacher.png",
        label: "Teachers",
        href: "/list/teachers",
        visible: ["platform_admin", "school_admin", "teacher"],
      },
      {
        icon: "/student.png",
        label: "Students",
        href: "/list/students",
        visible: ["platform_admin", "school_admin", "teacher"],
      },
      {
        icon: "/parent.png",
        label: "Parents",
        href: "/list/parents",
        visible: ["platform_admin", "school_admin", "teacher"],
      },
      {
        icon: "/subject.png",
        label: "Subjects",
        href: "/list/subjects",
        visible: ["platform_admin", "school_admin"],
      },
      {
        icon: "/class.png",
        label: "Classes",
        href: "/list/classes",
        visible: ["platform_admin", "school_admin", "teacher"],
      },
      {
        icon: "/lesson.png",
        label: "Content",
        href: "/list/content",
        visible: ["platform_admin", "school_admin", "teacher", "student"],
      },
      {
        icon: "/lesson.png",
        label: "Labs",
        href: "/list/labs",
        visible: ["platform_admin", "school_admin", "teacher", "student"],
      },
      {
        icon: "/lesson.png",
        label: "Classe Virtuelle",
        href: "/list/classe-virtuelle",
        visible: ["platform_admin", "school_admin", "teacher", "student", "parent"],
      },
      {
        icon: "/exam.png",
        label: "Exams",
        href: "/list/exams",
        visible: ["platform_admin", "school_admin", "teacher", "student", "parent"],
      },
      {
        icon: "/assignment.png",
        label: "Assignments",
        href: "/list/assignments",
        visible: ["platform_admin", "school_admin", "teacher", "student", "parent"],
      },
      {
        icon: "/result.png",
        label: "Grades",
        href: "/list/results",
        visible: ["platform_admin", "school_admin", "teacher", "student", "parent"],
      },
      {
        icon: "/attendance.png",
        label: "Attendance",
        href: "/list/attendance",
        visible: ["platform_admin", "school_admin", "teacher", "student", "parent"],
      },
      {
        icon: "/calendar.png",
        label: "Events",
        href: "/list/events",
        visible: ["platform_admin", "school_admin", "teacher", "student", "parent"],
      },
      {
        icon: "/message.png",
        label: "Messages",
        href: "/list/messages",
        visible: ["platform_admin", "school_admin", "teacher", "student", "parent"],
      },
      {
        icon: "/announcement.png",
        label: "Announcements",
        href: "/list/announcements",
        visible: ["platform_admin", "school_admin", "teacher", "student", "parent"],
      },
    ],
  },
  {
    title: "FINANCE",
    items: [
      {
        icon: "/result.png",
        label: "Student Fees",
        href: "/list/fees",
        visible: ["school_admin", "parent"],
        privateOnly: true,
      },
      {
        icon: "/result.png",
        label: "Payroll",
        href: "/list/payroll",
        visible: ["school_admin"],
        privateOnly: true,
      },
    ],
  },
  {
    title: "PLATFORM",
    items: [
      {
        icon: "/class.png",
        label: "Schools",
        href: "/list/schools",
        visible: ["platform_admin"],
      },
      {
        icon: "/result.png",
        label: "Subscriptions",
        href: "/list/subscriptions",
        visible: ["platform_admin"],
      },
    ],
  },
  {
    title: "OTHER",
    items: [
      {
        icon: "/profile.png",
        label: "Profile",
        href: "/profile",
        visible: ["platform_admin", "school_admin", "teacher", "student", "parent"],
      },
      {
        icon: "/setting.png",
        label: "Settings",
        href: "/settings",
        visible: ["platform_admin", "school_admin", "teacher", "student", "parent"],
      },
      {
        icon: "/logout.png",
        label: "Logout",
        href: "/sign-out",
        visible: ["platform_admin", "school_admin", "teacher", "student", "parent"],
      },
    ],
  },
];

// The platform admin runs the tenant layer only — it never touches a school's
// internal pages. Restrict its sidebar to schools/subscriptions + account pages.
const PLATFORM_ADMIN_ALLOWED = new Set<string>([
  "/",
  "/list/schools",
  "/list/subscriptions",
  "/profile",
  "/settings",
  "/sign-out",
]);

const Menu = () => {
  const { user, signOut } = useAuth();
  const { t } = useI18n();
  const pathname = usePathname();
  const role = user?.role || "student";
  const isPrivateSchool = user?.schoolType === "private";
  const label = (l: string) => (NAV_KEY[l] ? t(NAV_KEY[l]) : l);

  return (
    <div className="mt-4 text-sm">
      {menuItems.map((section) => {
        const visibleItems = section.items.filter((item) => {
          if (!item.visible.includes(role)) return false;
          if (role === "platform_admin" && !PLATFORM_ADMIN_ALLOWED.has(item.href)) return false;
          if ((item as any).privateOnly && !isPrivateSchool) return false;
          return true;
        });

        if (visibleItems.length === 0) return null;

        return (
          <div className="flex flex-col gap-2" key={section.title}>
            <span className="hidden lg:block text-gray-400 font-light my-4">
              {SECTION_KEY[section.title] ? t(SECTION_KEY[section.title]) : section.title}
            </span>
            {visibleItems.map((item) => {
              // The "Home" sidebar item points to "/" but the actual landing
              // route depends on the role (/parent, /student, /teacher,
              // /admin), so treat any of those as the active home page.
              const ROLE_HOMES = new Set(["/", "/parent", "/student", "/teacher", "/admin"]);
              const isActive = item.href === "/"
                ? ROLE_HOMES.has(pathname)
                : pathname === item.href || pathname.startsWith(item.href + "/");

              if (item.href === "/sign-out") {
                return (
                  <button
                    key={item.label}
                    onClick={() => signOut()}
                    className="flex items-center justify-center lg:justify-start gap-4 text-gray-500 py-2 md:px-2 rounded-md transition-colors hover:bg-lamaSkyLight"
                  >
                    <Image src={item.icon} alt="" width={20} height={20} />
                    <span className="hidden lg:block">{label(item.label)}</span>
                  </button>
                );
              }

              return (
                <Link
                  href={item.href}
                  key={item.label}
                  className={`flex items-center justify-center lg:justify-start gap-4 py-2 md:px-2 rounded-md transition-colors ${
                    isActive
                      ? "bg-gradient-to-b from-[#4a7eb0] to-[#3a6d9a] text-white font-medium shadow-sm"
                      : "text-gray-500 hover:bg-lamaSkyLight"
                  }`}
                >
                  <Image src={item.icon} alt="" width={20} height={20} />
                  <span className="hidden lg:block">{label(item.label)}</span>
                </Link>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

export default Menu;
