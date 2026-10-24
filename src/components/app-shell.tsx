"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { cx } from "./ui";

type NavItem = { href: string; label: string; exact?: boolean };

export function AppShell({ nav, user, portal, children }: { nav: NavItem[]; user: { name: string; email: string }; portal: string; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (n: NavItem) => (n.exact ? path === n.href : path === n.href || path.startsWith(`${n.href}/`));

  async function logout() {
    await api("/api/v1/auth/logout", { method: "POST" }).catch(() => {});
    window.location.assign(new URL("/login", window.location.origin));
  }

  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col">
      <div className="px-5 py-5">
        <Link href="/" className="block">
          <span className="font-serif text-lg"><span className="text-leaf">❧</span> BookLeaf Connect</span>
          <span className="mt-0.5 block text-xs text-muted">{portal}</span>
        </Link>
      </div>
      <ul className="flex-1 space-y-0.5 px-3">
        {nav.map((n) => (
          <li key={n.href}>
            <Link
              href={n.href}
              onClick={() => setOpen(false)}
              aria-current={active(n) ? "page" : undefined}
              className={cx(
                "block rounded-md px-3 py-2 text-sm transition-colors",
                active(n) ? "bg-panel-2 text-paper border-l-2 border-leaf" : "text-muted hover:bg-panel-2 hover:text-paper",
              )}
            >
              {n.label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="border-t border-line p-4">
        <p className="truncate text-sm">{user.name}</p>
        <p className="truncate text-xs text-muted">{user.email}</p>
        <button onClick={logout} className="mt-3 text-xs text-muted underline-offset-4 hover:text-paper hover:underline">Sign out</button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-60 shrink-0 border-r border-line bg-panel md:sticky md:top-0 md:block md:h-screen">{sidebar}</aside>
      <header className="flex items-center justify-between border-b border-line bg-panel px-4 py-3 md:hidden">
        <span className="font-serif"><span className="text-leaf">❧</span> BookLeaf Connect</span>
        <button aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen(!open)} className="rounded border border-line px-2 py-1 text-sm">
          {open ? "Close" : "Menu"}
        </button>
      </header>
      {open && <div id="mobile-nav" className="border-b border-line bg-panel md:hidden">{sidebar}</div>}
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
