import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const CpApiContext = createContext(null);

export const CpApiProvider = ({ children }) => {
  const [cpApiStatus, setCpApiStatus] = useState({
    connected: false,
    quotaRemaining: 0,
    quotaInitial: 300,
    quotaUsed: 0,
    lastUpdated: null,
    loading: true,
    error: null
  });

  const fetchStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const API_URL = process.env.REACT_APP_BACKEND_URL;
      const response = await fetch(`${API_URL}/api/cp-api/status`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setCpApiStatus({
          connected: data.connected,
          quotaRemaining: data.quota_remaining,
          quotaInitial: data.quota_initial,
          quotaUsed: data.quota_used,
          lastUpdated: data.last_updated ? new Date(data.last_updated) : null,
          loading: false,
          error: null
        });
      } else {
        setCpApiStatus(prev => ({
          ...prev,
          loading: false,
          error: 'Failed to fetch status'
        }));
      }
    } catch (error) {
      console.error('Error fetching CP API status:', error);
      setCpApiStatus(prev => ({
        ...prev,
        connected: false,
        loading: false,
        error: error.message
      }));
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Poll every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const refreshStatus = useCallback(() => {
    setCpApiStatus(prev => ({ ...prev, loading: true }));
    fetchStatus();
  }, [fetchStatus]);

  // Update quota after successful request
  const decrementQuota = useCallback(() => {
    setCpApiStatus(prev => ({
      ...prev,
      quotaRemaining: Math.max(0, prev.quotaRemaining - 1),
      quotaUsed: prev.quotaUsed + 1
    }));
  }, []);

  return (
    <CpApiContext.Provider value={{
      ...cpApiStatus,
      refreshStatus,
      decrementQuota
    }}>
      {children}
    </CpApiContext.Provider>
  );
};

export const useCpApi = () => {
  const context = useContext(CpApiContext);
  if (!context) {
    throw new Error('useCpApi must be used within a CpApiProvider');
  }
  return context;
};

export default CpApiContext;
