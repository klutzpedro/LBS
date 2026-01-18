import React from 'react';
import { Polygon, Circle, Polyline } from 'react-leaflet';

/**
 * Renders the drawing preview overlay when creating new AOIs
 * Shows polygon or circle preview based on drawing mode
 */
export const DrawingOverlay = ({ drawingMode, drawingPoints = [] }) => {
  if (!drawingMode || drawingPoints.length === 0) return null;

  const calculateCircleRadius = () => {
    if (drawingPoints.length < 2) return 100;
    
    const center = drawingPoints[0];
    const edge = drawingPoints[1];
    const R = 6371000; // Earth radius in meters
    const lat1 = center[0] * Math.PI / 180;
    const lat2 = edge[0] * Math.PI / 180;
    const deltaLat = (edge[0] - center[0]) * Math.PI / 180;
    const deltaLng = (edge[1] - center[1]) * Math.PI / 180;
    const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  return (
    <>
      {/* Polygon Drawing Preview */}
      {drawingMode === 'polygon' && drawingPoints.length >= 2 && (
        <Polyline
          positions={drawingPoints}
          pathOptions={{ color: '#00FF00', weight: 3, dashArray: '10, 10' }}
        />
      )}
      {drawingMode === 'polygon' && drawingPoints.length >= 3 && (
        <Polygon
          positions={drawingPoints}
          pathOptions={{ color: '#00FF00', fillColor: '#00FF00', fillOpacity: 0.2, weight: 2 }}
        />
      )}
      
      {/* Circle Drawing Preview */}
      {drawingMode === 'circle' && drawingPoints.length === 1 && (
        <Circle
          center={drawingPoints[0]}
          radius={100}
          pathOptions={{ color: '#00FF00', fillColor: '#00FF00', fillOpacity: 0.2, dashArray: '10, 10' }}
        />
      )}
      {drawingMode === 'circle' && drawingPoints.length >= 2 && (
        <Circle
          center={drawingPoints[0]}
          radius={calculateCircleRadius()}
          pathOptions={{ color: '#00FF00', fillColor: '#00FF00', fillOpacity: 0.2 }}
        />
      )}
      
      {/* Drawing points markers */}
      {drawingPoints.map((point, idx) => (
        <Circle
          key={`draw-point-${idx}`}
          center={point}
          radius={30}
          pathOptions={{ color: '#00FF00', fillColor: '#00FF00', fillOpacity: 1 }}
        />
      ))}
    </>
  );
};

export default DrawingOverlay;
