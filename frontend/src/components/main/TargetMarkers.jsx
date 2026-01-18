import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import { createMarkerWithLabel } from './MapUtils';
import { Button } from '@/components/ui/button';

/**
 * Renders target markers on the map with popups
 * Shows location info and pendalaman (deep dive) actions
 */
export const TargetMarkers = ({ 
  targets = [], 
  visibleTargets = new Set(),
  showMarkerNames = false,
  onShowReghpInfo,
  onPendalaman,
  loadingPendalaman = null
}) => {
  const filteredTargets = targets.filter(t => {
    const hasData = t.data && t.data.latitude && t.data.longitude;
    const isVisible = visibleTargets.has(t.id);
    return hasData && isVisible;
  });

  return (
    <>
      {filteredTargets.map((target) => {
        const targetName = target.nik_queries ? 
          Object.values(target.nik_queries).find(nq => nq.data?.parsed_data?.['Full Name'])?.data?.parsed_data?.['Full Name'] : 
          target.data?.name;
        
        return (
          <Marker
            key={target.id}
            position={[target.data.latitude, target.data.longitude]}
            icon={createMarkerWithLabel(
              target.phone_number, 
              target.data.timestamp || target.created_at,
              targetName,
              showMarkerNames
            )}
          >
            <TargetPopup 
              target={target}
              targetName={targetName}
              onShowReghpInfo={onShowReghpInfo}
              onPendalaman={onPendalaman}
              loadingPendalaman={loadingPendalaman}
            />
          </Marker>
        );
      })}
    </>
  );
};

// Popup component for target markers
const TargetPopup = ({ 
  target, 
  onShowReghpInfo, 
  onPendalaman,
  loadingPendalaman 
}) => (
  <Popup>
    <div className="p-2" style={{ color: 'var(--foreground-primary)', minWidth: '200px' }}>
      <p className="font-bold mb-1" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
        {target.data.name}
      </p>
      <p className="text-xs mb-1 font-mono" style={{ color: 'var(--accent-primary)' }}>
        {target.phone_number}
      </p>
      <p className="text-xs mb-1" style={{ color: 'var(--foreground-secondary)' }}>
        {target.data.address}
      </p>
      <div className="text-xs mt-2">
        <span style={{ color: 'var(--foreground-muted)' }}>Lat:</span>{' '}
        <span className="font-mono" style={{ color: 'var(--accent-primary)' }}>
          {target.data.latitude.toFixed(6)}
        </span>
      </div>
      <div className="text-xs">
        <span style={{ color: 'var(--foreground-muted)' }}>Long:</span>{' '}
        <span className="font-mono" style={{ color: 'var(--accent-primary)' }}>
          {target.data.longitude.toFixed(6)}
        </span>
      </div>
      {target.data.maps_link && (
        <a
          href={target.data.maps_link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs mt-2 inline-block hover:underline"
          style={{ color: 'var(--accent-primary)' }}
        >
          Open in Google Maps
        </a>
      )}
      
      {/* Pendalaman / Info Button */}
      <div className="mt-3 pt-2 border-t" style={{ borderColor: 'var(--borders-subtle)' }}>
        {target.reghp_status === 'completed' ? (
          <button
            onClick={() => onShowReghpInfo(target)}
            className="w-full py-2 px-3 rounded text-xs font-semibold uppercase"
            style={{
              backgroundColor: 'var(--accent-secondary)',
              color: 'var(--background-primary)'
            }}
          >
            📋 Info Pendalaman
          </button>
        ) : target.reghp_status === 'processing' || loadingPendalaman === target.id ? (
          <div className="text-center py-2">
            <p className="text-xs" style={{ color: 'var(--status-processing)' }}>
              ⏳ Pendalaman sedang diproses...
            </p>
          </div>
        ) : (
          <button
            onClick={() => onPendalaman(target)}
            disabled={loadingPendalaman === target.id}
            className="w-full py-2 px-3 rounded text-xs font-semibold uppercase disabled:opacity-50"
            style={{
              backgroundColor: 'var(--status-warning)',
              color: 'var(--background-primary)'
            }}
          >
            🔍 Pendalaman (Reghp)
          </button>
        )}
      </div>
    </div>
  </Popup>
);

export default TargetMarkers;
