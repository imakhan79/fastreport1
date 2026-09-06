"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  PaintBrush,
  Database,
  Paperclip,
  FileArrowDown,
  WarningCircle,
  CheckCircle,
  CircleNotch,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import {
  fadeIn,
  Card,
  CardHeader,
  Alert,
  IssueList,
  StatusBadge,
  StatusPill,
  PlanField,
  AttachmentRequirementRow,
  type AttachmentRequirement,
} from "@/components/report-blocks";

type ReportResult = {
  report: {
    id: number;
    title: string | null;
    status: string;
    confidence_overall: number | null;
  };
  plan: {
    title: string;
    report_type: string;
    confidence: number;
    reasoning: string;
    design: { required: boolean; mode: string };
    query: { required: boolean; mode: string };
    attachments: { required: boolean; requirements: string[] };
    approval: { required: boolean };
    distribution: { required: boolean; channel: string | null };
  };
  design: {
    id: number;
    confidence: number;
    status: string;
    qa_issues: string[];
    layout: { sections: { id: string; title: string; order: number }[] };
    components: {
      id: string;
      section_id: string;
      type: string;
      title: string;
      chart_type: string;
    }[];
  } | null;
  designError: string | null;
  query: {
    id: number;
    confidence: number | null;
    status: string;
    sql_text: string | null;
    validation_errors: string[];
    row_count: number | null;
    result_preview: Record<string, unknown>[];
  } | null;
  queryError: string | null;
  attachmentRequirements: AttachmentRequirement[];
  exports: { id: number; format: string; url: string | null }[];
};

export default function NewReportPage() {
  const [request, setRequest] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [attachmentRequirements, setAttachmentRequirements] = useState<AttachmentRequirement[]>([]);
  const [exports, setExports] = useState<{ id: number; format: string; url: string | null }[]>([]);
  const [reportStatus, setReportStatus] = useState<string | null>(null);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedInfo, setImportedInfo] = useState<{ name: string; rowCount: number; columns: string[] } | null>(
    null
  );

  const [wantPdf, setWantPdf] = useState(true);
  const [wantExcel, setWantExcel] = useState(true);

  async function refreshReport(reportId: number) {
    const res = await fetch(`/api/reports/${reportId}`);
    if (!res.ok) return;
    const data = await res.json();
    setAttachmentRequirements(data.attachmentRequirements ?? []);
    setExports(data.exports ?? []);
    setReportStatus(data.report?.status ?? null);
  }

  async function handleImport(file: File) {
    setImportFile(file);
    setImporting(true);
    setImportError(null);
    setImportedInfo(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/reports/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error ?? "Could not import that file.");
        setImportFile(null);
      } else {
        setImportedInfo({ name: data.dataSource.name, rowCount: data.rowCount, columns: data.columns });
      }
    } catch {
      setImportError("Network error importing file.");
      setImportFile(null);
    } finally {
      setImporting(false);
    }
  }

  function clearImport() {
    setImportFile(null);
    setImportedInfo(null);
    setImportError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const exportFormats = [...(wantPdf ? ["pdf"] : []), ...(wantExcel ? ["excel"] : [])];

    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request, exportFormats }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
      } else {
        setResult(data);
        setAttachmentRequirements(data.attachmentRequirements ?? []);
        setExports(data.exports ?? []);
        setReportStatus(data.report?.status ?? null);
      }
    } catch {
      setError("Network error contacting the orchestrator.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-16">
      <motion.div initial="hidden" animate="show" variants={fadeIn}>
        <span className="rounded-full border border-[var(--color-border)] bg-card/70 px-4 py-1.5 text-xs font-semibold tracking-wide text-primary">
          NEW REQUEST
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
          What report do you need?
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Describe it in plain language. The AI Orchestrator decides what design,
          query, and attachment work is required &mdash; you never create those
          tasks manually.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link
            href="/reports"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            All reports <ArrowRight size={14} weight="bold" />
          </Link>
          <Link
            href="/tasks"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Human review dashboard <ArrowRight size={14} weight="bold" />
          </Link>
        </div>
      </motion.div>

      <motion.form
        initial="hidden"
        animate="show"
        variants={fadeIn}
        transition={{ delay: 0.05 }}
        onSubmit={handleSubmit}
        className="flex flex-col gap-3"
      >
        <textarea
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="e.g. Create the August sales report comparing it with July, include the approved sales summary, and email it to management."
          rows={4}
          className="rounded-2xl border border-[var(--color-border)] bg-card/70 p-4 text-sm text-foreground outline-none backdrop-blur transition-shadow focus:shadow-[0_0_0_3px_var(--color-primary)] focus:shadow-primary/20"
        />

        {!importedInfo && (
          <label className="flex w-fit cursor-pointer items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-card/60 px-4 py-2 text-xs font-medium text-muted-foreground backdrop-blur transition-colors hover:bg-card">
            {importing ? (
              <CircleNotch size={13} weight="bold" className="animate-spin" />
            ) : (
              <UploadSimple size={13} weight="bold" />
            )}
            {importing ? "Importing..." : "Import a CSV or Excel file as data (optional)"}
            <input
              type="file"
              accept=".csv,.xlsx"
              disabled={importing}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImport(file);
                e.target.value = "";
              }}
              className="hidden"
            />
          </label>
        )}

        {importedInfo && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-green-500/30 bg-green-500/5 px-4 py-2.5 text-xs">
            <span className="flex items-center gap-1.5 text-green-700 dark:text-green-400">
              <CheckCircle size={14} weight="bold" />
              Imported {importFile?.name} &middot; {importedInfo.rowCount} rows &middot;{" "}
              {importedInfo.columns.length} columns
            </span>
            <button
              type="button"
              onClick={clearImport}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X size={12} weight="bold" />
            </button>
          </div>
        )}

        {importError && (
          <p className="flex items-start gap-1.5 text-xs text-red-600">
            <WarningCircle size={14} weight="bold" className="mt-0.5 shrink-0" />
            {importError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="font-medium uppercase tracking-wide">Export as</span>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={wantPdf} onChange={(e) => setWantPdf(e.target.checked)} />
            PDF
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={wantExcel} onChange={(e) => setWantExcel(e.target.checked)} />
            Excel
          </label>
        </div>

        <button
          type="submit"
          disabled={loading || importing || request.trim().length === 0 || (!wantPdf && !wantExcel)}
          className="flex items-center justify-center gap-2 self-start rounded-full bg-primary px-6 py-3 text-sm font-semibold text-on-primary shadow-md shadow-primary/25 transition-transform hover:scale-[1.03] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
        >
          {loading && <CircleNotch size={16} weight="bold" className="animate-spin" />}
          {loading ? "Analyzing request..." : "Submit request"}
        </button>
      </motion.form>

      <AnimatePresence>
        {error && (
          <Alert icon={WarningCircle} tone="destructive">
            {error}
          </Alert>
        )}

        {result && (
          <Card key="summary">
            <div>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-foreground">{result.report.title}</h2>
                <StatusBadge status={reportStatus ?? result.report.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Report #{result.report.id} &middot; confidence{" "}
                {result.report.confidence_overall}% &middot; type {result.plan.report_type}
              </p>
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground">{result.plan.reasoning}</p>

            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <PlanField
                label="Design"
                value={`${result.plan.design.required ? "required" : "not required"} (${result.plan.design.mode})`}
              />
              <PlanField
                label="Query"
                value={`${result.plan.query.required ? "required" : "not required"} (${result.plan.query.mode})`}
              />
              <PlanField
                label="Attachments"
                value={
                  result.plan.attachments.required
                    ? result.plan.attachments.requirements.join(", ") || "required"
                    : "not required"
                }
              />
              <PlanField label="Approval" value={result.plan.approval.required ? "required" : "not required"} />
              <PlanField
                label="Distribution"
                value={result.plan.distribution.required ? `${result.plan.distribution.channel}` : "not required"}
              />
            </dl>
          </Card>
        )}

        {result?.designError && (
          <Alert icon={WarningCircle} tone="destructive">
            Design pipeline failed: {result.designError}
          </Alert>
        )}

        {result?.design && (
          <Card key="design">
            <CardHeader icon={PaintBrush} title="Design">
              <StatusPill
                tone={result.design.status === "auto_approved" ? "success" : "warning"}
                label={result.design.status === "auto_approved" ? "auto-approved" : "pending human review"}
              />
            </CardHeader>
            <p className="text-xs text-muted-foreground">confidence {result.design.confidence}%</p>

            {result.design.qa_issues.length > 0 && (
              <IssueList issues={result.design.qa_issues} />
            )}

            <div className="flex flex-col gap-3">
              {result.design.layout.sections
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((section) => (
                  <div key={section.id} className="rounded-xl border border-[var(--color-border)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {section.title}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {result.design!.components
                        .filter((c) => c.section_id === section.id)
                        .map((c) => (
                          <span
                            key={c.id}
                            className="rounded-lg bg-muted px-2.5 py-1 text-xs text-foreground"
                          >
                            {c.title} ({c.type === "chart" ? c.chart_type : c.type})
                          </span>
                        ))}
                    </div>
                  </div>
                ))}
            </div>
          </Card>
        )}

        {attachmentRequirements.length > 0 && (
          <Card key="attachments">
            <CardHeader icon={Paperclip} title="Attachments" />
            <div className="flex flex-col gap-3">
              {attachmentRequirements.map((req) => (
                <AttachmentRequirementRow
                  key={req.id}
                  requirement={req}
                  onUpdated={(updated) => {
                    setAttachmentRequirements((prev) =>
                      prev.map((r) => (r.id === updated.id ? updated : r))
                    );
                    if (result) refreshReport(result.report.id);
                  }}
                />
              ))}
            </div>
          </Card>
        )}

        {exports.length > 0 && (
          <motion.div
            key="exports"
            initial="hidden"
            animate="show"
            exit="hidden"
            variants={fadeIn}
            className="flex flex-col gap-3 rounded-2xl border border-green-500/30 bg-green-500/5 p-6"
          >
            <CardHeader icon={CheckCircle} title="Report Ready" iconTone="success" />
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
                ) : null
              )}
            </div>
          </motion.div>
        )}

        {result?.queryError && (
          <Alert icon={WarningCircle} tone="destructive">
            Query pipeline failed: {result.queryError}
          </Alert>
        )}

        {result?.query && (
          <Card key="query">
            <CardHeader icon={Database} title="Query">
              <StatusPill
                tone={
                  result.query.status === "executed"
                    ? "success"
                    : result.query.status === "failed"
                      ? "destructive"
                      : "warning"
                }
                label={
                  result.query.status === "executed"
                    ? "executed"
                    : result.query.status === "failed"
                      ? "failed"
                      : "pending human review"
                }
              />
            </CardHeader>
            <p className="text-xs text-muted-foreground">
              confidence {result.query.confidence}% &middot; {result.query.row_count ?? 0} rows
            </p>

            {result.query.sql_text && (
              <pre className="overflow-x-auto rounded-xl bg-[#0f172a] p-4 text-xs text-slate-100">
                {result.query.sql_text}
              </pre>
            )}

            {result.query.validation_errors.length > 0 && (
              <IssueList issues={result.query.validation_errors} />
            )}

            {result.query.result_preview.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-muted">
                      {Object.keys(result.query.result_preview[0]).map((col) => (
                        <th key={col} className="px-3 py-2 font-semibold text-muted-foreground">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.query.result_preview.slice(0, 10).map((row, i) => (
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
      </AnimatePresence>
    </div>
  );
}
