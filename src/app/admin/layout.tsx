import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

const nav = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/tickets", label: "Ticket Queue" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/author");
  return (
    <AppShell nav={nav} user={{ name: user.name, email: user.email }} portal="Operations Portal">
      {children}
    </AppShell>
  );
}
