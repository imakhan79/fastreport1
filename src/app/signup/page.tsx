"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CircleNotch, WarningCircle, Sparkle } from "@phosphor-icons/react";
import { fadeIn } from "@/components/report-blocks";
import { createClient } from "@/lib/supabase/client";

const DEMO_EMAIL = "demo@datareportq.com";
const DEMO_PASSWORD = "DataReportQDemo123!";

export default function SignupPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDemoLogin() {
    setDemoLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    if (signInError) {
      setError("Could not sign in to the demo account.");
      setDemoLoading(false);
      return;
    }
    router.push("/reports");
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, orgName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create account.");
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError("Account created - log in to continue.");
        setLoading(false);
        router.push("/login");
        return;
      }

      router.push("/reports");
      router.refresh();
    } catch {
      setError("Network error creating account.");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <motion.div initial="hidden" animate="show" variants={fadeIn}>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Create your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sets up your own organization on DataReportQ.</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
          <input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Organization name (optional)"
            className="rounded-xl border border-[var(--color-border)] bg-card/70 p-3 text-sm text-foreground outline-none focus:shadow-[0_0_0_3px_var(--color-primary)] focus:shadow-primary/20"
          />
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
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min. 8 characters)"
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
            {loading ? "Creating account..." : "Sign up"}
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
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Log in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
