"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  PaintBrush,
  Database,
  Paperclip,
  FileArrowDown,
  CheckCircle,
  CircleNotch,
  WarningCircle,
  ArrowsClockwise,
  Plus,
  Minus,
} from "@phosphor-icons/react";
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

type DesignComponent = { id: string; section_id: string; type: string; title: string; chart_type: string };

type DesignVersion = {
  id: number;
  version: number;
  confidence: number;
  status: string;
  generated_by: string;
  qa_issues: string[];
  layout: { sections: { id: string; title: string; order: number }[] } | null;
  components: DesignComponent[] | null;
  created_at: string;
};

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
  design: DesignVersion | null;
  designVersions: DesignVersion[];
  query: {
    id: number;
    confidence: number | null;
    verification_confidence: number | null;
    verification_issues: string[];
    status: string;
    sql_text: string | null;
    validation_errors: string[];
    row_count: number | null;
    result_preview: Record<string, unknown>[];
  } | null;
  attachmentRequirements: AttachmentRequirement[];
  exports: { id: number; format: string; url: string | null }[];
};

function componentKey(c: DesignComponent): string {
  return `${c.title}__${c.type}${c.type === "chart" ? `_${c.chart_type}` : ""}`;
}

function diffDesignVersions(a: DesignVersion, b: DesignVersion) {
  const aComps = a.components ?? [];
  const bComps = b.components ?? [];
  const aKeys = new Set(aComps.map(componentKey));
  const bKeys = new Set(bComps.map(componentKey));
  return {
    added: bComps.filter((c) => !aKeys.has(componentKey(c))),
    removed: aComps.filter((c) => !bKeys.has(componentKey(c))),
    unchanged: bComps.filter((c) => aKeys.has(componentKey(c))),
  };
}

const DESIGN_STATUS_TONE: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  auto_approved: "success",
  approved: "success",
  pending_review: "warning",
  rejected: "destructive",
  superseded: "muted",
};

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<ReportDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [attachmentRequirements, setAttachmentRequirements] = useState<AttachmentRequirement[]>([]);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const [compareA, setCompareA] = useState<number | null>(null);
  const [compareB, setCompareB] = useState<number | null>(null);

  async function loadReport() {
    const res = await fetch(`/api/reports/${id}`);
    if (!res.ok) {
      setNotFound(true);
      return;
    }
    const json = await res.json();
    setData(json);
    setAttachmentRequirements(json.attachmentRequirements ?? []);
    const versions = (json.designVersions ?? []) as DesignVersion[];
    if (versions.length >= 2) {
      setCompareA(versions[versions.length - 2].version);
      setCompareB(versions[versions.length - 1].version);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadReport());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleRegenerate() {
    setRegenerating(true);
    setRegenerateError(null);
    try {
      const res = await fetch(`/api/reports/${id}/regenerate-design`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setRegenerateError(json.error ?? "Failed to regenerate the design.");
      } else {
        await loadReport();
      }
    } catch {
      setRegenerateError("Network error regenerating the design.");
    } finally {
      setRegenerating(false);
    }
  }

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

  const { report, design, designVersions, query, exports } = data;
  const plan = report.structured_plan;
  const versionA = designVersions.find((v) => v.version === compareA) ?? null;
  const versionB = designVersions.find((v) => v.version === compareB) ?? null;
  const diff = versionA && versionB ? diffDesignVersions(versionA, versionB) : null;

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
            <div className="flex items-center gap-2">
              <StatusPill tone={DESIGN_STATUS_TONE[design.status] ?? "muted"} label={design.status.replace(/_/g, " ")} />
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                title="Regenerate design"
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                {regenerating ? (
                  <CircleNotch size={13} weight="bold" className="animate-spin" />
                ) : (
                  <ArrowsClockwise size={13} weight="bold" />
                )}
              </button>
            </div>
          </CardHeader>
          <p className="text-xs text-muted-foreground">
            version {design.version} &middot; confidence {design.confidence}%
          </p>

          {regenerateError && <p className="text-xs text-red-600">{regenerateError}</p>}

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

          {designVersions.length > 1 && (
            <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {designVersions.length} versions
                </p>
                <button onClick={() => setShowCompare((v) => !v)} className="text-xs font-medium text-primary hover:underline">
                  {showCompare ? "Hide compare" : "Compare versions"}
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {designVersions.map((v) => (
                  <span
                    key={v.id}
                    className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                    title={`generated by ${v.generated_by}, ${new Date(v.created_at).toLocaleString()}`}
                  >
                    v{v.version} &middot; {v.status.replace(/_/g, " ")}
                  </span>
                ))}
              </div>

              {showCompare && (
                <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <select
                      value={compareA ?? ""}
                      onChange={(e) => setCompareA(Number(e.target.value))}
                      className="rounded-md border border-[var(--color-border)] bg-background px-2 py-1"
                    >
                      {designVersions.map((v) => (
                        <option key={v.id} value={v.version}>
                          v{v.version}
                        </option>
                      ))}
                    </select>
                    <span className="text-muted-foreground">vs</span>
                    <select
                      value={compareB ?? ""}
                      onChange={(e) => setCompareB(Number(e.target.value))}
                      className="rounded-md border border-[var(--color-border)] bg-background px-2 py-1"
                    >
                      {designVersions.map((v) => (
                        <option key={v.id} value={v.version}>
                          v{v.version}
                        </option>
                      ))}
                    </select>
                  </div>

                  {diff && (
                    <div className="flex flex-col gap-2 text-xs">
                      {diff.added.length === 0 && diff.removed.length === 0 && (
                        <p className="text-muted-foreground">No component changes between these versions.</p>
                      )}
                      {diff.added.map((c) => (
                        <span key={`add-${c.id}`} className="flex items-center gap-1.5 text-green-700 dark:text-green-400">
                          <Plus size={11} weight="bold" /> {c.title} ({c.type === "chart" ? c.chart_type : c.type})
                        </span>
                      ))}
                      {diff.removed.map((c) => (
                        <span key={`rm-${c.id}`} className="flex items-center gap-1.5 text-red-600">
                          <Minus size={11} weight="bold" /> {c.title} ({c.type === "chart" ? c.chart_type : c.type})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
            confidence {query.confidence}%
            {query.verification_confidence !== null && <> &middot; verified {query.verification_confidence}%</>}
            &middot; {query.row_count ?? 0} rows
          </p>

          {query.verification_issues.length > 0 && <IssueList issues={query.verification_issues} />}

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
