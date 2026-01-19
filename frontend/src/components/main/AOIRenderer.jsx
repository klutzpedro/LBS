import React from 'react';
import { Polygon, Circle, Popup } from 'react-leaflet';

// Default colors for AOI types (used when no custom color is set)
const DEFAULT_POLYGON_COLOR = '#00D9FF';
const DEFAULT_CIRCLE_COLOR = '#FFB800';
const ALERT_COLOR = '#FF3B5C';

/**
 * Renders Areas of Interest (AOI) on the map
 * Supports both polygon and circle types with alert highlighting
 * Uses custom colors from database if available
 */
export const AOIRenderer = ({ aois = [], aoiAlerts = [] }) => {
  return (
    <>
      {aois.filter(aoi => aoi.is_visible).map(aoi => {
        // Check if any monitored target is inside this AOI
        const hasAlert = aoiAlerts.some(alert => 
          alert.aoi_id === aoi.id && !alert.acknowledged
        );
        
        // Use custom color from AOI, or fall back to default based on type
        const aoiColor = aoi.color || (aoi.aoi_type === 'polygon' ? DEFAULT_POLYGON_COLOR : DEFAULT_CIRCLE_COLOR);
        // Use alert color when there's an active alert
        const displayColor = hasAlert ? ALERT_COLOR : aoiColor;
        
        if (aoi.aoi_type === 'polygon' && aoi.coordinates?.length >= 3) {
          return (
            <Polygon
              key={aoi.id}
              positions={aoi.coordinates}
              pathOptions={{
                color: displayColor,
                fillColor: displayColor,
                fillOpacity: hasAlert ? 0.4 : 0.2,
                weight: 2
              }}
            >
              <AOIPopup aoi={aoi} aoiColor={aoiColor} />
            </Polygon>
          );
        } else if (aoi.aoi_type === 'circle' && aoi.coordinates?.length >= 2) {
          return (
            <Circle
              key={aoi.id}
              center={aoi.coordinates}
              radius={aoi.radius || 500}
              pathOptions={{
                color: displayColor,
                fillColor: displayColor,
                fillOpacity: hasAlert ? 0.4 : 0.2,
                weight: 2
              }}
            >
              <AOIPopup aoi={aoi} isCircle aoiColor={aoiColor} />
            </Circle>
          );
        }
        return null;
      })}
    </>
  );
};

// Reusable popup component for AOIs
const AOIPopup = ({ aoi, isCircle = false, aoiColor }) => (
  <Popup>
    <div className="p-2">
      <div className="flex items-center gap-2 mb-1">
        <div 
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: aoiColor }}
        />
        <p className="font-bold">{aoi.name}</p>
      </div>
      {isCircle && <p className="text-xs">Radius: {aoi.radius}m</p>}
      <p className="text-xs">Monitoring: {aoi.monitored_targets?.length || 0} target(s)</p>
      <p className="text-xs">Alarm: {aoi.alarm_enabled ? 'ON' : 'OFF'}</p>
    </div>
  </Popup>
);

export default AOIRenderer;
