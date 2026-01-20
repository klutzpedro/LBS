import { DivIcon } from 'leaflet';

// Custom marker with label - original design
export const createMarkerWithLabel = (phoneNumber, timestamp, name, showName) => {
  const timeStr = new Date(timestamp).toLocaleString('id-ID', { 
    day: '2-digit', 
    month: 'short', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  const nameDisplay = showName && name ? `<div style="color: var(--foreground-primary); font-size: 11px; margin-bottom: 2px;">${name}</div>` : '';
  
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
          ${nameDisplay}
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

// Marker with label AND number selector below (for grouped targets)
export const createMarkerWithSelector = (phoneNumber, timestamp, name, showName, totalCount, selectedIndex, positionKey) => {
  const timeStr = new Date(timestamp).toLocaleString('id-ID', { 
    day: '2-digit', 
    month: 'short', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  const nameDisplay = showName && name ? `<div style="color: var(--foreground-primary); font-size: 11px; margin-bottom: 2px;">${name}</div>` : '';
  
  // Create number buttons
  const numberButtons = Array.from({ length: totalCount }, (_, i) => {
    const isSelected = i === selectedIndex;
    return `<button 
      class="target-selector-btn" 
      data-pos="${positionKey}" 
      data-idx="${i}"
      style="
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: ${isSelected ? '#00D9FF' : '#2A2A2A'};
        color: ${isSelected ? '#121212' : '#FFFFFF'};
        border: ${isSelected ? '2px solid #00FF88' : '1px solid #555'};
        font-size: 10px;
        font-weight: bold;
        cursor: pointer;
        font-family: 'JetBrains Mono', monospace;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s;
      "
    >${i + 1}</button>`;
  }).join('');
  
  return new DivIcon({
    className: 'custom-marker-with-selector',
    html: `
      <div style="display: flex; flex-direction: column; align-items: center;">
        <!-- Label above (Info) -->
        <div style="
          background: var(--background-elevated);
          border: 2px solid var(--accent-primary);
          border-radius: 8px;
          padding: 4px 8px;
          white-space: nowrap;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: var(--foreground-primary);
          box-shadow: 0 2px 8px rgba(0,0,0,0.5);
          margin-bottom: 6px;
        ">
          ${nameDisplay}
          <div style="color: var(--accent-primary); font-weight: bold;">${phoneNumber}</div>
          <div style="color: var(--foreground-muted); font-size: 9px;">${timeStr}</div>
        </div>
        
        <!-- RED DOT MARKER - Center position, clearly visible -->
        <svg width="32" height="32" viewBox="0 0 32 32" style="filter: drop-shadow(0 2px 6px rgba(0,0,0,0.5)); margin: 4px 0;">
          <circle cx="16" cy="16" r="14" fill="#FF3B5C" fill-opacity="0.25"/>
          <circle cx="16" cy="16" r="10" fill="#FF3B5C"/>
          <circle cx="16" cy="16" r="4" fill="#FFFFFF"/>
        </svg>
        
        <!-- Number selector below marker (1, 2, 3, etc) -->
        <div style="
          display: flex;
          gap: 3px;
          margin-top: 4px;
          padding: 4px 6px;
          background: rgba(18, 18, 18, 0.95);
          border-radius: 14px;
          border: 1px solid #444;
          box-shadow: 0 2px 8px rgba(0,0,0,0.5);
        ">
          ${numberButtons}
        </div>
      </div>
    `,
    iconSize: [100, 120],
    iconAnchor: [50, 60],
    popupAnchor: [0, -60]
  });
};

// Blinking marker for AOI alerts
export const createBlinkingMarker = (phoneNumber, timestamp, name, showName) => {
  const timeStr = new Date(timestamp).toLocaleString('id-ID', { 
    day: '2-digit', 
    month: 'short', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  const nameDisplay = showName && name ? `<div style="color: #FFFFFF; font-size: 11px; margin-bottom: 2px;">${name}</div>` : '';
  
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
          bottom: 50px;
          left: 50%;
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
        ">
          ${nameDisplay}
          <div style="font-weight: bold;">⚠️ ${phoneNumber}</div>
          <div style="font-size: 9px; opacity: 0.9;">ALERT: Dalam AOI</div>
        </div>
        <svg width="48" height="48" viewBox="0 0 48 48" style="filter: drop-shadow(0 0 15px rgba(255, 59, 92, 0.9));">
          <circle cx="24" cy="24" r="24" fill="#FF3B5C" fill-opacity="0.4"/>
          <circle cx="24" cy="24" r="16" fill="#FF3B5C" fill-opacity="0.7"/>
          <circle cx="24" cy="24" r="10" fill="#FF3B5C"/>
          <circle cx="24" cy="24" r="5" fill="#FFFFFF"/>
        </svg>
      </div>
    `,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -60]
  });
};

// Blinking marker with selector for grouped AOI alerts
export const createBlinkingMarkerWithSelector = (phoneNumber, timestamp, name, showName, totalCount, selectedIndex, positionKey) => {
  const timeStr = new Date(timestamp).toLocaleString('id-ID', { 
    day: '2-digit', 
    month: 'short', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  const nameDisplay = showName && name ? `<div style="color: #FFFFFF; font-size: 11px; margin-bottom: 2px;">${name}</div>` : '';
  
  // Create number buttons
  const numberButtons = Array.from({ length: totalCount }, (_, i) => {
    const isSelected = i === selectedIndex;
    return `<button 
      class="target-selector-btn" 
      data-pos="${positionKey}" 
      data-idx="${i}"
      style="
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: ${isSelected ? '#00D9FF' : '#2A2A2A'};
        color: ${isSelected ? '#121212' : '#FFFFFF'};
        border: ${isSelected ? '2px solid #00FF88' : '1px solid #555'};
        font-size: 10px;
        font-weight: bold;
        cursor: pointer;
        font-family: 'JetBrains Mono', monospace;
      "
    >${i + 1}</button>`;
  }).join('');
  
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
      <div style="display: flex; flex-direction: column; align-items: center;" class="blinking-marker-inner">
        <!-- Alert Label above -->
        <div style="
          background: #FF3B5C;
          border: 3px solid #FFFFFF;
          border-radius: 8px;
          padding: 6px 10px;
          white-space: nowrap;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          color: #FFFFFF;
          box-shadow: 0 0 20px rgba(255, 59, 92, 0.8), 0 4px 12px rgba(0,0,0,0.5);
          margin-bottom: 6px;
        ">
          ${nameDisplay}
          <div style="font-weight: bold;">⚠️ ${phoneNumber}</div>
          <div style="font-size: 9px; opacity: 0.9;">ALERT: Dalam AOI</div>
        </div>
        
        <!-- RED DOT MARKER - Center position, clearly visible -->
        <svg width="40" height="40" viewBox="0 0 40 40" style="filter: drop-shadow(0 0 15px rgba(255, 59, 92, 0.9)); margin: 4px 0;">
          <circle cx="20" cy="20" r="18" fill="#FF3B5C" fill-opacity="0.4"/>
          <circle cx="20" cy="20" r="12" fill="#FF3B5C"/>
          <circle cx="20" cy="20" r="5" fill="#FFFFFF"/>
        </svg>
        
        <!-- Number selector below -->
        <div style="
          display: flex;
          gap: 3px;
          margin-top: 4px;
          padding: 4px 6px;
          background: rgba(18, 18, 18, 0.95);
          border-radius: 14px;
          border: 1px solid #444;
          box-shadow: 0 2px 8px rgba(0,0,0,0.5);
        ">
          ${numberButtons}
        </div>
      </div>
    `,
    iconSize: [120, 140],
    iconAnchor: [60, 70],
    popupAnchor: [0, -70]
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
