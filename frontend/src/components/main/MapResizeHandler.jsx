import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

// Component to handle map resize when maximized state changes
export const MapResizeHandler = ({ isMaximized, sidebarCollapsed }) => {
  const map = useMap();
  
  useEffect(() => {
    // Invalidate map size when maximize state or sidebar state changes
    const timeoutId = setTimeout(() => {
      map.invalidateSize({ animate: false });
    }, 100);
    
    // Also add resize observer for dynamic changes
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    
    const container = map.getContainer();
    resizeObserver.observe(container);
    
    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
    };
  }, [map, isMaximized, sidebarCollapsed]);
  
  return null;
};
