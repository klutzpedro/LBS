import { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Icon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Map as MapIcon, MapPin, Maximize2, Minimize2, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  },
  street: {
    name: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },
  satellite: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri'
  },
  terrain: {
    name: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
  }
};

const MapView = () => {
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMaximized, setIsMaximized] = useState(false);
  const [selectedTileLayer, setSelectedTileLayer] = useState('dark');

  useEffect(() => {
    fetchTargets();
  }, []);

  const fetchTargets = async () => {
    try {
      const response = await axios.get(`${API}/targets`);
      const completedTargets = response.data.filter(t => t.status === 'completed' && t.data);
      setTargets(completedTargets);
    } catch (error) {
      toast.error('Failed to load targets');
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

  const center = targets.length > 0
    ? [targets[0].data.latitude, targets[0].data.longitude]
    : [-6.2088, 106.8456];

  const MapControls = () => {
    return (
      <div 
        className="absolute top-4 right-4 z-[1000] flex flex-col gap-2"
        style={{ pointerEvents: 'auto' }}
      >
        {/* Map Type Selector */}
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
                <SelectItem 
                  key={key} 
                  value={key}
                  style={{ color: 'var(--foreground-primary)' }}
                >
                  {tile.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Maximize Button */}
        <Button
          onClick={() => setIsMaximized(!isMaximized)}
          data-testid="maximize-map-button"
          size="icon"
          style={{
            backgroundColor: 'var(--background-elevated)',
            borderColor: 'var(--borders-default)',
            color: 'var(--accent-primary)'
          }}
          className="w-10 h-10 border"
        >
          {isMaximized ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </Button>
      </div>
    );
  };

  const MapContent = () => (
    <>
      {/* Header - only show when not maximized */}
      {!isMaximized && (
        <div className="mb-6">
          <h1 
            className="text-5xl font-bold mb-2"
            style={{ 
              fontFamily: 'Barlow Condensed, sans-serif',
              color: 'var(--foreground-primary)'
            }}
          >
            MAP VIEW
          </h1>
          <p style={{ color: 'var(--foreground-secondary)' }}>
            Visualisasi lokasi target di peta
          </p>
        </div>
      )}

      {/* Map Container */}
      {targets.length === 0 ? (
        <div 
          className="flex-1 rounded-lg border flex items-center justify-center"
          style={{
            backgroundColor: 'var(--background-secondary)',
            borderColor: 'var(--borders-default)',
            height: isMaximized ? '100vh' : 'calc(100vh - 200px)'
          }}
        >
          <div className="text-center">
            <MapIcon className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--foreground-muted)' }} />
            <p style={{ color: 'var(--foreground-muted)' }}>Belum ada lokasi untuk ditampilkan</p>
          </div>
        </div>
      ) : (
        <div 
          className="rounded-lg overflow-hidden border relative"
          data-testid="map-container"
          style={{ 
            borderColor: 'var(--borders-default)',
            height: isMaximized ? '100vh' : 'calc(100vh - 200px)'
          }}
        >
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
            {targets.map((target) => (
              <Marker
                key={target.id}
                position={[target.data.latitude, target.data.longitude]}
                icon={customIcon}
              >
                <Popup>
                  <div className="p-2" style={{ color: 'var(--foreground-primary)' }}>
                    <h3 
                      className="font-bold mb-2"
                      style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
                    >
                      {target.data.name}
                    </h3>
                    <p className="text-xs mb-1">
                      <span style={{ color: 'var(--foreground-muted)' }}>Phone:</span>{' '}
                      <span className="font-mono" style={{ color: 'var(--accent-primary)' }}>
                        {target.phone_number}
                      </span>
                    </p>
                    <p className="text-xs mb-1">
                      <span style={{ color: 'var(--foreground-muted)' }}>Address:</span>{' '}
                      {target.data.address}
                    </p>
                    <p className="text-xs">
                      <span style={{ color: 'var(--foreground-muted)' }}>Coordinates:</span>{' '}
                      <span className="font-mono" style={{ color: 'var(--accent-primary)' }}>
                        {target.data.latitude.toFixed(6)}, {target.data.longitude.toFixed(6)}
                      </span>
                    </p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
          <MapControls />
        </div>
      )}
    </>
  );

  if (isMaximized) {
    return (
      <div 
        className="fixed inset-0 z-50"
        style={{ backgroundColor: 'var(--background-primary)' }}
      >
        <MapContent />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 h-full flex flex-col" style={{ backgroundColor: 'var(--background-primary)' }}>
      <MapContent />
    </div>
  );
};

export default MapView;