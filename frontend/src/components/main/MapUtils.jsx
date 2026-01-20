import { DivIcon } from 'leaflet';

// Calculate scale factor based on zoom level
// Zoom 5-7: very small (0.3-0.5), Zoom 8-10: small (0.5-0.7), Zoom 11-13: medium (0.7-0.9), Zoom 14+: full size (1.0)
const getScaleFactor = (zoom) => {
  if (zoom <= 5) return 0;      // Hidden at very low zoom
  if (zoom <= 6) return 0.25;
  if (zoom <= 7) return 0.35;
  if (zoom <= 8) return 0.45;
  if (zoom <= 9) return 0.55;
  if (zoom <= 10) return 0.65;
  if (zoom <= 11) return 0.75;
  if (zoom <= 12) return 0.85;
  if (zoom <= 13) return 0.92;
  return 1.0;  // Full size at zoom 14+
};

// Check if label should be shown based on zoom
const shouldShowLabel = (zoom) => zoom >= 8;
const shouldShowSelector = (zoom) => zoom >= 9;

// Custom marker with label - original design with zoom scaling
export const createMarkerWithLabel = (phoneNumber, timestamp, name, showName, zoom = 14) => {
  const scale = getScaleFactor(zoom);
  const showLabel = shouldShowLabel(zoom);
  
  // If scale is 0, return minimal marker
  if (scale === 0) {
    return new DivIcon({
      className: 'custom-marker-minimal',
      html: `<div style="width: 8px; height: 8px; background: #FF3B5C; border-radius: 50%; border: 1px solid white;"></div>`,
      iconSize: [8, 8],
      iconAnchor: [4, 4],
      popupAnchor: [0, -4]
    });
  }
  
  const timeStr = new Date(timestamp).toLocaleString('id-ID', { 
    day: '2-digit', 
    month: 'short', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  const nameDisplay = showName && name ? `<div style="color: var(--foreground-primary); font-size: ${11 * scale}px; margin-bottom: 2px;">${name}</div>` : '';
  
  const markerSize = Math.round(32 * scale);
  const labelHtml = showLabel ? `
    <div style="
      position: absolute;
      bottom: ${40 * scale}px;
      left: 50%;
      transform: translateX(-50%) scale(${scale});
      transform-origin: bottom center;
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
  ` : '';
  
  return new DivIcon({
    className: 'custom-marker-label',
    html: `
      <div style="position: relative;">
        ${labelHtml}
        <svg width="${markerSize}" height="${markerSize}" viewBox="0 0 32 32" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
          <circle cx="16" cy="16" r="16" fill="#FF3B5C" fill-opacity="0.2"/>
          <circle cx="16" cy="16" r="8" fill="#FF3B5C"/>
          <circle cx="16" cy="16" r="4" fill="#FFFFFF"/>
        </svg>
      </div>
    `,
    iconSize: [markerSize, markerSize],
    iconAnchor: [markerSize / 2, markerSize / 2],
    popupAnchor: [0, showLabel ? -50 * scale : -10]
  });
};

// Marker with label AND number selector below (for grouped targets) - with zoom scaling
export const createMarkerWithSelector = (phoneNumber, timestamp, name, showName, totalCount, selectedIndex, positionKey, zoom = 14) => {
  const scale = getScaleFactor(zoom);
  const showLabel = shouldShowLabel(zoom);
  const showSelector = shouldShowSelector(zoom);
  
  // If scale is 0, return minimal marker
  if (scale === 0) {
    return new DivIcon({
      className: 'custom-marker-minimal',
      html: `<div style="width: 10px; height: 10px; background: #FF3B5C; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
      iconSize: [10, 10],
      iconAnchor: [5, 5],
      popupAnchor: [0, -5]
    });
  }
  
  const timeStr = new Date(timestamp).toLocaleString('id-ID', { 
    day: '2-digit', 
    month: 'short', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  const nameDisplay = showName && name ? `<div style="color: var(--foreground-primary); font-size: ${11 * scale}px; margin-bottom: 2px;">${name}</div>` : '';
  
  // Create number buttons with scaled size
  const btnSize = Math.round(20 * scale);
  const numberButtons = Array.from({ length: totalCount }, (_, i) => {
    const isSelected = i === selectedIndex;
    return `<button 
      class="target-selector-btn" 
      data-pos="${positionKey}" 
      data-idx="${i}"
      style="
        width: ${btnSize}px;
        height: ${btnSize}px;
        border-radius: 50%;
        background: ${isSelected ? '#00D9FF' : '#2A2A2A'};
        color: ${isSelected ? '#121212' : '#FFFFFF'};
        border: ${isSelected ? '2px solid #00FF88' : '1px solid #555'};
        font-size: ${Math.round(10 * scale)}px;
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
  
  const markerSize = Math.round(32 * scale);
  
  // Build HTML based on what should be shown
  const labelHtml = showLabel ? `
    <div style="
      background: var(--background-elevated);
      border: 2px solid var(--accent-primary);
      border-radius: ${8 * scale}px;
      padding: ${4 * scale}px ${8 * scale}px;
      white-space: nowrap;
      font-family: 'JetBrains Mono', monospace;
      font-size: ${10 * scale}px;
      color: var(--foreground-primary);
      box-shadow: 0 2px 8px rgba(0,0,0,0.5);
      margin-bottom: ${6 * scale}px;
    ">
      ${nameDisplay}
      <div style="color: var(--accent-primary); font-weight: bold;">${phoneNumber}</div>
      <div style="color: var(--foreground-muted); font-size: ${9 * scale}px;">${timeStr}</div>
    </div>
  ` : '';
  
  const selectorHtml = showSelector ? `
    <div style="
      display: flex;
      gap: ${3 * scale}px;
      margin-top: ${4 * scale}px;
      padding: ${4 * scale}px ${6 * scale}px;
      background: rgba(18, 18, 18, 0.95);
      border-radius: ${14 * scale}px;
      border: 1px solid #444;
      box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    ">
      ${numberButtons}
    </div>
  ` : '';
  
  return new DivIcon({
    className: 'custom-marker-with-selector',
    html: `
      <div style="display: flex; flex-direction: column; align-items: center;">
        ${labelHtml}
        
        <!-- RED DOT MARKER - Center position, clearly visible -->
        <svg width="${markerSize}" height="${markerSize}" viewBox="0 0 32 32" style="filter: drop-shadow(0 2px 6px rgba(0,0,0,0.5)); margin: ${4 * scale}px 0;">
          <circle cx="16" cy="16" r="14" fill="#FF3B5C" fill-opacity="0.25"/>
          <circle cx="16" cy="16" r="10" fill="#FF3B5C"/>
          <circle cx="16" cy="16" r="4" fill="#FFFFFF"/>
        </svg>
        
        ${selectorHtml}
      </div>
    `,
    iconSize: [Math.round(100 * scale), Math.round(120 * scale)],
    iconAnchor: [Math.round(50 * scale), Math.round(60 * scale)],
    popupAnchor: [0, Math.round(-60 * scale)]
  });
};

// Blinking marker for AOI alerts - with zoom scaling
export const createBlinkingMarker = (phoneNumber, timestamp, name, showName, zoom = 14) => {
  const scale = getScaleFactor(zoom);
  const showLabel = shouldShowLabel(zoom);
  
  // Minimal marker at very low zoom
  if (scale === 0) {
    return new DivIcon({
      className: 'custom-marker-minimal blinking-marker',
      html: `
        <style>
          @keyframes blink-alert { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
          .blink-dot { animation: blink-alert 0.5s ease-in-out infinite; }
        </style>
        <div class="blink-dot" style="width: 12px; height: 12px; background: #FF3B5C; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 8px #FF3B5C;"></div>
      `,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
      popupAnchor: [0, -6]
    });
  }
  
  const timeStr = new Date(timestamp).toLocaleString('id-ID', { 
    day: '2-digit', 
    month: 'short', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  const nameDisplay = showName && name ? `<div style="color: #FFFFFF; font-size: ${11 * scale}px; margin-bottom: 2px;">${name}</div>` : '';
  const markerSize = Math.round(48 * scale);
  
  const labelHtml = showLabel ? `
    <div style="
      position: absolute;
      bottom: ${50 * scale}px;
      left: 50%;
      transform: translateX(-50%) scale(${scale});
      transform-origin: bottom center;
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
  ` : '';
  
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
        ${labelHtml}
        <svg width="${markerSize}" height="${markerSize}" viewBox="0 0 48 48" style="filter: drop-shadow(0 0 15px rgba(255, 59, 92, 0.9));">
          <circle cx="24" cy="24" r="24" fill="#FF3B5C" fill-opacity="0.4"/>
          <circle cx="24" cy="24" r="16" fill="#FF3B5C" fill-opacity="0.7"/>
          <circle cx="24" cy="24" r="10" fill="#FF3B5C"/>
          <circle cx="24" cy="24" r="5" fill="#FFFFFF"/>
        </svg>
      </div>
    `,
    iconSize: [markerSize, markerSize],
    iconAnchor: [markerSize / 2, markerSize / 2],
    popupAnchor: [0, showLabel ? Math.round(-60 * scale) : -10]
  });
};

// Blinking marker with selector for grouped AOI alerts - with zoom scaling
export const createBlinkingMarkerWithSelector = (phoneNumber, timestamp, name, showName, totalCount, selectedIndex, positionKey, zoom = 14) => {
  const scale = getScaleFactor(zoom);
  const showLabel = shouldShowLabel(zoom);
  const showSelector = shouldShowSelector(zoom);
  
  // Minimal marker at very low zoom
  if (scale === 0) {
    return new DivIcon({
      className: 'custom-marker-minimal blinking-marker',
      html: `
        <style>
          @keyframes blink-alert { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
          .blink-dot { animation: blink-alert 0.5s ease-in-out infinite; }
        </style>
        <div class="blink-dot" style="width: 12px; height: 12px; background: #FF3B5C; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 8px #FF3B5C;"></div>
      `,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
      popupAnchor: [0, -6]
    });
  }
  
  const timeStr = new Date(timestamp).toLocaleString('id-ID', { 
    day: '2-digit', 
    month: 'short', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  const nameDisplay = showName && name ? `<div style="color: #FFFFFF; font-size: ${11 * scale}px; margin-bottom: 2px;">${name}</div>` : '';
  
  // Create number buttons with scaled size
  const btnSize = Math.round(20 * scale);
  const numberButtons = Array.from({ length: totalCount }, (_, i) => {
    const isSelected = i === selectedIndex;
    return `<button 
      class="target-selector-btn" 
      data-pos="${positionKey}" 
      data-idx="${i}"
      style="
        width: ${btnSize}px;
        height: ${btnSize}px;
        border-radius: 50%;
        background: ${isSelected ? '#00D9FF' : '#2A2A2A'};
        color: ${isSelected ? '#121212' : '#FFFFFF'};
        border: ${isSelected ? '2px solid #00FF88' : '1px solid #555'};
        font-size: ${Math.round(10 * scale)}px;
        font-weight: bold;
        cursor: pointer;
        font-family: 'JetBrains Mono', monospace;
      "
    >${i + 1}</button>`;
  }).join('');
  
  const markerSize = Math.round(40 * scale);
  
  const labelHtml = showLabel ? `
    <div style="
      background: #FF3B5C;
      border: 3px solid #FFFFFF;
      border-radius: ${8 * scale}px;
      padding: ${6 * scale}px ${10 * scale}px;
      white-space: nowrap;
      font-family: 'JetBrains Mono', monospace;
      font-size: ${11 * scale}px;
      color: #FFFFFF;
      box-shadow: 0 0 20px rgba(255, 59, 92, 0.8), 0 4px 12px rgba(0,0,0,0.5);
      margin-bottom: ${6 * scale}px;
    ">
      ${nameDisplay}
      <div style="font-weight: bold;">⚠️ ${phoneNumber}</div>
      <div style="font-size: ${9 * scale}px; opacity: 0.9;">ALERT: Dalam AOI</div>
    </div>
  ` : '';
  
  const selectorHtml = showSelector ? `
    <div style="
      display: flex;
      gap: ${3 * scale}px;
      margin-top: ${4 * scale}px;
      padding: ${4 * scale}px ${6 * scale}px;
      background: rgba(18, 18, 18, 0.95);
      border-radius: ${14 * scale}px;
      border: 1px solid #444;
      box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    ">
      ${numberButtons}
    </div>
  ` : '';
  
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
        ${labelHtml}
        
        <!-- RED DOT MARKER - Center position, clearly visible -->
        <svg width="${markerSize}" height="${markerSize}" viewBox="0 0 40 40" style="filter: drop-shadow(0 0 15px rgba(255, 59, 92, 0.9)); margin: ${4 * scale}px 0;">
          <circle cx="20" cy="20" r="18" fill="#FF3B5C" fill-opacity="0.4"/>
          <circle cx="20" cy="20" r="12" fill="#FF3B5C"/>
          <circle cx="20" cy="20" r="5" fill="#FFFFFF"/>
        </svg>
        
        ${selectorHtml}
      </div>
    `,
    iconSize: [Math.round(120 * scale), Math.round(140 * scale)],
    iconAnchor: [Math.round(60 * scale), Math.round(70 * scale)],
    popupAnchor: [0, Math.round(-70 * scale)]
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
