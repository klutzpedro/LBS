import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Marker, Popup, useMap } from 'react-leaflet';
import { createMarkerWithLabel, createBlinkingMarker, createMarkerWithSelector, createBlinkingMarkerWithSelector, groupTargetsByPosition } from './MapUtils';

/**
 * Renders target markers on the map with popups
 * For overlapping targets at same position, shows numbered selector BELOW the marker
 */
export const TargetMarkers = ({ 
  targets = [], 
  visibleTargets = new Set(),
  showMarkerNames = false,
  onShowReghpInfo,
  onPendalaman,
  loadingPendalaman = null,
  aoiAlerts = []
}) => {
  const map = useMap();
  const [selectedAtPosition, setSelectedAtPosition] = useState({});
  const containerRef = useRef(null);
  
  // Handle clicks on selector buttons
  useEffect(() => {
    const handleSelectorClick = (e) => {
      const btn = e.target.closest('.target-selector-btn');
      if (btn) {
        e.stopPropagation();
        e.preventDefault();
        const posKey = btn.dataset.pos;
        const idx = parseInt(btn.dataset.idx, 10);
        if (posKey && !isNaN(idx)) {
          setSelectedAtPosition(prev => ({ ...prev, [posKey]: idx }));
        }
      }
    };
    
    // Add event listener to map container
    const mapContainer = map.getContainer();
    mapContainer.addEventListener('click', handleSelectorClick, true);
    
    return () => {
      mapContainer.removeEventListener('click', handleSelectorClick, true);
    };
  }, [map]);
  
  const filteredTargets = targets.filter(t => {
    const hasData = t.data && t.data.latitude && t.data.longitude;
    const isVisible = visibleTargets.has(t.id);
    return hasData && isVisible;
  });
  
  // Get target IDs that have active alerts
  const alertedTargetIds = useMemo(() => new Set(
    aoiAlerts
      .filter(a => !a.acknowledged)
      .flatMap(a => a.target_ids || [])
  ), [aoiAlerts]);
  
  // Group targets by position
  const positionGroups = useMemo(() => groupTargetsByPosition(filteredTargets), [filteredTargets]);
  
  // Render markers
  const markers = useMemo(() => {
    const result = [];
    
    Object.entries(positionGroups).forEach(([posKey, groupTargets]) => {
      const selectedIdx = selectedAtPosition[posKey] || 0;
      const selectedTarget = groupTargets[selectedIdx] || groupTargets[0];
      
      const targetName = selectedTarget.nik_queries ? 
        Object.values(selectedTarget.nik_queries).find(nq => nq.data?.parsed_data?.['Full Name'])?.data?.parsed_data?.['Full Name'] : 
        selectedTarget.data?.name;
      
      const hasActiveAlert = alertedTargetIds.has(selectedTarget.id);
      const isGrouped = groupTargets.length > 1;
      
      let icon;
      if (isGrouped) {
        // Multiple targets - use selector marker
        icon = hasActiveAlert ?
          createBlinkingMarkerWithSelector(
            selectedTarget.phone_number,
            selectedTarget.data.timestamp || selectedTarget.created_at,
            targetName,
            showMarkerNames,
            groupTargets.length,
            selectedIdx,
            posKey
          ) :
          createMarkerWithSelector(
            selectedTarget.phone_number,
            selectedTarget.data.timestamp || selectedTarget.created_at,
            targetName,
            showMarkerNames,
            groupTargets.length,
            selectedIdx,
            posKey
          );
      } else {
        // Single target - use normal marker
        icon = hasActiveAlert ?
          createBlinkingMarker(
            selectedTarget.phone_number,
            selectedTarget.data.timestamp || selectedTarget.created_at,
            targetName,
            showMarkerNames
          ) :
          createMarkerWithLabel(
            selectedTarget.phone_number,
            selectedTarget.data.timestamp || selectedTarget.created_at,
            targetName,
            showMarkerNames
          );
      }
      
      result.push(
        <Marker
          key={`marker-${posKey}`}
          position={[selectedTarget.data.latitude, selectedTarget.data.longitude]}
          icon={icon}
        >
          <TargetPopup 
            target={selectedTarget}
            onShowReghpInfo={onShowReghpInfo}
            onPendalaman={onPendalaman}
            loadingPendalaman={loadingPendalaman}
            isGrouped={isGrouped}
            groupCount={groupTargets.length}
            selectedIndex={selectedIdx}
          />
        </Marker>
      );
    });
    
    return result;
  }, [positionGroups, selectedAtPosition, alertedTargetIds, showMarkerNames, onShowReghpInfo, onPendalaman, loadingPendalaman]);

  return <>{markers}</>;
};

// Popup component for target markers
const TargetPopup = ({ 
  target, 
  onShowReghpInfo, 
  onPendalaman,
  loadingPendalaman,
  isGrouped,
  groupCount,
  selectedIndex
}) => (
  <Popup>
    <div className="p-2" style={{ color: 'var(--foreground-primary)', minWidth: '200px' }}>
      {/* Group indicator */}
      {isGrouped && (
        <div className="mb-2 px-2 py-1 rounded text-xs font-semibold text-center"
          style={{ 
            backgroundColor: 'var(--accent-primary)', 
            color: 'var(--background-primary)' 
          }}>
          📍 Target {selectedIndex + 1} dari {groupCount}
        </div>
      )}
      
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
        ) : target.reghp_status === 'not_found' ? (
          <button
            onClick={() => onShowReghpInfo(target)}
            className="w-full py-2 px-3 rounded text-xs font-semibold uppercase"
            style={{
              backgroundColor: 'var(--status-warning)',
              color: 'var(--background-primary)'
            }}
          >
            ⚠️ Data Not Found
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
