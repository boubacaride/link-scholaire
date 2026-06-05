// Minimal layout for the /meet route group — no dashboard sidebar,
// full viewport for video.
export default function MeetLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="h-screen w-screen bg-gray-950 text-white">{children}</div>;
}
