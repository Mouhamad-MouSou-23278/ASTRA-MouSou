import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, HOME, RequireRole, useAuth } from "./lib/auth";
import { AdminPage } from "./pages/AdminPage";
import { LoginPage } from "./pages/Login";
import { MedicalPage } from "./pages/MedicalPage";
import { OperatorPage, OperatorSessionPage } from "./pages/OperatorPage";
import { PhysicalPage } from "./pages/PhysicalPage";
import { NotFound, SessionsPage, ViewerPage, WatchPage } from "./pages/SessionPages";
import "./styles.css";

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <div className="center-screen muted">Loading…</div>;
  return <Navigate to={user ? HOME[user.role] : "/login"} replace />;
}

// Route guards mirror the server's RBAC for navigation only; every API call is
// authorised again on the server.
function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/view/:token" element={<ViewerPage />} />
      <Route path="/admin" element={<RequireRole roles={["admin"]}><AdminPage /></RequireRole>} />
      <Route path="/physical" element={<RequireRole roles={["physical", "admin", "medical", "operator"]}><PhysicalPage /></RequireRole>} />
      <Route path="/medical" element={<RequireRole roles={["medical", "admin", "physical", "operator"]}><MedicalPage /></RequireRole>} />
      <Route path="/operator" element={<RequireRole roles={["operator"]}><OperatorPage /></RequireRole>} />
      <Route path="/operator/session/:id" element={<RequireRole roles={["operator"]}><OperatorSessionPage /></RequireRole>} />
      <Route path="/sessions" element={<RequireRole roles={["viewer", "admin", "physical", "medical", "operator"]}><SessionsPage /></RequireRole>} />
      <Route path="/watch/:id" element={<RequireRole roles={["viewer", "admin", "physical", "medical", "operator"]}><WatchPage /></RequireRole>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
