import { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { Clock, Search, Filter, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Icon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { toast } from 'sonner';

const customIcon = new Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSIxNiIgZmlsbD0iI0ZGM0I1QyIgZmlsbC1vcGFjaXR5PSIwLjIiLz48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSI4IiBmaWxsPSIjRkYzQjVDIi8+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iNCIgZmlsbD0iI0ZGRkZGRiIvPjwvc3ZnPg==',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16]
});

const History = () => {
  const [targets, setTargets] = useState([]);
  const [filteredTargets, setFilteredTargets] = useState([]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [caseFilter, setCaseFilter] = useState('all');
  const [mapDialogOpen, setMapDialogOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    filterTargets();
  }, [targets, searchQuery, statusFilter, caseFilter]);

  const fetchData = async () => {
    try {
      const [targetsRes, casesRes] = await Promise.all([
        axios.get(`${API}/targets`),
        axios.get(`${API}/cases`)
      ]);

      setTargets(targetsRes.data);
      setCases(casesRes.data);
    } catch (error) {
      toast.error('Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const filterTargets = () => {
    let filtered = [...targets];

    if (searchQuery) {
      filtered = filtered.filter(t => 
        t.phone_number.includes(searchQuery) ||
        t.data?.name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(t => t.status === statusFilter);
    }

    if (caseFilter !== 'all') {
      filtered = filtered.filter(t => t.case_id === caseFilter);
    }

    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    setFilteredTargets(filtered);
  };

  const getCaseName = (caseId) => {
    const caseItem = cases.find(c => c.id === caseId);
    return caseItem ? caseItem.name : 'Unknown';
  };

  const handleViewMap = (target) => {
    if (target.data && target.data.latitude && target.data.longitude) {
      setSelectedTarget(target);
      setMapDialogOpen(true);
    } else {
      toast.error('Lokasi tidak tersedia untuk target ini');
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
          HISTORY
        </h1>
        <p style={{ color: 'var(--foreground-secondary)' }}>
          Riwayat query dan tracking
        </p>
      </div>

      {/* Filters */}
      <div 
        className="p-6 rounded-lg border mb-6"
        style={{
          backgroundColor: 'var(--background-secondary)',
          borderColor: 'var(--borders-default)'
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search 
              className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
              style={{ color: 'var(--foreground-muted)' }}
            />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="search-input"
              placeholder="Search phone or name..."
              className="pl-10 bg-background-tertiary border-borders-default"
              style={{ color: 'var(--foreground-primary)' }}
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger 
              style={{
                backgroundColor: 'var(--background-tertiary)',
                borderColor: 'var(--borders-default)',
                color: 'var(--foreground-primary)'
              }}
            >
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent
              style={{
                backgroundColor: 'var(--background-elevated)',
                borderColor: 'var(--borders-strong)',
                color: 'var(--foreground-primary)'
              }}
            >
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>

          <Select value={caseFilter} onValueChange={setCaseFilter}>
            <SelectTrigger 
              style={{
                backgroundColor: 'var(--background-tertiary)',
                borderColor: 'var(--borders-default)',
                color: 'var(--foreground-primary)'
              }}
            >
              <SelectValue placeholder="Filter by case" />
            </SelectTrigger>
            <SelectContent
              style={{
                backgroundColor: 'var(--background-elevated)',
                borderColor: 'var(--borders-strong)',
                color: 'var(--foreground-primary)'
              }}
            >
              <SelectItem value="all">All Cases</SelectItem>
              {cases.map((caseItem) => (
                <SelectItem key={caseItem.id} value={caseItem.id}>
                  {caseItem.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* History Table */}
      {filteredTargets.length === 0 ? (
        <div 
          className="text-center py-20 rounded-lg border"
          style={{
            backgroundColor: 'var(--background-secondary)',
            borderColor: 'var(--borders-default)'
          }}
        >
          <Clock className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--foreground-muted)' }} />
          <p style={{ color: 'var(--foreground-muted)' }}>Tidak ada data yang ditemukan</p>
        </div>
      ) : (
        <div 
          className="rounded-lg border overflow-hidden"
          style={{
            backgroundColor: 'var(--background-secondary)',
            borderColor: 'var(--borders-default)'
          }}
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead 
                className="border-b"
                style={{ 
                  backgroundColor: 'var(--background-tertiary)',
                  borderColor: 'var(--borders-default)'
                }}
              >
                <tr>
                  <th 
                    className="text-left p-4 text-xs uppercase tracking-wide font-semibold"
                    style={{ 
                      color: 'var(--foreground-secondary)',
                      fontFamily: 'Rajdhani, sans-serif'
                    }}
                  >
                    Timestamp
                  </th>
                  <th 
                    className="text-left p-4 text-xs uppercase tracking-wide font-semibold"
                    style={{ 
                      color: 'var(--foreground-secondary)',
                      fontFamily: 'Rajdhani, sans-serif'
                    }}
                  >
                    Case
                  </th>
                  <th 
                    className="text-left p-4 text-xs uppercase tracking-wide font-semibold"
                    style={{ 
                      color: 'var(--foreground-secondary)',
                      fontFamily: 'Rajdhani, sans-serif'
                    }}
                  >
                    Phone Number
                  </th>
                  <th 
                    className="text-left p-4 text-xs uppercase tracking-wide font-semibold"
                    style={{ 
                      color: 'var(--foreground-secondary)',
                      fontFamily: 'Rajdhani, sans-serif'
                    }}
                  >
                    Status
                  </th>
                  <th 
                    className="text-left p-4 text-xs uppercase tracking-wide font-semibold"
                    style={{ 
                      color: 'var(--foreground-secondary)',
                      fontFamily: 'Rajdhani, sans-serif'
                    }}
                  >
                    Location
                  </th>
                  <th 
                    className="text-left p-4 text-xs uppercase tracking-wide font-semibold"
                    style={{ 
                      color: 'var(--foreground-secondary)',
                      fontFamily: 'Rajdhani, sans-serif'
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTargets.map((target) => (
                  <tr
                    key={target.id}
                    data-testid={`history-row-${target.id}`}
                    className="border-b hover:bg-background-elevated transition-colors"
                    style={{ borderColor: 'var(--borders-subtle)' }}
                  >
                    <td className="p-4 text-sm" style={{ color: 'var(--foreground-primary)' }}>
                      {new Date(target.created_at).toLocaleString('id-ID')}
                    </td>
                    <td className="p-4 text-sm" style={{ color: 'var(--foreground-primary)' }}>
                      {getCaseName(target.case_id)}
                    </td>
                    <td className="p-4 text-sm font-mono" style={{ color: 'var(--accent-primary)' }}>
                      {target.phone_number}
                    </td>
                    <td className="p-4">
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
                    </td>
                    <td className="p-4 text-sm" style={{ color: 'var(--foreground-secondary)' }}>
                      {target.data ? (
                        <span className="font-mono">
                          {target.data.latitude?.toFixed(4)}, {target.data.longitude?.toFixed(4)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="p-4">
                      {target.data && target.data.latitude && target.data.longitude && (
                        <Button
                          size="sm"
                          onClick={() => handleViewMap(target)}
                          data-testid={`view-map-${target.id}`}
                          style={{
                            backgroundColor: 'var(--accent-primary)',
                            color: 'var(--background-primary)'
                          }}
                        >
                          <MapPin className="w-4 h-4 mr-1" />
                          View Map
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Map Dialog */}
      <Dialog open={mapDialogOpen} onOpenChange={setMapDialogOpen}>
        <DialogContent 
          className="max-w-4xl h-[600px]"
          style={{
            backgroundColor: 'var(--background-elevated)',
            borderColor: 'var(--borders-strong)'
          }}
        >
          <DialogHeader>
            <DialogTitle 
              className="text-2xl font-bold"
              style={{ 
                fontFamily: 'Barlow Condensed, sans-serif',
                color: 'var(--foreground-primary)'
              }}
            >
              Location: {selectedTarget?.data?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedTarget && (
            <div className="h-full w-full rounded-lg overflow-hidden border" style={{ borderColor: 'var(--borders-default)' }}>
              <MapContainer
                center={[selectedTarget.data.latitude, selectedTarget.data.longitude]}
                zoom={15}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />
                <Marker
                  position={[selectedTarget.data.latitude, selectedTarget.data.longitude]}
                  icon={customIcon}
                >
                  <Popup>
                    <div className="p-2" style={{ color: 'var(--foreground-primary)' }}>
                      <h3 
                        className="font-bold mb-2"
                        style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
                      >
                        {selectedTarget.data.name}
                      </h3>
                      <p className="text-xs mb-1">
                        <span style={{ color: 'var(--foreground-muted)' }}>Phone:</span>{' '}
                        <span className="font-mono" style={{ color: 'var(--accent-primary)' }}>
                          {selectedTarget.phone_number}
                        </span>
                      </p>
                      <p className="text-xs mb-1">
                        <span style={{ color: 'var(--foreground-muted)' }}>Address:</span>{' '}
                        {selectedTarget.data.address}
                      </p>
                      <p className="text-xs">
                        <span style={{ color: 'var(--foreground-muted)' }}>Coordinates:</span>{' '}
                        <span className="font-mono" style={{ color: 'var(--accent-primary)' }}>
                          {selectedTarget.data.latitude.toFixed(6)}, {selectedTarget.data.longitude.toFixed(6)}
                        </span>
                      </p>
                    </div>
                  </Popup>
                </Marker>
              </MapContainer>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default History;