"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type Category,
  type Priority,
  type Status,
} from "@/lib/domain";

/* Small set of accessible primitives styled with Tailwind. */

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean };
export function Button({ variant = "secondary", loading, className, children, disabled, ...rest }: BtnProps) {
  const styles = {
    primary: "bg-leaf text-ink hover:bg-leaf-dark hover:text-paper font-medium",
    secondary: "bg-panel-2 border border-line hover:border-muted",
    ghost: "hover:bg-panel-2",
    danger: "bg-red-900/40 border border-red-800 text-red-200 hover:bg-red-900/60",
  }[variant];
  return (
    <button
      className={cx("inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed", styles, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cx("inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent", className)} />;
}

export const inputCls =
  "w-full rounded-md border border-line bg-ink px-3 py-2 text-sm placeholder:text-muted/70 focus:border-leaf focus:outline-none";

export function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs text-red-300" role="alert">{error}</p>}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cx("rounded-lg border border-line bg-panel", className)}>{children}</section>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-serif text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1.5 text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {body && <p className="max-w-md text-sm text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm text-red-200">
      <p>{error.message || "Something went wrong."}</p>
      {onRetry && <Button className="mt-3" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-muted" role="status">
      <Spinner /> {label}…
    </div>
  );
}

/* Badges carry a text label and a symbol so meaning never depends on colour alone. */
const STATUS_STYLE: Record<Status, string> = {
  OPEN: "border-sky-700 text-sky-200",
  IN_PROGRESS: "border-amber-700 text-amber-200",
  RESOLVED: "border-leaf text-green-200",
  CLOSED: "border-line text-muted",
};
const STATUS_ICON: Record<Status, string> = { OPEN: "○", IN_PROGRESS: "◐", RESOLVED: "●", CLOSED: "■" };
export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs", STATUS_STYLE[status])}>
      <span aria-hidden>{STATUS_ICON[status]}</span>
      {STATUS_LABELS[status]}
    </span>
  );
}

const PRIORITY_STYLE: Record<Priority, string> = {
  CRITICAL: "bg-red-900/50 text-red-100 border-red-700",
  HIGH: "bg-orange-900/40 text-orange-100 border-orange-800",
  MEDIUM: "bg-panel-2 text-paper border-line",
  LOW: "bg-transparent text-muted border-line",
};
const PRIORITY_ICON: Record<Priority, string> = { CRITICAL: "!!!", HIGH: "!!", MEDIUM: "!", LOW: "–" };
export function PriorityBadge({ priority, score }: { priority: Priority; score?: number }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium", PRIORITY_STYLE[priority])}>
      <span aria-hidden className="font-mono">{PRIORITY_ICON[priority]}</span>
      {PRIORITY_LABELS[priority]}
      {score !== undefined && <span className="tabular-nums opacity-70">· {score}</span>}
    </span>
  );
}

export function CategoryBadge({ category }: { category: Category }) {
  return <span className="whitespace-nowrap rounded bg-panel-2 px-1.5 py-0.5 text-xs text-muted">{CATEGORY_LABELS[category]}</span>;
}

/* Toasts */
type Toast = { id: number; kind: "success" | "error" | "info"; text: string };
const ToastCtx = createContext<(kind: Toast["kind"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const n = useRef(0);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = ++n.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto rounded-md border px-4 py-3 text-sm shadow-lg",
              t.kind === "success" && "border-leaf bg-panel",
              t.kind === "error" && "border-red-800 bg-red-950",
              t.kind === "info" && "border-line bg-panel",
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* Confirmation dialog using the native <dialog> element (focus trap + Esc for free). */
export function ConfirmButton({
  label, title, body, confirmLabel = "Confirm", onConfirm, variant = "secondary", disabled,
}: { label: string; title: string; body: string; confirmLabel?: string; onConfirm: () => Promise<void> | void; variant?: BtnProps["variant"]; disabled?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => ref.current?.close(), []);
  return (
    <>
      <Button type="button" variant={variant} disabled={disabled} onClick={() => ref.current?.showModal()}>{label}</Button>
      <dialog ref={ref} className="m-auto w-[min(28rem,90vw)] rounded-lg border border-line bg-panel p-0 text-paper backdrop:bg-black/60">
        <div className="p-5">
          <h2 className="font-medium">{title}</h2>
          <p className="mt-2 text-sm text-muted">{body}</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => ref.current?.close()}>Cancel</Button>
            <Button
              type="button"
              variant="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try { await onConfirm(); } finally { setBusy(false); ref.current?.close(); }
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
