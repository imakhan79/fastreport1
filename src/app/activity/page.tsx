"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  PaintBrush,
  Database,
  Paperclip,
  SealCheck,
  PaperPlaneTilt,
  FileArrowDown,
  Robot,
  User,
  Gear,
  CaretDown,
  CircleNotch,
} from "@phosphor-icons/react";

type AuditEntry = {
  id: number;
  actor_type: string;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  details: Record<string, unknown>;
  created_at: string;
  report: { id: number; title: string | null; natural_language_request: string } | null;
};

const ACTION_LABEL: Record<string, string> = {
  "design.auto_approved": "Design auto-approved",
  "design.escalated_for_review": "Design escalated for human review",
  "design.qa_issues_found": "Design QA found issues",
  "query.executed": "Query executed",
  "query.validation_failed": "Query validation failed",
  "attachment.auto_approved": "Attachment auto-approved",
  "attachment.auto_rejected_replacement_requested": "Attachment rejected - replacement requested",
  "attachment.escalated_for_review": "Attachment escalated for human review",
  "attachment.existing_document_matched": "Matched an existing document",
  "attachment.request_created": "Attachment requested",
  "approval.request_created": "Approval requested",
  "report.approved": "Report approved",
  "report.rejected_at_approval": "Report rejected at approval",
  "report.exported": "Report exported",
  "report.generated": "Report generated",
  "report.workflow_completed": "Workflow completed",
  "distribution.sent": "Report emailed",
  "distribution.failed": "Distribution failed",
  "distribution.no_recipient_configured": "Distribution skipped - no recipient configured",
};

const ACTION_ICON: Record<string, typeof Database> = {
  design: PaintBrush,
  query: Database,
  attachment: Paperclip,
  approval: SealCheck,
  distribution: PaperPlaneTilt,
  report: FileArrowDown,
};

const ACTOR_ICON: Record<string, typeof Robot> = {
  ai: Robot,
  system: Gear,
  user: User,
};

function actionLabel(action: string): string {
  return (
    ACTION_LABEL[action] ??
    action
      .split(/[._]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const fadeIn = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
};

export default function ActivityPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/audit-log");
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (cancelled) return;
      setEntries(data.entries ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-16">
      <motion.div initial="hidden" animate="show" variants={fadeIn}>
        <span className="rounded-full border border-[var(--color-border)] bg-card/70 px-4 py-1.5 text-xs font-semibold tracking-wide text-primary">
          ACTIVITY
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">Audit log</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Every automated and human decision the pipeline has made, in order.
        </p>
        <Link
          href="/tasks"
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft size={14} weight="bold" /> Review dashboard
        </Link>
      </motion.div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CircleNotch size={16} weight="bold" className="animate-spin" />
          Loading...
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-card/70 p-6 text-sm text-muted-foreground backdrop-blur">
          No activity yet. Submit a report request to see the pipeline in action.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {entries.map((entry) => (
          <AuditRow key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [expanded, setExpanded] = useState(false);
  const IconComponent = ACTION_ICON[entry.action.split(".")[0]] ?? Gear;
  const ActorIcon = ACTOR_ICON[entry.actor_type] ?? Gear;
  const hasDetails = entry.details && Object.keys(entry.details).length > 0;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-card/50 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
          <IconComponent size={15} weight="bold" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium text-foreground">{actionLabel(entry.action)}</span>
            <span
              className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase"
              title={`Actor: ${entry.actor_type}`}
            >
              <ActorIcon size={10} weight="bold" />
              {entry.actor_type}
            </span>
          </div>
          {entry.report && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {entry.report.title ?? entry.report.natural_language_request}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">{formatTimestamp(entry.created_at)}</p>

          {hasDetails && (
            <>
              <button
                onClick={() => setExpanded((v) => !v)}
                className="mt-2 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <CaretDown
                  size={12}
                  weight="bold"
                  className={`transition-transform ${expanded ? "rotate-180" : ""}`}
                />
                {expanded ? "Hide details" : "Show details"}
              </button>
              {expanded && (
                <pre className="mt-2 overflow-x-auto rounded-lg bg-[#0f172a] p-3 text-xs text-slate-100">
                  {JSON.stringify(entry.details, null, 2)}
                </pre>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
