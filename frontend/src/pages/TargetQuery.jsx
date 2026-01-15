import { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Crosshair, Phone, Activity, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

const TargetQuery = () => {
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentTarget, setCurrentTarget] = useState(null);
  const [statusPolling, setStatusPolling] = useState(null);

  useEffect(() => {
    fetchCases();
    return () => {
      if (statusPolling) clearInterval(statusPolling);
    };
  }, []);

  const fetchCases = async () => {
    try {
      const response = await axios.get(`${API}/cases`);
      setCases(response.data.filter(c => c.status === 'active'));
    } catch (error) {
      toast.error('Failed to load cases');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!phoneNumber.startsWith('62')) {
      toast.error('Nomor telepon harus dimulai dengan 62');
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post(`${API}/targets`, {
        case_id: selectedCase,
        phone_number: phoneNumber
      });

      setCurrentTarget(response.data);
      toast.success('Target query dimulai!');
      startStatusPolling(response.data.id);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create target');
      setLoading(false);
    }
  };

  const startStatusPolling = (targetId) => {
    const interval = setInterval(async () => {
      try {
        const response = await axios.get(`${API}/targets/${targetId}/status`);
        setCurrentTarget(prev => ({ ...prev, status: response.data.status, data: response.data.data }));

        if (response.data.status === 'completed' || response.data.status === 'error') {
          clearInterval(interval);
          setLoading(false);
          
          if (response.data.status === 'completed') {
            toast.success('Lokasi berhasil ditemukan!');
          } else {
            toast.error('Query gagal');
          }
        }
      } catch (error) {
        clearInterval(interval);
        setLoading(false);
      }
    }, 2000);

    setStatusPolling(interval);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5" style={{ color: 'var(--status-success)' }} />;
      case 'error':
        return <XCircle className="w-5 h-5" style={{ color: 'var(--status-error)' }} />;
      default:
        return <Activity className="w-5 h-5 animate-pulse" style={{ color: 'var(--status-processing)' }} />;
    }
  };

  const getStatusMessage = (status) => {
    const messages = {
      pending: 'Menunggu proses...',
      connecting: 'Menghubungi bot Telegram...',
      querying: 'Mengirim nomor telepon...',
      processing: 'Bot sedang memproses...',
      parsing: 'Mengekstrak data lokasi...',
      completed: 'Lokasi berhasil ditemukan',
      error: 'Query gagal'
    };
    return messages[status] || status;
  };

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
          TARGET QUERY
        </h1>
        <p style={{ color: 'var(--foreground-secondary)' }}>
          Query lokasi nomor telepon via Telegram Bot
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Query Form */}
        <div 
          className="p-6 rounded-lg border"
          style={{
            backgroundColor: 'var(--background-secondary)',
            borderColor: 'var(--borders-default)'
          }}
        >
          <h2 
            className="text-2xl font-bold mb-6"
            style={{ 
              fontFamily: 'Barlow Condensed, sans-serif',
              color: 'var(--foreground-primary)'
            }}
          >
            Query Form
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label 
                htmlFor="case" 
                className="text-xs uppercase tracking-wide mb-2 block"
                style={{ color: 'var(--foreground-secondary)' }}
              >
                Select Case
              </Label>
              <Select value={selectedCase} onValueChange={setSelectedCase} required>
                <SelectTrigger 
                  data-testid="case-select"
                  style={{
                    backgroundColor: 'var(--background-tertiary)',
                    borderColor: 'var(--borders-default)',
                    color: 'var(--foreground-primary)'
                  }}
                >
                  <SelectValue placeholder="Pilih case" />
                </SelectTrigger>
                <SelectContent
                  style={{
                    backgroundColor: 'var(--background-elevated)',
                    borderColor: 'var(--borders-strong)',
                    color: 'var(--foreground-primary)'
                  }}
                >
                  {cases.map((caseItem) => (
                    <SelectItem 
                      key={caseItem.id} 
                      value={caseItem.id}
                      style={{ color: 'var(--foreground-primary)' }}
                    >
                      {caseItem.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label 
                htmlFor="phone" 
                className="text-xs uppercase tracking-wide mb-2 block"
                style={{ color: 'var(--foreground-secondary)' }}
              >
                Phone Number
              </Label>
              <div className="relative">
                <Phone 
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
                  style={{ color: 'var(--foreground-muted)' }}
                />
                <Input
                  id="phone"
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  data-testid="phone-number-input"
                  className="pl-10 font-mono bg-background-tertiary border-borders-default focus:border-accent-primary"
                  style={{ color: '#000000' }}
                  placeholder="62XXXXXXXXXX"
                  required
                />
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>
                Format: 62 diikuti 9-12 digit
              </p>
            </div>

            <Button
              type="submit"
              disabled={loading || !selectedCase}
              data-testid="query-submit-button"
              className="w-full py-6 font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--background-primary)',
                fontFamily: 'Rajdhani, sans-serif'
              }}
            >
              <Crosshair className="w-5 h-5 mr-2" />
              {loading ? 'PROCESSING...' : 'START QUERY'}
            </Button>
          </form>
        </div>

        {/* Status Feed */}
        <div 
          className="p-6 rounded-lg border"
          style={{
            backgroundColor: 'var(--background-secondary)',
            borderColor: 'var(--borders-default)'
          }}
        >
          <h2 
            className="text-2xl font-bold mb-6"
            style={{ 
              fontFamily: 'Barlow Condensed, sans-serif',
              color: 'var(--foreground-primary)'
            }}
          >
            Status Feed
          </h2>

          {currentTarget ? (
            <div className="space-y-4">
              {/* Current Status */}
              <div 
                className="p-4 rounded-md border flex items-center space-x-3"
                style={{
                  backgroundColor: 'var(--background-tertiary)',
                  borderColor: 'var(--borders-subtle)'
                }}
              >
                {getStatusIcon(currentTarget.status)}
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: 'var(--foreground-primary)' }}>
                    {getStatusMessage(currentTarget.status)}
                  </p>
                  <p className="text-xs font-mono" style={{ color: 'var(--accent-primary)' }}>
                    {currentTarget.phone_number}
                  </p>
                </div>
              </div>

              {/* Result Data */}
              {currentTarget.data && (
                <div 
                  className="p-6 rounded-md border"
                  style={{
                    backgroundColor: 'var(--background-elevated)',
                    borderColor: 'var(--borders-default)'
                  }}
                >
                  <h3 
                    className="text-lg font-bold mb-4"
                    style={{ 
                      fontFamily: 'Barlow Condensed, sans-serif',
                      color: 'var(--status-success)'
                    }}
                  >
                    LOKASI DITEMUKAN
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--foreground-muted)' }}>Nama</p>
                      <p style={{ color: 'var(--foreground-primary)' }}>{currentTarget.data.name}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--foreground-muted)' }}>Alamat</p>
                      <p style={{ color: 'var(--foreground-primary)' }}>{currentTarget.data.address}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--foreground-muted)' }}>Latitude</p>
                        <p className="font-mono" style={{ color: 'var(--accent-primary)' }}>{currentTarget.data.latitude}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--foreground-muted)' }}>Longitude</p>
                        <p className="font-mono" style={{ color: 'var(--accent-primary)' }}>{currentTarget.data.longitude}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <Activity className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--foreground-muted)' }} />
              <p style={{ color: 'var(--foreground-muted)' }}>Belum ada query yang berjalan</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TargetQuery;