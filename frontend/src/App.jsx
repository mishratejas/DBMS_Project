import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import { ToastProvider } from "./components/Toast";
import Layout from "./Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import PatientsPage from "./pages/PatientsPage";
import AppointmentsPage from "./pages/AppointmentsPage";
import ClinicalPage from "./pages/ClinicalPage";
import PharmacyPage from "./pages/PharmacyPage";
import LabPage from "./pages/LabPage";
import AdmissionsPage from "./pages/AdmissionsPage";
import BillingPage from "./pages/BillingPage";
import QueuePage from "./pages/QueuePage";
import ReportsPage from "./pages/ReportsPage";
import DbmsLabPage from "./pages/DbmsLabPage";
import MlInsightsPage from "./pages/MlInsightsPage";
import ErModelPage from "./pages/ErModelPage";
import SchemaViewerPage from "./pages/SchemaViewerPage";
import NormalizationPage from "./pages/NormalizationPage";

function RequireAuth({ children }) {
  const { auth } = useAuth();
  if (!auth) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth><Layout /></RequireAuth>}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/patients" element={<PatientsPage />} />
              <Route path="/appointments" element={<AppointmentsPage />} />
              <Route path="/clinical" element={<ClinicalPage />} />
              <Route path="/pharmacy" element={<PharmacyPage />} />
              <Route path="/lab" element={<LabPage />} />
              <Route path="/admissions" element={<AdmissionsPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/queue" element={<QueuePage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/dbms-lab" element={<DbmsLabPage />} />
              <Route path="/ml-insights" element={<MlInsightsPage />} />
              <Route path="/er-model" element={<ErModelPage />} />
              <Route path="/schema-viewer" element={<SchemaViewerPage />} />
              <Route path="/normalization" element={<NormalizationPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}