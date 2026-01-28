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
      <div className="p-2" style={{ color: 'var(--foreground-primary)', minWidth: '280px', maxWidth: '350px' }}>
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
        
        {/* Header: Name & Phone */}
        <p className="font-bold mb-1 text-base" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
          {target.data.name}
        </p>
        <p className="text-sm mb-2 font-mono font-semibold" style={{ color: 'var(--accent-primary)' }}>
          {target.phone_number}
        </p>
        
        {/* Device Info Section */}
        {(target.data.phone_model || target.data.imei || target.data.imsi) && (
          <div className="mb-3 p-2 rounded" style={{ backgroundColor: 'var(--background-tertiary)' }}>
            <p className="text-xs font-semibold mb-1" style={{ color: 'var(--foreground-secondary)' }}>
              DEVICE INFO
            </p>
            {target.data.phone_model && (
              <div className="text-xs flex justify-between">
                <span style={{ color: 'var(--foreground-muted)' }}>Phone:</span>
                <span className="font-mono" style={{ color: 'var(--foreground-primary)' }}>{target.data.phone_model}</span>
              </div>
            )}
            {target.data.imei && (
              <div className="text-xs flex justify-between">
                <span style={{ color: 'var(--foreground-muted)' }}>IMEI:</span>
                <span className="font-mono" style={{ color: 'var(--foreground-primary)' }}>{target.data.imei}</span>
              </div>
            )}
            {target.data.imsi && (
              <div className="text-xs flex justify-between">
                <span style={{ color: 'var(--foreground-muted)' }}>IMSI:</span>
                <span className="font-mono" style={{ color: 'var(--foreground-primary)' }}>{target.data.imsi}</span>
              </div>
            )}
          </div>
        )}
        
        {/* Network Info Section */}
        {(target.data.operator || target.data.network || target.data.mcc || target.data.lac || target.data.cgi || target.data.ci) && (
          <div className="mb-3 p-2 rounded" style={{ backgroundColor: 'var(--background-tertiary)' }}>
            <p className="text-xs font-semibold mb-1" style={{ color: 'var(--foreground-secondary)' }}>
              NETWORK INFO
            </p>
            {target.data.operator && (
              <div className="text-xs flex justify-between">
                <span style={{ color: 'var(--foreground-muted)' }}>Operator:</span>
                <span className="font-mono" style={{ color: 'var(--foreground-primary)' }}>{target.data.operator}</span>
              </div>
            )}
            {target.data.network && (
              <div className="text-xs flex justify-between">
                <span style={{ color: 'var(--foreground-muted)' }}>Network:</span>
                <span className="font-mono" style={{ color: 'var(--accent-secondary)' }}>{target.data.network}</span>
              </div>
            )}
            {target.data.mcc && (
              <div className="text-xs flex justify-between">
                <span style={{ color: 'var(--foreground-muted)' }}>MCC:</span>
                <span className="font-mono" style={{ color: 'var(--foreground-primary)' }}>{target.data.mcc}</span>
              </div>
            )}
            {target.data.lac && (
              <div className="text-xs flex justify-between">
                <span style={{ color: 'var(--foreground-muted)' }}>LAC:</span>
                <span className="font-mono" style={{ color: 'var(--foreground-primary)' }}>{target.data.lac}</span>
              </div>
            )}
            {target.data.ci && (
              <div className="text-xs flex justify-between">
                <span style={{ color: 'var(--foreground-muted)' }}>CI:</span>
                <span className="font-mono" style={{ color: 'var(--foreground-primary)' }}>{target.data.ci}</span>
              </div>
            )}
            {target.data.cgi && (
              <div className="text-xs flex justify-between">
                <span style={{ color: 'var(--foreground-muted)' }}>CGI:</span>
                <span className="font-mono text-xs" style={{ color: 'var(--foreground-primary)' }}>{target.data.cgi}</span>
              </div>
            )}
          </div>
        )}
        
        {/* Location Info Section */}
        <div className="mb-3 p-2 rounded" style={{ backgroundColor: 'var(--background-tertiary)' }}>
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--foreground-secondary)' }}>
            LOCATION
          </p>
          <div className="text-xs flex justify-between">
            <span style={{ color: 'var(--foreground-muted)' }}>Lat:</span>
            <span className="font-mono font-semibold" style={{ color: 'var(--accent-primary)' }}>
              {target.data.latitude?.toFixed(6)}
            </span>
          </div>
          <div className="text-xs flex justify-between">
            <span style={{ color: 'var(--foreground-muted)' }}>Long:</span>
            <span className="font-mono font-semibold" style={{ color: 'var(--accent-primary)' }}>
              {target.data.longitude?.toFixed(6)}
            </span>
          </div>
          {target.data.address && (
            <div className="text-xs mt-1">
              <span style={{ color: 'var(--foreground-muted)' }}>Address:</span>
              <p className="mt-0.5" style={{ color: 'var(--foreground-primary)' }}>{target.data.address}</p>
            </div>
          )}
        </div>
        
        {/* Action Buttons */}
        <div className="flex gap-2 mb-2">
          {target.data.maps_link && (
            <a
              href={target.data.maps_link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-1.5 px-2 rounded text-xs font-semibold text-center"
              style={{ 
                backgroundColor: 'var(--accent-primary)', 
                color: 'var(--background-primary)',
                textDecoration: 'none'
              }}
            >
              🗺️ Google Maps
            </a>
          )}
          <button
            onClick={handleShare}
            className="flex-1 py-1.5 px-2 rounded text-xs font-semibold"
            style={{ 
              backgroundColor: copied ? '#22c55e' : 'var(--accent-secondary)', 
              color: 'var(--background-primary)'
            }}
          >
            {copied ? '✓ Link Copied!' : '📤 Share'}
          </button>
        </div>
        
        {/* Pendalaman / Info Button */}
        <div className="pt-2 border-t" style={{ borderColor: 'var(--borders-subtle)' }}>
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
