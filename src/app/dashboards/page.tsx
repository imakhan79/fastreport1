"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChartLine, Plus, Trash, CircleNotch, SquaresFour, WarningCircle } from "@phosphor-icons/react";
import { fadeIn, Card, Alert } from "@/components/report-blocks";

type DashboardSummary = { id: number; name: string; refresh_seconds: number; updated_at: string; widgetCount: number };

export default function DashboardsPage() {
  const router = useRouter();
  const [dashboards, setDashboards] = useState<DashboardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/dashboards");
    if (res.ok) {
      const data = await res.json();
      setDashboards(data.dashboards ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        router.push(`/dashboards/${data.dashboard.id}`);
      } else {
        setError(data?.error ?? "Failed to create the dashboard.");
      }
    } catch {
      setError("Network error creating the dashboard.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number) {
    const previous = dashboards;
    setDashboards((prev) => prev.filter((d) => d.id !== id));
    const res = await fetch(`/api/dashboards/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setDashboards(previous);
      setError("Failed to delete the dashboard - it's still here.");
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-16">
      <motion.div initial="hidden" animate="show" variants={fadeIn} className="flex items-start justify-between gap-4">
        <div>
          <span className="rounded-full border border-[var(--color-border)] bg-card/70 px-4 py-1.5 text-xs font-semibold tracking-wide text-primary">
            LIVE DASHBOARDS
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">Dashboards</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Auto-refreshing KPI, chart, and table widgets built from your data sources &mdash; click any widget to
            drill into the underlying records.
          </p>
        </div>
      </motion.div>

      {error && (
        <Alert icon={WarningCircle} tone="destructive">
          {error}
        </Alert>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="New dashboard name"
            className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-background px-3 py-2 text-sm text-foreground"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? <CircleNotch size={14} weight="bold" className="animate-spin" /> : <Plus size={14} weight="bold" />}
            Create
          </button>
        </div>
      </Card>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CircleNotch size={16} weight="bold" className="animate-spin" />
          Loading...
        </div>
      )}

      {!loading && dashboards.length === 0 && (
        <div className="flex flex-col items-start gap-2 rounded-2xl border border-[var(--color-border)] bg-card/70 p-6 text-sm text-muted-foreground backdrop-blur">
          <SquaresFour size={20} weight="bold" />
          No dashboards yet &mdash; create one above.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {dashboards.map((d, i) => (
          <motion.div
            key={d.id}
            initial="hidden"
            animate="show"
            variants={fadeIn}
            transition={{ delay: Math.min(i * 0.04, 0.4) }}
            className="group flex items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-card/50 p-4 transition-colors hover:bg-muted"
          >
            <Link href={`/dashboards/${d.id}`} className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <ChartLine size={16} weight="bold" className="shrink-0 text-primary" />
                <h2 className="truncate text-sm font-semibold text-foreground">{d.name}</h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {d.widgetCount} widget{d.widgetCount === 1 ? "" : "s"}
                {d.refresh_seconds > 0 ? ` · refreshes every ${d.refresh_seconds}s` : " · manual refresh"}
              </p>
            </Link>
            <button
              onClick={() => handleDelete(d.id)}
              className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
              title="Delete"
              aria-label={`Delete dashboard "${d.name}"`}
            >
              <Trash size={14} weight="bold" aria-hidden="true" />
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
