"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  CircleNotch,
  UploadSimple,
  WarningCircle,
  CheckCircle,
  XCircle,
  Clock,
  Pause,
  Play,
  Trash,
} from "@phosphor-icons/react";

export type AttachmentRequirement = {
  id: number;
  requirement_key: string;
  description: string | null;
  status: string;
};

export type Schedule = {
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

const SCHEDULE_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function describeSchedule(s: Schedule): string {
  const time = `${String(s.hour_utc).padStart(2, "0")}:00 UTC`;
  if (s.frequency === "daily") return `Daily at ${time}`;
  if (s.frequency === "weekly") return `Weekly on ${SCHEDULE_DAYS[s.day_of_week ?? 0]} at ${time}`;
  return `Monthly on day ${s.day_of_month} at ${time}`;
}

export function ScheduleRow({
  schedule,
  onToggle,
  onDelete,
}: {
  schedule: Schedule;
  onToggle: (schedule: Schedule) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-card/50 p-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {schedule.title ?? schedule.natural_language_request}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{describeSchedule(schedule)}</p>
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock size={12} weight="bold" />
          {schedule.status === "paused"
            ? "paused"
            : `next run ${new Date(schedule.next_run_at).toLocaleString()}`}
          {schedule.last_run_at && <> &middot; last ran {new Date(schedule.last_run_at).toLocaleString()}</>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => onToggle(schedule)}
          title={schedule.status === "active" ? "Pause" : "Resume"}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {schedule.status === "active" ? <Pause size={14} weight="bold" /> : <Play size={14} weight="bold" />}
        </button>
        <button
          onClick={() => onDelete(schedule.id)}
          title="Delete"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
        >
          <Trash size={14} weight="bold" />
        </button>
      </div>
    </div>
  );
}

export const fadeIn = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
};

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      exit="hidden"
      variants={fadeIn}
      className="flex flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-card/70 p-6 backdrop-blur"
    >
      {children}
    </motion.div>
  );
}

export function CardHeader({
  icon: IconComponent,
  title,
  iconTone = "primary",
  children,
}: {
  icon: React.ComponentType<{ size?: number; weight?: "bold" | "regular" | "fill"; className?: string }>;
  title: string;
  iconTone?: "primary" | "success";
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
            iconTone === "success" ? "bg-green-500/15 text-green-600" : "bg-muted text-primary"
          }`}
        >
          <IconComponent size={16} weight="bold" aria-hidden="true" />
        </span>
        <h2 className="font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export function Alert({
  icon: IconComponent,
  tone,
  children,
}: {
  icon: React.ComponentType<{ size?: number; weight?: "bold" }>;
  tone: "destructive";
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      exit="hidden"
      variants={fadeIn}
      className={`flex items-start gap-2.5 rounded-2xl border p-4 text-sm ${
        tone === "destructive"
          ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
          : ""
      }`}
    >
      <IconComponent size={18} weight="bold" />
      <span>{children}</span>
    </motion.div>
  );
}

export function IssueList({ issues }: { issues: string[] }) {
  return (
    <ul className="flex flex-col gap-1 text-xs text-amber-700 dark:text-amber-400">
      {issues.map((issue, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <WarningCircle size={14} weight="bold" className="mt-0.5 shrink-0" />
          {issue}
        </li>
      ))}
    </ul>
  );
}

export const STATUS_TONE: Record<string, "muted" | "primary" | "success" | "warning"> = {
  analyzing: "muted",
  designing: "primary",
  querying: "primary",
  attachments_pending: "primary",
  qa: "primary",
  pending_approval: "warning",
  approved: "success",
  generating: "primary",
  exporting: "primary",
  distributing: "primary",
  completed: "success",
  failed: "warning",
  cancelled: "muted",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "muted";
  return <StatusPill tone={tone} label={status.replace(/_/g, " ")} />;
}

export function StatusPill({
  tone,
  label,
}: {
  tone: "muted" | "primary" | "success" | "warning" | "destructive";
  label: string;
}) {
  const toneClasses = {
    muted: "bg-muted text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    success: "bg-green-500/10 text-green-700 dark:text-green-400",
    warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    destructive: "bg-red-500/10 text-red-700 dark:text-red-400",
  }[tone];

  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${toneClasses}`}>
      {label}
    </span>
  );
}

export function PlanField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-foreground">{value}</dd>
    </div>
  );
}

const ATTACHMENT_TONE: Record<string, "success" | "warning" | "primary" | "muted"> = {
  approved: "success",
  requested: "warning",
  uploaded: "primary",
  pending: "muted",
};

export function AttachmentRequirementRow({
  requirement,
  onUpdated,
}: {
  requirement: AttachmentRequirement;
  onUpdated: (updated: AttachmentRequirement) => void;
}) {
  const [file, setFile] = useState<globalThis.File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("requirementId", String(requirement.id));

      const res = await fetch("/api/attachments/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error ?? "Upload failed.");
      } else {
        setMessage(`${data.decision}: ${data.classification.reasoning}`);
        onUpdated({ ...requirement, status: data.decision === "approved" ? "approved" : data.decision === "rejected" ? "requested" : "uploaded" });
      }
    } catch {
      setMessage("Network error uploading file.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{requirement.requirement_key}</span>
        <StatusPill tone={ATTACHMENT_TONE[requirement.status] ?? "muted"} label={requirement.status} />
      </div>

      {requirement.status !== "approved" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted">
            <UploadSimple size={14} weight="bold" />
            {file ? file.name : "Choose file"}
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary disabled:opacity-50"
          >
            {uploading && <CircleNotch size={12} weight="bold" className="animate-spin" />}
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
      )}

      {message && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          {message.startsWith("approved") ? (
            <CheckCircle size={14} weight="bold" className="mt-0.5 shrink-0 text-green-600" />
          ) : message.startsWith("rejected") ? (
            <XCircle size={14} weight="bold" className="mt-0.5 shrink-0 text-red-600" />
          ) : (
            <Clock size={14} weight="bold" className="mt-0.5 shrink-0 text-amber-600" />
          )}
          {message}
        </p>
      )}
    </div>
  );
}
