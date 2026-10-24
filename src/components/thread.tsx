"use client";
import { useEffect, useRef } from "react";
import type { Message } from "@/lib/client/types";
import { formatDateTime } from "@/lib/format";
import { cx } from "./ui";

/** Public conversation, oldest first. `selfRole` decides which side is "you". */
export function Thread({ original, messages, selfRole }: { original: { name: string; body: string; createdAt: string }; messages: Message[]; selfRole: "AUTHOR" | "ADMIN" }) {
  const end = useRef<HTMLDivElement>(null);
  const count = useRef(messages.length);
  useEffect(() => {
    if (messages.length > count.current) end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    count.current = messages.length;
  }, [messages.length]);

  const items = [{ id: "original", body: original.body, createdAt: original.createdAt, sender: { name: original.name, role: "AUTHOR" as const } }, ...messages];
  return (
    <ol className="space-y-4" aria-label="Conversation">
      {items.map((m, i) => {
        const staff = m.sender.role === "ADMIN";
        return (
          <li key={m.id} className={cx("rounded-lg border p-4", staff ? "border-leaf/50 bg-leaf/5" : "border-line bg-panel")}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span className="font-medium text-paper">
                {m.sender.name}
                {m.sender.role === selfRole && selfRole === "AUTHOR" && " (you)"}
                {i === 0 && " · original query"}
              </span>
              <time dateTime={m.createdAt}>{formatDateTime(m.createdAt)}</time>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
          </li>
        );
      })}
      <div ref={end} />
    </ol>
  );
}
