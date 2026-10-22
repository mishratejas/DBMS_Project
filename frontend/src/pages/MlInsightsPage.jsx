import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { apiFetch, apiCall } from "../api";
import { useToast } from "../components/Toast";
import { hasRole } from "../lib/roles";
import SqlPanel from "../components/SqlPanel";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import DataTable from "../components/DataTable";
import Field from "../components/Field";
import { inputCls, panelCls, panelHeadCls, btnPrimary, btnGhost, btnSmallGhost } from "../components/ui";
import { Brain, AlertCircle, RefreshCw, AlertTriangle, ShieldCheck, Cpu, Calendar, PhoneCall, CheckCircle2, Play, Loader2, Database } from "lucide-react";

const pct = (v, d = 1) => (v == null ? "—" : `${(Number(v) * 100).toFixed(d)}%`);
const num = (v, d = 3) => (v == null ? "—" : Number(v).toFixed(d));

function Metric({ label, value, hint }) {
  return (
    <div className="bg-surface-2 border border-border rounded-lg p-3">
      <div className="text-[0.68rem] uppercase tracking-wider text-ink-muted">{label}</div>
      <div className="text-xl font-display font-semibold mt-0.5">{value}</div>
      {hint && <div className="text-[0.68rem] text-ink-faint mt-0.5">{hint}</div>}
    </div>
  );
}

function RocCurve({ points, auc }) {
  if (!points?.length) return null;
  const W = 220, H = 220, P = 28;
  const x = (v) => P + v * (W - 2 * P), y = (v) => H - P - v * (H - 2 * P);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.fpr).toFixed(1)},${y(p.tpr).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[260px]" role="img" aria-label={`ROC curve, AUC ${auc}`}>
      <rect x={P} y={P} width={W - 2 * P} height={H - 2 * P} fill="none" stroke="var(--color-border-strong)" />
      <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--color-ink-faint)" strokeDasharray="4 4" />
      <path d={d} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" />
      <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--color-ink-muted)">False positive rate</text>
      <text x={10} y={H / 2} textAnchor="middle" fontSize="10" fill="var(--color-ink-muted)" transform={`rotate(-90 10 ${H / 2})`}>True positive rate</text>
      <text x={x(0.55)} y={y(0.2)} fontSize="12" fontWeight="600" fill="var(--color-accent-strong)">AUC {num(auc, 3)}</text>
    </svg>
  );
}

export default function MlInsightsPage() {
  const { auth } = useAuth();
  const toast = useToast();
  const isAdmin = hasRole(auth);
  const canRescore = hasRole(auth, "receptionist");
  const [summary, setSummary] = useState(null);
  const [preds, setPreds] = useState(null);
  const [runs, setRuns] = useState(null);
  const [band, setBand] = useState("");
  const [busy, setBusy] = useState("");
  const [scoreId, setScoreId] = useState("");
  const [score, setScore] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, p, r] = await Promise.all([
        apiFetch("/ml-insights/model-summary", { token: auth.token }),
        apiFetch("/ml-insights/predictions", { token: auth.token, params: { risk_band: band } }),
        apiFetch("/ml-insights/runs", { token: auth.token }),
      ]);
      setSummary(s); setPreds(p); setRuns(r);
    } catch (e) { setError(e.message); }
  }, [auth.token, band]);

  useEffect(() => { load(); }, [load]);

  async function action(kind) {
    setBusy(kind);
    try {
      const res = await apiCall(`/ml-insights/${kind}`, { token: auth.token });
      toast.success(kind === "retrain"
        ? `Retrained: ${res.model_name} (ROC-AUC ${num(res.metrics?.roc_auc)}) — ${res.scored} appointments scored`
        : `${res.scored} upcoming appointments re-scored`);
      load();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(""); }
  }

  async function liveScore(id = scoreId) {
    if (!id) return;
    setBusy("score"); setScoreId(String(id));
    try { setScore(await apiCall(`/ml-insights/score/${id}`, { token: auth.token })); }
    catch (e) { toast.error(e.message); setScore(null); }
    finally { setBusy(""); }
  }

  const run = summary?.run;
  const rep = summary?.report || {};
  const m = rep.metrics || {};
  const cm = m.confusion_matrix;
  const rows = preds?.results || [];
  const high = rows.filter((r) => r.risk_band === "HIGH").length;
  const avg = rows.length ? rows.reduce((a, r) => a + Number(r.probability || 0), 0) / rows.length : 0;
  const maxImp = Math.max(0.0001, ...(rep.importance || []).map((x) => x.importance));

  return (
    <div>
      <PageHeader
        title="AI/ML: appointment no-show prediction"
        subtitle="Binary classifier trained on the hospital's own appointment history in Oracle. Features are computed by SQL, predictions are written back with MERGE, and staff see them here."
        actions={<>
          <button className={btnGhost} onClick={load}><RefreshCw size={15} /> Refresh</button>
          {canRescore && <button className={btnGhost} onClick={() => action("rescore")} disabled={!!busy}>{busy === "rescore" ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Re-score upcoming</button>}
          {isAdmin && <button className={btnPrimary} onClick={() => action("retrain")} disabled={!!busy}>{busy === "retrain" ? <><Loader2 size={15} className="animate-spin" /> Training…</> : <><Cpu size={15} /> Retrain model</>}</button>}
        </>}
      />

      <div className="bg-warn-soft border border-[#e6d9b3] rounded-xl p-4 mb-5 flex gap-3 items-start text-sm">
        <AlertCircle size={20} className="text-warn shrink-0 mt-0.5" />
        <span className="text-ink-muted"><strong className="text-warn">Decision support only.</strong> A probability is a behavioural estimate used to decide whom to remind — never a medical judgement.</span>
      </div>
      {error && <p className="text-urgent">{error}</p>}

      {summary && !summary.available && (
        <div className={`${panelCls} border-l-4 border-l-warn`}>
          <strong>No active model yet.</strong> <span className="text-sm text-ink-muted">{summary.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {[
          ["Upcoming scored", rows.length, "appointments with a risk score", Calendar, "bg-accent-soft text-accent"],
          ["High risk", high, `probability ≥ threshold ${run ? num(run.threshold, 2) : ""}`, AlertTriangle, "bg-urgent-soft text-urgent"],
          ["Average risk", pct(avg), `historic no-show rate ${pct(rep.no_show_rate)}`, ShieldCheck, "bg-ok-soft text-ok"],
          ["Active model", run ? run.model_name.replace(/_/g, " ") : "—", run ? `ROC-AUC ${num(run.roc_auc)} · v${run.model_version}` : "train it first", Cpu, "bg-surface-3 text-accent-strong"],
        ].map(([label, val, sub, Icon, tone]) => (
          <div key={label} className="bg-surface border border-border rounded-xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs text-ink-muted font-medium uppercase tracking-wider">{label}</div>
              <div className="text-2xl font-bold font-display mt-1 capitalize">{val}</div>
              <div className="text-xs text-ink-muted mt-0.5">{sub}</div>
            </div>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${tone}`}><Icon size={20} /></div>
          </div>
        ))}
      </div>

      {run && (
        <div className={panelCls}>
          <div className={panelHeadCls}>
            <h2 className="text-lg font-display m-0 flex items-center gap-2"><Cpu size={18} className="text-accent" /> Model evaluation (out-of-time test set)</h2>
            <span className="text-xs text-ink-muted">run #{run.run_id} · trained {run.trained_at} · read from <code>ML_MODEL_RUN</code></span>
          </div>
          <p className="text-sm text-ink-muted mt-0">
            Trained on <strong>{run.train_rows}</strong> resolved appointments ({run.train_from} → {run.train_to}); tested on the
            <strong> {run.test_rows}</strong> most recent ones ({run.test_from} → {run.test_to}) that the model never saw.
            Decision threshold <strong>{num(run.threshold, 2)}</strong> chosen by cross-validation to maximise F1 for the NO_SHOW class.
          </p>
          <div className="grid gap-5 lg:grid-cols-[1fr_260px_220px]">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 h-fit">
              <Metric label="ROC-AUC" value={num(m.roc_auc)} hint="0.5 = coin flip" />
              <Metric label="PR-AUC" value={num(m.pr_auc)} hint={`no-skill = ${num(m.test_no_show_rate, 2)}`} />
              <Metric label="Recall" value={pct(m.recall)} hint="no-shows caught" />
              <Metric label="Precision" value={pct(m.precision)} hint="flags that were right" />
              <Metric label="F1" value={num(m.f1)} />
              <Metric label="Accuracy" value={pct(m.accuracy)} hint="misleading when imbalanced" />
              <Metric label="Brier" value={num(m.brier)} hint="calibration, lower = better" />
              <Metric label="Lift @ top 20%" value={`${num(m.lift_top20, 2)}×`} hint="vs. calling at random" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-muted mb-1.5">Confusion matrix</div>
              {cm && (
                <table className="text-sm border-collapse w-full">
                  <thead><tr><th></th><th className="px-2 py-1 text-xs text-ink-muted font-medium">pred. attend</th><th className="px-2 py-1 text-xs text-ink-muted font-medium">pred. no-show</th></tr></thead>
                  <tbody>
                    <tr><th className="text-xs text-ink-muted font-medium text-right pr-2">attended</th>
                      <td className="border border-border text-center py-3 bg-ok-soft font-semibold">{cm[0][0]}<div className="text-[0.62rem] font-normal text-ink-muted">TN</div></td>
                      <td className="border border-border text-center py-3 bg-warn-soft font-semibold">{cm[0][1]}<div className="text-[0.62rem] font-normal text-ink-muted">FP</div></td></tr>
                    <tr><th className="text-xs text-ink-muted font-medium text-right pr-2">no-show</th>
                      <td className="border border-border text-center py-3 bg-urgent-soft font-semibold">{cm[1][0]}<div className="text-[0.62rem] font-normal text-ink-muted">FN</div></td>
                      <td className="border border-border text-center py-3 bg-ok-soft font-semibold">{cm[1][1]}<div className="text-[0.62rem] font-normal text-ink-muted">TP</div></td></tr>
                  </tbody>
                </table>
              )}
            </div>
            <RocCurve points={m.roc_curve} auc={m.roc_auc} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2 mt-5">
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-muted mb-2">Model comparison (5-fold CV on training period → test period)</div>
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-xs">
                  <thead><tr className="bg-surface-3/70 text-ink-muted uppercase">
                    {["Model", "CV ROC-AUC", "Test ROC-AUC", "PR-AUC", "Recall", "Precision", "F1"].map((h) => <th key={h} className="text-left px-2.5 py-2 border-b border-border-strong">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {Object.entries(rep.comparison || {}).map(([name, c]) => (
                      <tr key={name} className={name === run.model_name ? "bg-accent-soft font-semibold" : ""}>
                        <td className="px-2.5 py-1.5 border-b border-border/70">{name.replace(/_/g, " ")}{name === run.model_name && " ✓"}</td>
                        <td className="px-2.5 py-1.5 border-b border-border/70">{num(c.cv_roc_auc)}</td>
                        <td className="px-2.5 py-1.5 border-b border-border/70">{num(c.roc_auc)}</td>
                        <td className="px-2.5 py-1.5 border-b border-border/70">{num(c.pr_auc)}</td>
                        <td className="px-2.5 py-1.5 border-b border-border/70">{pct(c.recall, 0)}</td>
                        <td className="px-2.5 py-1.5 border-b border-border/70">{pct(c.precision, 0)}</td>
                        <td className="px-2.5 py-1.5 border-b border-border/70">{num(c.f1, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[0.7rem] text-ink-muted mt-1.5">Selected by highest cross-validated ROC-AUC (never by test score, to avoid overfitting the test set). The dummy baseline always predicts the base rate.</p>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-muted mb-2">Permutation feature importance (drop in ROC-AUC)</div>
              <div className="space-y-1.5">
                {(rep.importance || []).slice(0, 10).map((f) => (
                  <div key={f.feature} className="flex items-center gap-2 text-xs">
                    <div className="w-44 shrink-0 truncate">{f.label}</div>
                    <div className="flex-1 h-3.5 bg-surface-2 rounded border border-border overflow-hidden">
                      <div className="h-full bg-accent/80" style={{ width: `${Math.max(0, (f.importance / maxImp) * 100)}%` }} />
                    </div>
                    <div className="w-12 text-right font-mono">{num(f.importance, 3)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <SqlPanel sql={summary.sql_executed} meta={null} />
        </div>
      )}

      <div className={panelCls}>
        <div className={panelHeadCls}>
          <h2 className="text-lg font-display m-0 flex items-center gap-2"><Brain size={18} className="text-accent" /> Upcoming appointments by no-show risk</h2>
          <div className="flex items-center gap-1.5 bg-surface-2 p-1 rounded-lg border border-border text-xs">
            {["", "HIGH", "MEDIUM", "LOW"].map((b) => (
              <button key={b} onClick={() => setBand(b)} className={`px-2.5 py-1 rounded font-medium ${band === b ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}>{b || "All"}</button>
            ))}
          </div>
        </div>
        {preds && rows.length === 0 && <p className="text-sm text-ink-muted">No scored appointments. {isAdmin ? "Press Retrain or Re-score." : "Ask admin1 to run the model."}</p>}
        {rows.length > 0 && (
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto border border-border rounded-lg">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-[#e7efed]"><tr className="text-xs font-semibold uppercase text-ink-muted">
                {["Appointment", "Patient", "Doctor / dept", "Risk", "Why (top factors)", "Action", ""].map((h) => <th key={h} className="py-2.5 px-3 border-b border-border-strong">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const p = Math.round(Number(r.probability) * 100);
                  return (
                    <tr key={r.appointment_id} className="hover:bg-surface-2">
                      <td className="py-2.5 px-3"><div>{r.appt_date}</div><div className="text-xs font-mono text-ink-muted">{r.appt_time} · #{r.appointment_id}</div></td>
                      <td className="py-2.5 px-3 font-medium">{r.patient}<div className="text-xs font-mono text-ink-muted font-normal">{r.phone}</div></td>
                      <td className="py-2.5 px-3 text-ink-muted"><div>{r.doctor_name}</div><div className="text-xs">{r.department_name}</div></td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-surface-3 h-2 rounded-full overflow-hidden">
                            <div className={`h-full ${r.risk_band === "HIGH" ? "bg-urgent" : r.risk_band === "MEDIUM" ? "bg-warn" : "bg-ok"}`} style={{ width: `${p}%` }} />
                          </div>
                          <span className="text-xs font-mono">{p}%</span>
                        </div>
                        <StatusBadge status={r.risk_band} />
                      </td>
                      <td className="py-2.5 px-3 text-xs text-ink-muted max-w-[260px]">{r.risk_factors}</td>
                      <td className="py-2.5 px-3">{r.risk_band === "HIGH"
                        ? <span className="inline-flex items-center gap-1 text-xs text-urgent font-medium bg-urgent-soft px-2 py-0.5 rounded"><PhoneCall size={12} /> Call to confirm</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-ok font-medium bg-ok-soft px-2 py-0.5 rounded"><CheckCircle2 size={12} /> SMS reminder</span>}</td>
                      <td className="py-2.5 px-3"><button className={btnSmallGhost} onClick={() => liveScore(r.appointment_id)}>Explain</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {preds && <SqlPanel sql={preds.sql_executed} meta={preds} />}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className={panelCls}>
          <div className={panelHeadCls}><h2 className="text-lg font-display m-0 flex items-center gap-2"><Play size={18} className="text-accent" /> Live prediction</h2></div>
          <form className="flex gap-3 items-end" onSubmit={(e) => { e.preventDefault(); liveScore(); }}>
            <div className="w-48"><Field label="Appointment ID"><input className={inputCls} value={scoreId} onChange={(e) => setScoreId(e.target.value)} placeholder="e.g. from the table" /></Field></div>
            <div className="mb-3.5"><button className={btnPrimary} disabled={busy === "score"} type="submit">{busy === "score" ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Score now</button></div>
          </form>
          {score && (
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="text-3xl font-display font-semibold">{pct(score.probability)}</div>
                <StatusBadge status={score.prediction} />
                <span className="text-xs text-ink-muted">threshold {num(score.threshold, 2)} · {score.model_name}</span>
              </div>
              <p className="text-sm m-0 mb-2"><strong>Main factors:</strong> {score.risk_factors}</p>
              {score.note && <p className="text-xs text-warn">{score.note}</p>}
              <DataTable rows={Object.entries(score.features).map(([feature, value]) => ({ feature, value }))} filename="features.csv" />
              <SqlPanel sql={score.sql_executed} />
            </div>
          )}
        </div>
        <div className={panelCls}>
          <div className={panelHeadCls}><h2 className="text-lg font-display m-0 flex items-center gap-2"><Database size={18} className="text-accent" /> How it is wired to the database</h2></div>
          <ol className="text-sm text-ink-muted space-y-2 pl-5 m-0">
            <li><strong>Data:</strong> resolved appointments (COMPLETED / NO_SHOW) — the label is the real outcome stored in <code>APPOINTMENT.status</code>.</li>
            <li><strong>Pre-processing in SQL</strong> (<code>ml/features.py</code>): age at visit, booking lead time, previous visits / no-shows / cancellations (correlated sub-queries, strictly <em>before</em> the visit → no leakage), last-visit outcome (<code>KEEP (DENSE_RANK LAST)</code>), insurance (<code>EXISTS</code>), weekday, hour, department.</li>
            <li><strong>Pipeline:</strong> median imputation + scaling, one-hot encoding of department / weekday / gender, inside one scikit-learn <code>Pipeline</code>.</li>
            <li><strong>Model selection:</strong> dummy baseline vs logistic regression vs random forest vs gradient boosting, 5-fold stratified CV; out-of-time test on the latest 20%.</li>
            <li><strong>Back into Oracle:</strong> run registered in <code>ML_MODEL_RUN</code> (one active model, enforced by a unique function-based index), predictions <code>MERGE</code>d into <code>ML_PREDICTION</code>, shown through the view <code>vw_upcoming_noshow_risk</code>.</li>
          </ol>
        </div>
      </div>

      {runs && runs.results.length > 0 && (
        <div className={panelCls}>
          <div className={panelHeadCls}><h2 className="text-lg font-display m-0">Model registry (ML_MODEL_RUN)</h2></div>
          <DataTable rows={runs.results} filename="model-runs.csv" />
          <SqlPanel sql={runs.sql_executed} meta={runs} />
        </div>
      )}
    </div>
  );
}
