import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTelegram } from '@/context/TelegramContext';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Icon } from 'leaflet';
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
  Trash2
} from 'lucide-react';
import { FamilyTreeViz } from '@/components/FamilyTreeViz';
import { toast } from 'sonner';

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
  
  // Loading states to prevent double-click
  const [loadingPendalaman, setLoadingPendalaman] = useState(null); // targetId
  const [loadingNikPendalaman, setLoadingNikPendalaman] = useState(null); // nik
  const [loadingFamilyPendalaman, setLoadingFamilyPendalaman] = useState(null); // nik

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
      await generateTargetPDF(target);
      toast.success('PDF berhasil di-download');
    } catch (error) {
      console.error('PDF generation failed:', error);
      toast.error('Gagal generate PDF: ' + error.message);
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
      await generateCasePDF(selectedCase.name, filteredTargets);
      toast.success('PDF Case berhasil di-download');
    } catch (error) {
      console.error('PDF generation failed:', error);
      toast.error('Gagal generate PDF Case: ' + error.message);
    } finally {
      setPrintingCase(false);
    }
  };

  useEffect(() => {
    fetchCases();
    fetchSchedules();
  }, []);

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
    // Prevent double-click
    if (loadingPendalaman === target.id) return;
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
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to start pendalaman');
      fetchTargets(selectedCase.id); // Revert on error
    } finally {
      // Clear loading after a short delay to prevent rapid re-clicks
      setTimeout(() => setLoadingPendalaman(null), 2000);
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
    // Prevent double-click
    if (loadingNikPendalaman === nik) return;
    setLoadingNikPendalaman(nik);
    
    // Optimistic update
    const updatedTargets = targets.map(t => {
      if (t.id === targetId) {
        const nikQueries = { ...(t.nik_queries || {}) };
        nikQueries[nik] = { status: 'processing', data: null };
        return { ...t, nik_queries: nikQueries };
      }
      return t;
    });
    setTargets(updatedTargets);
    
    // Also update selectedReghpTarget if viewing
    if (selectedReghpTarget?.id === targetId) {
      const nikQueries = { ...(selectedReghpTarget.nik_queries || {}) };
      nikQueries[nik] = { status: 'processing', data: null };
      setSelectedReghpTarget({ ...selectedReghpTarget, nik_queries: nikQueries });
    }
    
    try {
      await axios.post(`${API}/targets/${targetId}/nik`, { nik });
      toast.success('NIK query dimulai!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to start NIK query');
      fetchTargets(selectedCase.id);
    } finally {
      // Clear loading after a short delay
      setTimeout(() => setLoadingNikPendalaman(null), 2000);
    }
  };

  const handleShowNikInfo = (nikData) => {
    setSelectedNikData(nikData);
    setNikDialogOpen(true);
  };

  const handleFamilyPendalaman = async (targetId, familyId, sourceNik) => {
    // Prevent double-click
    if (loadingFamilyPendalaman === sourceNik) return;
    
    if (!targetId || !familyId) {
      toast.error('Target ID atau Family ID tidak valid');
      return;
    }
    
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
            toast.success('Family Tree data tersedia!');
            
            // Auto-open Family Tree dialog with NIK-specific family data
            setTimeout(() => {
              handleShowFamilyTree(nikData.family_data, sourceNik);
            }, 500);
          } else if (nikData?.family_status === 'error' || attempts > 30) {
            clearInterval(checkInterval);
            setLoadingFamilyPendalaman(null);
            if (nikData?.family_status === 'error') {
              toast.error('Family query gagal');
            }
          }
        } catch (err) {
          console.error('Polling error:', err);
        }
      }, 2000);
      
    } catch (error) {
      console.error('Family query error:', error);
      toast.error(error.response?.data?.detail || 'Gagal memulai Family query');
      setLoadingFamilyPendalaman(null);
    }
  };

  const handleShowFamilyTree = (familyData, targetNik) => {
    setSelectedFamilyData(familyData);
    setTargetNikForTree(targetNik);
    setFamilyTreeDialogOpen(true);
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
                    {getTargetSchedule(target.phone_number) ? (
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
                        <CountdownTimer nextRun={getTargetSchedule(target.phone_number).next_run} />
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
                right: showChatPanel ? '400px' : '16px',
                transition: 'right 300ms'
              }}
            >
            {/* Map Type - increase width to prevent overlap */}
            {!showChatPanel && (
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
            {!showChatPanel && (
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
            )}

            {/* Add Target (Floating) - hide when chat panel open */}
            {selectedCase && !showChatPanel && (
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

            {/* Chat History Toggle - hide when panel is open */}
            {!showChatPanel && (
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
                backgroundColor: 'var(--background-primary)'
              }}
              zoomControl={true}
              preferCanvas={true}
              fadeAnimation={false}
              markerZoomAnimation={false}
              whenReady={(map) => {
                setTimeout(() => {
                  map.target.invalidateSize();
                }, 100);
              }}
            >
              <MapResizeHandler isMaximized={isMaximized} sidebarCollapsed={sidebarCollapsed} />
              <TileLayer
                key={selectedTileLayer}
                url={mapTiles[selectedTileLayer].url}
                attribution={mapTiles[selectedTileLayer].attribution}
              />
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
            </MapContainer>
          )}
        </div>

        {/* Chat Panel - Hide when map is maximized */}
        {showChatPanel && !isMaximized && selectedTargetForChat && (
          <div 
            className="w-96 border-l flex flex-col relative"
            style={{
              backgroundColor: 'var(--background-secondary)',
              borderColor: 'var(--borders-default)'
            }}
          >
            {/* Minimize Button - positioned outside chat panel */}
            <Button
              onClick={() => setShowChatPanel(false)}
              data-testid="minimize-chat-button"
              size="icon"
              className="absolute -left-12 top-4 w-10 h-10 rounded-full shadow-lg z-[1001]"
              style={{
                backgroundColor: 'var(--background-elevated)',
                color: 'var(--accent-primary)',
                border: '2px solid var(--accent-primary)'
              }}
            >
              <Minimize2 className="w-5 h-5" />
            </Button>

            {/* Chat Header */}
            <div 
              className="p-4 border-b"
              style={{ borderColor: 'var(--borders-default)' }}
            >
              <h3 
                className="font-semibold text-sm"
                style={{ 
                  color: 'var(--foreground-primary)',
                  fontFamily: 'Barlow Condensed, sans-serif'
                }}
              >
                CHAT HISTORY
              </h3>
              <p 
                className="text-xs font-mono mt-1"
                style={{ color: 'var(--accent-primary)' }}
              >
                {targets.find(t => t.id === selectedTargetForChat)?.phone_number || 'Select target'}
              </p>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
          </div>
          )}

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
                            ) : nikStatus === 'processing' ? (
                              <span className="text-xs" style={{ color: 'var(--status-processing)' }}>
                                ⏳
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => handleNikPendalaman(selectedReghpTarget.id, nik)}
                                className="text-xs py-1 px-2"
                                style={{
                                  backgroundColor: 'var(--status-warning)',
                                  color: 'var(--background-primary)'
                                }}
                              >
                                🔍 Pendalaman
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
                                    } else if (familyStatus === 'processing') {
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
                                          className="ml-auto"
                                          style={{
                                            backgroundColor: 'var(--status-warning)',
                                            color: 'var(--background-primary)',
                                            fontSize: '9px',
                                            padding: '1px 6px',
                                            height: 'auto'
                                          }}
                                        >
                                          🔍 Family
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
    </div>
  );
};

export default MainApp;