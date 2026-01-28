import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, User, UserPlus, ArrowLeft, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import netraLogo from '@/assets/logo.png';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const API_URL = process.env.REACT_APP_BACKEND_URL;

const Login = () => {
  const [mode, setMode] = useState('login'); // login or register
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Session active dialog state
  const [showSessionDialog, setShowSessionDialog] = useState(false);
  const [activeDeviceInfo, setActiveDeviceInfo] = useState('');
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);

    const result = await login(username, password);

    if (result.success) {
      toast.success('Login berhasil!');
      navigate('/');
    } else if (result.sessionActive) {
      // Show session active dialog
      setActiveDeviceInfo(result.deviceInfo || 'Unknown Device');
      setShowSessionDialog(true);
    } else {
      toast.error(result.error);
    }

    setLoading(false);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast.error('Password tidak cocok');
      return;
    }

    if (password.length < 6) {
      toast.error('Password minimal 6 karakter');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
          full_name: fullName
        })
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(data.message || 'Pendaftaran berhasil! Menunggu persetujuan admin.');
        setMode('login');
        setPassword('');
        setConfirmPassword('');
        setFullName('');
      } else {
        toast.error(data.detail || 'Pendaftaran gagal');
      }
    } catch (error) {
      toast.error('Terjadi kesalahan saat mendaftar');
    }

    setLoading(false);
  };

  const resetForm = () => {
    setUsername('');
    setPassword('');
    setFullName('');
    setConfirmPassword('');
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ 
        background: 'linear-gradient(135deg, var(--background-primary) 0%, var(--background-tertiary) 50%, var(--background-secondary) 100%)'
      }}
    >
      {/* Session Active Dialog */}
      <AlertDialog open={showSessionDialog} onOpenChange={setShowSessionDialog}>
        <AlertDialogContent 
          style={{ 
            backgroundColor: 'var(--background-secondary)',
            borderColor: 'var(--borders-default)'
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle 
              className="flex items-center gap-2"
              style={{ color: 'var(--foreground-primary)' }}
            >
              <AlertTriangle className="w-5 h-5" style={{ color: 'var(--accent-warning)' }} />
              Akun Sedang Aktif
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: 'var(--foreground-secondary)' }}>
              Akun ini sudah dibuka di tempat lain, mohon logout terlebih dahulu baru login di tempat baru.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => setShowSessionDialog(false)}
              data-testid="session-active-ok-btn"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--background-primary)'
              }}
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Grid Pattern Background */}
      <div className="absolute inset-0 grid-pattern opacity-30" />
      
      {/* Glow Effect */}
      <div 
        className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20"
        style={{ background: 'var(--accent-primary)' }}
      />

      <div className="relative z-10 w-full max-w-md px-4">
        <div 
          className="backdrop-blur-xl rounded-lg border p-8"
          style={{
            backgroundColor: 'rgba(21, 27, 35, 0.7)',
            borderColor: 'var(--borders-default)'
          }}
        >
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <img 
              src={netraLogo} 
              alt="NETRA Logo" 
              className="w-32 h-32 object-contain"
              data-testid="netra-logo"
            />
          </div>

          <div className="text-center mb-8">
            <h1 
              className="text-4xl font-bold mb-2"
              style={{ 
                fontFamily: 'Barlow Condensed, sans-serif',
                color: 'var(--foreground-primary)'
              }}
            >
              NETRA
            </h1>
            <p 
              className="text-sm"
              style={{ 
                fontFamily: 'Rajdhani, sans-serif',
                color: 'var(--foreground-secondary)'
              }}
            >
              {mode === 'login' ? 'NETRA Login' : 'Pendaftaran Akun Baru'}
            </p>
          </div>

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <Label 
                  htmlFor="username" 
                  className="text-xs uppercase tracking-wide mb-2 block"
                  style={{ color: 'var(--foreground-secondary)' }}
                >
                  Username
                </Label>
                <div className="relative">
                  <User 
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
                    style={{ color: 'var(--foreground-muted)' }}
                  />
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    data-testid="username-input"
                    className="pl-10 bg-background-tertiary border-borders-default focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
                    style={{ color: '#000000' }}
                    placeholder="Enter username"
                    required
                  />
                </div>
              </div>

              <div>
                <Label 
                  htmlFor="password" 
                  className="text-xs uppercase tracking-wide mb-2 block"
                  style={{ color: 'var(--foreground-secondary)' }}
                >
                  Password
                </Label>
                <div className="relative">
                  <Lock 
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
                    style={{ color: 'var(--foreground-muted)' }}
                  />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    data-testid="password-input"
                    className="pl-10 bg-background-tertiary border-borders-default focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
                    style={{ color: '#000000' }}
                    placeholder="Enter password"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                data-testid="login-submit-button"
                className="w-full py-6 font-semibold text-base uppercase tracking-wide transition-all duration-300"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--background-primary)',
                  fontFamily: 'Rajdhani, sans-serif'
                }}
              >
                {loading ? 'LOGGING IN...' : 'LOGIN'}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setMode('register'); resetForm(); }}
                  className="text-sm hover:underline flex items-center justify-center gap-2 mx-auto"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  <UserPlus className="w-4 h-4" />
                  Daftar Akun Baru
                </button>
              </div>
            </form>
            </>
          ) : (
            <form onSubmit={handleRegister} className="space-y-5">
              <div>
                <Label 
                  htmlFor="fullName" 
                  className="text-xs uppercase tracking-wide mb-2 block"
                  style={{ color: 'var(--foreground-secondary)' }}
                >
                  Nama Lengkap
                </Label>
                <div className="relative">
                  <User 
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
                    style={{ color: 'var(--foreground-muted)' }}
                  />
                  <Input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pl-10 bg-background-tertiary border-borders-default focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
                    style={{ color: '#000000' }}
                    placeholder="Masukkan nama lengkap"
                    required
                  />
                </div>
              </div>

              <div>
                <Label 
                  htmlFor="regUsername" 
                  className="text-xs uppercase tracking-wide mb-2 block"
                  style={{ color: 'var(--foreground-secondary)' }}
                >
                  Username
                </Label>
                <div className="relative">
                  <User 
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
                    style={{ color: 'var(--foreground-muted)' }}
                  />
                  <Input
                    id="regUsername"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-10 bg-background-tertiary border-borders-default focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
                    style={{ color: '#000000' }}
                    placeholder="Pilih username"
                    required
                  />
                </div>
              </div>

              <div>
                <Label 
                  htmlFor="regPassword" 
                  className="text-xs uppercase tracking-wide mb-2 block"
                  style={{ color: 'var(--foreground-secondary)' }}
                >
                  Password
                </Label>
                <div className="relative">
                  <Lock 
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
                    style={{ color: 'var(--foreground-muted)' }}
                  />
                  <Input
                    id="regPassword"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 bg-background-tertiary border-borders-default focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
                    style={{ color: '#000000' }}
                    placeholder="Minimal 6 karakter"
                    required
                  />
                </div>
              </div>

              <div>
                <Label 
                  htmlFor="confirmPassword" 
                  className="text-xs uppercase tracking-wide mb-2 block"
                  style={{ color: 'var(--foreground-secondary)' }}
                >
                  Konfirmasi Password
                </Label>
                <div className="relative">
                  <Lock 
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
                    style={{ color: 'var(--foreground-muted)' }}
                  />
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 bg-background-tertiary border-borders-default focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
                    style={{ color: '#000000' }}
                    placeholder="Ulangi password"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full py-6 font-semibold text-base uppercase tracking-wide transition-all duration-300"
                style={{
                  backgroundColor: 'var(--accent-secondary)',
                  color: 'var(--background-primary)',
                  fontFamily: 'Rajdhani, sans-serif'
                }}
              >
                {loading ? 'MENDAFTAR...' : 'DAFTAR'}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setMode('login'); resetForm(); }}
                  className="text-sm hover:underline flex items-center justify-center gap-2 mx-auto"
                  style={{ color: 'var(--foreground-secondary)' }}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Kembali ke Login
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
