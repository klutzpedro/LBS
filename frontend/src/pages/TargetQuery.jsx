import { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { useTelegram } from '@/context/TelegramContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Crosshair, Phone, Activity, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const TargetQuery = () => {
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentTarget, setCurrentTarget] = useState(null);
  const [statusPolling, setStatusPolling] = useState(null);
  const { telegramAuthorized } = useTelegram();
  
  // Manual mode fields
  const [manualMode, setManualMode] = useState(false);
  const [manualData, setManualData] = useState({
    name: '',
    address: '',
    latitude: '',
    longitude: ''
  });

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
      const payload = {
        case_id: selectedCase,
        phone_number: phoneNumber
      };

      // If manual mode, include manual data
      if (manualMode) {
        payload.manual_mode = true;
        payload.manual_data = {
          name: manualData.name || 'Target User',
          phone_number: phoneNumber,
          address: manualData.address || 'Manual Entry',
          latitude: parseFloat(manualData.latitude),
          longitude: parseFloat(manualData.longitude),
          additional_phones: [phoneNumber],
          timestamp: new Date().toISOString(),
          note: 'Manual entry - Telegram bot not used'
        };
      }

      const response = await axios.post(`${API}/targets`, payload);

      setCurrentTarget(response.data);
      
      if (manualMode) {
        toast.success('Target berhasil ditambahkan (mode manual)');
        setLoading(false);
        // Refresh to show completed status
        setTimeout(() => {
          checkTargetStatus(response.data.id);
        }, 1000);
      } else {
        toast.success('Target query dimulai!');
        startStatusPolling(response.data.id);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create target');
      setLoading(false);
    }
  };

  const checkTargetStatus = async (targetId) => {
    try {
      const response = await axios.get(`${API}/targets/${targetId}/status`);
      setCurrentTarget(prev => ({ ...prev, status: response.data.status, data: response.data.data }));
    } catch (error) {
      console.error('Failed to check status:', error);
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

      {/* Telegram Warning */}
      {!telegramAuthorized && (
        <div 
          className="p-4 rounded-lg border mb-6 flex items-start gap-3"
          style={{
            backgroundColor: 'rgba(255, 184, 0, 0.1)',
            borderColor: 'var(--status-warning)'
          }}
        >
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--status-warning)' }} />
          <div className="flex-1 text-sm">
            <p className="font-semibold mb-1" style={{ color: 'var(--foreground-primary)' }}>
              Telegram Bot Belum Terhubung
            </p>
            <p style={{ color: 'var(--foreground-secondary)' }}>
              Mode manual diaktifkan. Anda perlu input data lokasi secara manual. Untuk mengaktifkan bot automation, setup Telegram di menu Settings.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Query Form */}
        <div 
          className="p-6 rounded-lg border"
          style={{
            backgroundColor: 'var(--background-secondary)',
            borderColor: 'var(--borders-default)'
          }}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 
              className="text-2xl font-bold"
              style={{ 
                fontFamily: 'Barlow Condensed, sans-serif',
                color: 'var(--foreground-primary)'
              }}
            >
              Query Form
            </h2>
            
            {!telegramAuthorized && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-status-warning animate-pulse" />
                <span className="text-xs uppercase" style={{ color: 'var(--status-warning)' }}>
                  Manual Mode
                </span>
              </div>
            )}
          </div>

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

            {/* Manual Mode Fields */}
            {!telegramAuthorized && (
              <div 
                className="p-4 rounded-lg border space-y-4"
                style={{
                  backgroundColor: 'var(--background-tertiary)',
                  borderColor: 'var(--borders-subtle)'
                }}
              >
                <p className="text-xs font-semibold uppercase" style={{ color: 'var(--accent-primary)' }}>
                  Input Data Manual
                </p>

                <div>
                  <Label className="text-xs mb-1 block" style={{ color: 'var(--foreground-secondary)' }}>
                    Nama Target
                  </Label>
                  <Input
                    value={manualData.name}
                    onChange={(e) => setManualData({ ...manualData, name: e.target.value })}
                    className="bg-background-secondary border-borders-default"
                    style={{ color: '#000000' }}
                    placeholder="Nama pemilik nomor"
                  />
                </div>

                <div>
                  <Label className="text-xs mb-1 block" style={{ color: 'var(--foreground-secondary)' }}>
                    Alamat
                  </Label>
                  <Textarea
                    value={manualData.address}
                    onChange={(e) => setManualData({ ...manualData, address: e.target.value })}
                    className="bg-background-secondary border-borders-default min-h-[60px]"
                    style={{ color: '#000000' }}
                    placeholder="Alamat lengkap"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1 block" style={{ color: 'var(--foreground-secondary)' }}>
                      Latitude
                    </Label>
                    <Input
                      type="number"
                      step="any"
                      value={manualData.latitude}
                      onChange={(e) => setManualData({ ...manualData, latitude: e.target.value })}
                      className="bg-background-secondary border-borders-default font-mono"
                      style={{ color: '#000000' }}
                      placeholder="-6.2088"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block" style={{ color: 'var(--foreground-secondary)' }}>
                      Longitude
                    </Label>
                    <Input
                      type="number"
                      step="any"
                      value={manualData.longitude}
                      onChange={(e) => setManualData({ ...manualData, longitude: e.target.value })}
                      className="bg-background-secondary border-borders-default font-mono"
                      style={{ color: '#000000' }}
                      placeholder="106.8456"
                      required
                    />
                  </div>
                </div>

                <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                  💡 Tip: Gunakan Google Maps untuk mendapatkan koordinat. Click kanan di peta → Salin koordinat.
                </p>
              </div>
            )}

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
              {loading ? 'PROCESSING...' : telegramAuthorized ? 'START QUERY' : 'ADD TARGET (MANUAL)'}
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
                    {currentTarget.data.note && (
                      <div 
                        className="p-3 rounded mt-3"
                        style={{ backgroundColor: 'rgba(0, 217, 255, 0.1)' }}
                      >
                        <p className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
                          📝 {currentTarget.data.note}
                        </p>
                      </div>
                    )}
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
