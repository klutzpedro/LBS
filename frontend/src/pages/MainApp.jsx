import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTelegram } from '@/context/TelegramContext';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Icon, DivIcon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Shield, 
  LogOut, 
  Settings as SettingsIcon, 
  Plus, 
  Maximize2, 
  Minimize2, 
  Layers,
  FolderOpen,
  Phone,
  MapPin,
  CheckCircle,
  XCircle,
  Activity,
  MessageSquare,
  Search
} from 'lucide-react';
import { toast } from 'sonner';

// Custom marker with label
const createMarkerWithLabel = (phoneNumber, timestamp) => {
  const timeStr = new Date(timestamp).toLocaleString('id-ID', { 
    day: '2-digit', 
    month: 'short', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  return new DivIcon({
    className: 'custom-marker-label',
    html: `
      <div style="position: relative;">
        <div style="
          position: absolute;
          bottom: 40px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--background-elevated);
          border: 2px solid var(--accent-primary);
          border-radius: 8px;
          padding: 4px 8px;
          white-space: nowrap;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: var(--foreground-primary);
          box-shadow: 0 2px 8px rgba(0,0,0,0.5);
        ">
          <div style="color: var(--accent-primary); font-weight: bold;">${phoneNumber}</div>
          <div style="color: var(--foreground-muted); font-size: 9px;">${timeStr}</div>
        </div>
        <svg width="32" height="32" viewBox="0 0 32 32" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
          <circle cx="16" cy="16" r="16" fill="#FF3B5C" fill-opacity="0.2"/>
          <circle cx="16" cy="16" r="8" fill="#FF3B5C"/>
          <circle cx="16" cy="16" r="4" fill="#FFFFFF"/>
        </svg>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -50]
  });
};

const mapTiles = {
  dark: {
    name: 'Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  },
  street: {
    name: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap'
  },
  satellite: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri'
  },
  terrain: {
    name: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap'
  }
};

const MainApp = () => {
  const { username, logout } = useAuth();
  const { telegramAuthorized, telegramUser } = useTelegram();
  const navigate = useNavigate();
  
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [targets, setTargets] = useState([]);
  const [isMaximized, setIsMaximized] = useState(false);
  const [selectedTileLayer, setSelectedTileLayer] = useState('dark');
  
  const [addTargetDialog, setAddTargetDialog] = useState(false);
  const [newCaseDialog, setNewCaseDialog] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');
  const [newPhoneNumber, setNewPhoneNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [selectedTargetForChat, setSelectedTargetForChat] = useState(null);
  const [mapCenter, setMapCenter] = useState([-6.2088, 106.8456]);
  const [mapZoom, setMapZoom] = useState(13);
  const [mapKey, setMapKey] = useState(0);
  const [reghpDialogOpen, setReghpDialogOpen] = useState(false);
  const [selectedReghpTarget, setSelectedReghpTarget] = useState(null);
  const [nikDialogOpen, setNikDialogOpen] = useState(false);
  const [selectedNikData, setSelectedNikData] = useState(null);
  const [searchQuery, setSearchQuery] = useState(''); // Force map re-render

  useEffect(() => {
    fetchCases();
  }, []);

  useEffect(() => {
    if (selectedCase) {
      fetchTargets(selectedCase.id);
      // Set interval to refresh targets
      const interval = setInterval(() => {
        fetchTargets(selectedCase.id);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [selectedCase]);

  useEffect(() => {
    // Monitor target status changes for notifications
    targets.forEach(target => {
      const prevTarget = targets.find(t => t.id === target.id);
      
      if (target.status === 'completed' && prevTarget?.status !== 'completed') {
        toast.success(`✓ Lokasi ${target.phone_number} ditemukan!`);
      }
      
      if (target.status === 'not_found' && prevTarget?.status !== 'not_found') {
        toast.warning(`⚠ Target ${target.phone_number} tidak ditemukan atau sedang OFF`);
      }
      
      if (target.status === 'error' && prevTarget?.status !== 'error') {
        toast.error(`✗ Query gagal untuk ${target.phone_number}`);
      }
    });
  }, [targets]);

  useEffect(() => {
    if (selectedTargetForChat) {
      fetchChatMessages(selectedTargetForChat);
      const interval = setInterval(() => {
        fetchChatMessages(selectedTargetForChat);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [selectedTargetForChat]);

  const fetchCases = async () => {
    try {
      const response = await axios.get(`${API}/cases`);
      const activeCases = response.data.filter(c => c.status === 'active');
      setCases(activeCases);
      if (activeCases.length > 0 && !selectedCase) {
        setSelectedCase(activeCases[0]);
      }
    } catch (error) {
      console.error('Failed to load cases:', error);
    }
  };

  const fetchTargets = async (caseId) => {
    try {
      const response = await axios.get(`${API}/targets?case_id=${caseId}`);
      setTargets(response.data);
    } catch (error) {
      console.error('Failed to load targets:', error);
    }
  };

  const fetchChatMessages = async (targetId) => {
    try {
      const response = await axios.get(`${API}/targets/${targetId}/chat`);
      console.log(`Chat messages for ${targetId}:`, response.data);
      setChatMessages(response.data);
    } catch (error) {
      console.error('Failed to load chat:', error);
    }
  };

  const handleCreateCase = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const response = await axios.post(`${API}/cases`, {
        name: newCaseName,
        description: ''
      });
      toast.success('Case created');
      setNewCaseDialog(false);
      setNewCaseName('');
      fetchCases();
      setSelectedCase(response.data);
    } catch (error) {
      toast.error('Failed to create case');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddTarget = async (e) => {
    e.preventDefault();
    if (!newPhoneNumber.startsWith('62')) {
      toast.error('Nomor harus dimulai dengan 62');
      return;
    }
    
    setSubmitting(true);
    try {
      const response = await axios.post(`${API}/targets`, {
        case_id: selectedCase.id,
        phone_number: newPhoneNumber
      });
      toast.success('Target query dimulai!');
      setAddTargetDialog(false);
      setNewPhoneNumber('');
      fetchTargets(selectedCase.id);
      
      // Set selected target but don't auto-open chat panel
      setSelectedTargetForChat(response.data.id);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add target');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleTargetClick = (target) => {
    setSelectedTargetForChat(target.id);
    
    // If target has location, zoom to it
    if (target.data && target.data.latitude && target.data.longitude) {
      setMapCenter([target.data.latitude, target.data.longitude]);
      setMapZoom(16); // Zoom in closer
      setMapKey(prev => prev + 1); // Force map update
    }
  };

  const hasActiveQueries = targets.some(t => 
    ['pending', 'connecting', 'querying', 'processing', 'parsing'].includes(t.status)
  );

  const handlePendalaman = async (target) => {
    // Optimistic update - langsung set status processing
    const updatedTargets = targets.map(t => 
      t.id === target.id ? { ...t, reghp_status: 'processing' } : t
    );
    setTargets(updatedTargets);
    
    try {
      await axios.post(`${API}/targets/${target.id}/reghp`);
      toast.success('Pendalaman query dimulai!');
      fetchTargets(selectedCase.id);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to start pendalaman');
      fetchTargets(selectedCase.id); // Revert on error
    }
  };

  const handleShowReghpInfo = (target) => {
    setSelectedReghpTarget(target);
    setReghpDialogOpen(true);
  };

  const handleNikPendalaman = async (targetId, nik) => {
    // Optimistic update
    const updatedTargets = targets.map(t => {
      if (t.id === targetId) {
        const nikQueries = { ...(t.nik_queries || {}) };
        nikQueries[nik] = { status: 'processing', data: null };
        return { ...t, nik_queries: nikQueries };
      }
      return t;
    });
    setTargets(updatedTargets);
    
    try {
      await axios.post(`${API}/targets/${targetId}/nik`, { nik });
      toast.success('NIK query dimulai!');
      // Refresh will happen via interval
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to start NIK query');
      fetchTargets(selectedCase.id); // Revert on error
    }
  };

  const handleShowNikInfo = (nikData) => {
    setSelectedNikData(nikData);
    setNikDialogOpen(true);
  };

  // Filter targets based on search query
  const filteredTargets = targets.filter(target => {
    if (!searchQuery) return true;
    
    const query = searchQuery.toLowerCase();
    const phone = target.phone_number.toLowerCase();
    const address = target.data?.address?.toLowerCase() || '';
    const name = target.data?.name?.toLowerCase() || '';
    
    // Search in NIK data
    let nikMatch = false;
    if (target.nik_queries) {
      Object.keys(target.nik_queries).forEach(nik => {
        if (nik.includes(query)) nikMatch = true;
      });
    }
    
    return phone.includes(query) || address.includes(query) || name.includes(query) || nikMatch;
  });

  const center = targets.filter(t => t.data).length > 0
    ? [targets.filter(t => t.data)[0].data.latitude, targets.filter(t => t.data)[0].data.longitude]
    : [-6.2088, 106.8456];

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'var(--status-success)';
      case 'not_found': return 'var(--status-warning)';
      case 'error': return 'var(--status-error)';
      default: return 'var(--status-processing)';
    }
  };

  return (
    <div className={`flex ${isMaximized ? 'fixed inset-0 z-50' : ''}`} style={{ height: '100vh', backgroundColor: 'var(--background-primary)' }}>
      {/* Sidebar - hide when maximized */}
      {!isMaximized && (
        <aside 
          className="w-80 flex flex-col border-r"
          style={{ 
            backgroundColor: 'var(--background-secondary)',
            borderColor: 'var(--borders-default)'
          }}
        >
        {/* Header */}
        <div className="p-4 border-b" style={{ borderColor: 'var(--borders-default)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' }}
              >
                <Shield className="w-6 h-6" style={{ color: 'var(--background-primary)' }} />
              </div>
              <div>
                <h1 
                  className="text-xl font-bold"
                  style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}
                >
                  WASKITA LBS
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => navigate('/settings')}
                data-testid="settings-button"
                title="Settings"
              >
                <SettingsIcon className="w-5 h-5" style={{ color: 'var(--foreground-secondary)' }} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleLogout}
                data-testid="logout-button"
                title="Logout"
              >
                <LogOut className="w-5 h-5" style={{ color: 'var(--status-error)' }} />
              </Button>
            </div>
          </div>

          {/* Telegram Status */}
          <div 
            className="p-3 rounded-lg border text-sm"
            style={{
              backgroundColor: telegramAuthorized ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 184, 0, 0.1)',
              borderColor: telegramAuthorized ? 'var(--status-success)' : 'var(--status-warning)'
            }}
          >
            <div className="flex items-center gap-2">
              <div 
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: telegramAuthorized ? 'var(--status-success)' : 'var(--status-warning)' }}
              />
              <span style={{ color: 'var(--foreground-primary)' }}>
                {telegramAuthorized ? `@${telegramUser?.username}` : 'Telegram disconnected'}
              </span>
            </div>
          </div>
        </div>

        {/* Cases Section */}
        <div className="p-4 border-b" style={{ borderColor: 'var(--borders-default)' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 
              className="text-sm uppercase tracking-wide font-semibold"
              style={{ color: 'var(--foreground-secondary)', fontFamily: 'Rajdhani, sans-serif' }}
            >
              Cases
            </h2>
            <Button
              size="sm"
              onClick={() => setNewCaseDialog(true)}
              data-testid="new-case-button"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--background-primary)'
              }}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="space-y-2">
            {cases.map((caseItem) => (
              <div
                key={caseItem.id}
                onClick={() => setSelectedCase(caseItem)}
                className="p-3 rounded-md border cursor-pointer transition-all"
                style={{
                  backgroundColor: selectedCase?.id === caseItem.id ? 'var(--background-tertiary)' : 'transparent',
                  borderColor: selectedCase?.id === caseItem.id ? 'var(--accent-primary)' : 'var(--borders-subtle)',
                  borderLeftWidth: '3px'
                }}
              >
                <p className="font-semibold text-sm" style={{ color: 'var(--foreground-primary)' }}>
                  {caseItem.name}
                </p>
                <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                  {caseItem.target_count || 0} targets
                </p>
              </div>
            ))}
            {cases.length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: 'var(--foreground-muted)' }}>
                Belum ada case
              </p>
            )}
          </div>
        </div>

        {/* Targets Section */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Search Bar */}
          <div className="mb-3">
            <div className="relative">
              <Search 
                className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
                style={{ color: 'var(--foreground-muted)' }}
              />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search phone, nama, NIK..."
                className="pl-10 bg-background-tertiary border-borders-default text-xs"
                style={{ color: '#000000' }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between mb-3">
            <h2 
              className="text-sm uppercase tracking-wide font-semibold"
              style={{ color: 'var(--foreground-secondary)', fontFamily: 'Rajdhani, sans-serif' }}
            >
              Targets {searchQuery && `(${filteredTargets.length})`}
            </h2>
            {selectedCase && (
              <Button
                size="sm"
                onClick={() => setAddTargetDialog(true)}
                data-testid="add-target-button"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--background-primary)'
                }}
              >
                <Plus className="w-4 h-4" />
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {filteredTargets.map((target) => (
              <div
                key={target.id}
                onClick={() => handleTargetClick(target)}
                className="p-3 rounded-md border cursor-pointer hover:bg-background-elevated transition-all"
                style={{
                  backgroundColor: selectedTargetForChat === target.id ? 'var(--background-elevated)' : 'var(--background-tertiary)',
                  borderColor: 'var(--borders-subtle)',
                  borderLeftWidth: '3px',
                  borderLeftColor: getStatusColor(target.status)
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="font-mono text-xs" style={{ color: 'var(--accent-primary)' }}>
                    {target.phone_number}
                  </p>
                  {target.status === 'completed' ? (
                    <CheckCircle className="w-4 h-4" style={{ color: 'var(--status-success)' }} />
                  ) : target.status === 'not_found' ? (
                    <XCircle className="w-4 h-4" style={{ color: 'var(--status-warning)' }} />
                  ) : target.status === 'error' ? (
                    <XCircle className="w-4 h-4" style={{ color: 'var(--status-error)' }} />
                  ) : (
                    <Activity className="w-4 h-4 animate-pulse" style={{ color: 'var(--status-processing)' }} />
                  )}
                </div>
                {target.data && (
                  <p className="text-xs line-clamp-1" style={{ color: 'var(--foreground-secondary)' }}>\n                    {target.data.address}
                  </p>
                )}
                {target.status === 'not_found' && (
                  <p className="text-xs" style={{ color: 'var(--status-warning)' }}>
                    Target OFF / Tidak ditemukan
                  </p>
                )}
                {target.status === 'error' && (
                  <p className="text-xs" style={{ color: 'var(--status-error)' }}>
                    Error: {target.error}
                  </p>
                )}
                <p className="text-xs uppercase mt-1" style={{ color: 'var(--foreground-muted)' }}>
                  {target.status}
                </p>
              </div>
            ))}
            {!selectedCase && (
              <p className="text-xs text-center py-4" style={{ color: 'var(--foreground-muted)' }}>
                Pilih case terlebih dahulu
              </p>
            )}
            {selectedCase && filteredTargets.length === 0 && searchQuery && (
              <p className="text-xs text-center py-4" style={{ color: 'var(--foreground-muted)' }}>
                Tidak ditemukan untuk "{searchQuery}"
              </p>
            )}
            {selectedCase && filteredTargets.length === 0 && !searchQuery && (
              <p className="text-xs text-center py-4" style={{ color: 'var(--foreground-muted)' }}>
                Belum ada target
              </p>
            )}
          </div>
        </div>
      </aside>
      )}

      {/* Main Map Area */}
      <main className="flex-1 relative flex" style={{ height: '100%' }}>
        {/* Map */}
        <div className={`${showChatPanel ? 'flex-1' : 'w-full'} transition-all duration-300`} style={{ height: '100%' }}>
          {/* Map Controls */}
          <div 
            className="absolute top-4 z-[1000] flex flex-col gap-2"
            style={{ 
              pointerEvents: 'auto',
              right: showChatPanel ? '400px' : '16px',
              transition: 'right 300ms'
            }}
          >
            {/* Map Type - hide when chat panel open */}
            {!showChatPanel && (
              <div 
                className="rounded-lg border p-3"
                style={{
                  backgroundColor: 'var(--background-elevated)',
                  borderColor: 'var(--borders-default)'
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Layers className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                  <span className="text-xs font-semibold uppercase" style={{ color: 'var(--foreground-secondary)' }}>
                    Map Type
                  </span>
                </div>
                <Select value={selectedTileLayer} onValueChange={setSelectedTileLayer}>
                  <SelectTrigger 
                    className="w-32"
                    style={{
                      backgroundColor: 'var(--background-tertiary)',
                      borderColor: 'var(--borders-default)',
                      color: 'var(--foreground-primary)'
                    }}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    style={{
                      backgroundColor: 'var(--background-elevated)',
                      borderColor: 'var(--borders-strong)',
                      color: 'var(--foreground-primary)'
                    }}
                  >
                    {Object.entries(mapTiles).map(([key, tile]) => (
                      <SelectItem key={key} value={key} style={{ color: 'var(--foreground-primary)' }}>
                        {tile.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Maximize - always visible */}
            <Button
              onClick={() => setIsMaximized(!isMaximized)}
              data-testid="maximize-map-button"
              size="icon"
              className="w-10 h-10 border"
              style={{
                backgroundColor: 'var(--background-elevated)',
                borderColor: 'var(--borders-default)',
                color: 'var(--accent-primary)'
              }}
            >
              {isMaximized ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </Button>

            {/* Add Target (Floating) - hide when chat panel open */}
            {selectedCase && !showChatPanel && (
              <Button
                onClick={() => setAddTargetDialog(true)}
                data-testid="floating-add-target"
                className="w-12 h-12 rounded-full shadow-lg"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--background-primary)'
                }}
              >
                <Plus className="w-6 h-6" />
              </Button>
            )}

            {/* Chat History Toggle - hide when panel is open */}
            {!showChatPanel && (
              <div className="relative">
                <Button
                  onClick={() => setShowChatPanel(true)}
                  data-testid="toggle-chat-button"
                  className="w-12 h-12 rounded-full shadow-lg"
                  style={{
                    backgroundColor: 'var(--background-elevated)',
                    color: 'var(--accent-primary)',
                    border: '2px solid var(--accent-primary)'
                  }}
                >
                  <MessageSquare className="w-6 h-6" />
                </Button>
                {/* Red blinking indicator for active queries - positioned on top center */}
                {hasActiveQueries && (
                  <div 
                    className="absolute left-1/2 transform -translate-x-1/2 w-3 h-3 rounded-full animate-pulse"
                    style={{ 
                      top: '-6px',
                      backgroundColor: 'var(--status-error)',
                      boxShadow: '0 0 12px var(--status-error)'
                    }}
                  />
                )}
              </div>
            )}
          </div>
          {targets.filter(t => t.data).length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <MapPin className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--foreground-muted)' }} />
                <p style={{ color: 'var(--foreground-muted)' }}>Belum ada target untuk ditampilkan</p>
                {selectedCase && (
                  <Button
                    onClick={() => setAddTargetDialog(true)}
                    className="mt-4"
                    style={{
                      backgroundColor: 'var(--accent-primary)',
                      color: 'var(--background-primary)'
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Target
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <MapContainer
              key={`${selectedTileLayer}-${mapKey}`}
              center={mapCenter}
              zoom={mapZoom}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                key={selectedTileLayer}
                url={mapTiles[selectedTileLayer].url}
                attribution={mapTiles[selectedTileLayer].attribution}
              />
              {targets.filter(t => t.data && t.data.latitude && t.data.longitude).map((target) => (
                <Marker
                  key={target.id}
                  position={[target.data.latitude, target.data.longitude]}
                  icon={createMarkerWithLabel(target.phone_number, target.data.timestamp || target.created_at)}
                >
                  <Popup>
                    <div className="p-2" style={{ color: 'var(--foreground-primary)', minWidth: '200px' }}>
                      <p className="font-bold mb-1" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                        {target.data.name}
                      </p>
                      <p className="text-xs mb-1 font-mono" style={{ color: 'var(--accent-primary)' }}>
                        {target.phone_number}
                      </p>
                      <p className="text-xs mb-1" style={{ color: 'var(--foreground-secondary)' }}>
                        {target.data.address}
                      </p>
                      <div className="text-xs mt-2">
                        <span style={{ color: 'var(--foreground-muted)' }}>Lat:</span>{' '}
                        <span className="font-mono" style={{ color: 'var(--accent-primary)' }}>
                          {target.data.latitude.toFixed(6)}
                        </span>
                      </div>
                      <div className="text-xs">
                        <span style={{ color: 'var(--foreground-muted)' }}>Long:</span>{' '}
                        <span className="font-mono" style={{ color: 'var(--accent-primary)' }}>
                          {target.data.longitude.toFixed(6)}
                        </span>
                      </div>
                      {target.data.maps_link && (
                        <a
                          href={target.data.maps_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs mt-2 inline-block hover:underline"
                          style={{ color: 'var(--accent-primary)' }}
                        >
                          Open in Google Maps
                        </a>
                      )}
                      
                      {/* Pendalaman / Info Button */}
                      <div className="mt-3 pt-2 border-t" style={{ borderColor: 'var(--borders-subtle)' }}>
                        {target.reghp_status === 'completed' ? (
                          <button
                            onClick={() => handleShowReghpInfo(target)}
                            className="w-full py-2 px-3 rounded text-xs font-semibold uppercase"
                            style={{
                              backgroundColor: 'var(--accent-secondary)',
                              color: 'var(--background-primary)'
                            }}
                          >
                            📋 Info Pendalaman
                          </button>
                        ) : target.reghp_status === 'processing' ? (
                          <div className="text-center py-2">
                            <p className="text-xs" style={{ color: 'var(--status-processing)' }}>
                              ⏳ Pendalaman sedang diproses...
                            </p>
                          </div>
                        ) : (
                          <button
                            onClick={() => handlePendalaman(target)}
                            className="w-full py-2 px-3 rounded text-xs font-semibold uppercase"
                            style={{
                              backgroundColor: 'var(--status-warning)',
                              color: 'var(--background-primary)'
                            }}
                          >
                            🔍 Pendalaman (Reghp)
                          </button>
                        )}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          )}
        </div>

        {/* Chat Panel */}
        {showChatPanel && selectedTargetForChat && (
          <div 
            className="w-96 border-l flex flex-col relative"
            style={{
              backgroundColor: 'var(--background-secondary)',
              borderColor: 'var(--borders-default)'
            }}
          >
            {/* Minimize Button - positioned outside chat panel */}
            <Button
              onClick={() => setShowChatPanel(false)}
              data-testid="minimize-chat-button"
              size="icon"
              className="absolute -left-12 top-4 w-10 h-10 rounded-full shadow-lg z-[1001]"
              style={{
                backgroundColor: 'var(--background-elevated)',
                color: 'var(--accent-primary)',
                border: '2px solid var(--accent-primary)'
              }}
            >
              <Minimize2 className="w-5 h-5" />
            </Button>

            {/* Chat Header */}
            <div 
              className="p-4 border-b"
              style={{ borderColor: 'var(--borders-default)' }}
            >
              <h3 
                className="font-semibold text-sm"
                style={{ 
                  color: 'var(--foreground-primary)',
                  fontFamily: 'Barlow Condensed, sans-serif'
                }}
              >
                CHAT HISTORY
              </h3>
              <p 
                className="text-xs font-mono mt-1"
                style={{ color: 'var(--accent-primary)' }}
              >
                {targets.find(t => t.id === selectedTargetForChat)?.phone_number || 'Select target'}
              </p>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
                    Belum ada chat
                  </p>
                </div>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg ${msg.direction === 'sent' ? 'ml-8' : 'mr-8'}`}
                    style={{
                      backgroundColor: msg.direction === 'sent' 
                        ? 'rgba(0, 217, 255, 0.2)' 
                        : 'var(--background-tertiary)',
                      borderLeft: msg.direction === 'sent' 
                        ? '3px solid var(--accent-primary)' 
                        : '3px solid var(--borders-default)'
                    }}
                  >
                    <p className="text-sm" style={{ color: 'var(--foreground-primary)' }}>
                      {msg.message}
                    </p>
                    {msg.has_buttons && msg.buttons && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {msg.buttons.flat().map((btn, i) => (
                          <span 
                            key={i}
                            className="px-2 py-1 rounded text-xs"
                            style={{
                              backgroundColor: 'rgba(0, 217, 255, 0.1)',
                              color: 'var(--accent-primary)',
                              border: '1px solid var(--accent-primary)'
                            }}
                          >
                            {btn}
                          </span>
                        ))}
                      </div>
                    )}
                    <p 
                      className="text-xs mt-1"
                      style={{ color: 'var(--foreground-muted)' }}
                    >
                      {new Date(msg.timestamp).toLocaleTimeString('id-ID')}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* New Case Dialog */}
      <Dialog open={newCaseDialog} onOpenChange={setNewCaseDialog}>
        <DialogContent 
          className="z-[9999]"
          style={{
            backgroundColor: 'var(--background-elevated)',
            borderColor: 'var(--borders-strong)'
          }}
        >
          <DialogHeader>
            <DialogTitle 
              className="text-2xl font-bold"
              style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}
            >
              New Case
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateCase} className="space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-wide mb-2 block" style={{ color: 'var(--foreground-secondary)' }}>
                Case Name
              </Label>
              <Input
                value={newCaseName}
                onChange={(e) => setNewCaseName(e.target.value)}
                className="bg-background-tertiary border-borders-default"
                style={{ color: '#000000' }}
                placeholder="Enter case name"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full py-6"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--background-primary)',
                fontFamily: 'Rajdhani, sans-serif'
              }}
            >
              {submitting ? 'Creating...' : 'CREATE CASE'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Target Dialog */}
      <Dialog open={addTargetDialog} onOpenChange={setAddTargetDialog}>
        <DialogContent 
          className="z-[9999]"
          style={{
            backgroundColor: 'var(--background-elevated)',
            borderColor: 'var(--borders-strong)'
          }}
        >
          <DialogHeader>
            <DialogTitle 
              className="text-2xl font-bold"
              style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}
            >
              Add Target
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddTarget} className="space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-wide mb-2 block" style={{ color: 'var(--foreground-secondary)' }}>
                Phone Number
              </Label>
              <div className="relative">
                <Phone 
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
                  style={{ color: 'var(--foreground-muted)' }}
                />
                <Input
                  value={newPhoneNumber}
                  onChange={(e) => setNewPhoneNumber(e.target.value)}
                  className="pl-10 font-mono bg-background-tertiary border-borders-default"
                  style={{ color: '#000000' }}
                  placeholder="628123456789"
                  required
                />
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>
                Format: 62 diikuti 9-12 digit
              </p>
            </div>
            
            {!telegramAuthorized && (
              <div 
                className="p-3 rounded border text-xs"
                style={{
                  backgroundColor: 'rgba(255, 184, 0, 0.1)',
                  borderColor: 'var(--status-warning)',
                  color: 'var(--foreground-secondary)'
                }}
              >
                ⚠️ Telegram belum terhubung. Query akan gagal. Setup di Settings.
              </div>
            )}
            
            <Button
              type="submit"
              disabled={submitting}
              className="w-full py-6"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--background-primary)',
                fontFamily: 'Rajdhani, sans-serif'
              }}
            >
              {submitting ? 'Processing...' : 'START QUERY'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reghp Info Dialog */}
      <Dialog open={reghpDialogOpen} onOpenChange={setReghpDialogOpen}>
        <DialogContent 
          className="z-[9999] max-w-2xl max-h-[80vh] overflow-y-auto"
          style={{
            backgroundColor: 'var(--background-elevated)',
            borderColor: 'var(--borders-strong)'
          }}
        >
          <DialogHeader>
            <DialogTitle 
              className="text-2xl font-bold"
              style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}
            >
              INFO PENDALAMAN (REGHP)
            </DialogTitle>
          </DialogHeader>
          {selectedReghpTarget?.reghp_data && (
            <div className="space-y-4 mt-4">
              {/* Phone Number */}
              <div>
                <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--foreground-muted)' }}>
                  Phone Number
                </p>
                <p className="font-mono text-sm" style={{ color: 'var(--accent-primary)' }}>
                  {selectedReghpTarget.phone_number}
                </p>
              </div>

              {/* Parsed Data */}
              {selectedReghpTarget.reghp_data.parsed_data && (
                <div 
                  className="p-4 rounded-lg border"
                  style={{
                    backgroundColor: 'var(--background-tertiary)',
                    borderColor: 'var(--borders-default)'
                  }}
                >
                  <p className="text-sm font-semibold mb-3" style={{ color: 'var(--foreground-primary)' }}>
                    Registration Info
                  </p>
                  <div className="space-y-2">
                    {Object.entries(selectedReghpTarget.reghp_data.parsed_data).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-xs">
                        <span style={{ color: 'var(--foreground-muted)' }}>{key}:</span>
                        <span className="font-mono" style={{ color: 'var(--foreground-primary)' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* NIK Entries with Pendalaman buttons */}
              {selectedReghpTarget.reghp_data.niks && selectedReghpTarget.reghp_data.niks.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--foreground-muted)' }}>
                    NIK Entries ({selectedReghpTarget.reghp_data.niks.length})
                  </p>
                  <div className="space-y-2">
                    {selectedReghpTarget.reghp_data.niks.map((nik) => {
                      const nikQuery = selectedReghpTarget.nik_queries?.[nik];
                      const nikStatus = nikQuery?.status || 'not_started';
                      
                      return (
                        <div 
                          key={nik}
                          className="p-3 rounded-lg border flex items-center justify-between"
                          style={{
                            backgroundColor: 'var(--background-secondary)',
                            borderColor: 'var(--borders-subtle)'
                          }}
                        >
                          <div>
                            <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--foreground-muted)' }}>
                              NIK
                            </p>
                            <p className="font-mono text-sm" style={{ color: 'var(--accent-primary)' }}>
                              {nik}
                            </p>
                          </div>
                          <div>
                            {nikStatus === 'completed' ? (
                              <Button
                                size="sm"
                                onClick={() => handleShowNikInfo(nikQuery.data)}
                                style={{
                                  backgroundColor: 'var(--accent-secondary)',
                                  color: 'var(--background-primary)'
                                }}
                              >
                                📋 Info
                              </Button>
                            ) : nikStatus === 'processing' ? (
                              <div className="text-xs px-3 py-2" style={{ color: 'var(--status-processing)' }}>
                                ⏳ Processing...
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => handleNikPendalaman(selectedReghpTarget.id, nik)}
                                style={{
                                  backgroundColor: 'var(--status-warning)',
                                  color: 'var(--background-primary)'
                                }}
                              >
                                🔍 Pendalaman
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Raw Response */}
              <div>
                <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--foreground-muted)' }}>
                  Raw Response
                </p>
                <div 
                  className="p-3 rounded border font-mono text-xs whitespace-pre-wrap"
                  style={{
                    backgroundColor: 'var(--background-tertiary)',
                    borderColor: 'var(--borders-subtle)',
                    color: 'var(--foreground-secondary)',
                    maxHeight: '300px',
                    overflowY: 'auto'
                  }}
                >
                  {selectedReghpTarget.reghp_data.raw_text}
                </div>
              </div>

              <Button
                onClick={() => setReghpDialogOpen(false)}
                className="w-full py-6"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--background-primary)'
                }}
              >
                CLOSE
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* NIK Info Dialog */}
      <Dialog open={nikDialogOpen} onOpenChange={setNikDialogOpen}>
        <DialogContent 
          className="z-[9999] max-w-3xl max-h-[90vh] overflow-y-auto"
          style={{
            backgroundColor: 'var(--background-elevated)',
            borderColor: 'var(--borders-strong)'
          }}
        >
          <DialogHeader>
            <DialogTitle 
              className="text-2xl font-bold"
              style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}
            >
              INFO PENDALAMAN NIK
            </DialogTitle>
          </DialogHeader>
          {selectedNikData && (
            <div className="space-y-4 mt-4">
              {/* NIK */}
              <div>
                <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--foreground-muted)' }}>
                  NIK
                </p>
                <p className="font-mono text-lg font-bold" style={{ color: 'var(--accent-primary)' }}>
                  {selectedNikData.nik}
                </p>
              </div>

              {/* Photo */}
              {selectedNikData.photo && (
                <div>
                  <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--foreground-muted)' }}>
                    Foto KTP
                  </p>
                  <div 
                    className="rounded-lg border overflow-hidden"
                    style={{ borderColor: 'var(--borders-default)' }}
                  >
                    <img 
                      src={selectedNikData.photo} 
                      alt="KTP" 
                      className="w-full"
                      style={{ maxHeight: '400px', objectFit: 'contain', backgroundColor: 'var(--background-tertiary)' }}
                    />
                  </div>
                </div>
              )}

              {/* Parsed Data - Format Tabel Rapi */}
              {selectedNikData.parsed_data && Object.keys(selectedNikData.parsed_data).length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-3" style={{ color: 'var(--foreground-primary)', fontFamily: 'Barlow Condensed, sans-serif' }}>
                    DATA DIRI LENGKAP
                  </p>
                  <div 
                    className="rounded-lg border overflow-hidden"
                    style={{
                      backgroundColor: 'var(--background-tertiary)',
                      borderColor: 'var(--borders-default)'
                    }}
                  >
                    <table className="w-full">
                      <tbody>
                        {Object.entries(selectedNikData.parsed_data).map(([key, value], idx) => (
                          <tr 
                            key={idx}
                            className="border-b"
                            style={{ borderColor: 'var(--borders-subtle)' }}
                          >
                            <td 
                              className="p-3 text-sm font-medium"
                              style={{ 
                                color: 'var(--foreground-secondary)',
                                width: '40%',
                                backgroundColor: 'rgba(0, 217, 255, 0.05)'
                              }}
                            >
                              {key}
                            </td>
                            <td 
                              className="p-3 text-sm"
                              style={{ color: 'var(--foreground-primary)' }}
                            >
                              {value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <Button
                onClick={() => setNikDialogOpen(false)}
                className="w-full py-6"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--background-primary)'
                }}
              >
                CLOSE
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MainApp;