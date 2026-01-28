import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  GripHorizontal, 
  Minimize2, 
  Maximize2, 
  X,
  Search,
  History,
  Users,
  ScanFace,
  FileSearch,
  Settings
} from 'lucide-react';

const ToolsPanel = ({
  // Full Query (NonGeoint)
  onOpenFullQuery,
  onOpenFullQueryHistory,
  isInvestigating,
  
  // Face Recognition
  onOpenFaceRecognition,
  onOpenFaceRecognitionHistory,
  isFrProcessing,
  
  // Simple Query
  onOpenSimpleQuery,
  onOpenSimpleQueryHistory,
  
  // User Management (Admin)
  isAdmin,
  onOpenUserManagement,
  
  // Panel visibility
  isOpen,
  onClose
}) => {
  // Default position: below MAP TYPE selector (top-right area)
  const getDefaultPosition = () => {
    const windowWidth = window.innerWidth;
    const panelWidth = 320;
    return {
      x: windowWidth - panelWidth - 80, // 80px from right edge (space for other buttons)
      y: 120 // Below MAP TYPE selector
    };
  };

  const [position, setPosition] = useState(getDefaultPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const panelRef = useRef(null);

  // Reset position when panel opens - always return to default position
  useEffect(() => {
    if (isOpen) {
      setPosition(getDefaultPosition());
      setIsMinimized(false);
      setIsMaximized(false);
    }
  }, [isOpen]);

  // Update position on window resize
  useEffect(() => {
    const handleResize = () => {
      if (!isDragging && !isMaximized) {
        setPosition(getDefaultPosition());
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isDragging, isMaximized]);

  // Handle dragging
  const handleMouseDown = (e) => {
    if (isMaximized) return;
    setIsDragging(true);
    const rect = panelRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  const handleMouseMove = (e) => {
    if (!isDragging || isMaximized) return;
    
    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;
    
    // Keep panel within viewport
    const maxX = window.innerWidth - (panelRef.current?.offsetWidth || 320);
    const maxY = window.innerHeight - 50;
    
    setPosition({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY))
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragOffset]);

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
    if (isMaximized) setIsMaximized(false);
  };

  const toggleMaximize = () => {
    setIsMaximized(!isMaximized);
    if (isMinimized) setIsMinimized(false);
  };

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className="fixed z-[3000] shadow-2xl rounded-lg overflow-hidden"
      style={{
        left: isMaximized ? 20 : position.x,
        top: isMaximized ? 60 : position.y,
        width: isMaximized ? 'calc(100vw - 40px)' : '320px',
        backgroundColor: 'var(--background-secondary)',
        border: '1px solid var(--borders-default)',
        transition: isMaximized ? 'all 0.2s ease' : 'none'
      }}
    >
      {/* Header - Draggable */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-move select-none"
        style={{ 
          backgroundColor: 'var(--background-tertiary)',
          borderBottom: '1px solid var(--borders-default)'
        }}
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="w-4 h-4" style={{ color: 'var(--foreground-muted)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--foreground-primary)' }}>
            Tools Panel
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={toggleMinimize}
          >
            <Minimize2 className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={toggleMaximize}
          >
            <Maximize2 className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:bg-red-500/20"
            onClick={onClose}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Content - Collapsible */}
      {!isMinimized && (
        <div 
          className="p-3 space-y-3"
          style={{
            maxHeight: isMaximized ? 'calc(100vh - 150px)' : '400px',
            overflowY: 'auto'
          }}
        >
          {/* FULL QUERY Section */}
          <div 
            className="p-3 rounded-lg"
            style={{ backgroundColor: 'var(--background-tertiary)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <FileSearch className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--foreground-primary)' }}>
                FULL QUERY
              </span>
            </div>
            <p className="text-xs mb-2" style={{ color: 'var(--foreground-muted)' }}>
              Cari berdasarkan nama dengan pendalaman NIK, NKK, Passport, Perlintasan
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                style={{
                  backgroundColor: isInvestigating ? 'var(--background-tertiary)' : 'var(--accent-primary)',
                  color: isInvestigating ? 'var(--foreground-muted)' : 'var(--background-primary)'
                }}
                disabled={isInvestigating}
                onClick={onOpenFullQuery}
              >
                <Search className="w-3 h-3 mr-1" />
                {isInvestigating ? 'Processing...' : 'Cari'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onOpenFullQueryHistory}
              >
                <History className="w-3 h-3 mr-1" />
                History
              </Button>
            </div>
          </div>

          {/* FACE RECOGNITION Section */}
          <div 
            className="p-3 rounded-lg"
            style={{ backgroundColor: 'var(--background-tertiary)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <ScanFace className="w-4 h-4" style={{ color: '#f59e0b' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--foreground-primary)' }}>
                FACE RECOGNITION
              </span>
            </div>
            <p className="text-xs mb-2" style={{ color: 'var(--foreground-muted)' }}>
              Identifikasi seseorang berdasarkan foto wajah
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                style={{
                  backgroundColor: isFrProcessing ? 'var(--background-tertiary)' : '#f59e0b',
                  color: isFrProcessing ? 'var(--foreground-muted)' : '#000'
                }}
                disabled={isFrProcessing}
                onClick={onOpenFaceRecognition}
              >
                <ScanFace className="w-3 h-3 mr-1" />
                {isFrProcessing ? 'Processing...' : 'Scan'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onOpenFaceRecognitionHistory}
              >
                <History className="w-3 h-3 mr-1" />
                History
              </Button>
            </div>
          </div>

          {/* SIMPLE QUERY Section */}
          <div 
            className="p-3 rounded-lg"
            style={{ backgroundColor: 'var(--background-tertiary)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Search className="w-4 h-4" style={{ color: '#10b981' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--foreground-primary)' }}>
                SIMPLE QUERY
              </span>
            </div>
            <p className="text-xs mb-2" style={{ color: 'var(--foreground-muted)' }}>
              Query tunggal: NIK, NKK, Plat Nomor, Passport, dll
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                style={{
                  backgroundColor: '#10b981',
                  color: '#000'
                }}
                onClick={onOpenSimpleQuery}
              >
                <Search className="w-3 h-3 mr-1" />
                Query
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onOpenSimpleQueryHistory}
              >
                <History className="w-3 h-3 mr-1" />
                History
              </Button>
            </div>
          </div>

          {/* USER MANAGEMENT Section (Admin Only) */}
          {isAdmin && (
            <div 
              className="p-3 rounded-lg"
              style={{ backgroundColor: 'var(--background-tertiary)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4" style={{ color: '#8b5cf6' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--foreground-primary)' }}>
                  USER MANAGEMENT
                </span>
              </div>
              <p className="text-xs mb-2" style={{ color: 'var(--foreground-muted)' }}>
                Kelola user, approval pendaftaran baru
              </p>
              <Button
                size="sm"
                className="w-full"
                style={{
                  backgroundColor: '#8b5cf6',
                  color: '#fff'
                }}
                onClick={onOpenUserManagement}
              >
                <Settings className="w-3 h-3 mr-1" />
                Buka User Management
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Minimized State - Show just icons */}
      {isMinimized && (
        <div className="p-2 flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="p-2"
            onClick={onOpenFullQuery}
            title="FULL QUERY"
            disabled={isInvestigating}
          >
            <FileSearch className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="p-2"
            onClick={onOpenFaceRecognition}
            title="Face Recognition"
            disabled={isFrProcessing}
          >
            <ScanFace className="w-4 h-4" style={{ color: '#f59e0b' }} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="p-2"
            onClick={onOpenSimpleQuery}
            title="Simple Query"
          >
            <Search className="w-4 h-4" style={{ color: '#10b981' }} />
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              variant="ghost"
              className="p-2"
              onClick={onOpenUserManagement}
              title="User Management"
            >
              <Users className="w-4 h-4" style={{ color: '#8b5cf6' }} />
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

// Toggle Button to show/hide Tools Panel
export const ToolsPanelToggle = ({ onClick, isOpen }) => {
  return (
    <Button
      onClick={onClick}
      className="shadow-lg"
      style={{
        backgroundColor: isOpen ? 'var(--accent-primary)' : 'var(--background-secondary)',
        color: isOpen ? 'var(--background-primary)' : 'var(--foreground-primary)',
        border: '1px solid var(--borders-default)'
      }}
    >
      <Settings className="w-4 h-4 mr-2" />
      Tools
    </Button>
  );
};

export default ToolsPanel;
