import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import Login from '@/pages/Login';
import MainApp from '@/pages/MainApp';
import Settings from '@/pages/Settings';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { TelegramProvider } from '@/context/TelegramContext';
import { CpApiProvider } from '@/context/CpApiContext';
import axios from 'axios';
import '@/App.css';

// Global axios error interceptor to prevent UI crashes
axios.interceptors.response.use(
  response => response,
  error => {
    // Log all errors for debugging
    console.error('[Axios Error]', {
      status: error.response?.status,
      message: error.message,
      url: error.config?.url
    });
    
    // Handle specific error cases gracefully
    if (error.response?.status === 500) {
      console.error('[Server Error] 500 Internal Server Error - Check backend logs');
      // Don't show toast for every 500 error, let individual components handle it
    } else if (error.response?.status === 503) {
      // Service unavailable - likely Telegram connection issue
      console.warn('[Service Unavailable] Backend service temporarily unavailable');
    } else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      console.warn('[Timeout] Request timed out');
    } else if (!error.response) {
      // Network error
      console.warn('[Network Error] No response received');
    }
    
    // Always reject the promise so individual catch blocks can handle
    return Promise.reject(error);
  }
);

const PrivateRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <AuthProvider>
      <TelegramProvider>
        <CpApiProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
              <Route path="/*" element={<PrivateRoute><MainApp /></PrivateRoute>} />
            </Routes>
            <Toaster position="top-right" />
          </BrowserRouter>
        </CpApiProvider>
      </TelegramProvider>
    </AuthProvider>
  );
}

export default App;