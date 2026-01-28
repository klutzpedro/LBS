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
  const sessionCheckInterval = useRef(null);

  // Session validation - runs every 10 seconds
  const checkSession = useCallback(async () => {
    if (!token) return;
    
    try {
      const response = await axios.post(`${API}/auth/check-session`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!response.data.valid) {
        console.log('[Auth] Session invalidated:', response.data.reason);
        setSessionCheckFailed(true);
        // Don't auto-logout, let the UI handle it with a notification
      }
    } catch (error) {
      console.error('[Auth] Session check error:', error);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setIsAuthenticated(true);
      
      // Start session check interval
      sessionCheckInterval.current = setInterval(checkSession, 10000); // Check every 10 seconds
      
      // Initial check
      checkSession();
    } else {
      delete axios.defaults.headers.common['Authorization'];
      setIsAuthenticated(false);
      setSessionCheckFailed(false);
      
      // Clear interval
      if (sessionCheckInterval.current) {
        clearInterval(sessionCheckInterval.current);
        sessionCheckInterval.current = null;
      }
    }
    
    return () => {
      if (sessionCheckInterval.current) {
        clearInterval(sessionCheckInterval.current);
      }
    };
  }, [token, checkSession]);

  const login = async (usernameInput, password, forceLogin = false) => {
    try {
      const response = await axios.post(`${API}/auth/login`, {
        username: usernameInput,
        password,
        device_info: getDeviceInfo(),
        force_login: forceLogin
      });

      const { 
        token: newToken, 
        username: user, 
        is_admin, 
        session_id,
        has_existing_session,
        existing_device_info 
      } = response.data;
      
      // Check if there's an existing session on another device
      if (has_existing_session && !forceLogin) {
        return { 
          success: false, 
          hasExistingSession: true,
          existingDeviceInfo: existing_device_info,
          error: `Akun sedang digunakan di device lain: ${existing_device_info}`
        };
      }
      
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
  };

  // Acknowledge session invalidation (used when user dismisses the notification)
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
        login,
        logout,
        acknowledgeSessionInvalid
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
