import Menu from "@/components/Menu";
import Navbar from "@/components/Navbar";
import AuthGuard from "@/components/AuthGuard";
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
          {/* Brand mark — full Link Scolaire logo (icon + wordmark + tagline),
              in the same top-of-sidebar spot the old SchoolFlow mark occupied.
              On wide screens it fills the sidebar width for the best fit; on a
              collapsed sidebar it falls back to the compact chain icon. */}
          <Link
            href="/"
            className="flex items-center justify-center lg:justify-start py-1"
          >
            <Image
              src="/logo-linkscholaire.png"
              alt="Link Scolaire"
              width={636}
              height={133}
              priority
              className="hidden lg:block w-full h-auto"
            />
            <Image
              src="/logo-icon.png"
              alt="Link Scolaire"
              width={219}
              height={121}
              priority
              className="lg:hidden h-8 w-auto"
            />
          </Link>
          <Menu />
        </aside>
        <main className="flex-1 bg-[#F7F8FA] overflow-scroll flex flex-col">
          <AuthGuard>{children}</AuthGuard>
        </main>
      </div>
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}
