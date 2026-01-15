import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Lock, User } from 'lucide-react';
import { toast } from 'sonner';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const result = await login(username, password);

    if (result.success) {
      toast.success('Login berhasil!');
      navigate('/');
    } else {
      toast.error(result.error);
    }

    setLoading(false);
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ 
        background: 'linear-gradient(135deg, var(--background-primary) 0%, var(--background-tertiary) 50%, var(--background-secondary) 100%)'
      }}
    >
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
          <div className="flex justify-center mb-8">
            <div 
              className="w-16 h-16 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' }}
            >
              <Shield className="w-10 h-10" style={{ color: 'var(--background-primary)' }} />
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 
              className="text-4xl font-bold mb-2"
              style={{ 
                fontFamily: 'Barlow Condensed, sans-serif',
                color: 'var(--foreground-primary)'
              }}
            >
              NORTHARCH GIS
            </h1>
            <p 
              className="text-sm"
              style={{ 
                fontFamily: 'Rajdhani, sans-serif',
                color: 'var(--foreground-secondary)'
              }}
            >
              Intelligence System Login
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
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
          </form>

          <div 
            className="mt-6 text-center text-xs"
            style={{ color: 'var(--foreground-muted)' }}
          >
            Default: admin / Paparoni83
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;