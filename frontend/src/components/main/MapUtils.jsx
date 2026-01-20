import { DivIcon } from 'leaflet';

// Custom marker with label - now supports offset for overlapping markers
export const createMarkerWithLabel = (phoneNumber, timestamp, name, showName, offsetIndex = 0, totalAtPosition = 1) => {
  const timeStr = new Date(timestamp).toLocaleString('id-ID', { 
    day: '2-digit', 
    month: 'short', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  const nameDisplay = showName && name ? `<div style="color: var(--foreground-primary); font-size: 11px; margin-bottom: 2px;">${name}</div>` : '';
  
  // Calculate offset for overlapping markers
  // Stack labels vertically with 55px spacing
  const verticalOffset = 40 + (offsetIndex * 55);
  
  // Add horizontal stagger for better visibility if more than 2
  const horizontalOffset = totalAtPosition > 2 ? (offsetIndex % 2 === 0 ? -30 : 30) : 0;
  
  // Different border colors for each marker at same position
  const borderColors = ['#00D9FF', '#00FF88', '#FFB800', '#FF3B5C', '#A855F7', '#EC4899'];
  const borderColor = borderColors[offsetIndex % borderColors.length];
  
  // Show position indicator if multiple at same location
  const positionIndicator = totalAtPosition > 1 ? 
    `<div style="position: absolute; top: -8px; right: -8px; background: ${borderColor}; color: #121212; font-size: 9px; font-weight: bold; width: 16px; height: 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">${offsetIndex + 1}</div>` : '';
  
  return new DivIcon({
    className: 'custom-marker-label',
    html: `
      <div style="position: relative;">
        <div style="
          position: absolute;
          bottom: ${verticalOffset}px;
          left: calc(50% + ${horizontalOffset}px);
          transform: translateX(-50%);
          background: var(--background-elevated);
          border: 2px solid ${borderColor};
          border-radius: 8px;
          padding: 4px 8px;
          white-space: nowrap;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: var(--foreground-primary);
          box-shadow: 0 2px 8px rgba(0,0,0,0.5);
          z-index: ${1000 + offsetIndex};
        ">
          ${positionIndicator}
          ${nameDisplay}
          <div style="color: ${borderColor}; font-weight: bold;">${phoneNumber}</div>
          <div style="color: var(--foreground-muted); font-size: 9px;">${timeStr}</div>
        </div>
        ${offsetIndex === 0 ? `
        <svg width="32" height="32" viewBox="0 0 32 32" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
          <circle cx="16" cy="16" r="16" fill="#FF3B5C" fill-opacity="0.2"/>
          <circle cx="16" cy="16" r="8" fill="#FF3B5C"/>
          <circle cx="16" cy="16" r="4" fill="#FFFFFF"/>
          ${totalAtPosition > 1 ? `<text x="16" y="20" text-anchor="middle" fill="#FFFFFF" font-size="10" font-weight="bold">${totalAtPosition}</text>` : ''}
        </svg>
        ` : ''}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -verticalOffset - 10]
  });
};

// Blinking marker for AOI alerts - animated with CSS, supports offset
export const createBlinkingMarker = (phoneNumber, timestamp, name, showName, offsetIndex = 0, totalAtPosition = 1) => {
  const timeStr = new Date(timestamp).toLocaleString('id-ID', { 
    day: '2-digit', 
    month: 'short', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  const nameDisplay = showName && name ? `<div style="color: #FFFFFF; font-size: 11px; margin-bottom: 2px;">${name}</div>` : '';
  
  // Calculate offset for overlapping markers
  const verticalOffset = 50 + (offsetIndex * 60);
  const horizontalOffset = totalAtPosition > 2 ? (offsetIndex % 2 === 0 ? -30 : 30) : 0;
  
  // Position indicator
  const positionIndicator = totalAtPosition > 1 ? 
    `<div style="position: absolute; top: -8px; right: -8px; background: #FFFFFF; color: #FF3B5C; font-size: 9px; font-weight: bold; width: 16px; height: 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">${offsetIndex + 1}</div>` : '';
  
  return new DivIcon({
    className: 'custom-marker-label blinking-marker',
    html: `
      <style>
        @keyframes blink-alert {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(1.2); }
        }
        .blinking-marker-inner {
          animation: blink-alert 0.5s ease-in-out infinite;
        }
      </style>
      <div style="position: relative;" class="blinking-marker-inner">
        <div style="
          position: absolute;
          bottom: ${verticalOffset}px;
          left: calc(50% + ${horizontalOffset}px);
          transform: translateX(-50%);
          background: #FF3B5C;
          border: 3px solid #FFFFFF;
          border-radius: 8px;
          padding: 6px 10px;
          white-space: nowrap;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          color: #FFFFFF;
          box-shadow: 0 0 20px rgba(255, 59, 92, 0.8), 0 4px 12px rgba(0,0,0,0.5);
          z-index: ${1000 + offsetIndex};
        ">
          ${positionIndicator}
          ${nameDisplay}
          <div style="font-weight: bold;">⚠️ ${phoneNumber}</div>
          <div style="font-size: 9px; opacity: 0.9;">ALERT: Dalam AOI</div>
        </div>
        ${offsetIndex === 0 ? `
        <svg width="48" height="48" viewBox="0 0 48 48" style="filter: drop-shadow(0 0 15px rgba(255, 59, 92, 0.9));">
          <circle cx="24" cy="24" r="24" fill="#FF3B5C" fill-opacity="0.4"/>
          <circle cx="24" cy="24" r="16" fill="#FF3B5C" fill-opacity="0.7"/>
          <circle cx="24" cy="24" r="10" fill="#FF3B5C"/>
          <circle cx="24" cy="24" r="5" fill="#FFFFFF"/>
          ${totalAtPosition > 1 ? `<text x="24" y="28" text-anchor="middle" fill="#FFFFFF" font-size="12" font-weight="bold">${totalAtPosition}</text>` : ''}
        </svg>
        ` : ''}
      </div>
    `,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -verticalOffset - 10]
  });
};

// Helper function to group targets by position
export const groupTargetsByPosition = (targets) => {
  const groups = {};
  
  targets.forEach(target => {
    if (target.data && target.data.latitude && target.data.longitude) {
      // Round to 5 decimal places (about 1 meter precision)
      const key = `${target.data.latitude.toFixed(5)}_${target.data.longitude.toFixed(5)}`;
      
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(target);
    }
  });
  
  return groups;
};

// Map tile configurations
export const mapTiles = {
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
  },
  light: {
    name: 'Light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  },
  voyager: {
    name: 'Voyager',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  }
};
