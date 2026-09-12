"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CircleNotch, Trash, ArrowClockwise, Database, CaretDown, WarningCircle, CheckCircle, Plug, Globe } from "@phosphor-icons/react";
import { fadeIn } from "@/components/report-blocks";

type DataSource = {
  id: number;
  name: string;
  kind: string;
  created_at: string;
  tableNames: string[];
  url?: string;
  lastSyncedAt?: string | null;
  syncError?: string | null;
};

type AuthType = "none" | "api_key_header" | "bearer";
type ConnectorKind = "postgres" | "rest_api";

export default function DataSourcesPage() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectorKind, setConnectorKind] = useState<ConnectorKind>("postgres");

  const [name, setName] = useState("");
  const [connectionString, setConnectionString] = useState("");

  const [url, setUrl] = useState("");
  const [authType, setAuthType] = useState<AuthType>("none");
  const [headerName, setHeaderName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [token, setToken] = useState("");
  const [responsePath, setResponsePath] = useState("");
  const [paginated, setPaginated] = useState(false);
  const [pageParam, setPageParam] = useState("page");
  const [maxPages, setMaxPages] = useState(5);

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  function resetRestFields() {
    setUrl("");
    setAuthType("none");
    setHeaderName("");
    setApiKey("");
    setToken("");
    setResponsePath("");
    setPaginated(false);
    setPageParam("page");
    setMaxPages(5);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const body: Record<string, unknown> =
        connectorKind === "postgres"
          ? { name, connectionString }
          : {
              name,
              kind: "rest_api",
              connectorConfig: {
                url,
                authType,
                headerName: authType === "api_key_header" ? headerName : undefined,
                responsePath: responsePath || undefined,
                paginated,
                pageParam: paginated ? pageParam : undefined,
                maxPages: paginated ? maxPages : undefined,
              },
              connectorSecret: {
                apiKey: authType === "api_key_header" ? apiKey : undefined,
                token: authType === "bearer" ? token : undefined,
              },
            };

      const res = await fetch("/api/data-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add data source.");
      } else {
        setName("");
        setConnectionString("");
        resetRestFields();
        if (typeof data.rowCount === "number") {
          setSuccess(`Connected — imported ${data.rowCount} rows, ${data.columns?.length ?? 0} columns.`);
        }
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
          Connect a Postgres database or a REST API and the Query pipeline, Report Builder, and Dashboards can all
          work with it. The most recently connected source is used for new report requests.
        </p>
      </motion.div>

      <motion.form
        initial="hidden"
        animate="show"
        variants={fadeIn}
        onSubmit={handleCreate}
        className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-card/70 p-5 backdrop-blur"
      >
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConnectorKind("postgres")}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              connectorKind === "postgres"
                ? "border-primary bg-primary text-on-primary"
                : "border-[var(--color-border)] text-foreground hover:bg-muted"
            }`}
          >
            <Plug size={13} weight="bold" />
            Postgres
          </button>
          <button
            type="button"
            onClick={() => setConnectorKind("rest_api")}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              connectorKind === "rest_api"
                ? "border-primary bg-primary text-on-primary"
                : "border-[var(--color-border)] text-foreground hover:bg-muted"
            }`}
          >
            <Globe size={13} weight="bold" />
            REST API
          </button>
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. Production Warehouse)"
          className="rounded-xl border border-[var(--color-border)] bg-background p-3 text-sm text-foreground outline-none focus:shadow-[0_0_0_3px_var(--color-primary)] focus:shadow-primary/20"
        />

        {connectorKind === "postgres" ? (
          <>
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
          </>
        ) : (
          <>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.example.com/v1/records"
              className="rounded-xl border border-[var(--color-border)] bg-background p-3 font-mono text-sm text-foreground outline-none focus:shadow-[0_0_0_3px_var(--color-primary)] focus:shadow-primary/20"
            />

            <select
              value={authType}
              onChange={(e) => setAuthType(e.target.value as AuthType)}
              className="rounded-xl border border-[var(--color-border)] bg-background p-3 text-sm text-foreground"
            >
              <option value="none">No authentication</option>
              <option value="api_key_header">API key header</option>
              <option value="bearer">Bearer token</option>
            </select>

            {authType === "api_key_header" && (
              <div className="flex gap-2">
                <input
                  value={headerName}
                  onChange={(e) => setHeaderName(e.target.value)}
                  placeholder="Header name (default X-API-Key)"
                  className="flex-1 rounded-xl border border-[var(--color-border)] bg-background p-3 text-sm text-foreground"
                />
                <input
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  type="password"
                  placeholder="API key value"
                  className="flex-1 rounded-xl border border-[var(--color-border)] bg-background p-3 font-mono text-sm text-foreground"
                />
              </div>
            )}

            {authType === "bearer" && (
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                type="password"
                placeholder="Bearer token"
                className="rounded-xl border border-[var(--color-border)] bg-background p-3 font-mono text-sm text-foreground"
              />
            )}

            <input
              value={responsePath}
              onChange={(e) => setResponsePath(e.target.value)}
              placeholder="Response path, e.g. data.items (leave blank if the response is already an array)"
              className="rounded-xl border border-[var(--color-border)] bg-background p-3 text-sm text-foreground"
            />

            <label className="flex items-center gap-1.5 text-xs text-foreground">
              <input type="checkbox" checked={paginated} onChange={(e) => setPaginated(e.target.checked)} />
              This API is paginated
            </label>

            {paginated && (
              <div className="flex gap-2">
                <input
                  value={pageParam}
                  onChange={(e) => setPageParam(e.target.value)}
                  placeholder="Page query param name"
                  className="flex-1 rounded-xl border border-[var(--color-border)] bg-background p-3 text-sm text-foreground"
                />
                <input
                  value={maxPages}
                  onChange={(e) => setMaxPages(Math.max(1, Number(e.target.value) || 1))}
                  type="number"
                  min={1}
                  max={20}
                  placeholder="Max pages"
                  className="w-28 rounded-xl border border-[var(--color-border)] bg-background p-3 text-sm text-foreground"
                />
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Fetches once on connect, loads the data into a queryable table, and can be re-synced any time with
              &ldquo;Sync now&rdquo;. Credentials are stored server-side only and never shown again.
            </p>
          </>
        )}

        <button
          type="submit"
          disabled={
            creating ||
            !name.trim() ||
            (connectorKind === "postgres" ? !connectionString.trim() : !url.trim())
          }
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
        {success && (
          <p className="flex items-start gap-1.5 text-xs text-green-700 dark:text-green-400">
            <CheckCircle size={14} weight="bold" className="mt-0.5 shrink-0" />
            {success}
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
  const isRestApi = source.kind === "rest_api";

  async function refresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const res = isRestApi
        ? await fetch(`/api/data-sources/${source.id}/sync`, { method: "POST" })
        : await fetch(`/api/data-sources/${source.id}`, {
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
      setRefreshError("Network error refreshing.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-card/50 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
            {isRestApi ? <Globe size={15} weight="bold" /> : <Database size={15} weight="bold" />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{source.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {source.kind} &middot; {source.tableNames.length} table
              {source.tableNames.length === 1 ? "" : "s"}
              {isRestApi && source.lastSyncedAt && <> &middot; synced {new Date(source.lastSyncedAt).toLocaleString()}</>}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={refresh}
            disabled={refreshing}
            title={isRestApi ? "Sync now" : "Refresh schema"}
            className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {refreshing ? (
              <CircleNotch size={14} weight="bold" className="animate-spin" />
            ) : (
              <ArrowClockwise size={14} weight="bold" />
            )}
            {isRestApi ? "Sync now" : ""}
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

      {(refreshError || source.syncError) && (
        <p className="mt-2 text-xs text-red-600">{refreshError ?? source.syncError}</p>
      )}

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
