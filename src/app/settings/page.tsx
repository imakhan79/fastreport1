"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CircleNotch, CheckCircle, Buildings, Gauge, Users, EnvelopeSimple } from "@phosphor-icons/react";
import { fadeIn, Card, CardHeader } from "@/components/report-blocks";

type Threshold = { actionType: "design" | "query" | "attachment_match"; threshold: number };

type Member = { userId: string; email: string | null; role: string; joinedAt: string };

const THRESHOLD_LABEL: Record<Threshold["actionType"], string> = {
  design: "Design auto-approval",
  query: "Query auto-approval",
  attachment_match: "Attachment matching",
};

function SavedFlash({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-green-600">
      <CheckCircle size={14} weight="bold" />
      Saved
    </span>
  );
}

export default function SettingsPage() {
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [savingOrg, setSavingOrg] = useState(false);
  const [orgSaved, setOrgSaved] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  const [savingThreshold, setSavingThreshold] = useState<string | null>(null);
  const [thresholdSaved, setThresholdSaved] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/settings");
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (cancelled) return;
      setName(data.organization?.name ?? "");
      setEmail(data.organization?.default_distribution_email ?? "");
      setThresholds(data.thresholds ?? []);
      setMembers(data.members ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveOrg(e: React.FormEvent) {
    e.preventDefault();
    setSavingOrg(true);
    setOrgError(null);
    setOrgSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, defaultDistributionEmail: email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOrgError(data.error ?? "Failed to save.");
      } else {
        setOrgSaved(true);
        setTimeout(() => setOrgSaved(false), 2000);
      }
    } catch {
      setOrgError("Network error saving organization.");
    } finally {
      setSavingOrg(false);
    }
  }

  async function saveThreshold(actionType: Threshold["actionType"], threshold: number) {
    setSavingThreshold(actionType);
    setThresholdSaved(null);
    try {
      const res = await fetch("/api/settings/thresholds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType, threshold }),
      });
      if (res.ok) {
        setThresholdSaved(actionType);
        setTimeout(() => setThresholdSaved((cur) => (cur === actionType ? null : cur)), 2000);
      }
    } finally {
      setSavingThreshold(null);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-16">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CircleNotch size={16} weight="bold" className="animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-16">
      <motion.div initial="hidden" animate="show" variants={fadeIn}>
        <span className="rounded-full border border-[var(--color-border)] bg-card/70 px-4 py-1.5 text-xs font-semibold tracking-wide text-primary">
          SETTINGS
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">Organization</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Manage your organization&apos;s name, distribution recipient, confidence thresholds, and members.
        </p>
      </motion.div>

      <Card>
        <CardHeader icon={Buildings} title="Organization" />
        <form onSubmit={saveOrg} className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-background p-3 text-sm text-foreground outline-none focus:shadow-[0_0_0_3px_var(--color-primary)] focus:shadow-primary/20"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <EnvelopeSimple size={12} weight="bold" />
              Default distribution recipients
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ops@example.com, finance@example.com"
              className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-background p-3 text-sm text-foreground outline-none focus:shadow-[0_0_0_3px_var(--color-primary)] focus:shadow-primary/20"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Comma-separated. Used when a report asks to be emailed without naming a specific address.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={savingOrg}
              className="flex items-center gap-1.5 self-start rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary disabled:opacity-50"
            >
              {savingOrg && <CircleNotch size={14} weight="bold" className="animate-spin" />}
              {savingOrg ? "Saving..." : "Save"}
            </button>
            <SavedFlash show={orgSaved} />
            {orgError && <span className="text-xs text-red-600">{orgError}</span>}
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader icon={Gauge} title="Confidence thresholds" />
        <p className="text-xs text-muted-foreground">
          Below this score, the pipeline routes the decision to human review instead of auto-approving it.
        </p>
        <div className="flex flex-col gap-4">
          {thresholds.map((t) => (
            <div key={t.actionType} className="flex items-center gap-4">
              <span className="w-44 shrink-0 text-sm text-foreground">{THRESHOLD_LABEL[t.actionType]}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={t.threshold}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setThresholds((prev) =>
                    prev.map((p) => (p.actionType === t.actionType ? { ...p, threshold: value } : p))
                  );
                }}
                onMouseUp={(e) => saveThreshold(t.actionType, Number((e.target as HTMLInputElement).value))}
                onTouchEnd={(e) => saveThreshold(t.actionType, Number((e.target as HTMLInputElement).value))}
                className="flex-1 accent-primary"
              />
              <span className="w-10 shrink-0 text-right text-sm font-semibold text-foreground">
                {t.threshold}%
              </span>
              <span className="w-14 shrink-0">
                {savingThreshold === t.actionType && (
                  <CircleNotch size={14} weight="bold" className="animate-spin text-muted-foreground" />
                )}
                {thresholdSaved === t.actionType && <SavedFlash show />}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader icon={Users} title="Members" />
        <div className="flex flex-col gap-2">
          {members.map((m) => (
            <div
              key={m.userId}
              className="flex items-center justify-between rounded-xl border border-[var(--color-border)] p-3 text-sm"
            >
              <span className="truncate text-foreground">{m.email ?? m.userId}</span>
              <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground capitalize">
                {m.role}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
