"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, PaintBrush, Database, Paperclip, FileArrowDown, CheckCircle, CircleNotch, WarningCircle } from "@phosphor-icons/react";
import {
  fadeIn,
  Card,
  CardHeader,
  IssueList,
  StatusBadge,
  StatusPill,
  PlanField,
  AttachmentRequirementRow,
  type AttachmentRequirement,
} from "@/components/report-blocks";

type StructuredPlan = {
  title: string;
  report_type: string;
  confidence: number;
  reasoning: string;
  design: { required: boolean; mode: string };
  query: { required: boolean; mode: string };
  attachments: { required: boolean; requirements: string[] };
  approval: { required: boolean };
  distribution: { required: boolean; channel: string | null };
} | null;

type ReportDetail = {
  report: {
    id: number;
    title: string | null;
    natural_language_request: string;
    status: string;
    confidence_overall: number | null;
    structured_plan: StructuredPlan;
    created_at: string;
  };
  design: {
    id: number;
    confidence: number;
    status: string;
    qa_issues: string[];
    layout: { sections: { id: string; title: string; order: number }[] } | null;
    components: { id: string; section_id: string; type: string; title: string; chart_type: string }[] | null;
  } | null;
  query: {
    id: number;
    confidence: number | null;
    status: string;
    sql_text: string | null;
    validation_errors: string[];
    row_count: number | null;
    result_preview: Record<string, unknown>[];
  } | null;
  attachmentRequirements: AttachmentRequirement[];
  exports: { id: number; format: string; url: string | null }[];
};

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<ReportDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [attachmentRequirements, setAttachmentRequirements] = useState<AttachmentRequirement[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/reports/${id}`);
      if (cancelled) return;
      if (!res.ok) {
        setNotFound(true);
        return;
      }
      const json = await res.json();
      if (cancelled) return;
      setData(json);
      setAttachmentRequirements(json.attachmentRequirements ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (notFound) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-6 py-16">
        <p className="text-sm text-muted-foreground">Report not found.</p>
        <Link href="/reports" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          <ArrowLeft size={14} weight="bold" /> All reports
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-6 py-16">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CircleNotch size={16} weight="bold" className="animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  const { report, design, query, exports } = data;
  const plan = report.structured_plan;

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-16">
      <motion.div initial="hidden" animate="show" variants={fadeIn}>
        <Link href="/reports" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          <ArrowLeft size={14} weight="bold" /> All reports
        </Link>
        <div className="mt-4 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {report.title ?? report.natural_language_request}
          </h1>
          <StatusBadge status={report.status} />
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{report.natural_language_request}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Report #{report.id} &middot; confidence {report.confidence_overall}% &middot;{" "}
          {new Date(report.created_at).toLocaleString()}
        </p>
      </motion.div>

      {plan && (
        <Card>
          <p className="text-sm leading-relaxed text-muted-foreground">{plan.reasoning}</p>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <PlanField
              label="Design"
              value={`${plan.design.required ? "required" : "not required"} (${plan.design.mode})`}
            />
            <PlanField
              label="Query"
              value={`${plan.query.required ? "required" : "not required"} (${plan.query.mode})`}
            />
            <PlanField
              label="Attachments"
              value={
                plan.attachments.required
                  ? plan.attachments.requirements.join(", ") || "required"
                  : "not required"
              }
            />
            <PlanField label="Approval" value={plan.approval.required ? "required" : "not required"} />
            <PlanField
              label="Distribution"
              value={plan.distribution.required ? `${plan.distribution.channel}` : "not required"}
            />
          </dl>
        </Card>
      )}

      {design && (
        <Card>
          <CardHeader icon={PaintBrush} title="Design">
            <StatusPill
              tone={design.status === "auto_approved" ? "success" : "warning"}
              label={design.status === "auto_approved" ? "auto-approved" : "pending human review"}
            />
          </CardHeader>
          <p className="text-xs text-muted-foreground">confidence {design.confidence}%</p>

          {design.qa_issues.length > 0 && <IssueList issues={design.qa_issues} />}

          {design.layout && (
            <div className="flex flex-col gap-3">
              {design.layout.sections
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((section) => (
                  <div key={section.id} className="rounded-xl border border-[var(--color-border)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {section.title}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(design.components ?? [])
                        .filter((c) => c.section_id === section.id)
                        .map((c) => (
                          <span key={c.id} className="rounded-lg bg-muted px-2.5 py-1 text-xs text-foreground">
                            {c.title} ({c.type === "chart" ? c.chart_type : c.type})
                          </span>
                        ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Card>
      )}

      {attachmentRequirements.length > 0 && (
        <Card>
          <CardHeader icon={Paperclip} title="Attachments" />
          <div className="flex flex-col gap-3">
            {attachmentRequirements.map((req) => (
              <AttachmentRequirementRow
                key={req.id}
                requirement={req}
                onUpdated={(updated) =>
                  setAttachmentRequirements((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
                }
              />
            ))}
          </div>
        </Card>
      )}

      {exports.length > 0 && (
        <motion.div
          initial="hidden"
          animate="show"
          variants={fadeIn}
          className="flex flex-col gap-3 rounded-2xl border border-green-500/30 bg-green-500/5 p-6"
        >
          <CardHeader icon={CheckCircle} title="Exports" iconTone="success" />
          <div className="flex flex-wrap gap-3">
            {exports.map((exp) =>
              exp.url ? (
                <a
                  key={exp.id}
                  href={exp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-full bg-green-600 px-4 py-2 text-xs font-semibold text-white transition-transform hover:scale-[1.03]"
                >
                  <FileArrowDown size={14} weight="bold" />
                  Download {exp.format.toUpperCase()}
                </a>
              ) : (
                <span key={exp.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <WarningCircle size={14} weight="bold" />
                  {exp.format.toUpperCase()} link expired
                </span>
              )
            )}
          </div>
        </motion.div>
      )}

      {query && (
        <Card>
          <CardHeader icon={Database} title="Query">
            <StatusPill
              tone={
                query.status === "executed" ? "success" : query.status === "failed" ? "destructive" : "warning"
              }
              label={
                query.status === "executed"
                  ? "executed"
                  : query.status === "failed"
                    ? "failed"
                    : "pending human review"
              }
            />
          </CardHeader>
          <p className="text-xs text-muted-foreground">
            confidence {query.confidence}% &middot; {query.row_count ?? 0} rows
          </p>

          {query.sql_text && (
            <pre className="overflow-x-auto rounded-xl bg-[#0f172a] p-4 text-xs text-slate-100">
              {query.sql_text}
            </pre>
          )}

          {query.validation_errors.length > 0 && <IssueList issues={query.validation_errors} />}

          {query.result_preview.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-muted">
                    {Object.keys(query.result_preview[0]).map((col) => (
                      <th key={col} className="px-3 py-2 font-semibold text-muted-foreground">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {query.result_preview.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-t border-[var(--color-border)]">
                      {Object.values(row).map((val, j) => (
                        <td key={j} className="px-3 py-2 text-foreground">
                          {String(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
