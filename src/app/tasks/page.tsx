"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/tasks");
    const data = await res.json();
    setTasks(data.tasks ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
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
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-16 font-sans">
      <div>
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Human Review</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Only tasks the automation couldn&apos;t confidently resolve show up here.
        </p>
        <Link href="/reports/new" className="mt-2 inline-block text-sm text-blue-600 dark:text-blue-400">
          &larr; New report request
        </Link>
      </div>

      {loading && <p className="text-sm text-zinc-500">Loading...</p>}

      {!loading && openTasks.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No open review tasks. Everything auto-approved.</p>
      )}

      <div className="flex flex-col gap-4">
        {openTasks.map((task) => (
          <TaskCard key={task.id} task={task} busy={busyId === task.id} onDecision={handleDecision} />
        ))}
      </div>

      {waitingOnUpload.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Waiting on document upload ({waitingOnUpload.length})
          </h2>
          <div className="flex flex-col gap-2">
            {waitingOnUpload.map((task) => (
              <div key={task.id} className="rounded-md border border-black/10 p-3 text-sm dark:border-white/10">
                <span className="font-medium text-black dark:text-zinc-50">{task.report?.title ?? "Report"}</span>
                <span className="text-zinc-500 dark:text-zinc-400"> &middot; deadline {task.deadline ? new Date(task.deadline).toLocaleString() : "none"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {resolvedTasks.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Resolved ({resolvedTasks.length})
          </h2>
          <div className="flex flex-col gap-2">
            {resolvedTasks.map((task) => (
              <div key={task.id} className="rounded-md border border-black/5 p-3 text-sm text-zinc-500 dark:border-white/5 dark:text-zinc-400">
                {TASK_TYPE_LABEL[task.task_type] ?? task.task_type} for &quot;{task.report?.title}&quot; &middot; {task.status}
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
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <div>
          <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
            {TASK_TYPE_LABEL[task.task_type] ?? task.task_type}
          </span>
          <h2 className="mt-1 font-medium text-black dark:text-zinc-50">
            {task.report?.title ?? task.report?.natural_language_request ?? "Report"}
          </h2>
        </div>
        <div className="text-right text-xs text-zinc-500 dark:text-zinc-400">
          {task.confidence !== null && <div>confidence {task.confidence}%</div>}
          {task.deadline && <div>due {new Date(task.deadline).toLocaleString()}</div>}
        </div>
      </div>

      {task.design && (
        <div className="text-xs text-zinc-600 dark:text-zinc-400">
          Design confidence {task.design.confidence}%
          {task.design.qa_issues.length > 0 && (
            <ul className="mt-1 list-inside list-disc">
              {task.design.qa_issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {task.query && (
        <div className="flex flex-col gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          {task.query.sql_text && (
            <pre className="overflow-x-auto rounded-md bg-black/5 p-2 dark:bg-white/10">{task.query.sql_text}</pre>
          )}
          <span>
            confidence {task.query.confidence}% &middot; {task.query.row_count ?? 0} rows
          </span>
          {task.query.validation_errors.length > 0 && (
            <ul className="list-inside list-disc text-amber-700 dark:text-amber-400">
              {task.query.validation_errors.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {task.attachment && (
        <div className="text-xs text-zinc-600 dark:text-zinc-400">
          Classified as &quot;{task.attachment.classification}&quot; ({task.attachment.classification_confidence}% confidence)
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onDecision(task.id, "approve")}
          disabled={busy}
          className="rounded-full bg-green-600 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={() => onDecision(task.id, "reject")}
          disabled={busy}
          className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
