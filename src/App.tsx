import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DashboardLayout } from "@/components/DashboardLayout";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Clinics from "./pages/Clinics";
import ClinicDetail from "./pages/ClinicDetail";
import SocialMedia from "./pages/SocialMedia";
import WebsiteDepartment from "./pages/WebsiteDepartment";
import SeoDepartment from "./pages/SeoDepartment";
import AiSeoDepartment from "./pages/AiSeoDepartment";
import GoogleAdsDepartment from "./pages/GoogleAdsDepartment";
import AdminReview from "./pages/AdminReview";
import Employees from "./pages/Employees";
import ClientsPage from "./pages/Clients";
import Settings from "./pages/Settings";
import Reports from "./pages/Reports";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import DataDeletion from "./pages/DataDeletion";
import TermsOfService from "./pages/TermsOfService";
import NotFound from "./pages/NotFound";
import BookMeeting from "./pages/BookMeeting";
import SplashScreen from "./components/SplashScreen";

const queryClient = new QueryClient();

const App = () => (
  <SplashScreen>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/data-deletion" element={<DataDeletion />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />

            <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/social" element={<SocialMedia />} />
              <Route path="/website" element={<WebsiteDepartment />} />
              <Route path="/seo" element={<SeoDepartment />} />
              <Route path="/ai-seo" element={<AiSeoDepartment />} />
              <Route path="/google-ads" element={<GoogleAdsDepartment />} />
              <Route path="/clinics" element={<ProtectedRoute allowedRoles={["admin", "concierge"]}><Clinics /></ProtectedRoute>} />
              <Route path="/clinics/:id" element={<ClinicDetail />} />
              <Route path="/employees" element={<ProtectedRoute allowedRoles={["admin"]}><Employees /></ProtectedRoute>} />
              <Route path="/clients" element={<ProtectedRoute allowedRoles={["admin"]}><ClientsPage /></ProtectedRoute>} />
              <Route path="/review" element={<ProtectedRoute allowedRoles={["admin"]}><AdminReview /></ProtectedRoute>} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/reports" element={<ProtectedRoute allowedRoles={["admin", "concierge"]}><Reports /></ProtectedRoute>} />
            </Route>

            <Route path="/content" element={<Navigate to="/social?tab=calendar" replace />} />
            <Route path="/content-requests" element={<Navigate to="/social?tab=requests" replace />} />
            <Route path="/ai-content" element={<Navigate to="/social?tab=requests" replace />} />
            <Route path="/intake-forms" element={<Navigate to="/social?tab=intake" replace />} />
            <Route path="/analytics" element={<Navigate to="/social?tab=analytics" replace />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </SplashScreen>
);

export default App;
