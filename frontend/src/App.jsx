import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Pickups from './pages/Pickups';
import PickupDetail from './pages/PickupDetail';
import PackingList from './pages/PackingList';
import ShipmentPackingLists from './pages/ShipmentPackingLists';
import InvoicePrint from './pages/InvoicePrint';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import Shipments from './pages/Shipments';
import ShipmentDetail from './pages/ShipmentDetail';
import CreateShipment from './pages/CreateShipment';
import Payments from './pages/Payments';
import CreateInvoice from './pages/CreateInvoice';
import Expenses from './pages/Expenses';
import TransactionReview from './pages/TransactionReview';
import BankSettings from './pages/BankSettings';
import FixedCosts from './pages/FixedCosts';
import FinancialReports from './pages/FinancialReports';
import CompanySettings from './pages/admin/CompanySettings';
import ShipmentSettings from './pages/admin/ShipmentSettings';
import CatalogManager from './pages/admin/CatalogManager';
import PaymentSettings from './pages/admin/PaymentSettings';
import PublicTracking from './pages/PublicTracking';
import LoadingSpinner from './components/LoadingSpinner';
import { Toaster } from 'react-hot-toast';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner text="Loading..." />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner text="Loading..." />;

  return (
    <Routes>
      <Route path="/track" element={<PublicTracking />} />
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="pickups" element={<Pickups />} />
        <Route path="pickups/new" element={<CreateInvoice />} />
        <Route path="pickups/:id" element={<PickupDetail />} />
        <Route path="pickups/:id/packing-list" element={<PackingList />} />
        <Route path="pickups/:id/print" element={<InvoicePrint />} />
        <Route path="shipments/:id/packing-lists" element={<ShipmentPackingLists />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="shipments" element={<Shipments />} />
        <Route path="shipments/new" element={<CreateShipment />} />
        <Route path="shipments/:id" element={<ShipmentDetail />} />
        <Route path="payments" element={<Payments />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="bank/review" element={<TransactionReview />} />
        <Route path="fixed-costs" element={<FixedCosts />} />
        <Route path="reports" element={<FinancialReports />} />
        <Route path="settings/bank" element={<BankSettings />} />
        <Route path="settings/company" element={<CompanySettings />} />
        <Route path="settings/shipments" element={<ShipmentSettings />} />
        <Route path="settings/catalog" element={<CatalogManager />} />
        <Route path="settings/payments" element={<PaymentSettings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: { borderRadius: '10px', background: '#1A1D2B', color: '#fff', fontSize: '13px' },
            success: { iconTheme: { primary: '#10B981', secondary: '#fff' } },
            error: { iconTheme: { primary: '#EF4444', secondary: '#fff' }, duration: 5000 },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}
