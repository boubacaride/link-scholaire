"use client";

import { useAuth } from "@/contexts/AuthContext";

const MessagesPage = () => {
  const { user } = useAuth();

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      <h1 className="text-lg font-semibold mb-4">Messages</h1>
      <div className="flex flex-col items-center justify-center py-16">
        <div className="text-5xl mb-4">💬</div>
        <p className="text-gray-500 text-sm">No messages yet</p>
        <p className="text-gray-400 text-xs mt-1">Messages from teachers, students, and parents will appear here.</p>
      </div>
    </div>
  );
};

export default MessagesPage;
