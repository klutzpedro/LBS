import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { useAuth } from '@/context/AuthContext';

const TelegramContext = createContext(null);

export const TelegramProvider = ({ children }) => {
  const [telegramAuthorized, setTelegramAuthorized] = useState(false);
  const [telegramUser, setTelegramUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { token } = useAuth();

  const checkTelegramStatus = async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    
    try {
      const response = await axios.get(`${API}/telegram/status`);
      console.log('Telegram status:', response.data);
      setTelegramAuthorized(response.data.authorized || false);
      setTelegramUser(response.data.user || null);
    } catch (error) {
      console.error('Failed to check Telegram status:', error);
      setTelegramAuthorized(false);
      setTelegramUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      checkTelegramStatus();
    }
  }, [token]);

  return (
    <TelegramContext.Provider
      value={{
        telegramAuthorized,
        telegramUser,
        loading,
        refreshStatus: checkTelegramStatus
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
