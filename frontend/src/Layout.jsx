import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { uiRole } from "./lib/roles";
import {
  LayoutDashboard, Users, CalendarDays, Stethoscope, Pill, FlaskConical,
  BedDouble, Receipt, ListOrdered, BarChart3, Database, Brain, GitBranch,
  Columns3, LogOut, ShieldCheck, Menu, X, Layers,
} from "lucide-react";

const NAV_GROUPS = [
  { title: "Overview", items: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: null },
  ]},
  { title: "Operations", items: [
    { to: "/patients", label: "Patients", icon: Users, roles: ["admin", "receptionist", "doctor", "nurse"] },
    { to: "/appointments", label: "Appointments", icon: CalendarDays, roles: ["admin", "receptionist", "doctor", "nurse"] },
    { to: "/admissions", label: "Admissions & beds", icon: BedDouble, roles: ["admin", "receptionist", "doctor", "nurse"] },
    { to: "/queue", label: "Queue console", icon: ListOrdered, roles: ["admin", "receptionist", "nurse"] },
  ]},
  { title: "Clinical", items: [
    { to: "/clinical", label: "Clinical workspace", icon: Stethoscope, roles: ["admin", "doctor", "nurse"] },
    { to: "/pharmacy", label: "Pharmacy", icon: Pill, roles: ["admin", "doctor", "pharmacist"] },
    { to: "/lab", label: "Lab", icon: FlaskConical, roles: ["admin", "doctor", "labtech", "nurse"] },
  ]},
  { title: "Finance", items: [
    { to: "/billing", label: "Billing & payments", icon: Receipt, roles: ["admin", "billingclerk", "receptionist"] },
    { to: "/reports", label: "Reports", icon: BarChart3, roles: ["admin", "doctor", "billingclerk", "readonly"] },
  ]},
  { title: "Reference", items: [
    { to: "/dbms-lab", label: "DBMS concept lab", icon: Database, roles: null },
    { to: "/ml-insights", label: "AI/ML insights", icon: Brain, roles: null },
    { to: "/er-model", label: "ER model", icon: GitBranch, roles: null },
    { to: "/schema-viewer", label: "Schema viewer", icon: Columns3, roles: null },
    { to: "/normalization", label: "Keys & normalization", icon: Layers, roles: null },
  ]},
];

// FIX (v2): the backend returns Oracle-side role names (ADMIN, LAB, PHARMACY,
// BILLING ...) but NAV_GROUPS uses lower-case UI names ("admin", "labtech",
// "pharmacist", "billingclerk"). The old canSee() compared them directly, so
// every role-restricted menu item was hidden for every user - only the
// Dashboard and Reference pages ever showed up in the sidebar.
function canSee(item, role) {
  if (!item.roles) return true;
  const r = uiRole(role);
  return r === "admin" || item.roles.includes(r);
}

export default function Layout() {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const initials = (auth?.username || "?").slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen">
      {/* mobile top bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 h-14 flex items-center justify-between px-4 bg-structure text-white shadow-md">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="MediCore" className="h-7 w-7 rounded-lg" />
          <span className="font-display text-lg font-semibold">MediCore</span>
        </div>
        <button aria-label="Toggle menu" className="p-2 rounded-md hover:bg-white/10" onClick={() => setOpen((o) => !o)}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && <div className="lg:hidden fixed inset-0 z-40 bg-black/50 animate-fade" onClick={() => setOpen(false)} />}

      <aside
        className={`bg-sidebar text-gray-200 flex flex-col p-4 w-64 shrink-0 h-screen overflow-y-auto z-50 border-r border-white/5
          fixed inset-y-0 left-0 transition-transform duration-300 lg:sticky lg:top-0 lg:translate-x-0
          ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="px-2 pb-6 pt-1">
          <div className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="MediCore" className="h-9 w-9 rounded-xl border border-white/15 shadow-sm" />
            <div>
              <div className="font-display text-xl font-semibold text-white leading-none">MediCore</div>
              <div className="text-[0.68rem] text-gray-400 mt-1">Hospital &amp; Clinic Management</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 flex flex-col gap-5">
          {NAV_GROUPS.map((group) => {
            const visible = group.items.filter((it) => canSee(it, auth?.role));
            if (visible.length === 0) return null;
            return (
              <div key={group.title}>
                <div className="text-[0.66rem] uppercase tracking-[0.12em] text-gray-500 px-2.5 pb-1.5 font-semibold">
                  {group.title}
                </div>
                <div className="flex flex-col gap-0.5">
                  {visible.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === "/"}
                        className={({ isActive }) =>
                          `group relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all ${
                            isActive
                              ? "bg-gradient-to-r from-accent/30 to-accent/5 text-white font-medium"
                              : "text-gray-400 hover:text-white hover:bg-white/5"
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-accent-bright" />}
                            <Icon size={16} className={isActive ? "text-accent-bright" : "text-gray-500 group-hover:text-accent-bright transition-colors"} />
                            {item.label}
                          </>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="mt-6 pt-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3 px-1">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent-bright to-accent text-structure text-xs font-bold">
              {initials}
            </span>
            <div className="min-w-0">
              <div className="text-white text-sm font-medium truncate">{auth?.username}</div>
              <div className="text-gray-400 text-xs capitalize">{auth?.role}</div>
            </div>
          </div>
          <button
            className="w-full inline-flex items-center justify-center gap-1.5 bg-white/5 border border-white/10 text-gray-300 rounded-lg px-3 py-2 text-sm hover:bg-white/10 hover:text-white transition-colors"
            onClick={handleLogout}
          >
            <LogOut size={14} /> Log out
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 px-4 sm:px-8 pt-20 pb-10 lg:pt-8 max-w-[1280px] w-full mx-auto">
        <Outlet />
      </main>
    </div>
  );
}
