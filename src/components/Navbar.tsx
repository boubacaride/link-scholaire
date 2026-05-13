"use client";

import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";

const Navbar = () => {
  const { user } = useAuth();

  const displayName = user
    ? `${user.firstName} ${user.lastName}`
    : "Guest";

  const displayRole = user?.role
    ? user.role.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "—";

  return (
    <div className="flex items-center justify-between p-4">
      {/* ICONS AND USER */}
      <div className="flex items-center gap-6 justify-end w-full">
        <div className="bg-white rounded-full w-7 h-7 flex items-center justify-center cursor-pointer">
          <Image src="/message.png" alt="" width={20} height={20} />
        </div>
        <div className="bg-white rounded-full w-7 h-7 flex items-center justify-center cursor-pointer relative">
          <Image src="/announcement.png" alt="" width={20} height={20} />
          <div className="absolute -top-3 -right-3 w-5 h-5 flex items-center justify-center bg-purple-500 text-white rounded-full text-xs">
            1
          </div>
        </div>
        <div className="flex flex-col">
          <span className="text-xs leading-3 font-medium">{displayName}</span>
          <span className="text-[10px] text-gray-500 text-right">{displayRole}</span>
        </div>
        {user?.avatarUrl ? (
          <Image
            src={user.avatarUrl}
            alt=""
            width={36}
            height={36}
            className="rounded-full"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm">
            {user ? user.firstName[0] + user.lastName[0] : "?"}
          </div>
        )}
      </div>
    </div>
  );
};

export default Navbar;
