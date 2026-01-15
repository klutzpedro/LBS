import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import CaseManagement from '@/pages/CaseManagement';
import TargetQuery from '@/pages/TargetQuery';
import MapView from '@/pages/MapView';
import History from '@/pages/History';
import Layout from '@/components/Layout';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import '@/App.css';

const PrivateRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <PrivateRoute>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/cases" element={<CaseManagement />} />
                    <Route path="/query" element={<TargetQuery />} />
                    <Route path="/map" element={<MapView />} />
                    <Route path="/history" element={<History />} />
                  </Routes>
                </Layout>
              </PrivateRoute>
            }
          />
        </Routes>
        <Toaster position="top-right" />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;