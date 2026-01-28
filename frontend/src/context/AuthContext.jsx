import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Get device info for session tracking
const getDeviceInfo = () => {
  const ua = navigator.userAgent;
  const browser = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)/i)?.[0] || 'Unknown Browser';
  const os = ua.match(/(Windows|Mac|Linux|Android|iOS)/i)?.[0] || 'Unknown OS';
  return `${browser} on ${os}`;
};

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [sessionId, setSessionId] = useState(localStorage.getItem('sessionId'));
  const [username, setUsername] = useState(localStorage.getItem('username'));
  const [isAdmin, setIsAdmin] = useState(localStorage.getItem('isAdmin') === 'true');
  const [isAuthenticated, setIsAuthenticated] = useState(!!token);
  const [sessionCheckFailed, setSessionCheckFailed] = useState(false);
  const [pendingTransfer, setPendingTransfer] = useState(null); // {request_id, new_device_info}
  const sessionCheckInterval = useRef(null);
  const transferCheckInterval = useRef(null);

  // Session validation - runs every 10 seconds
  const checkSession = useCallback(async () => {
    if (!token) return;
    
    try {
      console.log('[Auth] Checking session validity...');
      const response = await axios.post(`${API}/auth/check-session`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('[Auth] Session check response:', response.data);
      
      if (!response.data.valid) {
        console.log('[Auth] Session invalidated:', response.data.reason);
        setSessionCheckFailed(true);
      } else {
        console.log('[Auth] Session is valid');
      }
    } catch (error) {
      console.error('[Auth] Session check error:', error.response?.status, error.message);
      // Don't set sessionCheckFailed on network errors
    }
  }, [token]);

  // Check for pending transfer requests (device wants to take over)
  const checkPendingTransfer = useCallback(async () => {
    if (!token) return;
    
    try {
      const response = await axios.get(`${API}/auth/pending-transfer`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.has_pending) {
        setPendingTransfer({
          request_id: response.data.request_id,
          new_device_info: response.data.new_device_info
        });
      } else {
        setPendingTransfer(null);
      }
    } catch (error) {
      console.error('[Auth] Pending transfer check error:', error);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setIsAuthenticated(true);
      
      // Start session check interval
      sessionCheckInterval.current = setInterval(checkSession, 10000);
      
      // Start transfer request check interval (check more frequently)
      transferCheckInterval.current = setInterval(checkPendingTransfer, 3000);
      
      // Initial checks
      checkSession();
      checkPendingTransfer();
    } else {
      delete axios.defaults.headers.common['Authorization'];
      setIsAuthenticated(false);
      setSessionCheckFailed(false);
      setPendingTransfer(null);
      
      // Clear intervals
      if (sessionCheckInterval.current) {
        clearInterval(sessionCheckInterval.current);
        sessionCheckInterval.current = null;
      }
      if (transferCheckInterval.current) {
        clearInterval(transferCheckInterval.current);
        transferCheckInterval.current = null;
      }
    }
    
    return () => {
      if (sessionCheckInterval.current) clearInterval(sessionCheckInterval.current);
      if (transferCheckInterval.current) clearInterval(transferCheckInterval.current);
    };
  }, [token, checkSession, checkPendingTransfer]);

  const login = async (usernameInput, password) => {
    try {
      const response = await axios.post(`${API}/auth/login`, {
        username: usernameInput,
        password,
        device_info: getDeviceInfo()
      });

      const { 
        token: newToken, 
        username: user, 
        is_admin, 
        session_id,
        has_existing_session,
        existing_device_info,
        transfer_request_id,
        waiting_approval
      } = response.data;
      
      // Check if waiting for approval from other device
      if (waiting_approval && transfer_request_id) {
        return { 
          success: false, 
          waitingApproval: true,
          transferRequestId: transfer_request_id,
          existingDeviceInfo: existing_device_info,
          error: `Akun sedang digunakan di device lain: ${existing_device_info}`
        };
      }
      
      // Direct login (no existing session)
      localStorage.setItem('token', newToken);
      localStorage.setItem('sessionId', session_id);
      localStorage.setItem('username', user);
      localStorage.setItem('isAdmin', is_admin ? 'true' : 'false');
      setToken(newToken);
      setSessionId(session_id);
      setUsername(user);
      setIsAdmin(is_admin || false);
      setSessionCheckFailed(false);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || 'Login failed'
      };
    }
  };

  // Poll for transfer approval status
  const checkTransferStatus = async (requestId) => {
    try {
      const response = await axios.get(`${API}/auth/transfer-request/${requestId}`);
      return response.data;
    } catch (error) {
      return { status: 'error', message: error.response?.data?.detail || 'Error checking status' };
    }
  };

  // Complete login after transfer approval
  const completeTransferLogin = (transferData) => {
    localStorage.setItem('token', transferData.token);
    localStorage.setItem('sessionId', transferData.session_id);
    localStorage.setItem('username', transferData.username);
    localStorage.setItem('isAdmin', transferData.is_admin ? 'true' : 'false');
    setToken(transferData.token);
    setSessionId(transferData.session_id);
    setUsername(transferData.username);
    setIsAdmin(transferData.is_admin || false);
    setSessionCheckFailed(false);
  };

  // Respond to transfer request (approve/reject)
  const respondToTransfer = async (requestId, approve) => {
    try {
      const response = await axios.post(
        `${API}/auth/transfer-response/${requestId}`,
        { action: approve ? 'approve' : 'reject' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setPendingTransfer(null);
      
      if (approve) {
        // We approved, so we'll be logged out
        setSessionCheckFailed(true);
      }
      
      return response.data;
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || 'Error' };
    }
  };

  const logout = async () => {
    // Notify server to invalidate session
    if (token) {
      try {
        await axios.post(`${API}/auth/logout`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (error) {
        console.error('[Auth] Logout error:', error);
      }
    }
    
    localStorage.removeItem('token');
    localStorage.removeItem('sessionId');
    localStorage.removeItem('username');
    localStorage.removeItem('isAdmin');
    setToken(null);
    setSessionId(null);
    setUsername(null);
    setIsAdmin(false);
    setSessionCheckFailed(false);
    setPendingTransfer(null);
  };

  // Acknowledge session invalidation
  const acknowledgeSessionInvalid = () => {
    setSessionCheckFailed(false);
    logout();
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        sessionId,
        username,
        isAdmin,
        isAuthenticated,
        sessionCheckFailed,
        pendingTransfer,
        login,
        logout,
        acknowledgeSessionInvalid,
        checkTransferStatus,
        completeTransferLogin,
        respondToTransfer
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export { API, BACKEND_URL };
