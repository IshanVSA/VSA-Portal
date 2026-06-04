import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DashboardLayout } from "@/components/DashboardLayout";
import SplashScreen from "./components/SplashScreen";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider } from "@/hooks/useAuth";
import { lazy, ReactNode, Suspense } from "react";

// Eager: critical/auth flows
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";

// Lazy: everything else (heavy deps like Recharts, jsPDF, html editors only load on demand)
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Clinics = lazy(() => import("./pages/Clinics"));
const ClinicDetail = lazy(() => import("./pages/ClinicDetail"));
const SocialMedia = lazy(() => import("./pages/SocialMedia"));
const WebsiteDepartment = lazy(() => import("./pages/WebsiteDepartment"));
const SeoDepartment = lazy(() => import("./pages/SeoDepartment"));
const AiSeoDepartment = lazy(() => import("./pages/AiSeoDepartment"));
const GoogleAdsDepartment = lazy(() => import("./pages/GoogleAdsDepartment"));
const AdminReview = lazy(() => import("./pages/AdminReview"));
const Employees = lazy(() => import("./pages/Employees"));
const ClientsPage = lazy(() => import("./pages/Clients"));
const Settings = lazy(() => import("./pages/Settings"));
const SubAccounts = lazy(() => import("./pages/SubAccounts"));
const Reports = lazy(() => import("./pages/Reports"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const DataDeletion = lazy(() => import("./pages/DataDeletion"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const BookMeeting = lazy(() => import("./pages/BookMeeting"));
const CronMonitor = lazy(() => import("./pages/CronMonitor"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Most queries are fine being slightly stale — drastically reduces
      // refetches when navigating between pages or remounting components.
      staleTime: 2 * 60 * 1000,       // 2 min: treat data as fresh
      gcTime: 10 * 60 * 1000,         // 10 min: keep cache for back-nav
      refetchOnWindowFocus: false,
      refetchOnMount: false,           // honor staleTime on remount
      retry: 1,
    },
  },
});

// Expose so logout can wipe per-user cached data on shared browsers.
if (typeof window !== "undefined") {
  (window as unknown as { __queryClient?: typeof queryClient }).__queryClient = queryClient;
}

const RouteFallback = () => (
  <div className="flex items-center justify-center min-h-[40vh]">
    <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

// Wrap each route element so an error in one page never blanks the whole app.
const guard = (node: ReactNode, scope: string) => (
  <ErrorBoundary scope={scope}>
    <Suspense fallback={<RouteFallback />}>{node}</Suspense>
  </ErrorBoundary>
);

const App = () => (
  <ErrorBoundary scope="root">
    <SplashScreen>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
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
                <Route path="/social" element={<ProtectedRoute allowedDepartments={["social_media"]}>{guard(<SocialMedia />, "social")}</ProtectedRoute>} />
                <Route path="/website" element={<ProtectedRoute allowedDepartments={["website"]}>{guard(<WebsiteDepartment />, "website")}</ProtectedRoute>} />
                <Route path="/seo" element={<ProtectedRoute allowedDepartments={["seo"]}>{guard(<SeoDepartment />, "seo")}</ProtectedRoute>} />
                <Route path="/ai-seo" element={<ProtectedRoute allowedDepartments={["seo"]}>{guard(<AiSeoDepartment />, "ai-seo")}</ProtectedRoute>} />
                <Route path="/google-ads" element={<ProtectedRoute allowedDepartments={["google_ads"]}>{guard(<GoogleAdsDepartment />, "google-ads")}</ProtectedRoute>} />
                <Route path="/clinics" element={<ProtectedRoute allowedRoles={["admin", "concierge"]}>{guard(<Clinics />, "clinics")}</ProtectedRoute>} />
                <Route path="/clinics/:id" element={<ProtectedRoute allowedRoles={["admin", "concierge"]}>{guard(<ClinicDetail />, "clinic-detail")}</ProtectedRoute>} />
                <Route path="/employees" element={<ProtectedRoute allowedRoles={["admin"]}>{guard(<Employees />, "employees")}</ProtectedRoute>} />
                <Route path="/clients" element={<ProtectedRoute allowedRoles={["admin"]}>{guard(<ClientsPage />, "clients")}</ProtectedRoute>} />
                <Route path="/review" element={<ProtectedRoute allowedRoles={["admin"]}>{guard(<AdminReview />, "review")}</ProtectedRoute>} />
                <Route path="/settings" element={guard(<Settings />, "settings")} />
                <Route path="/reports" element={<ProtectedRoute allowedRoles={["admin", "concierge"]}>{guard(<Reports />, "reports")}</ProtectedRoute>} />
                <Route path="/cron-monitor" element={<ProtectedRoute allowedRoles={["admin"]}>{guard(<CronMonitor />, "cron-monitor")}</ProtectedRoute>} />
                <Route path="/sub-accounts" element={<ProtectedRoute allowedRoles={["client", "admin"]}>{guard(<SubAccounts />, "sub-accounts")}</ProtectedRoute>} />
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
        </AuthProvider>
      </QueryClientProvider>
    </SplashScreen>
  </ErrorBoundary>
);

export default App;
