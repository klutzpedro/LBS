import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';

const TelegramContext = createContext(null);

export const TelegramProvider = ({ children }) => {
  const [telegramAuthorized, setTelegramAuthorized] = useState(false);
  const [telegramUser, setTelegramUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkTelegramStatus = async () => {
    try {
      const response = await axios.get(`${API}/telegram/status`);
      setTelegramAuthorized(response.data.authorized);
      setTelegramUser(response.data.user || null);
    } catch (error) {
      setTelegramAuthorized(false);
      setTelegramUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkTelegramStatus();
  }, []);

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
