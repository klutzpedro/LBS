import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTelegram } from '@/context/TelegramContext';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { MapPin, Plus, FolderOpen, Minimize2 } from 'lucide-react';
import { HistoryDialog } from '@/components/HistoryDialog';
import { AOIPanel, AOIAlertNotification } from '@/components/AOIComponents';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';

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
  FamilyTreeDialog
} from '@/components/main';

const MainApp = () => {
  const { username, logout } = useAuth();
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
  
  // Map state
  const [mapCenter, setMapCenter] = useState([-6.2088, 106.8456]);
  const [mapZoom, setMapZoom] = useState(13);
  const [mapKey, setMapKey] = useState(0);
  
  // Pendalaman dialogs
  const [reghpDialogOpen, setReghpDialogOpen] = useState(false);
  const [selectedReghpTarget, setSelectedReghpTarget] = useState(null);
  const [nikDialogOpen, setNikDialogOpen] = useState(false);
  const [selectedNikData, setSelectedNikData] = useState(null);
  
  // Search and duplicate
  const [searchQuery, setSearchQuery] = useState('');
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [existingTarget, setExistingTarget] = useState(null);
  const [pendingPhoneNumber, setPendingPhoneNumber] = useState('');
  
  // Schedule
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedTargetForSchedule, setSelectedTargetForSchedule] = useState(null);
  const [scheduleInterval, setScheduleInterval] = useState({ type: 'hourly', value: 1 });
  
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
  useEffect(() => {
    fetchCases();
    fetchSchedules();
    fetchAOIs();
    fetchAOIAlerts();
  }, []);

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
  useEffect(() => {
    if (selectedCase) {
      fetchTargets(selectedCase.id);
      const interval = setInterval(() => fetchTargets(selectedCase.id), 3000);
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

  useEffect(() => {
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
      const interval = setInterval(() => fetchChatMessages(selectedTargetForChat), 2000);
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

  // ============== Schedule Handlers ==============
  const handleCountdownEnd = async (scheduleId) => {
    if (!scheduleId) return;
    if (executingSchedulesRef.current.has(scheduleId)) return;
    
    executingSchedulesRef.current.add(scheduleId);
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API}/schedules/${scheduleId}/execute`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.info(`Memperbarui posisi ${response.data.target_id ? 'target' : ''}...`, { duration: 5000 });
      fetchSchedules();
      
      setTimeout(() => fetchTargets(), 3000);
      
      const pollInterval = setInterval(async () => {
        const targetsRes = await axios.get(`${API}/targets`);
        const updatedTarget = targetsRes.data.find(t => t.id === response.data.target_id);
        
        if (updatedTarget && updatedTarget.status === 'completed') {
          clearInterval(pollInterval);
          fetchTargets();
          toast.success(`Posisi ${updatedTarget.phone_number} berhasil diperbarui!`);
          executingSchedulesRef.current.delete(scheduleId);
          await refreshHistoryPath(response.data.target_id);
          
          if (updatedTarget.data?.latitude && updatedTarget.data?.longitude) {
            setMapCenter([parseFloat(updatedTarget.data.latitude), parseFloat(updatedTarget.data.longitude)]);
            setMapZoom(15);
            setMapKey(prev => prev + 1);
          }
        }
      }, 5000);
      
      setTimeout(() => {
        clearInterval(pollInterval);
        executingSchedulesRef.current.delete(scheduleId);
      }, 120000);
      
    } catch (error) {
      console.error('Failed to execute schedule:', error);
      toast.error('Gagal memperbarui posisi: ' + (error.response?.data?.detail || error.message));
      executingSchedulesRef.current.delete(scheduleId);
    }
  };

  const handleCancelSchedule = async (scheduleId) => {
    if (!window.confirm('Batalkan penjadwalan?')) return;
    
    try {
      await axios.delete(`${API}/schedules/${scheduleId}`);
      toast.success('Penjadwalan dibatalkan');
      fetchSchedules();
    } catch (error) {
      toast.error('Gagal membatalkan penjadwalan');
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
    
    if (existingTarget) {
      setSelectedTargetForChat(existingTarget.id);
    }
  };

  const handlePerbaharui = async (target) => {
    if (!window.confirm(`Perbaharui lokasi untuk ${target.phone_number}?`)) return;
    
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
    
    if (target.data && target.data.latitude && target.data.longitude) {
      setMapCenter([target.data.latitude, target.data.longitude]);
      setMapZoom(16);
      setMapKey(prev => prev + 1);
    }
  };

  // ============== Pendalaman Handlers ==============
  const handlePendalaman = async (target) => {
    if (isProcessRunning()) {
      showBusyNotification();
      return;
    }
    
    setGlobalProcessing(true);
    setGlobalProcessType('pendalaman');
    setLoadingPendalaman(target.id);
    
    const updatedTargets = targets.map(t => 
      t.id === target.id ? { ...t, reghp_status: 'processing' } : t
    );
    setTargets(updatedTargets);
    
    if (selectedReghpTarget?.id === target.id) {
      setSelectedReghpTarget({ ...selectedReghpTarget, reghp_status: 'processing' });
    }
    
    try {
      await axios.post(`${API}/targets/${target.id}/reghp`);
      toast.success('Pendalaman query dimulai!');
      
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
      if (updatedTarget) {
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
    
    setGlobalProcessing(true);
    setGlobalProcessType('nik');
    setLoadingNikPendalaman(nik);
    
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
      const response = await axios.post(`${API}/targets/${targetId}/nik`, { nik });
      console.log('[NIK Pendalaman] API Response:', response.data);
      toast.success('NIK query dimulai!');
      
      let attempts = 0;
      const maxAttempts = 30;
      const checkInterval = setInterval(async () => {
        attempts++;
        try {
          const response = await axios.get(`${API}/targets/${targetId}`);
          const target = response.data;
          const nikData = target.nik_queries?.[nik];
          
          console.log(`[NIK Pendalaman] Poll ${attempts}/${maxAttempts}, status:`, nikData?.status);
          
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
      console.error('[NIK Pendalaman] API Error:', error);
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
      const checkInterval = setInterval(async () => {
        attempts++;
        
        try {
          const response = await axios.get(`${API}/targets/${targetId}`);
          const target = response.data;
          
          if (selectedReghpTarget?.id === targetId) {
            setSelectedReghpTarget(target);
          }
          
          const nikData = target.nik_queries?.[sourceNik];
          if (nikData?.family_status === 'completed' && nikData?.family_data) {
            clearInterval(checkInterval);
            setGlobalProcessing(false);
            setGlobalProcessType(null);
            setLoadingFamilyPendalaman(null);
            toast.success('Family Tree data tersedia!');
            
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
    setGlobalProcessing(false);
    setGlobalProcessType(null);
    setLoadingFamilyPendalaman(null);
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
            onFinishDrawing={handleFinishDrawing}
            onCancelDrawing={handleCancelDrawing}
            selectedCase={selectedCase}
            onAddTarget={() => setAddTargetDialog(true)}
            showChatPanel={showChatPanel}
            onShowChatPanel={() => setShowChatPanel(true)}
            hasActiveQueries={hasActiveQueries}
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
              <DrawingOverlay drawingMode={drawingMode} drawingPoints={drawingPoints} />

              {/* Target Markers */}
              <TargetMarkers
                targets={targets}
                visibleTargets={visibleTargets}
                showMarkerNames={showMarkerNames}
                onShowReghpInfo={handleShowReghpInfo}
                onPendalaman={handlePendalaman}
                loadingPendalaman={loadingPendalaman}
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
    </div>
  );
};

export default MainApp;
