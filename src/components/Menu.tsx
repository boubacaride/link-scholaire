"use client";

import { useAuth } from "@/contexts/AuthContext";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
        href: "/list/grades",
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

const Menu = () => {
  const { user } = useAuth();
  const pathname = usePathname();
  const role = user?.role || "student";
  const isPrivateSchool = user?.schoolType === "private";

  return (
    <div className="mt-4 text-sm">
      {menuItems.map((section) => {
        const visibleItems = section.items.filter((item) => {
          if (!item.visible.includes(role)) return false;
          if ((item as any).privateOnly && !isPrivateSchool) return false;
          return true;
        });

        if (visibleItems.length === 0) return null;

        return (
          <div className="flex flex-col gap-2" key={section.title}>
            <span className="hidden lg:block text-gray-400 font-light my-4">
              {section.title}
            </span>
            {visibleItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  href={item.href}
                  key={item.label}
                  className={`flex items-center justify-center lg:justify-start gap-4 text-gray-500 py-2 md:px-2 rounded-md transition-colors ${
                    isActive
                      ? "bg-lamaSkyLight text-blue-600 font-medium"
                      : "hover:bg-lamaSkyLight"
                  }`}
                >
                  <Image src={item.icon} alt="" width={20} height={20} />
                  <span className="hidden lg:block">{item.label}</span>
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
