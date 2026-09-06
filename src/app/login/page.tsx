"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CircleNotch, WarningCircle, Sparkle } from "@phosphor-icons/react";
import { fadeIn } from "@/components/report-blocks";
import { createClient } from "@/lib/supabase/client";

// A deliberately public, read-mostly account seeded into the org that
// already has the sample reports/schedules/connectors, so anyone can see
// the product populated without creating their own account first.
const DEMO_EMAIL = "demo@datareportq.com";
const DEMO_PASSWORD = "DataReportQDemo123!";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWith(loginEmail: string, loginPassword: string) {
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });

    if (signInError) {
      setError("Incorrect email or password.");
      return false;
    }

    router.push(searchParams.get("next") || "/reports");
    router.refresh();
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const ok = await signInWith(email, password);
    if (!ok) setLoading(false);
  }

  async function handleDemoLogin() {
    setDemoLoading(true);
    setError(null);
    const ok = await signInWith(DEMO_EMAIL, DEMO_PASSWORD);
    if (!ok) setDemoLoading(false);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <motion.div initial="hidden" animate="show" variants={fadeIn}>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Log in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Welcome back to DataReportQ.</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="rounded-xl border border-[var(--color-border)] bg-card/70 p-3 text-sm text-foreground outline-none focus:shadow-[0_0_0_3px_var(--color-primary)] focus:shadow-primary/20"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="rounded-xl border border-[var(--color-border)] bg-card/70 p-3 text-sm text-foreground outline-none focus:shadow-[0_0_0_3px_var(--color-primary)] focus:shadow-primary/20"
          />

          {error && (
            <p className="flex items-start gap-1.5 text-xs text-red-600">
              <WarningCircle size={14} weight="bold" className="mt-0.5 shrink-0" />
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || demoLoading}
            className="mt-1 flex items-center justify-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary disabled:opacity-50"
          >
            {loading && <CircleNotch size={14} weight="bold" className="animate-spin" />}
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>

        <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-[var(--color-border)]" />
          or
          <span className="h-px flex-1 bg-[var(--color-border)]" />
        </div>

        <button
          onClick={handleDemoLogin}
          disabled={loading || demoLoading}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full border border-[var(--color-border)] bg-card/70 px-5 py-2.5 text-sm font-semibold text-foreground backdrop-blur transition-colors hover:bg-muted disabled:opacity-50"
        >
          {demoLoading ? (
            <CircleNotch size={14} weight="bold" className="animate-spin" />
          ) : (
            <Sparkle size={14} weight="bold" className="text-primary" />
          )}
          {demoLoading ? "Signing in..." : "Try the demo account"}
        </button>

        <p className="mt-4 text-sm text-muted-foreground">
          No account?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
