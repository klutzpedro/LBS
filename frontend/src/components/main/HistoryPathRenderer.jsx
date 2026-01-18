import React from 'react';
import { Circle, Polyline, Marker } from 'react-leaflet';
import L from 'leaflet';

/**
 * Renders history paths for multiple targets on the map
 * Shows polylines connecting historical positions with timestamps
 */
export const HistoryPathRenderer = ({ 
  activeHistoryTargets = [], 
  historyPaths = {}, 
  targets = [] 
}) => {
  // Different colors for different targets
  const colors = ['#FFB800', '#00BFFF', '#FF69B4', '#00FF7F', '#FF6347'];

  const formatTime = (ts) => {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <>
      {activeHistoryTargets.map((targetId, targetIdx) => {
        const historyPath = historyPaths[targetId] || [];
        if (historyPath.length === 0) return null;
        
        const pathColor = colors[targetIdx % colors.length];
        
        // Find target info for display and get current location
        const targetInfo = targets.find(t => t.id === targetId);
        
        // Get target's current location to identify the newest point
        const currentLat = targetInfo?.data?.latitude || targetInfo?.location?.coordinates?.[1];
        const currentLng = targetInfo?.data?.longitude || targetInfo?.location?.coordinates?.[0];
        
        return (
          <React.Fragment key={`history-path-${targetId}`}>
            {/* Path line */}
            {historyPath.length > 1 && (
              <Polyline
                positions={historyPath.map(p => [p.lat, p.lng])}
                pathOptions={{
                  color: pathColor,
                  weight: 3,
                  opacity: 0.8,
                  dashArray: '10, 10'
                }}
              />
            )}
            
            {/* History points */}
            {historyPath.map((pos, idx) => {
              // Check if this point matches target's CURRENT location (that's the newest)
              const isAtCurrentLocation = currentLat && currentLng && 
                Math.abs(pos.lat - currentLat) < 0.0001 && 
                Math.abs(pos.lng - currentLng) < 0.0001;
              
              // Only mark as newest if it matches current location
              const isNewest = isAtCurrentLocation;
              const isOldest = !isNewest && idx === historyPath.length - 1;
              const pointColor = isNewest ? '#FF3B5C' : pathColor;
              
              return (
                <React.Fragment key={`history-point-${targetId}-${idx}`}>
                  {/* Circle marker for the point */}
                  <Circle
                    center={[pos.lat, pos.lng]}
                    radius={isNewest ? 8 : 4}
                    pathOptions={{
                      color: pointColor,
                      fillColor: pointColor,
                      fillOpacity: 1,
                      weight: isNewest ? 2 : 1
                    }}
                  >
                    <HistoryPointPopup 
                      isNewest={isNewest}
                      isOldest={isOldest}
                      idx={idx}
                      pos={pos}
                      pointColor={pointColor}
                      formatTime={formatTime}
                    />
                  </Circle>
                  
                  {/* Arrow + Timestamp - ONLY on older points (NOT newest) */}
                  {!isNewest && historyPath.length > 1 && (
                    <Marker
                      position={[pos.lat, pos.lng]}
                      icon={L.divIcon({
                        className: 'history-label-arrow',
                        html: `<div style="
                          display: flex;
                          flex-direction: column;
                          align-items: center;
                          transform: translate(-50%, -32px);
                        ">
                          <div style="
                            background: rgba(0,0,0,0.75);
                            color: ${pathColor};
                            padding: 1px 4px;
                            border-radius: 2px;
                            font-size: 8px;
                            font-weight: 500;
                            white-space: nowrap;
                            margin-bottom: 1px;
                          ">${formatTime(pos.timestamp)}</div>
                          <div style="
                            width: 0;
                            height: 0;
                            border-left: 4px solid transparent;
                            border-right: 4px solid transparent;
                            border-top: 6px solid ${pathColor};
                          "></div>
                        </div>`,
                        iconSize: [0, 0],
                        iconAnchor: [0, 0]
                      })}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </React.Fragment>
        );
      })}
    </>
  );
};

// Separate component for popup to keep code clean
const HistoryPointPopup = ({ isNewest, isOldest, idx, pos, pointColor, formatTime }) => {
  const { Popup } = require('react-leaflet');
  
  return (
    <Popup>
      <div className="p-2 text-center">
        <p className="font-bold text-sm" style={{ color: pointColor }}>
          {isNewest ? `📍 TERBARU` : isOldest ? `🏁 AWAL` : `📌 Titik ${idx}`}
        </p>
        <p className="text-xs">{formatTime(pos.timestamp)}</p>
        <p className="text-xs font-mono">{pos.lat?.toFixed(5)}, {pos.lng?.toFixed(5)}</p>
      </div>
    </Popup>
  );
};

export default HistoryPathRenderer;
