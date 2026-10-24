import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

const nav = [
  { href: "/author", label: "Dashboard", exact: true },
  { href: "/author/books", label: "My Books" },
  { href: "/author/tickets", label: "My Tickets" },
  { href: "/author/tickets/new", label: "Submit a Query", exact: true },
];

export default async function AuthorLayout({ children }: { children: React.ReactNode }) {
  // DB-backed check (the proxy only does an optimistic token check).
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "AUTHOR") redirect("/admin");
  return (
    <AppShell nav={nav} user={{ name: user.name, email: user.email }} portal="Author Portal">
      {children}
    </AppShell>
  );
}
