import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTelegram } from '@/context/TelegramContext';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings as SettingsIcon, Save, Key, AlertCircle, ExternalLink, ArrowLeft, Shield, Send, CheckCircle, LogOut, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';

const Settings = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { telegramAuthorized, telegramUser, refreshStatus } = useTelegram();
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // API Status state
  const [credentialsStatus, setCredentialsStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  
  // Telegram setup states
  const [setupStep, setSetupStep] = useState(1);
  const [phoneNumber, setPhoneNumber] = useState('+62');
  const [verificationCode, setVerificationCode] = useState('');
  const [password2FA, setPassword2FA] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [settingUp, setSettingUp] = useState(false);

  // Fetch credentials status on mount
  useEffect(() => {
    fetchCredentialsStatus();
  }, []);

  const fetchCredentialsStatus = async () => {
    setLoadingStatus(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/telegram/credentials-status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCredentialsStatus(response.data);
    } catch (error) {
      console.error('Failed to fetch credentials status:', error);
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await axios.post(`${API}/settings/telegram-credentials`, {
        api_id: apiId,
        api_hash: apiHash
      });

      toast.success(response.data.message || 'Credentials updated!');
      
      // Show next steps
      if (response.data.next_steps) {
        setTimeout(() => {
          toast.info(response.data.next_steps, { duration: 5000 });
        }, 1000);
      }
      
      // Clear form and refresh status
      setApiId('');
      setApiHash('');
      fetchCredentialsStatus();
      
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
    console.log('Reset connection clicked');
    
    if (!window.confirm('Reset koneksi Telegram? Anda perlu login ulang setelah reset.')) {
      console.log('Reset cancelled by user');
      return;
    }

    console.log('Resetting Telegram connection...');

    try {
      const response = await axios.post(`${API}/telegram/reset-connection`);
      console.log('Reset response:', response.data);
      toast.success('Koneksi Telegram direset. Silakan setup ulang.');
      await refreshStatus();
      setSetupStep(1);
      setPhoneNumber('+62');
      setVerificationCode('');
      setPassword2FA('');
      setRequires2FA(false);
    } catch (error) {
      console.error('Reset error:', error);
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
          
          {/* Action Buttons - Reset and Restore */}
          <div className="px-4 pb-4 space-y-2">
            {/* Restore Session Button - New */}
            <Button
              size="sm"
              onClick={handleRestoreSession}
              data-testid="restore-session-button"
              className="w-full"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--background-primary)'
              }}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Restore Session dari Backup
            </Button>
            
            {/* Reset Connection Button */}
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
              Reset Connection (Login Ulang)
            </Button>
            <p className="text-xs mt-2 text-center" style={{ color: 'var(--foreground-muted)' }}>
              • Restore: Pulihkan session yang tersimpan<br/>
              • Reset: Hapus session dan login ulang
            </p>
          </div>
        </div>

        {/* API Credentials Status Panel */}
        <div 
          className="rounded-lg border mb-6"
          style={{
            backgroundColor: 'var(--background-secondary)',
            borderColor: 'var(--borders-default)'
          }}
        >
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 
                className="text-lg font-bold"
                style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}
              >
                STATUS API CREDENTIALS
              </h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={fetchCredentialsStatus}
                disabled={loadingStatus}
                style={{ color: 'var(--accent-primary)' }}
              >
                <RefreshCw className={`w-4 h-4 ${loadingStatus ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {credentialsStatus ? (
              <div className="space-y-3">
                {/* API ID & Hash */}
                <div className="grid grid-cols-2 gap-3">
                  <div 
                    className="p-3 rounded border"
                    style={{ backgroundColor: 'var(--background-tertiary)', borderColor: 'var(--borders-subtle)' }}
                  >
                    <p className="text-xs uppercase mb-1" style={{ color: 'var(--foreground-muted)' }}>API ID</p>
                    <p className="font-mono text-sm font-bold" style={{ color: 'var(--accent-primary)' }}>
                      {credentialsStatus.api_id || 'Not set'}
                    </p>
                  </div>
                  <div 
                    className="p-3 rounded border"
                    style={{ backgroundColor: 'var(--background-tertiary)', borderColor: 'var(--borders-subtle)' }}
                  >
                    <p className="text-xs uppercase mb-1" style={{ color: 'var(--foreground-muted)' }}>API Hash</p>
                    <p className="font-mono text-sm" style={{ color: 'var(--foreground-secondary)' }}>
                      {credentialsStatus.api_hash_preview || 'Not set'}
                    </p>
                  </div>
                </div>

                {/* Connection Status */}
                <div 
                  className="p-3 rounded border flex items-center justify-between"
                  style={{ 
                    backgroundColor: credentialsStatus.client_connected ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 59, 92, 0.1)',
                    borderColor: credentialsStatus.client_connected ? 'var(--status-success)' : 'var(--status-error)'
                  }}
                >
                  <div className="flex items-center gap-2">
                    {credentialsStatus.client_connected ? (
                      <Wifi className="w-5 h-5" style={{ color: 'var(--status-success)' }} />
                    ) : (
                      <WifiOff className="w-5 h-5" style={{ color: 'var(--status-error)' }} />
                    )}
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--foreground-primary)' }}>
                        {credentialsStatus.client_connected ? 'Client Connected' : 'Client Disconnected'}
                      </p>
                      {credentialsStatus.client_user && (
                        <p className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
                          @{credentialsStatus.client_user.username} ({credentialsStatus.client_user.phone})
                        </p>
                      )}
                    </div>
                  </div>
                  <div 
                    className={`w-3 h-3 rounded-full ${credentialsStatus.client_connected ? 'animate-pulse' : ''}`}
                    style={{ backgroundColor: credentialsStatus.client_connected ? 'var(--status-success)' : 'var(--status-error)' }}
                  />
                </div>

                {/* Session Info */}
                <div 
                  className="p-3 rounded border"
                  style={{ backgroundColor: 'var(--background-tertiary)', borderColor: 'var(--borders-subtle)' }}
                >
                  <p className="text-xs uppercase mb-2" style={{ color: 'var(--foreground-muted)' }}>Session Files</p>
                  {credentialsStatus.session_files?.length > 0 ? (
                    <div className="space-y-1">
                      {credentialsStatus.session_files.map((sf, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="font-mono" style={{ color: 'var(--accent-primary)' }}>{sf.name}</span>
                          <span style={{ color: 'var(--foreground-muted)' }}>{sf.size} bytes</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs" style={{ color: 'var(--status-warning)' }}>No session files found</p>
                  )}
                </div>

                {/* Runtime Check - Show success message instead of warning */}
                {credentialsStatus.is_correct ? (
                  <div 
                    className="p-2 rounded border text-xs"
                    style={{ 
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                      borderColor: 'var(--status-success)',
                      color: 'var(--foreground-primary)'
                    }}
                  >
                    ✅ API Credentials Valid (API ID: {credentialsStatus.runtime_api_id})
                  </div>
                ) : (
                  <div 
                    className="p-2 rounded border text-xs"
                    style={{ 
                      backgroundColor: 'rgba(255, 184, 0, 0.1)',
                      borderColor: 'var(--status-warning)',
                      color: 'var(--foreground-primary)'
                    }}
                  >
                    ⚠️ API Credentials mismatch. Expected: {credentialsStatus.correct_api_id}, Got: {credentialsStatus.runtime_api_id}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
                  {loadingStatus ? 'Loading...' : 'Klik refresh untuk load status'}
                </p>
              </div>
            )}
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
            
            {/* Info Box */}
            <div 
              className="p-3 rounded border mb-4 text-xs"
              style={{
                backgroundColor: 'rgba(0, 217, 255, 0.1)',
                borderColor: 'var(--accent-primary)',
                color: 'var(--foreground-secondary)'
              }}
            >
              <p className="font-semibold mb-1" style={{ color: 'var(--foreground-primary)' }}>
                Cara mendapatkan API Credentials:
              </p>
              <ol className="list-decimal ml-4 space-y-1">
                <li>Buka <a href="https://my.telegram.org" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--accent-primary)' }}>my.telegram.org</a></li>
                <li>Login dengan nomor telepon Anda</li>
                <li>Klik "API development tools"</li>
                <li>Buat aplikasi baru (isi nama app bebas)</li>
                <li>Copy API ID dan API Hash</li>
              </ol>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="text-xs uppercase mb-2 block" style={{ color: 'var(--foreground-secondary)' }}>
                  API ID
                </Label>
                <Input
                  type="text"
                  value={apiId}
                  onChange={(e) => setApiId(e.target.value)}
                  className="bg-background-tertiary border-borders-default font-mono"
                  style={{ color: '#000000' }}
                  placeholder="Contoh: 12345678"
                  data-testid="api-id-input"
                  required
                />
              </div>
              <div>
                <Label className="text-xs uppercase mb-2 block" style={{ color: 'var(--foreground-secondary)' }}>
                  API Hash
                </Label>
                <Input
                  type="text"
                  value={apiHash}
                  onChange={(e) => setApiHash(e.target.value)}
                  className="bg-background-tertiary border-borders-default font-mono"
                  style={{ color: '#000000' }}
                  placeholder="Contoh: a1b2c3d4e5f6g7h8i9j0..."
                  data-testid="api-hash-input"
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={submitting || !apiId || !apiHash}
                className="w-full py-6"
                data-testid="save-credentials-button"
                style={{
                  backgroundColor: 'var(--status-warning)',
                  color: 'var(--background-primary)'
                }}
              >
                <Key className="w-5 h-5 mr-2" />
                {submitting ? 'SAVING...' : 'UPDATE CREDENTIALS'}
              </Button>
            </form>

            <p className="text-xs mt-3 text-center" style={{ color: 'var(--foreground-muted)' }}>
              ⚠️ Setelah update, koneksi Telegram perlu di-reset dan login ulang
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
