import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../AuthContext";
import { apiFetch } from "../api";
import { hasRole } from "../lib/roles";
import SqlPanel from "../components/SqlPanel";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import Field from "../components/Field";
import { inputCls, panelCls, btnPrimary, btnGhost } from "../components/ui";
import { BarChart3, Play, FileText, Loader2 } from "lucide-react";

function BarChart({ rows, label, value }) {
  const data = useMemo(() => (rows || [])
    .filter((r) => r[value] != null && !String(r[label] ?? "").startsWith("=="))
    .slice(0, 14), [rows, label, value]);
  if (!data.length) return null;
  const max = Math.max(...data.map((r) => Number(r[value]) || 0)) || 1;
  return (
    <div className="mb-4 p-4 bg-surface-2 border border-border rounded-lg">
      <div className="text-xs text-ink-muted mb-2 uppercase tracking-wider">{value.replace(/_/g, " ")} by {label.replace(/_/g, " ")}</div>
      <div className="space-y-1.5">
        {data.map((r, i) => {
          const v = Number(r[value]) || 0;
          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div className="w-48 shrink-0 truncate text-ink-soft" title={String(r[label])}>{String(r[label] ?? "—")}</div>
              <div className="flex-1 h-4 bg-surface rounded overflow-hidden border border-border">
                <div className="h-full bg-accent/80 rounded" style={{ width: `${Math.max(1, (v / max) * 100)}%` }} />
              </div>
              <div className="w-24 text-right font-mono tabular-nums">{v.toLocaleString("en-IN")}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { auth } = useAuth();
  const isAdmin = hasRole(auth);
  const [catalog, setCatalog] = useState([]);
  const [active, setActive] = useState(null);
  const [params, setParams] = useState({});
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch("/reports/catalog", { token: auth.token }).then((d) => {
      const list = (d.reports || []).filter((r) => !r.admin_only || isAdmin);
      setCatalog(list);
      if (list.length) pick(list[0]);
    }).catch((e) => setError(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(rep) {
    const p = Object.fromEntries((rep.params || []).map((x) => [x.name, x.default]));
    setActive(rep); setParams(p); setData(null);
    run(rep, p);
  }

  async function run(rep = active, p = params) {
    if (!rep) return;
    setLoading(true); setError(null);
    try {
      const path = rep.admin_only ? "/reports/audit" : `/reports/run/${rep.id}`;
      setData(await apiFetch(path, { token: auth.token, params: p }));
    } catch (e) { setError(e.message); setData(null); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <PageHeader title="Reports" subtitle="Each report is one SQL statement demonstrating a DBMS concept, run on the read-only Oracle account. Export to CSV or print / save as PDF."
        actions={<button className={btnGhost} onClick={() => window.print()}><FileText size={15} /> Print / PDF</button>} />

      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <div className={`${panelCls} p-3 h-fit print:hidden`}>
          {catalog.map((r) => (
            <button key={r.id} onClick={() => pick(r)}
              className={`w-full text-left rounded-lg px-3 py-2 mb-1 transition-colors ${active?.id === r.id ? "bg-accent text-white" : "hover:bg-accent-soft text-ink-soft"}`}>
              <div className="text-sm font-medium flex items-center gap-1.5"><BarChart3 size={13} /> {r.title}</div>
              <div className={`text-[0.68rem] mt-0.5 ${active?.id === r.id ? "text-white/80" : "text-ink-faint"}`}>{r.concept}</div>
            </button>
          ))}
        </div>

        <div className={panelCls}>
          {active && (
            <>
              <h2 className="text-xl font-display m-0">{active.title}</h2>
              <p className="text-sm text-ink-muted mt-1">{active.description}</p>
              <div className="inline-flex text-[0.72rem] font-medium px-2.5 py-0.5 rounded-full bg-accent-soft text-accent-strong mb-3">SQL concept: {active.concept}</div>
              {active.params?.length > 0 && (
                <form className="flex gap-3 items-end flex-wrap print:hidden" onSubmit={(e) => { e.preventDefault(); run(); }}>
                  {active.params.map((p) => (
                    <div key={p.name} className="w-48">
                      <Field label={`${p.label} (:${p.name})`}>
                        <input className={inputCls} type={p.type === "int" ? "number" : "text"} value={params[p.name] ?? ""}
                          onChange={(e) => setParams({ ...params, [p.name]: e.target.value })} />
                      </Field>
                    </div>
                  ))}
                  <div className="mb-3.5"><button className={btnPrimary} type="submit" disabled={loading}>{loading ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Run</button></div>
                </form>
              )}
              {error && <p className="text-urgent">{error}</p>}
              {loading && !data && <div className="h-40 bg-surface-3 rounded animate-pulse" />}
              {data && (
                <>
                  {active.chart && <BarChart rows={data.results} label={active.chart.label} value={active.chart.value} />}
                  <DataTable rows={data.results} filename={`${active.id}.csv`} maxHeight={520} emptyMessage="No rows for these parameters." />
                  <SqlPanel sql={data.sql_executed} meta={data} defaultOpen />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
