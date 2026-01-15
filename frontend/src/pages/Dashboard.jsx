import { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { 
  LayoutDashboard, 
  FolderOpen, 
  Target, 
  CheckCircle,
  TrendingUp,
  Activity
} from 'lucide-react';
import { toast } from 'sonner';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [recentTargets, setRecentTargets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, targetsRes] = await Promise.all([
        axios.get(`${API}/stats`),
        axios.get(`${API}/targets`)
      ]);

      setStats(statsRes.data);
      setRecentTargets(targetsRes.data.slice(0, 10));
    } catch (error) {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: 'var(--accent-primary)' }} />
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Cases',
      value: stats?.total_cases || 0,
      icon: FolderOpen,
      color: 'var(--accent-primary)'
    },
    {
      title: 'Active Cases',
      value: stats?.active_cases || 0,
      icon: Activity,
      color: 'var(--accent-secondary)'
    },
    {
      title: 'Total Targets',
      value: stats?.total_targets || 0,
      icon: Target,
      color: 'var(--status-info)'
    },
    {
      title: 'Success Rate',
      value: `${stats?.success_rate || 0}%`,
      icon: TrendingUp,
      color: 'var(--status-success)'
    }
  ];

  return (
    <div className="p-6 md:p-8" style={{ backgroundColor: 'var(--background-primary)' }}>
      {/* Header */}
      <div className="mb-8">
        <h1 
          className="text-5xl font-bold mb-2"
          style={{ 
            fontFamily: 'Barlow Condensed, sans-serif',
            color: 'var(--foreground-primary)'
          }}
        >
          DASHBOARD
        </h1>
        <p 
          className="text-base"
          style={{ color: 'var(--foreground-secondary)' }}
        >
          Overview sistem tracking dan intelligence
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              data-testid={`stat-card-${stat.title.toLowerCase().replace(' ', '-')}`}
              className="p-6 rounded-lg border transition-all duration-300 hover:border-opacity-30"
              style={{
                backgroundColor: 'var(--background-secondary)',
                borderColor: 'var(--borders-default)'
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div 
                  className="w-12 h-12 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${stat.color}20` }}
                >
                  <Icon className="w-6 h-6" style={{ color: stat.color }} />
                </div>
              </div>
              <div>
                <p 
                  className="text-xs uppercase tracking-wide mb-1"
                  style={{ 
                    fontFamily: 'Rajdhani, sans-serif',
                    color: 'var(--foreground-tertiary)'
                  }}
                >
                  {stat.title}
                </p>
                <p 
                  className="text-3xl font-bold"
                  style={{ 
                    fontFamily: 'Barlow Condensed, sans-serif',
                    color: 'var(--foreground-primary)'
                  }}
                >
                  {stat.value}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Targets */}
      <div 
        className="rounded-lg border p-6"
        style={{
          backgroundColor: 'var(--background-secondary)',
          borderColor: 'var(--borders-default)'
        }}
      >
        <h2 
          className="text-2xl font-bold mb-4"
          style={{ 
            fontFamily: 'Barlow Condensed, sans-serif',
            color: 'var(--foreground-primary)'
          }}
        >
          Recent Targets
        </h2>
        
        {recentTargets.length === 0 ? (
          <div className="text-center py-12">
            <Target className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--foreground-muted)' }} />
            <p style={{ color: 'var(--foreground-muted)' }}>Belum ada target yang di-query</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentTargets.map((target) => (
              <div
                key={target.id}
                data-testid={`recent-target-${target.id}`}
                className="flex items-center justify-between p-4 rounded-md border"
                style={{
                  backgroundColor: 'var(--background-tertiary)',
                  borderColor: 'var(--borders-subtle)'
                }}
              >
                <div className="flex items-center space-x-4">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor:
                        target.status === 'completed'
                          ? 'var(--status-success)'
                          : target.status === 'error'
                          ? 'var(--status-error)'
                          : 'var(--status-processing)'
                    }}
                  />
                  <div>
                    <p 
                      className="font-mono text-sm font-medium"
                      style={{ color: 'var(--accent-primary)' }}
                    >
                      {target.phone_number}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                      {new Date(target.created_at).toLocaleString('id-ID')}
                    </p>
                  </div>
                </div>
                <div>
                  <span 
                    className="px-3 py-1 rounded-full text-xs font-medium uppercase"
                    style={{
                      backgroundColor:
                        target.status === 'completed'
                          ? 'rgba(0, 255, 136, 0.1)'
                          : target.status === 'error'
                          ? 'rgba(255, 59, 92, 0.1)'
                          : 'rgba(167, 139, 250, 0.1)',
                      color:
                        target.status === 'completed'
                          ? 'var(--status-success)'
                          : target.status === 'error'
                          ? 'var(--status-error)'
                          : 'var(--status-processing)',
                      fontFamily: 'Rajdhani, sans-serif'
                    }}
                  >
                    {target.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;