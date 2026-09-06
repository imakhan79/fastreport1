"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, FileArrowDown, CircleNotch, Plus, Clock } from "@phosphor-icons/react";
import { fadeIn, StatusBadge, ScheduleRow, type Schedule } from "@/components/report-blocks";

type ReportSummary = {
  id: number;
  title: string | null;
  natural_language_request: string;
  status: string;
  confidence_overall: number | null;
  created_at: string;
  updated_at: string;
  exportFormats: string[];
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ReportCatalogPage() {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/reports");
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (cancelled) return;
      setReports(data.reports ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/schedules");
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (cancelled) return;
      setSchedules(data.schedules ?? []);
      setSchedulesLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleSchedule(schedule: Schedule) {
    const nextStatus = schedule.status === "active" ? "paused" : "active";
    setSchedules((prev) => prev.map((s) => (s.id === schedule.id ? { ...s, status: nextStatus } : s)));
    await fetch(`/api/schedules/${schedule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
  }

  async function removeSchedule(scheduleId: number) {
    setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
    await fetch(`/api/schedules/${scheduleId}`, { method: "DELETE" });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-16">
      <motion.div
        initial="hidden"
        animate="show"
        variants={fadeIn}
        className="flex items-start justify-between gap-4"
      >
        <div>
          <span className="rounded-full border border-[var(--color-border)] bg-card/70 px-4 py-1.5 text-xs font-semibold tracking-wide text-primary">
            REPORTS
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">All reports</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Every report request the pipeline has ever run, newest first.
          </p>
        </div>
        <Link
          href="/reports/new"
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-transform hover:scale-[1.03] active:scale-[0.98]"
        >
          <Plus size={16} weight="bold" />
          New
        </Link>
      </motion.div>

      {!schedulesLoading && schedules.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
              <Clock size={14} weight="bold" />
              Scheduled ({schedules.length})
            </h2>
            <Link href="/schedules" className="text-xs font-medium text-primary hover:underline">
              Manage schedules
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {schedules.map((s) => (
              <ScheduleRow key={s.id} schedule={s} onToggle={toggleSchedule} onDelete={removeSchedule} />
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CircleNotch size={16} weight="bold" className="animate-spin" />
          Loading...
        </div>
      )}

      {!loading && reports.length === 0 && (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-card/70 p-6 text-sm text-muted-foreground backdrop-blur">
          No reports yet.
          <Link href="/reports/new" className="font-medium text-primary hover:underline">
            Submit your first request &rarr;
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {reports.map((report) => (
          <Link
            key={report.id}
            href={`/reports/${report.id}`}
            className="group flex items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-card/50 p-4 transition-colors hover:bg-muted"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-sm font-semibold text-foreground">
                  {report.title ?? report.natural_language_request}
                </h2>
                <StatusBadge status={report.status} />
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">{report.natural_language_request}</p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {formatDate(report.created_at)}
                {report.confidence_overall !== null && <> &middot; confidence {report.confidence_overall}%</>}
                {report.exportFormats.length > 0 && (
                  <>
                    {" "}
                    &middot;{" "}
                    <span className="inline-flex items-center gap-1 align-middle">
                      <FileArrowDown size={12} weight="bold" />
                      {report.exportFormats.map((f) => f.toUpperCase()).join(", ")}
                    </span>
                  </>
                )}
              </p>
            </div>
            <ArrowRight
              size={16}
              weight="bold"
              className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
