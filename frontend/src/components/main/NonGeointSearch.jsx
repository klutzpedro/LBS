import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  DraggableDialog, 
  DraggableDialogContent, 
  DraggableDialogHeader, 
  DraggableDialogTitle 
} from '@/components/ui/draggable-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Search, 
  Loader2, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  User,
  FileText,
  Globe,
  History,
  Eye,
  Printer,
  ChevronDown,
  ChevronUp,
  MapPin,
  Calendar,
  Download,
  Trash2,
  GitBranch,
  Minus,
  Maximize2,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import { FamilyTreeViz } from '@/components/FamilyTreeViz';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// 3D styled NON GEOINT Button
export const NonGeointButton = ({ onOpenSearch, onOpenHistory, isInvestigating = false }) => {
  return (
    <div className="flex gap-2">
      <Button
        onClick={onOpenSearch}
        className="shadow-xl hover:scale-105 transition-all duration-200"
        style={{
          background: isInvestigating 
            ? 'linear-gradient(145deg, #ef4444, #dc2626)' 
            : 'linear-gradient(145deg, #f59e0b, #d97706)',
          color: isInvestigating ? '#fff' : '#000',
          border: 'none',
          boxShadow: isInvestigating 
            ? '0 6px 20px rgba(239, 68, 68, 0.4), 0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.3)'
            : '0 6px 20px rgba(245, 158, 11, 0.4), 0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.3)',
          fontWeight: 'bold',
          padding: '10px 20px',
          borderRadius: '8px',
          textShadow: '0 1px 0 rgba(255,255,255,0.3)',
          animation: isInvestigating ? 'pulse-btn 2s infinite' : 'none'
        }}
        data-testid="nongeoint-search-btn"
      >
        <style>
          {`
            @keyframes pulse-btn {
              0%, 100% { box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4), 0 2px 4px rgba(0,0,0,0.2); }
              50% { box-shadow: 0 6px 30px rgba(239, 68, 68, 0.7), 0 2px 4px rgba(0,0,0,0.2); }
            }
          `}
        </style>
        {isInvestigating ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            PROCESSING...
          </>
        ) : (
          <>
            <Search className="w-4 h-4 mr-2" />
            NON GEOINT
          </>
        )}
      </Button>
      <Button
        onClick={onOpenHistory}
        size="icon"
        className="shadow-xl hover:scale-105 transition-all duration-200"
        style={{
          background: 'linear-gradient(145deg, #6366f1, #4f46e5)',
          color: '#fff',
          border: 'none',
          boxShadow: '0 6px 20px rgba(99, 102, 241, 0.4), 0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.2)',
          borderRadius: '8px',
          width: '42px',
          height: '42px'
        }}
        title="History Pencarian"
        data-testid="nongeoint-history-btn"
      >
        <History className="w-5 h-5" />
      </Button>
    </div>
  );
};

// Helper function to extract person entries from Capil result
const extractPersonsFromCapil = (capilResult) => {
  if (!capilResult || !capilResult.raw_text) return [];
  
  const persons = [];
  const text = capilResult.raw_text;
  
  const lines = text.split('\n');
  let currentPerson = {};
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    const namaMatch = trimmed.match(/(?:nama|name)\s*[:\-]?\s*(.+)/i);
    if (namaMatch) {
      if (currentPerson.nama) {
        persons.push({ ...currentPerson });
        currentPerson = {};
      }
      currentPerson.nama = namaMatch[1].trim();
    }
    
    const nikMatch = trimmed.match(/(?:nik)\s*[:\-]?\s*(\d{16})/i);
    if (nikMatch) {
      currentPerson.nik = nikMatch[1];
    }
    
    const ttlMatch = trimmed.match(/(?:ttl|tempat.*lahir|tgl.*lahir|tanggal.*lahir)\s*[:\-]?\s*(.+)/i);
    if (ttlMatch) {
      currentPerson.ttl = ttlMatch[1].trim();
    }
    
    const tempatMatch = trimmed.match(/(?:tempat\s+lahir)\s*[:\-]?\s*(.+)/i);
    if (tempatMatch && !currentPerson.tempat_lahir) {
      currentPerson.tempat_lahir = tempatMatch[1].trim();
    }
    
    const tglMatch = trimmed.match(/(?:tgl\s+lahir|tanggal\s+lahir)\s*[:\-]?\s*(.+)/i);
    if (tglMatch && !currentPerson.tgl_lahir) {
      currentPerson.tgl_lahir = tglMatch[1].trim();
    }
    
    const alamatMatch = trimmed.match(/(?:alamat|address)\s*[:\-]?\s*(.+)/i);
    if (alamatMatch) {
      currentPerson.alamat = alamatMatch[1].trim();
    }
  }
  
  if (currentPerson.nama) {
    persons.push(currentPerson);
  }
  
  if (persons.length === 0 && capilResult.data) {
    const data = capilResult.data;
    const person = {
      nama: data.Nama || data.NAMA || data.nama || '',
      nik: data.NIK || data.nik || '',
      ttl: data.TTL || data.ttl || data['Tempat/Tgl Lahir'] || '',
      tempat_lahir: data['Tempat Lahir'] || data.tempat_lahir || '',
      tgl_lahir: data['Tgl Lahir'] || data['Tanggal Lahir'] || data.tgl_lahir || '',
      alamat: data.Alamat || data.alamat || ''
    };
    
    if (!person.ttl && (person.tempat_lahir || person.tgl_lahir)) {
      person.ttl = [person.tempat_lahir, person.tgl_lahir].filter(Boolean).join(', ');
    }
    
    if (person.nama) {
      persons.push(person);
    }
  }
  
  return persons;
};

// Result Detail Popup - ENHANCED
const ResultDetailDialog = ({ open, onClose, queryType, result, nik = null }) => {
  const getQueryLabel = (type) => {
    switch (type) {
      case 'capil': return 'CAPIL (Dukcapil)';
      case 'pass_wni': return 'Passport WNI';
      case 'pass_wna': return 'Passport WNA';
      case 'nik_data': return 'Data NIK';
      case 'nkk_data': return 'Data NKK (Kartu Keluarga)';
      case 'regnik_data': return 'Data RegNIK';
      default: return type;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-xl max-h-[80vh] overflow-y-auto"
        style={{ 
          backgroundColor: 'var(--background-elevated)',
          border: '1px solid var(--borders-default)',
          zIndex: 9999
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--foreground-primary)' }}>
            Hasil {getQueryLabel(queryType)}
            {nik && <span className="font-mono text-sm ml-2">({nik})</span>}
          </DialogTitle>
        </DialogHeader>
        
        <div className="mt-4 space-y-4">
          {/* Status */}
          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--foreground-muted)' }}>Status:</span>
            <span 
              className={`text-sm font-medium ${
                result?.status === 'completed' ? 'text-green-500' : 
                result?.status === 'not_found' ? 'text-yellow-500' : 'text-red-500'
              }`}
            >
              {result?.status || 'Unknown'}
            </span>
          </div>

          {/* Photo */}
          {result?.photo && (
            <div>
              <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--foreground-secondary)' }}>
                Foto:
              </h4>
              <img src={result.photo} alt="Photo" className="max-w-[200px] rounded-md border" />
            </div>
          )}

          {/* NIKs Found */}
          {result?.niks_found?.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--foreground-secondary)' }}>
                NIK Ditemukan:
              </h4>
              <div className="flex flex-wrap gap-2">
                {result.niks_found.map(n => (
                  <span 
                    key={n}
                    className="px-2 py-1 rounded text-xs font-mono"
                    style={{ 
                      backgroundColor: 'var(--accent-primary-transparent)',
                      color: 'var(--accent-primary)'
                    }}
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Parsed Data */}
          {result?.data && Object.keys(result.data).length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--foreground-secondary)' }}>
                Data Terparse:
              </h4>
              <div 
                className="p-3 rounded-md text-xs space-y-1"
                style={{ backgroundColor: 'var(--background-tertiary)' }}
              >
                {Object.entries(result.data).map(([key, value]) => (
                  <div key={key} className="flex">
                    <span className="font-medium w-32 flex-shrink-0" style={{ color: 'var(--foreground-muted)' }}>
                      {key}:
                    </span>
                    <span style={{ color: 'var(--foreground-primary)' }}>{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raw Text */}
          {result?.raw_text && (
            <div>
              <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--foreground-secondary)' }}>
                Raw Response:
              </h4>
              <pre 
                className="p-3 rounded-md text-xs overflow-x-auto whitespace-pre-wrap"
                style={{ 
                  backgroundColor: 'var(--background-tertiary)',
                  color: 'var(--foreground-primary)',
                  maxHeight: '200px',
                  overflowY: 'auto'
                }}
              >
                {result.raw_text}
              </pre>
            </div>
          )}

          {/* Error */}
          {result?.error && (
            <div className="p-3 rounded-md bg-red-500/10 text-red-400 text-sm">
              Error: {result.error}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// History Dialog
export const NonGeointHistoryDialog = ({ open, onOpenChange, onSelectSearch }) => {
  const [searches, setSearches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/nongeoint/searches`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setSearches(data);
        }
      } catch (error) {
        console.error('Failed to fetch history:', error);
      }
      setLoading(false);
    };

    if (open) {
      fetchHistory();
    }
  }, [open]);

  const handleDelete = async (e, searchId) => {
    e.stopPropagation(); // Prevent opening the search
    
    if (!window.confirm('Hapus history pencarian ini?')) return;
    
    setDeleting(searchId);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/nongeoint/search/${searchId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        toast.success('History berhasil dihapus');
        // Remove from local state
        setSearches(prev => prev.filter(s => s.id !== searchId));
      } else {
        toast.error('Gagal menghapus history');
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Gagal menghapus history');
    }
    setDeleting(null);
  };

  const getStatusBadge = (status) => {
    const styles = {
      completed: { bg: 'bg-green-500/20', text: 'text-green-400' },
      processing: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
      error: { bg: 'bg-red-500/20', text: 'text-red-400' }
    };
    const s = styles[status] || styles.processing;
    return (
      <span className={`px-2 py-0.5 rounded text-xs ${s.bg} ${s.text}`}>
        {status}
      </span>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-lg max-h-[70vh] overflow-y-auto"
        style={{ 
          backgroundColor: 'var(--background-elevated)',
          border: '1px solid var(--borders-default)'
        }}
      >
        <DialogHeader>
          <DialogTitle 
            className="flex items-center gap-2"
            style={{ color: 'var(--foreground-primary)' }}
          >
            <History className="w-5 h-5" style={{ color: 'var(--accent-secondary)' }} />
            History Pencarian NON GEOINT
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-primary)' }} />
            </div>
          ) : searches.length === 0 ? (
            <div className="text-center py-8" style={{ color: 'var(--foreground-muted)' }}>
              <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Belum ada history pencarian</p>
            </div>
          ) : (
            <div className="space-y-2">
              {searches.map(search => (
                <div 
                  key={search.id}
                  className="p-3 rounded-md border cursor-pointer hover:bg-opacity-50 transition-all"
                  onClick={() => {
                    onSelectSearch(search);
                    onOpenChange(false);
                  }}
                  style={{
                    backgroundColor: 'var(--background-tertiary)',
                    borderColor: 'var(--borders-subtle)'
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium" style={{ color: 'var(--foreground-primary)' }}>
                      {search.name}
                    </span>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(search.status)}
                      {/* Show investigation badge if exists */}
                      {search.has_investigation && (
                        <span 
                          className="px-1.5 py-0.5 rounded text-xs"
                          style={{ 
                            backgroundColor: search.investigation_status === 'completed' 
                              ? 'rgba(16, 185, 129, 0.2)' 
                              : 'rgba(59, 130, 246, 0.2)',
                            color: search.investigation_status === 'completed' 
                              ? '#10b981' 
                              : '#3b82f6'
                          }}
                        >
                          ✓ Pendalaman
                        </span>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 hover:bg-red-500/20"
                        onClick={(e) => handleDelete(e, search.id)}
                        disabled={deleting === search.id}
                        title="Hapus history"
                      >
                        {deleting === search.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3 text-red-400" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs" style={{ color: 'var(--foreground-muted)' }}>
                    <span>
                      {search.niks_found?.length || 0} NIK ditemukan
                    </span>
                    <span>
                      {new Date(search.created_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Person Selection Card - WITH PHOTO (handles not available)
const PersonSelectionCard = ({ person, isSelected, onSelect, index }) => {
  const ttl = person.ttl || person.tempat_lahir || person.tgl_lahir || '-';
  const hasPhoto = person.photo && person.photo.startsWith('data:');
  const photoNotAvailable = person.status === 'not_found' || person.error || (!person.photo && person.nik);
  const similarity = person.similarity || 0;
  
  // Similarity color indicator
  const getSimilarityColor = (sim) => {
    if (sim >= 0.8) return '#22c55e'; // Green - high match
    if (sim >= 0.5) return '#f59e0b'; // Orange - medium match
    return '#ef4444'; // Red - low match
  };

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[PersonSelectionCard] Card clicked! index:', index);
    if (onSelect) {
      onSelect();
    }
  };
  
  return (
    <div 
      role="button"
      tabIndex={0}
      className={`p-3 rounded-md border transition-all hover:scale-105 ${isSelected ? 'ring-2 ring-offset-2' : ''}`}
      onClick={handleClick}
      onKeyPress={(e) => e.key === 'Enter' && handleClick(e)}
      data-testid={`person-card-${index}`}
      style={{
        backgroundColor: isSelected 
          ? 'var(--accent-primary-transparent)' 
          : 'var(--background-tertiary)',
        borderColor: isSelected
          ? 'var(--accent-primary)'
          : 'var(--borders-subtle)',
        ringColor: isSelected ? 'var(--accent-primary)' : 'transparent',
        minWidth: '160px',
        cursor: 'pointer',
        pointerEvents: 'auto',
        userSelect: 'none',
        flexShrink: 0
      }}
    >
      <div className="flex flex-col items-center gap-2">
        {/* Similarity Badge */}
        {similarity > 0 && (
          <div 
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ 
              backgroundColor: getSimilarityColor(similarity),
              color: 'white',
              fontSize: '9px'
            }}
          >
            {Math.round(similarity * 100)}% Match
          </div>
        )}
        
        {/* Photo or Placeholder */}
        <div 
          className="relative rounded-md overflow-hidden border-2"
          style={{ 
            width: '80px', 
            height: '100px',
            borderColor: isSelected ? 'var(--accent-primary)' : 'var(--borders-default)',
            backgroundColor: 'var(--background-secondary)'
          }}
        >
          {hasPhoto ? (
            <img 
              src={person.photo} 
              alt={person.nama || 'Foto'} 
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-1">
              {/* Placeholder icon */}
              <div 
                className="w-10 h-10 rounded-full flex items-center justify-center mb-1"
                style={{ backgroundColor: 'var(--background-primary)' }}
              >
                <User className="w-6 h-6" style={{ color: 'var(--foreground-muted)' }} />
              </div>
              {/* Not available text */}
              <span 
                className="text-center leading-tight"
                style={{ 
                  color: 'var(--foreground-muted)', 
                  fontSize: '8px',
                  lineHeight: '1.2'
                }}
              >
                {photoNotAvailable ? 'Foto Tidak Tersedia' : 'Memuat...'}
              </span>
            </div>
          )}
          {/* Selection indicator */}
          {isSelected && (
            <div 
              className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              <CheckCircle className="w-3 h-3 text-white" />
            </div>
          )}
        </div>
        
        {/* Info */}
        <div className="text-center w-full">
          <p 
            className="font-semibold text-xs truncate"
            style={{ color: 'var(--foreground-primary)' }}
            title={person.nama || person.name}
          >
            {person.nama || person.name || `Hasil ${index + 1}`}
          </p>
          {person.nik && (
            <p 
              className="text-xs font-mono mt-0.5 truncate"
              style={{ color: 'var(--accent-primary)', fontSize: '10px' }}
              title={person.nik}
            >
              {person.nik}
            </p>
          )}
          {ttl !== '-' && (
            <p 
              className="text-xs mt-0.5 truncate"
              style={{ color: 'var(--foreground-muted)', fontSize: '9px' }}
            >
              {ttl}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

// MAIN DIALOG COMPONENT
export const NonGeointSearchDialog = ({ 
  open, 
  onOpenChange, 
  onNikPendalaman,
  initialSearch = null,
  isGlobalInvestigating = false,
  onInvestigatingChange = () => {}
}) => {
  const [searchName, setSearchName] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  
  // Person selection state
  const [personsFound, setPersonsFound] = useState([]);
  const [selectedPersonIndex, setSelectedPersonIndex] = useState(null);
  const [showPersonSelection, setShowPersonSelection] = useState(false);
  
  // NIK selection
  const [selectedNiks, setSelectedNiks] = useState([]);
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [investigation, setInvestigation] = useState(null);
  
  // Detail dialog state
  const [detailDialog, setDetailDialog] = useState({ open: false, type: null, result: null, nik: null });
  
  // Family Tree state
  const [familyTreeDialog, setFamilyTreeDialog] = useState({ open: false, familyData: null, targetNik: null });
  
  // Minimize and warning states
  const [isMinimized, setIsMinimized] = useState(false);
  const [showBackgroundWarning, setShowBackgroundWarning] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // 'minimize' or 'close'
  
  const pollingRef = useRef(null);
  const investigationPollingRef = useRef(null);
  const lastOpenedWithSearchRef = useRef(null); // Track which search was last opened

  // Notify parent when investigation state changes
  useEffect(() => {
    onInvestigatingChange(isInvestigating);
  }, [isInvestigating, onInvestigatingChange]);

  // Handle minimize/close during investigation
  const handleMinimizeOrClose = (action) => {
    if (isInvestigating) {
      setPendingAction(action);
      setShowBackgroundWarning(true);
    } else {
      if (action === 'minimize') {
        setIsMinimized(true);
      } else {
        onOpenChange(false);
      }
    }
  };

  const confirmBackgroundProcess = () => {
    setShowBackgroundWarning(false);
    if (pendingAction === 'minimize') {
      setIsMinimized(true);
    } else {
      onOpenChange(false);
    }
    setPendingAction(null);
  };

  const cancelBackgroundProcess = () => {
    setShowBackgroundWarning(false);
    setPendingAction(null);
  };

  // Helper function to reset all states
  const resetAllStates = () => {
    setSearchResults(null);
    setSearchName('');
    setSelectedNiks([]);
    setInvestigation(null);
    setPersonsFound([]);
    setSelectedPersonIndex(null);
    setShowPersonSelection(false);
    setIsSearching(false);
    setIsInvestigating(false);
  };

  // Load initial search if provided (from history)
  useEffect(() => {
    const loadSearchData = async () => {
      console.log('[NonGeoint] Loading search data for:', initialSearch?.id);
      
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/nongeoint/search/${initialSearch.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const fullSearchData = await response.json();
          console.log('[NonGeoint] Loaded full search data:', fullSearchData);
          console.log('[NonGeoint] Investigation data:', fullSearchData.investigation);
          
          // Mark as loaded
          lastOpenedWithSearchRef.current = initialSearch.id;
          
          setSearchResults(fullSearchData);
          setSearchName(fullSearchData.name || '');
          
          // If investigation already exists, load it
          if (fullSearchData.investigation) {
            console.log('[NonGeoint] Investigation found with status:', fullSearchData.investigation.status);
            console.log('[NonGeoint] Investigation results:', fullSearchData.investigation.results);
            
            setInvestigation(fullSearchData.investigation);
            
            // Set selected NIKs from investigation
            if (fullSearchData.investigation.results) {
              const investigatedNiks = Object.keys(fullSearchData.investigation.results);
              setSelectedNiks(investigatedNiks);
              console.log('[NonGeoint] Loaded investigated NIKs:', investigatedNiks);
            }
            
            toast.success('Hasil pendalaman sebelumnya dimuat');
          } else {
            console.log('[NonGeoint] No investigation found for this search');
            // No investigation yet, reset investigation state
            setInvestigation(null);
            setSelectedNiks([]);
          }
        } else {
          console.error('[NonGeoint] Failed to fetch search data, status:', response.status);
          // Fallback to initialSearch if fetch fails
          lastOpenedWithSearchRef.current = initialSearch.id;
          setSearchResults(initialSearch);
          setSearchName(initialSearch.name || '');
        }
      } catch (error) {
        console.error('[NonGeoint] Error loading search data:', error);
        // Fallback to initialSearch
        lastOpenedWithSearchRef.current = initialSearch?.id;
        setSearchResults(initialSearch);
        setSearchName(initialSearch?.name || '');
      }
    };
    
    if (open) {
      if (initialSearch) {
        // Loading from history - load the search data
        const shouldLoad = lastOpenedWithSearchRef.current !== initialSearch.id;
        console.log('[NonGeoint] Dialog open with initialSearch:', initialSearch.id, 
                    'lastOpened:', lastOpenedWithSearchRef.current, 
                    'shouldLoad:', shouldLoad);
        if (shouldLoad) {
          loadSearchData();
        }
      } else {
        // New search - reset everything to show fresh form
        console.log('[NonGeoint] Dialog open for NEW search, resetting all states');
        resetAllStates();
        lastOpenedWithSearchRef.current = null;
      }
    }
  }, [initialSearch?.id, open]);

  // Cleanup on close - reset all states
  useEffect(() => {
    if (!open) {
      console.log('[NonGeoint] Dialog closing, resetting states');
      // Clear polling intervals
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      if (investigationPollingRef.current) {
        clearInterval(investigationPollingRef.current);
        investigationPollingRef.current = null;
      }
      // Reset all states when dialog closes
      resetAllStates();
      // IMPORTANT: Reset the ref so next open will load fresh data
      lastOpenedWithSearchRef.current = null;
    }
  }, [open]);

  // Process search results to extract persons WITH PHOTOS
  useEffect(() => {
    // Only process when status is 'completed'
    if (searchResults?.status !== 'completed') {
      return;
    }
    
    // Check if we have nik_photos from backend (new flow with auto photo fetch)
    if (searchResults?.nik_photos && Object.keys(searchResults.nik_photos).length > 0) {
      console.log('[NonGeoint] Using nik_photos from backend:', searchResults.nik_photos);
      console.log('[NonGeoint] Number of NIK photos:', Object.keys(searchResults.nik_photos).length);
      
      // Convert nik_photos object to persons array and sort by similarity
      const persons = Object.entries(searchResults.nik_photos)
        .map(([nik, data]) => {
          console.log(`[NonGeoint] Processing NIK ${nik}:`, data);
          return {
            nik: nik,
            nama: data.name || data.nama,
            name: data.name || data.nama,
            photo: data.photo,
            ttl: data.ttl,
            alamat: data.alamat,
            jk: data.jk,
            status: data.status,
            similarity: data.similarity || 0
          };
        })
        // Sort by similarity (highest first), then by name
        .sort((a, b) => {
          if (b.similarity !== a.similarity) {
            return b.similarity - a.similarity;
          }
          return (a.nama || '').localeCompare(b.nama || '');
        });
      
      console.log('[NonGeoint] Persons array created and sorted by similarity:', persons.length);
      setPersonsFound(persons);
      
      if (persons.length === 1) {
        setSelectedPersonIndex(0);
        setShowPersonSelection(false);
      } else if (persons.length > 1) {
        setShowPersonSelection(true);
        setSelectedPersonIndex(null);
      } else {
        setShowPersonSelection(false);
      }
    } 
    // Fallback to old flow (extract from CAPIL without photos)
    else if (searchResults?.results?.capil) {
      console.log('[NonGeoint] Fallback: extracting persons from CAPIL (no nik_photos)');
      const persons = extractPersonsFromCapil(searchResults.results.capil);
      setPersonsFound(persons);
      
      if (persons.length === 1) {
        setSelectedPersonIndex(0);
        setShowPersonSelection(false);
      } else if (persons.length > 1) {
        setShowPersonSelection(true);
        setSelectedPersonIndex(null);
      } else {
        setShowPersonSelection(false);
      }
    }
  }, [searchResults]);

  const startSearch = async () => {
    if (!searchName.trim()) {
      toast.error('Masukkan nama untuk dicari');
      return;
    }

    setIsSearching(true);
    setSearchResults(null);
    setSelectedNiks([]);
    setInvestigation(null);
    setPersonsFound([]);
    setSelectedPersonIndex(null);
    setShowPersonSelection(false);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/nongeoint/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: searchName,
          query_types: ['capil', 'pass_wni', 'pass_wna']
        })
      });

      if (!response.ok) throw new Error('Search failed');

      const data = await response.json();
      
      pollingRef.current = setInterval(() => {
        pollSearchResults(data.search_id);
      }, 2000);

    } catch (error) {
      toast.error('Gagal memulai pencarian');
      setIsSearching(false);
    }
  };

  const pollSearchResults = async (searchId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/nongeoint/search/${searchId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to get results');

      const data = await response.json();
      setSearchResults(data);

      // Show progress for fetching_photos status
      if (data.status === 'fetching_photos') {
        const progress = data.photo_fetch_progress || 0;
        const total = data.photo_fetch_total || 0;
        console.log(`[NonGeoint] Fetching photos: ${progress}/${total}`);
        // Continue polling
      } else if (data.status === 'completed' || data.status === 'error') {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        setIsSearching(false);

        if (data.status === 'completed') {
          const photoCount = data.nik_photos ? Object.values(data.nik_photos).filter(p => p.photo).length : 0;
          const nikCount = data.niks_found?.length || 0;
          if (nikCount > 0) {
            toast.success(`Ditemukan ${nikCount} NIK dengan ${photoCount} foto`);
          }
        }
      }
    } catch (error) {
      console.error('Polling error:', error);
    }
  };

  const handlePersonSelect = (index) => {
    console.log('[NonGeoint] handlePersonSelect called with index:', index);
    console.log('[NonGeoint] personsFound:', personsFound);
    console.log('[NonGeoint] Current selectedPersonIndex:', selectedPersonIndex);
    setSelectedPersonIndex(index);
    console.log('[NonGeoint] Set selectedPersonIndex to:', index);
  };

  const confirmPersonSelection = () => {
    if (selectedPersonIndex === null) {
      toast.error('Pilih salah satu nama');
      return;
    }
    
    const selectedPerson = personsFound[selectedPersonIndex];
    console.log('[NonGeoint] Confirming person selection:', selectedPerson);
    
    if (selectedPerson?.nik) {
      setSelectedNiks([selectedPerson.nik]);
      console.log('[NonGeoint] Set selected NIK:', selectedPerson.nik);
    }
    
    // Hide person selection to move to next step
    setShowPersonSelection(false);
    console.log('[NonGeoint] Person selection confirmed, moving to next step');
  };

  const handleNikToggle = (nik) => {
    setSelectedNiks(prev => 
      prev.includes(nik) 
        ? prev.filter(n => n !== nik)
        : [...prev, nik]
    );
  };

  const startInvestigation = async () => {
    if (selectedNiks.length === 0) {
      toast.error('Pilih minimal satu NIK');
      return;
    }

    setIsInvestigating(true);
    setInvestigation(null);
    toast.info(`Memulai pendalaman ${selectedNiks.length} NIK (NIK, NKK, RegNIK)...`);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/nongeoint/investigate-niks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          search_id: searchResults.id,
          niks: selectedNiks
        })
      });

      if (!response.ok) throw new Error('Investigation failed');

      const data = await response.json();
      
      // Start polling for investigation results
      investigationPollingRef.current = setInterval(() => {
        pollInvestigation(data.investigation_id);
      }, 3000); // Poll every 3 seconds

    } catch (error) {
      toast.error('Gagal memulai pendalaman');
      setIsInvestigating(false);
    }
  };

  const pollInvestigation = async (investigationId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/nongeoint/investigation/${investigationId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to get investigation');

      const data = await response.json();
      console.log('Investigation poll result:', data);
      console.log('Investigation results:', data.results);
      setInvestigation(data);

      // Check if any NIK has data (for View button)
      if (data.results) {
        Object.entries(data.results).forEach(([nik, nikData]) => {
          console.log(`NIK ${nik} data:`, nikData);
        });
      }

      if (data.status === 'completed' || data.status === 'error') {
        if (investigationPollingRef.current) {
          clearInterval(investigationPollingRef.current);
          investigationPollingRef.current = null;
        }
        setIsInvestigating(false);

        if (data.status === 'completed') {
          toast.success('Pendalaman NIK selesai!');
        } else if (data.status === 'error') {
          toast.error(`Error: ${data.error || 'Unknown error'}`);
        }
      }
    } catch (error) {
      console.error('Investigation polling error:', error);
    }
  };

  // Generate PDF with all results
  const generatePDF = () => {
    const pdf = new jsPDF();
    let yPos = 20;
    const lineHeight = 7;
    const pageHeight = 280;
    const margin = 14;
    
    const addText = (text, x = margin, fontSize = 10, isBold = false) => {
      if (yPos > pageHeight) {
        pdf.addPage();
        yPos = 20;
      }
      pdf.setFontSize(fontSize);
      pdf.setFont('helvetica', isBold ? 'bold' : 'normal');
      
      // Handle long text wrapping
      const maxWidth = 180;
      const lines = pdf.splitTextToSize(String(text), maxWidth);
      lines.forEach(line => {
        if (yPos > pageHeight) {
          pdf.addPage();
          yPos = 20;
        }
        pdf.text(line, x, yPos);
        yPos += lineHeight;
      });
    };

    const addSection = (title) => {
      yPos += 5;
      addText(title, margin, 12, true);
      yPos += 2;
    };

    // Title
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('LAPORAN NON GEOINT', 105, yPos, { align: 'center' });
    yPos += 10;

    // Search Info
    addText(`Nama Pencarian: ${searchResults?.name || '-'}`, margin, 11, true);
    addText(`Tanggal: ${new Date().toLocaleDateString('id-ID', { 
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' 
    })}`);
    yPos += 5;

    // CAPIL Results
    if (searchResults?.results?.capil) {
      addSection('1. HASIL CAPIL (Dukcapil)');
      const capil = searchResults.results.capil;
      addText(`Status: ${capil.status}`);
      if (capil.data) {
        Object.entries(capil.data).forEach(([key, value]) => {
          addText(`${key}: ${value}`);
        });
      }
      if (capil.niks_found?.length > 0) {
        addText(`NIK Ditemukan: ${capil.niks_found.join(', ')}`);
      }
      if (capil.raw_text && !capil.data) {
        addText('Raw Data:');
        addText(capil.raw_text.substring(0, 500));
      }
    }

    // Pass WNI Results
    if (searchResults?.results?.pass_wni) {
      addSection('2. HASIL PASSPORT WNI');
      const passWni = searchResults.results.pass_wni;
      addText(`Status: ${passWni.status}`);
      if (passWni.data) {
        Object.entries(passWni.data).forEach(([key, value]) => {
          addText(`${key}: ${value}`);
        });
      }
    }

    // Pass WNA Results
    if (searchResults?.results?.pass_wna) {
      addSection('3. HASIL PASSPORT WNA');
      const passWna = searchResults.results.pass_wna;
      addText(`Status: ${passWna.status}`);
      if (passWna.data) {
        Object.entries(passWna.data).forEach(([key, value]) => {
          addText(`${key}: ${value}`);
        });
      }
    }

    // NIK Investigation Results
    if (investigation?.results && Object.keys(investigation.results).length > 0) {
      addSection('4. HASIL PENDALAMAN NIK');
      
      Object.entries(investigation.results).forEach(([nik, nikResult], idx) => {
        yPos += 3;
        addText(`${idx + 1}. NIK: ${nik}`, margin, 11, true);
        
        // NIK Data
        if (nikResult?.nik_data) {
          addText('   [Data NIK]', margin, 10, true);
          addText(`   Status: ${nikResult.nik_data.status}`);
          if (nikResult.nik_data.data) {
            Object.entries(nikResult.nik_data.data).forEach(([key, value]) => {
              addText(`   ${key}: ${value}`);
            });
          }
          if (nikResult.nik_data.raw_text && !nikResult.nik_data.data) {
            addText(`   Raw: ${nikResult.nik_data.raw_text.substring(0, 300)}`);
          }
        }
        
        // NKK Data - with family members table
        if (nikResult?.nkk_data) {
          addText('   [Data NKK - Kartu Keluarga]', margin, 10, true);
          addText(`   Status: ${nikResult.nkk_data.status}`);
          
          // Display family members if available
          if (nikResult.nkk_data.family_data?.members?.length > 0) {
            const members = nikResult.nkk_data.family_data.members;
            addText(`   Jumlah Anggota Keluarga: ${members.length}`, margin, 10);
            addText('');
            addText('   No.  NIK                   Nama                    Hubungan         L/P', margin, 9);
            addText('   ' + '-'.repeat(85), margin, 9);
            
            members.forEach((member, idx) => {
              const no = String(idx + 1).padEnd(4);
              const nikStr = (member.nik || '-').padEnd(18);
              const name = (member.name || '-').substring(0, 22).padEnd(24);
              const rel = (member.relationship || '-').substring(0, 15).padEnd(17);
              const gender = member.gender || '-';
              addText(`   ${no} ${nikStr} ${name} ${rel} ${gender}`, margin, 9);
            });
            addText('   ' + '-'.repeat(85), margin, 9);
          } else if (nikResult.nkk_data.data) {
            Object.entries(nikResult.nkk_data.data).forEach(([key, value]) => {
              addText(`   ${key}: ${value}`);
            });
          }
          if (nikResult.nkk_data.raw_text && !nikResult.nkk_data.family_data?.members?.length && !nikResult.nkk_data.data) {
            addText(`   Raw: ${nikResult.nkk_data.raw_text.substring(0, 300)}`);
          }
        }
        
        // RegNIK Data - with numbered list for phones
        if (nikResult?.regnik_data) {
          addText('   [Data RegNIK - Nomor Telepon]', margin, 10, true);
          addText(`   Status: ${nikResult.regnik_data.status}`);
          
          // If phones array exists, display with numbered list
          if (nikResult.regnik_data.phones && nikResult.regnik_data.phones.length > 0) {
            addText(`   Jumlah Nomor: ${nikResult.regnik_data.phones.length}`, margin, 10);
            nikResult.regnik_data.phones.forEach((phone, phoneIdx) => {
              addText(`      ${phoneIdx + 1}. ${phone}`, margin, 10);
            });
          } else if (nikResult.regnik_data.data) {
            Object.entries(nikResult.regnik_data.data).forEach(([key, value]) => {
              if (key === 'phones' && Array.isArray(value)) {
                addText(`   Jumlah Nomor: ${value.length}`, margin, 10);
                value.forEach((phone, phoneIdx) => {
                  addText(`      ${phoneIdx + 1}. ${phone}`, margin, 10);
                });
              } else {
                addText(`   ${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
              }
            });
          }
          if (nikResult.regnik_data.raw_text && !nikResult.regnik_data.phones?.length) {
            addText(`   Raw: ${nikResult.regnik_data.raw_text.substring(0, 300)}`);
          }
        }
        
        yPos += 3;
      });
    }

    // Footer
    pdf.addPage();
    yPos = pageHeight - 10;
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'italic');
    pdf.text('Generated by WASKITA LBS - NON GEOINT Module', 105, yPos, { align: 'center' });

    // Save PDF
    const fileName = `NON_GEOINT_${searchResults?.name?.replace(/\s+/g, '_') || 'report'}_${new Date().toISOString().split('T')[0]}.pdf`;
    pdf.save(fileName);
    toast.success('PDF berhasil dibuat!');
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'processing':
      case 'processing_nik':
      case 'processing_nkk':
      case 'processing_regnik':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'not_found':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getQueryIcon = (queryType) => {
    switch (queryType) {
      case 'capil':
        return <User className="w-4 h-4" />;
      case 'pass_wni':
        return <FileText className="w-4 h-4" />;
      case 'pass_wna':
        return <Globe className="w-4 h-4" />;
      default:
        return <Search className="w-4 h-4" />;
    }
  };

  const getQueryLabel = (queryType) => {
    switch (queryType) {
      case 'capil':
        return 'CAPIL (Dukcapil)';
      case 'pass_wni':
        return 'Passport WNI';
      case 'pass_wna':
        return 'Passport WNA';
      default:
        return queryType;
    }
  };

  // Check if any NIK has results to show View button
  const getNikInvestigationStatus = (nik) => {
    if (!investigation?.results?.[nik]) return null;
    return investigation.results[nik];
  };

  const hasNikResults = (nik) => {
    const nikData = getNikInvestigationStatus(nik);
    if (!nikData) return false;
    
    // Check if any of the sub-queries have data or raw_text
    const hasNikData = nikData.nik_data && (nikData.nik_data.data || nikData.nik_data.raw_text || nikData.nik_data.status === 'completed' || nikData.nik_data.status === 'not_found');
    const hasNkkData = nikData.nkk_data && (nikData.nkk_data.data || nikData.nkk_data.raw_text || nikData.nkk_data.status === 'completed' || nikData.nkk_data.status === 'not_found');
    const hasRegnikData = nikData.regnik_data && (nikData.regnik_data.data || nikData.regnik_data.raw_text || nikData.regnik_data.status === 'completed' || nikData.regnik_data.status === 'not_found');
    
    return hasNikData || hasNkkData || hasRegnikData;
  };

  // Get sub-query status for display
  const getSubQueryStatus = (nikData, queryType) => {
    const data = nikData?.[queryType];
    if (!data) return 'pending';
    return data.status || 'pending';
  };

  // Determine current step
  const getCurrentStep = () => {
    if (isSearching) return 'searching';
    if (!searchResults) return 'input';
    // Show searching while fetching photos
    if (searchResults.status === 'fetching_photos') return 'searching';
    if (searchResults.status !== 'completed') return 'searching';
    
    // Show person selection if we have nik_photos AND showPersonSelection is true
    if (searchResults.nik_photos && Object.keys(searchResults.nik_photos).length > 0) {
      // Only show person selection if showPersonSelection is true
      if (showPersonSelection) {
        return 'select_person';
      }
      // Person already selected, check if we should show NIK selection or investigation
      if (selectedNiks.length > 0) {
        // Has selected NIKs, check if we should investigate
        if (!investigation && !isInvestigating) {
          return 'select_nik';
        }
        // Investigation in progress or completed
        return 'investigation';
      }
      // No NIKs selected yet but person selection done, go to NIK selection
      return 'select_nik';
    }
    
    // Legacy: show person selection from CAPIL extraction
    if (showPersonSelection && personsFound.length > 1) return 'select_person';
    if (!investigation && !isInvestigating && searchResults.niks_found?.length > 0) return 'select_nik';
    if (isInvestigating || investigation) return 'investigation';
    return 'no_results';
  };

  const currentStep = getCurrentStep();

  // Check if we should show the final print button
  const showFinalPrintButton = investigation?.status === 'completed' || 
    (searchResults?.status === 'completed' && !searchResults?.niks_found?.length);

  return (
    <>
      {/* Background Warning Dialog */}
      <Dialog open={showBackgroundWarning} onOpenChange={setShowBackgroundWarning}>
        <DialogContent 
          className="max-w-md"
          style={{ 
            backgroundColor: 'var(--background-elevated)',
            border: '2px solid #ef4444'
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="w-6 h-6" />
              PERINGATAN
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--foreground-primary)' }}>
              PROSES PENDALAMAN AKAN DILAKUKAN DI BACKGROUND
            </p>
            <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
              Sementara Anda <strong className="text-red-500">TIDAK DAPAT</strong> melakukan pendalaman lain sampai proses ini selesai.
            </p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={cancelBackgroundProcess}
              style={{ borderColor: 'var(--borders-default)' }}
            >
              Batalkan
            </Button>
            <Button
              onClick={confirmBackgroundProcess}
              style={{ backgroundColor: '#ef4444', color: 'white' }}
            >
              {pendingAction === 'minimize' ? 'Minimize' : 'Tutup'} & Lanjutkan
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Minimized State - Small floating indicator */}
      {isMinimized && (
        <div 
          className="fixed bottom-4 right-4 z-50 p-3 rounded-lg shadow-xl cursor-pointer hover:scale-105 transition-all"
          onClick={() => setIsMinimized(false)}
          style={{
            backgroundColor: isInvestigating ? '#ef4444' : 'var(--accent-primary)',
            color: 'white',
            animation: isInvestigating ? 'pulse 2s infinite' : 'none'
          }}
        >
          <style>
            {`
              @keyframes pulse {
                0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
                50% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
              }
            `}
          </style>
          <div className="flex items-center gap-2">
            {isInvestigating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm font-semibold">Pendalaman Berjalan...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span className="text-sm font-semibold">NON GEOINT</span>
              </>
            )}
            <Maximize2 className="w-4 h-4 ml-2" />
          </div>
        </div>
      )}

      {/* Main Dialog */}
      <DraggableDialog open={open && !isMinimized} onOpenChange={(newOpen) => {
        if (!newOpen) {
          handleMinimizeOrClose('close');
        } else {
          onOpenChange(true);
        }
      }}>
        <DraggableDialogContent 
          className="max-w-2xl max-h-[85vh] overflow-y-auto"
          style={{ 
            backgroundColor: 'var(--background-elevated)',
            border: '1px solid var(--borders-default)'
          }}
        >
          <DraggableDialogHeader>
            <div className="flex items-center justify-between w-full pr-8">
              <DraggableDialogTitle 
                className="flex items-center gap-2"
                style={{ color: 'var(--foreground-primary)' }}
              >
                <Search className="w-5 h-5" style={{ color: 'var(--accent-secondary)' }} />
                NON GEOINT Search
                {isInvestigating && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-500 text-white animate-pulse">
                    PROCESSING
                  </span>
                )}
              </DraggableDialogTitle>
              {/* Minimize Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleMinimizeOrClose('minimize')}
                className="h-7 w-7 p-0"
                title="Minimize"
                style={{ color: 'var(--foreground-muted)' }}
              >
                <Minus className="w-4 h-4" />
              </Button>
            </div>
          </DraggableDialogHeader>

          {/* Search Input */}
          <div className="space-y-4 mt-4">
            <div className="flex gap-2">
              <Input
                placeholder="Masukkan nama lengkap..."
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isSearching && startSearch()}
                disabled={isSearching || isInvestigating}
                style={{
                  backgroundColor: 'var(--background-tertiary)',
                  borderColor: 'var(--borders-default)',
                  color: 'var(--foreground-primary)'
                }}
              />
              <Button
                onClick={startSearch}
                disabled={isSearching || isInvestigating || !searchName.trim()}
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--background-primary)'
                }}
              >
                {isSearching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </Button>
            </div>

            <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
              Pencarian: CAPIL → Passport WNI → Passport WNA → Pendalaman NIK (NIK, NKK, RegNIK)
            </p>
          </div>

          {/* Search Progress / Results */}
          {(isSearching || searchResults) && (
            <div className="mt-6 space-y-4">
              <h3 
                className="text-sm font-semibold"
                style={{ color: 'var(--foreground-secondary)' }}
              >
                {isSearching ? 'Proses Pencarian...' : 'Hasil Pencarian Awal'}
              </h3>

              {/* Query Status */}
              <div className="space-y-2">
                {['capil', 'pass_wni', 'pass_wna'].map(queryType => {
                  const result = searchResults?.results?.[queryType];
                  const status = result?.status || (isSearching ? 'pending' : 'pending');
                  const hasData = result && (result.raw_text || result.data || result.niks_found?.length > 0);
                  
                  return (
                    <div 
                      key={queryType}
                      className="p-3 rounded-md border"
                      style={{
                        backgroundColor: 'var(--background-tertiary)',
                        borderColor: 'var(--borders-subtle)'
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getQueryIcon(queryType)}
                          <span style={{ color: 'var(--foreground-primary)' }}>
                            {getQueryLabel(queryType)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(status)}
                          {hasData && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDetailDialog({ open: true, type: queryType, result, nik: null })}
                              className="h-7 px-2"
                              style={{ color: 'var(--accent-primary)' }}
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              View
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      {result?.niks_found?.length > 0 && (
                        <div className="mt-2 text-xs" style={{ color: 'var(--foreground-muted)' }}>
                          NIK: {result.niks_found.join(', ')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Photo Fetching Progress */}
              {searchResults?.status === 'fetching_photos' && (
                <div 
                  className="mt-4 p-4 rounded-md border"
                  style={{
                    backgroundColor: 'var(--background-tertiary)',
                    borderColor: 'var(--accent-primary)'
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--accent-primary)' }} />
                    <span style={{ color: 'var(--foreground-primary)' }}>
                      Mengambil foto dari database...
                    </span>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                    Progress: {searchResults.photo_fetch_progress || 0} / {searchResults.photo_fetch_total || 0} NIK
                    {searchResults.photo_fetch_current_nik && (
                      <span className="ml-2 font-mono">({searchResults.photo_fetch_current_nik})</span>
                    )}
                  </div>
                  {/* Progress bar */}
                  <div 
                    className="mt-2 h-2 rounded-full overflow-hidden"
                    style={{ backgroundColor: 'var(--background-secondary)' }}
                  >
                    <div 
                      className="h-full transition-all duration-300"
                      style={{ 
                        width: `${((searchResults.photo_fetch_progress || 0) / (searchResults.photo_fetch_total || 1)) * 100}%`,
                        backgroundColor: 'var(--accent-primary)'
                      }}
                    />
                  </div>
                </div>
              )}

              {/* STEP: Person Selection - GRID WITH PHOTOS */}
              {currentStep === 'select_person' && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 
                      className="text-sm font-semibold"
                      style={{ color: 'var(--foreground-secondary)' }}
                    >
                      Pilih Target ({personsFound.length} hasil ditemukan)
                    </h3>
                  </div>
                  
                  <p className="text-xs mb-3" style={{ color: 'var(--foreground-muted)' }}>
                    Pilih target berdasarkan foto dan NIK untuk melanjutkan pendalaman.
                  </p>

                  {/* Horizontal scrollable grid for photos */}
                  <div 
                    className="flex gap-3 overflow-x-auto pb-3"
                    style={{ 
                      scrollbarWidth: 'thin',
                      scrollbarColor: 'var(--accent-primary) var(--background-tertiary)',
                      pointerEvents: 'auto'
                    }}
                  >
                    {personsFound.map((person, idx) => (
                      <PersonSelectionCard
                        key={`person-${idx}-${person.nik}`}
                        person={person}
                        index={idx}
                        isSelected={selectedPersonIndex === idx}
                        onSelect={() => {
                          console.log('[NonGeoint] Card onSelect called, idx:', idx);
                          handlePersonSelect(idx);
                        }}
                      />
                    ))}
                  </div>

                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        console.log('[NonGeoint] Lanjutkan button clicked! selectedPersonIndex:', selectedPersonIndex);
                        if (selectedPersonIndex !== null) {
                          confirmPersonSelection();
                        } else {
                          toast.error('Pilih target terlebih dahulu dengan klik pada foto');
                        }
                      }}
                      disabled={selectedPersonIndex === null}
                      className="w-full py-3 px-4 rounded-md font-semibold transition-all"
                      style={{
                        backgroundColor: selectedPersonIndex === null ? '#6b7280' : 'var(--accent-primary)',
                        color: 'white',
                        opacity: selectedPersonIndex === null ? 0.6 : 1,
                        cursor: selectedPersonIndex === null ? 'not-allowed' : 'pointer',
                        pointerEvents: 'auto'
                      }}
                    >
                      {selectedPersonIndex === null 
                        ? '👆 Klik Foto Untuk Memilih Target' 
                        : '✓ Lanjutkan dengan Target Terpilih'}
                    </button>
                    
                    {/* Debug info */}
                    <p className="text-xs mt-2 text-center" style={{ color: 'var(--foreground-muted)' }}>
                      {selectedPersonIndex === null 
                        ? 'Belum ada target dipilih' 
                        : `Target dipilih: ${personsFound[selectedPersonIndex]?.nama || personsFound[selectedPersonIndex]?.nik || 'Unknown'}`}
                    </p>
                  </div>
                </div>
              )}

              {/* STEP: NIK Selection with View buttons */}
              {currentStep === 'select_nik' && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 
                      className="text-sm font-semibold"
                      style={{ color: 'var(--foreground-secondary)' }}
                    >
                      Pilih NIK untuk Pendalaman ({searchResults.niks_found.length})
                    </h3>
                  </div>

                  <p className="text-xs mb-3" style={{ color: 'var(--foreground-muted)' }}>
                    Pilih satu atau lebih NIK untuk pendalaman detail.
                  </p>

                  <div className="space-y-2">
                    {searchResults.niks_found.map(nik => (
                      <div 
                        key={nik}
                        className="flex items-center justify-between gap-3 p-3 rounded-md border"
                        style={{
                          backgroundColor: selectedNiks.includes(nik) 
                            ? 'var(--accent-primary-transparent)' 
                            : 'var(--background-tertiary)',
                          borderColor: selectedNiks.includes(nik)
                            ? 'var(--accent-primary)'
                            : 'var(--borders-subtle)'
                        }}
                      >
                        <div 
                          className="flex items-center gap-3 cursor-pointer flex-1"
                          onClick={() => handleNikToggle(nik)}
                        >
                          <Checkbox
                            checked={selectedNiks.includes(nik)}
                            onCheckedChange={() => handleNikToggle(nik)}
                          />
                          <span 
                            className="font-mono text-sm"
                            style={{ color: 'var(--foreground-primary)' }}
                          >
                            {nik}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4">
                    <Button
                      onClick={startInvestigation}
                      disabled={selectedNiks.length === 0 || isInvestigating}
                      className="w-full"
                      style={{
                        backgroundColor: 'var(--accent-primary)',
                        color: 'var(--background-primary)'
                      }}
                    >
                      {isInvestigating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Memproses Pendalaman...
                        </>
                      ) : (
                        <>
                          <Search className="w-4 h-4 mr-2" />
                          Mulai Pendalaman ({selectedNiks.length} NIK)
                        </>
                      )}
                    </Button>
                    <p className="text-xs mt-2 text-center" style={{ color: 'var(--foreground-muted)' }}>
                      Akan melakukan query NIK, NKK, dan RegNIK untuk setiap NIK yang dipilih
                    </p>
                  </div>
                </div>
              )}

              {/* STEP: Investigation Results */}
              {currentStep === 'investigation' && (
                <div className="mt-6 space-y-4">
                  {/* Blinking Warning Message during Investigation */}
                  {isInvestigating && (
                    <div 
                      className="p-4 rounded-md border-2 text-center"
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        borderColor: '#ef4444',
                        animation: 'blink-border 1s ease-in-out infinite'
                      }}
                    >
                      <style>
                        {`
                          @keyframes blink-border {
                            0%, 100% { border-color: #ef4444; background-color: rgba(239, 68, 68, 0.1); }
                            50% { border-color: #fca5a5; background-color: rgba(239, 68, 68, 0.2); }
                          }
                          @keyframes blink-text {
                            0%, 100% { opacity: 1; }
                            50% { opacity: 0.6; }
                          }
                        `}
                      </style>
                      <p 
                        className="font-bold text-sm"
                        style={{ 
                          color: '#ef4444',
                          animation: 'blink-text 1s ease-in-out infinite'
                        }}
                      >
                        ⚠️ PROSES PENDALAMAN SEDANG BERJALAN
                      </p>
                      <p 
                        className="text-xs mt-1"
                        style={{ color: '#f87171' }}
                      >
                        WAKTU TUNGGU TERGANTUNG DARI JUMLAH NAMA IDENTIK YANG ADA DI DATABASE
                      </p>
                      <p 
                        className="text-xs font-semibold mt-1"
                        style={{ color: '#fca5a5' }}
                      >
                        (20 DETIK - 30 MENIT)
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground-secondary)' }}>
                      Hasil Pendalaman NIK
                    </h3>
                    {isInvestigating && (
                      <span className="text-xs flex items-center gap-1" style={{ color: 'var(--accent-primary)' }}>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Memproses...
                      </span>
                    )}
                  </div>

                  {/* NIK Results List */}
                  <div className="space-y-3">
                    {selectedNiks.map(nik => {
                      const nikData = getNikInvestigationStatus(nik);
                      const hasResults = hasNikResults(nik);
                      const nikStatus = nikData?.status || 'processing';
                      
                      return (
                        <div 
                          key={nik}
                          className="p-3 rounded-md border"
                          style={{
                            backgroundColor: 'var(--background-tertiary)',
                            borderColor: 'var(--borders-subtle)'
                          }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(nikStatus)}
                              <span className="font-mono font-medium text-sm" style={{ color: 'var(--foreground-primary)' }}>
                                {nik}
                              </span>
                            </div>
                            {hasResults && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDetailDialog({ 
                                  open: true, 
                                  type: 'nik_combined', 
                                  result: nikData, 
                                  nik: nik 
                                })}
                                className="h-7 px-3"
                                style={{ 
                                  borderColor: 'var(--accent-primary)',
                                  color: 'var(--accent-primary)'
                                }}
                              >
                                <Eye className="w-3 h-3 mr-1" />
                                View
                              </Button>
                            )}
                          </div>
                          
                          {/* Sub-query status indicators */}
                          <div className="flex gap-4 text-xs" style={{ color: 'var(--foreground-muted)' }}>
                            <span className="flex items-center gap-1">
                              {getStatusIcon(getSubQueryStatus(nikData, 'nik_data'))}
                              NIK
                            </span>
                            <span className="flex items-center gap-1">
                              {getStatusIcon(getSubQueryStatus(nikData, 'nkk_data'))}
                              NKK
                            </span>
                            <span className="flex items-center gap-1">
                              {getStatusIcon(getSubQueryStatus(nikData, 'regnik_data'))}
                              RegNIK
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* No Results */}
              {currentStep === 'no_results' && searchResults?.status === 'completed' && (
                <div 
                  className="text-center py-8"
                  style={{ color: 'var(--foreground-muted)' }}
                >
                  <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Tidak ditemukan NIK untuk nama &quot;{searchResults.name}&quot;</p>
                </div>
              )}

              {/* FINAL PRINT BUTTON - Always at bottom when results available */}
              {showFinalPrintButton && (
                <div className="mt-6 pt-4 border-t" style={{ borderColor: 'var(--borders-subtle)' }}>
                  <Button
                    onClick={generatePDF}
                    className="w-full"
                    style={{
                      background: 'linear-gradient(145deg, #10b981, #059669)',
                      color: '#fff',
                      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                    }}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Laporan PDF
                  </Button>
                  <p className="text-xs mt-2 text-center" style={{ color: 'var(--foreground-muted)' }}>
                    Download semua hasil pencarian dan pendalaman dalam format PDF
                  </p>
                </div>
              )}
            </div>
          )}
        </DraggableDialogContent>
      </DraggableDialog>

      {/* Combined NIK Result Detail Dialog */}
      {detailDialog.type === 'nik_combined' ? (
        <DraggableDialog open={detailDialog.open} onOpenChange={() => setDetailDialog({ open: false, type: null, result: null, nik: null })}>
          <DraggableDialogContent 
            className="max-w-2xl max-h-[85vh] overflow-y-auto"
            style={{ 
              backgroundColor: 'var(--background-elevated)',
              border: '1px solid var(--borders-default)',
              zIndex: 9999
            }}
          >
            <DraggableDialogHeader>
              <DraggableDialogTitle style={{ color: 'var(--foreground-primary)' }}>
                Hasil Pendalaman NIK: <span className="font-mono">{detailDialog.nik}</span>
              </DraggableDialogTitle>
            </DraggableDialogHeader>
            
            <div className="mt-4 space-y-6">
              {/* NIK Data Section */}
              {detailDialog.result?.nik_data && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--foreground-secondary)' }}>
                    {getStatusIcon(detailDialog.result.nik_data.status)}
                    Data NIK
                  </h4>
                  <div className="p-3 rounded-md" style={{ backgroundColor: 'var(--background-tertiary)' }}>
                    {/* Photo section - more prominent */}
                    {detailDialog.result.nik_data.photo && (
                      <div className="mb-4 flex justify-center">
                        <div className="p-2 rounded-lg border" style={{ borderColor: 'var(--borders-default)', backgroundColor: 'var(--background-secondary)' }}>
                          <img 
                            src={detailDialog.result.nik_data.photo} 
                            alt="Foto KTP" 
                            className="w-36 h-auto rounded shadow-md"
                            style={{ maxHeight: '180px', objectFit: 'cover' }}
                          />
                          <p className="text-xs text-center mt-2" style={{ color: 'var(--foreground-muted)' }}>Foto KTP</p>
                        </div>
                      </div>
                    )}
                    {detailDialog.result.nik_data.data && Object.keys(detailDialog.result.nik_data.data).length > 0 ? (
                      <div className="space-y-1 text-xs">
                        {Object.entries(detailDialog.result.nik_data.data).map(([key, value]) => (
                          <div key={key} className="flex">
                            <span className="font-medium w-28 flex-shrink-0" style={{ color: 'var(--foreground-muted)' }}>{key}:</span>
                            <span style={{ color: 'var(--foreground-primary)' }}>{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    ) : detailDialog.result.nik_data.raw_text ? (
                      <pre className="text-xs whitespace-pre-wrap" style={{ color: 'var(--foreground-primary)' }}>
                        {detailDialog.result.nik_data.raw_text}
                      </pre>
                    ) : (
                      <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                        Status: {detailDialog.result.nik_data.status} - {detailDialog.result.nik_data.error || 'No data'}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* NKK Data Section */}
              {detailDialog.result?.nkk_data && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--foreground-secondary)' }}>
                      {getStatusIcon(detailDialog.result.nkk_data.status)}
                      Data NKK (Kartu Keluarga)
                      {detailDialog.result.nkk_data.family_data?.member_count && (
                        <span 
                          className="ml-2 px-2 py-0.5 rounded text-xs"
                          style={{ backgroundColor: 'var(--accent-primary-transparent)', color: 'var(--accent-primary)' }}
                        >
                          {detailDialog.result.nkk_data.family_data.member_count} anggota
                        </span>
                      )}
                    </h4>
                    {/* Family Tree Button */}
                    {detailDialog.result.nkk_data.family_data?.members?.length > 0 && (
                      <Button
                        size="sm"
                        onClick={() => setFamilyTreeDialog({
                          open: true,
                          familyData: detailDialog.result.nkk_data.family_data,
                          targetNik: detailDialog.nik
                        })}
                        style={{
                          backgroundColor: 'var(--accent-secondary)',
                          color: '#fff'
                        }}
                      >
                        <GitBranch className="w-3 h-3 mr-1" />
                        Family Tree
                      </Button>
                    )}
                  </div>
                  <div className="p-3 rounded-md space-y-3" style={{ backgroundColor: 'var(--background-tertiary)' }}>
                    {/* Show family members table if available */}
                    {detailDialog.result.nkk_data.family_data?.members?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--foreground-muted)' }}>
                          ANGGOTA KELUARGA:
                        </p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr style={{ backgroundColor: 'var(--background-secondary)' }}>
                                <th className="py-1.5 px-2 text-left border" style={{ borderColor: 'var(--borders-subtle)', color: 'var(--foreground-muted)' }}>No</th>
                                <th className="py-1.5 px-2 text-left border" style={{ borderColor: 'var(--borders-subtle)', color: 'var(--foreground-muted)' }}>NIK</th>
                                <th className="py-1.5 px-2 text-left border" style={{ borderColor: 'var(--borders-subtle)', color: 'var(--foreground-muted)' }}>Nama</th>
                                <th className="py-1.5 px-2 text-left border" style={{ borderColor: 'var(--borders-subtle)', color: 'var(--foreground-muted)' }}>Hubungan</th>
                                <th className="py-1.5 px-2 text-left border" style={{ borderColor: 'var(--borders-subtle)', color: 'var(--foreground-muted)' }}>L/P</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detailDialog.result.nkk_data.family_data.members.map((member, idx) => (
                                <tr 
                                  key={idx}
                                  style={{ 
                                    backgroundColor: member.nik === detailDialog.nik ? 'rgba(255, 59, 92, 0.15)' : 'transparent'
                                  }}
                                >
                                  <td className="py-1.5 px-2 border" style={{ borderColor: 'var(--borders-subtle)', color: 'var(--foreground-muted)' }}>{idx + 1}</td>
                                  <td className="py-1.5 px-2 border font-mono" style={{ borderColor: 'var(--borders-subtle)', color: 'var(--foreground-primary)' }}>{member.nik || '-'}</td>
                                  <td className="py-1.5 px-2 border" style={{ borderColor: 'var(--borders-subtle)', color: 'var(--foreground-primary)' }}>{member.name || '-'}</td>
                                  <td className="py-1.5 px-2 border" style={{ borderColor: 'var(--borders-subtle)', color: 'var(--foreground-muted)' }}>{member.relationship || '-'}</td>
                                  <td className="py-1.5 px-2 border" style={{ borderColor: 'var(--borders-subtle)', color: 'var(--foreground-muted)' }}>{member.gender || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    
                    {/* Show parsed data if no family members */}
                    {!detailDialog.result.nkk_data.family_data?.members?.length && detailDialog.result.nkk_data.data && Object.keys(detailDialog.result.nkk_data.data).length > 0 && (
                      <div className="space-y-1 text-xs">
                        {Object.entries(detailDialog.result.nkk_data.data).map(([key, value]) => (
                          <div key={key} className="flex">
                            <span className="font-medium w-28 flex-shrink-0" style={{ color: 'var(--foreground-muted)' }}>{key}:</span>
                            <span style={{ color: 'var(--foreground-primary)' }}>{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Show raw text if no parsed data */}
                    {!detailDialog.result.nkk_data.family_data?.members?.length && !detailDialog.result.nkk_data.data && detailDialog.result.nkk_data.raw_text && (
                      <pre className="text-xs whitespace-pre-wrap max-h-40 overflow-y-auto" style={{ color: 'var(--foreground-primary)' }}>
                        {detailDialog.result.nkk_data.raw_text}
                      </pre>
                    )}
                    
                    {/* No data */}
                    {!detailDialog.result.nkk_data.family_data?.members?.length && !detailDialog.result.nkk_data.data && !detailDialog.result.nkk_data.raw_text && (
                      <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                        Status: {detailDialog.result.nkk_data.status} - {detailDialog.result.nkk_data.error || 'No data'}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* RegNIK Data Section */}
              {detailDialog.result?.regnik_data && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--foreground-secondary)' }}>
                    {getStatusIcon(detailDialog.result.regnik_data.status)}
                    Data RegNIK (Nomor Telepon)
                  </h4>
                  <div className="p-3 rounded-md" style={{ backgroundColor: 'var(--background-tertiary)' }}>
                    {/* Display phones array if available */}
                    {detailDialog.result.regnik_data.phones && detailDialog.result.regnik_data.phones.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium" style={{ color: 'var(--foreground-muted)' }}>
                          Ditemukan {detailDialog.result.regnik_data.phones.length} nomor telepon:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {detailDialog.result.regnik_data.phones.map((phone, idx) => (
                            <span 
                              key={idx}
                              className="px-3 py-1.5 rounded-md font-mono text-sm"
                              style={{ 
                                backgroundColor: 'var(--accent-primary-transparent)',
                                color: 'var(--accent-primary)',
                                border: '1px solid var(--accent-primary)'
                              }}
                            >
                              📞 {phone}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : detailDialog.result.regnik_data.data && Object.keys(detailDialog.result.regnik_data.data).length > 0 ? (
                      <div className="space-y-1 text-xs">
                        {Object.entries(detailDialog.result.regnik_data.data).map(([key, value]) => (
                          <div key={key} className="flex">
                            <span className="font-medium w-28 flex-shrink-0" style={{ color: 'var(--foreground-muted)' }}>{key}:</span>
                            <span style={{ color: 'var(--foreground-primary)' }}>
                              {Array.isArray(value) ? value.join(', ') : String(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : detailDialog.result.regnik_data.raw_text ? (
                      <pre className="text-xs whitespace-pre-wrap" style={{ color: 'var(--foreground-primary)' }}>
                        {detailDialog.result.regnik_data.raw_text}
                      </pre>
                    ) : (
                      <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                        Status: {detailDialog.result.regnik_data.status} - {detailDialog.result.regnik_data.error || 'No data'}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </DraggableDialogContent>
        </DraggableDialog>
      ) : (
        <ResultDetailDialog
          open={detailDialog.open}
          onClose={() => setDetailDialog({ open: false, type: null, result: null, nik: null })}
          queryType={detailDialog.type}
          result={detailDialog.result}
          nik={detailDialog.nik}
        />
      )}

      {/* Family Tree Dialog */}
      <DraggableDialog open={familyTreeDialog.open} onOpenChange={(open) => setFamilyTreeDialog(prev => ({ ...prev, open }))}>
        <DraggableDialogContent 
          className="max-w-2xl max-h-[80vh] overflow-y-auto"
          style={{
            backgroundColor: 'var(--background-elevated)',
            borderColor: 'var(--borders-strong)'
          }}
        >
          <DraggableDialogHeader className="pb-2">
            <DraggableDialogTitle 
              className="text-lg font-bold flex items-center gap-2"
              style={{ color: 'var(--foreground-primary)' }}
            >
              <GitBranch className="w-5 h-5" style={{ color: 'var(--accent-secondary)' }} />
              Family Tree (NKK)
            </DraggableDialogTitle>
          </DraggableDialogHeader>
          
          {familyTreeDialog.familyData && (
            <div className="space-y-4">
              {/* Family Tree Visualization */}
              <FamilyTreeViz 
                members={familyTreeDialog.familyData.members} 
                targetNik={familyTreeDialog.targetNik} 
              />
              
              {/* Raw NKK Data Table */}
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--foreground-primary)' }}>
                  DATA ANGGOTA KELUARGA
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
                        <th className="py-1.5 px-2 text-left uppercase" style={{ color: 'var(--foreground-secondary)' }}>NIK</th>
                        <th className="py-1.5 px-2 text-left uppercase" style={{ color: 'var(--foreground-secondary)' }}>Nama</th>
                        <th className="py-1.5 px-2 text-left uppercase" style={{ color: 'var(--foreground-secondary)' }}>Hubungan</th>
                        <th className="py-1.5 px-2 text-left uppercase" style={{ color: 'var(--foreground-secondary)' }}>Gender</th>
                      </tr>
                    </thead>
                    <tbody>
                      {familyTreeDialog.familyData.members.map((member, idx) => (
                        <tr 
                          key={idx}
                          className="border-b"
                          style={{ 
                            borderColor: 'var(--borders-subtle)',
                            backgroundColor: member.nik === familyTreeDialog.targetNik ? 'rgba(255, 59, 92, 0.1)' : 'transparent'
                          }}
                        >
                          <td className="py-1.5 px-2 font-mono" style={{ color: 'var(--foreground-primary)' }}>{member.nik || '-'}</td>
                          <td className="py-1.5 px-2" style={{ color: 'var(--foreground-primary)' }}>{member.name || '-'}</td>
                          <td className="py-1.5 px-2" style={{ color: 'var(--foreground-muted)' }}>{member.relationship || '-'}</td>
                          <td className="py-1.5 px-2" style={{ color: 'var(--foreground-muted)' }}>{member.gender || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </DraggableDialogContent>
      </DraggableDialog>
    </>
  );
};

export default NonGeointSearchDialog;
