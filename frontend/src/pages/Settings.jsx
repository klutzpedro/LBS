import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTelegram } from '@/context/TelegramContext';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings as SettingsIcon, Save, Key, AlertCircle, ExternalLink, ArrowLeft, Shield, Send, CheckCircle, LogOut } from 'lucide-react';
import { toast } from 'sonner';

const Settings = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { telegramAuthorized, telegramUser, refreshStatus } = useTelegram();
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // Telegram setup states
  const [setupStep, setSetupStep] = useState(1);
  const [phoneNumber, setPhoneNumber] = useState('+62');
  const [verificationCode, setVerificationCode] = useState('');
  const [password2FA, setPassword2FA] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [settingUp, setSettingUp] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await axios.post(`${API}/settings/telegram-credentials`, {
        api_id: apiId,
        api_hash: apiHash
      });

      toast.success('Credentials updated! Backend perlu restart.');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update credentials');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendCode = async (e) => {
    e.preventDefault();
    setSettingUp(true);

    try {
      const response = await axios.post(`${API}/telegram/send-code`, {
        phone: phoneNumber
      });

      if (response.data.already_authorized) {
        toast.success('Sudah login ke Telegram!');
        await refreshStatus();
      } else {
        toast.success('Kode verifikasi telah dikirim!');
        setSetupStep(2);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Gagal mengirim kode');
    } finally {
      setSettingUp(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setSettingUp(true);

    try {
      const response = await axios.post(`${API}/telegram/verify-code`, {
        phone: phoneNumber,
        code: verificationCode,
        password: password2FA || undefined
      });

      if (response.data.requires_2fa) {
        setRequires2FA(true);
        toast.info('Akun dilindungi 2FA, masukkan password');
      } else if (response.data.success) {
        toast.success('Login Telegram berhasil!');
        await refreshStatus();
        setTimeout(() => navigate('/'), 1000);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Verifikasi gagal');
    } finally {
      setSettingUp(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleResetConnection = async () => {
    if (!window.confirm('Reset koneksi Telegram? Anda perlu login ulang setelah reset.')) {
      return;
    }

    try {
      const response = await axios.post(`${API}/telegram/reset-connection`);
      toast.success('Koneksi Telegram direset. Silakan setup ulang.');
      await refreshStatus();
      setSetupStep(1);
      setPhoneNumber('+62');
      setVerificationCode('');
      setPassword2FA('');
      setRequires2FA(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Gagal reset koneksi');
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background-primary)' }}>
      {/* Header */}
      <div 
        className="border-b p-4"
        style={{
          backgroundColor: 'var(--background-secondary)',
          borderColor: 'var(--borders-default)'
        }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/')}
            >
              <ArrowLeft className="w-5 h-5" style={{ color: 'var(--foreground-secondary)' }} />
            </Button>
            <div>
              <h1 
                className="text-2xl font-bold"
                style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}
              >
                SETTINGS
              </h1>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
          >
            <LogOut className="w-5 h-5" style={{ color: 'var(--status-error)' }} />
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 md:p-8">
        {/* Telegram Status Banner */}
        <div 
          className="rounded-lg border mb-6"
          style={{
            backgroundColor: telegramAuthorized ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 184, 0, 0.1)',
            borderColor: telegramAuthorized ? 'var(--status-success)' : 'var(--status-warning)'
          }}
        >
          <div className="p-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              {telegramAuthorized ? <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--status-success)' }} /> : <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--status-warning)' }} />}
              <div className="text-sm">
                <p className="font-semibold mb-1" style={{ color: 'var(--foreground-primary)' }}>
                  {telegramAuthorized ? '✓ Telegram Connected' : '⚠ Telegram Not Connected'}
                </p>
                <p style={{ color: 'var(--foreground-secondary)' }}>
                  {telegramAuthorized 
                    ? `Logged in as @${telegramUser?.username} - Bot automation active`
                    : 'Setup Telegram untuk aktivasi bot automation'
                  }
                </p>
              </div>
            </div>
          </div>
          
          {/* Reset Connection Button - Always visible */}
          <div className="px-4 pb-4">
            <Button
              size="sm"
              variant="destructive"
              onClick={handleResetConnection}
              data-testid="reset-connection-button"
              className="w-full"
              style={{
                backgroundColor: 'var(--status-error)',
                color: 'white'
              }}
            >
              Reset Connection
            </Button>
            <p className="text-xs mt-2 text-center" style={{ color: 'var(--foreground-muted)' }}>
              Gunakan jika koneksi stuck atau bermasalah
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Telegram Setup */}
          {!telegramAuthorized && (
            <div 
              className="p-6 rounded-lg border"
              style={{
                backgroundColor: 'var(--background-secondary)',
                borderColor: 'var(--borders-default)'
              }}
            >
              <h2 
                className="text-2xl font-bold mb-6"
                style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}
              >
                TELEGRAM SETUP
              </h2>

              {setupStep === 1 && (
                <form onSubmit={handleSendCode} className="space-y-4">
                  <div>
                    <Label className="text-xs uppercase mb-2 block" style={{ color: 'var(--foreground-secondary)' }}>
                      Phone Number
                    </Label>
                    <Input
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="bg-background-tertiary border-borders-default"
                      style={{ color: '#000000' }}
                      placeholder="+628123456789"
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={settingUp}
                    className="w-full py-6"
                    style={{
                      backgroundColor: 'var(--accent-primary)',
                      color: 'var(--background-primary)'
                    }}
                  >
                    <Send className="w-5 h-5 mr-2" />
                    {settingUp ? 'SENDING...' : 'SEND CODE'}
                  </Button>
                </form>
              )}

              {setupStep === 2 && (
                <form onSubmit={handleVerifyCode} className="space-y-4">
                  <div 
                    className="p-3 rounded border mb-4 text-xs"
                    style={{
                      backgroundColor: 'rgba(0, 217, 255, 0.1)',
                      borderColor: 'var(--accent-primary)',
                      color: 'var(--foreground-primary)'
                    }}
                  >
                    Kode verifikasi dikirim ke {phoneNumber}
                  </div>
                  <div>
                    <Label className="text-xs uppercase mb-2 block" style={{ color: 'var(--foreground-secondary)' }}>
                      Verification Code
                    </Label>
                    <Input
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      className="bg-background-tertiary border-borders-default text-center text-2xl tracking-widest font-mono"
                      style={{ color: '#000000' }}
                      placeholder="12345"
                      maxLength={5}
                      required
                    />
                  </div>
                  {requires2FA && (
                    <div>
                      <Label className="text-xs uppercase mb-2 block" style={{ color: 'var(--foreground-secondary)' }}>
                        2FA Password
                      </Label>
                      <Input
                        type="password"
                        value={password2FA}
                        onChange={(e) => setPassword2FA(e.target.value)}
                        className="bg-background-tertiary border-borders-default"
                        style={{ color: '#000000' }}
                        placeholder="Enter 2FA password"
                        required
                      />
                    </div>
                  )}
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      onClick={() => setSetupStep(1)}
                      variant="outline"
                      className="flex-1 py-6"
                      style={{
                        backgroundColor: 'var(--background-tertiary)',
                        borderColor: 'var(--borders-default)',
                        color: 'var(--foreground-primary)'
                      }}
                    >
                      BACK
                    </Button>
                    <Button
                      type="submit"
                      disabled={settingUp}
                      className="flex-1 py-6"
                      style={{
                        backgroundColor: 'var(--accent-primary)',
                        color: 'var(--background-primary)'
                      }}
                    >
                      {settingUp ? 'VERIFYING...' : 'VERIFY'}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* API Credentials (Advanced) */}
          <div 
            className="p-6 rounded-lg border"
            style={{
              backgroundColor: 'var(--background-secondary)',
              borderColor: 'var(--borders-default)'
            }}
          >
            <h2 
              className="text-2xl font-bold mb-4"
              style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}
            >
              API CREDENTIALS
            </h2>
            <p className="text-sm mb-4" style={{ color: 'var(--foreground-secondary)' }}>
              Current: API ID <span className="font-mono" style={{ color: 'var(--accent-primary)' }}>37983970</span>
            </p>
            <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
              Credentials sudah benar. Jika perlu update, gunakan form di bawah.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
