import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import { createMarkerWithLabel, createBlinkingMarker, createMarkerWithSelector, createBlinkingMarkerWithSelector, groupTargetsByPosition } from './MapUtils';

/**
 * Renders target markers on the map with popups
 * For overlapping targets at same position, shows numbered selector BELOW the marker
 * Markers scale based on zoom level
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
  const [zoomLevel, setZoomLevel] = useState(map.getZoom());
  const containerRef = useRef(null);
  
  // Listen for zoom changes
  useMapEvents({
    zoomend: () => {
      setZoomLevel(map.getZoom());
    }
  });
  
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
  
  // Render markers - recreate when zoom changes
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
            posKey,
            zoomLevel
          ) :
          createMarkerWithSelector(
            selectedTarget.phone_number,
            selectedTarget.data.timestamp || selectedTarget.created_at,
            targetName,
            showMarkerNames,
            groupTargets.length,
            selectedIdx,
            posKey,
            zoomLevel
          );
      } else {
        // Single target - use normal marker
        icon = hasActiveAlert ?
          createBlinkingMarker(
            selectedTarget.phone_number,
            selectedTarget.data.timestamp || selectedTarget.created_at,
            targetName,
            showMarkerNames,
            zoomLevel
          ) :
          createMarkerWithLabel(
            selectedTarget.phone_number,
            selectedTarget.data.timestamp || selectedTarget.created_at,
            targetName,
            showMarkerNames,
            zoomLevel
          );
      }
      
      result.push(
        <Marker
          key={`marker-${posKey}-${zoomLevel}`}
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
  }, [positionGroups, selectedAtPosition, alertedTargetIds, showMarkerNames, onShowReghpInfo, onPendalaman, loadingPendalaman, zoomLevel]);

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
}) => {
  const [copied, setCopied] = useState(false);
  
  // Generate shareable link
  const generateShareLink = () => {
    const lat = target.data.latitude;
    const lng = target.data.longitude;
    const name = encodeURIComponent(target.data.name || target.phone_number);
    // Google Maps link
    return `https://www.google.com/maps?q=${lat},${lng}&z=17&marker=${lat},${lng}(${name})`;
  };
  
  // Copy share link to clipboard
  const handleShare = async () => {
    const link = generateShareLink();
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = link;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  
  return (
    <Popup>
      <div className="p-1.5" style={{ color: 'var(--foreground-primary)', minWidth: '220px', maxWidth: '260px' }}>
        {/* Group indicator */}
        {isGrouped && (
          <div className="mb-1 px-1.5 py-0.5 rounded text-xs font-semibold text-center"
            style={{ 
              backgroundColor: 'var(--accent-primary)', 
              color: 'var(--background-primary)' 
            }}>
            📍 Target {selectedIndex + 1} dari {groupCount}
          </div>
        )}
        
        {/* Header: Phone Number */}
        <p className="text-xs font-mono font-semibold mb-1" style={{ color: 'var(--accent-primary)' }}>
          {target.phone_number}
        </p>
        
        {/* Device Info Section - Compact */}
        {(target.data.phone_model || target.data.imei || target.data.imsi) && (
          <div className="mb-1.5 p-1.5 rounded" style={{ backgroundColor: 'var(--background-tertiary)' }}>
            <p className="text-[10px] font-semibold mb-0.5" style={{ color: 'var(--foreground-secondary)' }}>
              DEVICE
            </p>
            {target.data.phone_model && (
              <div className="text-[10px] flex justify-between leading-tight">
                <span style={{ color: 'var(--foreground-muted)' }}>Phone:</span>
                <span className="font-mono truncate ml-1" style={{ color: 'var(--foreground-primary)', maxWidth: '140px' }}>{target.data.phone_model}</span>
              </div>
            )}
            {target.data.imei && (
              <div className="text-[10px] flex justify-between leading-tight">
                <span style={{ color: 'var(--foreground-muted)' }}>IMEI:</span>
                <span className="font-mono" style={{ color: 'var(--foreground-primary)' }}>{target.data.imei}</span>
              </div>
            )}
            {target.data.imsi && (
              <div className="text-[10px] flex justify-between leading-tight">
                <span style={{ color: 'var(--foreground-muted)' }}>IMSI:</span>
                <span className="font-mono" style={{ color: 'var(--foreground-primary)' }}>{target.data.imsi}</span>
              </div>
            )}
          </div>
        )}
        
        {/* Network Info Section - Compact */}
        {(target.data.operator || target.data.network || target.data.mcc || target.data.lac || target.data.cgi || target.data.ci) && (
          <div className="mb-1.5 p-1.5 rounded" style={{ backgroundColor: 'var(--background-tertiary)' }}>
            <p className="text-[10px] font-semibold mb-0.5" style={{ color: 'var(--foreground-secondary)' }}>
              NETWORK
            </p>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0">
              {target.data.network && (
                <div className="text-[10px] flex justify-between leading-tight col-span-2">
                  <span style={{ color: 'var(--foreground-muted)' }}>Type:</span>
                  <span className="font-mono" style={{ color: 'var(--accent-secondary)' }}>{target.data.network}</span>
                </div>
              )}
              {target.data.mcc && (
                <div className="text-[10px] flex justify-between leading-tight">
                  <span style={{ color: 'var(--foreground-muted)' }}>MCC:</span>
                  <span className="font-mono" style={{ color: 'var(--foreground-primary)' }}>{target.data.mcc}</span>
                </div>
              )}
              {target.data.lac && (
                <div className="text-[10px] flex justify-between leading-tight">
                  <span style={{ color: 'var(--foreground-muted)' }}>LAC:</span>
                  <span className="font-mono" style={{ color: 'var(--foreground-primary)' }}>{target.data.lac}</span>
                </div>
              )}
              {target.data.ci && (
                <div className="text-[10px] flex justify-between leading-tight">
                  <span style={{ color: 'var(--foreground-muted)' }}>CI:</span>
                  <span className="font-mono" style={{ color: 'var(--foreground-primary)' }}>{target.data.ci}</span>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Location Info Section - Compact */}
        <div className="mb-1.5 p-1.5 rounded" style={{ backgroundColor: 'var(--background-tertiary)' }}>
          <p className="text-[10px] font-semibold mb-0.5" style={{ color: 'var(--foreground-secondary)' }}>
            LOCATION
          </p>
          <div className="text-[10px] flex justify-between leading-tight">
            <span style={{ color: 'var(--foreground-muted)' }}>Lat:</span>
            <span className="font-mono font-semibold" style={{ color: 'var(--accent-primary)' }}>
              {target.data.latitude?.toFixed(6)}
            </span>
          </div>
          <div className="text-[10px] flex justify-between leading-tight">
            <span style={{ color: 'var(--foreground-muted)' }}>Long:</span>
            <span className="font-mono font-semibold" style={{ color: 'var(--accent-primary)' }}>
              {target.data.longitude?.toFixed(6)}
            </span>
          </div>
          {target.data.address && (
            <p className="text-[10px] mt-0.5 leading-tight" style={{ color: 'var(--foreground-primary)' }}>
              {target.data.address}
            </p>
          )}
        </div>
        
        {/* Action Buttons - Compact */}
        <div className="flex gap-1 mb-1">
          <button
            onClick={handleShare}
            className="flex-1 py-1 px-1.5 rounded text-[10px] font-semibold"
            style={{ 
              backgroundColor: copied ? '#22c55e' : 'var(--accent-secondary)', 
              color: 'var(--background-primary)'
            }}
          >
            {copied ? '✓ Copied' : '📤 Share'}
          </button>
        </div>
        
        {/* Pendalaman / Info Button - Compact */}
        <div className="pt-1 border-t" style={{ borderColor: 'var(--borders-subtle)' }}>
          {target.reghp_status === 'completed' ? (
            <button
              onClick={() => onShowReghpInfo(target)}
              className="w-full py-1 px-2 rounded text-[10px] font-semibold uppercase"
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
              className="w-full py-1 px-2 rounded text-[10px] font-semibold uppercase"
              style={{
                backgroundColor: 'var(--status-warning)',
                color: 'var(--background-primary)'
              }}
            >
              ⚠️ Not Found
            </button>
          ) : target.reghp_status === 'processing' || loadingPendalaman === target.id ? (
            <div className="text-center py-1">
              <p className="text-[10px]" style={{ color: 'var(--status-processing)' }}>
                ⏳ Processing...
              </p>
            </div>
          ) : (
            <button
              onClick={() => {
                console.log('[TargetMarkers] Pendalaman button clicked for target:', target.id);
                onPendalaman(target);
              }}
              disabled={loadingPendalaman === target.id}
              data-testid="pendalaman-button"
              className="w-full py-1 px-2 rounded text-[10px] font-semibold uppercase disabled:opacity-50"
              style={{
                backgroundColor: 'var(--status-warning)',
                color: 'var(--background-primary)'
              }}
            >
              🔍 Pendalaman
            </button>
          )}
        </div>
      </div>
    </Popup>
  );
};

export default TargetMarkers;
