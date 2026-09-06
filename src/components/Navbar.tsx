"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { List, X, CaretDown, User as UserIcon, SignOut } from "@phosphor-icons/react";
import NotificationBell from "./NotificationBell";
import { createClient } from "@/lib/supabase/client";

const MARKETING_LINKS = [
  { href: "/#pipeline", label: "How it works" },
  { href: "/#features", label: "Features" },
];

const WORKSPACE_LINKS = [
  { href: "/reports", label: "Reports" },
  { href: "/schedules", label: "Schedules" },
  { href: "/data-sources", label: "Connectors" },
  { href: "/tasks", label: "Review dashboard" },
  { href: "/activity", label: "Activity" },
  { href: "/settings", label: "Settings" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!cancelled) setEmail(user?.email ?? null);
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const authed = Boolean(email);
  const inWorkspace = WORKSPACE_LINKS.some((link) => pathname?.startsWith(link.href));

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        scrolled
          ? "border-b border-[var(--color-border)] bg-[var(--color-background)]/80 backdrop-blur-lg"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-bold tracking-tight text-foreground">
          DataReportQ
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {MARKETING_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}

          {authed ? (
            <>
              <WorkspaceDropdown active={inWorkspace} />
              <Link
                href="/reports/new"
                className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary shadow-sm transition-transform hover:scale-[1.03] active:scale-[0.98]"
              >
                Try a request
              </Link>
              <NotificationBell />
              <UserMenu email={email!} />
            </>
          ) : (
            email !== undefined && (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary shadow-sm transition-transform hover:scale-[1.03] active:scale-[0.98]"
                >
                  Sign up
                </Link>
              </>
            )
          )}
        </div>

        <div className="flex items-center gap-1 md:hidden">
          {authed && <NotificationBell />}
          <button
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-foreground"
          >
            {menuOpen ? <X size={22} weight="bold" /> : <List size={22} weight="bold" />}
          </button>
        </div>
      </nav>

      {menuOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden border-t border-[var(--color-border)] bg-[var(--color-background)] md:hidden"
        >
          <div className="flex flex-col gap-1 px-6 py-4">
            {MARKETING_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}

            {authed ? (
              <>
                <p className="mt-2 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Workspace
                </p>
                {WORKSPACE_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                ))}
                <Link
                  href="/reports/new"
                  onClick={() => setMenuOpen(false)}
                  className="mt-2 rounded-full bg-primary px-5 py-3 text-center text-sm font-semibold text-on-primary"
                >
                  Try a request
                </Link>
                <LogoutButton className="mt-2 rounded-lg px-3 py-3 text-left text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground" />
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMenuOpen(false)}
                  className="mt-2 rounded-full bg-primary px-5 py-3 text-center text-sm font-semibold text-on-primary"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </motion.div>
      )}
    </header>
  );
}

function LogoutButton({ className }: { className: string }) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button onClick={handleLogout} className={className}>
      Log out
    </button>
  );
}

function UserMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground"
        title={email}
      >
        <UserIcon size={16} weight="bold" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-50 mt-3 w-56 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-card shadow-xl"
          >
            <p className="truncate border-b border-[var(--color-border)] px-4 py-2.5 text-xs text-muted-foreground">
              {email}
            </p>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <SignOut size={14} weight="bold" />
              Log out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WorkspaceDropdown({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 text-sm font-medium transition-colors ${
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Workspace
        <CaretDown size={12} weight="bold" className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute left-1/2 z-50 mt-3 w-52 -translate-x-1/2 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-card shadow-xl"
          >
            {WORKSPACE_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
