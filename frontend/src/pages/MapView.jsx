import { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Icon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Map as MapIcon, MapPin } from 'lucide-react';
import { toast } from 'sonner';

const customIcon = new Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSIxNiIgZmlsbD0iI0ZGM0I1QyIgZmlsbC1vcGFjaXR5PSIwLjIiLz48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSI4IiBmaWxsPSIjRkYzQjVDIi8+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iNCIgZmlsbD0iI0ZGRkZGRiIvPjwvc3ZnPg==',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16]
});

const MapView = () => {
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="p-6 md:p-8 h-full flex flex-col" style={{ backgroundColor: 'var(--background-primary)' }}>
      {/* Header */}
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

      {/* Map Container */}
      {targets.length === 0 ? (
        <div 
          className="flex-1 rounded-lg border flex items-center justify-center"
          style={{
            backgroundColor: 'var(--background-secondary)',
            borderColor: 'var(--borders-default)'
          }}
        >
          <div className="text-center">
            <MapIcon className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--foreground-muted)' }} />
            <p style={{ color: 'var(--foreground-muted)' }}>Belum ada lokasi untuk ditampilkan</p>
          </div>
        </div>
      ) : (
        <div 
          className="flex-1 rounded-lg overflow-hidden border"
          data-testid="map-container"
          style={{ borderColor: 'var(--borders-default)' }}
        >
          <MapContainer
            center={center}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
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
        </div>
      )}
    </div>
  );
};

export default MapView;