import Menu from "@/components/Menu";
import Navbar from "@/components/Navbar";
import Image from "next/image";
import Link from "next/link";
import { Toaster } from "sonner";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="h-screen flex flex-col">
      {/* Top dark navy bar: school name + user menu, spans the full width */}
      <Navbar />

      {/* Below: sidebar (left) + main content (right) */}
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-[14%] md:w-[8%] lg:w-[16%] xl:w-[14%] p-4 shrink-0 overflow-y-auto">
          <Link
            href="/"
            className="flex items-center justify-center lg:justify-start gap-2"
          >
            <Image src="/logo.png" alt="logo" width={32} height={32} />
            <span className="hidden lg:block font-bold text-gray-800">SchoolFlow</span>
          </Link>
          <Menu />
        </aside>
        <main className="flex-1 bg-[#F7F8FA] overflow-scroll flex flex-col">
          {children}
        </main>
      </div>
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}
