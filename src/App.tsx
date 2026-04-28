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
import SubAccounts from "./pages/SubAccounts";
import Reports from "./pages/Reports";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import DataDeletion from "./pages/DataDeletion";
import TermsOfService from "./pages/TermsOfService";
import NotFound from "./pages/NotFound";
import BookMeeting from "./pages/BookMeeting";
import ClientJourneyPage from "./pages/ClientJourney";
import CronMonitor from "./pages/CronMonitor";
import SplashScreen from "./components/SplashScreen";
import ErrorBoundary from "./components/ErrorBoundary";
import { ReactNode } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Expose so logout can wipe per-user cached data on shared browsers.
if (typeof window !== "undefined") {
  (window as unknown as { __queryClient?: typeof queryClient }).__queryClient = queryClient;
}

// Wrap each route element so an error in one page never blanks the whole app.
const guard = (node: ReactNode, scope: string) => (
  <ErrorBoundary scope={scope}>{node}</ErrorBoundary>
);

const App = () => (
  <ErrorBoundary scope="root">
    <SplashScreen>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={guard(<Login />, "login")} />
              <Route path="/reset-password" element={guard(<ResetPassword />, "reset-password")} />
              <Route path="/privacy-policy" element={guard(<PrivacyPolicy />, "privacy")} />
              <Route path="/data-deletion" element={guard(<DataDeletion />, "data-deletion")} />
              <Route path="/terms-of-service" element={guard(<TermsOfService />, "tos")} />

              <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                <Route path="/" element={guard(<Dashboard />, "dashboard")} />
                <Route path="/book-meeting" element={guard(<BookMeeting />, "book-meeting")} />
                <Route path="/social" element={guard(<SocialMedia />, "social")} />
                <Route path="/website" element={guard(<WebsiteDepartment />, "website")} />
                <Route path="/seo" element={guard(<SeoDepartment />, "seo")} />
                <Route path="/ai-seo" element={guard(<AiSeoDepartment />, "ai-seo")} />
                <Route path="/google-ads" element={guard(<GoogleAdsDepartment />, "google-ads")} />
                <Route path="/clinics" element={<ProtectedRoute allowedRoles={["admin", "concierge"]}>{guard(<Clinics />, "clinics")}</ProtectedRoute>} />
                <Route path="/clinics/:id" element={<ProtectedRoute allowedRoles={["admin", "concierge"]}>{guard(<ClinicDetail />, "clinic-detail")}</ProtectedRoute>} />
                <Route path="/client-journey" element={<ProtectedRoute allowedRoles={["admin", "concierge"]}>{guard(<ClientJourneyPage />, "client-journey")}</ProtectedRoute>} />
                <Route path="/employees" element={<ProtectedRoute allowedRoles={["admin"]}>{guard(<Employees />, "employees")}</ProtectedRoute>} />
                <Route path="/clients" element={<ProtectedRoute allowedRoles={["admin"]}>{guard(<ClientsPage />, "clients")}</ProtectedRoute>} />
                <Route path="/review" element={<ProtectedRoute allowedRoles={["admin"]}>{guard(<AdminReview />, "review")}</ProtectedRoute>} />
                <Route path="/settings" element={guard(<Settings />, "settings")} />
                <Route path="/reports" element={<ProtectedRoute allowedRoles={["admin", "concierge"]}>{guard(<Reports />, "reports")}</ProtectedRoute>} />
                <Route path="/cron-monitor" element={<ProtectedRoute allowedRoles={["admin"]}>{guard(<CronMonitor />, "cron-monitor")}</ProtectedRoute>} />
                <Route path="/sub-accounts" element={<ProtectedRoute allowedRoles={["client"]}>{guard(<SubAccounts />, "sub-accounts")}</ProtectedRoute>} />
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
  </ErrorBoundary>
);

export default App;
