"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, ClientApiError } from "@/lib/client/api";
import { Button, Field, inputCls } from "@/components/ui";

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api<{ user: { role: "ADMIN" | "AUTHOR" } }>("/api/v1/auth/login", { method: "POST", json: { email, password } });
      const next = params.get("next");
      const home = user.role === "ADMIN" ? "/admin" : "/author";
      // Only follow same-portal relative redirects.
      window.location.assign(new URL(next && next.startsWith(home) ? next : home, window.location.origin));
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Could not sign in. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Email" htmlFor="email">
        <input id="email" type="email" autoComplete="email" required className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password" htmlFor="password">
        <input id="password" type="password" autoComplete="current-password" required className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <Button type="submit" variant="primary" loading={busy} className="w-full">Sign in</Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-serif text-3xl"><span className="text-leaf">❧</span> BookLeaf Connect</p>
          <p className="mt-2 text-sm text-muted">Author Support &amp; Communication Portal</p>
        </div>
        <div className="rounded-lg border border-line bg-panel p-6">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-xs text-muted">Authors and BookLeaf staff sign in with the email on file.</p>
      </div>
    </main>
  );
}
