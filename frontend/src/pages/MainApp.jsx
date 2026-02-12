import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTelegram } from '@/context/TelegramContext';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { MapPin, Plus, FolderOpen, Minimize2, LogOut, AlertTriangle, X } from 'lucide-react';
import { HistoryDialog } from '@/components/HistoryDialog';
import { AOIPanel, AOIAlertNotification } from '@/components/AOIComponents';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Import refactored components
import { 
  mapTiles, 
  MapResizeHandler, 
  generateTargetPDF, 
  generateCasePDF,
  Sidebar,
  ChatDialog,
  MapControls,
  MapControlsToggle,
  HistoryPathRenderer,
  AOIRenderer,
  DrawingOverlay,
  TargetMarkers,
  NewCaseDialog,
  AddTargetDialog,
  DuplicatePhoneDialog,
  ScheduleDialog,
  ReghpInfoDialog,
  NikInfoDialog,
  FamilyTreeDialog,
  UserManagementDialog,
  SimpleQueryDialog,
  SimpleQueryHistoryDialog,
  ToolsPanel,
  ToolsPanelToggle
} from '@/components/main';

// NON GEOINT Search
import { NonGeointSearchDialog, NonGeointHistoryDialog } from '@/components/main/NonGeointSearch';

// Face Recognition
import { FaceRecognitionDialog, FaceRecognitionHistoryDialog } from '@/components/main/FaceRecognition';

const MainApp = () => {
  const { username, logout, isAdmin, sessionCheckFailed, acknowledgeSessionInvalid } = useAuth();
  const { telegramAuthorized, telegramUser } = useTelegram();
  const navigate = useNavigate();
  
  // Core state
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [targets, setTargets] = useState([]);
  const [isMaximized, setIsMaximized] = useState(false);
  const [selectedTileLayer, setSelectedTileLayer] = useState('street');
  
  // Dialog states
  const [addTargetDialog, setAddTargetDialog] = useState(false);
  const [newCaseDialog, setNewCaseDialog] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');
  const [newPhoneNumber, setNewPhoneNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [selectedTargetForChat, setSelectedTargetForChat] = useState(null);
  
  // Map state - Default zoomed to show West Java (Jawa Barat)
  const [mapCenter, setMapCenter] = useState([-6.6, 107.0]); // West Java center
  const [mapZoom, setMapZoom] = useState(9); // Zoom to show West Java
  const [mapKey, setMapKey] = useState(0);
  
  // Pendalaman dialogs
  const [reghpDialogOpen, setReghpDialogOpen] = useState(false);
  const [selectedReghpTarget, setSelectedReghpTarget] = useState(null);
  const [nikDialogOpen, setNikDialogOpen] = useState(false);
  const [selectedNikData, setSelectedNikData] = useState(null);
  
  // NON GEOINT Search
  const [nonGeointDialogOpen, setNonGeointDialogOpen] = useState(false);
  const [nonGeointHistoryOpen, setNonGeointHistoryOpen] = useState(false);
  const [selectedNonGeointSearch, setSelectedNonGeointSearch] = useState(null);
  const [isGlobalInvestigating, setIsGlobalInvestigating] = useState(false); // Track if any investigation is running
  const [currentInvestigationSearchId, setCurrentInvestigationSearchId] = useState(null); // Track which search is being investigated
  
  // Request status for query locking
  const [requestStatus, setRequestStatus] = useState({ is_busy: false, username: null, operation: null });
  const [telegramConnected, setTelegramConnected] = useState(false);
  
  // Face Recognition
  const [frDialogOpen, setFrDialogOpen] = useState(false);
  const [frHistoryOpen, setFrHistoryOpen] = useState(false);
  const [isFrProcessing, setIsFrProcessing] = useState(false);
  
  // User Management (Admin only)
  const [userManagementOpen, setUserManagementOpen] = useState(false);
  
  // Simple Query
  const [simpleQueryOpen, setSimpleQueryOpen] = useState(false);
  const [simpleQueryHistoryOpen, setSimpleQueryHistoryOpen] = useState(false);
  const [selectedSimpleQueryHistory, setSelectedSimpleQueryHistory] = useState(null);
  
  // Tools Panel
  const [toolsPanelOpen, setToolsPanelOpen] = useState(true); // Open by default
  const [toolsPanelWasOpen, setToolsPanelWasOpen] = useState(false); // Track if panel was open before dialog
  const dialogTransitionRef = useRef(false); // Track if we're transitioning between dialogs

  // Search and duplicate
  const [searchQuery, setSearchQuery] = useState('');
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [existingTarget, setExistingTarget] = useState(null);
  const [pendingPhoneNumber, setPendingPhoneNumber] = useState('');
  
  // Schedule
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedTargetForSchedule, setSelectedTargetForSchedule] = useState(null);
  const [scheduleInterval, setScheduleInterval] = useState({ type: 'specific_time', value: 1, scheduledTime: '07:00' });
  
  // UI state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeSchedules, setActiveSchedules] = useState([]);
  const [showMarkerNames, setShowMarkerNames] = useState(false);
  const [visibleTargets, setVisibleTargets] = useState(new Set());
  const [familyTreeDialogOpen, setFamilyTreeDialogOpen] = useState(false);
  const [selectedFamilyData, setSelectedFamilyData] = useState(null);
  const [targetNikForTree, setTargetNikForTree] = useState(null);
  const [showMapControls, setShowMapControls] = useState(true);
  const [printingTarget, setPrintingTarget] = useState(null);
  const [printingCase, setPrintingCase] = useState(false);
  const mapContainerRef = useRef(null);
  
  // History states
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedTargetForHistory, setSelectedTargetForHistory] = useState(null);
  const [historyPaths, setHistoryPaths] = useState({});
  const [activeHistoryTargets, setActiveHistoryTargets] = useState([]);
  
  // AOI states
  const [aoiPanelOpen, setAoiPanelOpen] = useState(false);
  const [aois, setAois] = useState([]);
  const [aoiAlerts, setAoiAlerts] = useState([]);
  const [drawingMode, setDrawingMode] = useState(null);
  const [drawingPoints, setDrawingPoints] = useState([]);
  const [drawingColor, setDrawingColor] = useState('#00D9FF'); // Default cyan for AOI drawing
  
  // Global process queue
  const [globalProcessing, setGlobalProcessing] = useState(false);
  const [globalProcessType, setGlobalProcessType] = useState(null);
  
  // Track executing schedules
  const executingSchedulesRef = useRef(new Set());
  
  // Track targets for polling (to avoid stale closure issues)
  const targetsRef = useRef([]);
  
  // Loading states
  const [loadingPendalaman, setLoadingPendalaman] = useState(null);
  const [loadingNikPendalaman, setLoadingNikPendalaman] = useState(null);
  const [loadingFamilyPendalaman, setLoadingFamilyPendalaman] = useState(null);

  // Check if any process is running
  const isProcessRunning = () => {
    return globalProcessing || loadingPendalaman || loadingNikPendalaman || loadingFamilyPendalaman;
  };

  const showBusyNotification = () => {
    toast.warning('PROSES LAIN SEDANG BERLANGSUNG, MOHON MENUNGGU HINGGA SELESAI', { duration: 3000 });
  };

  // Reset all processing states (for stuck processes)
  const handleResetProcessing = () => {
    console.log('[Reset Processing] Resetting all processing states');
    setGlobalProcessing(false);
    setGlobalProcessType(null);
    setLoadingPendalaman(null);
    setLoadingNikPendalaman(null);
    setLoadingFamilyPendalaman(null);
    toast.info('Processing state direset. Silakan coba lagi.');
  };

  // Handle tile layer change
  const handleTileLayerChange = (newTile) => {
    setSelectedTileLayer(newTile);
    setMapKey(prev => prev + 1);
  };

  // ============== PDF Export ==============
  const handlePrintTarget = async (target) => {
    setPrintingTarget(target.id);
    try {
      const targetCopy = JSON.parse(JSON.stringify(target));
      let mapScreenshot = null;
      
      if (target.data?.latitude && target.data?.longitude) {
        const lat = parseFloat(target.data.latitude);
        const lng = parseFloat(target.data.longitude);
        const prevCenter = mapCenter;
        const prevZoom = mapZoom;
        
        setMapCenter([lat, lng]);
        setMapZoom(16);
        setMapKey(prev => prev + 1);
        
        toast.info('Mengambil screenshot peta...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        if (mapContainerRef.current) {
          try {
            const canvas = await html2canvas(mapContainerRef.current, {
              useCORS: true, allowTaint: true, backgroundColor: '#121212',
              scale: 1, logging: false, imageTimeout: 5000
            });
            mapScreenshot = canvas.toDataURL('image/jpeg', 0.85);
          } catch (e) {
            console.warn('Map screenshot failed:', e);
          }
        }
        
        setMapCenter(prevCenter);
        setMapZoom(prevZoom);
        setMapKey(prev => prev + 1);
      }
      
      await generateTargetPDF(targetCopy, mapScreenshot);
      toast.success('PDF berhasil di-download');
    } catch (error) {
      console.error('PDF generation failed:', error);
      toast.error('Gagal generate PDF: ' + (error?.message || 'Unknown error'));
    } finally {
      setPrintingTarget(null);
    }
  };

  const handlePrintCase = async () => {
    if (!selectedCase || filteredTargets.length === 0) {
      toast.error('Tidak ada target untuk di-export');
      return;
    }
    setPrintingCase(true);
    try {
      const targetsCopy = JSON.parse(JSON.stringify(filteredTargets));
      const caseNameCopy = selectedCase.name;
      const mapScreenshots = {};
      const prevCenter = mapCenter;
      const prevZoom = mapZoom;
      
      toast.info(`Mengambil screenshot peta untuk ${targetsCopy.length} target...`);
      
      for (const target of targetsCopy) {
        if (target.data?.latitude && target.data?.longitude) {
          const lat = parseFloat(target.data.latitude);
          const lng = parseFloat(target.data.longitude);
          
          setMapCenter([lat, lng]);
          setMapZoom(16);
          setMapKey(prev => prev + 1);
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          if (mapContainerRef.current) {
            try {
              const canvas = await html2canvas(mapContainerRef.current, {
                useCORS: true, allowTaint: true, backgroundColor: '#121212',
                scale: 1, logging: false, imageTimeout: 5000
              });
              mapScreenshots[target.id] = canvas.toDataURL('image/jpeg', 0.85);
            } catch (e) {
              console.warn('Map screenshot failed for target:', target.id, e);
            }
          }
        }
      }
      
      setMapCenter(prevCenter);
      setMapZoom(prevZoom);
      setMapKey(prev => prev + 1);
      
      await generateCasePDF(caseNameCopy, targetsCopy, mapScreenshots);
      toast.success('PDF Case berhasil di-download');
    } catch (error) {
      console.error('PDF generation failed:', error);
      toast.error('Gagal generate PDF Case: ' + (error?.message || 'Unknown error'));
    } finally {
      setPrintingCase(false);
    }
  };

  // ============== Data Fetching ==============
  // Refresh all data when username changes (login/logout)
  useEffect(() => {
    if (username) {
      console.log('[MainApp] User logged in, fetching data...');
      // Fetch data with small delays to prevent overwhelming the server
      fetchCases();
      setTimeout(() => fetchSchedules(), 200);
      setTimeout(() => fetchAOIs(), 400);
      setTimeout(() => fetchAOIAlerts(), 600);
    }
  }, [username]);

  // Helper function for retrying failed requests
  const fetchWithRetry = async (fetchFn, maxRetries = 3, delay = 1000) => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fetchFn();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        console.log(`[Retry] Attempt ${i + 1} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  };

  const fetchAOIs = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/aois`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAois(response.data.aois || []);
    } catch (error) {
      console.error('Failed to fetch AOIs:', error);
    }
  };

  const fetchAOIAlerts = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/aoi-alerts?acknowledged=false`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAoiAlerts(response.data.alerts || []);
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    }
  };

  useEffect(() => {
    const interval = setInterval(fetchAOIAlerts, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleAcknowledgeAlert = async (alertId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/aoi-alerts/${alertId}/acknowledge`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchAOIAlerts();
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
    }
  };

  const handleAcknowledgeAllAlerts = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/aoi-alerts/acknowledge-all`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchAOIAlerts();
      toast.success('Semua alert di-acknowledge');
    } catch (error) {
      console.error('Failed to acknowledge all alerts:', error);
    }
  };

  // ============== History Handlers ==============
  const handleShowHistoryPath = (historyData, targetId = null) => {
    if (historyData && historyData.length > 0 && targetId) {
      const sortedData = [...historyData].sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      );
      
      const pathData = sortedData.map(h => ({
        lat: h.latitude,
        lng: h.longitude,
        timestamp: h.timestamp,
        address: h.address
      }));
      
      setHistoryPaths(prev => ({ ...prev, [targetId]: pathData }));
      setActiveHistoryTargets(prev => {
        if (!prev.includes(targetId)) return [...prev, targetId];
        return prev;
      });
      
      setMapCenter([sortedData[0].latitude, sortedData[0].longitude]);
      setMapZoom(14);
      setMapKey(prev => prev + 1);
      
      const target = targets.find(t => t.id === targetId);
      const phone = target?.phone_number?.slice(-6) || targetId.slice(-6);
      toast.success(`Menampilkan ${historyData.length} titik riwayat posisi (${phone})`);
    }
  };

  const hideTargetHistory = (targetId) => {
    setHistoryPaths(prev => {
      const newPaths = { ...prev };
      delete newPaths[targetId];
      return newPaths;
    });
    setActiveHistoryTargets(prev => prev.filter(id => id !== targetId));
    
    const target = targets.find(t => t.id === targetId);
    const phone = target?.phone_number?.slice(-6) || targetId.slice(-6);
    toast.info(`History ${phone} disembunyikan`);
  };

  const refreshHistoryPath = async (targetId) => {
    if (activeHistoryTargets.includes(targetId)) {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API}/targets/${targetId}/history`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.data.history && response.data.history.length > 0) {
          const pathData = response.data.history.map(h => ({
            lat: h.latitude,
            lng: h.longitude,
            timestamp: h.timestamp,
            address: h.address
          }));
          setHistoryPaths(prev => ({ ...prev, [targetId]: pathData }));
          toast.info('History path diperbarui dengan posisi terbaru');
        }
      } catch (error) {
        console.error('Failed to refresh history:', error);
      }
    }
  };

  // ============== AOI Drawing ==============
  const handleStartDrawing = (type) => {
    setDrawingMode(type);
    setDrawingPoints([]);
    toast.info(`Klik pada peta untuk menggambar ${type}. Double-click untuk selesai.`, { duration: 5000 });
  };

  const handleMapClickForDrawing = (latlng) => {
    if (!drawingMode) return;
    
    const newPoint = [latlng.lat, latlng.lng];
    setDrawingPoints(prev => [...prev, newPoint]);
    
    if (drawingMode === 'circle' && drawingPoints.length === 0) {
      toast.info('Klik lagi untuk menentukan radius lingkaran');
    }
  };

  const handleFinishDrawing = async () => {
    if (!drawingMode || drawingPoints.length === 0) {
      setDrawingMode(null);
      setDrawingPoints([]);
      return;
    }

    const savedDrawingMode = drawingMode;
    
    try {
      const token = localStorage.getItem('token');
      let payload = {
        name: `AOI ${new Date().toLocaleString('id-ID')}`,
        aoi_type: drawingMode,
        is_visible: false,
        alarm_enabled: true,
        monitored_targets: [],
        color: drawingColor // Include selected color
      };

      if (drawingMode === 'polygon') {
        if (drawingPoints.length < 3) {
          toast.error('Polygon membutuhkan minimal 3 titik');
          setDrawingMode(null);
          setDrawingPoints([]);
          return;
        }
        payload.coordinates = drawingPoints;
      } else if (drawingMode === 'circle') {
        if (drawingPoints.length < 2) {
          toast.error('Klik lagi untuk menentukan radius');
          return;
        }
        const center = drawingPoints[0];
        const edge = drawingPoints[1];
        const R = 6371000;
        const lat1 = center[0] * Math.PI / 180;
        const lat2 = edge[0] * Math.PI / 180;
        const deltaLat = (edge[0] - center[0]) * Math.PI / 180;
        const deltaLng = (edge[1] - center[1]) * Math.PI / 180;
        const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
                  Math.cos(lat1) * Math.cos(lat2) *
                  Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const radius = R * c;
        
        payload.coordinates = center;
        payload.radius = Math.round(radius);
      }

      setDrawingMode(null);
      setDrawingPoints([]);

      const currentAOICount = aois.length;

      try {
        const response = await axios.post(`${API}/aois`, payload, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 30000
        });

        if (response.data && response.data.aoi) {
          toast.success(`AOI ${savedDrawingMode} berhasil dibuat!`);
          await fetchAOIs();
        } else {
          toast.success(`AOI berhasil dibuat!`);
          await fetchAOIs();
        }
      } catch (requestError) {
        console.log('AOI request error, verifying creation with polling...', requestError.message);
        
        const verifyAOICreation = async (retries = 3, delay = 1500) => {
          for (let i = 0; i < retries; i++) {
            await new Promise(resolve => setTimeout(resolve, delay));
            try {
              const checkResponse = await axios.get(`${API}/aois`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              const newAOICount = checkResponse.data?.length || 0;
              
              if (newAOICount > currentAOICount) {
                setAois(checkResponse.data);
                toast.success(`AOI ${savedDrawingMode} berhasil dibuat!`);
                return true;
              }
            } catch (pollError) {
              console.log('Polling attempt failed:', pollError.message);
            }
          }
          return false;
        };
        
        const wasCreated = await verifyAOICreation();
        if (!wasCreated) {
          toast.error('Gagal membuat AOI. Silakan coba lagi.');
        }
      }
      
    } catch (error) {
      console.error('Failed to create AOI:', error);
      toast.error('Gagal membuat AOI: ' + (error.response?.data?.detail || error.message));
      setDrawingMode(null);
      setDrawingPoints([]);
      fetchAOIs();
    }
  };

  const handleCancelDrawing = () => {
    setDrawingMode(null);
    setDrawingPoints([]);
    toast.info('Drawing dibatalkan');
  };

  // Map click handler component
  const MapClickHandler = () => {
    useMapEvents({
      click: (e) => {
        if (drawingMode) handleMapClickForDrawing(e.latlng);
      },
      dblclick: (e) => {
        if (drawingMode) {
          e.originalEvent.preventDefault();
          handleFinishDrawing();
        }
      },
      contextmenu: (e) => {
        if (drawingMode) {
          e.originalEvent.preventDefault();
          handleCancelDrawing();
        }
      }
    });
    return null;
  };

  // ============== Stuck Process Detection ==============
  const checkAndResetStuckProcesses = async () => {
    for (const target of targets) {
      let hasStuck = false;
      
      if (target.reghp_status === 'processing' || target.family_status === 'processing') {
        hasStuck = true;
      }
      
      const nikQueries = target.nik_queries || {};
      for (const [nik, nikData] of Object.entries(nikQueries)) {
        if (nikData.status === 'processing' || nikData.family_status === 'processing') {
          hasStuck = true;
          break;
        }
      }
      
      if (hasStuck) {
        try {
          await axios.post(`${API}/targets/${target.id}/reset-stuck`);
          console.log(`Reset stuck processes for ${target.phone_number}`);
        } catch (error) {
          console.error('Reset stuck error:', error);
        }
      }
    }
  };

  useEffect(() => {
    const stuckCheckInterval = setInterval(() => {
      if (!globalProcessing) checkAndResetStuckProcesses();
    }, 120000);
    return () => clearInterval(stuckCheckInterval);
  }, [targets, globalProcessing]);

  // ============== Target/Case Fetching ==============
  
  // Keep targetsRef in sync with targets state
  useEffect(() => {
    targetsRef.current = targets;
  }, [targets]);
  
  // Track previous targets for status change detection
  const prevTargetsRef = useRef([]);
  
  useEffect(() => {
    if (selectedCase) {
      fetchTargets(selectedCase.id);
      // Poll every 5 seconds when there's a processing target
      // Use ref to get current targets instead of closure
      const interval = setInterval(() => {
        const currentTargets = targetsRef.current;
        const hasProcessing = currentTargets.some(t => 
          t.status === 'processing' || 
          t.reghp_status === 'processing' ||
          Object.values(t.nik_queries || {}).some(nq => nq.status === 'processing')
        );
        if (hasProcessing) {
          console.log('[Polling] Has processing targets, fetching...');
          fetchTargets(selectedCase.id);
        }
      }, 5000); // Reduced from 10s to 5s for better responsiveness
      return () => clearInterval(interval);
    }
  }, [selectedCase]);

  useEffect(() => {
    const completedTargets = targets.filter(t => t.status === 'completed' && t.data);
    if (completedTargets.length > 0) {
      const allCompletedIds = new Set(completedTargets.map(t => t.id));
      setVisibleTargets(allCompletedIds);
    }
  }, [targets, selectedCase]);

  // Detect status changes and show toast notifications
  useEffect(() => {
    const prevTargets = prevTargetsRef.current;
    
    targets.forEach(target => {
      const prevTarget = prevTargets.find(t => t.id === target.id);
      
      // Only show toast if we have previous state to compare
      if (prevTarget) {
        if (target.status === 'completed' && prevTarget.status === 'processing') {
          toast.success(`✓ Lokasi ${target.phone_number} ditemukan!`);
        }
        if (target.status === 'not_found' && prevTarget.status === 'processing') {
          toast.warning(`⚠ Target ${target.phone_number} tidak ditemukan atau sedang OFF`);
        }
        if (target.status === 'error' && prevTarget.status === 'processing') {
          toast.error(`✗ Query gagal untuk ${target.phone_number}`);
        }
      }
    });
    
    // Update prev targets ref for next comparison
    prevTargetsRef.current = targets;
  }, [targets]);

  useEffect(() => {
    if (selectedTargetForChat) {
      fetchChatMessages(selectedTargetForChat);
      const interval = setInterval(() => fetchChatMessages(selectedTargetForChat), 2000);
      return () => clearInterval(interval);
    }
  }, [selectedTargetForChat]);

  // Poll request status every 3 seconds to update IDLE/BUSY indicator
  useEffect(() => {
    // Initial fetch
    checkRequestStatus();
    
    // Poll every 3 seconds
    const statusInterval = setInterval(() => {
      checkRequestStatus();
    }, 3000);
    
    return () => clearInterval(statusInterval);
  }, []);

  // Check Telegram status periodically
  useEffect(() => {
    const checkTelegramStatus = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        
        const response = await axios.get(`${API}/telegram/status`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000
        });
        setTelegramConnected(response.data.authorized || response.data.connected);
      } catch (err) {
        // Don't update state on error - keep last known status
      }
    };
    
    checkTelegramStatus();
    const tgInterval = setInterval(checkTelegramStatus, 10000); // Check every 10 seconds
    
    return () => clearInterval(tgInterval);
  }, []);

  const fetchCases = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/cases`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000  // 15 second timeout
      });
      const activeCases = response.data.filter(c => c.status === 'active');
      setCases(activeCases);
      if (activeCases.length > 0 && !selectedCase) {
        setSelectedCase(activeCases[0]);
      }
    } catch (error) {
      console.error('Failed to load cases:', error);
      // Retry once after 2 seconds if failed
      if (!error.config?._retry) {
        setTimeout(async () => {
          try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API}/cases`, {
              headers: { Authorization: `Bearer ${token}` },
              timeout: 15000,
              _retry: true
            });
            const activeCases = response.data.filter(c => c.status === 'active');
            setCases(activeCases);
            if (activeCases.length > 0 && !selectedCase) {
              setSelectedCase(activeCases[0]);
            }
          } catch (retryError) {
            console.error('Retry failed for cases:', retryError);
          }
        }, 2000);
      }
    }
  };

  // Check request status - returns true if system is idle
  const checkRequestStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/request-status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setRequestStatus(data);
      return data;
    } catch (error) {
      console.error('Failed to check request status:', error);
      return { is_busy: false };
    }
  };

  // Validate if user can perform query - returns true if allowed
  const canPerformQuery = async () => {
    const status = await checkRequestStatus();
    if (status.is_busy) {
      toast.error(`Sistem sedang digunakan oleh ${status.username || 'user lain'} untuk ${status.operation || 'query'}. Silakan tunggu.`, {
        duration: 5000,
        icon: '🚫'
      });
      return false;
    }
    return true;
  };

  const fetchTargets = async (caseId) => {
    if (!caseId) return;
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/targets?case_id=${caseId}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000  // 15 second timeout
      });
      setTargets(response.data);
    } catch (error) {
      console.error('Failed to load targets:', error);
      // Retry once after 2 seconds
      setTimeout(async () => {
        try {
          const token = localStorage.getItem('token');
          const response = await axios.get(`${API}/targets?case_id=${caseId}`, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 15000
          });
          setTargets(response.data);
        } catch (retryError) {
          console.error('Retry failed for targets:', retryError);
        }
      }, 2000);
    }
  };

  const fetchChatMessages = async (targetId) => {
    try {
      const response = await axios.get(`${API}/targets/${targetId}/chat`);
      setChatMessages(response.data);
    } catch (error) {
      console.error('Failed to load chat:', error);
    }
  };

  const fetchSchedules = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/schedules`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000  // 15 second timeout
      });
      setActiveSchedules(response.data);
    } catch (error) {
      console.error('Failed to load schedules:', error);
      // Retry once after 2 seconds
      setTimeout(async () => {
        try {
          const token = localStorage.getItem('token');
          const response = await axios.get(`${API}/schedules`, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 15000
          });
          setActiveSchedules(response.data);
        } catch (retryError) {
          console.error('Retry failed for schedules:', retryError);
        }
      }, 2000);
    }
  };

  // ============== Schedule Handlers ==============
  const handleCountdownEnd = async (scheduleId) => {
    if (!scheduleId) return;
    if (executingSchedulesRef.current.has(scheduleId)) return;
    
    // Check if schedule still exists before executing
    const scheduleExists = activeSchedules.find(s => s.id === scheduleId && s.active);
    if (!scheduleExists) {
      console.log(`[Schedule] Schedule ${scheduleId} no longer exists or is inactive, skipping execution`);
      return;
    }
    
    executingSchedulesRef.current.add(scheduleId);
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API}/schedules/${scheduleId}/execute`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.info(`Memperbarui posisi...`, { duration: 3000 });
      fetchSchedules();
      
      // Poll for completion - less frequent to reduce UI updates
      const pollInterval = setInterval(async () => {
        try {
          const pollToken = localStorage.getItem('token');
          const targetsRes = await axios.get(`${API}/targets`, {
            headers: { Authorization: `Bearer ${pollToken}` }
          });
          const updatedTarget = targetsRes.data.find(t => t.id === response.data.target_id);
          
          if (updatedTarget && updatedTarget.status === 'completed') {
            clearInterval(pollInterval);
            
            // Update targets state WITHOUT re-fetching everything
            setTargets(prev => prev.map(t => 
              t.id === updatedTarget.id ? updatedTarget : t
            ));
            
            toast.success(`Posisi ${updatedTarget.phone_number} diperbarui!`, { duration: 2000 });
            executingSchedulesRef.current.delete(scheduleId);
            
            // Update chat target if it's the one being refreshed
            if (selectedTargetForChat === updatedTarget.id) {
              // Target data is already updated in the targets array above
              // No need to set separate state
            }
            
            // Smooth pan to new position WITHOUT remounting the map
            if (updatedTarget.data?.latitude && updatedTarget.data?.longitude) {
              setMapCenter([parseFloat(updatedTarget.data.latitude), parseFloat(updatedTarget.data.longitude)]);
              // Don't change mapKey - this prevents full map re-render
            }
            
            // Refresh history path in background (silent)
            refreshHistoryPath(response.data.target_id).catch(() => {});
            
          } else if (updatedTarget && (updatedTarget.status === 'error' || updatedTarget.status === 'not_found')) {
            clearInterval(pollInterval);
            executingSchedulesRef.current.delete(scheduleId);
            // Silent fail - no toast for scheduled updates that fail
            console.log(`[Schedule] Update failed for ${updatedTarget.phone_number}: ${updatedTarget.status}`);
          }
        } catch (pollError) {
          console.error('Poll error:', pollError);
        }
      }, 8000); // Poll every 8 seconds instead of 5
      
      // Timeout after 2 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        executingSchedulesRef.current.delete(scheduleId);
      }, 120000);
      
    } catch (error) {
      console.error('Failed to execute schedule:', error);
      // Only show error if it's a quota issue
      if (error.response?.data?.detail?.includes('Quota')) {
        toast.error('Quota CP API habis');
      }
      executingSchedulesRef.current.delete(scheduleId);
    }
  };

  const handleCancelSchedule = async (scheduleId) => {
    if (!window.confirm('Batalkan penjadwalan?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/schedules/${scheduleId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Remove from executing schedules if it was running
      executingSchedulesRef.current.delete(scheduleId);
      
      // Immediately update local state to remove the schedule
      setActiveSchedules(prev => prev.filter(s => s.id !== scheduleId));
      
      toast.success('Penjadwalan dibatalkan');
      // Also fetch from server to ensure sync
      fetchSchedules();
    } catch (error) {
      console.error('Cancel schedule error:', error);
      toast.error('Gagal membatalkan penjadwalan: ' + (error.response?.data?.detail || error.message));
    }
  };

  // ============== Target Visibility ==============
  const toggleTargetVisibility = (targetId) => {
    const newVisible = new Set(visibleTargets);
    if (newVisible.has(targetId)) {
      newVisible.delete(targetId);
    } else {
      newVisible.add(targetId);
    }
    setVisibleTargets(newVisible);
  };

  // ============== CRUD Handlers ==============
  const handleDeleteCase = async (caseItem) => {
    if (!window.confirm(`Hapus case "${caseItem.name}"?\n\nSemua target dan data dalam case ini akan terhapus permanent.`)) return;
    
    try {
      await axios.delete(`${API}/cases/${caseItem.id}`);
      toast.success('Case berhasil dihapus');
      fetchCases();
      if (selectedCase?.id === caseItem.id) {
        setSelectedCase(null);
        setTargets([]);
      }
    } catch (error) {
      toast.error('Gagal menghapus case');
    }
  };

  const handleDeleteTarget = async (target) => {
    if (!window.confirm(`Hapus target ${target.phone_number}?\n\nSemua data (lokasi, Reghp, NIK, foto) akan terhapus permanent.`)) return;
    
    try {
      await axios.delete(`${API}/targets/${target.id}`);
      toast.success('Target berhasil dihapus');
      fetchTargets(selectedCase.id);
      
      const newVisible = new Set(visibleTargets);
      newVisible.delete(target.id);
      setVisibleTargets(newVisible);
      
      if (selectedTargetForChat === target.id) {
        setSelectedTargetForChat(null);
        setChatMessages([]);
      }
    } catch (error) {
      toast.error('Gagal menghapus target');
    }
  };

  const handleCreateCase = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const response = await axios.post(`${API}/cases`, { name: newCaseName, description: '' });
      toast.success('Case created');
      setNewCaseDialog(false);
      setNewCaseName('');
      fetchCases();
      setSelectedCase(response.data);
    } catch (error) {
      toast.error('Failed to create case');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddTarget = async (e) => {
    e.preventDefault();
    if (!newPhoneNumber.startsWith('62')) {
      toast.error('Nomor harus dimulai dengan 62');
      return;
    }
    
    const existing = targets.find(t => t.phone_number === newPhoneNumber);
    
    if (existing) {
      setExistingTarget(existing);
      setPendingPhoneNumber(newPhoneNumber);
      setDuplicateDialogOpen(true);
      setAddTargetDialog(false);
      
      if (existing.data?.latitude && existing.data?.longitude) {
        handleTargetClick(existing);
      }
      return;
    }
    
    await createNewTarget(newPhoneNumber);
  };

  const createNewTarget = async (phoneNumber) => {
    // Check if system is busy before starting query
    const canQuery = await canPerformQuery();
    if (!canQuery) {
      return;
    }
    
    setSubmitting(true);
    try {
      const response = await axios.post(`${API}/targets`, {
        case_id: selectedCase.id,
        phone_number: phoneNumber
      });
      
      // IMMEDIATELY add target to list for real-time feedback
      const newTarget = response.data;
      setTargets(prev => {
        const exists = prev.some(t => t.id === newTarget.id);
        if (!exists) {
          return [...prev, newTarget];
        }
        return prev;
      });
      
      toast.info(`📍 Query posisi ${phoneNumber} dimulai...`, { duration: 3000 });
      setAddTargetDialog(false);
      setNewPhoneNumber('');
      setSelectedTargetForChat(newTarget.id);
      
      // Start polling for query completion - faster polling for better real-time feel
      const targetId = newTarget.id;
      const token = localStorage.getItem('token');
      let attempts = 0;
      const maxAttempts = 45; // Increased max attempts
      
      const pollInterval = setInterval(async () => {
        attempts++;
        try {
          const pollResponse = await axios.get(`${API}/targets/${targetId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const updatedTarget = pollResponse.data;
          
          // Update targets state immediately with any new data
          setTargets(prev => {
            const exists = prev.some(t => t.id === targetId);
            if (exists) {
              return prev.map(t => t.id === targetId ? updatedTarget : t);
            } else {
              return [...prev, updatedTarget];
            }
          });
          
          if (updatedTarget.status === 'completed' || updatedTarget.status === 'not_found' || updatedTarget.status === 'error') {
            clearInterval(pollInterval);
            
            // Automatically add to visible targets if completed with data
            if (updatedTarget.status === 'completed' && updatedTarget.data?.latitude) {
              setVisibleTargets(prev => new Set([...prev, targetId]));
            }
            
            if (updatedTarget.data?.latitude && updatedTarget.data?.longitude) {
              // Smoothly pan to new location
              setMapCenter([parseFloat(updatedTarget.data.latitude), parseFloat(updatedTarget.data.longitude)]);
              setMapZoom(15);
              setMapKey(prev => prev + 1);
              toast.success(`✓ Lokasi ${phoneNumber} ditemukan!`, { duration: 4000 });
            } else if (updatedTarget.status === 'not_found') {
              toast.warning(`⚠ Target ${phoneNumber} tidak ditemukan atau sedang OFF`);
            } else if (updatedTarget.status === 'error') {
              toast.error(`✗ Query gagal untuk ${phoneNumber}`);
            }
          } else if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
            await fetchTargets(selectedCase.id);
            toast.warning('Query timeout, silakan cek status target');
          }
        } catch (pollError) {
          console.error('Poll error:', pollError);
        }
      }, 1500); // Faster polling - 1.5 seconds for better real-time feel
      
    } catch (error) {
      // Handle duplicate phone error (409)
      if (error.response?.status === 409 && error.response?.data?.detail?.error === 'duplicate_phone') {
        const existingId = error.response.data.detail.existing_target_id;
        const existingTgt = targets.find(t => t.id === existingId);
        if (existingTgt) {
          setExistingTarget(existingTgt);
          setPendingPhoneNumber(phoneNumber);
          setDuplicateDialogOpen(true);
          setAddTargetDialog(false);
        } else {
          toast.error(error.response.data.detail.message);
        }
      } else {
        const errorMsg = typeof error.response?.data?.detail === 'string' 
          ? error.response?.data?.detail 
          : error.response?.data?.detail?.message || 'Failed to add target';
        toast.error(errorMsg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefreshLocation = async () => {
    setDuplicateDialogOpen(false);
    
    // Use existing target and refresh its position instead of creating duplicate
    if (existingTarget) {
      await handlePerbaharui(existingTarget, true); // true = skip confirmation dialog
    } else {
      // Fallback: should not happen, but just in case
      toast.error('Target tidak ditemukan');
    }
    
    setPendingPhoneNumber('');
    setNewPhoneNumber('');
  };

  const handleUseExisting = () => {
    setDuplicateDialogOpen(false);
    toast.info('Menggunakan data yang sudah ada');
    setPendingPhoneNumber('');
    setNewPhoneNumber('');
    
    if (existingTarget) {
      setSelectedTargetForChat(existingTarget.id);
      // Also ensure the existing target is visible on map
      if (existingTarget.data?.latitude && existingTarget.data?.longitude) {
        handleTargetClick(existingTarget);
      }
    }
  };

  const handlePerbaharui = async (target, skipConfirmation = false) => {
    if (!skipConfirmation && !window.confirm(`Perbaharui lokasi untuk ${target.phone_number}?\n\nData RegHP, NIK, dan NKK akan tetap tersimpan.`)) return;
    
    if (isProcessRunning()) {
      showBusyNotification();
      return;
    }
    
    // Check if system is busy (another user is querying)
    const canQuery = await canPerformQuery();
    if (!canQuery) {
      return;
    }
    
    setGlobalProcessing(true);
    setGlobalProcessType('refresh');
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API}/targets/${target.id}/refresh-position`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success('Query pembaharuan posisi dimulai!');
      setSelectedTargetForChat(target.id);
      
      // Poll for completion
      let attempts = 0;
      const maxAttempts = 30;
      let isCompleted = false;
      
      const checkInterval = setInterval(async () => {
        if (isCompleted) {
          clearInterval(checkInterval);
          return;
        }
        
        attempts++;
        try {
          const pollResponse = await axios.get(`${API}/targets/${target.id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const updatedTarget = pollResponse.data;
          
          // Always update targets state with latest data (for progress visibility)
          setTargets(prev => prev.map(t => t.id === target.id ? updatedTarget : t));
          
          if ((updatedTarget.status === 'completed' || updatedTarget.status === 'not_found' || updatedTarget.status === 'error') && !isCompleted) {
            isCompleted = true;
            clearInterval(checkInterval);
            setGlobalProcessing(false);
            setGlobalProcessType(null);
            
            // Update targets state directly with the updated target data
            setTargets(prev => prev.map(t => t.id === target.id ? updatedTarget : t));
            
            // Also refresh full targets list to ensure consistency
            if (selectedCase?.id) {
              await fetchTargets(selectedCase.id);
            } else if (target.case_id) {
              await fetchTargets(target.case_id);
            }
            
            // Refresh history for this target if it has history displayed
            if (historyPaths[target.id]) {
              await refreshHistoryPath(target.id);
            }
            
            // Update map center to new position
            if (updatedTarget.data?.latitude && updatedTarget.data?.longitude) {
              setMapCenter([parseFloat(updatedTarget.data.latitude), parseFloat(updatedTarget.data.longitude)]);
              setMapZoom(15);
              setMapKey(prev => prev + 1);
              
              toast.success(`Posisi ${target.phone_number} berhasil diperbarui!`);
            } else if (updatedTarget.status === 'not_found') {
              toast.warning(`Target ${target.phone_number} tidak ditemukan atau sedang OFF`);
            } else if (updatedTarget.status === 'error') {
              toast.error(`Gagal memperbarui posisi: ${updatedTarget.error || 'Unknown error'}`);
            }
          } else if (attempts >= maxAttempts && !isCompleted) {
            isCompleted = true;
            clearInterval(checkInterval);
            setGlobalProcessing(false);
            setGlobalProcessType(null);
            toast.warning('Proses timeout, silakan coba lagi');
          }
        } catch (err) {
          console.error('Poll error:', err);
        }
      }, 2000);
      
    } catch (error) {
      setGlobalProcessing(false);
      setGlobalProcessType(null);
      toast.error(error.response?.data?.detail || 'Gagal memulai pembaharuan');
    }
  };

  const handleOpenScheduleDialog = (target) => {
    setSelectedTargetForSchedule(target);
    setScheduleDialogOpen(true);
  };

  const handleCreateSchedule = async (e) => {
    e.preventDefault();
    
    try {
      const token = localStorage.getItem('token');
      const payload = {
        case_id: selectedTargetForSchedule.case_id,
        phone_number: selectedTargetForSchedule.phone_number,
        interval_type: scheduleInterval.type,
        interval_value: scheduleInterval.value,
        active: true
      };
      
      // Add scheduled_time for specific_time type
      if (scheduleInterval.type === 'specific_time') {
        payload.scheduled_time = scheduleInterval.scheduledTime || '07:00';
      }
      
      await axios.post(`${API}/schedules`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const timeDesc = scheduleInterval.type === 'specific_time' 
        ? `jam ${scheduleInterval.scheduledTime} WIB setiap hari`
        : scheduleInterval.type === 'minutes' ? `setiap ${scheduleInterval.value} menit`
        : scheduleInterval.type === 'hourly' ? `setiap ${scheduleInterval.value} jam`
        : scheduleInterval.type === 'daily' ? `setiap ${scheduleInterval.value} hari`
        : scheduleInterval.type === 'weekly' ? `setiap ${scheduleInterval.value} minggu`
        : `setiap ${scheduleInterval.value} bulan`;
      
      toast.success(`Jadwal berhasil dibuat! (${timeDesc})`);
      setScheduleDialogOpen(false);
      setScheduleInterval({ type: 'specific_time', value: 1, scheduledTime: '07:00' });
      fetchSchedules();
    } catch (error) {
      console.error('Create schedule error:', error);
      toast.error('Gagal membuat jadwal: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleTargetClick = (target) => {
    setSelectedTargetForChat(target.id);
    
    if (target.data && target.data.latitude && target.data.longitude) {
      setMapCenter([target.data.latitude, target.data.longitude]);
      setMapZoom(16);
      setMapKey(prev => prev + 1);
    }
  };

  // ============== Pendalaman Handlers ==============
  const handlePendalaman = async (target) => {
    console.log('[MainApp] handlePendalaman called with target:', target?.id, target?.phone_number);
    
    if (isProcessRunning()) {
      console.log('[MainApp] Blocked - process is already running');
      showBusyNotification();
      return;
    }
    
    // Simplified Telegram check - let backend handle connection
    // Only block if we know for sure Telegram is not available
    try {
      const token = localStorage.getItem('token');
      const statusResponse = await axios.get(`${API}/telegram/status`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000
      });
      // Allow if connected (even if not authorized - backend will handle)
      if (!statusResponse.data.connected && !statusResponse.data.authorized) {
        toast.error('Telegram belum terkoneksi! Silakan login di halaman Settings terlebih dahulu.');
        return;
      }
    } catch (err) {
      console.warn('[MainApp] Telegram status check failed, proceeding anyway:', err.message);
      // Don't block - let backend handle the actual connection
    }
    
    setGlobalProcessing(true);
    setGlobalProcessType('pendalaman');
    setLoadingPendalaman(target.id);
    
    // Don't auto-open chat panel for Pendalaman - user requested to hide it
    // setSelectedTargetForChat(target.id);
    // setShowChatPanel(true);
    
    const updatedTargets = targets.map(t => 
      t.id === target.id ? { ...t, reghp_status: 'processing' } : t
    );
    setTargets(updatedTargets);
    
    if (selectedReghpTarget?.id === target.id) {
      setSelectedReghpTarget({ ...selectedReghpTarget, reghp_status: 'processing' });
    }
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API}/targets/${target.id}/reghp`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Check if data was reused from cache
      if (response.data.reused) {
        toast.success(`Data REGHP ditemukan dari ${response.data.source === 'target_history' ? 'history' : 'cache'}!`);
        fetchTargets(selectedCase.id);
        setGlobalProcessing(false);
        setGlobalProcessType(null);
        setLoadingPendalaman(null);
        return;
      }
      
      toast.success('Pendalaman query dimulai!');
      
      let attempts = 0;
      const maxAttempts = 30;
      let isCompleted = false; // Flag to prevent multiple completions
      
      const checkInterval = setInterval(async () => {
        // Skip if already completed
        if (isCompleted) {
          clearInterval(checkInterval);
          return;
        }
        
        attempts++;
        try {
          const response = await axios.get(`${API}/targets/${target.id}`);
          const updatedTarget = response.data;
          
          if ((updatedTarget.reghp_status === 'completed' || updatedTarget.reghp_status === 'error') && !isCompleted) {
            isCompleted = true; // Set flag BEFORE clearing
            clearInterval(checkInterval);
            setGlobalProcessing(false);
            setGlobalProcessType(null);
            setLoadingPendalaman(null);
            fetchTargets(selectedCase.id);
            
            if (updatedTarget.reghp_status === 'completed') {
              toast.success('Pendalaman selesai!');
            }
          } else if (attempts >= maxAttempts && !isCompleted) {
            isCompleted = true;
            clearInterval(checkInterval);
            setGlobalProcessing(false);
            setGlobalProcessType(null);
            setLoadingPendalaman(null);
            toast.warning('Proses timeout, silakan coba lagi');
          }
        } catch (err) {
          console.error('Poll error:', err);
        }
      }, 2000);
      
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to start pendalaman');
      fetchTargets(selectedCase.id);
      setGlobalProcessing(false);
      setGlobalProcessType(null);
      setLoadingPendalaman(null);
    }
  };

  const handleShowReghpInfo = (target) => {
    setSelectedReghpTarget(target);
    setReghpDialogOpen(true);
  };

  useEffect(() => {
    if (selectedReghpTarget && reghpDialogOpen) {
      const updatedTarget = targets.find(t => t.id === selectedReghpTarget.id);
      // Only update if there's actually new data and it's different
      if (updatedTarget && JSON.stringify(updatedTarget.nik_queries) !== JSON.stringify(selectedReghpTarget.nik_queries)) {
        setSelectedReghpTarget(updatedTarget);
      }
    }
  }, [targets, reghpDialogOpen]);

  const handleNikPendalaman = async (targetId, nik) => {
    console.log('[NIK Pendalaman] Starting for target:', targetId, 'NIK:', nik);
    console.log('[NIK Pendalaman] isProcessRunning:', isProcessRunning(), {
      globalProcessing,
      loadingPendalaman,
      loadingNikPendalaman,
      loadingFamilyPendalaman
    });
    
    if (isProcessRunning()) {
      showBusyNotification();
      console.log('[NIK Pendalaman] Blocked - process is running');
      return;
    }
    
    // Check if Telegram is connected - but don't block if just "not authorized"
    // Backend will handle auto-reconnect and return proper error if truly disconnected
    let tgConnected = false;
    try {
      const token = localStorage.getItem('token');
      const statusResponse = await axios.get(`${API}/telegram/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Consider connected if either authorized OR at least connected (can try auto-auth)
      tgConnected = statusResponse.data.authorized || statusResponse.data.connected;
      setTelegramConnected(tgConnected);  // Update state for other components
      
      if (!tgConnected) {
        console.warn('[NIK Pendalaman] Telegram not connected, will let backend handle');
      }
    } catch (err) {
      console.error('[NIK Pendalaman] Telegram status check failed:', err);
      // Don't block - let backend handle the connection
      tgConnected = true; // Optimistically proceed
    }
    
    // Only block if explicitly disconnected AND not connected at all
    // Backend will return 503 with proper error message if truly can't connect
    
    setGlobalProcessing(true);
    setGlobalProcessType('nik');
    setLoadingNikPendalaman(nik);
    
    // Set target for chat but DON'T auto-open chat panel for NIK pendalaman
    setSelectedTargetForChat(targetId);
    // setShowChatPanel(true);  // Removed - user doesn't want chat to auto-open
    
    console.log('[NIK Pendalaman] State set, calling API...');
    
    const updatedTargets = targets.map(t => {
      if (t.id === targetId) {
        const nikQueries = { ...(t.nik_queries || {}) };
        nikQueries[nik] = { ...(nikQueries[nik] || {}), status: 'processing' };
        return { ...t, nik_queries: nikQueries };
      }
      return t;
    });
    setTargets(updatedTargets);
    
    if (selectedReghpTarget?.id === targetId) {
      const nikQueries = { ...(selectedReghpTarget.nik_queries || {}) };
      nikQueries[nik] = { ...(nikQueries[nik] || {}), status: 'processing' };
      setSelectedReghpTarget({ ...selectedReghpTarget, nik_queries: nikQueries });
    }
    
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const response = await axios.post(`${API}/targets/${targetId}/nik`, { nik }, { headers });
      console.log('[NIK Pendalaman] API Response:', response.data);
      toast.success('NIK query dimulai! Lihat chat untuk progress.');
      
      let attempts = 0;
      const maxAttempts = 60; // Increased to 2 minutes (60 * 2 seconds)
      let isCompleted = false; // Flag to prevent multiple completions
      
      const checkInterval = setInterval(async () => {
        // Skip if already completed
        if (isCompleted) {
          clearInterval(checkInterval);
          return;
        }
        
        attempts++;
        try {
          const pollResponse = await axios.get(`${API}/targets/${targetId}`, { headers });
          const target = pollResponse.data;
          const nikData = target.nik_queries?.[nik];
          
          console.log(`[NIK Pendalaman] Poll ${attempts}/${maxAttempts}, status:`, nikData?.status);
          
          if ((nikData?.status === 'completed' || nikData?.status === 'error') && !isCompleted) {
            isCompleted = true; // Set flag BEFORE clearing
            clearInterval(checkInterval);
            setGlobalProcessing(false);
            setGlobalProcessType(null);
            setLoadingNikPendalaman(null);
            
            // IMPORTANT: Update selectedReghpTarget with fresh data FIRST
            if (selectedReghpTarget?.id === targetId) {
              setSelectedReghpTarget(target);
            }
            
            // Also update targets array with fresh data
            setTargets(prevTargets => 
              prevTargets.map(t => t.id === targetId ? target : t)
            );
            
            // Then fetch all targets in background
            fetchTargets(selectedCase.id);
            
            if (nikData?.status === 'completed') {
              toast.success('NIK query selesai!');
            }
          } else if (attempts >= maxAttempts && !isCompleted) {
            isCompleted = true;
            clearInterval(checkInterval);
            setGlobalProcessing(false);
            setGlobalProcessType(null);
            setLoadingNikPendalaman(null);
            toast.warning('Proses timeout, silakan coba lagi');
          }
        } catch (err) {
          console.error('Poll error:', err);
        }
      }, 2000);
      
    } catch (error) {
      console.error('[NIK Pendalaman] API Error:', error);
      // Handle specific error codes
      if (error.response?.status === 503) {
        toast.error('Telegram tidak terhubung. Silakan cek koneksi di Settings atau coba lagi.');
      } else {
        toast.error(error.response?.data?.detail || 'Gagal memulai NIK query');
      }
      fetchTargets(selectedCase.id);
      setGlobalProcessing(false);
      setGlobalProcessType(null);
      setLoadingNikPendalaman(null);
    }
  };

  const handleShowNikInfo = (nikData) => {
    setSelectedNikData(nikData);
    setNikDialogOpen(true);
  };

  const handleFamilyPendalaman = async (targetId, familyId, sourceNik) => {
    if (isProcessRunning()) {
      showBusyNotification();
      return;
    }
    
    if (!targetId || !familyId) {
      toast.error('Target ID atau Family ID tidak valid');
      return;
    }
    
    setGlobalProcessing(true);
    setGlobalProcessType('family');
    setLoadingFamilyPendalaman(sourceNik);
    
    try {
      await axios.post(`${API}/targets/${targetId}/family`, { 
        family_id: familyId,
        source_nik: sourceNik
      });
      toast.success('Family query dimulai! Tunggu ~15 detik...');
      setTargetNikForTree(sourceNik);
      
      let attempts = 0;
      const maxAttempts = 30;
      let isCompleted = false; // Flag to prevent multiple completions
      
      const checkInterval = setInterval(async () => {
        // Skip if already completed
        if (isCompleted) {
          clearInterval(checkInterval);
          return;
        }
        
        attempts++;
        
        try {
          const response = await axios.get(`${API}/targets/${targetId}`);
          const target = response.data;
          
          if (selectedReghpTarget?.id === targetId) {
            setSelectedReghpTarget(target);
          }
          
          const nikData = target.nik_queries?.[sourceNik];
          if (nikData?.family_status === 'completed' && nikData?.family_data && !isCompleted) {
            isCompleted = true; // Set flag BEFORE clearing
            clearInterval(checkInterval);
            setGlobalProcessing(false);
            setGlobalProcessType(null);
            setLoadingFamilyPendalaman(null);
            toast.success('Family Tree data tersedia!');
            
            // Use requestAnimationFrame to avoid state conflicts
            requestAnimationFrame(() => {
              handleShowFamilyTree(nikData.family_data, sourceNik);
            });
          } else if ((nikData?.family_status === 'error' || attempts >= maxAttempts) && !isCompleted) {
            isCompleted = true;
            clearInterval(checkInterval);
            setGlobalProcessing(false);
            setGlobalProcessType(null);
            setLoadingFamilyPendalaman(null);
            
            if (nikData?.family_status === 'error') {
              toast.error('Family query gagal');
            } else if (attempts >= maxAttempts) {
              toast.warning('Proses timeout, silakan coba lagi');
            }
          }
        } catch (err) {
          console.error('Polling error:', err);
        }
      }, 2000);
      
    } catch (error) {
      console.error('Family query error:', error);
      toast.error(error.response?.data?.detail || 'Gagal memulai Family query');
      setGlobalProcessing(false);
      setGlobalProcessType(null);
      setLoadingFamilyPendalaman(null);
    }
  };

  const handleShowFamilyTree = (familyData, targetNik) => {
    setSelectedFamilyData(familyData);
    setTargetNikForTree(targetNik);
    setFamilyTreeDialogOpen(true);
    setGlobalProcessing(false);
    setGlobalProcessType(null);
    setLoadingFamilyPendalaman(null);
  };

  // NON GEOINT standalone NIK pendalaman (without existing target)
  const handleNonGeointNikPendalaman = async (nik) => {
    console.log('[NON GEOINT NIK Pendalaman] Starting for NIK:', nik);
    
    // For standalone NIK pendalaman from NON GEOINT, we need to find or create a virtual target
    // First check if we have any target with this NIK
    let targetWithNik = targets.find(t => {
      if (t.nik_queries) {
        return Object.keys(t.nik_queries).includes(nik);
      }
      return false;
    });
    
    if (targetWithNik) {
      // Use existing target
      await handleNikPendalaman(targetWithNik.id, nik);
    } else {
      // For now, just show info - in future we can create a virtual target or standalone NIK query
      toast.info(`NIK ${nik} tidak terkait dengan target yang ada. Fitur pendalaman NIK standalone akan ditambahkan.`);
    }
  };

  // Refresh single target data (useful when opening dialogs)
  const refreshTargetData = async (targetId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/targets/${targetId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const updatedTarget = response.data;
      
      // Update targets list
      setTargets(prev => prev.map(t => t.id === targetId ? updatedTarget : t));
      
      // Update selectedReghpTarget if it's the same target
      if (selectedReghpTarget?.id === targetId) {
        setSelectedReghpTarget(updatedTarget);
      }
      
      return updatedTarget;
    } catch (error) {
      console.error('Failed to refresh target:', error);
      return null;
    }
  };

  // ============== Filtered Targets ==============
  const filteredTargets = targets.filter(target => {
    if (!searchQuery) return true;
    
    const query = searchQuery.toLowerCase();
    const phone = target.phone_number.toLowerCase();
    const address = target.data?.address?.toLowerCase() || '';
    const name = target.data?.name?.toLowerCase() || '';
    
    let nikMatch = false;
    if (target.nik_queries) {
      Object.values(target.nik_queries).forEach(nikQuery => {
        if (nikQuery.data?.parsed_data) {
          Object.values(nikQuery.data.parsed_data).forEach(value => {
            if (value && value.toString().toLowerCase().includes(query)) {
              nikMatch = true;
            }
          });
        }
      });
    }
    
    return phone.includes(query) || address.includes(query) || name.includes(query) || nikMatch;
  });

  const hasActiveQueries = targets.some(t => 
    ['pending', 'connecting', 'querying', 'processing', 'parsing'].includes(t.status)
  );

  // ============== Render ==============
  return (
    <div className="flex" style={{ height: '100vh', width: '100vw', backgroundColor: 'var(--background-primary)', overflow: 'hidden' }}>
      {/* Sidebar */}
      {!isMaximized && !sidebarCollapsed && (
        <Sidebar
          username={username}
          isAdmin={isAdmin}
          telegramAuthorized={telegramAuthorized}
          telegramUser={telegramUser}
          onLogout={handleLogout}
          cases={cases}
          selectedCase={selectedCase}
          onSelectCase={setSelectedCase}
          onNewCase={() => setNewCaseDialog(true)}
          onDeleteCase={handleDeleteCase}
          onPrintCase={handlePrintCase}
          printingCase={printingCase}
          targets={targets}
          filteredTargets={filteredTargets}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedTargetForChat={selectedTargetForChat}
          onTargetClick={handleTargetClick}
          onAddTarget={() => setAddTargetDialog(true)}
          onDeleteTarget={handleDeleteTarget}
          onPerbaharui={handlePerbaharui}
          visibleTargets={visibleTargets}
          onToggleVisibility={toggleTargetVisibility}
          activeHistoryTargets={activeHistoryTargets}
          onShowHistory={(target) => {
            setSelectedTargetForHistory(target);
            setHistoryDialogOpen(true);
          }}
          onHideHistory={hideTargetHistory}
          activeSchedules={activeSchedules}
          onOpenScheduleDialog={handleOpenScheduleDialog}
          onCancelSchedule={handleCancelSchedule}
          onCountdownEnd={handleCountdownEnd}
          onPrintTarget={handlePrintTarget}
          printingTarget={printingTarget}
          globalProcessing={globalProcessing}
          globalProcessType={globalProcessType}
          onResetProcessing={handleResetProcessing}
        />
      )}

      {/* Sidebar Toggle Buttons */}
      {!isMaximized && sidebarCollapsed && (
        <Button
          onClick={() => setSidebarCollapsed(false)}
          size="icon"
          className="fixed left-4 top-1/2 transform -translate-y-1/2 z-[2000] w-12 h-12 rounded-full shadow-lg"
          style={{
            backgroundColor: 'var(--accent-primary)',
            color: 'var(--background-primary)',
            border: '2px solid var(--accent-primary)'
          }}
        >
          <FolderOpen className="w-6 h-6" />
        </Button>
      )}

      {!isMaximized && !sidebarCollapsed && !nonGeointDialogOpen && !nonGeointHistoryOpen && (
        <Button
          onClick={() => setSidebarCollapsed(true)}
          size="icon"
          className="fixed left-[304px] bottom-4 z-[10] w-8 h-8 rounded-full shadow-lg opacity-70 hover:opacity-100"
          style={{
            backgroundColor: 'var(--background-elevated)',
            borderColor: 'var(--accent-primary)',
            color: 'var(--accent-primary)',
            border: '2px solid'
          }}
        >
          <Minimize2 className="w-4 h-4" />
        </Button>
      )}

      {/* Main Map Area */}
      <main 
        className={isMaximized ? 'fixed' : 'flex-1 flex'}
        style={{ 
          top: isMaximized ? 0 : 'auto',
          left: isMaximized ? 0 : 'auto',
          right: isMaximized ? 0 : 'auto',
          bottom: isMaximized ? 0 : 'auto',
          height: '100vh', 
          width: isMaximized ? '100vw' : '100%',
          position: isMaximized ? 'fixed' : 'relative',
          zIndex: isMaximized ? 1000 : 'auto',
          backgroundColor: 'var(--background-primary)',
          overflow: 'hidden'
        }}
      >
        {/* Map Container */}
        <div 
          style={{ 
            position: 'absolute',
            top: 0,
            left: 0,
            right: showChatPanel && !isMaximized ? '384px' : 0,
            bottom: 0,
            backgroundColor: 'var(--background-primary)'
          }}
          ref={mapContainerRef}
        >
          {/* Map Controls */}
          <MapControls
            showMapControls={showMapControls}
            selectedTileLayer={selectedTileLayer}
            onTileLayerChange={handleTileLayerChange}
            isMaximized={isMaximized}
            onToggleMaximize={() => setIsMaximized(!isMaximized)}
            showMarkerNames={showMarkerNames}
            onToggleMarkerNames={() => setShowMarkerNames(!showMarkerNames)}
            aoiAlerts={aoiAlerts}
            onOpenAOIPanel={() => setAoiPanelOpen(true)}
            drawingMode={drawingMode}
            drawingPoints={drawingPoints}
            drawingColor={drawingColor}
            onDrawingColorChange={setDrawingColor}
            onFinishDrawing={handleFinishDrawing}
            onCancelDrawing={handleCancelDrawing}
            selectedCase={selectedCase}
            onAddTarget={() => setAddTargetDialog(true)}
            showChatPanel={showChatPanel}
            onShowChatPanel={() => setShowChatPanel(true)}
            hasActiveQueries={hasActiveQueries}
          />

          {/* Tools Panel Toggle Button - Top Center of Map */}
          <div 
            className="fixed z-[2000]"
            style={{
              top: '8px',
              left: 'calc(260px + ((100vw - 260px) / 2))',
              transform: 'translateX(-50%)'
            }}
          >
            <ToolsPanelToggle 
              onClick={() => setToolsPanelOpen(!toolsPanelOpen)}
              isOpen={toolsPanelOpen}
            />
          </div>

          {/* Tools Panel - Draggable Window */}
          <ToolsPanel
            isOpen={toolsPanelOpen}
            onClose={() => setToolsPanelOpen(false)}
            // Full Query
            onOpenFullQuery={() => {
              if (isGlobalInvestigating) {
                // Allow opening if it's a NEW search (no selected search yet)
                // This blocks starting a NEW full query search while one is running
                toast.error('Tidak dapat memulai pencarian baru. Proses pendalaman sedang berjalan.');
                return;
              }
              setToolsPanelWasOpen(toolsPanelOpen);
              setToolsPanelOpen(false);
              setSelectedNonGeointSearch(null);
              setNonGeointDialogOpen(true);
            }}
            onOpenFullQueryHistory={() => {
              setToolsPanelWasOpen(toolsPanelOpen);
              setToolsPanelOpen(false);
              setNonGeointHistoryOpen(true);
            }}
            isInvestigating={isGlobalInvestigating}
            // Face Recognition
            onOpenFaceRecognition={() => {
              setToolsPanelWasOpen(toolsPanelOpen);
              setToolsPanelOpen(false);
              setFrDialogOpen(true);
            }}
            onOpenFaceRecognitionHistory={() => {
              setToolsPanelWasOpen(toolsPanelOpen);
              setToolsPanelOpen(false);
              setFrHistoryOpen(true);
            }}
            isFrProcessing={isFrProcessing}
            // Simple Query
            onOpenSimpleQuery={() => {
              setToolsPanelWasOpen(toolsPanelOpen);
              setToolsPanelOpen(false);
              setSimpleQueryOpen(true);
            }}
            onOpenSimpleQueryHistory={() => {
              setToolsPanelWasOpen(toolsPanelOpen);
              setToolsPanelOpen(false);
              setSimpleQueryHistoryOpen(true);
            }}
            // User Management
            isAdmin={isAdmin}
            onOpenUserManagement={() => {
              setToolsPanelWasOpen(toolsPanelOpen);
              setToolsPanelOpen(false);
              setUserManagementOpen(true);
            }}
          />

          {targets.filter(t => t.data && t.data.latitude && t.data.longitude).length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <MapPin className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--foreground-muted)' }} />
                <p style={{ color: 'var(--foreground-muted)' }}>Belum ada target untuk ditampilkan</p>
                {selectedCase && (
                  <Button
                    onClick={() => setAddTargetDialog(true)}
                    className="mt-4"
                    style={{
                      backgroundColor: 'var(--accent-primary)',
                      color: 'var(--background-primary)'
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Target
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <MapContainer
              key={`${selectedTileLayer}-${mapKey}`}
              center={mapCenter}
              zoom={mapZoom}
              style={{ 
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100%',
                height: '100%',
                zIndex: 0,
                backgroundColor: 'var(--background-primary)',
                cursor: drawingMode ? 'crosshair' : 'grab'
              }}
              zoomControl={true}
              preferCanvas={true}
              fadeAnimation={false}
              markerZoomAnimation={false}
              doubleClickZoom={!drawingMode}
              whenReady={(map) => {
                setTimeout(() => {
                  map.target.invalidateSize();
                }, 100);
              }}
            >
              <MapClickHandler />
              <MapResizeHandler isMaximized={isMaximized} sidebarCollapsed={sidebarCollapsed} />
              <TileLayer
                key={selectedTileLayer}
                url={mapTiles[selectedTileLayer].url}
                attribution={mapTiles[selectedTileLayer].attribution}
              />

              {/* Drawing Preview */}
              <DrawingOverlay drawingMode={drawingMode} drawingPoints={drawingPoints} drawingColor={drawingColor} />

              {/* Target Markers */}
              <TargetMarkers
                targets={targets}
                visibleTargets={visibleTargets}
                showMarkerNames={showMarkerNames}
                onShowReghpInfo={handleShowReghpInfo}
                onPendalaman={handlePendalaman}
                loadingPendalaman={loadingPendalaman}
                aoiAlerts={aoiAlerts}
                selectedTargetId={selectedTargetForChat}
                onSelectTarget={(targetId) => setSelectedTargetForChat(targetId)}
              />

              {/* AOI Renderer */}
              <AOIRenderer aois={aois} aoiAlerts={aoiAlerts} />

              {/* History Paths */}
              <HistoryPathRenderer
                activeHistoryTargets={activeHistoryTargets}
                historyPaths={historyPaths}
                targets={targets}
              />
            </MapContainer>
          )}
        </div>

        {/* Toggle Map Controls Button */}
        <MapControlsToggle 
          showMapControls={showMapControls} 
          onToggle={() => setShowMapControls(!showMapControls)} 
        />
      </main>

      {/* Dialogs */}
      <ChatDialog
        open={showChatPanel}
        onOpenChange={setShowChatPanel}
        chatMessages={chatMessages}
        selectedTarget={selectedTargetForChat}
        targets={targets}
      />

      <NewCaseDialog
        open={newCaseDialog}
        onOpenChange={setNewCaseDialog}
        newCaseName={newCaseName}
        onCaseNameChange={setNewCaseName}
        onSubmit={handleCreateCase}
        submitting={submitting}
      />

      <AddTargetDialog
        open={addTargetDialog}
        onOpenChange={setAddTargetDialog}
        newPhoneNumber={newPhoneNumber}
        onPhoneNumberChange={setNewPhoneNumber}
        onSubmit={handleAddTarget}
        submitting={submitting}
        telegramAuthorized={telegramAuthorized}
      />

      <DuplicatePhoneDialog
        open={duplicateDialogOpen}
        onOpenChange={setDuplicateDialogOpen}
        pendingPhoneNumber={pendingPhoneNumber}
        existingTarget={existingTarget}
        onUseExisting={handleUseExisting}
        onRefreshLocation={handleRefreshLocation}
      />

      <ScheduleDialog
        open={scheduleDialogOpen}
        onOpenChange={setScheduleDialogOpen}
        selectedTarget={selectedTargetForSchedule}
        scheduleInterval={scheduleInterval}
        onIntervalChange={setScheduleInterval}
        onSubmit={handleCreateSchedule}
      />

      <ReghpInfoDialog
        open={reghpDialogOpen}
        onOpenChange={setReghpDialogOpen}
        selectedTarget={selectedReghpTarget}
        onShowNikInfo={handleShowNikInfo}
        onNikPendalaman={handleNikPendalaman}
        loadingNikPendalaman={loadingNikPendalaman}
        onRefreshTarget={refreshTargetData}
      />

      <NikInfoDialog
        open={nikDialogOpen}
        onOpenChange={setNikDialogOpen}
        selectedNikData={selectedNikData}
        selectedReghpTarget={selectedReghpTarget}
        onShowFamilyTree={handleShowFamilyTree}
        onFamilyPendalaman={handleFamilyPendalaman}
        loadingFamilyPendalaman={loadingFamilyPendalaman}
      />

      <FamilyTreeDialog
        open={familyTreeDialogOpen}
        onOpenChange={setFamilyTreeDialogOpen}
        selectedFamilyData={selectedFamilyData}
        targetNikForTree={targetNikForTree}
      />

      {/* History Dialog */}
      <HistoryDialog
        open={historyDialogOpen}
        onClose={() => setHistoryDialogOpen(false)}
        target={selectedTargetForHistory}
        onShowPath={handleShowHistoryPath}
      />

      {/* AOI Panel */}
      <AOIPanel
        open={aoiPanelOpen}
        onClose={() => setAoiPanelOpen(false)}
        targets={targets}
        onStartDrawing={handleStartDrawing}
        onToggleAOIVisibility={(aoiId, visible) => {
          setAois(prev => prev.map(a => a.id === aoiId ? {...a, is_visible: visible} : a));
        }}
        aois={aois}
        setAois={setAois}
        refreshAOIs={fetchAOIs}
      />

      {/* AOI Alert Notification */}
      <AOIAlertNotification
        alerts={aoiAlerts}
        onAcknowledge={handleAcknowledgeAlert}
        onAcknowledgeAll={handleAcknowledgeAllAlerts}
      />

      {/* NON GEOINT Search Dialog */}
      <NonGeointSearchDialog
        open={nonGeointDialogOpen}
        onOpenChange={(open) => {
          setNonGeointDialogOpen(open);
          // Reset selected search when dialog closes so next open will fetch fresh data
          if (!open) {
            setSelectedNonGeointSearch(null);
            // Restore Tools Panel only if not in transition and no other dialog is open
            if (!dialogTransitionRef.current && toolsPanelWasOpen) {
              setToolsPanelOpen(true);
              setToolsPanelWasOpen(false);
            }
          }
        }}
        onNikPendalaman={handleNonGeointNikPendalaman}
        initialSearch={selectedNonGeointSearch}
        isGlobalInvestigating={isGlobalInvestigating}
        onInvestigatingChange={(isInvestigating, searchId) => {
          setIsGlobalInvestigating(isInvestigating);
          if (isInvestigating && searchId) {
            setCurrentInvestigationSearchId(searchId);
          } else if (!isInvestigating) {
            setCurrentInvestigationSearchId(null);
          }
        }}
      />

      {/* NON GEOINT History Dialog */}
      <NonGeointHistoryDialog
        open={nonGeointHistoryOpen}
        onOpenChange={(open) => {
          setNonGeointHistoryOpen(open);
          if (!open) {
            // Only restore Tools Panel if not in transition
            if (!dialogTransitionRef.current && toolsPanelWasOpen) {
              setToolsPanelOpen(true);
              setToolsPanelWasOpen(false);
            }
          }
        }}
        onSelectSearch={(search) => {
          // Check if investigation is running for a DIFFERENT search
          if (isGlobalInvestigating && currentInvestigationSearchId && search.id !== currentInvestigationSearchId) {
            toast.error('Tidak dapat membuka pencarian lain. Proses pendalaman sedang berjalan untuk pencarian sebelumnya.');
            return;
          }
          // Mark that we're transitioning to another dialog
          dialogTransitionRef.current = true;
          // Close history and open main dialog
          setNonGeointHistoryOpen(false);
          setSelectedNonGeointSearch(search);
          setNonGeointDialogOpen(true);
          // Reset transition flag after a short delay
          setTimeout(() => {
            dialogTransitionRef.current = false;
          }, 200);
        }}
      />

      {/* Face Recognition Dialog */}
      <FaceRecognitionDialog
        open={frDialogOpen}
        onOpenChange={(open) => {
          setFrDialogOpen(open);
          if (!open) {
            if (!dialogTransitionRef.current && toolsPanelWasOpen) {
              setToolsPanelOpen(true);
              setToolsPanelWasOpen(false);
            }
          }
        }}
        telegramConnected={telegramConnected}
      />

      {/* Face Recognition History Dialog */}
      <FaceRecognitionHistoryDialog
        open={frHistoryOpen}
        onOpenChange={(open) => {
          setFrHistoryOpen(open);
          if (!open) {
            if (!dialogTransitionRef.current && toolsPanelWasOpen) {
              setToolsPanelOpen(true);
              setToolsPanelWasOpen(false);
            }
          }
        }}
      />

      {/* User Management Dialog (Admin Only) */}
      {isAdmin && (
        <UserManagementDialog
          open={userManagementOpen}
          onOpenChange={(open) => {
            setUserManagementOpen(open);
            if (!open && !dialogTransitionRef.current && toolsPanelWasOpen) {
              setToolsPanelOpen(true);
              setToolsPanelWasOpen(false);
            }
          }}
        />
      )}

      {/* Simple Query Dialog */}
      <SimpleQueryDialog
        open={simpleQueryOpen}
        onOpenChange={(open) => {
          setSimpleQueryOpen(open);
          if (!open) {
            // Clear history selection when dialog closes
            setSelectedSimpleQueryHistory(null);
            if (!dialogTransitionRef.current && toolsPanelWasOpen) {
              setToolsPanelOpen(true);
              setToolsPanelWasOpen(false);
            }
          }
        }}
        initialResult={selectedSimpleQueryHistory}
      />
      
      {/* Simple Query History Dialog */}
      <SimpleQueryHistoryDialog
        open={simpleQueryHistoryOpen}
        onOpenChange={(open) => {
          setSimpleQueryHistoryOpen(open);
          if (!open) {
            if (!dialogTransitionRef.current && toolsPanelWasOpen) {
              setToolsPanelOpen(true);
              setToolsPanelWasOpen(false);
            }
          }
        }}
        onSelectHistory={(item) => {
          // Mark that we're transitioning to another dialog
          dialogTransitionRef.current = true;
          // Store the selected history item
          setSelectedSimpleQueryHistory(item);
          // Close history and open SimpleQuery with result
          setSimpleQueryHistoryOpen(false);
          setSimpleQueryOpen(true);
          // Reset transition flag after a short delay
          setTimeout(() => {
            dialogTransitionRef.current = false;
          }, 200);
        }}
      />

      {/* Session Invalidated Alert - shown when user is logged out from another device */}
      <AlertDialog open={sessionCheckFailed} onOpenChange={() => {}}>
        <AlertDialogContent 
          style={{ 
            backgroundColor: 'var(--background-secondary)', 
            borderColor: 'var(--borders-default)',
            color: 'var(--foreground-primary)'
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2" style={{ color: '#ef4444' }}>
              <AlertTriangle className="w-6 h-6" />
              Sesi Berakhir
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3" style={{ color: 'var(--foreground-secondary)' }}>
              <p>
                Akun Anda telah <strong>login di device lain</strong>.
              </p>
              <p>
                Untuk alasan keamanan, hanya satu device yang dapat menggunakan akun ini dalam waktu bersamaan.
              </p>
              <p className="text-sm italic" style={{ color: 'var(--foreground-muted)' }}>
                Anda akan diarahkan ke halaman login.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction 
              onClick={() => {
                acknowledgeSessionInvalid();
                navigate('/login');
              }}
              className="flex items-center gap-2"
              style={{ 
                backgroundColor: 'var(--accent-primary)', 
                color: 'var(--background-primary)' 
              }}
            >
              <LogOut className="w-4 h-4" />
              OK, Logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MainApp;
