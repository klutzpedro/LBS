import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { TelegramStatusBanner } from '@/components/TelegramStatusBanner';
import {
  LayoutDashboard,
  FolderOpen,
  Crosshair,
  Map,
  Calendar,
  Clock,
  LogOut,
  Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export const Layout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { username, logout } = useAuth();

  const navigation = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Cases', path: '/cases', icon: FolderOpen },
    { name: 'Target Query', path: '/query', icon: Crosshair },
    { name: 'Map View', path: '/map', icon: Map },
    { name: 'Scheduling', path: '/scheduling', icon: Calendar },
    { name: 'History', path: '/history', icon: Clock }
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-background-primary">
      {/* Sidebar */}
      <aside className="w-64 lg:w-72 bg-background-secondary border-r" style={{ borderColor: 'var(--borders-default)' }}>
        <div className="p-6 border-b" style={{ borderColor: 'var(--borders-default)' }}>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center">
              <Shield className="w-6 h-6 text-background-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}>
                WASKITA
              </h1>
              <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>Location Based System</p>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-2">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                data-testid={`nav-${item.name.toLowerCase().replace(' ', '-')}`}
                className="flex items-center space-x-3 px-4 py-3 rounded-md transition-all duration-300"
                style={{
                  backgroundColor: isActive ? 'var(--background-tertiary)' : 'transparent',
                  borderLeft: isActive ? '3px solid var(--accent-primary)' : '3px solid transparent',
                  color: isActive ? 'var(--accent-primary)' : 'var(--foreground-secondary)'
                }}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 w-64 lg:w-72 p-4 border-t" style={{ borderColor: 'var(--borders-default)' }}>
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-tertiary)] flex items-center justify-center">
                <span className="text-sm font-bold" style={{ color: 'var(--background-primary)' }}>A</span>
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--foreground-primary)' }}>{username}</p>
                <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>Administrator</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              data-testid="logout-button"
              className="hover:bg-background-tertiary"
            >
              <LogOut className="w-4 h-4" style={{ color: 'var(--status-error)' }} />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <TelegramStatusBanner />
        {children}
      </main>
    </div>
  );
};

export default Layout;