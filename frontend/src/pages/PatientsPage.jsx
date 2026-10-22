import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { apiFetch, apiCall } from "../api";
import { useToast } from "../components/Toast";
import SqlPanel from "../components/SqlPanel";
import PageHeader from "../components/PageHeader";
import Field from "../components/Field";
import Modal from "../components/Modal";
import EmptyState from "../components/EmptyState";
import { hasRole } from "../lib/roles";
import { inputCls, panelCls, panelHeadCls, btnPrimary, btnGhost, btnDanger, btnSmallGhost } from "../components/ui";
import { UserPlus, Search, ChevronDown, Loader2, Pencil, Trash2, Users, RefreshCw, Eye } from "lucide-react";

const BLANK_PATIENT = {
  first_name: "", last_name: "", dob: "", gender: "M", blood_group: "",
  phone: "", email: "", address: "", city: "Pune", emergency_contact_name: "", emergency_contact_phone: "",
};
const BLOOD = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const PAGE = 25;

export default function PatientsPage() {
  const { auth } = useAuth();
  const toast = useToast();
  const canWrite = hasRole(auth, "receptionist");
  const isAdmin = hasRole(auth);
  const canDetail = hasRole(auth, "receptionist", "doctor", "nurse");

  const [form, setForm] = useState(BLANK_PATIENT);
  const [regOpen, setRegOpen] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [lastAction, setLastAction] = useState(null);

  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [editing, setEditing] = useState(null);   // patient detail row
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async (query = q, off = offset) => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/patients", { token: auth.token, params: { q: query, limit: PAGE, offset: off } });
      setList(res);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [auth.token, q, offset]);

  useEffect(() => { load("", 0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function register(e) {
    e.preventDefault(); setRegistering(true);
    try {
      const params = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ""));
      const res = await apiCall("/patients", { token: auth.token, params });
      setLastAction({ label: `INSERT - new patient ID ${res.patient_id}`, res });
      setForm(BLANK_PATIENT);
      toast.success(`Patient registered — ID ${res.patient_id}`);
      setQ(""); setOffset(0); load("", 0);
    } catch (err) { toast.error(err.message); }
    finally { setRegistering(false); }
  }

  async function openEdit(id) {
    try {
      const res = await apiFetch(`/patients/${id}`, { token: auth.token });
      const p = res.results[0];
      setEditing(p);
      setEditForm({
        first_name: p.first_name || "", last_name: p.last_name || "", phone: p.phone || "", email: p.email || "",
        address: p.address || "", city: p.city || "", blood_group: p.blood_group || "",
        emergency_contact_name: p.emergency_contact_name || "", emergency_contact_phone: p.emergency_contact_phone || "",
      });
    } catch (err) { toast.error(err.message); }
  }

  async function openView(id) {
    try {
      const res = await apiFetch(`/patients/${id}`, { token: auth.token });
      setViewing(res);
    } catch (err) { toast.error(err.message); }
  }

  async function saveEdit(e) {
    e.preventDefault(); setSaving(true);
    try {
      const changed = Object.fromEntries(Object.entries(editForm).filter(([k, v]) => (editing[k] || "") !== v && v !== ""));
      if (Object.keys(changed).length === 0) { toast.success("Nothing changed"); setEditing(null); return; }
      const res = await apiCall(`/patients/${editing.patient_id}`, { method: "PUT", token: auth.token, params: changed });
      setLastAction({ label: `UPDATE via update_patient() - patient ${editing.patient_id} (trg_patient_audit logged the change)`, res });
      toast.success(`Patient ${editing.patient_id} updated`);
      setEditing(null); load();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  async function remove(p) {
    if (!window.confirm(`Delete patient ${p.patient_id} — ${p.first_name} ${p.last_name}?\n\nOracle will refuse if the patient has any medical or billing history.`)) return;
    try {
      const res = await apiCall(`/patients/${p.patient_id}`, { method: "DELETE", token: auth.token });
      setLastAction({ label: `DELETE via delete_patient() - patient ${p.patient_id}`, res });
      toast.success(`Patient ${p.patient_id} deleted`);
      load();
    } catch (err) {
      setLastAction({ label: `DELETE refused by the database`, error: err.message, res: { sql_executed: `BEGIN delete_patient(${p.patient_id}); END;` } });
      toast.error(err.message);
    }
  }

  function search(e) { e?.preventDefault(); setOffset(0); load(q, 0); }
  function page(delta) { const off = Math.max(0, offset + delta * PAGE); setOffset(off); load(q, off); }

  const rows = list?.results || [];
  return (
    <div>
      <PageHeader title="Patients" subtitle="Full CRUD on the PATIENT table: register (INSERT), search (SELECT), edit (UPDATE) and delete (DELETE) — every action shows the SQL Oracle executed." />

      {canWrite && (
        <div className={panelCls}>
          <div className={`${panelHeadCls} cursor-pointer`} onClick={() => setRegOpen((o) => !o)}>
            <h2 className="text-lg font-display m-0 flex items-center gap-2"><UserPlus size={18} className="text-accent" /> Register new patient</h2>
            <ChevronDown size={18} className="text-ink-muted transition-transform" style={{ transform: regOpen ? "rotate(180deg)" : "none" }} />
          </div>
          {regOpen && (
            <form onSubmit={register}>
              <div className="grid gap-3.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="First name *"><input className={inputCls} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required /></Field>
                <Field label="Last name *"><input className={inputCls} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required /></Field>
                <Field label="Date of birth *"><input className={inputCls} type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} required /></Field>
                <Field label="Gender">
                  <select className={inputCls} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                    <option value="M">Male</option><option value="F">Female</option><option value="O">Other</option>
                  </select>
                </Field>
                <Field label="Blood group">
                  <select className={inputCls} value={form.blood_group} onChange={(e) => setForm({ ...form, blood_group: e.target.value })}>
                    {BLOOD.map((b) => <option key={b} value={b}>{b || "— unknown —"}</option>)}
                  </select>
                </Field>
                <Field label="Phone *"><input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} pattern="[0-9]{10}" title="10 digits" required /></Field>
                <Field label="Email" hint="UNIQUE constraint - try a duplicate"><input className={inputCls} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
                <Field label="Address (street, area, PIN)"><input className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Flat 12, Shanti Niwas, Kothrud - 411038" /></Field>
                <Field label="City"><input className={inputCls} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
                <Field label="Emergency contact name"><input className={inputCls} value={form.emergency_contact_name} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} /></Field>
                <Field label="Emergency contact phone"><input className={inputCls} value={form.emergency_contact_phone} onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })} /></Field>
              </div>
              <button type="submit" disabled={registering} className={btnPrimary}>
                {registering ? <><Loader2 size={15} className="animate-spin" /> Registering…</> : "Register patient"}
              </button>
            </form>
          )}
        </div>
      )}

      {lastAction && (
        <div className={`${panelCls} ${lastAction.error ? "border-l-4 border-l-urgent" : "border-l-4 border-l-ok"}`}>
          <div className="text-sm font-medium">{lastAction.label}</div>
          {lastAction.error && <p className="text-urgent text-sm mt-1 mb-0">{lastAction.error}</p>}
          <SqlPanel sql={lastAction.res?.sql_executed} meta={lastAction.res} defaultOpen />
        </div>
      )}

      <div className={panelCls}>
        <div className={panelHeadCls}>
          <h2 className="text-lg font-display m-0 flex items-center gap-2"><Users size={18} className="text-accent" /> Patient directory</h2>
          <form onSubmit={search} className="flex items-center gap-2 flex-wrap">
            <input className={`${inputCls} w-64`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or patient ID…" />
            <button type="submit" className={btnPrimary} disabled={loading}><Search size={15} /> Search</button>
            <button type="button" className={btnGhost} onClick={() => { setQ(""); setOffset(0); load("", 0); }}><RefreshCw size={15} /></button>
          </form>
        </div>
        {error && <p className="text-urgent">{error}</p>}
        {loading && !list && <div className="h-40 bg-surface-3 rounded animate-pulse" />}
        {list && rows.length === 0 && <EmptyState message="No patients matched." />}
        {rows.length > 0 && (
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-3/70 text-ink-muted text-[0.72rem] uppercase tracking-wider">
                  {["ID", "Name", "Gender", "DOB", "Blood", "City", "Phone", "Email", ""].map((h) => <th key={h} className="text-left px-3 py-2.5 font-semibold border-b border-border-strong">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.patient_id} className="even:bg-surface-2/50 hover:bg-accent-soft/60">
                    <td className="px-3 py-2 border-b border-border/70 font-mono text-xs">{p.patient_id}</td>
                    <td className="px-3 py-2 border-b border-border/70 font-medium">{p.first_name} {p.last_name}</td>
                    <td className="px-3 py-2 border-b border-border/70">{p.gender}</td>
                    <td className="px-3 py-2 border-b border-border/70">{p.dob || "—"}</td>
                    <td className="px-3 py-2 border-b border-border/70">{p.blood_group || "—"}</td>
                    <td className="px-3 py-2 border-b border-border/70">{p.city || "—"}</td>
                    <td className="px-3 py-2 border-b border-border/70 font-mono text-xs">{p.phone}</td>
                    <td className="px-3 py-2 border-b border-border/70 text-xs">{p.email || "—"}</td>
                    <td className="px-3 py-2 border-b border-border/70 whitespace-nowrap text-right space-x-1.5">
                      {canDetail && <button className={btnSmallGhost} onClick={() => openView(p.patient_id)}><Eye size={12} /> View</button>}
                      {canWrite && <button className={btnSmallGhost} onClick={() => openEdit(p.patient_id)}><Pencil size={12} /> Edit</button>}
                      {isAdmin && <button className={btnDanger} onClick={() => remove(p)}><Trash2 size={12} /> Delete</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list && (
          <div className="flex items-center justify-between mt-3 text-xs text-ink-muted">
            <span>Rows {offset + 1}–{offset + rows.length}</span>
            <div className="space-x-2">
              <button className={btnSmallGhost} disabled={offset === 0} onClick={() => page(-1)}>‹ Prev</button>
              <button className={btnSmallGhost} disabled={rows.length < PAGE} onClick={() => page(1)}>Next ›</button>
            </div>
          </div>
        )}
        {list && <SqlPanel sql={list.sql_executed} meta={list} />}
      </div>

      <Modal title={editing ? `Edit patient ${editing.patient_id}` : ""} open={!!editing} onClose={() => setEditing(null)}>
        <form onSubmit={saveEdit}>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            {[["first_name", "First name"], ["last_name", "Last name"], ["phone", "Phone"], ["email", "Email"],
              ["address", "Address"], ["city", "City"], ["emergency_contact_name", "Emergency contact"], ["emergency_contact_phone", "Emergency phone"]].map(([k, label]) => (
              <Field key={k} label={label}><input className={inputCls} value={editForm[k] ?? ""} onChange={(e) => setEditForm({ ...editForm, [k]: e.target.value })} /></Field>
            ))}
            <Field label="Blood group">
              <select className={inputCls} value={editForm.blood_group ?? ""} onChange={(e) => setEditForm({ ...editForm, blood_group: e.target.value })}>
                {BLOOD.map((b) => <option key={b} value={b}>{b || "— unknown —"}</option>)}
              </select>
            </Field>
          </div>
          <p className="text-xs text-ink-muted">Only changed fields are sent. The stored procedure <code>update_patient</code> uses <code>NVL(:new, old)</code>; the trigger <code>trg_patient_audit</code> writes the old and new values to <code>AUDIT_LOG</code> with your Oracle user.</p>
          <button className={btnPrimary} disabled={saving} type="submit">{saving ? "Saving…" : "Save changes"}</button>
        </form>
      </Modal>

      <Modal title={viewing ? `Patient ${viewing.results[0].patient_id}` : ""} open={!!viewing} onClose={() => setViewing(null)}>
        {viewing && (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm m-0">
              {Object.entries(viewing.results[0]).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-ink-muted capitalize">{k.replace(/_/g, " ")}</dt>
                  <dd className="m-0 font-medium">{v ?? "—"}</dd>
                </div>
              ))}
            </dl>
            <SqlPanel sql={viewing.sql_executed} meta={viewing} />
          </>
        )}
      </Modal>
    </div>
  );
}
