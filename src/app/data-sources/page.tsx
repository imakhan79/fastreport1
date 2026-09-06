"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CircleNotch, Trash, ArrowClockwise, Database, CaretDown, WarningCircle } from "@phosphor-icons/react";
import { fadeIn } from "@/components/report-blocks";

type DataSource = {
  id: number;
  name: string;
  kind: string;
  created_at: string;
  tableNames: string[];
};

export default function DataSourcesPage() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [connectionString, setConnectionString] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/data-sources");
    if (!res.ok) return;
    const data = await res.json();
    setSources(data.dataSources ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/data-sources");
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (cancelled) return;
      setSources(data.dataSources ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/data-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, connectionString }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add data source.");
      } else {
        setName("");
        setConnectionString("");
        await load();
      }
    } catch {
      setError("Network error adding data source.");
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: number) {
    setSources((prev) => prev.filter((s) => s.id !== id));
    await fetch(`/api/data-sources/${id}`, { method: "DELETE" });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-16">
      <motion.div initial="hidden" animate="show" variants={fadeIn}>
        <span className="rounded-full border border-[var(--color-border)] bg-card/70 px-4 py-1.5 text-xs font-semibold tracking-wide text-primary">
          DATA SOURCES
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">Connectors</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Connect a Postgres database and the Query pipeline will write schema-aware SQL against it. The
          most recently connected source is used for new report requests.
        </p>
      </motion.div>

      <motion.form
        initial="hidden"
        animate="show"
        variants={fadeIn}
        onSubmit={handleCreate}
        className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-card/70 p-5 backdrop-blur"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. Production Warehouse)"
          className="rounded-xl border border-[var(--color-border)] bg-background p-3 text-sm text-foreground outline-none focus:shadow-[0_0_0_3px_var(--color-primary)] focus:shadow-primary/20"
        />
        <input
          value={connectionString}
          onChange={(e) => setConnectionString(e.target.value)}
          type="password"
          placeholder="postgres://user:password@host:5432/database"
          className="rounded-xl border border-[var(--color-border)] bg-background p-3 font-mono text-sm text-foreground outline-none focus:shadow-[0_0_0_3px_var(--color-primary)] focus:shadow-primary/20"
        />
        <p className="text-xs text-muted-foreground">
          Stored server-side only and never shown again. The pipeline connects read-only, with a
          statement timeout, the same way it queries the built-in demo database.
        </p>

        <button
          type="submit"
          disabled={creating || !name.trim() || !connectionString.trim()}
          className="flex items-center justify-center gap-1.5 self-start rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary disabled:opacity-50"
        >
          {creating && <CircleNotch size={14} weight="bold" className="animate-spin" />}
          {creating ? "Connecting..." : "Add connector"}
        </button>

        {error && (
          <p className="flex items-start gap-1.5 text-xs text-red-600">
            <WarningCircle size={14} weight="bold" className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}
      </motion.form>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CircleNotch size={16} weight="bold" className="animate-spin" />
          Loading...
        </div>
      )}

      {!loading && sources.length === 0 && (
        <div className="rounded-2xl border border-[var(--color-border)] bg-card/70 p-6 text-sm text-muted-foreground backdrop-blur">
          No connectors yet - the pipeline falls back to the built-in demo database.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {sources.map((s) => (
          <DataSourceRow key={s.id} source={s} onDeleted={() => remove(s.id)} onRefreshed={load} />
        ))}
      </div>
    </div>
  );
}

function DataSourceRow({
  source,
  onDeleted,
  onRefreshed,
}: {
  source: DataSource;
  onDeleted: () => void;
  onRefreshed: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  async function refresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const res = await fetch(`/api/data-sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRefreshError(data.error ?? "Refresh failed.");
      } else {
        onRefreshed();
      }
    } catch {
      setRefreshError("Network error refreshing schema.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-card/50 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
            <Database size={15} weight="bold" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{source.name}</p>
            <p className="text-xs text-muted-foreground">
              {source.kind} &middot; {source.tableNames.length} table
              {source.tableNames.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={refresh}
            disabled={refreshing}
            title="Refresh schema"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {refreshing ? (
              <CircleNotch size={14} weight="bold" className="animate-spin" />
            ) : (
              <ArrowClockwise size={14} weight="bold" />
            )}
          </button>
          <button
            onClick={onDeleted}
            title="Delete"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
          >
            <Trash size={14} weight="bold" />
          </button>
          {source.tableNames.length > 0 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <CaretDown size={14} weight="bold" className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
      </div>

      {refreshError && <p className="mt-2 text-xs text-red-600">{refreshError}</p>}

      {expanded && (
        <div className="mt-3 flex flex-wrap gap-2">
          {source.tableNames.map((t) => (
            <span key={t} className="rounded-lg bg-muted px-2.5 py-1 text-xs text-foreground">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
