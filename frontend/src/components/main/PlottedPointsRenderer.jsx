import React, { useRef } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Star, Flag, Home, Building, Navigation, Eye, EyeOff, Edit2, Trash2 } from 'lucide-react';

// Create custom icon for plotted points
const createPlottedIcon = (icon, color) => {
  // SVG icon based on type
  const getIconSvg = () => {
    const iconColor = '#ffffff';
    
    switch (icon) {
      case 'star':
        return `<path fill="${iconColor}" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>`;
      case 'flag':
        return `<path fill="${iconColor}" d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z"/>`;
      case 'home':
        return `<path fill="${iconColor}" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>`;
      case 'building':
        return `<path fill="${iconColor}" d="M17 11V3H7v4H3v14h8v-4h2v4h8V11h-4zM7 19H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V9h2v2zm4 4H9v-2h2v2zm0-4H9V9h2v2zm0-4H9V5h2v2zm4 8h-2v-2h2v2zm0-4h-2V9h2v2zm0-4h-2V5h2v2zm4 12h-2v-2h2v2zm0-4h-2v-2h2v2z"/>`;
      case 'navigation':
        return `<path fill="${iconColor}" d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>`;
      case 'pin':
      default:
        return `<path fill="${iconColor}" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>`;
    }
  };

  const svgIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
      <circle cx="12" cy="12" r="12" fill="${color}"/>
      <g transform="translate(4, 4) scale(0.667)">
        ${getIconSvg()}
      </g>
    </svg>
  `;

  return L.divIcon({
    html: `
      <div style="
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
      ">
        ${svgIcon}
      </div>
    `,
    className: 'plotted-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
};

/**
 * Component to render plotted points on the map
 */
export const PlottedPointsRenderer = ({
  plottedPoints,
  currentUsername,
  onEdit,
  onDelete,
  onToggleVisibility,
  onPointClick
}) => {
  // Only render visible points
  const visiblePoints = plottedPoints.filter(point => point.is_visible);

  return (
    <>
      {visiblePoints.map((point) => {
        const isOwner = point.created_by === currentUsername;
        
        return (
          <Marker
            key={point.id}
            position={[point.latitude, point.longitude]}
            icon={createPlottedIcon(point.icon || 'pin', point.color || '#FF5733')}
            eventHandlers={{
              click: () => onPointClick && onPointClick(point)
            }}
          >
            <Popup>
              <div 
                className="min-w-[200px]"
                style={{ 
                  fontFamily: 'Inter, sans-serif'
                }}
              >
                {/* Header */}
                <div 
                  className="flex items-center gap-2 pb-2 mb-2 border-b"
                  style={{ borderColor: '#e5e7eb' }}
                >
                  <div 
                    className="w-8 h-8 rounded flex items-center justify-center"
                    style={{ backgroundColor: point.color || '#FF5733' }}
                  >
                    {point.icon === 'star' && <Star className="w-4 h-4 text-white" />}
                    {point.icon === 'flag' && <Flag className="w-4 h-4 text-white" />}
                    {point.icon === 'home' && <Home className="w-4 h-4 text-white" />}
                    {point.icon === 'building' && <Building className="w-4 h-4 text-white" />}
                    {point.icon === 'navigation' && <Navigation className="w-4 h-4 text-white" />}
                    {(!point.icon || point.icon === 'pin') && <MapPin className="w-4 h-4 text-white" />}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{point.name}</p>
                    <p className="text-xs text-gray-500">oleh: {point.created_by}</p>
                  </div>
                </div>
                
                {/* Coordinates */}
                <div className="mb-3">
                  <p className="text-xs text-gray-500">Koordinat</p>
                  <p className="text-sm font-mono text-gray-700">
                    {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}
                  </p>
                </div>
                
                {/* Actions - Only for Owner */}
                {isOwner && (
                  <div className="flex gap-2 pt-2 border-t" style={{ borderColor: '#e5e7eb' }}>
                    <button
                      onClick={() => onToggleVisibility && onToggleVisibility(point)}
                      className="flex-1 py-1.5 px-2 rounded text-xs flex items-center justify-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700"
                    >
                      {point.is_visible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {point.is_visible ? 'Sembunyikan' : 'Tampilkan'}
                    </button>
                    <button
                      onClick={() => onEdit && onEdit(point)}
                      className="flex-1 py-1.5 px-2 rounded text-xs flex items-center justify-center gap-1 bg-blue-100 hover:bg-blue-200 text-blue-700"
                    >
                      <Edit2 className="w-3 h-3" />
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete && onDelete(point)}
                      className="flex-1 py-1.5 px-2 rounded text-xs flex items-center justify-center gap-1 bg-red-100 hover:bg-red-200 text-red-700"
                    >
                      <Trash2 className="w-3 h-3" />
                      Hapus
                    </button>
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
};

export default PlottedPointsRenderer;
