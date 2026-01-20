import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { useAuth } from '@/context/AuthContext';

const TelegramContext = createContext(null);

// Polling interval in milliseconds (10 seconds for real-time feel)
const STATUS_POLL_INTERVAL = 10000;

export const TelegramProvider = ({ children }) => {
  const [telegramAuthorized, setTelegramAuthorized] = useState(false);
  const [telegramUser, setTelegramUser] = useState(null);
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(null);
  const { token, isAuthenticated } = useAuth();
  const pollIntervalRef = useRef(null);
  const previousStatus = useRef({ authorized: null, connected: null });

  const checkTelegramStatus = useCallback(async (silent = false) => {
    if (!token || !isAuthenticated) {
      setLoading(false);
      return;
    }
    
    try {
      const response = await axios.get(`${API}/telegram/status`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        timeout: 8000 // 8 second timeout
      });
      
      const newAuthorized = response.data.authorized || false;
      const newConnected = response.data.connected || false;
      
      // Log status change for debugging
      if (previousStatus.current.authorized !== newAuthorized || 
          previousStatus.current.connected !== newConnected) {
        console.log('[TelegramContext] Status changed:', {
          authorized: newAuthorized,
          connected: newConnected,
          user: response.data.user?.username
        });
        previousStatus.current = { authorized: newAuthorized, connected: newConnected };
      }
      
      setTelegramAuthorized(newAuthorized);
      setTelegramConnected(newConnected);
      setTelegramUser(response.data.user || null);
      setLastChecked(new Date());
      setConnectionError(null);
    } catch (error) {
      console.error('[TelegramContext] Status check failed:', error.message);
      setConnectionError(error.message);
      // Don't immediately set disconnected on network error - might be temporary
      if (error.response?.status === 401) {
        setTelegramAuthorized(false);
        setTelegramUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, [token, isAuthenticated]);

  // Initial check and start polling
  useEffect(() => {
    if (token && isAuthenticated) {
      // Initial check with small delay
      const initialTimer = setTimeout(() => {
        checkTelegramStatus(false);
      }, 500);
      
      // Start polling for real-time updates
      pollIntervalRef.current = setInterval(() => {
        checkTelegramStatus(true); // silent mode for polling
      }, STATUS_POLL_INTERVAL);
      
      return () => {
        clearTimeout(initialTimer);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
      };
    } else {
      // Clear polling when not authenticated
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    }
  }, [token, isAuthenticated, checkTelegramStatus]);

  // Force refresh function that can be called manually
  const forceRefresh = useCallback(async () => {
    setLoading(true);
    await checkTelegramStatus(false);
  }, [checkTelegramStatus]);

  return (
    <TelegramContext.Provider
      value={{
        telegramAuthorized,
        telegramConnected,
        telegramUser,
        loading,
        lastChecked,
        connectionError,
        refreshStatus: forceRefresh,
        // Computed status for easy display
        status: telegramAuthorized && telegramConnected ? 'connected' : 
                telegramAuthorized ? 'authorized_disconnected' : 
                'disconnected'
      }}
    >
      {children}
    </TelegramContext.Provider>
  );
};

export const useTelegram = () => {
  const context = useContext(TelegramContext);
  if (!context) {
    throw new Error('useTelegram must be used within TelegramProvider');
  }
  return context;
};
