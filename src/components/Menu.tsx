"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";
import ExpensesMenuItem from "@/components/ExpensesMenuItem";
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
  "Time Off": "timeoff.navTimeOff",
  "Staff Approvals": "timeoff.navApprovalsStaff",
  "Student Approvals": "timeoff.navApprovalsStudents",
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
        icon: "/parent.png",
        label: "Employees",
        href: "/list/employees",
        visible: ["platform_admin", "school_admin"],
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
      {
        icon: "/calendar.png",
        label: "Time Off",
        href: "/list/time-off",
        visible: ["teacher", "employee", "student", "parent"],
      },
      {
        icon: "/attendance.png",
        label: "Staff Approvals",
        href: "/list/approvals/staff",
        visible: ["school_admin"],
      },
      {
        icon: "/attendance.png",
        label: "Student Approvals",
        href: "/list/approvals/students",
        visible: ["school_admin"],
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
        label: "Expenses",
        visible: ["school_admin"],
        privateOnly: true,
        flyout: true,
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

const ROLE_HOMES = new Set(["/", "/parent", "/student", "/teacher", "/admin"]);

const isHrefActive = (pathname: string, href: string) => {
  if (href === "/") return ROLE_HOMES.has(pathname);
  return pathname === href || pathname.startsWith(href + "/");
};

const Menu = () => {
  const { user, signOut } = useAuth();
  const { t } = useI18n();
  const pathname = usePathname();
  const role = user?.role || "student";
  const isPrivateSchool = user?.schoolType === "private";
  const label = (l: string) => (NAV_KEY[l] ? t(NAV_KEY[l]) : l);

  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  // Auto-open any dropdown group whose child route is active. Runs on every
  // pathname change so client-side navigation onto an Expenses child also
  // opens the submenu — not just the initial render.
  useEffect(() => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      menuItems.forEach((s) => s.items.forEach((it: any) => {
        if (it.children?.some((c: any) => isHrefActive(pathname, c.href))) {
          next.add(it.label);
        }
      }));
      return next;
    });
  }, [pathname]);

  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  return (
    <div className="mt-4 text-sm">
      {menuItems.map((section) => {
        const visibleItems = section.items.filter((item: any) => {
          if (!item.visible.includes(role)) return false;
          if (role === "platform_admin" && item.href && !PLATFORM_ADMIN_ALLOWED.has(item.href)) return false;
          if (item.privateOnly && !isPrivateSchool) return false;
          return true;
        });

        if (visibleItems.length === 0) return null;

        return (
          <div className="flex flex-col gap-2" key={section.title}>
            <span className="hidden lg:block text-gray-400 font-light my-4">
              {SECTION_KEY[section.title] ? t(SECTION_KEY[section.title]) : section.title}
            </span>
            {visibleItems.map((item: any) => {
              // ─── Cascading flyout (Expenses) ─────────────────────
              if (item.flyout) {
                return (
                  <ExpensesMenuItem
                    key={item.label}
                    icon={item.icon}
                    label={label(item.label)}
                    pathname={pathname}
                  />
                );
              }

              // ─── Dropdown group ──────────────────────────────────
              if (item.children?.length) {
                const open = openGroups.has(item.label);
                const groupActive = item.children.some((c: any) => isHrefActive(pathname, c.href));
                return (
                  <div key={item.label} className="flex flex-col">
                    <button
                      onClick={() => toggleGroup(item.label)}
                      aria-expanded={open}
                      className={`flex items-center justify-center lg:justify-start gap-4 py-2 md:px-2 rounded-md transition-colors text-left ${
                        groupActive
                          ? "bg-gradient-to-b from-[#4a7eb0] to-[#3a6d9a] text-white font-medium shadow-sm"
                          : "text-gray-500 hover:bg-lamaSkyLight"
                      }`}
                    >
                      <Image src={item.icon} alt="" width={20} height={20} />
                      <span className="hidden lg:block flex-1">{label(item.label)}</span>
                      <span className={`hidden lg:block transition-transform text-[10px] ${open ? "rotate-90" : ""}`}>▶</span>
                    </button>
                    {open && (
                      <div className="flex flex-col gap-1 mt-1 ml-1 lg:ml-7 lg:border-l border-gray-200 lg:pl-3">
                        {item.children.map((child: any) => {
                          const active = isHrefActive(pathname, child.href);
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              title={label(child.label)}
                              className={`text-xs py-1.5 px-2 rounded-md transition-colors text-center lg:text-left ${
                                active
                                  ? "bg-[#eef3f9] text-[#1f3a5f] font-semibold"
                                  : "text-gray-500 hover:bg-gray-50"
                              }`}
                            >
                              {label(child.label)}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              // ─── Single link ─────────────────────────────────────
              const isActive = isHrefActive(pathname, item.href);

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
