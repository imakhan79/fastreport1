import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("organizations")
    .select("*", { count: "exact", head: true });

  const connected = !error;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-xl flex-col items-center gap-6 px-8 py-16 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          FastReport
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Autonomous reporting platform &mdash; scaffold online.
        </p>

        <div className="w-full rounded-lg border border-black/10 bg-white p-6 text-left dark:border-white/10 dark:bg-zinc-900">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                connected ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="font-medium text-black dark:text-zinc-50">
              {connected ? "Connected to Supabase" : "Supabase connection failed"}
            </span>
          </div>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            {connected
              ? `Visible organizations (RLS-scoped to current session): ${count ?? 0}`
              : error?.message}
          </p>
        </div>

        <Link
          href="/reports/new"
          className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          New Report Request
        </Link>
      </main>
    </div>
  );
}
