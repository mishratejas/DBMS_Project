import { useCallback, useState } from "react";
import { useAuth } from "../AuthContext";
import { apiFetch, apiCall } from "../api";
import { useApi } from "../lib/useApi";
import { useToast } from "../components/Toast";
import SqlPanel from "../components/SqlPanel";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import Field from "../components/Field";
import LookupSelect from "../components/LookupSelect";
import { Pill, Package, RefreshCw, Trash2, Check } from "lucide-react";
import { hasRole } from "../lib/roles";

const inputCls = "w-full rounded-md border border-border-strong px-3 py-2 text-sm bg-surface focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition";
const panelCls = "bg-surface border border-border rounded-xl p-5 mb-5 shadow-sm";
const panelHeadCls = "flex justify-between items-center mb-4 pb-3 border-b border-border";
const BLANK_RX = { patient_id: "", doctor_id: "", appointment_id: "", medicine_id: "", dosage: "", duration_days: "", quantity: "" };
const BLANK_MED = { medicine_code: "", medicine_name: "", category: "", unit_price: "", stock_quantity: "", reorder_level: "20", expiry_date: "" };
const smallBtn = "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border transition-colors";

export default function PharmacyPage() {
  const { auth } = useAuth();
  const toast = useToast();
  const [rx, setRx] = useState(BLANK_RX);
  const [rxResult, setRxResult] = useState(null);
  const [error, setError] = useState(null);
  const fetchInventory = useCallback((token) => apiFetch("/pharmacy/inventory", { token }), []);
  const inventory = useApi(fetchInventory);
  const fetchRx = useCallback((token) => apiFetch("/pharmacy/prescriptions", { token }), []);
  const rxList = useApi(fetchRx);
  const [med, setMed] = useState(BLANK_MED);
  const [lastAction, setLastAction] = useState(null);
  const canPrescribe = hasRole(auth, "doctor");
  const canStock = hasRole(auth, "pharmacist");
  const isAdmin = hasRole(auth);

  async function act(label, path, opts, after) {
    try {
      const res = await apiCall(path, { token: auth.token, ...opts });
      setLastAction({ label, res }); toast.success(label); after && after();
    } catch (err) { setLastAction({ label: label + " — refused", error: err.message }); toast.error(err.message); }
  }
  function addMedicine(e) {
    e.preventDefault();
    const params = Object.fromEntries(Object.entries(med).filter(([, v]) => v !== ""));
    act(`Medicine ${med.medicine_code} added (INSERT)`, "/pharmacy/medicines", { params }, () => { setMed(BLANK_MED); inventory.reload(); });
  }

  async function submitRx(e) {
    e.preventDefault(); setError(null);
    try {
      const res = await apiCall("/pharmacy/prescriptions", { token: auth.token, params: rx });
      setRxResult(res); toast.success(`Prescription saved — ID ${res.prescription_id}`);
      setRx(BLANK_RX); inventory.reload();
    } catch (err) { setError(err.message); toast.error(err.message); }
  }

  return (
    <div>
      <PageHeader title="Pharmacy" subtitle="Record prescriptions and monitor medicine inventory." />

      {lastAction && (
        <div className={`${panelCls} border-l-4 ${lastAction.error ? "border-l-urgent" : "border-l-ok"}`}>
          <div className="text-sm font-medium">{lastAction.label}</div>
          {lastAction.error && <p className="text-urgent text-sm mt-1 mb-0">{lastAction.error}</p>}
          {lastAction.res && <SqlPanel sql={lastAction.res.sql_executed} meta={lastAction.res} defaultOpen />}
        </div>
      )}

      {canPrescribe && <div className={panelCls}>
        <div className={panelHeadCls}>
          <h2 className="text-lg font-display m-0 flex items-center gap-2"><Pill size={18} className="text-accent" /> Add prescription</h2>
        </div>
        <form onSubmit={submitRx}>
          <div className="grid gap-3.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <LookupSelect label="Patient" value={rx.patient_id} onChange={(v) => setRx({ ...rx, patient_id: v })} lookupPath="/patients/search?last_name=" labelFn={(r) => `${r.patient_id ?? r.id ?? ""} — ${[r.first_name, r.last_name].filter(Boolean).join(" ")}`} required />
            <LookupSelect label="Doctor" value={rx.doctor_id} onChange={(v) => setRx({ ...rx, doctor_id: v })} lookupPath="/doctors" labelFn={(r) => `${r.doctor_id ?? r.id ?? ""} — Dr. ${r.first_name ?? ""} ${r.last_name ?? ""}`.trim()} required />
            <Field label="Appointment ID"><input className={inputCls} value={rx.appointment_id} onChange={(e) => setRx({ ...rx, appointment_id: e.target.value })} /></Field>
            <LookupSelect label="Medicine" value={rx.medicine_id} onChange={(v) => setRx({ ...rx, medicine_id: v })} lookupPath="/pharmacy/medicines" labelFn={(r) => `${r.medicine_id ?? r.id ?? ""} — ${r.name ?? r.medicine_name ?? ""}`} required />
            <Field label="Dosage" required><input className={inputCls} value={rx.dosage} onChange={(e) => setRx({ ...rx, dosage: e.target.value })} placeholder="e.g. 500mg twice daily" /></Field>
            <Field label="Duration (days)" required><input className={inputCls} type="number" min={1} value={rx.duration_days} onChange={(e) => setRx({ ...rx, duration_days: e.target.value })} required /></Field>
            <Field label="Quantity" required><input className={inputCls} type="number" min={1} value={rx.quantity} onChange={(e) => setRx({ ...rx, quantity: e.target.value })} required /></Field>
          </div>
          <button type="submit" className="inline-flex items-center gap-1.5 bg-accent hover:bg-accent-strong text-white rounded-md px-4 py-2 text-sm font-medium transition-colors">Save prescription</button>
          {error && <p className="text-urgent mt-2">{error}</p>}
          {rxResult && <p className="text-ink-muted text-sm mt-3">Saved — prescription ID <strong>{rxResult.prescription_id}</strong></p>}
          <p className="text-xs text-ink-muted mb-0">Try a quantity above the stock: trg_prescription_stock_check raises ORA-20011 and the whole procedure rolls back.</p>
        </form>
      </div>}

      {canStock && (
        <div className={panelCls}>
          <div className={panelHeadCls}><h2 className="text-lg font-display m-0 flex items-center gap-2"><Package size={18} className="text-accent" /> Add medicine to catalogue</h2></div>
          <form onSubmit={addMedicine}>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Field label="Code (UNIQUE)"><input className={inputCls} value={med.medicine_code} onChange={(e) => setMed({ ...med, medicine_code: e.target.value })} placeholder="MED-048" required /></Field>
              <Field label="Name"><input className={inputCls} value={med.medicine_name} onChange={(e) => setMed({ ...med, medicine_name: e.target.value })} required /></Field>
              <Field label="Category"><input className={inputCls} value={med.category} onChange={(e) => setMed({ ...med, category: e.target.value })} /></Field>
              <Field label="Unit price (₹)"><input className={inputCls} type="number" step="0.01" value={med.unit_price} onChange={(e) => setMed({ ...med, unit_price: e.target.value })} required /></Field>
              <Field label="Stock"><input className={inputCls} type="number" value={med.stock_quantity} onChange={(e) => setMed({ ...med, stock_quantity: e.target.value })} /></Field>
              <Field label="Reorder level"><input className={inputCls} type="number" value={med.reorder_level} onChange={(e) => setMed({ ...med, reorder_level: e.target.value })} /></Field>
              <Field label="Expiry"><input className={inputCls} type="date" value={med.expiry_date} onChange={(e) => setMed({ ...med, expiry_date: e.target.value })} /></Field>
            </div>
            <button type="submit" className="inline-flex items-center gap-1.5 bg-accent hover:bg-accent-strong text-white rounded-md px-4 py-2 text-sm font-medium">Add medicine</button>
          </form>
        </div>
      )}

      <div className={panelCls}>
        <div className={panelHeadCls}>
          <h2 className="text-lg font-display m-0">Latest prescriptions</h2>
          <button className="inline-flex items-center gap-1.5 bg-surface border border-border-strong text-accent-strong rounded-md px-3 py-2 text-sm hover:bg-accent-soft" onClick={rxList.reload}><RefreshCw size={15} /></button>
        </div>
        {rxList.error && <p className="text-urgent">{rxList.error}</p>}
        {rxList.data && (
          <div className="overflow-x-auto border border-border rounded-lg max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#e7efed]"><tr className="text-ink-muted text-[0.72rem] uppercase">
                {["Rx", "Patient", "Medicine", "Dosage", "Qty", "Date", "Status", ""].map((h) => <th key={h} className="text-left px-3 py-2 border-b border-border-strong">{h}</th>)}
              </tr></thead>
              <tbody>
                {rxList.data.results.map((r, i) => (
                  <tr key={i} className="even:bg-surface-2/50">
                    <td className="px-3 py-1.5 border-b border-border/70 font-mono text-xs">{r.prescription_id}</td>
                    <td className="px-3 py-1.5 border-b border-border/70">#{r.patient_id}</td>
                    <td className="px-3 py-1.5 border-b border-border/70">{r.medicine_name}</td>
                    <td className="px-3 py-1.5 border-b border-border/70 text-xs">{r.dosage}</td>
                    <td className="px-3 py-1.5 border-b border-border/70">{r.quantity}</td>
                    <td className="px-3 py-1.5 border-b border-border/70">{r.prescribed_date}</td>
                    <td className="px-3 py-1.5 border-b border-border/70 text-xs">{r.status}</td>
                    <td className="px-3 py-1.5 border-b border-border/70">
                      {r.status === "ACTIVE" && canStock && <button className={`${smallBtn} border-border-strong text-accent-strong hover:bg-accent-soft`}
                        onClick={() => act(`Prescription ${r.prescription_id} fulfilled (column-level UPDATE(status) privilege)`, `/pharmacy/prescriptions/${r.prescription_id}/fulfil`, { method: "PUT" }, rxList.reload)}><Check size={12} /> Fulfil</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rxList.data && <SqlPanel sql={rxList.data.sql_executed} />}
      </div>

      <div className={panelCls}>
        <div className={panelHeadCls}>
          <h2 className="text-lg font-display m-0 flex items-center gap-2"><Package size={18} className="text-accent" /> Medicine inventory</h2>
          <button className="inline-flex items-center gap-1.5 bg-surface border border-border-strong text-accent-strong rounded-md px-3 py-2 text-sm hover:bg-accent-soft transition-colors disabled:opacity-50" onClick={inventory.reload} disabled={inventory.loading}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
        {inventory.loading && !inventory.data && <div className="h-24 bg-surface-3 rounded animate-pulse" />}
        {inventory.error && <p className="text-urgent">{inventory.error}</p>}
        {inventory.data && (
          <>
            <DataTable rows={inventory.data.results} filename="inventory.csv" emptyMessage="No medicines in inventory." maxHeight={460} />
            {isAdmin && <p className="text-xs text-ink-muted">Admin: delete a never-prescribed medicine by ID → <button className={`${smallBtn} border-[#f0c9be] text-urgent`} onClick={() => { const id = window.prompt("Medicine ID to delete (Oracle refuses with ORA-02292 if it was ever prescribed):"); if (id) act(`Medicine ${id} deleted`, `/pharmacy/medicines/${id}`, { method: "DELETE" }, inventory.reload); }}><Trash2 size={12} /> Delete medicine…</button></p>}
            <SqlPanel sql={inventory.data.sql_executed} />
          </>
        )}
      </div>
    </div>
  );
}