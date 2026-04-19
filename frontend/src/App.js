import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import "@/App.css";

// Pages
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import AuthCallbackPage from "@/pages/AuthCallbackPage";
import DashboardPage from "@/pages/DashboardPage";
import WorkspacesPage from "@/pages/WorkspacesPage";
import SessionsPage from "@/pages/SessionsPage";
import AuditLogsPage from "@/pages/AuditLogsPage";
import PoliciesPage from "@/pages/PoliciesPage";
import OrganizationsPage from "@/pages/OrganizationsPage";
import SettingsPage from "@/pages/SettingsPage";
import WorkspaceViewerPage from "@/pages/WorkspaceViewerPage";
import MultiViewPage from "@/pages/MultiViewPage";
import ApplicationsPage from "@/pages/ApplicationsPage";
import AdminGlobalPage from "@/pages/AdminGlobalPage";
import ZitadelAdminPage from "@/pages/ZitadelAdminPage";
import NetbirdAdminPage from "@/pages/NetbirdAdminPage";
import EnrollTenantPage from "@/pages/EnrollTenantPage";
import LxdAdminPage from "@/pages/LxdAdminPage";
import GuacamolePage from "@/pages/GuacamolePage";
import ClaimsMapPage from "@/pages/ClaimsMapPage";
import ConnectionPage from "@/pages/ConnectionPage";
import NeoChat from "@/components/NeoChat";

// Market — Windows VDI self-service
import MarketPage from "@/pages/market/MarketPage";
import NeoCloudWizard from "@/pages/market/NeoCloudWizard";
import NeoConnectWizard from "@/pages/market/NeoConnectWizard";
import CheckoutPage from "@/pages/market/CheckoutPage";
import ProvisionProgressPage from "@/pages/market/ProvisionProgressPage";

// Auth Context
import { AuthProvider, useAuth } from "@/context/AuthContext";
// Language Context
import { LanguageProvider } from "@/i18n/LanguageContext";

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <div className="App">
          <BrowserRouter>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/auth/callback" element={<AuthCallbackPage />} />

              {/* Market — Windows VDI (plan selection public, checkout requires auth) */}
              <Route path="/market" element={<MarketPage />} />
              <Route path="/market/neocloud" element={<NeoCloudWizard />} />
              <Route path="/market/neoconnect" element={<NeoConnectWizard />} />
              <Route path="/market/checkout" element={
                <ProtectedRoute>
                  <CheckoutPage />
                </ProtectedRoute>
              } />
              <Route path="/market/progress" element={
                <ProtectedRoute>
                  <ProvisionProgressPage />
                </ProtectedRoute>
              } />
              
              {/* Protected Routes */}
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              } />
              <Route path="/connect" element={
                <ProtectedRoute>
                  <ConnectionPage />
                </ProtectedRoute>
              } />
              <Route path="/workspaces" element={
                <ProtectedRoute>
                  <WorkspacesPage />
                </ProtectedRoute>
              } />
              <Route path="/applications" element={
                <ProtectedRoute>
                  <ApplicationsPage />
                </ProtectedRoute>
              } />
              <Route path="/multi-view" element={
                <ProtectedRoute>
                  <MultiViewPage />
                </ProtectedRoute>
              } />
              <Route path="/sessions" element={
                <ProtectedRoute>
                  <SessionsPage />
                </ProtectedRoute>
              } />
              <Route path="/audit-logs" element={
                <ProtectedRoute>
                  <AuditLogsPage />
                </ProtectedRoute>
              } />
              <Route path="/policies" element={
                <ProtectedRoute>
                  <PoliciesPage />
                </ProtectedRoute>
              } />
              <Route path="/organizations" element={
                <ProtectedRoute>
                  <OrganizationsPage />
                </ProtectedRoute>
              } />
              <Route path="/settings" element={
                <ProtectedRoute>
                  <SettingsPage />
                </ProtectedRoute>
              } />
              <Route path="/viewer/:sessionId" element={
                <ProtectedRoute>
                  <WorkspaceViewerPage />
                </ProtectedRoute>
              } />
              <Route path="/viewer/new/:workspaceId" element={
                <ProtectedRoute>
                  <WorkspaceViewerPage />
                </ProtectedRoute>
              } />
              <Route path="/admin" element={
                <ProtectedRoute>
                  <AdminGlobalPage />
                </ProtectedRoute>
              } />
              <Route path="/admin/zitadel" element={
                <ProtectedRoute>
                  <ZitadelAdminPage />
                </ProtectedRoute>
              } />
              <Route path="/admin/netbird" element={
                <ProtectedRoute>
                  <NetbirdAdminPage />
                </ProtectedRoute>
              } />
              <Route path="/admin/enroll-tenant" element={
                <ProtectedRoute>
                  <EnrollTenantPage />
                </ProtectedRoute>
              } />
              <Route path="/admin/lxd" element={
                <ProtectedRoute>
                  <LxdAdminPage />
                </ProtectedRoute>
              } />
              <Route path="/admin/neovdi" element={
                <ProtectedRoute>
                  <GuacamolePage />
                </ProtectedRoute>
              } />
              <Route path="/admin/claims-map" element={
                <ProtectedRoute>
                  <ClaimsMapPage />
                </ProtectedRoute>
              } />
            </Routes>
            <NeoChat />
          </BrowserRouter>
          <Toaster 
            position="bottom-right" 
            toastOptions={{
              style: {
                background: '#0f172a',
                border: '1px solid #1e293b',
                color: '#f8fafc',
              },
            }}
          />
        </div>
      </LanguageProvider>
    </AuthProvider>
  );
}

export default App;
