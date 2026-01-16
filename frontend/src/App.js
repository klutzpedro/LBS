import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import Login from '@/pages/Login';
import MainApp from '@/pages/MainApp';
import Settings from '@/pages/Settings';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { TelegramProvider } from '@/context/TelegramContext';
import '@/App.css';

const PrivateRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <AuthProvider>
      <TelegramProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
            <Route path="/*" element={<PrivateRoute><MainApp /></PrivateRoute>} />
          </Routes>
          <Toaster position="top-right" />
        </BrowserRouter>
      </TelegramProvider>
    </AuthProvider>
  );
}

export default App;