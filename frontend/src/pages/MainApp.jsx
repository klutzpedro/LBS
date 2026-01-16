import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTelegram } from '@/context/TelegramContext';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Icon } from 'leaflet';
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
  Activity
} from 'lucide-react';
import { toast } from 'sonner';

const customIcon = new Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSIxNiIgZmlsbD0iI0ZGM0I1QyIgZmlsbC1vcGFjaXR5PSIwLjIiLz48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSI4IiBmaWxsPSIjRkYzQjVDIi8+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iNCIgZmlsbD0iI0ZGRkZGRiIvPjwvc3ZnPg==',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16]
});

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
      
      // Show chat panel for this target
      setSelectedTargetForChat(response.data.id);
      setShowChatPanel(true);
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

  const center = targets.filter(t => t.data).length > 0
    ? [targets.filter(t => t.data)[0].data.latitude, targets.filter(t => t.data)[0].data.longitude]
    : [-6.2088, 106.8456];

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'var(--status-success)';
      case 'error': return 'var(--status-error)';
      default: return 'var(--status-processing)';
    }
  };

  return (
    <div className="flex h-screen" style={{ backgroundColor: 'var(--background-primary)' }}>
      {/* Sidebar */}
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
          <div className="flex items-center justify-between mb-3">
            <h2 
              className="text-sm uppercase tracking-wide font-semibold"
              style={{ color: 'var(--foreground-secondary)', fontFamily: 'Rajdhani, sans-serif' }}
            >
              Targets
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
            {targets.map((target) => (
              <div
                key={target.id}
                onClick={() => {
                  setSelectedTargetForChat(target.id);
                  setShowChatPanel(true);
                }}
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
                  ) : target.status === 'error' ? (
                    <XCircle className="w-4 h-4" style={{ color: 'var(--status-error)' }} />
                  ) : (
                    <Activity className="w-4 h-4 animate-pulse" style={{ color: 'var(--status-processing)' }} />
                  )}
                </div>
                {target.data && (
                  <p className="text-xs line-clamp-1" style={{ color: 'var(--foreground-secondary)' }}>
                    {target.data.address}
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
            {selectedCase && targets.length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: 'var(--foreground-muted)' }}>
                Belum ada target
              </p>
            )}
          </div>
        </div>
      </aside>

      {/* Main Map Area */}
      <main className="flex-1 relative flex">
        {/* Map */}
        <div className={`${showChatPanel ? 'flex-1' : 'w-full'} h-full transition-all duration-300`}>
          {/* Map Controls */}
          <div 
            className="absolute top-4 right-4 z-[1000] flex flex-col gap-2"
            style={{ pointerEvents: 'auto' }}
          >
            {/* Map Type */}
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

            {/* Maximize */}
            <Button
              onClick={() => setIsMaximized(!isMaximized)}
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

            {/* Add Target (Floating) */}
            {selectedCase && (
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
              key={selectedTileLayer}
              center={center}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                key={selectedTileLayer}
                url={mapTiles[selectedTileLayer].url}
                attribution={mapTiles[selectedTileLayer].attribution}
              />
              {targets.filter(t => t.data).map((target) => (
                <Marker
                  key={target.id}
                  position={[target.data.latitude, target.data.longitude]}
                  icon={customIcon}
                >
                  <Popup>
                    <div className="p-2" style={{ color: 'var(--foreground-primary)' }}>
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
            className="w-96 border-l flex flex-col"
            style={{
              backgroundColor: 'var(--background-secondary)',
              borderColor: 'var(--borders-default)'
            }}
          >
            {/* Chat Header */}
            <div 
              className="p-4 border-b flex items-center justify-between"
              style={{ borderColor: 'var(--borders-default)' }}
            >
              <div>
                <h3 
                  className="font-semibold"
                  style={{ color: 'var(--foreground-primary)' }}
                >
                  Chat History
                </h3>
                <p 
                  className="text-xs font-mono"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  {targets.find(t => t.id === selectedTargetForChat)?.phone_number}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setShowChatPanel(false)}
              >
                <XCircle className="w-5 h-5" style={{ color: 'var(--foreground-secondary)' }} />
              </Button>
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
    </div>
  );
};

export default MainApp;