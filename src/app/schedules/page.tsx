"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CircleNotch, Trash, Pause, Play, Clock } from "@phosphor-icons/react";
import { fadeIn } from "@/components/report-blocks";

type Schedule = {
  id: number;
  title: string | null;
  natural_language_request: string;
  frequency: "daily" | "weekly" | "monthly";
  day_of_week: number | null;
  day_of_month: number | null;
  hour_utc: number;
  status: "active" | "paused";
  last_run_at: string | null;
  next_run_at: string;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function describe(s: Schedule): string {
  const time = `${String(s.hour_utc).padStart(2, "0")}:00 UTC`;
  if (s.frequency === "daily") return `Daily at ${time}`;
  if (s.frequency === "weekly") return `Weekly on ${DAYS[s.day_of_week ?? 0]} at ${time}`;
  return `Monthly on day ${s.day_of_month} at ${time}`;
}

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("daily");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [hourUtc, setHourUtc] = useState(9);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/schedules");
    if (!res.ok) return;
    const data = await res.json();
    setSchedules(data.schedules ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/schedules");
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (cancelled) return;
      setSchedules(data.schedules ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request,
          frequency,
          dayOfWeek: frequency === "weekly" ? dayOfWeek : null,
          dayOfMonth: frequency === "monthly" ? dayOfMonth : null,
          hourUtc,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create schedule.");
      } else {
        setRequest("");
        await load();
      }
    } catch {
      setError("Network error creating schedule.");
    } finally {
      setCreating(false);
    }
  }

  async function toggleStatus(schedule: Schedule) {
    const nextStatus = schedule.status === "active" ? "paused" : "active";
    setSchedules((prev) => prev.map((s) => (s.id === schedule.id ? { ...s, status: nextStatus } : s)));
    await fetch(`/api/schedules/${schedule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
  }

  async function remove(scheduleId: number) {
    setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
    await fetch(`/api/schedules/${scheduleId}`, { method: "DELETE" });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-16">
      <motion.div initial="hidden" animate="show" variants={fadeIn}>
        <span className="rounded-full border border-[var(--color-border)] bg-card/70 px-4 py-1.5 text-xs font-semibold tracking-wide text-primary">
          SCHEDULES
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">Recurring reports</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Save a request once and let the pipeline re-run it on a schedule. Checked once a day.
        </p>
      </motion.div>

      <motion.form
        initial="hidden"
        animate="show"
        variants={fadeIn}
        onSubmit={handleCreate}
        className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-card/70 p-5 backdrop-blur"
      >
        <textarea
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="e.g. Summarize this week's signups by plan tier."
          rows={2}
          className="rounded-xl border border-[var(--color-border)] bg-background p-3 text-sm text-foreground outline-none focus:shadow-[0_0_0_3px_var(--color-primary)] focus:shadow-primary/20"
        />

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as "daily" | "weekly" | "monthly")}
            className="rounded-lg border border-[var(--color-border)] bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>

          {frequency === "weekly" && (
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
              className="rounded-lg border border-[var(--color-border)] bg-background px-3 py-2 text-sm text-foreground"
            >
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          )}

          {frequency === "monthly" && (
            <select
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(Number(e.target.value))}
              className="rounded-lg border border-[var(--color-border)] bg-background px-3 py-2 text-sm text-foreground"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  Day {d}
                </option>
              ))}
            </select>
          )}

          <select
            value={hourUtc}
            onChange={(e) => setHourUtc(Number(e.target.value))}
            className="rounded-lg border border-[var(--color-border)] bg-background px-3 py-2 text-sm text-foreground"
          >
            {Array.from({ length: 24 }, (_, i) => i).map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00 UTC
              </option>
            ))}
          </select>

          <button
            type="submit"
            disabled={creating || request.trim().length === 0}
            className="ml-auto flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary disabled:opacity-50"
          >
            {creating && <CircleNotch size={14} weight="bold" className="animate-spin" />}
            {creating ? "Saving..." : "Create schedule"}
          </button>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
      </motion.form>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CircleNotch size={16} weight="bold" className="animate-spin" />
          Loading...
        </div>
      )}

      {!loading && schedules.length === 0 && (
        <div className="rounded-2xl border border-[var(--color-border)] bg-card/70 p-6 text-sm text-muted-foreground backdrop-blur">
          No schedules yet.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {schedules.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-card/50 p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {s.title ?? s.natural_language_request}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{describe(s)}</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Clock size={12} weight="bold" />
                {s.status === "paused" ? "paused" : `next run ${new Date(s.next_run_at).toLocaleString()}`}
                {s.last_run_at && <> &middot; last ran {new Date(s.last_run_at).toLocaleString()}</>}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => toggleStatus(s)}
                title={s.status === "active" ? "Pause" : "Resume"}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {s.status === "active" ? <Pause size={14} weight="bold" /> : <Play size={14} weight="bold" />}
              </button>
              <button
                onClick={() => remove(s.id)}
                title="Delete"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
              >
                <Trash size={14} weight="bold" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
