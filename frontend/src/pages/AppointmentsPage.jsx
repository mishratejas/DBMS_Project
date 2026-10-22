import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { apiFetch, apiCall } from "../api";
import { useToast } from "../components/Toast";
import { todayISO } from "../lib/format";
import { hasRole } from "../lib/roles";
import SqlPanel from "../components/SqlPanel";
import PageHeader from "../components/PageHeader";
import Field from "../components/Field";
import Modal from "../components/Modal";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import LookupSelect from "../components/LookupSelect";
import { inputCls, panelCls, panelHeadCls, btnPrimary, btnGhost, btnDanger, btnSmallGhost } from "../components/ui";
import { CalendarPlus, RefreshCw, Filter, Check, X, Trash2, CalendarDays } from "lucide-react";

function plusDays(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function AppointmentsPage() {
  const { auth } = useAuth();
  const toast = useToast();
  const canBook = hasRole(auth, "receptionist", "doctor");
  const canStatus = hasRole(auth, "receptionist", "doctor", "nurse");
  const canReschedule = hasRole(auth, "receptionist");
  const isAdmin = hasRole(auth);

  const [form, setForm] = useState({ patient_id: "", doctor_id: "", appt_date: plusDays(1), appt_time: "10:00", reason: "" });
  const [filters, setFilters] = useState({ date_from: todayISO(), date_to: plusDays(14), status: "", doctor_id: "" });
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastAction, setLastAction] = useState(null);
  const [resched, setResched] = useState(null);

  const load = useCallback(async (f = filters) => {
    setLoading(true);
    try { setSchedule(await apiFetch("/appointments/schedule", { token: auth.token, params: f })); }
    catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [auth.token, filters, toast]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(label, path, opts) {
    try {
      const res = await apiCall(path, { token: auth.token, ...opts });
      setLastAction({ label, res });
      toast.success(label);
      load();
      return res;
    } catch (err) {
      setLastAction({ label: `${label} — refused`, error: err.message, res: { sql_executed: err.sql } });
      toast.error(err.message);
      return null;
    }
  }

  async function book(e) {
    e.preventDefault();
    const res = await act("Appointment booked (APPOINTMENT + SERVICE_QUEUE in one transaction)", "/appointments/book", { params: form });
    if (res) setForm({ ...form, reason: "" });
  }

  const setStatus = (a, st) => act(`Appointment ${a.appointment_id} marked ${st} (column-level UPDATE privilege)`,
    `/appointments/${a.appointment_id}/status`, { method: "PUT", params: { status: st } });
  const cancel = (a) => window.confirm(`Cancel appointment ${a.appointment_id}?`) &&
    act(`Appointment ${a.appointment_id} cancelled via cancel_appointment()`, `/appointments/${a.appointment_id}/cancel`, {});
  const del = (a) => window.confirm(`Physically DELETE appointment ${a.appointment_id}?\nOracle refuses (ORA-02292) if a diagnosis, bill or prescription references it.`) &&
    act(`Appointment ${a.appointment_id} deleted`, `/appointments/${a.appointment_id}`, { method: "DELETE" });

  async function doReschedule(e) {
    e.preventDefault();
    const r = await act(`Appointment ${resched.appointment_id} rescheduled via reschedule_appointment() (SAVEPOINT)`,
      `/appointments/${resched.appointment_id}/reschedule`, { params: { new_date: resched.new_date, new_time: resched.new_time } });
    if (r) setResched(null);
  }

  const rows = schedule?.results || [];
  return (
    <div>
      <PageHeader title="Appointments" subtitle="Book through a stored procedure, then update status, cancel, reschedule or delete — each action is a real Oracle transaction." />

      {canBook && (
        <div className={panelCls}>
          <div className={panelHeadCls}><h2 className="text-lg font-display m-0 flex items-center gap-2"><CalendarPlus size={18} className="text-accent" /> Book an appointment</h2></div>
          <form onSubmit={book}>
            <div className="grid gap-3.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <LookupSelect label="Patient" value={form.patient_id} onChange={(v) => setForm({ ...form, patient_id: v })} lookupPath="/patients/search?last_name=" labelFn={(r) => `${r.patient_id} — ${r.first_name} ${r.last_name}`} required />
              <LookupSelect label="Doctor" value={form.doctor_id} onChange={(v) => setForm({ ...form, doctor_id: v })} lookupPath="/doctors" labelFn={(r) => `Dr. ${r.first_name} ${r.last_name} — ${r.department_name || r.specialization}`} required />
              <Field label="Date"><input className={inputCls} type="date" min={todayISO()} value={form.appt_date} onChange={(e) => setForm({ ...form, appt_date: e.target.value })} required /></Field>
              <Field label="Time" hint="15-minute slots"><input className={inputCls} type="time" step="900" value={form.appt_time} onChange={(e) => setForm({ ...form, appt_time: e.target.value })} required /></Field>
            </div>
            <Field label="Reason"><input className={inputCls} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Reason for visit" /></Field>
            <button type="submit" className={btnPrimary}>Book appointment</button>
            <span className="text-xs text-ink-muted ml-3">Try booking the same doctor + date + time twice → trigger / UNIQUE constraint refuses it.</span>
          </form>
        </div>
      )}

      {lastAction && (
        <div className={`${panelCls} border-l-4 ${lastAction.error ? "border-l-urgent" : "border-l-ok"}`}>
          <div className="text-sm font-medium">{lastAction.label}</div>
          {lastAction.error && <p className="text-urgent text-sm mt-1 mb-0">{lastAction.error}</p>}
          {lastAction.res?.sql_executed && <SqlPanel sql={lastAction.res.sql_executed} meta={lastAction.res} defaultOpen />}
        </div>
      )}

      <div className={panelCls}>
        <div className={panelHeadCls}>
          <h2 className="text-lg font-display m-0 flex items-center gap-2"><CalendarDays size={18} className="text-accent" /> Schedule</h2>
          <button className={btnGhost} onClick={() => load()} disabled={loading}><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh</button>
        </div>
        <form className="grid gap-3 grid-cols-2 lg:grid-cols-5 items-end mb-3" onSubmit={(e) => { e.preventDefault(); load(filters); }}>
          <Field label="From"><input className={inputCls} type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} /></Field>
          <Field label="To"><input className={inputCls} type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} /></Field>
          <Field label="Status">
            <select className={inputCls} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              {["", "SCHEDULED", "COMPLETED", "NO_SHOW", "CANCELLED"].map((s) => <option key={s} value={s}>{s || "All"}</option>)}
            </select>
          </Field>
          <LookupSelect label="Doctor" value={filters.doctor_id} onChange={(v) => setFilters({ ...filters, doctor_id: v })} lookupPath="/doctors" labelFn={(r) => `Dr. ${r.first_name} ${r.last_name}`} placeholder="All doctors" />
          <div className="mb-3.5"><button className={btnPrimary} type="submit"><Filter size={15} /> Apply</button></div>
        </form>
        <div className="flex gap-2 mb-3 text-xs">
          <button className={btnSmallGhost} onClick={() => { const f = { ...filters, date_from: plusDays(-30), date_to: plusDays(-1), status: "" }; setFilters(f); load(f); }}>Last 30 days</button>
          <button className={btnSmallGhost} onClick={() => { const f = { ...filters, date_from: todayISO(), date_to: todayISO() }; setFilters(f); load(f); }}>Today</button>
          <button className={btnSmallGhost} onClick={() => { const f = { ...filters, date_from: todayISO(), date_to: plusDays(28), status: "SCHEDULED" }; setFilters(f); load(f); }}>Upcoming</button>
        </div>
        {loading && !schedule && <div className="h-24 bg-surface-3 rounded animate-pulse" />}
        {schedule && rows.length === 0 && <EmptyState message="No appointments for these filters." />}
        {rows.length > 0 && (
          <div className="overflow-x-auto border border-border rounded-lg max-h-[560px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#e7efed]">
                <tr className="text-ink-muted text-[0.72rem] uppercase tracking-wider">
                  {["ID", "Date", "Time", "Doctor", "Patient", "Type", "Status", "Reason", "Actions"].map((h) => <th key={h} className="text-left px-3 py-2.5 font-semibold border-b border-border-strong">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.appointment_id} className="even:bg-surface-2/50 hover:bg-accent-soft/60">
                    <td className="px-3 py-2 border-b border-border/70 font-mono text-xs">{a.appointment_id}</td>
                    <td className="px-3 py-2 border-b border-border/70 whitespace-nowrap">{a.appt_date}</td>
                    <td className="px-3 py-2 border-b border-border/70 font-mono text-xs">{a.appt_time}</td>
                    <td className="px-3 py-2 border-b border-border/70 whitespace-nowrap">{a.doctor_name}</td>
                    <td className="px-3 py-2 border-b border-border/70 whitespace-nowrap">{a.patient_name} <span className="text-ink-faint text-xs">#{a.patient_id}</span></td>
                    <td className="px-3 py-2 border-b border-border/70 text-xs">{a.appt_type}</td>
                    <td className="px-3 py-2 border-b border-border/70"><StatusBadge status={a.status} /></td>
                    <td className="px-3 py-2 border-b border-border/70 text-xs text-ink-muted">{a.reason}</td>
                    <td className="px-3 py-2 border-b border-border/70 whitespace-nowrap space-x-1">
                      {a.status === "SCHEDULED" && canStatus && <>
                        <button className={btnSmallGhost} title="Mark completed" onClick={() => setStatus(a, "COMPLETED")}><Check size={12} /> Done</button>
                        <button className={btnSmallGhost} title="Mark no-show" onClick={() => setStatus(a, "NO_SHOW")}>No-show</button>
                      </>}
                      {a.status === "SCHEDULED" && canReschedule && <button className={btnSmallGhost} onClick={() => setResched({ ...a, new_date: a.appt_date, new_time: a.appt_time })}>Move</button>}
                      {a.status === "SCHEDULED" && canBook && <button className={btnSmallGhost} onClick={() => cancel(a)}><X size={12} /> Cancel</button>}
                      {isAdmin && <button className={btnDanger} onClick={() => del(a)}><Trash2 size={12} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {schedule && <SqlPanel sql={schedule.sql_executed} meta={schedule} />}
      </div>

      <Modal title={resched ? `Reschedule appointment ${resched.appointment_id}` : ""} open={!!resched} onClose={() => setResched(null)}>
        {resched && (
          <form onSubmit={doReschedule}>
            <p className="text-sm text-ink-muted mt-0">{resched.patient_name} with {resched.doctor_name}</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="New date"><input className={inputCls} type="date" min={todayISO()} value={resched.new_date} onChange={(e) => setResched({ ...resched, new_date: e.target.value })} required /></Field>
              <Field label="New time"><input className={inputCls} type="time" step="900" value={resched.new_time} onChange={(e) => setResched({ ...resched, new_time: e.target.value })} required /></Field>
            </div>
            <p className="text-xs text-ink-muted">If the slot is taken, the UNIQUE index raises DUP_VAL_ON_INDEX, the procedure does <code>ROLLBACK TO before_reschedule</code> and returns ORA-20033.</p>
            <button className={btnPrimary} type="submit">Reschedule</button>
          </form>
        )}
      </Modal>
    </div>
  );
}
