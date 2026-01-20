import React, { useState, useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import { createMarkerWithLabel, createBlinkingMarker, createGroupedMarker, groupTargetsByPosition } from './MapUtils';

/**
 * Renders target markers on the map with popups
 * For overlapping targets at same position, shows numbered selector below marker
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
  // Track which target is selected at each grouped position
  const [selectedAtPosition, setSelectedAtPosition] = useState({});
  
  const filteredTargets = targets.filter(t => {
    const hasData = t.data && t.data.latitude && t.data.longitude;
    const isVisible = visibleTargets.has(t.id);
    return hasData && isVisible;
  });
  
  // Get target IDs that have active (unacknowledged) alerts
  const alertedTargetIds = new Set(
    aoiAlerts
      .filter(a => !a.acknowledged)
      .flatMap(a => a.target_ids || [])
  );
  
  // Group targets by position
  const positionGroups = useMemo(() => groupTargetsByPosition(filteredTargets), [filteredTargets]);
  
  // Render markers - one per unique position
  const markers = useMemo(() => {
    const result = [];
    
    Object.entries(positionGroups).forEach(([posKey, groupTargets]) => {
      if (groupTargets.length === 1) {
        // Single target - render normally
        const target = groupTargets[0];
        const targetName = target.nik_queries ? 
          Object.values(target.nik_queries).find(nq => nq.data?.parsed_data?.['Full Name'])?.data?.parsed_data?.['Full Name'] : 
          target.data?.name;
        const hasActiveAlert = alertedTargetIds.has(target.id);
        
        result.push(
          <Marker
            key={target.id}
            position={[target.data.latitude, target.data.longitude]}
            icon={hasActiveAlert ? 
              createBlinkingMarker(target.phone_number, target.data.timestamp || target.created_at, targetName, showMarkerNames) :
              createMarkerWithLabel(target.phone_number, target.data.timestamp || target.created_at, targetName, showMarkerNames)
            }
          >
            <TargetPopup 
              target={target}
              onShowReghpInfo={onShowReghpInfo}
              onPendalaman={onPendalaman}
              loadingPendalaman={loadingPendalaman}
            />
          </Marker>
        );
      } else {
        // Multiple targets at same position - render grouped marker
        const selectedIdx = selectedAtPosition[posKey] || 0;
        const selectedTarget = groupTargets[selectedIdx] || groupTargets[0];
        const targetName = selectedTarget.nik_queries ? 
          Object.values(selectedTarget.nik_queries).find(nq => nq.data?.parsed_data?.['Full Name'])?.data?.parsed_data?.['Full Name'] : 
          selectedTarget.data?.name;
        const hasActiveAlert = alertedTargetIds.has(selectedTarget.id);
        
        result.push(
          <Marker
            key={`group-${posKey}`}
            position={[selectedTarget.data.latitude, selectedTarget.data.longitude]}
            icon={hasActiveAlert ? 
              createBlinkingMarker(selectedTarget.phone_number, selectedTarget.data.timestamp || selectedTarget.created_at, targetName, showMarkerNames) :
              createMarkerWithLabel(selectedTarget.phone_number, selectedTarget.data.timestamp || selectedTarget.created_at, targetName, showMarkerNames)
            }
            eventHandlers={{
              click: (e) => {
                // Don't propagate to map
                e.originalEvent.stopPropagation();
              }
            }}
          >
            <GroupedTargetPopup 
              targets={groupTargets}
              selectedIndex={selectedIdx}
              onSelectTarget={(idx) => {
                setSelectedAtPosition(prev => ({ ...prev, [posKey]: idx }));
              }}
              onShowReghpInfo={onShowReghpInfo}
              onPendalaman={onPendalaman}
              loadingPendalaman={loadingPendalaman}
              alertedTargetIds={alertedTargetIds}
            />
          </Marker>
        );
      }
    });
    
    return result;
  }, [positionGroups, selectedAtPosition, alertedTargetIds, showMarkerNames, onShowReghpInfo, onPendalaman, loadingPendalaman]);

  return <>{markers}</>;
};

// Popup for grouped targets with selector
const GroupedTargetPopup = ({ 
  targets,
  selectedIndex,
  onSelectTarget,
  onShowReghpInfo, 
  onPendalaman,
  loadingPendalaman,
  alertedTargetIds
}) => {
  const selectedTarget = targets[selectedIndex] || targets[0];
  
  return (
    <Popup>
      <div className="p-2" style={{ color: 'var(--foreground-primary)', minWidth: '220px' }}>
        {/* Target Selector */}
        <div className="mb-3 pb-2 border-b" style={{ borderColor: 'var(--borders-subtle)' }}>
          <p className="text-xs mb-2 font-semibold" style={{ color: 'var(--foreground-muted)' }}>
            📍 {targets.length} target di lokasi ini:
          </p>
          <div className="flex gap-1 flex-wrap">
            {targets.map((target, idx) => {
              const isSelected = idx === selectedIndex;
              const hasAlert = alertedTargetIds.has(target.id);
              return (
                <button
                  key={target.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectTarget(idx);
                  }}
                  className="px-2 py-1 rounded text-xs font-bold transition-all"
                  style={{
                    backgroundColor: isSelected ? 'var(--accent-primary)' : (hasAlert ? '#FF3B5C' : 'var(--background-elevated)'),
                    color: isSelected ? 'var(--background-primary)' : (hasAlert ? '#FFFFFF' : 'var(--foreground-primary)'),
                    border: isSelected ? '2px solid var(--accent-secondary)' : '1px solid var(--borders-default)'
                  }}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>
        
        {/* Selected Target Info */}
        <p className="font-bold mb-1" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
          {selectedTarget.data.name}
        </p>
        <p className="text-xs mb-1 font-mono" style={{ color: 'var(--accent-primary)' }}>
          {selectedTarget.phone_number}
        </p>
        <p className="text-xs mb-1" style={{ color: 'var(--foreground-secondary)' }}>
          {selectedTarget.data.address}
        </p>
        <div className="text-xs mt-2">
          <span style={{ color: 'var(--foreground-muted)' }}>Lat:</span>{' '}
          <span className="font-mono" style={{ color: 'var(--accent-primary)' }}>
            {selectedTarget.data.latitude.toFixed(6)}
          </span>
        </div>
        <div className="text-xs">
          <span style={{ color: 'var(--foreground-muted)' }}>Long:</span>{' '}
          <span className="font-mono" style={{ color: 'var(--accent-primary)' }}>
            {selectedTarget.data.longitude.toFixed(6)}
          </span>
        </div>
        
        {selectedTarget.data.maps_link && (
          <a
            href={selectedTarget.data.maps_link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs mt-2 inline-block hover:underline"
            style={{ color: 'var(--accent-primary)' }}
          >
            Open in Google Maps
          </a>
        )}
        
        {/* Pendalaman Button */}
        <div className="mt-3 pt-2 border-t" style={{ borderColor: 'var(--borders-subtle)' }}>
          {selectedTarget.reghp_status === 'completed' ? (
            <button
              onClick={() => onShowReghpInfo(selectedTarget)}
              className="w-full py-2 px-3 rounded text-xs font-semibold uppercase"
              style={{
                backgroundColor: 'var(--accent-secondary)',
                color: 'var(--background-primary)'
              }}
            >
              📋 Info Pendalaman
            </button>
          ) : selectedTarget.reghp_status === 'not_found' ? (
            <button
              onClick={() => onShowReghpInfo(selectedTarget)}
              className="w-full py-2 px-3 rounded text-xs font-semibold uppercase"
              style={{
                backgroundColor: 'var(--status-warning)',
                color: 'var(--background-primary)'
              }}
            >
              ⚠️ Data Not Found
            </button>
          ) : selectedTarget.reghp_status === 'processing' || loadingPendalaman === selectedTarget.id ? (
            <div className="text-center py-2">
              <p className="text-xs" style={{ color: 'var(--status-processing)' }}>
                ⏳ Pendalaman sedang diproses...
              </p>
            </div>
          ) : (
            <button
              onClick={() => onPendalaman(selectedTarget)}
              disabled={loadingPendalaman === selectedTarget.id}
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
};

// Popup component for single target markers
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
