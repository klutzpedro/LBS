import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTelegram } from '@/context/TelegramContext';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { MapContainer, TileLayer, Marker, Popup, Polygon, Circle, Polyline, useMapEvents } from 'react-leaflet';
import L, { Icon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Shield, 
  LogOut, 
  Settings as SettingsIcon, 
  Plus, 
  Maximize2, 
  Minimize2, 
  Layers,
  FolderOpen,
  Phone,
  MapPin,
  CheckCircle,
  XCircle,
  Activity,
  MessageSquare,
  Search,
  Eye,
  EyeOff,
  Trash2,
  History,
  Target,
  X
} from 'lucide-react';
import { FamilyTreeViz } from '@/components/FamilyTreeViz';
import { HistoryDialog } from '@/components/HistoryDialog';
import { AOIPanel, AOIAlertNotification } from '@/components/AOIComponents';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';

// Import refactored components
import { CountdownTimer, createMarkerWithLabel, mapTiles, MapResizeHandler, generateTargetPDF, generateCasePDF } from '@/components/main';
import { Printer } from 'lucide-react';

const MainApp = () => {
  const { username, logout } = useAuth();
  const { telegramAuthorized, telegramUser } = useTelegram();
  const navigate = useNavigate();
  
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [targets, setTargets] = useState([]);
  const [isMaximized, setIsMaximized] = useState(false);
  const [selectedTileLayer, setSelectedTileLayer] = useState('dark');
  
  const [addTargetDialog, setAddTargetDialog] = useState(false);
  const [newCaseDialog, setNewCaseDialog] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');
  const [newPhoneNumber, setNewPhoneNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [selectedTargetForChat, setSelectedTargetForChat] = useState(null);
  const [mapCenter, setMapCenter] = useState([-6.2088, 106.8456]);
  const [mapZoom, setMapZoom] = useState(13);
  const [mapKey, setMapKey] = useState(0);
  const [reghpDialogOpen, setReghpDialogOpen] = useState(false);
  const [selectedReghpTarget, setSelectedReghpTarget] = useState(null);
  const [nikDialogOpen, setNikDialogOpen] = useState(false);
  const [selectedNikData, setSelectedNikData] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [existingTarget, setExistingTarget] = useState(null);
  const [pendingPhoneNumber, setPendingPhoneNumber] = useState('');
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedTargetForSchedule, setSelectedTargetForSchedule] = useState(null);
  const [scheduleInterval, setScheduleInterval] = useState({ type: 'hourly', value: 1 });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeSchedules, setActiveSchedules] = useState([]);
  const [showMarkerNames, setShowMarkerNames] = useState(false);
  const [visibleTargets, setVisibleTargets] = useState(new Set());
  const [familyTreeDialogOpen, setFamilyTreeDialogOpen] = useState(false);
  const [selectedFamilyData, setSelectedFamilyData] = useState(null);
  const [targetNikForTree, setTargetNikForTree] = useState(null);
  const [showMapControls, setShowMapControls] = useState(true); // Force map re-render
  const [printingTarget, setPrintingTarget] = useState(null);
  const [printingCase, setPrintingCase] = useState(false);
  const mapContainerRef = useRef(null);
  
  // History states - support multiple targets
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedTargetForHistory, setSelectedTargetForHistory] = useState(null);
  const [historyPaths, setHistoryPaths] = useState({}); // { targetId: [path points] }
  const [activeHistoryTargets, setActiveHistoryTargets] = useState([]); // Array of target IDs with active history
  
  // AOI states
  const [aoiPanelOpen, setAoiPanelOpen] = useState(false);
  const [aois, setAois] = useState([]);
  const [aoiAlerts, setAoiAlerts] = useState([]);
  const [drawingMode, setDrawingMode] = useState(null); // 'polygon' or 'circle'
  const [drawingPoints, setDrawingPoints] = useState([]);
  
  // Global process queue - only one query process at a time
  const [globalProcessing, setGlobalProcessing] = useState(false);
  const [globalProcessType, setGlobalProcessType] = useState(null); // 'pendalaman', 'nik', 'family'
  
  // Track executing schedules to prevent duplicates
  const executingSchedulesRef = useRef(new Set());
  
  // Loading states to prevent double-click
  const [loadingPendalaman, setLoadingPendalaman] = useState(null); // targetId
  const [loadingNikPendalaman, setLoadingNikPendalaman] = useState(null); // nik
  const [loadingFamilyPendalaman, setLoadingFamilyPendalaman] = useState(null); // nik

  // Check if any process is running
  const isProcessRunning = () => {
    return globalProcessing || loadingPendalaman || loadingNikPendalaman || loadingFamilyPendalaman;
  };

  // Show busy notification
  const showBusyNotification = () => {
    toast.warning('PROSES LAIN SEDANG BERLANGSUNG, MOHON MENUNGGU HINGGA SELESAI', {
      duration: 3000
    });
  };

  // Handle tile layer change while preserving position
  const handleTileLayerChange = (newTile) => {
    // Position is preserved via mapCenter and mapZoom states
    setSelectedTileLayer(newTile);
    // Force map re-render with same position
    setMapKey(prev => prev + 1);
  };

  // PDF Export handlers
  const handlePrintTarget = async (target) => {
    setPrintingTarget(target.id);
    try {
      // Create a copy of data to avoid mutation during PDF generation
      const targetCopy = JSON.parse(JSON.stringify(target));
      
      let mapScreenshot = null;
      
      // If target has coordinates, move map to target location and take screenshot
      if (target.data?.latitude && target.data?.longitude) {
        const lat = parseFloat(target.data.latitude);
        const lng = parseFloat(target.data.longitude);
        
        // Save current map position
        const prevCenter = mapCenter;
        const prevZoom = mapZoom;
        
        // Move map to target location
        setMapCenter([lat, lng]);
        setMapZoom(16);
        setMapKey(prev => prev + 1); // Force re-render
        
        toast.info('Mengambil screenshot peta...');
        
        // Wait for map tiles to load
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Take screenshot of map container
        if (mapContainerRef.current) {
          try {
            const canvas = await html2canvas(mapContainerRef.current, {
              useCORS: true,
              allowTaint: true,
              backgroundColor: '#121212',
              scale: 1,
              logging: false,
              imageTimeout: 5000
            });
            mapScreenshot = canvas.toDataURL('image/jpeg', 0.85);
          } catch (e) {
            console.warn('Map screenshot failed:', e);
          }
        }
        
        // Restore previous map position
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
      // Create a copy of data to avoid mutation during PDF generation
      const targetsCopy = JSON.parse(JSON.stringify(filteredTargets));
      const caseNameCopy = selectedCase.name;
      
      // Collect map screenshots for all targets with coordinates
      const mapScreenshots = {};
      const prevCenter = mapCenter;
      const prevZoom = mapZoom;
      
      toast.info(`Mengambil screenshot peta untuk ${targetsCopy.length} target...`);
      
      for (const target of targetsCopy) {
        if (target.data?.latitude && target.data?.longitude) {
          const lat = parseFloat(target.data.latitude);
          const lng = parseFloat(target.data.longitude);
          
          // Move map to target location
          setMapCenter([lat, lng]);
          setMapZoom(16);
          setMapKey(prev => prev + 1);
          
          // Wait for map tiles to load
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          // Take screenshot
          if (mapContainerRef.current) {
            try {
              const canvas = await html2canvas(mapContainerRef.current, {
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#121212',
                scale: 1,
                logging: false,
                imageTimeout: 5000
              });
              mapScreenshots[target.id] = canvas.toDataURL('image/jpeg', 0.85);
            } catch (e) {
              console.warn('Map screenshot failed for target:', target.id, e);
            }
          }
        }
      }
      
      // Restore previous map position
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

  useEffect(() => {
    fetchCases();
    fetchSchedules();
    fetchAOIs();
    fetchAOIAlerts();
  }, []);

  // Fetch AOIs
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

  // Fetch AOI Alerts (poll every 10 seconds)
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

  // Poll for alerts
  useEffect(() => {
    const interval = setInterval(fetchAOIAlerts, 10000); // Every 10 seconds
    return () => clearInterval(interval);
  }, []);

  // Handle acknowledge alert
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

  // Show history path on map - now stores full history data with timestamps
  const handleShowHistoryPath = (historyData, targetId = null) => {
    if (historyData && historyData.length > 0 && targetId) {
      // Sort by timestamp DESCENDING (newest first at index 0)
      const sortedData = [...historyData].sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      );
      
      const pathData = sortedData.map(h => ({
        lat: h.latitude,
        lng: h.longitude,
        timestamp: h.timestamp,
        address: h.address
      }));
      
      console.log('History path data (newest first):', pathData.map((p, i) => `${i}: ${p.timestamp}`));
      
      // Add to history paths (allows multiple targets)
      setHistoryPaths(prev => ({
        ...prev,
        [targetId]: pathData
      }));
      
      // Add to active history targets if not already there
      setActiveHistoryTargets(prev => {
        if (!prev.includes(targetId)) {
          return [...prev, targetId];
        }
        return prev;
      });
      
      // Center map on most recent point (index 0 after sorting)
      setMapCenter([sortedData[0].latitude, sortedData[0].longitude]);
      setMapZoom(14);
      setMapKey(prev => prev + 1);
      
      // Find target phone for toast
      const target = targets.find(t => t.id === targetId);
      const phone = target?.phone_number?.slice(-6) || targetId.slice(-6);
      toast.success(`Menampilkan ${historyData.length} titik riwayat posisi (${phone})`);
    }
  };

  // Remove history for a specific target
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

  // Refresh history path if currently displayed
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
          setHistoryPaths(prev => ({
            ...prev,
            [targetId]: pathData
          }));
          toast.info('History path diperbarui dengan posisi terbaru');
        }
      } catch (error) {
        console.error('Failed to refresh history:', error);
      }
    }
  };

  // Clear all history paths
  const clearAllHistoryPaths = () => {
    setHistoryPaths({});
    setActiveHistoryTargets([]);
  };

  // Handle drawing AOI on map
  const handleStartDrawing = (type) => {
    setDrawingMode(type);
    setDrawingPoints([]);
    toast.info(`Klik pada peta untuk menggambar ${type}. Double-click untuk selesai.`, { duration: 5000 });
  };

  // Handle map click for drawing
  const handleMapClickForDrawing = (latlng) => {
    if (!drawingMode) return;
    
    const newPoint = [latlng.lat, latlng.lng];
    setDrawingPoints(prev => [...prev, newPoint]);
    
    if (drawingMode === 'circle' && drawingPoints.length === 0) {
      // For circle, first click is center, second click determines radius
      toast.info('Klik lagi untuk menentukan radius lingkaran');
    }
  };

  // Finish drawing AOI
  const handleFinishDrawing = async () => {
    if (!drawingMode || drawingPoints.length === 0) {
      setDrawingMode(null);
      setDrawingPoints([]);
      return;
    }

    const savedDrawingMode = drawingMode; // Save before clearing
    
    try {
      const token = localStorage.getItem('token');
      let payload = {
        name: `AOI ${new Date().toLocaleString('id-ID')}`,
        aoi_type: drawingMode,
        is_visible: false, // Default hidden
        alarm_enabled: true,
        monitored_targets: []
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
          return; // Don't clear drawing yet
        }
        // First point is center, calculate radius from distance to second point
        const center = drawingPoints[0];
        const edge = drawingPoints[1];
        const R = 6371000; // Earth radius in meters
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

      // Clear drawing state BEFORE making request
      setDrawingMode(null);
      setDrawingPoints([]);

      // Get current AOI count before creating
      const currentAOICount = aois.length;

      try {
        const response = await axios.post(`${API}/aois`, payload, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 30000 // 30 second timeout
        });

        if (response.data && response.data.aoi) {
          toast.success(`AOI ${savedDrawingMode} berhasil dibuat!`);
          await fetchAOIs();
        } else {
          toast.success(`AOI berhasil dibuat!`);
          await fetchAOIs();
        }
      } catch (requestError) {
        // Handle timeout/520 errors with polling verification
        console.log('AOI request error, verifying creation with polling...', requestError.message);
        
        // Wait a moment then poll to check if AOI was actually created
        const verifyAOICreation = async (retries = 3, delay = 1500) => {
          for (let i = 0; i < retries; i++) {
            await new Promise(resolve => setTimeout(resolve, delay));
            try {
              const checkResponse = await axios.get(`${API}/aois`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              const newAOICount = checkResponse.data?.length || 0;
              
              if (newAOICount > currentAOICount) {
                // AOI was actually created despite the error
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
          // Only show error if AOI really wasn't created
          toast.error('Gagal membuat AOI. Silakan coba lagi.');
        }
      }
      
    } catch (error) {
      console.error('Failed to create AOI:', error);
      toast.error('Gagal membuat AOI: ' + (error.response?.data?.detail || error.message));
      setDrawingMode(null);
      setDrawingPoints([]);
      // Still try to refresh
      fetchAOIs();
    }
  };

  // Cancel drawing
  const handleCancelDrawing = () => {
    setDrawingMode(null);
    setDrawingPoints([]);
    toast.info('Drawing dibatalkan');
  };

  // Map click event handler component
  const MapClickHandler = () => {
    useMapEvents({
      click: (e) => {
        if (drawingMode) {
          handleMapClickForDrawing(e.latlng);
        }
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

  // Function to detect and auto-reset stuck processes (stuck > 2 minutes)
  const checkAndResetStuckProcesses = async () => {
    for (const target of targets) {
      let hasStuck = false;
      
      // Check target-level stuck
      if (target.reghp_status === 'processing' || target.family_status === 'processing') {
        hasStuck = true;
      }
      
      // Check NIK-level stuck
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

  // Check for stuck processes every 2 minutes
  useEffect(() => {
    const stuckCheckInterval = setInterval(() => {
      if (!globalProcessing) {
        checkAndResetStuckProcesses();
      }
    }, 120000); // 2 minutes
    
    return () => clearInterval(stuckCheckInterval);
  }, [targets, globalProcessing]);

  useEffect(() => {
    if (selectedCase) {
      fetchTargets(selectedCase.id);
      // Set interval to refresh targets
      const interval = setInterval(() => {
        fetchTargets(selectedCase.id);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [selectedCase]);

  useEffect(() => {
    // Auto-check ALL completed targets when case selected or targets update
    const completedTargets = targets.filter(t => t.status === 'completed' && t.data);
    
    if (completedTargets.length > 0) {
      // Check all completed targets by default
      const allCompletedIds = new Set(completedTargets.map(t => t.id));
      setVisibleTargets(allCompletedIds);
    }
  }, [targets, selectedCase]);

  useEffect(() => {
    // Monitor target status changes for notifications
    targets.forEach(target => {
      const prevTarget = targets.find(t => t.id === target.id);
      
      if (target.status === 'completed' && prevTarget?.status !== 'completed') {
        toast.success(`✓ Lokasi ${target.phone_number} ditemukan!`);
      }
      
      if (target.status === 'not_found' && prevTarget?.status !== 'not_found') {
        toast.warning(`⚠ Target ${target.phone_number} tidak ditemukan atau sedang OFF`);
      }
      
      if (target.status === 'error' && prevTarget?.status !== 'error') {
        toast.error(`✗ Query gagal untuk ${target.phone_number}`);
      }
    });
  }, [targets]);

  useEffect(() => {
    if (selectedTargetForChat) {
      fetchChatMessages(selectedTargetForChat);
      const interval = setInterval(() => {
        fetchChatMessages(selectedTargetForChat);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [selectedTargetForChat]);

  const fetchCases = async () => {
    try {
      const response = await axios.get(`${API}/cases`);
      const activeCases = response.data.filter(c => c.status === 'active');
      setCases(activeCases);
      if (activeCases.length > 0 && !selectedCase) {
        setSelectedCase(activeCases[0]);
      }
    } catch (error) {
      console.error('Failed to load cases:', error);
    }
  };

  const fetchTargets = async (caseId) => {
    try {
      const response = await axios.get(`${API}/targets?case_id=${caseId}`);
      setTargets(response.data);
    } catch (error) {
      console.error('Failed to load targets:', error);
    }
  };

  const fetchChatMessages = async (targetId) => {
    try {
      const response = await axios.get(`${API}/targets/${targetId}/chat`);
      console.log(`Chat messages for ${targetId}:`, response.data);
      setChatMessages(response.data);
    } catch (error) {
      console.error('Failed to load chat:', error);
    }
  };

  const fetchSchedules = async () => {
    try {
      const response = await axios.get(`${API}/schedules`);
      setActiveSchedules(response.data);
    } catch (error) {
      console.error('Failed to load schedules:', error);
    }
  };

  const getTargetSchedule = (phoneNumber) => {
    return activeSchedules.find(s => s.phone_number === phoneNumber && s.active);
  };

  // Handler when countdown reaches zero - execute scheduled update
  const handleCountdownEnd = async (scheduleId) => {
    if (!scheduleId) return;
    
    // Check if this schedule is already being executed
    if (executingSchedulesRef.current.has(scheduleId)) {
      console.log('[SCHEDULE] Already executing, skipping duplicate:', scheduleId);
      return;
    }
    
    // Mark as executing
    executingSchedulesRef.current.add(scheduleId);
    console.log('[SCHEDULE] Countdown ended for schedule:', scheduleId);
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API}/schedules/${scheduleId}/execute`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.info(`Memperbarui posisi ${response.data.target_id ? 'target' : ''}...`, {
        duration: 5000
      });
      
      // Refresh schedules to get new next_run time
      fetchSchedules();
      
      // Start polling for target update
      setTimeout(() => {
        fetchTargets();
      }, 3000);
      
      // Keep polling until completed
      const pollInterval = setInterval(async () => {
        const targetsRes = await axios.get(`${API}/targets`);
        const updatedTarget = targetsRes.data.find(t => t.id === response.data.target_id);
        
        if (updatedTarget && updatedTarget.status === 'completed') {
          clearInterval(pollInterval);
          fetchTargets();
          toast.success(`Posisi ${updatedTarget.phone_number} berhasil diperbarui!`);
          
          // Remove from executing set after completion
          executingSchedulesRef.current.delete(scheduleId);
          
          // Refresh history path if this target's history is being displayed
          await refreshHistoryPath(response.data.target_id);
          
          // Center map on new position if available
          if (updatedTarget.data?.latitude && updatedTarget.data?.longitude) {
            setMapCenter([
              parseFloat(updatedTarget.data.latitude),
              parseFloat(updatedTarget.data.longitude)
            ]);
            setMapZoom(15);
            setMapKey(prev => prev + 1);
          }
        }
      }, 5000);
      
      // Stop polling after 2 minutes and cleanup
      setTimeout(() => {
        clearInterval(pollInterval);
        executingSchedulesRef.current.delete(scheduleId);
      }, 120000);
      
    } catch (error) {
      console.error('Failed to execute schedule:', error);
      toast.error('Gagal memperbarui posisi: ' + (error.response?.data?.detail || error.message));
      // Remove from executing set on error
      executingSchedulesRef.current.delete(scheduleId);
    }
  };

  const handleCancelSchedule = async (scheduleId) => {
    if (!window.confirm('Batalkan penjadwalan?')) {
      return;
    }
    
    try {
      await axios.delete(`${API}/schedules/${scheduleId}`);
      toast.success('Penjadwalan dibatalkan');
      fetchSchedules();
    } catch (error) {
      toast.error('Gagal membatalkan penjadwalan');
    }
  };

  const toggleTargetVisibility = (targetId) => {
    const newVisible = new Set(visibleTargets);
    if (newVisible.has(targetId)) {
      newVisible.delete(targetId);
    } else {
      newVisible.add(targetId);
    }
    setVisibleTargets(newVisible);
  };

  const handleDeleteCase = async (caseItem) => {
    if (!window.confirm(`Hapus case "${caseItem.name}"?\n\nSemua target dan data dalam case ini akan terhapus permanent.`)) {
      return;
    }
    
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
    if (!window.confirm(`Hapus target ${target.phone_number}?\n\nSemua data (lokasi, Reghp, NIK, foto) akan terhapus permanent.`)) {
      return;
    }
    
    try {
      await axios.delete(`${API}/targets/${target.id}`);
      toast.success('Target berhasil dihapus');
      fetchTargets(selectedCase.id);
      
      // Remove from visible targets
      const newVisible = new Set(visibleTargets);
      newVisible.delete(target.id);
      setVisibleTargets(newVisible);
      
      // If was selected for chat, clear it
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
      const response = await axios.post(`${API}/cases`, {
        name: newCaseName,
        description: ''
      });
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
    
    // Check if phone already exists in current case
    const existing = targets.find(t => t.phone_number === newPhoneNumber);
    
    if (existing) {
      // Found duplicate - show dialog
      setExistingTarget(existing);
      setPendingPhoneNumber(newPhoneNumber);
      setDuplicateDialogOpen(true);
      setAddTargetDialog(false);
      
      // Zoom to existing marker if has location
      if (existing.data?.latitude && existing.data?.longitude) {
        handleTargetClick(existing);
      }
      return;
    }
    
    // No duplicate, proceed with new target
    await createNewTarget(newPhoneNumber);
  };

  const createNewTarget = async (phoneNumber) => {
    setSubmitting(true);
    try {
      const response = await axios.post(`${API}/targets`, {
        case_id: selectedCase.id,
        phone_number: phoneNumber
      });
      toast.success('Target query dimulai!');
      setAddTargetDialog(false);
      setNewPhoneNumber('');
      fetchTargets(selectedCase.id);
      
      // Set selected target but don't auto-open chat panel
      setSelectedTargetForChat(response.data.id);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add target');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefreshLocation = async () => {
    setDuplicateDialogOpen(false);
    await createNewTarget(pendingPhoneNumber);
    setPendingPhoneNumber('');
  };

  const handleUseExisting = () => {
    setDuplicateDialogOpen(false);
    toast.info('Menggunakan data yang sudah ada');
    setPendingPhoneNumber('');
    setNewPhoneNumber('');
    
    // Show existing data
    if (existingTarget) {
      setSelectedTargetForChat(existingTarget.id);
    }
  };

  const handlePerbaharui = async (target) => {
    if (!window.confirm(`Perbaharui lokasi untuk ${target.phone_number}?`)) {
      return;
    }
    
    try {
      const response = await axios.post(`${API}/targets`, {
        case_id: selectedCase.id,
        phone_number: target.phone_number
      });
      toast.success('Query pembaharuan dimulai!');
      setSelectedTargetForChat(response.data.id);
    } catch (error) {
      toast.error('Gagal memulai pembaharuan');
    }
  };

  const handleOpenScheduleDialog = (target) => {
    setSelectedTargetForSchedule(target);
    setScheduleDialogOpen(true);
  };

  const handleCreateSchedule = async (e) => {
    e.preventDefault();
    
    try {
      await axios.post(`${API}/schedules`, {
        case_id: selectedTargetForSchedule.case_id,
        phone_number: selectedTargetForSchedule.phone_number,
        interval_type: scheduleInterval.type,
        interval_value: scheduleInterval.value,
        active: true
      });
      toast.success('Jadwal berhasil dibuat!');
      setScheduleDialogOpen(false);
      setScheduleInterval({ type: 'hourly', value: 1 });
      fetchSchedules();
    } catch (error) {
      toast.error('Gagal membuat jadwal');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleTargetClick = (target) => {
    setSelectedTargetForChat(target.id);
    
    // If target has location, zoom to it
    if (target.data && target.data.latitude && target.data.longitude) {
      setMapCenter([target.data.latitude, target.data.longitude]);
      setMapZoom(16); // Zoom in closer
      setMapKey(prev => prev + 1); // Force map update
    }
  };

  const hasActiveQueries = targets.some(t => 
    ['pending', 'connecting', 'querying', 'processing', 'parsing'].includes(t.status)
  );

  const handlePendalaman = async (target) => {
    // Check if another process is running
    if (isProcessRunning()) {
      showBusyNotification();
      return;
    }
    
    // Set global processing
    setGlobalProcessing(true);
    setGlobalProcessType('pendalaman');
    setLoadingPendalaman(target.id);
    
    // Optimistic update - langsung set status processing
    const updatedTargets = targets.map(t => 
      t.id === target.id ? { ...t, reghp_status: 'processing' } : t
    );
    setTargets(updatedTargets);
    
    // Also update selectedReghpTarget if it's the same target
    if (selectedReghpTarget?.id === target.id) {
      setSelectedReghpTarget({ ...selectedReghpTarget, reghp_status: 'processing' });
    }
    
    try {
      await axios.post(`${API}/targets/${target.id}/reghp`);
      toast.success('Pendalaman query dimulai!');
      
      // Poll for completion with timeout (max 60 seconds)
      let attempts = 0;
      const maxAttempts = 30;
      const checkInterval = setInterval(async () => {
        attempts++;
        try {
          const response = await axios.get(`${API}/targets/${target.id}`);
          const updatedTarget = response.data;
          
          if (updatedTarget.reghp_status === 'completed' || updatedTarget.reghp_status === 'error') {
            clearInterval(checkInterval);
            setGlobalProcessing(false);
            setGlobalProcessType(null);
            setLoadingPendalaman(null);
            fetchTargets(selectedCase.id);
            
            if (updatedTarget.reghp_status === 'completed') {
              toast.success('Pendalaman selesai!');
            }
          } else if (attempts >= maxAttempts) {
            // Timeout - reset and allow retry
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
    // Keep selectedReghpTarget in sync with targets updates
    if (selectedReghpTarget && reghpDialogOpen) {
      const updatedTarget = targets.find(t => t.id === selectedReghpTarget.id);
      if (updatedTarget) {
        setSelectedReghpTarget(updatedTarget);
      }
    }
  }, [targets, reghpDialogOpen]);

  const handleNikPendalaman = async (targetId, nik) => {
    // Check if another process is running
    if (isProcessRunning()) {
      showBusyNotification();
      return;
    }
    
    // Set global processing
    setGlobalProcessing(true);
    setGlobalProcessType('nik');
    setLoadingNikPendalaman(nik);
    
    // Optimistic update
    const updatedTargets = targets.map(t => {
      if (t.id === targetId) {
        const nikQueries = { ...(t.nik_queries || {}) };
        nikQueries[nik] = { ...(nikQueries[nik] || {}), status: 'processing' };
        return { ...t, nik_queries: nikQueries };
      }
      return t;
    });
    setTargets(updatedTargets);
    
    // Also update selectedReghpTarget if viewing
    if (selectedReghpTarget?.id === targetId) {
      const nikQueries = { ...(selectedReghpTarget.nik_queries || {}) };
      nikQueries[nik] = { ...(nikQueries[nik] || {}), status: 'processing' };
      setSelectedReghpTarget({ ...selectedReghpTarget, nik_queries: nikQueries });
    }
    
    try {
      await axios.post(`${API}/targets/${targetId}/nik`, { nik });
      toast.success('NIK query dimulai!');
      
      // Poll for completion with timeout
      let attempts = 0;
      const maxAttempts = 30;
      const checkInterval = setInterval(async () => {
        attempts++;
        try {
          const response = await axios.get(`${API}/targets/${targetId}`);
          const target = response.data;
          const nikData = target.nik_queries?.[nik];
          
          if (nikData?.status === 'completed' || nikData?.status === 'error') {
            clearInterval(checkInterval);
            setGlobalProcessing(false);
            setGlobalProcessType(null);
            setLoadingNikPendalaman(null);
            fetchTargets(selectedCase.id);
            
            if (nikData?.status === 'completed') {
              toast.success('NIK query selesai!');
            }
          } else if (attempts >= maxAttempts) {
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
      toast.error(error.response?.data?.detail || 'Failed to start NIK query');
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
    // Check if another process is running
    if (isProcessRunning()) {
      showBusyNotification();
      return;
    }
    
    if (!targetId || !familyId) {
      toast.error('Target ID atau Family ID tidak valid');
      return;
    }
    
    // Set global processing
    setGlobalProcessing(true);
    setGlobalProcessType('family');
    setLoadingFamilyPendalaman(sourceNik);
    
    try {
      // Send source_nik to store family data per NIK
      await axios.post(`${API}/targets/${targetId}/family`, { 
        family_id: familyId,
        source_nik: sourceNik  // The NIK that triggered this query
      });
      toast.success('Family query dimulai! Tunggu ~15 detik...');
      setTargetNikForTree(sourceNik);
      
      // Poll for completion and auto-open dialog
      let attempts = 0;
      const maxAttempts = 30;
      const checkInterval = setInterval(async () => {
        attempts++;
        
        try {
          const response = await axios.get(`${API}/targets/${targetId}`);
          const target = response.data;
          
          // Update selectedReghpTarget
          if (selectedReghpTarget?.id === targetId) {
            setSelectedReghpTarget(target);
          }
          
          // Check family data in the specific NIK's data
          const nikData = target.nik_queries?.[sourceNik];
          if (nikData?.family_status === 'completed' && nikData?.family_data) {
            clearInterval(checkInterval);
            setGlobalProcessing(false);
            setGlobalProcessType(null);
            setLoadingFamilyPendalaman(null);
            toast.success('Family Tree data tersedia!');
            
            // Auto-open Family Tree dialog with NIK-specific family data
            setTimeout(() => {
              handleShowFamilyTree(nikData.family_data, sourceNik);
            }, 500);
          } else if (nikData?.family_status === 'error' || attempts >= maxAttempts) {
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
    // Clear global processing when dialog opens (process completed)
    setGlobalProcessing(false);
    setGlobalProcessType(null);
    setLoadingFamilyPendalaman(null);
  };

  // Filter targets based on search query - include NIK data
  const filteredTargets = targets.filter(target => {
    if (!searchQuery) return true;
    
    const query = searchQuery.toLowerCase();
    const phone = target.phone_number.toLowerCase();
    const address = target.data?.address?.toLowerCase() || '';
    const name = target.data?.name?.toLowerCase() || '';
    
    // Search in NIK data (deep search)
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

  const center = targets.filter(t => t.data).length > 0
    ? [targets.filter(t => t.data)[0].data.latitude, targets.filter(t => t.data)[0].data.longitude]
    : [-6.2088, 106.8456];

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'var(--status-success)';
      case 'not_found': return 'var(--status-warning)';
      case 'error': return 'var(--status-error)';
      default: return 'var(--status-processing)';
    }
  };

  return (
    <div className="flex" style={{ height: '100vh', width: '100vw', backgroundColor: 'var(--background-primary)', overflow: 'hidden' }}>
      {/* Sidebar - collapsible */}
      {!isMaximized && !sidebarCollapsed && (
        <aside 
          className="w-80 flex flex-col border-r"
          style={{ 
            backgroundColor: 'var(--background-secondary)',
            borderColor: 'var(--borders-default)'
          }}
        >
        {/* Header */}
        <div className="p-4 border-b" style={{ borderColor: 'var(--borders-default)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' }}
              >
                <Shield className="w-6 h-6" style={{ color: 'var(--background-primary)' }} />
              </div>
              <div>
                <h1 
                  className="text-xl font-bold"
                  style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}
                >
                  WASKITA LBS
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => navigate('/settings')}
                data-testid="settings-button"
                title="Settings"
              >
                <SettingsIcon className="w-5 h-5" style={{ color: 'var(--foreground-secondary)' }} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleLogout}
                data-testid="logout-button"
                title="Logout"
              >
                <LogOut className="w-5 h-5" style={{ color: 'var(--status-error)' }} />
              </Button>
            </div>
          </div>

          {/* Telegram Status */}
          <div 
            className="p-3 rounded-lg border text-sm"
            style={{
              backgroundColor: telegramAuthorized ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 184, 0, 0.1)',
              borderColor: telegramAuthorized ? 'var(--status-success)' : 'var(--status-warning)'
            }}
          >
            <div className="flex items-center gap-2">
              <div 
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: telegramAuthorized ? 'var(--status-success)' : 'var(--status-warning)' }}
              />
              <span style={{ color: 'var(--foreground-primary)' }}>
                {telegramAuthorized ? `@${telegramUser?.username}` : 'Telegram disconnected'}
              </span>
            </div>
          </div>
        </div>

        {/* Global Processing Indicator */}
        {globalProcessing && (
          <div 
            className="p-2 rounded-lg border text-xs animate-pulse"
            style={{
              backgroundColor: 'rgba(0, 217, 255, 0.1)',
              borderColor: 'var(--accent-primary)'
            }}
          >
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 animate-spin" style={{ color: 'var(--accent-primary)' }} />
              <span style={{ color: 'var(--foreground-primary)' }}>
                {globalProcessType === 'pendalaman' && 'Processing Pendalaman...'}
                {globalProcessType === 'nik' && 'Processing NIK Query...'}
                {globalProcessType === 'family' && 'Processing Family Query...'}
              </span>
            </div>
          </div>
        )}

        {/* Cases Section */}
        <div className="p-4 border-b" style={{ borderColor: 'var(--borders-default)' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 
              className="text-sm uppercase tracking-wide font-semibold"
              style={{ color: 'var(--foreground-secondary)', fontFamily: 'Rajdhani, sans-serif' }}
            >
              Cases
            </h2>
            <Button
              size="sm"
              onClick={() => setNewCaseDialog(true)}
              data-testid="new-case-button"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--background-primary)'
              }}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="space-y-2">
            {cases.map((caseItem) => (
              <div
                key={caseItem.id}
                className="p-3 rounded-md border cursor-pointer transition-all flex items-center justify-between group"
                onClick={() => setSelectedCase(caseItem)}
                style={{
                  backgroundColor: selectedCase?.id === caseItem.id ? 'var(--background-tertiary)' : 'transparent',
                  borderColor: selectedCase?.id === caseItem.id ? 'var(--accent-primary)' : 'var(--borders-subtle)',
                  borderLeftWidth: '3px'
                }}
              >
                <div className="flex-1">
                  <p className="font-semibold text-sm" style={{ color: 'var(--foreground-primary)' }}>
                    {caseItem.name}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                    {caseItem.target_count || 0} targets
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {/* Print Case Button */}
                  {selectedCase?.id === caseItem.id && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrintCase();
                      }}
                      disabled={printingCase}
                      className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8"
                      style={{ color: 'var(--accent-secondary)' }}
                      title="Export Case ke PDF"
                    >
                      <Printer className={`w-4 h-4 ${printingCase ? 'animate-pulse' : ''}`} />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCase(caseItem);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8"
                    style={{ color: 'var(--status-error)' }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
            {cases.length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: 'var(--foreground-muted)' }}>
                Belum ada case
              </p>
            )}
          </div>
        </div>

        {/* Targets Section */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Search Bar */}
          <div className="mb-3">
            <div className="relative">
              <Search 
                className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
                style={{ color: 'var(--foreground-muted)' }}
              />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search phone, nama, NIK..."
                className="pl-10 bg-background-tertiary border-borders-default text-xs"
                style={{ color: '#000000' }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between mb-3">
            <h2 
              className="text-sm uppercase tracking-wide font-semibold"
              style={{ color: 'var(--foreground-secondary)', fontFamily: 'Rajdhani, sans-serif' }}
            >
              Targets {searchQuery && `(${filteredTargets.length})`}
            </h2>
            {selectedCase && (
              <Button
                size="sm"
                onClick={() => setAddTargetDialog(true)}
                data-testid="add-target-button"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--background-primary)'
                }}
              >
                <Plus className="w-4 h-4" />
              </Button>
            )}
          </div>
          <div 
            className="space-y-2 overflow-y-auto pr-1"
            style={{ 
              maxHeight: '360px', // Approximately 3 targets visible
              scrollbarWidth: 'thin',
              scrollbarColor: 'var(--accent-primary) var(--background-tertiary)'
            }}
          >
            {filteredTargets.map((target) => (
              <div
                key={target.id}
                className="rounded-md border group"
                style={{
                  backgroundColor: selectedTargetForChat === target.id ? 'var(--background-elevated)' : 'var(--background-tertiary)',
                  borderColor: 'var(--borders-subtle)',
                  borderLeftWidth: '3px',
                  borderLeftColor: getStatusColor(target.status)
                }}
              >
                {/* Target Info - Clickable */}
                <div className="p-3">
                  {/* Checkbox for visibility + Target info */}
                  <div className="flex items-start gap-2">
                    {/* Checkbox */}
                    {target.status === 'completed' && target.data && (
                      <input
                        type="checkbox"
                        checked={visibleTargets.has(target.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleTargetVisibility(target.id);
                        }}
                        className="mt-1 w-4 h-4 cursor-pointer"
                        style={{
                          accentColor: 'var(--accent-primary)'
                        }}
                      />
                    )}
                    
                    {/* Target Info */}
                    <div
                      onClick={() => handleTargetClick(target)}
                      className="flex-1 cursor-pointer hover:opacity-80 transition-all"
                    >
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-mono text-xs" style={{ color: 'var(--accent-primary)' }}>
                      {target.phone_number}
                    </p>
                    <div className="flex items-center gap-2">
                      {target.status === 'completed' ? (
                        <CheckCircle className="w-4 h-4" style={{ color: 'var(--status-success)' }} />
                      ) : target.status === 'not_found' ? (
                        <XCircle className="w-4 h-4" style={{ color: 'var(--status-warning)' }} />
                      ) : target.status === 'error' ? (
                        <XCircle className="w-4 h-4" style={{ color: 'var(--status-error)' }} />
                      ) : (
                        <Activity className="w-4 h-4 animate-pulse" style={{ color: 'var(--status-processing)' }} />
                      )}
                      {/* Print Button for Target */}
                      {target.status === 'completed' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePrintTarget(target);
                          }}
                          disabled={printingTarget === target.id}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1"
                          style={{ color: 'var(--accent-secondary)' }}
                          title="Export PDF"
                        >
                          <Printer className={`w-4 h-4 ${printingTarget === target.id ? 'animate-pulse' : ''}`} />
                        </button>
                      )}
                      {/* History Button for Target - Toggle on/off */}
                      {target.status === 'completed' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Check if history for this target is already active
                            if (activeHistoryTargets.includes(target.id)) {
                              // Second click - hide history
                              hideTargetHistory(target.id);
                            } else {
                              // First click - open dialog to show history
                              setSelectedTargetForHistory(target);
                              setHistoryDialogOpen(true);
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1"
                          style={{ 
                            color: activeHistoryTargets.includes(target.id) 
                              ? 'var(--status-success)' 
                              : 'var(--accent-primary)' 
                          }}
                          title={activeHistoryTargets.includes(target.id) ? "Sembunyikan History" : "Riwayat Posisi"}
                        >
                          <History className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTarget(target);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1"
                        style={{ color: 'var(--status-error)' }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {target.data && (
                    <p className="text-xs line-clamp-1" style={{ color: 'var(--foreground-secondary)' }}>\n                      {target.data.address}
                    </p>
                  )}
                  {target.status === 'not_found' && (
                    <p className="text-xs" style={{ color: 'var(--status-warning)' }}>
                      Target OFF / Tidak ditemukan
                    </p>
                  )}
                  {target.status === 'error' && (
                    <p className="text-xs" style={{ color: 'var(--status-error)' }}>
                      Error: {target.error}
                    </p>
                  )}
                      <p className="text-xs uppercase mt-1" style={{ color: 'var(--foreground-muted)' }}>
                        {target.status}
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Action Buttons - Only for completed targets */}
                {target.status === 'completed' && (
                  <div className="px-3 pb-3 flex gap-2">
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePerbaharui(target);
                      }}
                      className="flex-1 text-xs"
                      style={{
                        backgroundColor: 'var(--status-info)',
                        color: 'var(--background-primary)'
                      }}
                    >
                      🔄 Perbaharui
                    </Button>
                    {target.status === 'processing' ? (
                      <Button
                        size="sm"
                        disabled
                        className="flex-1 text-xs"
                        style={{
                          backgroundColor: 'var(--status-warning)',
                          color: 'var(--background-primary)'
                        }}
                      >
                        ⏳ Memproses...
                      </Button>
                    ) : getTargetSchedule(target.phone_number) ? (
                      <div className="flex-1 flex flex-col items-center">
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelSchedule(getTargetSchedule(target.phone_number).id);
                          }}
                          className="w-full text-xs"
                          style={{
                            backgroundColor: 'var(--status-error)',
                            color: 'white'
                          }}
                        >
                          ❌ Batal Jadwal
                        </Button>
                        <CountdownTimer 
                          nextRun={getTargetSchedule(target.phone_number).next_run}
                          scheduleId={getTargetSchedule(target.phone_number).id}
                          onCountdownEnd={handleCountdownEnd}
                        />
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenScheduleDialog(target);
                        }}
                        className="flex-1 text-xs"
                        style={{
                          backgroundColor: 'var(--status-success)',
                          color: 'var(--background-primary)'
                        }}
                      >
                        📅 Jadwalkan
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!selectedCase && (
              <p className="text-xs text-center py-4" style={{ color: 'var(--foreground-muted)' }}>
                Pilih case terlebih dahulu
              </p>
            )}
            {selectedCase && filteredTargets.length === 0 && searchQuery && (
              <p className="text-xs text-center py-4" style={{ color: 'var(--foreground-muted)' }}>
                Tidak ditemukan untuk &quot;{searchQuery}&quot;
              </p>
            )}
            {selectedCase && filteredTargets.length === 0 && !searchQuery && (
              <p className="text-xs text-center py-4" style={{ color: 'var(--foreground-muted)' }}>
                Belum ada target
              </p>
            )}
          </div>
        </div>
      </aside>
      )}

      {/* Sidebar Toggle Button - When collapsed, show at middle left */}
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

      {/* Sidebar Minimize Button - At middle right of sidebar */}
      {!isMaximized && !sidebarCollapsed && (
        <Button
          onClick={() => setSidebarCollapsed(true)}
          size="icon"
          className="fixed left-[304px] top-1/2 transform -translate-y-1/2 z-[2000] w-10 h-10 rounded-full shadow-lg"
          style={{
            backgroundColor: 'var(--background-elevated)',
            borderColor: 'var(--accent-primary)',
            color: 'var(--accent-primary)',
            border: '2px solid'
          }}
        >
          <Minimize2 className="w-5 h-5" />
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
          {showMapControls && (
            <div 
              className="absolute top-4 z-[1000] flex flex-col gap-2"
              style={{ 
                pointerEvents: 'auto',
                right: '16px',
                transition: 'right 300ms'
              }}
            >
            {/* Map Type - increase width to prevent overlap */}
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
                <Select value={selectedTileLayer} onValueChange={handleTileLayerChange}>
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
            )}

            {/* Maximize - always visible */}
            <Button
              onClick={() => setIsMaximized(!isMaximized)}
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
                onClick={() => setShowMarkerNames(!showMarkerNames)}
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
                onClick={() => setAoiPanelOpen(true)}
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
                  onClick={handleFinishDrawing}
                  className="h-6 px-2 text-xs"
                  style={{ backgroundColor: 'white', color: 'var(--status-success)' }}
                >
                  ✓ Selesai
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancelDrawing}
                  className="h-6 px-2 text-xs"
                  style={{ color: 'white' }}
                >
                  ✕
                </Button>
              </div>
            )}

            {/* Add Target (Floating) */}
            {selectedCase && !drawingMode && (
              <Button
                onClick={() => setAddTargetDialog(true)}
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

            {/* Chat History Toggle - Opens Popup */}
            {!drawingMode && (
              <div className="relative">
                <Button
                  onClick={() => setShowChatPanel(true)}
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
                {/* Red blinking indicator for active queries - positioned on top center */}
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
          )}

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
              {drawingMode === 'polygon' && drawingPoints.length >= 2 && (
                <Polyline
                  positions={drawingPoints}
                  pathOptions={{ color: '#00FF00', weight: 3, dashArray: '10, 10' }}
                />
              )}
              {drawingMode === 'polygon' && drawingPoints.length >= 3 && (
                <Polygon
                  positions={drawingPoints}
                  pathOptions={{ color: '#00FF00', fillColor: '#00FF00', fillOpacity: 0.2, weight: 2 }}
                />
              )}
              {drawingMode === 'circle' && drawingPoints.length === 1 && (
                <Circle
                  center={drawingPoints[0]}
                  radius={100}
                  pathOptions={{ color: '#00FF00', fillColor: '#00FF00', fillOpacity: 0.2, dashArray: '10, 10' }}
                />
              )}
              {drawingMode === 'circle' && drawingPoints.length >= 2 && (
                <Circle
                  center={drawingPoints[0]}
                  radius={(() => {
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
                    return R * c;
                  })()}
                  pathOptions={{ color: '#00FF00', fillColor: '#00FF00', fillOpacity: 0.2 }}
                />
              )}
              {/* Drawing points markers */}
              {drawingPoints.map((point, idx) => (
                <Circle
                  key={`draw-point-${idx}`}
                  center={point}
                  radius={30}
                  pathOptions={{ color: '#00FF00', fillColor: '#00FF00', fillOpacity: 1 }}
                />
              ))}

              {targets.filter(t => {
                const hasData = t.data && t.data.latitude && t.data.longitude;
                const isVisible = visibleTargets.has(t.id);
                
                // Debug log
                if (hasData && !isVisible) {
                  console.log(`Target ${t.phone_number} has data but not visible (not checked)`);
                }
                
                return hasData && isVisible;
              }).map((target) => {
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
                            onClick={() => handleShowReghpInfo(target)}
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
                            onClick={() => handlePendalaman(target)}
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
                </Marker>
              );
              })}

              {/* Render AOIs */}
              {aois.filter(aoi => aoi.is_visible).map(aoi => {
                // Check if any monitored target is inside this AOI
                const hasAlert = aoiAlerts.some(alert => 
                  alert.aoi_id === aoi.id && !alert.acknowledged
                );
                
                if (aoi.aoi_type === 'polygon' && aoi.coordinates?.length >= 3) {
                  return (
                    <Polygon
                      key={aoi.id}
                      positions={aoi.coordinates}
                      pathOptions={{
                        color: hasAlert ? '#FF3B5C' : '#00D9FF',
                        fillColor: hasAlert ? '#FF3B5C' : '#00D9FF',
                        fillOpacity: hasAlert ? 0.4 : 0.2,
                        weight: 2
                      }}
                    >
                      <Popup>
                        <div className="p-2">
                          <p className="font-bold">{aoi.name}</p>
                          <p className="text-xs">Monitoring: {aoi.monitored_targets?.length || 0} target(s)</p>
                          <p className="text-xs">Alarm: {aoi.alarm_enabled ? 'ON' : 'OFF'}</p>
                        </div>
                      </Popup>
                    </Polygon>
                  );
                } else if (aoi.aoi_type === 'circle' && aoi.coordinates?.length >= 2) {
                  return (
                    <Circle
                      key={aoi.id}
                      center={aoi.coordinates}
                      radius={aoi.radius || 500}
                      pathOptions={{
                        color: hasAlert ? '#FF3B5C' : '#FFB800',
                        fillColor: hasAlert ? '#FF3B5C' : '#FFB800',
                        fillOpacity: hasAlert ? 0.4 : 0.2,
                        weight: 2
                      }}
                    >
                      <Popup>
                        <div className="p-2">
                          <p className="font-bold">{aoi.name}</p>
                          <p className="text-xs">Radius: {aoi.radius}m</p>
                          <p className="text-xs">Monitoring: {aoi.monitored_targets?.length || 0} target(s)</p>
                          <p className="text-xs">Alarm: {aoi.alarm_enabled ? 'ON' : 'OFF'}</p>
                        </div>
                      </Popup>
                    </Circle>
                  );
                }
                return null;
              })}

              {/* Render History Paths - Multiple targets supported */}
              {activeHistoryTargets.map((targetId, targetIdx) => {
                const historyPath = historyPaths[targetId] || [];
                if (historyPath.length === 0) return null;
                
                // Different colors for different targets
                const colors = ['#FFB800', '#00BFFF', '#FF69B4', '#00FF7F', '#FF6347'];
                const pathColor = colors[targetIdx % colors.length];
                
                // Find target info for display and get current location
                const targetInfo = targets.find(t => t.id === targetId);
                const phoneLabel = targetInfo?.phone_number?.slice(-6) || targetId.slice(-6);
                
                // Get target's current location to identify the newest point
                const currentLat = targetInfo?.data?.latitude || targetInfo?.location?.coordinates?.[1];
                const currentLng = targetInfo?.data?.longitude || targetInfo?.location?.coordinates?.[0];
                
                return (
                  <React.Fragment key={`history-path-${targetId}`}>
                    {/* Path line */}
                    {historyPath.length > 1 && (
                      <Polyline
                        positions={historyPath.map(p => [p.lat, p.lng])}
                        pathOptions={{
                          color: pathColor,
                          weight: 3,
                          opacity: 0.8,
                          dashArray: '10, 10'
                        }}
                      />
                    )}
                    
                    {/* History points */}
                    {historyPath.map((pos, idx) => {
                      const formatTime = (ts) => {
                        if (!ts) return '';
                        const date = new Date(ts);
                        return date.toLocaleString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        });
                      };
                      
                      // Check if this point matches target's CURRENT location (that's the newest)
                      // Use coordinate comparison instead of array index
                      const isAtCurrentLocation = currentLat && currentLng && 
                        Math.abs(pos.lat - currentLat) < 0.0001 && 
                        Math.abs(pos.lng - currentLng) < 0.0001;
                      
                      const isNewest = isAtCurrentLocation || idx === 0;
                      const isOldest = idx === historyPath.length - 1;
                      const pointColor = isNewest ? '#FF3B5C' : pathColor;
                      
                      return (
                        <React.Fragment key={`history-point-${targetId}-${idx}`}>
                          {/* Circle marker for the point */}
                          <Circle
                            center={[pos.lat, pos.lng]}
                            radius={isNewest ? 8 : 4}
                            pathOptions={{
                              color: pointColor,
                              fillColor: pointColor,
                              fillOpacity: 1,
                              weight: isNewest ? 2 : 1
                            }}
                          >
                            <Popup>
                              <div className="p-2 text-center">
                                <p className="font-bold text-sm" style={{ color: pointColor }}>
                                  {isNewest ? `📍 TERBARU` : isOldest ? `🏁 AWAL` : `📌 Titik ${idx}`}
                                </p>
                                <p className="text-xs">{formatTime(pos.timestamp)}</p>
                                <p className="text-xs font-mono">{pos.lat?.toFixed(5)}, {pos.lng?.toFixed(5)}</p>
                              </div>
                            </Popup>
                          </Circle>
                          
                          {/* Arrow + Timestamp - ONLY on older points (NOT newest) */}
                          {!isNewest && historyPath.length > 1 && (
                            <Marker
                              position={[pos.lat, pos.lng]}
                              icon={L.divIcon({
                                className: 'history-label-arrow',
                                html: `<div style="
                                  display: flex;
                                  flex-direction: column;
                                  align-items: center;
                                  transform: translate(-50%, -32px);
                                ">
                                  <div style="
                                    background: rgba(0,0,0,0.75);
                                    color: ${pathColor};
                                    padding: 1px 4px;
                                    border-radius: 2px;
                                    font-size: 8px;
                                    font-weight: 500;
                                    white-space: nowrap;
                                    margin-bottom: 1px;
                                  ">${formatTime(pos.timestamp)}</div>
                                  <div style="
                                    width: 0;
                                    height: 0;
                                    border-left: 4px solid transparent;
                                    border-right: 4px solid transparent;
                                    border-top: 6px solid ${pathColor};
                                  "></div>
                                </div>`,
                                iconSize: [0, 0],
                                iconAnchor: [0, 0]
                              })}
                            />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </MapContainer>
          )}
        </div>

          {/* Toggle Map Controls Button - Always visible */}
          <Button
            onClick={() => setShowMapControls(!showMapControls)}
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
      </main>

      {/* Chat Dialog Popup */}
      <Dialog open={showChatPanel} onOpenChange={setShowChatPanel}>
        <DialogContent 
          className="z-[9999] max-w-md p-0 max-h-[80vh] flex flex-col"
          style={{
            backgroundColor: 'var(--background-elevated)',
            borderColor: 'var(--borders-default)'
          }}
        >
          {/* Chat Header */}
          <div 
            className="p-4 border-b shrink-0"
            style={{ borderColor: 'var(--borders-default)' }}
          >
            <DialogTitle>
              <h3 
                className="font-semibold text-sm"
                style={{ 
                  color: 'var(--foreground-primary)',
                  fontFamily: 'Barlow Condensed, sans-serif'
                }}
              >
                CHAT HISTORY
              </h3>
            </DialogTitle>
            <p 
              className="text-xs font-mono mt-1"
              style={{ color: 'var(--accent-primary)' }}
            >
              {targets.find(t => t.id === selectedTargetForChat)?.phone_number || 'Select target'}
            </p>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: '60vh' }}>
            {chatMessages.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
                  Belum ada chat
                </p>
              </div>
            ) : (
              chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg ${msg.direction === 'sent' ? 'ml-8' : 'mr-8'}`}
                  style={{
                    backgroundColor: msg.direction === 'sent' 
                      ? 'rgba(0, 217, 255, 0.2)' 
                      : 'var(--background-tertiary)',
                    borderLeft: msg.direction === 'sent' 
                      ? '3px solid var(--accent-primary)' 
                      : '3px solid var(--borders-default)'
                  }}
                >
                  <p className="text-sm" style={{ color: 'var(--foreground-primary)' }}>
                    {msg.message}
                  </p>
                  {msg.has_buttons && msg.buttons && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {msg.buttons.flat().map((btn, i) => (
                        <span 
                          key={i}
                          className="px-2 py-1 rounded text-xs"
                          style={{
                            backgroundColor: 'rgba(0, 217, 255, 0.1)',
                            color: 'var(--accent-primary)',
                            border: '1px solid var(--accent-primary)'
                          }}
                        >
                          {btn}
                        </span>
                      ))}
                    </div>
                  )}
                  <p 
                    className="text-xs mt-1"
                    style={{ color: 'var(--foreground-muted)' }}
                  >
                    {new Date(msg.timestamp).toLocaleTimeString('id-ID')}
                  </p>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* New Case Dialog */}
      <Dialog open={newCaseDialog} onOpenChange={setNewCaseDialog}>
        <DialogContent 
          className="z-[9999] max-w-sm p-4"
          style={{
            backgroundColor: 'var(--background-elevated)',
            borderColor: 'var(--borders-strong)'
          }}
        >
          <DialogHeader className="pb-2">
            <DialogTitle 
              className="text-lg font-bold"
              style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}
            >
              New Case
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateCase} className="space-y-3">
            <div>
              <Label className="text-xs uppercase tracking-wide mb-1 block" style={{ color: 'var(--foreground-secondary)' }}>
                Case Name
              </Label>
              <Input
                value={newCaseName}
                onChange={(e) => setNewCaseName(e.target.value)}
                className="bg-background-tertiary border-borders-default h-9"
                style={{ color: '#000000' }}
                placeholder="Enter case name"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full py-2 text-sm"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--background-primary)',
                fontFamily: 'Rajdhani, sans-serif'
              }}
            >
              {submitting ? 'Creating...' : 'CREATE CASE'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Target Dialog */}
      <Dialog open={addTargetDialog} onOpenChange={setAddTargetDialog}>
        <DialogContent 
          className="z-[9999] max-w-sm p-4"
          style={{
            backgroundColor: 'var(--background-elevated)',
            borderColor: 'var(--borders-strong)'
          }}
        >
          <DialogHeader className="pb-2">
            <DialogTitle 
              className="text-lg font-bold"
              style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}
            >
              Add Target
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddTarget} className="space-y-3">
            <div>
              <Label className="text-xs uppercase tracking-wide mb-1 block" style={{ color: 'var(--foreground-secondary)' }}>
                Phone Number
              </Label>
              <div className="relative">
                <Phone 
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
                  style={{ color: 'var(--foreground-muted)' }}
                />
                <Input
                  value={newPhoneNumber}
                  onChange={(e) => setNewPhoneNumber(e.target.value)}
                  className="pl-10 font-mono bg-background-tertiary border-borders-default h-9"
                  style={{ color: '#000000' }}
                  placeholder="628123456789"
                  required
                />
              </div>
              <p className="text-xs mt-0.5" style={{ color: 'var(--foreground-muted)' }}>
                Format: 62 diikuti 9-12 digit
              </p>
            </div>
            
            {!telegramAuthorized && (
              <div 
                className="p-2 rounded border text-xs"
                style={{
                  backgroundColor: 'rgba(255, 184, 0, 0.1)',
                  borderColor: 'var(--status-warning)',
                  color: 'var(--foreground-secondary)'
                }}
              >
                ⚠️ Telegram belum terhubung. Setup di Settings.
              </div>
            )}
            
            <Button
              type="submit"
              disabled={submitting}
              className="w-full py-2 text-sm"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--background-primary)',
                fontFamily: 'Rajdhani, sans-serif'
              }}
            >
              {submitting ? 'Processing...' : 'START QUERY'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reghp Info Dialog */}
      <Dialog open={reghpDialogOpen} onOpenChange={setReghpDialogOpen}>
        <DialogContent 
          className="z-[9999] max-w-md max-h-[65vh] overflow-y-auto p-4"
          style={{
            backgroundColor: 'var(--background-elevated)',
            borderColor: 'var(--borders-strong)'
          }}
        >
          <DialogHeader className="pb-2">
            <DialogTitle 
              className="text-lg font-bold"
              style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}
            >
              INFO PENDALAMAN (REGHP)
            </DialogTitle>
          </DialogHeader>
          {selectedReghpTarget?.reghp_data && (
            <div className="space-y-2">
              {/* Phone Number */}
              <div>
                <p className="text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--foreground-muted)' }}>
                  Phone Number
                </p>
                <p className="font-mono text-sm" style={{ color: 'var(--accent-primary)' }}>
                  {selectedReghpTarget.phone_number}
                </p>
              </div>

              {/* Parsed Data */}
              {selectedReghpTarget.reghp_data.parsed_data && (
                <div 
                  className="p-2 rounded border"
                  style={{
                    backgroundColor: 'var(--background-tertiary)',
                    borderColor: 'var(--borders-default)'
                  }}
                >
                  <p className="text-xs font-semibold mb-1" style={{ color: 'var(--foreground-primary)' }}>
                    Registration Info
                  </p>
                  <div className="space-y-1">
                    {Object.entries(selectedReghpTarget.reghp_data.parsed_data).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-xs">
                        <span style={{ color: 'var(--foreground-muted)' }}>{key}:</span>
                        <span className="font-mono" style={{ color: 'var(--foreground-primary)' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* NIK Entries with Pendalaman buttons */}
              {selectedReghpTarget.reghp_data.niks && selectedReghpTarget.reghp_data.niks.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--foreground-muted)' }}>
                    NIK Entries ({selectedReghpTarget.reghp_data.niks.length})
                  </p>
                  <div className="space-y-1">
                    {selectedReghpTarget.reghp_data.niks.map((nik) => {
                      const nikQuery = selectedReghpTarget.nik_queries?.[nik];
                      const nikStatus = nikQuery?.status || 'not_started';
                      
                      return (
                        <div 
                          key={nik}
                          className="p-2 rounded border flex items-center justify-between"
                          style={{
                            backgroundColor: 'var(--background-secondary)',
                            borderColor: 'var(--borders-subtle)'
                          }}
                        >
                          <div>
                            <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>NIK</p>
                            <p className="font-mono text-xs" style={{ color: 'var(--accent-primary)' }}>
                              {nik}
                            </p>
                          </div>
                          <div>
                            {nikStatus === 'completed' ? (
                              <Button
                                size="sm"
                                onClick={() => handleShowNikInfo(nikQuery.data)}
                                className="text-xs py-1 px-2"
                                style={{
                                  backgroundColor: 'var(--accent-secondary)',
                                  color: 'var(--background-primary)'
                                }}
                              >
                                📋 Info
                              </Button>
                            ) : nikStatus === 'processing' || loadingNikPendalaman === nik ? (
                              <span className="text-xs" style={{ color: 'var(--status-processing)' }}>
                                ⏳
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => handleNikPendalaman(selectedReghpTarget.id, nik)}
                                disabled={loadingNikPendalaman === nik}
                                className="text-xs py-1 px-2 disabled:opacity-50"
                                style={{
                                  backgroundColor: 'var(--status-warning)',
                                  color: 'var(--background-primary)'
                                }}
                              >
                                {loadingNikPendalaman === nik ? '⏳' : '🔍'} Pendalaman
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Raw Response - Collapsible */}
              <details className="text-xs">
                <summary className="cursor-pointer uppercase tracking-wide mb-1" style={{ color: 'var(--foreground-muted)' }}>
                  Raw Response
                </summary>
                <div 
                  className="p-2 rounded border font-mono whitespace-pre-wrap mt-1"
                  style={{
                    backgroundColor: 'var(--background-tertiary)',
                    borderColor: 'var(--borders-subtle)',
                    color: 'var(--foreground-secondary)',
                    maxHeight: '150px',
                    overflowY: 'auto',
                    fontSize: '10px'
                  }}
                >
                  {selectedReghpTarget.reghp_data.raw_text}
                </div>
              </details>

              <Button
                onClick={() => setReghpDialogOpen(false)}
                className="w-full py-2 text-sm"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--background-primary)'
                }}
              >
                CLOSE
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* NIK Info Dialog */}
      <Dialog open={nikDialogOpen} onOpenChange={setNikDialogOpen}>
        <DialogContent 
          className="z-[9999] max-w-lg max-h-[70vh] overflow-y-auto p-4"
          style={{
            backgroundColor: 'var(--background-elevated)',
            borderColor: 'var(--borders-strong)'
          }}
        >
          <DialogHeader className="pb-2">
            <DialogTitle 
              className="text-lg font-bold"
              style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}
            >
              INFO PENDALAMAN NIK
            </DialogTitle>
          </DialogHeader>
          {selectedNikData && (
            <div className="space-y-2">
              {/* NIK */}
              <div>
                <p className="text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--foreground-muted)' }}>
                  NIK
                </p>
                <p className="font-mono text-sm font-bold" style={{ color: 'var(--accent-primary)' }}>
                  {selectedNikData.nik}
                </p>
              </div>

              {/* Photo - Smaller */}
              {selectedNikData.photo && (
                <div>
                  <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--foreground-muted)' }}>
                    Foto KTP
                  </p>
                  <div 
                    className="rounded border overflow-hidden"
                    style={{ borderColor: 'var(--borders-default)', maxWidth: '180px' }}
                  >
                    <img 
                      src={selectedNikData.photo} 
                      alt="KTP" 
                      className="w-full"
                      style={{ maxHeight: '200px', objectFit: 'contain', backgroundColor: 'var(--background-tertiary)' }}
                    />
                  </div>
                </div>
              )}

              {/* Parsed Data - Compact Table */}
              {selectedNikData.parsed_data && Object.keys(selectedNikData.parsed_data).length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-1" style={{ color: 'var(--foreground-primary)', fontFamily: 'Barlow Condensed, sans-serif' }}>
                    DATA DIRI LENGKAP
                  </p>
                  <div 
                    className="rounded border overflow-hidden"
                    style={{
                      backgroundColor: 'var(--background-tertiary)',
                      borderColor: 'var(--borders-default)'
                    }}
                  >
                    <table className="w-full text-xs">
                      <tbody>
                        {Object.entries(selectedNikData.parsed_data).map(([key, value], idx) => (
                          <tr 
                            key={idx}
                            className="border-b"
                            style={{ borderColor: 'var(--borders-subtle)' }}
                          >
                            <td 
                              className="py-1.5 px-2 font-medium"
                              style={{ 
                                color: 'var(--foreground-secondary)',
                                width: '35%',
                                backgroundColor: 'rgba(0, 217, 255, 0.05)'
                              }}
                            >
                              <div className="flex items-center gap-1">
                                <span>{key}</span>
                                {/* Family ID Button - Dynamic (Family / Info) - Per NIK */}
                                {key === 'Family ID' && value && (
                                  (() => {
                                    // Get family data from the specific NIK's data
                                    const currentNik = selectedNikData.nik;
                                    const nikQuery = selectedReghpTarget?.nik_queries?.[currentNik];
                                    const familyStatus = nikQuery?.family_status || 'not_started';
                                    const familyData = nikQuery?.family_data;
                                    
                                    if (familyStatus === 'completed' && familyData) {
                                      return (
                                        <Button
                                          size="sm"
                                          onClick={() => handleShowFamilyTree(familyData, currentNik)}
                                          className="ml-auto"
                                          style={{
                                            backgroundColor: 'var(--accent-secondary)',
                                            color: 'var(--background-primary)',
                                            fontSize: '9px',
                                            padding: '1px 6px',
                                            height: 'auto'
                                          }}
                                        >
                                          📋 Info
                                        </Button>
                                      );
                                    } else if (familyStatus === 'processing' || loadingFamilyPendalaman === currentNik) {
                                      return (
                                        <span 
                                          className="ml-auto text-xs"
                                          style={{ color: 'var(--status-processing)' }}
                                        >
                                          ⏳
                                        </span>
                                      );
                                    } else {
                                      return (
                                        <Button
                                          size="sm"
                                          onClick={() => handleFamilyPendalaman(selectedReghpTarget?.id, value, currentNik)}
                                          disabled={loadingFamilyPendalaman === currentNik}
                                          className="ml-auto disabled:opacity-50"
                                          style={{
                                            backgroundColor: 'var(--status-warning)',
                                            color: 'var(--background-primary)',
                                            fontSize: '9px',
                                            padding: '1px 6px',
                                            height: 'auto'
                                          }}
                                        >
                                          {loadingFamilyPendalaman === currentNik ? '⏳' : '🔍'} Family
                                        </Button>
                                      );
                                    }
                                  })()
                                )}
                              </div>
                            </td>
                            <td 
                              className="py-1.5 px-2"
                              style={{ color: 'var(--foreground-primary)' }}
                            >
                              {value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <Button
                onClick={() => setNikDialogOpen(false)}
                className="w-full py-2 text-sm"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--background-primary)'
                }}
              >
                CLOSE
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Duplicate Phone Dialog */}
      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent 
          className="z-[9999] max-w-sm p-4"
          style={{
            backgroundColor: 'var(--background-elevated)',
            borderColor: 'var(--borders-strong)'
          }}
        >
          <DialogHeader className="pb-2">
            <DialogTitle 
              className="text-lg font-bold"
              style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}
            >
              NOMOR SUDAH ADA
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div 
              className="p-2 rounded border"
              style={{
                backgroundColor: 'rgba(255, 184, 0, 0.1)',
                borderColor: 'var(--status-warning)'
              }}
            >
              <p className="text-xs mb-1" style={{ color: 'var(--foreground-primary)' }}>
                Target <span className="font-mono font-bold" style={{ color: 'var(--accent-primary)' }}>{pendingPhoneNumber}</span> sudah ada.
              </p>
              {existingTarget && (
                <div className="text-xs space-y-0.5" style={{ color: 'var(--foreground-secondary)' }}>
                  <p>Status: <span className="font-semibold">{existingTarget.status}</span></p>
                  {existingTarget.data && (
                    <p>Updated: {new Date(existingTarget.data.timestamp || existingTarget.created_at).toLocaleString('id-ID')}</p>
                  )}
                  {existingTarget.reghp_status === 'completed' && (
                    <p className="font-semibold" style={{ color: 'var(--status-success)' }}>
                      ✓ Data tersedia
                    </p>
                  )}
                </div>
              )}
            </div>

            <p className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
              Deteksi posisi terbaru?
            </p>

            <div className="flex gap-2">
              <Button
                onClick={handleUseExisting}
                variant="outline"
                className="flex-1 py-2 text-xs"
                style={{
                  backgroundColor: 'var(--background-tertiary)',
                  borderColor: 'var(--borders-default)',
                  color: 'var(--foreground-primary)'
                }}
              >
                Data Lama
              </Button>
              <Button
                onClick={handleRefreshLocation}
                className="flex-1 py-2 text-xs"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--background-primary)',
                  fontFamily: 'Rajdhani, sans-serif'
                }}
              >
                Posisi Baru
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent 
          className="z-[10000] max-w-sm p-4"
          style={{
            backgroundColor: 'var(--background-elevated)',
            borderColor: 'var(--borders-strong)'
          }}
        >
          <DialogHeader className="pb-2">
            <DialogTitle 
              className="text-lg font-bold"
              style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}
            >
              JADWALKAN PEMBAHARUAN
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSchedule} className="space-y-3">
            {selectedTargetForSchedule && (
              <div 
                className="p-2 rounded border"
                style={{
                  backgroundColor: 'var(--background-tertiary)',
                  borderColor: 'var(--borders-default)'
                }}
              >
                <p className="text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--foreground-muted)' }}>
                  Target
                </p>
                <p className="font-mono text-sm" style={{ color: 'var(--accent-primary)' }}>
                  {selectedTargetForSchedule.phone_number}
                </p>
              </div>
            )}

            <div>
              <Label className="text-xs uppercase tracking-wide mb-1 block" style={{ color: 'var(--foreground-secondary)' }}>
                Interval Type
              </Label>
              <Select 
                value={scheduleInterval.type} 
                onValueChange={(value) => setScheduleInterval({ ...scheduleInterval, type: value })}
              >
                <SelectTrigger 
                  className="w-full h-9"
                  style={{
                    backgroundColor: 'var(--background-tertiary)',
                    borderColor: 'var(--borders-default)',
                    color: 'var(--foreground-primary)'
                  }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  className="z-[10001]"
                  style={{
                    backgroundColor: 'var(--background-elevated)',
                    borderColor: 'var(--borders-strong)',
                    color: 'var(--foreground-primary)'
                  }}
                >
                  <SelectItem value="minutes" style={{ color: 'var(--foreground-primary)' }}>
                    Minutes (Per Menit)
                  </SelectItem>
                  <SelectItem value="hourly" style={{ color: 'var(--foreground-primary)' }}>
                    Hourly (Per Jam)
                  </SelectItem>
                  <SelectItem value="daily" style={{ color: 'var(--foreground-primary)' }}>
                    Daily (Per Hari)
                  </SelectItem>
                  <SelectItem value="weekly" style={{ color: 'var(--foreground-primary)' }}>
                    Weekly (Per Minggu)
                  </SelectItem>
                  <SelectItem value="monthly" style={{ color: 'var(--foreground-primary)' }}>
                    Monthly (Per Bulan)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide mb-1 block" style={{ color: 'var(--foreground-secondary)' }}>
                Interval Value
              </Label>
              <Input
                type="number"
                min="1"
                value={scheduleInterval.value}
                onChange={(e) => setScheduleInterval({ ...scheduleInterval, value: parseInt(e.target.value) })}
                className="bg-background-tertiary border-borders-default h-9"
                style={{ color: '#000000' }}
                placeholder="1"
                required
              />
              <p className="text-xs mt-0.5" style={{ color: 'var(--foreground-muted)' }}>
                {scheduleInterval.type === 'minutes' && `Setiap ${scheduleInterval.value} menit`}
                {scheduleInterval.type === 'hourly' && `Setiap ${scheduleInterval.value} jam`}
                {scheduleInterval.type === 'daily' && `Setiap ${scheduleInterval.value} hari`}
                {scheduleInterval.type === 'weekly' && `Setiap ${scheduleInterval.value} minggu`}
                {scheduleInterval.type === 'monthly' && `Setiap ${scheduleInterval.value} bulan`}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => setScheduleDialogOpen(false)}
                variant="outline"
                className="flex-1 py-2 text-sm"
                style={{
                  backgroundColor: 'var(--background-tertiary)',
                  borderColor: 'var(--borders-default)',
                  color: 'var(--foreground-primary)'
                }}
              >
                Batal
              </Button>
              <Button
                type="submit"
                className="flex-1 py-2 text-sm"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--background-primary)',
                  fontFamily: 'Rajdhani, sans-serif'
                }}
              >
                BUAT JADWAL
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Family Tree Dialog */}
      <Dialog open={familyTreeDialogOpen} onOpenChange={setFamilyTreeDialogOpen}>
        <DialogContent 
          className="z-[9999] max-w-2xl max-h-[70vh] overflow-y-auto p-4"
          style={{
            backgroundColor: 'var(--background-elevated)',
            borderColor: 'var(--borders-strong)'
          }}
        >
          <DialogHeader className="pb-2">
            <DialogTitle 
              className="text-lg font-bold"
              style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}
            >
              🌳 FAMILY TREE (NKK)
            </DialogTitle>
          </DialogHeader>
          {selectedFamilyData && (
            <div className="space-y-3">
              {/* Family Tree Visualization */}
              <FamilyTreeViz members={selectedFamilyData.members} targetNik={targetNikForTree} />
              
              {/* Raw NKK Data Table - Compact */}
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--foreground-primary)', fontFamily: 'Barlow Condensed, sans-serif' }}>
                  RAW DATA NKK
                </p>
                <div 
                  className="rounded border overflow-hidden"
                  style={{
                    backgroundColor: 'var(--background-tertiary)',
                    borderColor: 'var(--borders-default)'
                  }}
                >
                  <table className="w-full text-xs">
                    <thead 
                      className="border-b"
                      style={{ 
                        backgroundColor: 'var(--background-secondary)',
                        borderColor: 'var(--borders-default)'
                      }}
                    >
                      <tr>
                        <th className="py-1.5 px-2 text-left uppercase" style={{ color: 'var(--foreground-secondary)' }}>
                          NIK
                        </th>
                        <th className="py-1.5 px-2 text-left uppercase" style={{ color: 'var(--foreground-secondary)' }}>
                          Nama
                        </th>
                        <th className="py-1.5 px-2 text-left uppercase" style={{ color: 'var(--foreground-secondary)' }}>
                          Relationship
                        </th>
                        <th className="py-1.5 px-2 text-left uppercase" style={{ color: 'var(--foreground-secondary)' }}>
                          Gender
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedFamilyData.members.map((member, idx) => (
                        <tr 
                          key={idx}
                          className="border-b"
                          style={{ 
                            borderColor: 'var(--borders-subtle)',
                            backgroundColor: member.nik === targetNikForTree ? 'rgba(255, 59, 92, 0.1)' : 'transparent'
                          }}
                        >
                          <td className="py-1.5 px-2 font-mono" style={{ color: member.nik === targetNikForTree ? 'var(--status-error)' : 'var(--accent-primary)' }}>
                            {member.nik}
                          </td>
                          <td className="py-1.5 px-2" style={{ color: 'var(--foreground-primary)' }}>
                            {member.name || '-'}
                          </td>
                          <td className="py-1.5 px-2" style={{ color: 'var(--foreground-secondary)' }}>
                            {member.relationship || '-'}
                          </td>
                          <td className="py-1.5 px-2" style={{ color: 'var(--foreground-secondary)' }}>
                            {member.gender || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              
              <Button
                onClick={() => setFamilyTreeDialogOpen(false)}
                className="w-full py-2 text-sm"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--background-primary)'
                }}
              >
                CLOSE
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
    </div>
  );
};

export default MainApp;