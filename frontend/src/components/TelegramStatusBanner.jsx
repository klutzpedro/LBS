import { useTelegram } from '@/context/TelegramContext';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const TelegramStatusBanner = () => {
  const { telegramAuthorized, loading } = useTelegram();
  const navigate = useNavigate();

  if (loading || telegramAuthorized) {
    return null;
  }

  return (
    <div 
      className="border-b p-4"
      style={{
        backgroundColor: 'rgba(255, 184, 0, 0.1)',
        borderColor: 'var(--status-warning)'
      }}
    >
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5" style={{ color: 'var(--status-warning)' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--foreground-primary)' }}>
              Telegram belum terhubung
            </p>
            <p className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
              Login ke Telegram untuk mengaktifkan bot automation
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => navigate('/telegram-setup')}
          data-testid="telegram-setup-button"
          style={{
            backgroundColor: 'var(--status-warning)',
            color: 'var(--background-primary)'
          }}
        >
          <Settings className="w-4 h-4 mr-2" />
          Setup Telegram
        </Button>
      </div>
    </div>
  );
};
