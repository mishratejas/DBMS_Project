import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../AuthContext";
import { apiFetch, apiCall } from "../api";
import { hasRole } from "../lib/roles";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import SqlPanel from "../components/SqlPanel";
import { inputCls, panelCls, panelHeadCls, btnPrimary, btnGhost } from "../components/ui";
import { Database, ChevronDown, Play, Search, Loader2, ShieldCheck, Lock, Zap, Eye } from "lucide-react";

function ConceptRow({ concept, token, onLoad }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true); setError(null); setPlan(null);
    try { setResult(await apiCall("/dbms-lab/execute", { token, params: { query: concept.canonical_query } })); }
    catch (err) { setError(err.message); }
    finally { setRunning(false); }
  }
  async function explain() {
    setError(null);
    try { setPlan((await apiCall("/dbms-lab/explain", { token, params: { query: concept.canonical_query } })).plan); }
    catch (err) { setError(err.message); }
  }

  return (
    <div className="bg-surface border border-border rounded-xl px-5 py-4 mb-2.5 shadow-sm">
      <div className="flex justify-between items-center gap-4 cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <div className="flex items-center gap-2.5">
          <h3 className="text-[0.95rem] font-display m-0">{concept.name}</h3>
          {concept.executable
            ? <span className="text-[0.7rem] font-medium px-2 py-0.5 rounded-full bg-ok-soft text-ok">runnable</span>
            : <span className="text-[0.7rem] font-medium px-2 py-0.5 rounded-full bg-surface-3 text-ink-muted">reference</span>}
        </div>
        <ChevronDown size={18} className="text-ink-muted transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }} />
      </div>
      {open && (
        <div className="mt-3">
          <p className="text-ink-muted text-sm">{concept.theory}</p>
          <pre className="bg-structure text-[#d9ece8] rounded-md p-4 font-mono text-[0.8rem] whitespace-pre-wrap break-words mb-3">{concept.canonical_query}</pre>
          {concept.executable ? (
            <div className="flex gap-2 flex-wrap">
              <button onClick={run} disabled={running} className={btnPrimary}>{running ? <><Loader2 size={14} className="animate-spin" /> Running…</> : <><Play size={14} /> Execute</>}</button>
              <button onClick={explain} className={btnGhost}><Eye size={14} /> Explain plan</button>
              <button onClick={() => onLoad(concept.canonical_query)} className={btnGhost}>Edit in console</button>
            </div>
          ) : <p className="text-ink-muted text-xs">Not a SELECT — reference only (the sandbox account cannot run DDL/DML). See the live demos below and the database/*.sql files.</p>}
          {error && <p className="text-urgent mt-2 text-sm">{error}</p>}
          {plan && <pre className="mt-3 bg-surface-2 border border-border rounded-md p-3 text-[0.72rem] font-mono overflow-x-auto">{plan}</pre>}
          {result && <div className="mt-3"><DataTable rows={result.results} filename={`${concept.id}.csv`} maxHeight={360} /><SqlPanel sql={result.sql_executed} meta={result} /></div>}
        </div>
      )}
    </div>
  );
}

function StepLog({ demo }) {
  if (!demo) return null;
  return (
    <div className="mt-3">
      <div className="text-sm font-medium mb-2">{demo.title}</div>
      <div className="space-y-1.5">
        {demo.steps.map((s) => (
          <div key={s.step} className={`border rounded-lg p-2.5 text-xs ${s.ok ? "border-border bg-surface-2" : "border-[#f0c9be] bg-urgent-soft"}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono font-semibold">#{s.step}</span>
              <span className={`px-1.5 py-0.5 rounded font-semibold ${s.session === "A" ? "bg-accent text-white" : "bg-structure text-white"}`}>Session {s.session}</span>
              <span className="text-ink-faint">{s.ms} ms</span>
            </div>
            <pre className="m-0 font-mono whitespace-pre-wrap text-ink-soft">{s.sql}</pre>
            <div className={`mt-1 font-medium ${s.ok ? "text-ok" : "text-urgent"}`}>→ {s.ok ? JSON.stringify(s.result) : s.error}</div>
          </div>
        ))}
      </div>
      {demo.explanation && <p className="text-xs text-ink-muted mt-2">{demo.explanation}</p>}
    </div>
  );
}

export default function DbmsLabPage() {
  const { auth } = useAuth();
  const isAdmin = hasRole(auth);
  const [concepts, setConcepts] = useState([]);
  const [filter, setFilter] = useState("");
  const [sql, setSql] = useState("SELECT dep.department_name, COUNT(*) AS doctors, ROUND(AVG(d.consultation_fee)) AS avg_fee\n  FROM doctor d JOIN department dep ON dep.department_id = d.department_id\n GROUP BY dep.department_name\n ORDER BY avg_fee DESC");
  const [console_, setConsole] = useState(null);
  const [consoleErr, setConsoleErr] = useState(null);
  const [plan, setPlan] = useState(null);
  const [demo, setDemo] = useState(null);
  const [rbac, setRbac] = useState(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    apiFetch("/dbms-lab/concepts", { token: auth.token }).then((d) => setConcepts(d.concepts || []));
  }, [auth.token]);

  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const g = {};
    concepts.filter((c) => !q || c.name.toLowerCase().includes(q) || c.theory.toLowerCase().includes(q) || c.category.toLowerCase().includes(q))
      .forEach((c) => { (g[c.category] = g[c.category] || []).push(c); });
    return g;
  }, [concepts, filter]);

  async function runConsole(kind = "execute") {
    setBusy("console"); setConsoleErr(null);
    try {
      const res = await apiCall(`/dbms-lab/${kind}`, { token: auth.token, params: { query: sql } });
      if (kind === "explain") setPlan(res.plan); else { setConsole(res); setPlan(null); }
    } catch (e) { setConsoleErr(e.message); }
    finally { setBusy(""); }
  }

  async function runDemo(name) {
    setBusy(name); setDemo(null);
    try {
      const res = await apiCall(`/dbms-lab/demo/${name}`, { token: auth.token });
      if (name === "rbac") setRbac(res); else setDemo(res);
    } catch (e) { setDemo({ title: "Demo failed", steps: [{ step: 1, session: "A", sql: name, ok: false, error: e.message, ms: 0 }] }); }
    finally { setBusy(""); }
  }

  return (
    <div>
      <PageHeader title="DBMS concept lab" subtitle="Every concept from the brief backed by a real query on this hospital's data, a read-only SQL console, and live transaction / concurrency / security demonstrations." />

      <div className={panelCls}>
        <div className={panelHeadCls}>
          <h2 className="text-lg font-display m-0 flex items-center gap-2"><Database size={18} className="text-accent" /> SQL console (SELECT only, runs as readonly1)</h2>
        </div>
        <textarea className={`${inputCls} font-mono text-[0.82rem] min-h-[130px]`} value={sql} onChange={(e) => setSql(e.target.value)} spellCheck={false} />
        <div className="flex gap-2 mt-2 flex-wrap">
          <button className={btnPrimary} onClick={() => runConsole("execute")} disabled={busy === "console"}>{busy === "console" ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Run</button>
          <button className={btnGhost} onClick={() => runConsole("explain")}><Eye size={15} /> Explain plan</button>
          <span className="text-xs text-ink-muted self-center">Try an INSERT — the app refuses it, and even if it didn't, Oracle would (readonly1 has SELECT privileges only).</span>
        </div>
        {consoleErr && <p className="text-urgent text-sm mt-2">{consoleErr}</p>}
        {plan && <pre className="mt-3 bg-surface-2 border border-border rounded-md p-3 text-[0.72rem] font-mono overflow-x-auto">{plan}</pre>}
        {console_ && <div className="mt-3"><DataTable rows={console_.results} filename="query.csv" maxHeight={380} /><SqlPanel sql={console_.sql_executed} meta={console_} /></div>}
      </div>

      <div className={panelCls}>
        <div className={panelHeadCls}>
          <h2 className="text-lg font-display m-0 flex items-center gap-2"><Zap size={18} className="text-accent" /> Live demos: transactions, ACID & concurrency</h2>
          {!isAdmin && <span className="text-xs text-warn">Log in as admin1 to run the transaction demos (they use the admin connection and always ROLLBACK).</span>}
        </div>
        <div className="flex gap-2 flex-wrap">
          {[["transaction", "SAVEPOINT / ROLLBACK TO"], ["atomic-procedure", "Atomic stored procedure"], ["isolation", "Two sessions: isolation & locks"]].map(([k, label]) => (
            <button key={k} className={btnGhost} disabled={!isAdmin || !!busy} onClick={() => runDemo(k)}>
              {busy === k ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />} {label}
            </button>
          ))}
        </div>
        <StepLog demo={demo} />
      </div>

      <div className={panelCls}>
        <div className={panelHeadCls}>
          <h2 className="text-lg font-display m-0 flex items-center gap-2"><ShieldCheck size={18} className="text-accent" /> Role-based access control matrix (enforced by Oracle)</h2>
          <button className={btnPrimary} disabled={!!busy} onClick={() => runDemo("rbac")}>{busy === "rbac" ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Run probes on all 8 roles</button>
        </div>
        <p className="text-sm text-ink-muted mt-0">Each probe runs on that role's own Oracle account (COUNT(*) or a DML with <code>WHERE 1 = 0</code>, then ROLLBACK). Oracle checks privileges when it parses the statement, so a forbidden statement fails even if it would touch no rows.</p>
        {rbac && (
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-xs">
              <thead><tr className="bg-surface-3/70 text-ink-muted">
                <th className="text-left px-2.5 py-2 border-b border-border-strong">Role (Oracle user)</th>
                {rbac.probes.map((p) => <th key={p} className="text-left px-2.5 py-2 border-b border-border-strong" title={rbac.probe_sql[p]}>{p}</th>)}
              </tr></thead>
              <tbody>
                {rbac.matrix.map((r) => (
                  <tr key={r.role}>
                    <td className="px-2.5 py-1.5 border-b border-border/70 font-medium">{r.role} <span className="font-mono text-ink-faint">({r.db_user})</span></td>
                    {r.error ? <td colSpan={rbac.probes.length} className="px-2.5 py-1.5 text-urgent">{r.error}</td> :
                      rbac.probes.map((p) => (
                        <td key={p} className={`px-2.5 py-1.5 border-b border-border/70 font-medium ${String(r[p]).startsWith("ALLOWED") ? "text-ok" : "text-urgent"}`}>{r[p]}</td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={panelCls}>
        <div className="flex items-center gap-2.5">
          <Search size={16} className="text-ink-muted" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter concepts (join, having, trigger, rollup…)" className="flex-1 border-none outline-none bg-transparent text-sm" />
          <span className="text-xs text-ink-faint">{concepts.length} concepts</span>
        </div>
      </div>
      {Object.entries(grouped).map(([cat, list]) => (
        <div key={cat} className="mb-5">
          <h2 className="text-sm uppercase tracking-[0.12em] text-ink-muted font-semibold mb-2">{cat}</h2>
          {list.map((c) => <ConceptRow key={c.id} concept={c} token={auth.token} onLoad={(q) => { setSql(q); window.scrollTo({ top: 0, behavior: "smooth" }); }} />)}
        </div>
      ))}
    </div>
  );
}
