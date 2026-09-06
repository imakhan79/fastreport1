"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  PaintBrush,
  Database,
  Paperclip,
  SealCheck,
  Clock,
  CheckCircle,
  XCircle,
  CircleNotch,
  WarningCircle,
  type Icon,
} from "@phosphor-icons/react";

type Task = {
  id: number;
  task_type: string;
  status: string;
  priority: string;
  confidence: number | null;
  deadline: string | null;
  created_at: string;
  report: { id: number; title: string | null; natural_language_request: string } | null;
  design: { id: number; confidence: number; qa_issues: string[] } | null;
  query: { id: number; sql_text: string | null; confidence: number | null; row_count: number | null; validation_errors: string[] } | null;
  attachment: { id: number; classification: string | null; classification_confidence: number | null } | null;
};

const TASK_TYPE_LABEL: Record<string, string> = {
  design_review: "Design Review",
  query_review: "Query Review",
  attachment_review: "Attachment Review",
  attachment_request: "Attachment Request",
  approval: "Final Approval",
};

const TASK_TYPE_ICON: Record<string, Icon> = {
  design_review: PaintBrush,
  query_review: Database,
  attachment_review: Paperclip,
  attachment_request: Paperclip,
  approval: SealCheck,
};

const fadeIn = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load() {
    const res = await fetch("/api/tasks");
    const data = await res.json();
    setTasks(data.tasks ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/tasks");
      const data = await res.json();
      if (!cancelled) {
        setTasks(data.tasks ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDecision(taskId: number, decision: "approve" | "reject") {
    setBusyId(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (res.ok) {
        await load();
      }
    } finally {
      setBusyId(null);
    }
  }

  const openTasks = tasks.filter((t) => t.status === "open" && t.task_type !== "attachment_request");
  const waitingOnUpload = tasks.filter((t) => t.status === "open" && t.task_type === "attachment_request");
  const resolvedTasks = tasks.filter((t) => t.status !== "open");

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-16">
      <motion.div initial="hidden" animate="show" variants={fadeIn}>
        <span className="rounded-full border border-[var(--color-border)] bg-card/70 px-4 py-1.5 text-xs font-semibold tracking-wide text-primary">
          HUMAN REVIEW
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">Review dashboard</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Only tasks the automation couldn&apos;t confidently resolve show up here.
        </p>
        <Link
          href="/reports/new"
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft size={14} weight="bold" /> New report request
        </Link>
      </motion.div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CircleNotch size={16} weight="bold" className="animate-spin" />
          Loading...
        </div>
      )}

      {!loading && openTasks.length === 0 && (
        <motion.div
          initial="hidden"
          animate="show"
          variants={fadeIn}
          className="flex items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-card/70 p-6 text-sm text-muted-foreground backdrop-blur"
        >
          <CheckCircle size={18} weight="bold" className="text-green-600" />
          No open review tasks. Everything auto-approved.
        </motion.div>
      )}

      <div className="flex flex-col gap-4">
        <AnimatePresence>
          {openTasks.map((task) => (
            <TaskCard key={task.id} task={task} busy={busyId === task.id} onDecision={handleDecision} />
          ))}
        </AnimatePresence>
      </div>

      {waitingOnUpload.length > 0 && (
        <div>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <Clock size={14} weight="bold" />
            Waiting on document upload ({waitingOnUpload.length})
          </h2>
          <div className="flex flex-col gap-2">
            {waitingOnUpload.map((task) => (
              <div
                key={task.id}
                className="rounded-xl border border-[var(--color-border)] bg-card/50 p-4 text-sm"
              >
                <span className="font-medium text-foreground">{task.report?.title ?? "Report"}</span>
                <span className="text-muted-foreground">
                  {" "}
                  &middot; deadline {task.deadline ? new Date(task.deadline).toLocaleString() : "none"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {resolvedTasks.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Resolved ({resolvedTasks.length})</h2>
          <div className="flex flex-col gap-2">
            {resolvedTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-2 rounded-xl border border-[var(--color-border)]/50 p-3 text-sm text-muted-foreground"
              >
                {task.status === "completed" ? (
                  <CheckCircle size={14} weight="bold" className="shrink-0 text-green-600" />
                ) : (
                  <XCircle size={14} weight="bold" className="shrink-0 text-muted-foreground" />
                )}
                {TASK_TYPE_LABEL[task.task_type] ?? task.task_type} for &quot;{task.report?.title}&quot; &middot;{" "}
                {task.status}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  busy,
  onDecision,
}: {
  task: Task;
  busy: boolean;
  onDecision: (taskId: number, decision: "approve" | "reject") => void;
}) {
  const IconComponent = TASK_TYPE_ICON[task.task_type] ?? SealCheck;

  return (
    <motion.div
      layout
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, x: -16, transition: { duration: 0.25 } }}
      variants={fadeIn}
      className="flex flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-card/70 p-6 backdrop-blur"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600">
            <IconComponent size={17} weight="bold" aria-hidden="true" />
          </span>
          <div>
            <span className="text-xs font-semibold tracking-wide text-amber-600">
              {TASK_TYPE_LABEL[task.task_type] ?? task.task_type}
            </span>
            <h2 className="font-semibold text-foreground">
              {task.report?.title ?? task.report?.natural_language_request ?? "Report"}
            </h2>
          </div>
        </div>
        <div className="shrink-0 text-right text-xs whitespace-nowrap text-muted-foreground">
          {task.confidence !== null && <div>confidence {task.confidence}%</div>}
          {task.deadline && <div>due {new Date(task.deadline).toLocaleString()}</div>}
        </div>
      </div>

      {task.design && (
        <div className="text-xs text-muted-foreground">
          Design confidence {task.design.confidence}%
          {task.design.qa_issues.length > 0 && (
            <ul className="mt-1 flex flex-col gap-1 text-amber-600">
              {task.design.qa_issues.map((issue, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <WarningCircle size={12} weight="bold" className="mt-0.5 shrink-0" />
                  {issue}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {task.query && (
        <div className="flex flex-col gap-2 text-xs text-muted-foreground">
          {task.query.sql_text && (
            <pre className="overflow-x-auto rounded-xl bg-[#0f172a] p-3 text-slate-100">{task.query.sql_text}</pre>
          )}
          <span>
            confidence {task.query.confidence}% &middot; {task.query.row_count ?? 0} rows
          </span>
          {task.query.validation_errors.length > 0 && (
            <ul className="flex flex-col gap-1 text-amber-600">
              {task.query.validation_errors.map((issue, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <WarningCircle size={12} weight="bold" className="mt-0.5 shrink-0" />
                  {issue}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {task.attachment && (
        <div className="text-xs text-muted-foreground">
          Classified as &quot;{task.attachment.classification}&quot; ({task.attachment.classification_confidence}%
          confidence)
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onDecision(task.id, "approve")}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-full bg-green-600 px-5 py-2 text-xs font-semibold text-white transition-transform hover:scale-[1.03] disabled:opacity-50 disabled:hover:scale-100"
        >
          {busy ? <CircleNotch size={13} weight="bold" className="animate-spin" /> : <CheckCircle size={13} weight="bold" />}
          Approve
        </button>
        <button
          onClick={() => onDecision(task.id, "reject")}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-full bg-red-600 px-5 py-2 text-xs font-semibold text-white transition-transform hover:scale-[1.03] disabled:opacity-50 disabled:hover:scale-100"
        >
          <XCircle size={13} weight="bold" />
          Reject
        </button>
      </div>
    </motion.div>
  );
}
