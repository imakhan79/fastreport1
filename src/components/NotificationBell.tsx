"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  SealCheck,
  Paperclip,
  XCircle,
  ClipboardText,
  CircleNotch,
} from "@phosphor-icons/react";

type Notification = {
  id: number;
  type: string;
  message: string;
  task_id: number | null;
  read_at: string | null;
  created_at: string;
};

const TYPE_ICON: Record<string, typeof Bell> = {
  approval_request: SealCheck,
  report_rejected: XCircle,
  attachment_request: Paperclip,
  attachment_rejected: XCircle,
  attachment_review: ClipboardText,
};

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function fetchNotifications(): Promise<{ notifications: Notification[]; unreadCount: number } | null> {
  const res = await fetch("/api/notifications");
  if (!res.ok) return null;
  const data = await res.json();
  return { notifications: data.notifications ?? [], unreadCount: data.unreadCount ?? 0 };
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  async function load() {
    const data = await fetchNotifications();
    if (!data) return;
    setNotifications(data.notifications);
    setUnreadCount(data.unreadCount);
    setLoaded(true);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchNotifications();
      if (!data || cancelled) return;
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function markRead(id: number) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setUnreadCount(0);
    await fetch("/api/notifications/read-all", { method: "POST" });
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-label="Notifications"
        onClick={() => {
          setOpen((v) => !v);
          if (!loaded) void load();
        }}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bell size={19} weight={unreadCount > 0 ? "fill" : "regular"} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-card shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
              <span className="text-sm font-semibold text-foreground">Notifications</span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {!loaded && (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <CircleNotch size={16} weight="bold" className="animate-spin" />
                  Loading...
                </div>
              )}

              {loaded && notifications.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  You&apos;re all caught up.
                </p>
              )}

              {notifications.map((n) => {
                const IconComponent = TYPE_ICON[n.type] ?? Bell;
                const unread = !n.read_at;
                return (
                  <button
                    key={n.id}
                    onClick={() => unread && markRead(n.id)}
                    className={`flex w-full items-start gap-2.5 border-b border-[var(--color-border)]/60 px-4 py-3 text-left text-sm last:border-b-0 transition-colors hover:bg-muted ${
                      unread ? "bg-primary/5" : ""
                    }`}
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
                      <IconComponent size={14} weight="bold" />
                    </span>
                    <span className="flex-1">
                      <span className={`block ${unread ? "text-foreground" : "text-muted-foreground"}`}>
                        {n.message}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{timeAgo(n.created_at)}</span>
                    </span>
                    {unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </button>
                );
              })}
            </div>

            <Link
              href="/activity"
              onClick={() => setOpen(false)}
              className="block border-t border-[var(--color-border)] px-4 py-2.5 text-center text-xs font-semibold text-primary hover:bg-muted"
            >
              View all activity
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
