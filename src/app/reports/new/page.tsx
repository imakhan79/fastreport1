"use client";

import { useState } from "react";

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
};

export default function NewReportPage() {
  const [request, setRequest] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error contacting the orchestrator.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-16 font-sans">
      <div>
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          New Report Request
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Describe what you need in plain language. The AI Orchestrator decides
          what design, query, and attachment work is required &mdash; you never
          create those tasks manually.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <textarea
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="e.g. Create the August sales report comparing it with July, include the approved sales summary, and email it to management."
          rows={4}
          className="rounded-lg border border-black/10 bg-white p-3 text-sm text-black outline-none focus:border-black/30 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <button
          type="submit"
          disabled={loading || request.trim().length === 0}
          className="self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {loading ? "Analyzing request..." : "Submit request"}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-4 rounded-lg border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-black dark:text-zinc-50">
                {result.report.title}
              </h2>
              <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs font-medium text-black dark:bg-white/10 dark:text-zinc-50">
                {result.report.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Report #{result.report.id} &middot; confidence{" "}
              {result.report.confidence_overall}% &middot; type{" "}
              {result.plan.report_type}
            </p>
          </div>

          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {result.plan.reasoning}
          </p>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <PlanField label="Design" value={`${result.plan.design.required ? "required" : "not required"} (${result.plan.design.mode})`} />
            <PlanField label="Query" value={`${result.plan.query.required ? "required" : "not required"} (${result.plan.query.mode})`} />
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
              value={
                result.plan.distribution.required
                  ? `${result.plan.distribution.channel}`
                  : "not required"
              }
            />
          </dl>
        </div>
      )}

      {result?.designError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-400">
          Design pipeline failed: {result.designError}
        </div>
      )}

      {result?.design && (
        <div className="flex flex-col gap-4 rounded-lg border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-black dark:text-zinc-50">Design</h2>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                result.design.status === "auto_approved"
                  ? "bg-green-500/10 text-green-700 dark:text-green-400"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
              }`}
            >
              {result.design.status === "auto_approved" ? "auto-approved" : "pending human review"}
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            confidence {result.design.confidence}%
          </p>

          {result.design.qa_issues.length > 0 && (
            <ul className="list-inside list-disc text-xs text-amber-700 dark:text-amber-400">
              {result.design.qa_issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-3">
            {result.design.layout.sections
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((section) => (
                <div key={section.id} className="rounded-md border border-black/10 p-3 dark:border-white/10">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                    {section.title}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {result.design!.components
                      .filter((c) => c.section_id === section.id)
                      .map((c) => (
                        <span
                          key={c.id}
                          className="rounded-md bg-black/5 px-2 py-1 text-xs text-black dark:bg-white/10 dark:text-zinc-50"
                        >
                          {c.title} ({c.type === "chart" ? c.chart_type : c.type})
                        </span>
                      ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {result?.queryError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-400">
          Query pipeline failed: {result.queryError}
        </div>
      )}

      {result?.query && (
        <div className="flex flex-col gap-4 rounded-lg border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-black dark:text-zinc-50">Query</h2>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                result.query.status === "executed"
                  ? "bg-green-500/10 text-green-700 dark:text-green-400"
                  : result.query.status === "failed"
                    ? "bg-red-500/10 text-red-700 dark:text-red-400"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
              }`}
            >
              {result.query.status === "executed"
                ? "executed"
                : result.query.status === "failed"
                  ? "failed"
                  : "pending human review"}
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            confidence {result.query.confidence}% &middot; {result.query.row_count ?? 0} rows
          </p>

          {result.query.sql_text && (
            <pre className="overflow-x-auto rounded-md bg-black/5 p-3 text-xs text-black dark:bg-white/10 dark:text-zinc-50">
              {result.query.sql_text}
            </pre>
          )}

          {result.query.validation_errors.length > 0 && (
            <ul className="list-inside list-disc text-xs text-amber-700 dark:text-amber-400">
              {result.query.validation_errors.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          )}

          {result.query.result_preview.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr>
                    {Object.keys(result.query.result_preview[0]).map((col) => (
                      <th key={col} className="border-b border-black/10 px-2 py-1 text-zinc-400 dark:border-white/10">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.query.result_preview.slice(0, 10).map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((val, j) => (
                        <td key={j} className="border-b border-black/5 px-2 py-1 text-black dark:border-white/5 dark:text-zinc-50">
                          {String(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlanField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-400">{label}</dt>
      <dd className="text-black dark:text-zinc-50">{value}</dd>
    </div>
  );
}
