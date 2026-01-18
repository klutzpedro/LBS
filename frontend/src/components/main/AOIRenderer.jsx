import React from 'react';
import { Polygon, Circle, Popup } from 'react-leaflet';

/**
 * Renders Areas of Interest (AOI) on the map
 * Supports both polygon and circle types with alert highlighting
 */
export const AOIRenderer = ({ aois = [], aoiAlerts = [] }) => {
  return (
    <>
      {aois.filter(aoi => aoi.is_visible).map(aoi => {
        // Check if any monitored target is inside this AOI
        const hasAlert = aoiAlerts.some(alert => 
          alert.aoi_id === aoi.id && !alert.acknowledged
        );
        
        if (aoi.aoi_type === 'polygon' && aoi.coordinates?.length >= 3) {
          return (
            <Polygon
              key={aoi.id}
              positions={aoi.coordinates}
              pathOptions={{
                color: hasAlert ? '#FF3B5C' : '#00D9FF',
                fillColor: hasAlert ? '#FF3B5C' : '#00D9FF',
                fillOpacity: hasAlert ? 0.4 : 0.2,
                weight: 2
              }}
            >
              <AOIPopup aoi={aoi} />
            </Polygon>
          );
        } else if (aoi.aoi_type === 'circle' && aoi.coordinates?.length >= 2) {
          return (
            <Circle
              key={aoi.id}
              center={aoi.coordinates}
              radius={aoi.radius || 500}
              pathOptions={{
                color: hasAlert ? '#FF3B5C' : '#FFB800',
                fillColor: hasAlert ? '#FF3B5C' : '#FFB800',
                fillOpacity: hasAlert ? 0.4 : 0.2,
                weight: 2
              }}
            >
              <AOIPopup aoi={aoi} isCircle />
            </Circle>
          );
        }
        return null;
      })}
    </>
  );
};

// Reusable popup component for AOIs
const AOIPopup = ({ aoi, isCircle = false }) => (
  <Popup>
    <div className="p-2">
      <p className="font-bold">{aoi.name}</p>
      {isCircle && <p className="text-xs">Radius: {aoi.radius}m</p>}
      <p className="text-xs">Monitoring: {aoi.monitored_targets?.length || 0} target(s)</p>
      <p className="text-xs">Alarm: {aoi.alarm_enabled ? 'ON' : 'OFF'}</p>
    </div>
  </Popup>
);

export default AOIRenderer;
