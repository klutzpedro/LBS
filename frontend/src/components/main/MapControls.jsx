import React from 'react';
import { Button } from '@/components/ui/button';
import { 
  Layers,
  Maximize2, 
  Minimize2, 
  Eye,
  EyeOff,
  Target,
  Plus,
  MessageSquare
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { mapTiles } from './MapUtils';

/**
 * Map control buttons and overlays
 * Includes tile layer selector, maximize, marker names toggle, AOI panel toggle, drawing mode indicator
 */
export const MapControls = ({
  showMapControls,
  selectedTileLayer,
  onTileLayerChange,
  isMaximized,
  onToggleMaximize,
  showMarkerNames,
  onToggleMarkerNames,
  aoiAlerts = [],
  onOpenAOIPanel,
  drawingMode,
  drawingPoints = [],
  onFinishDrawing,
  onCancelDrawing,
  selectedCase,
  onAddTarget,
  showChatPanel,
  onShowChatPanel,
  hasActiveQueries
}) => {
  if (!showMapControls) return null;

  return (
    <div 
      className="absolute top-4 z-[1000] flex flex-col gap-2"
      style={{ 
        pointerEvents: 'auto',
        right: '16px',
        transition: 'right 300ms'
      }}
    >
      {/* Map Type Selector */}
      <div 
        className="rounded-lg border p-3"
        style={{
          backgroundColor: 'var(--background-elevated)',
          borderColor: 'var(--borders-default)',
          minWidth: '180px'
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Layers className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
          <span className="text-xs font-semibold uppercase" style={{ color: 'var(--foreground-secondary)' }}>
            Map Type
          </span>
        </div>
        <Select value={selectedTileLayer} onValueChange={onTileLayerChange}>
          <SelectTrigger 
            className="w-full"
            style={{
              backgroundColor: 'var(--background-tertiary)',
              borderColor: 'var(--borders-default)',
              color: 'var(--foreground-primary)'
            }}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            position="popper"
            side="bottom"
            align="start"
            sideOffset={5}
            className="z-[10001]"
            style={{
              backgroundColor: 'var(--background-elevated)',
              borderColor: 'var(--borders-strong)',
              color: 'var(--foreground-primary)',
              minWidth: '180px'
            }}
          >
            {Object.entries(mapTiles).map(([key, tile]) => (
              <SelectItem key={key} value={key} style={{ color: 'var(--foreground-primary)' }}>
                {tile.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Maximize Button */}
      <Button
        onClick={onToggleMaximize}
        data-testid="maximize-map-button"
        size="icon"
        className="w-10 h-10 border"
        style={{
          backgroundColor: 'var(--background-elevated)',
          borderColor: 'var(--borders-default)',
          color: 'var(--accent-primary)'
        }}
      >
        {isMaximized ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
      </Button>

      {/* Toggle Marker Names */}
      <Button
        onClick={onToggleMarkerNames}
        size="icon"
        className="w-10 h-10 border"
        title={showMarkerNames ? "Sembunyikan Nama" : "Tampilkan Nama"}
        style={{
          backgroundColor: showMarkerNames ? 'var(--accent-primary)' : 'var(--background-elevated)',
          borderColor: 'var(--borders-default)',
          color: showMarkerNames ? 'var(--background-primary)' : 'var(--accent-primary)'
        }}
      >
        {showMarkerNames ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
      </Button>

      {/* AOI Panel Toggle */}
      <Button
        onClick={onOpenAOIPanel}
        size="icon"
        className="w-10 h-10 border"
        title="Area of Interest (AOI)"
        style={{
          backgroundColor: aoiAlerts.length > 0 ? 'var(--status-error)' : 'var(--background-elevated)',
          borderColor: 'var(--borders-default)',
          color: aoiAlerts.length > 0 ? 'white' : 'var(--accent-secondary)'
        }}
      >
        <Target className="w-5 h-5" />
      </Button>

      {/* Drawing Mode Indicator */}
      {drawingMode && (
        <DrawingIndicator 
          drawingMode={drawingMode}
          drawingPoints={drawingPoints}
          onFinishDrawing={onFinishDrawing}
          onCancelDrawing={onCancelDrawing}
        />
      )}

      {/* Add Target (Floating) */}
      {selectedCase && !drawingMode && (
        <Button
          onClick={onAddTarget}
          data-testid="floating-add-target"
          className="w-12 h-12 rounded-full shadow-lg"
          style={{
            backgroundColor: 'var(--accent-primary)',
            color: 'var(--background-primary)'
          }}
        >
          <Plus className="w-6 h-6" />
        </Button>
      )}

      {/* Chat History Toggle */}
      {!drawingMode && (
        <div className="relative">
          <Button
            onClick={onShowChatPanel}
            data-testid="toggle-chat-button"
            className="w-12 h-12 rounded-full shadow-lg"
            style={{
              backgroundColor: 'var(--background-elevated)',
              color: 'var(--accent-primary)',
              border: '2px solid var(--accent-primary)'
            }}
          >
            <MessageSquare className="w-6 h-6" />
          </Button>
          {/* Red blinking indicator for active queries */}
          {hasActiveQueries && (
            <div 
              className="absolute left-1/2 transform -translate-x-1/2 w-3 h-3 rounded-full animate-pulse"
              style={{ 
                top: '-6px',
                backgroundColor: 'var(--status-error)',
                boxShadow: '0 0 12px var(--status-error)'
              }}
            />
          )}
        </div>
      )}
    </div>
  );
};

// Drawing mode indicator component
const DrawingIndicator = ({ drawingMode, drawingPoints, onFinishDrawing, onCancelDrawing }) => (
  <div 
    className="flex items-center gap-2 px-3 py-2 rounded-lg"
    style={{ 
      backgroundColor: 'var(--status-success)', 
      color: 'white'
    }}
  >
    <span className="text-xs font-semibold">
      ✏️ Drawing {drawingMode} ({drawingPoints.length} titik)
    </span>
    <Button
      size="sm"
      onClick={onFinishDrawing}
      className="h-6 px-2 text-xs"
      style={{ backgroundColor: 'white', color: 'var(--status-success)' }}
    >
      ✓ Selesai
    </Button>
    <Button
      size="sm"
      variant="ghost"
      onClick={onCancelDrawing}
      className="h-6 px-2 text-xs"
      style={{ color: 'white' }}
    >
      ✕
    </Button>
  </div>
);

/**
 * Toggle button to show/hide map controls
 */
export const MapControlsToggle = ({ showMapControls, onToggle }) => (
  <Button
    onClick={onToggle}
    size="icon"
    className="fixed bottom-4 right-4 z-[2000] w-12 h-12 rounded-full shadow-lg"
    style={{
      backgroundColor: showMapControls ? 'var(--status-error)' : 'var(--accent-primary)',
      color: 'var(--background-primary)',
      border: '2px solid',
      borderColor: showMapControls ? 'var(--status-error)' : 'var(--accent-primary)'
    }}
  >
    {showMapControls ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
  </Button>
);

export default MapControls;
