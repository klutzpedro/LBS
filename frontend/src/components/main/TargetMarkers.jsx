import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
  aoiAlerts = [],
  selectedTargetId = null,
  onSelectTarget = null  // Callback to notify parent when target is selected via map selector
}) => {
  const map = useMap();
  const [selectedAtPosition, setSelectedAtPosition] = useState({});
  const [zoomLevel, setZoomLevel] = useState(map.getZoom());
  const containerRef = useRef(null);
  
  // Store refs for all markers by target ID
  const markerRefs = useRef({});
  
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
          console.log('[TargetMarkers] Selector clicked, posKey:', posKey, 'idx:', idx);
          
          // Find the target at this position and index
          const groupTargets = positionGroups[posKey];
          const selectedTarget = groupTargets?.[idx];
          
          if (selectedTarget) {
            // Update lastHandledTargetIdRef to this new target BEFORE calling onSelectTarget
            // This prevents the useEffect from re-opening the popup
            lastHandledTargetIdRef.current = selectedTarget.id;
            
            // Notify parent about the new selection (this updates selectedTargetForChat)
            if (onSelectTarget) {
              onSelectTarget(selectedTarget.id);
            }
          }
          
          setSelectedAtPosition(prev => ({ ...prev, [posKey]: idx }));
          
          // Close any open popup first, then open the new one after state updates
          map.closePopup();
          
          setTimeout(() => {
            const markerRef = markerRefs.current[posKey];
            if (markerRef) {
              markerRef.openPopup();
            }
          }, 100);
        }
      }
    };
    
    // Add event listener to map container
    const mapContainer = map.getContainer();
    mapContainer.addEventListener('click', handleSelectorClick, true);
    
    return () => {
      mapContainer.removeEventListener('click', handleSelectorClick, true);
    };
  }, [map, positionGroups, onSelectTarget]);
  
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
  
  // Create mapping from target ID to position key and index
  const targetIdToPosInfo = useMemo(() => {
    const mapping = {};
    Object.entries(positionGroups).forEach(([posKey, groupTargets]) => {
      groupTargets.forEach((target, idx) => {
        mapping[target.id] = { posKey, idx };
      });
    });
    return mapping;
  }, [positionGroups]);
  
  // Track last handled selectedTargetId to prevent re-triggering
  const lastHandledTargetIdRef = useRef(null);
  // Track if user just closed popup manually (to prevent auto-reopen)
  const userClosedPopupRef = useRef(false);
  
  // Listen for popup close events
  useEffect(() => {
    const handlePopupClose = () => {
      console.log('[TargetMarkers] Popup closed by user');
      userClosedPopupRef.current = true;
      // Reset after a short delay to allow future openings
      setTimeout(() => {
        userClosedPopupRef.current = false;
      }, 500);
    };
    
    map.on('popupclose', handlePopupClose);
    
    return () => {
      map.off('popupclose', handlePopupClose);
    };
  }, [map]);
  
  // Open popup when selectedTargetId changes (only when it actually changes)
  useEffect(() => {
    // Skip if no target selected or same target already handled
    if (!selectedTargetId || selectedTargetId === lastHandledTargetIdRef.current) {
      return;
    }
    
    // Skip if user just closed popup manually
    if (userClosedPopupRef.current) {
      console.log('[TargetMarkers] Skipping popup open - user just closed it');
      return;
    }
    
    const posInfo = targetIdToPosInfo[selectedTargetId];
    if (!posInfo) return;
    
    const { posKey, idx } = posInfo;
    
    // Mark this target as handled
    lastHandledTargetIdRef.current = selectedTargetId;
    
    // If this target is in a group with multiple targets at same position,
    // we need to switch the selector to show this target
    const groupTargets = positionGroups[posKey];
    if (groupTargets && groupTargets.length > 1) {
      // Update the selected index for this position
      setSelectedAtPosition(prev => ({ ...prev, [posKey]: idx }));
    }
    
    // Wait for React to re-render with the correct target selected, then open popup
    setTimeout(() => {
      // Double check user hasn't closed popup in the meantime
      if (userClosedPopupRef.current) {
        console.log('[TargetMarkers] Skipping popup open in timeout - user closed it');
        return;
      }
      const markerRef = markerRefs.current[posKey];
      if (markerRef) {
        markerRef.openPopup();
      }
    }, 150);
  }, [selectedTargetId, targetIdToPosInfo, positionGroups]);
  
  // Reset lastHandledTargetIdRef when selectedTargetId becomes null
  useEffect(() => {
    if (!selectedTargetId) {
      lastHandledTargetIdRef.current = null;
    }
  }, [selectedTargetId]);
  
  // Callback to store marker ref
  const setMarkerRef = useCallback((posKey, ref) => {
    if (ref) {
      markerRefs.current[posKey] = ref;
    }
  }, []);
  
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
          ref={(ref) => setMarkerRef(posKey, ref)}
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
  }, [positionGroups, selectedAtPosition, alertedTargetIds, showMarkerNames, onShowReghpInfo, onPendalaman, loadingPendalaman, zoomLevel, setMarkerRef]);

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
  const popupRef = useRef(null);
  
  // Generate shareable link - wrapped in useCallback for dependency array
  const generateShareLink = React.useCallback(() => {
    const lat = target.data.latitude;
    const lng = target.data.longitude;
    const name = encodeURIComponent(target.data.name || target.phone_number);
    // Google Maps link
    return `https://www.google.com/maps?q=${lat},${lng}&z=17&marker=${lat},${lng}(${name})`;
  }, [target.data.latitude, target.data.longitude, target.data.name, target.phone_number]);
  
  // Copy share link to clipboard (kept for direct use if needed)
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
  
  // Handle button clicks using native DOM events (Leaflet popup workaround)
  useEffect(() => {
    // Copy ref value for use in cleanup
    const currentPopupRef = popupRef.current;
    
    // Copy share link handler for use in effect
    const performShare = async () => {
      const link = generateShareLink();
      try {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
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
    
    // Get the popup container after it's mounted
    const setupEventListeners = () => {
      if (!currentPopupRef) return;
      
      const container = currentPopupRef;
      
      // Handle Pendalaman button click
      const pendalamanBtn = container.querySelector('[data-action="pendalaman"]');
      if (pendalamanBtn) {
        const handlePendalamanClick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('[TargetPopup] Pendalaman button clicked for target:', target.id);
          if (onPendalaman && typeof onPendalaman === 'function') {
            onPendalaman(target);
          }
        };
        pendalamanBtn.addEventListener('click', handlePendalamanClick);
        // Cleanup function
        pendalamanBtn._cleanup = () => {
          pendalamanBtn.removeEventListener('click', handlePendalamanClick);
        };
      }
      
      // Handle Info button click
      const infoBtn = container.querySelector('[data-action="show-info"]');
      if (infoBtn) {
        const handleInfoClick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('[TargetPopup] Info button clicked for target:', target.id);
          if (onShowReghpInfo && typeof onShowReghpInfo === 'function') {
            onShowReghpInfo(target);
          }
        };
        infoBtn.addEventListener('click', handleInfoClick);
        infoBtn._cleanup = () => {
          infoBtn.removeEventListener('click', handleInfoClick);
        };
      }
      
      // Handle Share button click
      const shareBtn = container.querySelector('[data-action="share"]');
      if (shareBtn) {
        const handleShareClick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          performShare();
        };
        shareBtn.addEventListener('click', handleShareClick);
        shareBtn._cleanup = () => {
          shareBtn.removeEventListener('click', handleShareClick);
        };
      }
    };
    
    // Use a small delay to ensure popup is fully rendered
    const timerId = setTimeout(setupEventListeners, 100);
    
    return () => {
      clearTimeout(timerId);
      // Cleanup event listeners using copied ref
      if (currentPopupRef) {
        const btns = currentPopupRef.querySelectorAll('[data-action]');
        btns.forEach(btn => {
          if (btn._cleanup) {
            btn._cleanup();
          }
        });
      }
    };
  }, [target, onPendalaman, onShowReghpInfo, generateShareLink]);
  
  return (
    <Popup>
      <div 
        ref={popupRef}
        style={{ color: '#e0e0e0', fontSize: '11px', fontFamily: 'monospace', minWidth: '180px', maxWidth: '200px', lineHeight: '1.3' }}
      >
        <div style={{ color: '#00d4aa', fontWeight: 'bold', marginBottom: '4px' }}>{target.phone_number}</div>
        
        {target.data.phone_model && <div>📱 {target.data.phone_model}</div>}
        {target.data.imei && <div>IMEI: {target.data.imei}</div>}
        {target.data.imsi && <div>IMSI: {target.data.imsi}</div>}
        {target.data.network && <div>Network: <span style={{ color: '#4ade80' }}>{target.data.network}</span></div>}
        {target.data.mcc && <div>MCC: {target.data.mcc}</div>}
        {target.data.lac && <div>LAC: {target.data.lac}</div>}
        {target.data.ci && <div>CI: {target.data.ci}</div>}
        
        <div style={{ marginTop: '4px', borderTop: '1px solid #333', paddingTop: '4px' }}>
          <div>Lat: <span style={{ color: '#00d4aa' }}>{target.data.latitude?.toFixed(6)}</span></div>
          <div>Long: <span style={{ color: '#00d4aa' }}>{target.data.longitude?.toFixed(6)}</span></div>
          {target.data.address && <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>{target.data.address}</div>}
        </div>
        
        <div style={{ marginTop: '6px', display: 'flex', gap: '4px' }}>
          <button
            data-action="share"
            style={{ 
              flex: 1, padding: '4px', fontSize: '10px', border: 'none', borderRadius: '3px',
              backgroundColor: copied ? '#22c55e' : '#0891b2', color: '#fff', cursor: 'pointer'
            }}
          >
            {copied ? '✓' : '📤 Share'}
          </button>
          {target.reghp_status === 'completed' ? (
            <button
              data-action="show-info"
              data-testid="show-info-button"
              style={{ flex: 1, padding: '4px', fontSize: '10px', border: 'none', borderRadius: '3px', backgroundColor: '#0891b2', color: '#fff', cursor: 'pointer' }}
            >
              📋 Info
            </button>
          ) : target.reghp_status !== 'processing' && loadingPendalaman !== target.id && (
            <button
              data-action="pendalaman"
              data-testid="pendalaman-button"
              style={{ flex: 1, padding: '4px', fontSize: '10px', border: 'none', borderRadius: '3px', backgroundColor: '#f59e0b', color: '#000', cursor: 'pointer' }}
            >
              🔍 Reghp
            </button>
          )}
        </div>
      </div>
    </Popup>
  );
};

export default TargetMarkers;
