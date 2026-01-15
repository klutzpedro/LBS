import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { useTelegram } from '@/context/TelegramContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const TelegramSetup = () => {
  const { telegramAuthorized, telegramUser, refreshStatus } = useTelegram();
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [phoneNumber, setPhoneNumber] = useState('+62');
  const [verificationCode, setVerificationCode] = useState('');
  const [password2FA, setPassword2FA] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (telegramAuthorized) {
      setStep(3);
    }
    setLoading(false);
  }, [telegramAuthorized]);

  const handleSendCode = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await axios.post(`${API}/telegram/send-code`, {
        phone: phoneNumber
      });

      if (response.data.already_authorized) {
        toast.success('Sudah login ke Telegram!');
        await refreshStatus();
        setStep(3);
      } else {
        toast.success('Kode verifikasi telah dikirim!');
        setStep(2);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Gagal mengirim kode');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setSubmitting(true);

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
        setStep(3);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Verifikasi gagal');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: 'var(--accent-primary)' }} />
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--background-primary)' }}
    >
      <div className="w-full max-w-md">
        <div 
          className="rounded-lg border p-8"
          style={{
            backgroundColor: 'var(--background-secondary)',
            borderColor: 'var(--borders-default)'
          }}
        >
          {/* Header */}
          <div className="text-center mb-8">
            <div 
              className="w-16 h-16 rounded-lg mx-auto mb-4 flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' }}
            >
              <Shield className="w-10 h-10" style={{ color: 'var(--background-primary)' }} />
            </div>
            <h1 
              className="text-3xl font-bold mb-2"
              style={{ 
                fontFamily: 'Barlow Condensed, sans-serif',
                color: 'var(--foreground-primary)'
              }}
            >
              TELEGRAM SETUP
            </h1>
            <p className="text-sm" style={{ color: 'var(--foreground-secondary)' }}>
              {step === 3 ? 'Koneksi Aktif' : 'Login ke akun Telegram @dwijayanto'}
            </p>
          </div>

          {/* Step 1: Phone Number */}
          {step === 1 && (
            <form onSubmit={handleSendCode} className="space-y-6">
              <div>
                <Label 
                  htmlFor="phone" 
                  className="text-xs uppercase tracking-wide mb-2 block"
                  style={{ color: 'var(--foreground-secondary)' }}
                >
                  Phone Number
                </Label>
                <Input
                  id="phone"
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="bg-background-tertiary border-borders-default"
                  style={{ color: '#000000' }}
                  placeholder="+628123456789"
                  required
                />
                <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>
                  Nomor HP terdaftar untuk @dwijayanto
                </p>
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full py-6 font-semibold uppercase tracking-wide"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--background-primary)',
                  fontFamily: 'Rajdhani, sans-serif'
                }}
              >
                <Send className="w-5 h-5 mr-2" />
                {submitting ? 'MENGIRIM...' : 'KIRIM KODE'}
              </Button>
            </form>
          )}

          {/* Step 2: Verification Code */}
          {step === 2 && (
            <form onSubmit={handleVerifyCode} className="space-y-6">
              <div 
                className="p-4 rounded-lg border mb-6"
                style={{
                  backgroundColor: 'rgba(0, 217, 255, 0.1)',
                  borderColor: 'var(--accent-primary)'
                }}
              >
                <p className="text-sm" style={{ color: 'var(--foreground-primary)' }}>
                  Kode verifikasi telah dikirim ke <span className="font-bold">{phoneNumber}</span>
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--foreground-secondary)' }}>
                  Buka Telegram app Anda untuk melihat kode
                </p>
              </div>

              <div>
                <Label 
                  htmlFor="code" 
                  className="text-xs uppercase tracking-wide mb-2 block"
                  style={{ color: 'var(--foreground-secondary)' }}
                >
                  Verification Code
                </Label>
                <Input
                  id="code"
                  type="text"
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
                  <Label 
                    htmlFor="password" 
                    className="text-xs uppercase tracking-wide mb-2 block"
                    style={{ color: 'var(--foreground-secondary)' }}
                  >
                    2FA Password
                  </Label>
                  <Input
                    id="password"
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
                  onClick={() => setStep(1)}
                  variant="outline"
                  className="flex-1 py-6"
                  style={{
                    backgroundColor: 'var(--background-tertiary)',
                    borderColor: 'var(--borders-default)',
                    color: 'var(--foreground-primary)'
                  }}
                >
                  KEMBALI
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-6 font-semibold uppercase tracking-wide"
                  style={{
                    backgroundColor: 'var(--accent-primary)',
                    color: 'var(--background-primary)',
                    fontFamily: 'Rajdhani, sans-serif'
                  }}
                >
                  {submitting ? 'VERIFYING...' : 'VERIFY'}
                </Button>
              </div>
            </form>
          )}

          {/* Step 3: Success */}
          {step === 3 && telegramAuthorized && telegramUser && (
            <div className="text-center space-y-6">
              <div 
                className="w-20 h-20 rounded-full mx-auto flex items-center justify-center"
                style={{ backgroundColor: 'rgba(0, 255, 136, 0.1)' }}
              >
                <CheckCircle className="w-12 h-12" style={{ color: 'var(--status-success)' }} />
              </div>

              <div>
                <h3 
                  className="text-2xl font-bold mb-2"
                  style={{ 
                    fontFamily: 'Barlow Condensed, sans-serif',
                    color: 'var(--status-success)'
                  }}
                >
                  TELEGRAM CONNECTED
                </h3>
                <p className="text-sm" style={{ color: 'var(--foreground-secondary)' }}>
                  Koneksi ke Telegram berhasil
                </p>
              </div>

              <div 
                className="p-4 rounded-lg border text-left"
                style={{
                  backgroundColor: 'var(--background-tertiary)',
                  borderColor: 'var(--borders-subtle)'
                }}
              >
                <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--foreground-muted)' }}>
                  Logged in as
                </p>
                <p className="font-semibold mb-1" style={{ color: 'var(--foreground-primary)' }}>
                  {telegramUser.first_name}
                </p>
                <p className="text-sm font-mono" style={{ color: 'var(--accent-primary)' }}>
                  @{telegramUser.username}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>
                  Phone: {telegramUser.phone}
                </p>
              </div>

              <div 
                className="p-4 rounded-lg border"
                style={{
                  backgroundColor: 'rgba(0, 255, 136, 0.05)',
                  borderColor: 'var(--status-success)'
                }}
              >
                <p className="text-sm" style={{ color: 'var(--foreground-primary)' }}>
                  ✓ Bot automation siap digunakan
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--foreground-secondary)' }}>
                  Anda sekarang bisa query target via @northarch_bot
                </p>
              </div>

              <Button
                onClick={() => window.location.href = '/query'}
                className="w-full py-6 font-semibold uppercase tracking-wide"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--background-primary)',
                  fontFamily: 'Rajdhani, sans-serif'
                }}
              >
                MULAI QUERY TARGET
              </Button>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div 
          className="mt-6 p-4 rounded-lg border"
          style={{
            backgroundColor: 'rgba(0, 217, 255, 0.05)',
            borderColor: 'var(--borders-subtle)'
          }}
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent-primary)' }} />
            <div className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
              <p className="font-semibold mb-1" style={{ color: 'var(--foreground-primary)' }}>
                Setup ini hanya perlu dilakukan sekali
              </p>
              <p>
                Setelah login berhasil, aplikasi akan otomatis remote @northarch_bot untuk setiap query tanpa perlu login ulang.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TelegramSetup;
