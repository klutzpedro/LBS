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
  AlertTriangle,
  X,
  Zap,
  Phone,
  Network,
  ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import { FamilyTreeViz } from '@/components/FamilyTreeViz';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// 3D styled Full Query Button (previously Query Nama)
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
          padding: '10px 16px',
          borderRadius: '8px',
          textShadow: '0 1px 0 rgba(255,255,255,0.3)',
          animation: isInvestigating ? 'pulse-btn 2s infinite' : 'none',
          width: '160px',
          height: '42px',
          justifyContent: 'center'
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
            FULL QUERY
          </>
        )}
      </Button>
      <Button
        onClick={onOpenHistory}
        size="icon"
        className="shadow-xl hover:scale-105 transition-all duration-200"
        style={{
          background: 'linear-gradient(145deg, #f59e0b, #d97706)',
          color: '#000',
          border: 'none',
          boxShadow: '0 6px 20px rgba(245, 158, 11, 0.4), 0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.2)',
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

          {/* Passports Found */}
          {result?.passports_found?.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--foreground-secondary)' }}>
                No. Paspor Ditemukan:
              </h4>
              <div className="flex flex-wrap gap-2">
                {result.passports_found.map(p => (
                  <span 
                    key={p}
                    className="px-2 py-1 rounded text-xs font-mono"
                    style={{ 
                      backgroundColor: 'rgba(245, 158, 11, 0.2)',
                      color: '#f59e0b'
                    }}
                  >
                    {p}
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
  const [searchFilter, setSearchFilter] = useState(''); // Search filter state

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

  // Reset filter when opening dialog
  useEffect(() => {
    if (open) {
      setSearchFilter('');
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

  const getStatusBadge = (status, hasInvestigation = false, niksFound = null) => {
    // Determine the correct display status
    let displayStatus = status;
    
    if (status === 'completed' || status === 'waiting_selection') {
      if (hasInvestigation) {
        // Has investigation = truly completed
        displayStatus = 'completed';
      } else if (niksFound === 0) {
        // No NIKs found = no data
        displayStatus = 'no_data';
      } else {
        // Has NIKs but no investigation yet = waiting for user to select
        displayStatus = 'waiting_selection';
      }
    }
    
    const styles = {
      completed: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'completed' },
      processing: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'processing' },
      waiting_selection: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'waiting selection' },
      no_data: { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'no data' },
      error: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'error' }
    };
    const s = styles[displayStatus] || styles.processing;
    return (
      <span className={`px-2 py-0.5 rounded text-xs ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    );
  };

  // Filter searches based on search filter
  const filteredSearches = searches.filter(search => 
    search.name?.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-lg"
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
            History Pencarian FULL QUERY
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-3">
          {/* Search Filter Input */}
          <div className="relative">
            <Search 
              className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" 
              style={{ color: 'var(--foreground-muted)' }} 
            />
            <Input
              placeholder="Cari nama target..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-9"
              style={{
                backgroundColor: 'var(--background-tertiary)',
                borderColor: 'var(--borders-default)',
                color: 'var(--foreground-primary)'
              }}
              data-testid="history-search-input"
            />
            {searchFilter && (
              <button
                onClick={() => setSearchFilter('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 hover:opacity-70"
                style={{ color: 'var(--foreground-muted)' }}
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Results count */}
          {!loading && searches.length > 0 && (
            <div className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
              Menampilkan {filteredSearches.length} dari {searches.length} pencarian
            </div>
          )}

          {/* Scrollable History List - Max 4 items visible (~320px) */}
          <div 
            className="overflow-y-auto pr-1 custom-scrollbar"
            style={{ 
              maxHeight: '320px',
              scrollbarWidth: 'thin',
              scrollbarColor: 'var(--accent-primary) var(--background-tertiary)'
            }}
          >
            <style>
              {`
                .custom-scrollbar::-webkit-scrollbar {
                  width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                  background: var(--background-tertiary);
                  border-radius: 3px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                  background: var(--accent-primary);
                  border-radius: 3px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                  background: var(--accent-secondary);
                }
              `}
            </style>
            
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-primary)' }} />
              </div>
            ) : searches.length === 0 ? (
              <div className="text-center py-8" style={{ color: 'var(--foreground-muted)' }}>
                <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Belum ada history pencarian</p>
              </div>
            ) : filteredSearches.length === 0 ? (
              <div className="text-center py-8" style={{ color: 'var(--foreground-muted)' }}>
                <Search className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Tidak ditemukan hasil untuk &quot;{searchFilter}&quot;</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredSearches.map(search => (
                  <div 
                    key={search.id}
                    className="p-3 rounded-md border cursor-pointer hover:bg-opacity-50 transition-all hover:scale-[1.01]"
                    onClick={() => {
                      onSelectSearch(search);
                      onOpenChange(false);
                    }}
                    style={{
                      backgroundColor: 'var(--background-tertiary)',
                      borderColor: 'var(--borders-subtle)'
                    }}
                    data-testid={`history-item-${search.id}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium" style={{ color: 'var(--foreground-primary)' }}>
                        {search.name}
                      </span>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(search.status, search.has_investigation, search.niks_found?.length || search.total_niks || 0)}
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
      className={`p-3 rounded-md border transition-all hover:scale-105 hover:shadow-lg ${isSelected ? 'ring-2 ring-offset-2' : ''}`}
      onClick={handleClick}
      onKeyPress={(e) => e.key === 'Enter' && handleClick(e)}
      onMouseDown={(e) => e.stopPropagation()}
      data-testid={`person-card-${index}`}
      style={{
        backgroundColor: isSelected 
          ? 'var(--accent-primary-transparent)' 
          : 'var(--background-tertiary)',
        borderColor: isSelected
          ? 'var(--accent-primary)'
          : 'var(--borders-subtle)',
        ringColor: isSelected ? 'var(--accent-primary)' : 'transparent',
        cursor: 'pointer',
        pointerEvents: 'auto',
        userSelect: 'none',
        position: 'relative',
        zIndex: 10
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
  const [isLoadingFromHistory, setIsLoadingFromHistory] = useState(false); // NEW: prevents form flash when loading from history
  
  // Person selection state
  const [personsFound, setPersonsFound] = useState([]);
  const [selectedPersonIndex, setSelectedPersonIndex] = useState(null);
  const [showPersonSelection, setShowPersonSelection] = useState(false);
  
  // Pagination state for photo batches
  const [isLoadingMorePhotos, setIsLoadingMorePhotos] = useState(false);
  const [hasMoreBatches, setHasMoreBatches] = useState(false);
  const [totalNiks, setTotalNiks] = useState(0);
  const [photosFetched, setPhotosFetched] = useState(0);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [cachedSearch, setCachedSearch] = useState(false);
  
  // NIK selection
  const [selectedNiks, setSelectedNiks] = useState([]);
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [investigation, setInvestigation] = useState(null);
  
  // Detail dialog state
  const [detailDialog, setDetailDialog] = useState({ open: false, type: null, result: null, nik: null });
  
  // Family Tree state
  const [familyTreeDialog, setFamilyTreeDialog] = useState({ open: false, familyData: null, targetNik: null, isMinimized: false });
  
  // Minimize and warning states
  const [isMinimized, setIsMinimized] = useState(false);
  const [showBackgroundWarning, setShowBackgroundWarning] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // 'minimize' or 'close'
  const [nameValidationError, setNameValidationError] = useState(''); // Validation error for name input
  
  // PENDALAMAN LANJUTAN dropdown state
  const [showAdvancedDropdown, setShowAdvancedDropdown] = useState(false);
  
  // SOCIAL NETWORK ANALYTICS state
  const [snaResults, setSnaResults] = useState({}); // Per-NIK SNA results
  const [isLoadingSna, setIsLoadingSna] = useState({}); // Per-NIK loading state
  const [snaDetailDialog, setSnaDetailDialog] = useState({ open: false, nik: null, data: null });
  // State untuk input manual social media links sebelum SNA
  const [snaInputDialog, setSnaInputDialog] = useState({ open: false, nik: null, name: null });
  const [snaManualLinks, setSnaManualLinks] = useState({
    instagram: '',
    facebook: '',
    tiktok: '',
    twitter: '',
    linkedin: ''
  });
  const snaPollingRef = useRef({});
  
  // FAKTA OSINT state
  const [osintResults, setOsintResults] = useState({}); // Per-NIK OSINT results
  const [isLoadingOsint, setIsLoadingOsint] = useState({}); // Per-NIK loading state
  const [osintDetailDialog, setOsintDetailDialog] = useState({ open: false, nik: null, data: null });
  
  const pollingRef = useRef(null);
  const investigationPollingRef = useRef(null);
  const osintPollingRef = useRef({});
  const lastOpenedWithSearchRef = useRef(null); // Track which search was last opened

  // Notify parent when investigation state changes
  useEffect(() => {
    onInvestigatingChange(isInvestigating);
  }, [isInvestigating, onInvestigatingChange]);

  // Handle minimize/close during search or investigation
  const handleMinimizeOrClose = (action) => {
    // Block minimize/close when searching or investigating
    if (isSearching || isInvestigating) {
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

  // Helper function to clean text from excessive quotes and formatting issues
  const cleanDisplayText = (text) => {
    if (!text || typeof text !== 'string') return text;
    // Remove excessive double quotes
    let cleaned = text.replace(/""/g, '"');
    // Remove quotes at beginning and end
    cleaned = cleaned.replace(/^"+|"+$/g, '');
    // Remove escaped quotes
    cleaned = cleaned.replace(/\\"/g, '"');
    // Remove quotes at beginning of lines
    cleaned = cleaned.replace(/^"/gm, '');
    // Remove quotes at end of lines
    cleaned = cleaned.replace(/"$/gm, '');
    // Fix multiple spaces
    cleaned = cleaned.replace(/ +/g, ' ');
    return cleaned.trim();
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
    setIsLoadingFromHistory(false);
    // Reset pagination states
    setIsLoadingMorePhotos(false);
    setHasMoreBatches(false);
    setTotalNiks(0);
    setPhotosFetched(0);
    setCurrentBatch(0);
    setCachedSearch(false);
    // Reset advanced dropdown
    setShowAdvancedDropdown(false);
    // Reset OSINT states
    setOsintResults({});
    setIsLoadingOsint({});
    setOsintDetailDialog({ open: false, nik: null, data: null });
    // Reset SNA states
    setSnaResults({});
    setIsLoadingSna({});
    setSnaDetailDialog({ open: false, nik: null, data: null });
  };

  // Handler to load more photos (next batch)
  const handleLoadMorePhotos = async () => {
    if (!searchResults?.id || isLoadingMorePhotos) return;
    
    setIsLoadingMorePhotos(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/nongeoint/search/${searchResults.id}/fetch-next-batch`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('[NonGeoint] Load more response:', data);
        
        if (data.status === 'fetching') {
          toast.info(`Mengambil ${data.niks_in_batch} foto berikutnya... (Batch ${data.batch}/${data.total_batches})`);
          // Start polling for batch completion
          startBatchPolling(searchResults.id);
        } else if (data.status === 'all_completed') {
          toast.success('Semua foto sudah diambil');
          setHasMoreBatches(false);
          setIsLoadingMorePhotos(false);
        }
      } else {
        toast.error('Gagal mengambil foto berikutnya');
        setIsLoadingMorePhotos(false);
      }
    } catch (error) {
      console.error('Load more photos error:', error);
      toast.error('Error mengambil foto berikutnya');
      setIsLoadingMorePhotos(false);
    }
  };

  // Polling for batch photo fetch completion
  const startBatchPolling = (searchId) => {
    const pollInterval = setInterval(async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/nongeoint/search/${searchId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('[NonGeoint] Batch polling response:', {
            status: data.status,
            nik_photos_count: Object.keys(data.nik_photos || {}).length,
            photos_fetched_count: data.photos_fetched_count,
            has_more_batches: data.has_more_batches,
            total_niks: data.total_niks
          });
          
          if (data.status !== 'fetching_photos') {
            clearInterval(pollInterval);
            setIsLoadingMorePhotos(false);
            setSearchResults(data);
            setHasMoreBatches(data.has_more_batches || false);
            setPhotosFetched(data.photos_fetched_count || Object.keys(data.nik_photos || {}).length);
            setCurrentBatch(data.current_batch || 0);
            
            // Refresh persons list with new photos
            if (data.nik_photos) {
              const nikPhotosCount = Object.keys(data.nik_photos).length;
              console.log(`[NonGeoint] Updating personsFound with ${nikPhotosCount} photos from nik_photos`);
              
              const persons = Object.entries(data.nik_photos)
                .map(([nik, d]) => ({
                  nik,
                  nama: d.name || d.nama,
                  name: d.name || d.nama,
                  photo: d.photo,
                  ttl: d.ttl,
                  alamat: d.alamat,
                  jk: d.jk,
                  status: d.status,
                  similarity: d.similarity || 0,
                  batch: d.batch
                }))
                .sort((a, b) => b.similarity - a.similarity);
              
              console.log(`[NonGeoint] Setting personsFound to ${persons.length} persons`);
              setPersonsFound(persons);
              toast.success(`Batch selesai! Menampilkan ${persons.length} dari ${data.total_niks} target`);
            }
          } else {
            console.log('[NonGeoint] Still fetching photos, continuing to poll...');
          }
        }
      } catch (error) {
        console.error('Batch polling error:', error);
      }
    }, 3000);
    
    // Clear after 5 minutes max
    setTimeout(() => {
      clearInterval(pollInterval);
      setIsLoadingMorePhotos(false);
    }, 300000);
  };

  // Load initial search if provided (from history)
  useEffect(() => {
    const loadSearchData = async () => {
      console.log('[NonGeoint] Loading search data for:', initialSearch?.id);
      setIsLoadingFromHistory(true); // Set loading state BEFORE fetching
      
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
          
          // If investigation already exists AND is completed, load it
          // For 'waiting_selection' status, don't load investigation - user needs to select
          if (fullSearchData.investigation && 
              fullSearchData.investigation.status === 'completed' &&
              fullSearchData.status !== 'waiting_selection') {
            console.log('[NonGeoint] Investigation found with status:', fullSearchData.investigation.status);
            console.log('[NonGeoint] Investigation results:', fullSearchData.investigation.results);
            console.log('[NonGeoint] OSINT results:', fullSearchData.investigation.osint_results);
            
            setInvestigation(fullSearchData.investigation);
            
            // Set selected NIKs from investigation
            if (fullSearchData.investigation.results) {
              const investigatedNiks = Object.keys(fullSearchData.investigation.results);
              setSelectedNiks(investigatedNiks);
              console.log('[NonGeoint] Loaded investigated NIKs:', investigatedNiks);
            }
            
            // Load cached OSINT results if available
            if (fullSearchData.investigation.osint_results) {
              console.log('[NonGeoint] Loading cached OSINT results');
              setOsintResults(fullSearchData.investigation.osint_results);
            }
            
            // Also check nongeoint_searches for OSINT (backup location)
            if (fullSearchData.osint_results && !fullSearchData.investigation.osint_results) {
              console.log('[NonGeoint] Loading OSINT from search data');
              setOsintResults(fullSearchData.osint_results);
            }
            
            // Load cached SNA results if available
            if (fullSearchData.investigation.sna_results) {
              console.log('[NonGeoint] Loading cached SNA results');
              setSnaResults(fullSearchData.investigation.sna_results);
            }
            
            // Also check nongeoint_searches for SNA (backup location)
            if (fullSearchData.sna_results && !fullSearchData.investigation.sna_results) {
              console.log('[NonGeoint] Loading SNA from search data');
              setSnaResults(fullSearchData.sna_results);
            }
            
            toast.success('Hasil pendalaman sebelumnya dimuat');
          } else if (fullSearchData.status === 'waiting_selection') {
            console.log('[NonGeoint] Status is waiting_selection - showing photo selection');
            // Reset investigation state - user needs to select from photos
            setInvestigation(null);
            setSelectedNiks([]);
            setShowPersonSelection(true);
            
            // Process nik_photos to show photo selection
            if (fullSearchData.nik_photos && Object.keys(fullSearchData.nik_photos).length > 0) {
              console.log('[NonGeoint] Loading nik_photos for selection:', Object.keys(fullSearchData.nik_photos).length);
              const persons = Object.entries(fullSearchData.nik_photos)
                .map(([nik, data]) => ({
                  nik: nik,
                  nama: data.name || data.nama,
                  name: data.name || data.nama,
                  photo: data.photo,
                  ttl: data.ttl,
                  alamat: data.alamat,
                  jk: data.jk,
                  status: data.status,
                  similarity: data.similarity || 0,
                  batch: data.batch || 0
                }))
                .sort((a, b) => {
                  if (b.similarity !== a.similarity) return b.similarity - a.similarity;
                  return (a.nama || '').localeCompare(b.nama || '');
                });
              
              setPersonsFound(persons);
              setTotalNiks(fullSearchData.total_niks || persons.length);
              setPhotosFetched(fullSearchData.photos_fetched_count || persons.length);
              setHasMoreBatches(fullSearchData.has_more_batches || false);
              setCurrentBatch(fullSearchData.current_batch || 0);
            }
          } else {
            console.log('[NonGeoint] No completed investigation found for this search');
            // No investigation yet, reset investigation state
            setInvestigation(null);
            setSelectedNiks([]);
          }
          
          setIsLoadingFromHistory(false); // Done loading
        } else {
          console.error('[NonGeoint] Failed to fetch search data, status:', response.status);
          // Fallback to initialSearch if fetch fails
          lastOpenedWithSearchRef.current = initialSearch.id;
          setSearchResults(initialSearch);
          setSearchName(initialSearch.name || '');
          setIsLoadingFromHistory(false); // Done loading
        }
      } catch (error) {
        console.error('[NonGeoint] Error loading search data:', error);
        // Fallback to initialSearch
        lastOpenedWithSearchRef.current = initialSearch?.id;
        setSearchResults(initialSearch);
        setSearchName(initialSearch?.name || '');
        setIsLoadingFromHistory(false); // Done loading
      }
    };
    
    if (open) {
      if (initialSearch) {
        // Loading from history - set loading state immediately
        setIsLoadingFromHistory(true);
        // Loading from history - load the search data
        const shouldLoad = lastOpenedWithSearchRef.current !== initialSearch.id;
        console.log('[NonGeoint] Dialog open with initialSearch:', initialSearch.id, 
                    'lastOpened:', lastOpenedWithSearchRef.current, 
                    'shouldLoad:', shouldLoad);
        if (shouldLoad) {
          loadSearchData();
        } else {
          setIsLoadingFromHistory(false); // Already loaded
        }
      } else {
        // NEW SEARCH - Always reset to show fresh form
        // Clear localStorage ongoing search and reset all states
        console.log('[NonGeoint] Dialog open for NEW search, clearing all states');
        localStorage.removeItem('nongeoint_ongoing_search_id');
        resetAllStates();
        lastOpenedWithSearchRef.current = null;
      }
    }
  }, [initialSearch?.id, open]);
  
  // Function to reload current search data
  const reloadCurrentSearch = async () => {
    if (!searchResults?.id) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/nongeoint/search/${searchResults.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('[NonGeoint] Reloaded search data:', {
          status: data.status,
          nik_photos_count: Object.keys(data.nik_photos || {}).length,
          photos_fetched_count: data.photos_fetched_count
        });
        
        setSearchResults(data);
        setHasMoreBatches(data.has_more_batches || false);
        setPhotosFetched(data.photos_fetched_count || Object.keys(data.nik_photos || {}).length);
        setTotalNiks(data.total_niks || data.niks_found?.length || 0);
        
        // Update persons list
        if (data.nik_photos) {
          const persons = Object.entries(data.nik_photos)
            .map(([nik, d]) => ({
              nik,
              nama: d.name || d.nama,
              name: d.name || d.nama,
              photo: d.photo,
              ttl: d.ttl,
              alamat: d.alamat,
              jk: d.jk,
              status: d.status,
              similarity: d.similarity || 0,
              batch: d.batch
            }))
            .sort((a, b) => b.similarity - a.similarity);
          
          setPersonsFound(persons);
        }
        
        // If still fetching, start polling
        if (data.status === 'fetching_photos') {
          startPollingForPhotos(data.id);
        }
      }
    } catch (error) {
      console.error('[NonGeoint] Error reloading search:', error);
    }
  };
  
  // Function to load ongoing search from localStorage
  const loadOngoingSearch = async (searchId) => {
    setIsLoadingFromHistory(true);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/nongeoint/search/${searchId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('[NonGeoint] Loaded ongoing search:', {
          id: data.id,
          name: data.name,
          status: data.status,
          nik_photos_count: Object.keys(data.nik_photos || {}).length
        });
        
        setSearchResults(data);
        setSearchName(data.name || '');
        setHasMoreBatches(data.has_more_batches || false);
        setPhotosFetched(data.photos_fetched_count || Object.keys(data.nik_photos || {}).length);
        setTotalNiks(data.total_niks || data.niks_found?.length || 0);
        
        // Update persons list
        if (data.nik_photos) {
          const persons = Object.entries(data.nik_photos)
            .map(([nik, d]) => ({
              nik,
              nama: d.name || d.nama,
              name: d.name || d.nama,
              photo: d.photo,
              ttl: d.ttl,
              alamat: d.alamat,
              jk: d.jk,
              status: d.status,
              similarity: d.similarity || 0,
              batch: d.batch
            }))
            .sort((a, b) => b.similarity - a.similarity);
          
          setPersonsFound(persons);
          setShowPersonSelection(true);
        }
        
        // If investigation exists
        if (data.investigation) {
          setInvestigation(data.investigation);
          if (data.investigation.results) {
            setSelectedNiks(Object.keys(data.investigation.results));
          }
        }
        
        // If still fetching, start polling
        if (data.status === 'fetching_photos') {
          startPollingForPhotos(data.id);
        }
        
        toast.info(`Melanjutkan pencarian "${data.name}"`);
      } else {
        // Search not found, clear localStorage and show fresh form
        localStorage.removeItem('nongeoint_ongoing_search_id');
        resetAllStates();
      }
    } catch (error) {
      console.error('[NonGeoint] Error loading ongoing search:', error);
      localStorage.removeItem('nongeoint_ongoing_search_id');
      resetAllStates();
    }
    
    setIsLoadingFromHistory(false);
  };
  
  // Function to start polling for photo fetching
  const startPollingForPhotos = (searchId) => {
    console.log('[NonGeoint] Starting polling for photos:', searchId);
    
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
    
    pollingRef.current = setInterval(async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/nongeoint/search/${searchId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.status !== 'fetching_photos') {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          
          setSearchResults(data);
          setPhotosFetched(data.photos_fetched_count || Object.keys(data.nik_photos || {}).length);
          
          if (data.nik_photos) {
            const persons = Object.entries(data.nik_photos)
              .map(([nik, d]) => ({
                nik,
                nama: d.name || d.nama,
                name: d.name || d.nama,
                photo: d.photo,
                ttl: d.ttl,
                alamat: d.alamat,
                jk: d.jk,
                status: d.status,
                similarity: d.similarity || 0,
                batch: d.batch
              }))
              .sort((a, b) => b.similarity - a.similarity);
            
            setPersonsFound(persons);
          }
        }
      } catch (error) {
        console.error('[NonGeoint] Polling error:', error);
      }
    }, 3000);
  };

  // Cleanup on close - DON'T reset if search is in progress
  useEffect(() => {
    if (!open) {
      console.log('[NonGeoint] Dialog closing');
      
      // Save current search ID to localStorage if search is in progress
      if (searchResults?.id && (searchResults?.status === 'fetching_photos' || searchResults?.status === 'waiting_selection' || isLoadingMorePhotos)) {
        console.log('[NonGeoint] Saving ongoing search to localStorage:', searchResults.id);
        localStorage.setItem('nongeoint_ongoing_search_id', searchResults.id);
      }
      
      // Clear polling intervals but DON'T reset states
      // Backend will continue fetching in background
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      if (investigationPollingRef.current) {
        clearInterval(investigationPollingRef.current);
        investigationPollingRef.current = null;
      }
      
      // Clear OSINT polling
      Object.keys(osintPollingRef.current).forEach(nik => {
        clearInterval(osintPollingRef.current[nik]);
        delete osintPollingRef.current[nik];
      });
      
      // Clear SNA polling
      Object.keys(snaPollingRef.current).forEach(nik => {
        clearInterval(snaPollingRef.current[nik]);
        delete snaPollingRef.current[nik];
      });
      
      // Only reset if user explicitly started a NEW search or there's no ongoing search
      // Don't reset here - let it persist so reopening continues from where we left off
    }
  }, [open, searchResults?.id, searchResults?.status, isLoadingMorePhotos]);

  // Process search results to extract persons WITH PHOTOS
  useEffect(() => {
    // Process when status is 'completed' OR 'waiting_selection' (pagination)
    if (searchResults?.status !== 'completed' && searchResults?.status !== 'waiting_selection') {
      return;
    }
    
    console.log('[NonGeoint] Processing search results useEffect:', {
      status: searchResults?.status,
      nik_photos_count: Object.keys(searchResults?.nik_photos || {}).length,
      investigation_exists: !!investigation,
      investigation_status: investigation?.status
    });
    
    // For 'waiting_selection' status, ALWAYS force show photo selection
    // This is critical for reopening from history
    const isWaitingSelection = searchResults?.status === 'waiting_selection';
    
    if (isWaitingSelection) {
      console.log('[NonGeoint] WAITING_SELECTION detected - forcing photo selection display');
      // Force reset investigation for waiting_selection
      setInvestigation(null);
    }
    
    // SKIP person selection setup ONLY if:
    // 1. Investigation exists AND is COMPLETED 
    // 2. AND search status is NOT 'waiting_selection'
    if (investigation && investigation.status === 'completed' && !isWaitingSelection) {
      console.log('[NonGeoint] Investigation completed from history, skipping person selection setup');
      return;
    }
    
    // Update pagination state
    setTotalNiks(searchResults.total_niks || searchResults.niks_found?.length || 0);
    setPhotosFetched(searchResults.photos_fetched_count || Object.keys(searchResults.nik_photos || {}).length);
    setHasMoreBatches(searchResults.has_more_batches || false);
    setCurrentBatch(searchResults.current_batch || 0);
    
    // Check if we have nik_photos from backend (new flow with auto photo fetch)
    if (searchResults?.nik_photos && Object.keys(searchResults.nik_photos).length > 0) {
      console.log('[NonGeoint] Using nik_photos from backend:', Object.keys(searchResults.nik_photos).length, 'photos');
      
      // Convert nik_photos object to persons array and sort by similarity
      const persons = Object.entries(searchResults.nik_photos)
        .map(([nik, data]) => {
          return {
            nik: nik,
            nama: data.name || data.nama,
            name: data.name || data.nama,
            photo: data.photo,
            ttl: data.ttl,
            alamat: data.alamat,
            jk: data.jk,
            status: data.status,
            similarity: data.similarity || 0,
            batch: data.batch || 0
          };
        })
        // Sort by similarity (highest first), then by name
        .sort((a, b) => {
          if (b.similarity !== a.similarity) {
            return b.similarity - a.similarity;
          }
          return (a.nama || '').localeCompare(b.nama || '');
        });
      
      console.log('[NonGeoint] Persons array created:', persons.length, 'persons');
      setPersonsFound(persons);
      
      // ALWAYS show person selection for waiting_selection or if we have persons
      if (persons.length >= 1 || isWaitingSelection) {
        console.log('[NonGeoint] Setting showPersonSelection = true');
        setShowPersonSelection(true);
      } else {
        setShowPersonSelection(false);
      }
    } 
    // Fallback to old flow (extract from CAPIL without photos)
    else if (searchResults?.results?.capil) {
      console.log('[NonGeoint] Fallback: extracting persons from CAPIL (no nik_photos)');
      const persons = extractPersonsFromCapil(searchResults.results.capil);
      setPersonsFound(persons);
      
      // ALWAYS show person selection for verification (even for single person)
      if (persons.length >= 1) {
        setShowPersonSelection(true);
      } else {
        setShowPersonSelection(false);
      }
    }
    // If waiting_selection but no nik_photos yet, still set showPersonSelection
    else if (isWaitingSelection) {
      console.log('[NonGeoint] Waiting selection but no nik_photos - will wait for data');
      setShowPersonSelection(true);
    }
  }, [searchResults?.id, searchResults?.status, searchResults?.nik_photos]);

  const startSearch = async () => {
    if (!searchName.trim()) {
      toast.error('Masukkan nama untuk dicari');
      return;
    }
    
    // Validate: Only alphabet characters allowed (a-z, A-Z, spaces)
    const alphabetOnly = /^[a-zA-Z\s]+$/;
    if (!alphabetOnly.test(searchName.trim())) {
      toast.error('Full Query hanya untuk nama berbasis alphabet (a-z). Tidak boleh mengandung angka atau karakter khusus.');
      return;
    }

    // Clear any ongoing search from localStorage
    localStorage.removeItem('nongeoint_ongoing_search_id');
    
    setIsSearching(true);
    setSearchResults(null);
    setSelectedNiks([]);
    setInvestigation(null);
    setPersonsFound([]);
    setSelectedPersonIndex(null);
    setShowPersonSelection(false);
    setCachedSearch(false);
    setHasMoreBatches(false);
    setTotalNiks(0);
    setPhotosFetched(0);

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
          query_types: ['capil']
        })
      });

      if (!response.ok) throw new Error('Search failed');

      const data = await response.json();
      
      // Check if this is a cached result
      if (data.cached) {
        toast.success('Menggunakan data dari pencarian sebelumnya');
        setCachedSearch(true);
        setTotalNiks(data.total_niks || 0);
        setPhotosFetched(data.photos_fetched || 0);
      }
      
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
      
      // Update pagination state
      setTotalNiks(data.total_niks || data.niks_found?.length || 0);
      setPhotosFetched(data.photos_fetched_count || Object.keys(data.nik_photos || {}).length);
      setHasMoreBatches(data.has_more_batches || false);
      setCurrentBatch(data.current_batch || 0);

      // Show progress for fetching_photos status
      if (data.status === 'fetching_photos') {
        const progress = data.photo_fetch_progress || 0;
        const total = data.photo_fetch_total || 0;
        console.log(`[NonGeoint] Fetching photos: ${progress}/${total}`);
        // Continue polling
      } else if (data.status === 'completed' || data.status === 'waiting_selection' || data.status === 'error') {
        // Stop polling when completed, waiting_selection (pagination), or error
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        setIsSearching(false);

        if (data.status === 'completed' || data.status === 'waiting_selection') {
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

  // Called when user clicks "Mulai Pendalaman" button after selecting photo
  const confirmPersonSelection = () => {
    if (selectedPersonIndex === null) {
      toast.error('Pilih salah satu target');
      return;
    }
    
    const selectedPerson = personsFound[selectedPersonIndex];
    console.log('[NonGeoint] Starting investigation for selected person:', selectedPerson);
    
    if (selectedPerson?.nik) {
      // Set selected NIK
      setSelectedNiks([selectedPerson.nik]);
      
      // Hide person selection and start investigation
      setShowPersonSelection(false);
      setIsInvestigating(true);
      setInvestigation(null);
      
      // Start investigation
      toast.info(`Memulai pendalaman NIK ${selectedPerson.nik}...`);
      startInvestigationWithNik(selectedPerson.nik);
    } else {
      toast.error('NIK tidak ditemukan untuk target ini');
    }
  };

  // Function to start investigation with a NIK
  const startInvestigationWithNik = async (nik) => {
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
          niks: [nik]
        })
      });

      if (!response.ok) throw new Error('Investigation failed');

      const data = await response.json();
      
      // Start polling for investigation results
      investigationPollingRef.current = setInterval(() => {
        pollInvestigation(data.investigation_id);
      }, 2000);

      // Initial poll
      pollInvestigation(data.investigation_id);

    } catch (error) {
      console.error('Investigation error:', error);
      toast.error('Gagal memulai pendalaman');
      setIsInvestigating(false);
    }
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

  // ==================== FAKTA OSINT Functions ====================
  
  const startFaktaOsint = async (nik, name) => {
    if (!searchResults?.id || !nik || !name) {
      toast.error('Data tidak lengkap untuk FAKTA OSINT');
      return;
    }
    
    setIsLoadingOsint(prev => ({ ...prev, [nik]: true }));
    toast.info(`Memulai FAKTA OSINT untuk ${name}...`);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/nongeoint/fakta-osint`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          search_id: searchResults.id,
          nik: nik,
          name: name
        })
      });
      
      if (!response.ok) throw new Error('Failed to start OSINT');
      
      const data = await response.json();
      console.log('[FAKTA OSINT] Started:', data);
      
      // Start polling for results
      osintPollingRef.current[nik] = setInterval(() => {
        pollOsintResults(data.osint_id, nik);
      }, 3000);
      
    } catch (error) {
      console.error('OSINT error:', error);
      toast.error('Gagal memulai FAKTA OSINT');
      setIsLoadingOsint(prev => ({ ...prev, [nik]: false }));
    }
  };
  
  const pollOsintResults = async (osintId, nik) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/nongeoint/fakta-osint/${osintId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('Failed to get OSINT');
      
      const data = await response.json();
      console.log('[FAKTA OSINT] Poll result:', data.status);
      
      if (data.status === 'completed' || data.status === 'error') {
        // Stop polling
        if (osintPollingRef.current[nik]) {
          clearInterval(osintPollingRef.current[nik]);
          delete osintPollingRef.current[nik];
        }
        
        setIsLoadingOsint(prev => ({ ...prev, [nik]: false }));
        setOsintResults(prev => ({ ...prev, [nik]: data.results }));
        
        // Also update investigation state to include OSINT (for consistency)
        if (data.status === 'completed' && investigation) {
          setInvestigation(prev => ({
            ...prev,
            osint_results: {
              ...(prev?.osint_results || {}),
              [nik]: {
                status: 'completed',
                ...data.results
              }
            }
          }));
        }
        
        if (data.status === 'completed') {
          toast.success(`FAKTA OSINT selesai untuk NIK ${nik}`);
        } else {
          toast.error(`FAKTA OSINT gagal: ${data.error || 'Unknown error'}`);
        }
      }
    } catch (error) {
      console.error('OSINT polling error:', error);
    }
  };
  
  const getOsintStatus = (nik) => {
    if (!nik) return 'pending';
    if (isLoadingOsint[nik]) return 'processing';
    
    // Check local state first (after fresh OSINT run)
    if (osintResults[nik]) {
      // osintResults[nik] is directly the results object (without status wrapper)
      // If it exists and has any data, OSINT is completed
      return 'completed';
    }
    
    // Check from investigation data (loaded from history)
    if (investigation?.osint_results?.[nik]) {
      const osintData = investigation.osint_results[nik];
      // Check if status is explicitly 'completed' or if data exists
      if (osintData.status === 'completed' || osintData.summary || osintData.social_media || osintData.web_search) {
        return 'completed';
      }
    }
    
    return 'pending';
  };

  // ==================== SOCIAL NETWORK ANALYTICS Functions ====================
  
  // Open input dialog before starting SNA
  const openSnaInputDialog = (nik, name) => {
    if (!searchResults?.id || !nik || !name) {
      toast.error('Data tidak lengkap untuk Social Network Analytics');
      return;
    }
    
    // Reset manual links
    setSnaManualLinks({
      instagram: '',
      facebook: '',
      tiktok: '',
      twitter: '',
      linkedin: ''
    });
    
    setSnaInputDialog({ open: true, nik, name });
  };
  
  const startSocialNetworkAnalytics = async (nik, name, manualLinks = null) => {
    if (!searchResults?.id || !nik || !name) {
      toast.error('Data tidak lengkap untuk Social Network Analytics');
      return;
    }
    
    // Get social media data from OSINT results - check multiple possible locations
    let osintData = osintResults[nik] || investigation?.osint_results?.[nik];
    let socialMediaUrls = [];
    
    // Extract social media URLs from various possible structures
    if (osintData) {
      // Direct social_media array
      if (osintData.social_media && Array.isArray(osintData.social_media)) {
        socialMediaUrls = osintData.social_media;
      }
      // Nested in results
      else if (osintData.results?.social_media && Array.isArray(osintData.results.social_media)) {
        socialMediaUrls = osintData.results.social_media;
      }
      // Check web_search results for social media links
      else if (osintData.web_search?.social_results) {
        socialMediaUrls = osintData.web_search.social_results;
      }
    }
    
    // Add manual links if provided
    if (manualLinks) {
      if (manualLinks.instagram) {
        socialMediaUrls.push({ platform: 'instagram', url: manualLinks.instagram, username: extractUsername(manualLinks.instagram, 'instagram') });
      }
      if (manualLinks.facebook) {
        socialMediaUrls.push({ platform: 'facebook', url: manualLinks.facebook, username: extractUsername(manualLinks.facebook, 'facebook') });
      }
      if (manualLinks.tiktok) {
        socialMediaUrls.push({ platform: 'tiktok', url: manualLinks.tiktok, username: extractUsername(manualLinks.tiktok, 'tiktok') });
      }
      if (manualLinks.twitter) {
        socialMediaUrls.push({ platform: 'twitter', url: manualLinks.twitter, username: extractUsername(manualLinks.twitter, 'twitter') });
      }
      if (manualLinks.linkedin) {
        socialMediaUrls.push({ platform: 'linkedin', url: manualLinks.linkedin, username: extractUsername(manualLinks.linkedin, 'linkedin') });
      }
    }
    
    console.log('[SNA] OSINT data found:', osintData);
    console.log('[SNA] Social media URLs:', socialMediaUrls);
    
    if (socialMediaUrls.length === 0) {
      toast.error('Tidak ada link media sosial. Masukkan minimal satu link atau jalankan OSINT terlebih dahulu.');
      return;
    }
    
    setIsLoadingSna(prev => ({ ...prev, [nik]: true }));
    toast.info(`Memulai Social Network Analytics untuk ${name}...`);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/nongeoint/social-network-analytics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          search_id: searchResults.id,
          nik: nik,
          name: name,
          social_media: socialMediaUrls
        })
      });
      
      if (!response.ok) throw new Error('Failed to start SNA');
      
      const data = await response.json();
      console.log('[SNA] Started:', data);
      
      // Start polling for results
      snaPollingRef.current[nik] = setInterval(() => {
        pollSnaResults(data.sna_id, nik);
      }, 3000);
      
    } catch (error) {
      console.error('SNA error:', error);
      toast.error('Gagal memulai Social Network Analytics');
      setIsLoadingSna(prev => ({ ...prev, [nik]: false }));
    }
  };
  
  // Helper to extract username from URL
  const extractUsername = (url, platform) => {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname.replace(/^\/+|\/+$/g, '');
      const parts = path.split('/');
      
      switch(platform) {
        case 'instagram':
        case 'tiktok':
        case 'twitter':
          return parts[0]?.replace('@', '') || '';
        case 'facebook':
          return parts[0] || '';
        case 'linkedin':
          return parts[1] || parts[0] || '';
        default:
          return parts[0] || '';
      }
    } catch {
      return url;
    }
  };
  
  const pollSnaResults = async (snaId, nik) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/nongeoint/social-network-analytics/${snaId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('Failed to get SNA');
      
      const data = await response.json();
      console.log('[SNA] Poll result:', data.status);
      
      if (data.status === 'completed' || data.status === 'error') {
        // Stop polling
        if (snaPollingRef.current[nik]) {
          clearInterval(snaPollingRef.current[nik]);
          delete snaPollingRef.current[nik];
        }
        
        setIsLoadingSna(prev => ({ ...prev, [nik]: false }));
        setSnaResults(prev => ({ ...prev, [nik]: data.results }));
        
        // Also update investigation state to include SNA (for consistency)
        if (data.status === 'completed' && investigation) {
          setInvestigation(prev => ({
            ...prev,
            sna_results: {
              ...(prev?.sna_results || {}),
              [nik]: {
                status: 'completed',
                ...data.results
              }
            }
          }));
        }
        
        if (data.status === 'completed') {
          toast.success(`Social Network Analytics selesai untuk NIK ${nik}`);
        } else {
          toast.error(`SNA gagal: ${data.error || 'Unknown error'}`);
        }
      }
    } catch (error) {
      console.error('SNA polling error:', error);
    }
  };
  
  const getSnaStatus = (nik) => {
    if (isLoadingSna[nik]) return 'processing';
    if (snaResults[nik]) return 'completed';
    // Check from investigation data
    if (investigation?.sna_results?.[nik]?.status === 'completed') return 'completed';
    return 'pending';
  };
  
  const getSnaData = (nik) => {
    return snaResults[nik] || investigation?.sna_results?.[nik] || null;
  };

  // Generate PDF with all results
  const generatePDF = () => {
    const pdf = new jsPDF();
    let yPos = 15;
    const lineHeight = 6;
    const pageHeight = 280;
    const pageWidth = 210;
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);
    
    // Color palette
    const colors = {
      primary: [0, 82, 147],      // Dark blue
      secondary: [41, 128, 185],   // Light blue
      accent: [46, 204, 113],      // Green
      warning: [241, 196, 15],     // Yellow
      text: [44, 62, 80],          // Dark gray
      lightGray: [236, 240, 241],  // Light gray bg
      border: [189, 195, 199]      // Border gray
    };
    
    // Helper: Check page break
    const checkPageBreak = (neededHeight = 20) => {
      if (yPos + neededHeight > pageHeight) {
        pdf.addPage();
        yPos = 20;
        addHeader(false); // Add header to new page
        return true;
      }
      return false;
    };
    
    // Helper: Draw horizontal line
    const drawLine = (y, color = colors.border) => {
      pdf.setDrawColor(...color);
      pdf.setLineWidth(0.3);
      pdf.line(margin, y, pageWidth - margin, y);
    };
    
    // Helper: Draw section header with background
    const addSectionHeader = (title, icon = '') => {
      checkPageBreak(15);
      yPos += 5;
      
      // Background rectangle
      pdf.setFillColor(...colors.primary);
      pdf.roundedRect(margin, yPos - 4, contentWidth, 10, 2, 2, 'F');
      
      // Section title
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${icon} ${title}`, margin + 5, yPos + 3);
      
      yPos += 12;
      pdf.setTextColor(...colors.text);
    };
    
    // Helper: Add subsection header
    const addSubsectionHeader = (title) => {
      checkPageBreak(12);
      yPos += 3;
      
      pdf.setFillColor(...colors.lightGray);
      pdf.rect(margin, yPos - 3, contentWidth, 8, 'F');
      
      pdf.setTextColor(...colors.secondary);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text(title, margin + 3, yPos + 2);
      
      yPos += 8;
      pdf.setTextColor(...colors.text);
    };
    
    // Helper: Add key-value pair
    const addKeyValue = (key, value, indent = 0) => {
      if (!value || value === '-' || value === 'null' || value === 'undefined') return;
      checkPageBreak(8);
      
      const x = margin + indent;
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...colors.text);
      pdf.text(`${key}:`, x, yPos);
      
      pdf.setFont('helvetica', 'normal');
      const valueX = x + pdf.getTextWidth(`${key}: `) + 2;
      const maxValueWidth = contentWidth - indent - pdf.getTextWidth(`${key}: `) - 5;
      const lines = pdf.splitTextToSize(String(value), maxValueWidth);
      
      lines.forEach((line, idx) => {
        if (idx > 0) {
          yPos += lineHeight - 1;
          checkPageBreak(8);
        }
        pdf.text(line, idx === 0 ? valueX : x + 5, yPos);
      });
      
      yPos += lineHeight;
    };
    
    // Helper: Add raw text block
    const addRawText = (text, maxLines = 20) => {
      if (!text) return;
      checkPageBreak(15);
      
      pdf.setFillColor(250, 250, 250);
      pdf.setDrawColor(...colors.border);
      
      const lines = pdf.splitTextToSize(String(text), contentWidth - 10);
      const displayLines = lines.slice(0, maxLines);
      const blockHeight = Math.min(displayLines.length * 5 + 6, 100);
      
      pdf.roundedRect(margin, yPos - 2, contentWidth, blockHeight, 1, 1, 'FD');
      
      pdf.setFontSize(8);
      pdf.setFont('courier', 'normal');
      pdf.setTextColor(80, 80, 80);
      
      displayLines.forEach((line, idx) => {
        pdf.text(line, margin + 3, yPos + 3 + (idx * 5));
      });
      
      if (lines.length > maxLines) {
        pdf.setFont('helvetica', 'italic');
        pdf.text(`... (${lines.length - maxLines} baris lagi)`, margin + 3, yPos + blockHeight - 3);
      }
      
      yPos += blockHeight + 3;
      pdf.setTextColor(...colors.text);
    };
    
    // Helper: Add photo with frame
    const addPhoto = (base64Data, width = 35, height = 45) => {
      if (!base64Data || !base64Data.startsWith('data:')) return false;
      
      try {
        checkPageBreak(height + 10);
        
        // Photo frame
        pdf.setDrawColor(...colors.border);
        pdf.setLineWidth(0.5);
        pdf.roundedRect(margin, yPos, width + 4, height + 4, 2, 2, 'S');
        
        pdf.addImage(base64Data, 'JPEG', margin + 2, yPos + 2, width, height);
        return { x: margin + width + 10, y: yPos, endY: yPos + height + 6 };
      } catch (err) {
        console.error('Error adding photo:', err);
        return false;
      }
    };
    
    // Helper: Add header
    const addHeader = (isFirst = true) => {
      if (isFirst) {
        // Logo area (placeholder - blue rectangle)
        pdf.setFillColor(...colors.primary);
        pdf.roundedRect(margin, 10, 25, 25, 3, 3, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('N', margin + 9, 26);
        
        // Title
        pdf.setTextColor(...colors.primary);
        pdf.setFontSize(20);
        pdf.setFont('helvetica', 'bold');
        pdf.text('LAPORAN INVESTIGASI', margin + 32, 20);
        
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...colors.secondary);
        pdf.text('Full Query Report - NETRA System', margin + 32, 28);
        
        // Date and info box
        pdf.setFillColor(...colors.lightGray);
        pdf.roundedRect(pageWidth - margin - 60, 10, 60, 25, 2, 2, 'F');
        
        pdf.setFontSize(8);
        pdf.setTextColor(...colors.text);
        pdf.text('Tanggal Cetak:', pageWidth - margin - 55, 18);
        pdf.setFont('helvetica', 'bold');
        pdf.text(new Date().toLocaleDateString('id-ID', { 
          day: 'numeric', month: 'short', year: 'numeric'
        }), pageWidth - margin - 55, 24);
        pdf.text(new Date().toLocaleTimeString('id-ID', { 
          hour: '2-digit', minute: '2-digit'
        }), pageWidth - margin - 55, 30);
        
        drawLine(40, colors.primary);
        yPos = 48;
      } else {
        // Simple header for subsequent pages
        pdf.setFontSize(8);
        pdf.setTextColor(...colors.secondary);
        pdf.text('NETRA - Laporan Investigasi', margin, 12);
        pdf.text(`Hal. ${pdf.internal.getNumberOfPages()}`, pageWidth - margin - 10, 12);
        drawLine(15, colors.lightGray);
      }
    };
    
    // ==================== START PDF GENERATION ====================
    
    // Header
    addHeader(true);
    
    // Search Info Box
    pdf.setFillColor(240, 248, 255);
    pdf.setDrawColor(...colors.secondary);
    pdf.roundedRect(margin, yPos, contentWidth, 20, 3, 3, 'FD');
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...colors.primary);
    pdf.text('Target Pencarian:', margin + 5, yPos + 8);
    
    pdf.setFontSize(14);
    pdf.text(searchResults?.name || '-', margin + 5, yPos + 16);
    
    yPos += 28;
    
    // ============ 1. FOTO TARGET ============
    // Combine photos from nik_photos and investigation results
    const allPhotos = {};
    
    // First, get photos from nik_photos
    if (searchResults?.nik_photos) {
      Object.entries(searchResults.nik_photos).forEach(([nik, data]) => {
        if (data?.photo) {
          allPhotos[nik] = data;
        }
      });
    }
    
    // Then, fallback to investigation results if photo not found
    if (investigation?.results) {
      Object.entries(investigation.results).forEach(([nik, nikResult]) => {
        if (!allPhotos[nik]?.photo && nikResult?.nik_data?.photo) {
          allPhotos[nik] = {
            ...allPhotos[nik],
            photo: nikResult.nik_data.photo,
            name: nikResult.nik_data.data?.NAMA || nikResult.nik_data.data?.nama || allPhotos[nik]?.name
          };
        }
      });
    }
    
    if (Object.keys(allPhotos).length > 0 && Object.values(allPhotos).some(p => p?.photo)) {
      addSectionHeader('FOTO TARGET', '[1]');
      
      const nikPhotos = allPhotos;
      const selectedNikPhotos = selectedNiks.length > 0 
        ? selectedNiks.filter(nik => nikPhotos[nik]?.photo)
        : Object.keys(nikPhotos).filter(nik => nikPhotos[nik]?.photo);
      
      // Display photos in a grid (2 per row)
      let photoX = margin;
      let maxRowY = yPos;
      
      selectedNikPhotos.forEach((nik, idx) => {
        const photoData = nikPhotos[nik];
        if (photoData?.photo && photoData.photo.startsWith('data:')) {
          if (idx % 2 === 0 && idx > 0) {
            yPos = maxRowY + 5;
            photoX = margin;
          }
          
          checkPageBreak(60);
          
          try {
            // Photo frame
            pdf.setDrawColor(...colors.border);
            pdf.roundedRect(photoX, yPos, 40, 58, 2, 2, 'S');
            pdf.addImage(photoData.photo, 'JPEG', photoX + 2, yPos + 2, 36, 46);
            
            // Name under photo
            pdf.setFontSize(7);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(...colors.text);
            const name = (photoData.name || 'N/A').substring(0, 20);
            pdf.text(name, photoX + 20, yPos + 52, { align: 'center' });
            
            pdf.setFontSize(6);
            pdf.setFont('helvetica', 'normal');
            pdf.text(nik, photoX + 20, yPos + 56, { align: 'center' });
            
            maxRowY = Math.max(maxRowY, yPos + 60);
            photoX += 48;
          } catch (e) {
            console.error('Photo error:', e);
          }
        }
      });
      
      yPos = maxRowY + 5;
    }
    
    // ============ PROCESS EACH NIK ============
    if (investigation?.results && Object.keys(investigation.results).length > 0) {
      Object.entries(investigation.results).forEach(([nik, nikResult], idx) => {
        // NIK Header
        checkPageBreak(30);
        yPos += 5;
        
        pdf.setFillColor(...colors.secondary);
        pdf.roundedRect(margin, yPos - 4, contentWidth, 12, 2, 2, 'F');
        
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`NIK ${idx + 1}: ${nik}`, margin + 5, yPos + 4);
        
        // Get name from nik_photos if available
        const nikPhotoData = searchResults?.nik_photos?.[nik];
        if (nikPhotoData?.name) {
          pdf.setFontSize(9);
          pdf.text(`(${nikPhotoData.name})`, margin + 80, yPos + 4);
        }
        
        yPos += 15;
        pdf.setTextColor(...colors.text);
        
        // ============ 2. DATA NIK (CAPIL) ============
        if (nikResult?.nik_data) {
          addSubsectionHeader('[2] Data Kependudukan (NIK)');
          
          const nikData = nikResult.nik_data;
          if (nikData.data && Object.keys(nikData.data).length > 0) {
            Object.entries(nikData.data).forEach(([key, value]) => {
              addKeyValue(key, value, 3);
            });
          } else if (nikData.raw_text) {
            addRawText(nikData.raw_text, 15);
          }
        }
        
        // ============ 3. DATA NKK (Kartu Keluarga) ============
        if (nikResult?.nkk_data) {
          addSubsectionHeader('[3] Data Kartu Keluarga (NKK)');
          
          const nkkData = nikResult.nkk_data;
          
          // Family members table
          if (nkkData.family_data?.members?.length > 0) {
            const members = nkkData.family_data.members;
            checkPageBreak(20 + members.length * 6);
            
            // Table header
            pdf.setFillColor(...colors.lightGray);
            pdf.rect(margin, yPos, contentWidth, 7, 'F');
            
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(...colors.text);
            pdf.text('No', margin + 2, yPos + 5);
            pdf.text('NIK', margin + 12, yPos + 5);
            pdf.text('Nama', margin + 55, yPos + 5);
            pdf.text('Hubungan', margin + 110, yPos + 5);
            pdf.text('L/P', margin + 150, yPos + 5);
            
            yPos += 8;
            
            // Table rows
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(7);
            members.forEach((member, mIdx) => {
              if (mIdx % 2 === 0) {
                pdf.setFillColor(250, 250, 250);
                pdf.rect(margin, yPos - 3, contentWidth, 6, 'F');
              }
              
              pdf.text(String(mIdx + 1), margin + 2, yPos);
              pdf.text(member.nik || '-', margin + 12, yPos);
              pdf.text((member.name || '-').substring(0, 28), margin + 55, yPos);
              pdf.text((member.relationship || '-').substring(0, 18), margin + 110, yPos);
              pdf.text(member.gender || '-', margin + 150, yPos);
              
              yPos += 6;
              checkPageBreak(10);
            });
            
            yPos += 3;
          } else if (nkkData.raw_text) {
            addRawText(nkkData.raw_text, 15);
          }
        }
        
        // ============ 4. DATA FAMILY TREE (Visualisasi) ============
        if (nikResult?.nkk_data?.family_data?.members?.length > 0) {
          addSubsectionHeader('[4] Family Tree (Struktur Keluarga)');
          
          const members = nikResult.nkk_data.family_data.members;
          
          // Find head of family
          const kepala = members.find(m => 
            m.relationship?.toLowerCase().includes('kepala') || 
            m.relationship?.toLowerCase().includes('head')
          );
          
          // Find spouse
          const istri = members.find(m => 
            m.relationship?.toLowerCase().includes('istri') || 
            m.relationship?.toLowerCase().includes('suami') ||
            m.relationship?.toLowerCase().includes('spouse')
          );
          
          // Find children
          const anak = members.filter(m => 
            m.relationship?.toLowerCase().includes('anak') ||
            m.relationship?.toLowerCase().includes('child')
          );
          
          // Find others
          const lainnya = members.filter(m => 
            !m.relationship?.toLowerCase().includes('kepala') &&
            !m.relationship?.toLowerCase().includes('head') &&
            !m.relationship?.toLowerCase().includes('istri') &&
            !m.relationship?.toLowerCase().includes('suami') &&
            !m.relationship?.toLowerCase().includes('spouse') &&
            !m.relationship?.toLowerCase().includes('anak') &&
            !m.relationship?.toLowerCase().includes('child')
          );
          
          checkPageBreak(80);
          
          // Draw family tree structure
          const treeX = margin + 10;
          let treeY = yPos;
          
          // Kepala Keluarga (top)
          if (kepala) {
            pdf.setFillColor(41, 128, 185);
            pdf.roundedRect(treeX + 50, treeY, 80, 12, 2, 2, 'F');
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'bold');
            pdf.text('KEPALA KELUARGA', treeX + 90, treeY + 5, { align: 'center' });
            pdf.setFontSize(7);
            pdf.setFont('helvetica', 'normal');
            pdf.text((kepala.name || '-').substring(0, 25), treeX + 90, treeY + 10, { align: 'center' });
            treeY += 15;
            
            // Line down
            pdf.setDrawColor(100, 100, 100);
            pdf.line(treeX + 90, treeY, treeX + 90, treeY + 5);
            treeY += 5;
          }
          
          // Istri/Suami (same level as kepala or below)
          if (istri) {
            pdf.setFillColor(155, 89, 182);
            pdf.roundedRect(treeX + 50, treeY, 80, 12, 2, 2, 'F');
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'bold');
            pdf.text('ISTRI/SUAMI', treeX + 90, treeY + 5, { align: 'center' });
            pdf.setFontSize(7);
            pdf.setFont('helvetica', 'normal');
            pdf.text((istri.name || '-').substring(0, 25), treeX + 90, treeY + 10, { align: 'center' });
            treeY += 15;
            
            // Line down
            pdf.setDrawColor(100, 100, 100);
            pdf.line(treeX + 90, treeY, treeX + 90, treeY + 5);
            treeY += 5;
          }
          
          // Anak-anak (below)
          if (anak.length > 0) {
            // Horizontal line
            const anakStartX = treeX + 20;
            const anakWidth = Math.min(anak.length * 45, 150);
            pdf.line(treeX + 90 - anakWidth/2, treeY, treeX + 90 + anakWidth/2, treeY);
            treeY += 3;
            
            // Children boxes
            const childBoxWidth = 40;
            const startX = treeX + 90 - (anak.length * (childBoxWidth + 5)) / 2;
            
            anak.slice(0, 4).forEach((child, cIdx) => {
              const childX = startX + cIdx * (childBoxWidth + 5);
              
              // Vertical line
              pdf.line(childX + childBoxWidth/2, treeY - 3, childX + childBoxWidth/2, treeY);
              
              // Child box
              pdf.setFillColor(46, 204, 113);
              pdf.roundedRect(childX, treeY, childBoxWidth, 12, 2, 2, 'F');
              pdf.setTextColor(255, 255, 255);
              pdf.setFontSize(6);
              pdf.setFont('helvetica', 'bold');
              pdf.text(`ANAK ${cIdx + 1}`, childX + childBoxWidth/2, treeY + 4, { align: 'center' });
              pdf.setFont('helvetica', 'normal');
              pdf.text((child.name || '-').substring(0, 12), childX + childBoxWidth/2, treeY + 9, { align: 'center' });
            });
            
            if (anak.length > 4) {
              pdf.setTextColor(100, 100, 100);
              pdf.setFontSize(7);
              pdf.text(`+${anak.length - 4} anak lainnya`, treeX + 140, treeY + 6);
            }
            
            treeY += 15;
          }
          
          // Anggota lainnya
          if (lainnya.length > 0) {
            treeY += 5;
            pdf.setTextColor(...colors.text);
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'bold');
            pdf.text('Anggota Lainnya:', treeX, treeY);
            treeY += 5;
            
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(7);
            lainnya.forEach((member, mIdx) => {
              pdf.text(`- ${member.name || '-'} (${member.relationship || '-'})`, treeX + 5, treeY);
              treeY += 4;
            });
          }
          
          yPos = treeY + 5;
          pdf.setTextColor(...colors.text);
        }
        
        // ============ 5. DATA REG HP ============
        if (nikResult?.regnik_data) {
          addSubsectionHeader('[5] Data Registrasi HP (RegNIK)');
          
          const regnikData = nikResult.regnik_data;
          if (regnikData.phones && regnikData.phones.length > 0) {
            addKeyValue('Jumlah Nomor Terdaftar', regnikData.phones.length, 3);
            
            checkPageBreak(regnikData.phones.length * 6 + 5);
            
            regnikData.phones.forEach((phone, pIdx) => {
              pdf.setFontSize(9);
              pdf.setFont('helvetica', 'normal');
              pdf.text(`${pIdx + 1}. ${phone}`, margin + 8, yPos);
              yPos += 5;
            });
            yPos += 3;
          } else if (regnikData.raw_text) {
            addRawText(regnikData.raw_text, 10);
          }
        }
        
        // ============ 6. DATA PASSPORT ============
        if (nikResult?.passport_data) {
          addSubsectionHeader('[6] Data Passport');
          
          const passportData = nikResult.passport_data;
          
          if (passportData.passports && passportData.passports.length > 0) {
            addKeyValue('Jumlah Passport', passportData.passports.length, 3);
            
            // Detail each passport
            const wniData = passportData.wni_data?.result || passportData.wni_data?.data || [];
            if (Array.isArray(wniData) && wniData.length > 0) {
              wniData.forEach((passport, pIdx) => {
                checkPageBreak(40);
                
                pdf.setFillColor(255, 250, 240);
                pdf.roundedRect(margin + 3, yPos, contentWidth - 6, 35, 2, 2, 'F');
                
                pdf.setFontSize(9);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(...colors.primary);
                pdf.text(`Passport ${pIdx + 1}`, margin + 8, yPos + 6);
                
                pdf.setFont('helvetica', 'normal');
                pdf.setTextColor(...colors.text);
                pdf.setFontSize(8);
                
                const pY = yPos + 11;
                pdf.text(`No. Paspor: ${passport.no_paspor || passport.TRAVELDOCUMENTNO || '-'}`, margin + 8, pY);
                pdf.text(`Nama: ${passport.nama_lengkap || passport.nama_di_paspor || passport.GIVENNAME || '-'}`, margin + 8, pY + 5);
                pdf.text(`TTL: ${passport.tempat_lahir || '-'}, ${passport.tanggal_lahir || passport.DATEOFBIRTH || '-'}`, margin + 8, pY + 10);
                pdf.text(`Berlaku s/d: ${passport.tanggal_habis_berlaku_paspor || passport.EXPIRATIONDATE || '-'}`, margin + 8, pY + 15);
                pdf.text(`Kantor: ${passport.kantor_penerbit || passport.ISSUINGSTATEDESCRIPTION || '-'}`, margin + 8, pY + 20);
                
                yPos += 38;
              });
            }
          } else if (passportData.status === 'no_data') {
            pdf.setFontSize(9);
            pdf.setTextColor(150, 150, 150);
            pdf.text('Tidak ada data passport', margin + 5, yPos);
            yPos += 8;
          }
        }
        
        // ============ 7. DATA PERLINTASAN ============
        if (nikResult?.perlintasan_data) {
          addSubsectionHeader('[7] Data Perlintasan Imigrasi');
          
          const perlintasanData = nikResult.perlintasan_data;
          
          if (perlintasanData.results && perlintasanData.results.length > 0) {
            perlintasanData.results.forEach((passportResult) => {
              if (passportResult.crossings && passportResult.crossings.length > 0) {
                checkPageBreak(15);
                
                pdf.setFontSize(9);
                pdf.setFont('helvetica', 'bold');
                pdf.text(`Passport: ${passportResult.passport_no} (${passportResult.crossings.length} perjalanan)`, margin + 5, yPos);
                yPos += 8;
                
                // Perlintasan table with proper borders
                const tableData = passportResult.crossings.slice(0, 10).map((crossing, cIdx) => {
                  const dir = crossing.direction_code === 'A' ? 'MASUK' : crossing.direction_code === 'D' ? 'KELUAR' : crossing.direction;
                  return [
                    String(cIdx + 1),
                    crossing.movement_date || '-',
                    dir,
                    (crossing.tpi_name || '-').substring(0, 28),
                    (crossing.port_description || '-').substring(0, 22)
                  ];
                });
                
                // Use autoTable for proper table rendering
                pdf.autoTable({
                  startY: yPos,
                  head: [['No', 'Tanggal', 'Arah', 'TPI', 'Tujuan/Asal']],
                  body: tableData,
                  theme: 'grid',
                  margin: { left: margin },
                  styles: { 
                    fontSize: 7, 
                    cellPadding: 2,
                    lineColor: [100, 100, 100],
                    lineWidth: 0.1
                  },
                  headStyles: { 
                    fillColor: [45, 55, 72], 
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    halign: 'center'
                  },
                  columnStyles: {
                    0: { halign: 'center', cellWidth: 10 },
                    1: { cellWidth: 32 },
                    2: { halign: 'center', cellWidth: 20 },
                    3: { cellWidth: 50 },
                    4: { cellWidth: 45 }
                  },
                  alternateRowStyles: { fillColor: [245, 247, 250] }
                });
                
                yPos = pdf.lastAutoTable.finalY + 5;
                
                if (passportResult.crossings.length > 10) {
                  pdf.setFontSize(8);
                  pdf.setFont('helvetica', 'italic');
                  pdf.setTextColor(100, 100, 100);
                  pdf.text(`... dan ${passportResult.crossings.length - 10} perjalanan lainnya`, margin + 5, yPos);
                  pdf.setTextColor(...colors.text);
                  yPos += 8;
                }
                
                yPos += 3;
              }
            });
          } else {
            pdf.setFontSize(9);
            pdf.setTextColor(150, 150, 150);
            pdf.text('Tidak ada data perlintasan', margin + 5, yPos);
            yPos += 8;
          }
        }
        
        // ============ FAKTA OSINT SECTION ============
        const osintData = osintResults[nik] || investigation?.osint_results?.[nik];
        if (osintData) {
          addSectionHeader('🌐 FAKTA OSINT');
          
          // Helper function to clean text for PDF
          const cleanPdfText = (text) => {
            if (!text || typeof text !== 'string') return text;
            let cleaned = text.replace(/""/g, '"');
            cleaned = cleaned.replace(/^"+|"+$/g, '');
            cleaned = cleaned.replace(/\\"/g, '"');
            cleaned = cleaned.replace(/^"/gm, '');
            cleaned = cleaned.replace(/"$/gm, '');
            cleaned = cleaned.replace(/ +/g, ' ');
            return cleaned.trim();
          };
          
          // AI Summary / Antecedents - FULL TEXT
          if (osintData.summary || osintData.antecedents) {
            addSubsectionHeader('Ringkasan & Anteseden Target');
            const summaryText = cleanPdfText(osintData.summary || osintData.antecedents || '');
            const summaryLines = pdf.splitTextToSize(summaryText, contentWidth - 10);
            pdf.setFontSize(9);
            pdf.setTextColor(...colors.text);
            summaryLines.forEach(line => {
              checkPageBreak(6);
              pdf.text(line, margin + 5, yPos);
              yPos += 5;
            });
            yPos += 5;
          }
          
          // Social Media with full URLs
          if (osintData.social_media?.length > 0) {
            addSubsectionHeader(`Media Sosial (${osintData.social_media.length} ditemukan)`);
            osintData.social_media.forEach(sm => {
              checkPageBreak(12);
              pdf.setFontSize(9);
              pdf.setFont('helvetica', 'bold');
              pdf.setTextColor(...colors.text);
              pdf.text(`• ${sm.platform.toUpperCase()}: @${sm.username}`, margin + 5, yPos);
              yPos += 5;
              // Show full URL
              if (sm.url) {
                pdf.setFontSize(8);
                pdf.setFont('helvetica', 'normal');
                pdf.setTextColor(41, 128, 185); // Blue for links
                const urlLines = pdf.splitTextToSize(sm.url, contentWidth - 15);
                urlLines.forEach(urlLine => {
                  checkPageBreak(5);
                  pdf.text(urlLine, margin + 10, yPos);
                  yPos += 4;
                });
              }
              yPos += 2;
            });
            yPos += 3;
          }
          
          // Legal Cases with full details
          if (osintData.legal_cases?.length > 0) {
            addSubsectionHeader(`⚠️ Catatan Hukum (${osintData.legal_cases.length} ditemukan)`);
            osintData.legal_cases.forEach(lc => {
              checkPageBreak(20);
              pdf.setFontSize(9);
              pdf.setFont('helvetica', 'bold');
              pdf.setTextColor(200, 50, 50);
              pdf.text(`• ${lc.source}`, margin + 5, yPos);
              yPos += 5;
              
              // Full note
              if (lc.note) {
                pdf.setFontSize(8);
                pdf.setFont('helvetica', 'normal');
                pdf.setTextColor(80, 80, 80);
                const noteLines = pdf.splitTextToSize(lc.note, contentWidth - 15);
                noteLines.forEach(line => {
                  checkPageBreak(5);
                  pdf.text(line, margin + 10, yPos);
                  yPos += 4;
                });
              }
              
              // Full URL
              if (lc.url) {
                pdf.setTextColor(41, 128, 185);
                const urlLines = pdf.splitTextToSize(`Link: ${lc.url}`, contentWidth - 15);
                urlLines.forEach(urlLine => {
                  checkPageBreak(5);
                  pdf.text(urlLine, margin + 10, yPos);
                  yPos += 4;
                });
              }
              yPos += 3;
            });
            yPos += 3;
          }
          
          // Web Mentions - FULL DETAILS with URLs
          if (osintData.web_mentions?.length > 0) {
            addSubsectionHeader(`Temuan Web (${osintData.web_mentions.length} hasil)`);
            osintData.web_mentions.forEach((wm, idx) => {
              checkPageBreak(25);
              
              // Title
              pdf.setFontSize(9);
              pdf.setFont('helvetica', 'bold');
              pdf.setTextColor(...colors.text);
              const titleLines = pdf.splitTextToSize(`${idx + 1}. ${wm.title || 'Tanpa Judul'}`, contentWidth - 10);
              titleLines.forEach(titleLine => {
                checkPageBreak(5);
                pdf.text(titleLine, margin + 5, yPos);
                yPos += 5;
              });
              
              // Snippet (full text)
              if (wm.snippet) {
                pdf.setFontSize(8);
                pdf.setFont('helvetica', 'normal');
                pdf.setTextColor(80, 80, 80);
                const snippetLines = pdf.splitTextToSize(wm.snippet, contentWidth - 15);
                snippetLines.forEach(snippetLine => {
                  checkPageBreak(5);
                  pdf.text(snippetLine, margin + 10, yPos);
                  yPos += 4;
                });
              }
              
              // Full URL
              if (wm.url) {
                pdf.setTextColor(41, 128, 185);
                const urlLines = pdf.splitTextToSize(wm.url, contentWidth - 15);
                urlLines.forEach(urlLine => {
                  checkPageBreak(5);
                  pdf.text(urlLine, margin + 10, yPos);
                  yPos += 4;
                });
              }
              
              yPos += 3;
            });
          }
          
          // Family Cache Data
          if (osintData.family_cache?.length > 0) {
            addSubsectionHeader(`Data Keluarga dari Cache (${osintData.family_cache.length} ditemukan)`);
            osintData.family_cache.forEach(fm => {
              checkPageBreak(30);
              
              // Family member name and relation
              pdf.setFontSize(9);
              pdf.setFont('helvetica', 'bold');
              pdf.setTextColor(...colors.text);
              pdf.text(`• ${fm.nama} (${fm.hubungan})`, margin + 5, yPos);
              yPos += 5;
              
              pdf.setFontSize(8);
              pdf.setFont('helvetica', 'normal');
              pdf.setTextColor(80, 80, 80);
              pdf.text(`NIK: ${fm.nik}`, margin + 10, yPos);
              yPos += 4;
              
              // Tags
              const tags = [];
              if (fm.has_investigation) tags.push('Data NIK');
              if (fm.has_osint) tags.push('OSINT');
              if (tags.length > 0) {
                pdf.text(`Status: ${tags.join(', ')}`, margin + 10, yPos);
                yPos += 4;
              }
              
              // Investigation data
              if (fm.investigation_data?.nik_data?.data) {
                const nikData = fm.investigation_data.nik_data.data;
                if (nikData.Address || nikData.Alamat) {
                  pdf.text(`Alamat: ${nikData.Address || nikData.Alamat}`, margin + 10, yPos);
                  yPos += 4;
                }
                if (nikData.Occupation || nikData.Pekerjaan) {
                  pdf.text(`Pekerjaan: ${nikData.Occupation || nikData.Pekerjaan}`, margin + 10, yPos);
                  yPos += 4;
                }
              }
              
              // OSINT social media
              if (fm.osint_data?.social_media?.length > 0) {
                const smList = fm.osint_data.social_media.slice(0, 5).map(s => `${s.platform}: @${s.username}`).join(', ');
                const smLines = pdf.splitTextToSize(`Media Sosial: ${smList}`, contentWidth - 15);
                smLines.forEach(line => {
                  checkPageBreak(5);
                  pdf.text(line, margin + 10, yPos);
                  yPos += 4;
                });
              }
              
              // Search info
              if (fm.search_info) {
                pdf.setFontSize(7);
                pdf.setTextColor(120, 120, 120);
                pdf.text(`Dari pencarian: ${fm.search_info.name} (${fm.search_info.created_by})`, margin + 10, yPos);
                yPos += 4;
              }
              
              yPos += 3;
            });
          }
        }
        
        // ============ SOCIAL NETWORK ANALYTICS SECTION ============
        const snaData = snaResults[nik] || investigation?.sna_results?.[nik];
        if (snaData) {
          addSectionHeader('🕸️ SOCIAL NETWORK ANALYTICS');
          
          // Platform Statistics
          if (snaData.statistics) {
            addSubsectionHeader('Statistik Jaringan');
            
            const statsTable = [];
            if (snaData.statistics.total_followers) statsTable.push(['Followers', snaData.statistics.total_followers.toLocaleString()]);
            if (snaData.statistics.total_following) statsTable.push(['Following', snaData.statistics.total_following.toLocaleString()]);
            if (snaData.statistics.total_likes) statsTable.push(['Total Likes', snaData.statistics.total_likes.toLocaleString()]);
            if (snaData.statistics.total_posts) statsTable.push(['Total Posts', snaData.statistics.total_posts.toLocaleString()]);
            if (snaData.statistics.total_friends) statsTable.push(['Friends', snaData.statistics.total_friends.toLocaleString()]);
            if (snaData.statistics.total_connections) statsTable.push(['Connections', snaData.statistics.total_connections.toLocaleString()]);
            
            if (statsTable.length > 0) {
              pdf.autoTable({
                startY: yPos,
                body: statsTable,
                theme: 'plain',
                margin: { left: margin + 5 },
                styles: { fontSize: 9, cellPadding: 2 },
                columnStyles: {
                  0: { fontStyle: 'bold', cellWidth: 50 },
                  1: { cellWidth: 60 }
                }
              });
              yPos = pdf.lastAutoTable.finalY + 5;
            }
          }
          
          // Profiles
          if (snaData.profiles?.length > 0) {
            addSubsectionHeader(`Profil Media Sosial (${snaData.profiles.length} ditemukan)`);
            
            const profilesData = snaData.profiles.map(p => {
              const platformIcon = p.platform === 'instagram' ? '📷' : p.platform === 'facebook' ? '📘' : p.platform === 'twitter' ? '🐦' : p.platform === 'tiktok' ? '🎵' : p.platform === 'linkedin' ? '💼' : '🌐';
              const stats = [];
              if (p.followers) stats.push(`${p.followers.toLocaleString()} followers`);
              if (p.likes) stats.push(`${p.likes.toLocaleString()} likes`);
              if (p.posts) stats.push(`${p.posts.toLocaleString()} posts`);
              return [
                `${platformIcon} ${p.platform.toUpperCase()}`,
                `@${p.username}`,
                stats.join(', ') || '-'
              ];
            });
            
            pdf.autoTable({
              startY: yPos,
              head: [['Platform', 'Username', 'Statistik']],
              body: profilesData,
              theme: 'grid',
              margin: { left: margin },
              styles: { fontSize: 8, cellPadding: 2 },
              headStyles: { fillColor: [245, 158, 11], textColor: [255, 255, 255] },
              columnStyles: {
                0: { cellWidth: 35 },
                1: { cellWidth: 50 },
                2: { cellWidth: 70 }
              }
            });
            yPos = pdf.lastAutoTable.finalY + 5;
          }
          
          // AI Analysis
          if (snaData.analysis) {
            addSubsectionHeader('Analisis AI');
            const cleanedAnalysis = cleanPdfText(snaData.analysis);
            const analysisLines = pdf.splitTextToSize(cleanedAnalysis, contentWidth - 10);
            pdf.setFontSize(9);
            pdf.setTextColor(...colors.text);
            analysisLines.forEach(line => {
              checkPageBreak(6);
              pdf.text(line, margin + 5, yPos);
              yPos += 5;
            });
            yPos += 5;
          }
        }
        
        yPos += 10;
      });
    }
    
    // ============ FOOTER ============
    const totalPages = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      
      // Footer line
      pdf.setDrawColor(...colors.lightGray);
      pdf.line(margin, pageHeight + 5, pageWidth - margin, pageHeight + 5);
      
      // Footer text
      pdf.setFontSize(7);
      pdf.setTextColor(150, 150, 150);
      pdf.text('Dokumen ini digenerate oleh NETRA System', margin, pageHeight + 10);
      pdf.text(`Halaman ${i} dari ${totalPages}`, pageWidth - margin - 20, pageHeight + 10);
    }
    
    // Save PDF
    const fileName = `Investigasi_${searchResults?.name?.replace(/\s+/g, '_') || 'Report'}_${new Date().toISOString().split('T')[0]}.pdf`;
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
      case 'processing_passport':
      case 'processing_perlintasan':
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
      default:
        return <Search className="w-4 h-4" />;
    }
  };

  const getQueryLabel = (queryType) => {
    switch (queryType) {
      case 'capil':
        return 'CAPIL (Dukcapil)';
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
    const hasPassportData = nikData.passport_data && (nikData.passport_data.passports || nikData.passport_data.wni_data || nikData.passport_data.status === 'completed' || nikData.passport_data.status === 'no_data');
    const hasPerlintasanData = nikData.perlintasan_data && (nikData.perlintasan_data.results || nikData.perlintasan_data.status === 'completed' || nikData.perlintasan_data.status === 'no_passport');
    
    return hasNikData || hasNkkData || hasRegnikData || hasPassportData || hasPerlintasanData;
  };

  // Get sub-query status for display
  const getSubQueryStatus = (nikData, queryType) => {
    const data = nikData?.[queryType];
    if (!data) return 'pending';
    
    // If status exists, use it
    if (data.status) return data.status;
    
    // If data or raw_text exists but no status, consider it completed
    if (data.data || data.raw_text || data.photo || data.phones || data.passports || data.results) {
      return 'completed';
    }
    
    return 'pending';
  };

  // Determine current step
  const getCurrentStep = () => {
    // PRIORITY 0: Show loading when loading from history (prevents form flash)
    if (isLoadingFromHistory) return 'loading';
    
    if (isSearching) return 'searching';
    if (!searchResults) return 'input';
    // Show searching while fetching photos
    if (searchResults.status === 'fetching_photos') return 'searching';
    if (searchResults.status !== 'completed' && searchResults.status !== 'waiting_selection') return 'searching';
    
    // SPECIAL CASE: For 'waiting_selection' status, ALWAYS show photo selection
    // This is critical for reopening from history where user hasn't selected yet
    if (searchResults.status === 'waiting_selection') {
      if (searchResults.nik_photos && Object.keys(searchResults.nik_photos).length > 0) {
        return 'select_person';
      }
      if (personsFound.length >= 1) {
        return 'select_person';
      }
      // If no photos yet for waiting_selection, show searching
      return 'searching';
    }
    
    // PRIORITY 1: If investigation exists AND is completed (from history), show investigation results
    if (investigation && investigation.status === 'completed') {
      return 'investigation';
    }
    
    // PRIORITY 2: If currently investigating, show investigation step
    if (isInvestigating) {
      return 'investigation';
    }
    
    // PRIORITY 3: Show person selection if we have nik_photos AND showPersonSelection is true
    // ALWAYS show photo selection even if only 1 NIK (for verification)
    if (searchResults.nik_photos && Object.keys(searchResults.nik_photos).length > 0) {
      // Only show person selection if showPersonSelection is true
      if (showPersonSelection) {
        return 'select_person';
      }
      // If person selection is done (showPersonSelection=false) but not investigating yet,
      // this means user hasn't clicked "Mulai Pendalaman" - keep showing person selection
      // OR skip to investigation if isInvestigating
      // Since isInvestigating is checked above, if we reach here, show person selection again
      return 'select_person';
    }
    
    // Legacy: show person selection from CAPIL extraction (even for 1 person for verification)
    if (personsFound.length >= 1) return 'select_person';
    
    // If we have NIKs found but no photos, show NIK selection as fallback
    if (searchResults.niks_found?.length > 0 && !searchResults.nik_photos) return 'select_nik';
    
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
              PROSES {isSearching ? 'PENCARIAN' : 'PENDALAMAN'} AKAN DILAKUKAN DI BACKGROUND
            </p>
            <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
              Sementara Anda <strong className="text-red-500">TIDAK DAPAT</strong> melakukan {isSearching ? 'pencarian' : 'pendalaman'} lain sampai proses ini selesai.
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
            backgroundColor: (isSearching || isInvestigating) ? '#ef4444' : 'var(--accent-primary)',
            color: 'white',
            animation: (isSearching || isInvestigating) ? 'pulse 2s infinite' : 'none'
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
            {isSearching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm font-semibold">Pencarian Berjalan...</span>
              </>
            ) : isInvestigating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm font-semibold">Pendalaman Berjalan...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span className="text-sm font-semibold">Query Nama</span>
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
          className="flex flex-col p-0"
          style={{ 
            backgroundColor: 'var(--background-elevated)',
            border: '1px solid var(--borders-default)',
            borderRadius: '8px',
            overflow: 'hidden',
            width: '550px',
            maxWidth: '95vw',
            height: 'auto',
            maxHeight: '85vh'
          }}
        >
          {/* Header with drag handle */}
          <div 
            className="cursor-move flex items-center justify-between px-3 py-2 flex-shrink-0"
            style={{ 
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              borderBottom: '1px solid var(--borders-default)'
            }}
          >
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4" style={{ color: 'var(--accent-secondary)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--foreground-primary)' }}>
                FULL QUERY
              </span>
              {isInvestigating && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-500 text-white animate-pulse">
                  PROCESSING
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded hover:bg-white/10"
                onClick={() => handleMinimizeOrClose('minimize')}
                title="Minimize"
              >
                <Minus className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded hover:bg-red-500/20"
                onClick={() => handleMinimizeOrClose('close')}
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto p-3" style={{ minHeight: 0 }}>
            {/* Search Input */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Masukkan nama lengkap (hanya huruf a-z)..."
                    value={searchName}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSearchName(value);
                      
                      // Real-time validation
                      if (value.trim() && !/^[a-zA-Z\s]*$/.test(value)) {
                        setNameValidationError('Full Query hanya untuk nama berbasis alphabet (a-z)');
                      } else {
                        setNameValidationError('');
                      }
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && !isSearching && !nameValidationError && startSearch()}
                    disabled={isSearching || isInvestigating}
                    className="h-9"
                    style={{
                      backgroundColor: 'var(--background-tertiary)',
                      borderColor: nameValidationError ? 'var(--status-error)' : 'var(--borders-default)',
                      color: 'var(--foreground-primary)'
                    }}
                  />
                  {nameValidationError && (
                    <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--status-error)' }}>
                      <AlertTriangle className="w-3 h-3" />
                      {nameValidationError}
                    </p>
                  )}
                </div>
              <Button
                onClick={startSearch}
                disabled={isSearching || isInvestigating || !searchName.trim() || !!nameValidationError}
                className="h-9 px-4"
                style={{
                  backgroundColor: nameValidationError ? 'var(--foreground-muted)' : 'var(--accent-primary)',
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
              Pencarian: CAPIL → Pendalaman NIK (NIK, NKK, RegNIK, Passport, Perlintasan)
            </p>
          </div>

          {/* Loading from History indicator */}
          {currentStep === 'loading' && (
            <div className="mt-4 flex flex-col items-center justify-center py-4">
              <Loader2 className="w-6 h-6 animate-spin mb-2" style={{ color: 'var(--accent-primary)' }} />
              <p className="text-sm" style={{ color: 'var(--foreground-primary)' }}>
                Memuat data dari history...
              </p>
            </div>
          )}

          {/* Search Progress / Results */}
          {(isSearching || searchResults) && (
            <div className="mt-4 space-y-3">
              
              {/* Blinking Warning Message during Search & Photo Fetch */}
              {(isSearching || searchResults?.status === 'fetching_photos') && (
                <div 
                  className="p-3 rounded-md border-2 text-center"
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
                    ⚠️ PROSES PENCARIAN SEDANG BERJALAN
                  </p>
                </div>
              )}

              <h3 
                className="text-sm font-semibold"
                style={{ color: 'var(--foreground-secondary)' }}
              >
                {isSearching ? 'Proses Pencarian...' : 'Hasil Pencarian Awal'}
              </h3>

              {/* Query Status - Only CAPIL */}
              <div className="space-y-2">
                {['capil'].map(queryType => {
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
                      
                      {/* Show NIKs found */}
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
                      Pilih Target ({photosFetched} dari {totalNiks} ditampilkan)
                    </h3>
                  </div>
                  
                  {/* Pagination Info Banner - Only show if there are more photos to load */}
                  {hasMoreBatches && (totalNiks - photosFetched > 0) && (
                    <div 
                      className="mb-3 p-3 rounded-md border"
                      style={{
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderColor: '#3b82f6'
                      }}
                    >
                      <p className="text-sm font-semibold" style={{ color: '#3b82f6' }}>
                        ℹ️ Target memiliki {totalNiks} nama yang mirip
                      </p>
                      <p className="text-xs mt-1" style={{ color: '#60a5fa' }}>
                        Saat ini ditampilkan {photosFetched} foto. Jika target tidak ditemukan, klik &quot;Muat Lebih Banyak&quot; untuk melihat kandidat lainnya.
                      </p>
                    </div>
                  )}

                  {/* Cache Info */}
                  {cachedSearch && (
                    <div 
                      className="mb-3 p-2 rounded-md text-xs"
                      style={{
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        color: '#22c55e'
                      }}
                    >
                      ✓ Data dimuat dari cache (pencarian sebelumnya)
                    </div>
                  )}
                  
                  <p className="text-xs mb-3" style={{ color: 'var(--foreground-muted)' }}>
                    Pilih target berdasarkan foto dan NIK untuk melanjutkan pendalaman.
                  </p>

                  {/* Vertical scrollable grid for photos - 2 columns */}
                  <div 
                    className="grid grid-cols-2 gap-3 overflow-y-auto pr-2"
                    style={{ 
                      maxHeight: '55vh',
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
                    
                    {/* Load More Card - Only show if there are actually more photos to load */}
                    {hasMoreBatches && (totalNiks - photosFetched > 0) && (
                      <div 
                        className="p-3 rounded-md border-2 border-dashed flex flex-col items-center justify-center cursor-pointer hover:opacity-80 transition-all"
                        onClick={handleLoadMorePhotos}
                        style={{
                          minHeight: '180px',
                          borderColor: isLoadingMorePhotos ? '#f59e0b' : '#3b82f6',
                          backgroundColor: isLoadingMorePhotos ? 'rgba(245, 158, 11, 0.1)' : 'rgba(59, 130, 246, 0.1)'
                        }}
                      >
                        {isLoadingMorePhotos ? (
                          <>
                            <Loader2 className="w-8 h-8 animate-spin mb-2" style={{ color: '#f59e0b' }} />
                            <span className="text-xs font-semibold text-center" style={{ color: '#f59e0b' }}>
                              Memuat Foto {photosFetched + 1}-{Math.min(photosFetched + 10, totalNiks)}...
                            </span>
                            <span className="text-xs text-center mt-1" style={{ color: '#fbbf24' }}>
                              dari {totalNiks} total
                            </span>
                          </>
                        ) : (
                          <>
                            <div 
                              className="w-12 h-12 rounded-full flex items-center justify-center mb-2"
                              style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}
                            >
                              <span style={{ color: '#3b82f6', fontSize: '24px' }}>+</span>
                            </div>
                            <span className="text-xs font-semibold text-center" style={{ color: '#3b82f6' }}>
                              Muat Foto {photosFetched + 1}-{Math.min(photosFetched + 10, totalNiks)}
                            </span>
                            <span className="text-xs text-center mt-1" style={{ color: '#60a5fa' }}>
                              ({totalNiks - photosFetched} tersisa)
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-4" style={{ position: 'relative', zIndex: 20 }}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('[NonGeoint] Lanjutkan button clicked! selectedPersonIndex:', selectedPersonIndex);
                        if (selectedPersonIndex !== null) {
                          confirmPersonSelection();
                        } else {
                          toast.error('Pilih target terlebih dahulu dengan klik pada foto');
                        }
                      }}
                      disabled={selectedPersonIndex === null}
                      className="w-full py-3 px-4 rounded-md font-semibold transition-all hover:opacity-90 active:scale-95"
                      style={{
                        backgroundColor: selectedPersonIndex === null ? '#6b7280' : 'var(--accent-primary)',
                        color: 'white',
                        opacity: selectedPersonIndex === null ? 0.6 : 1,
                        cursor: selectedPersonIndex === null ? 'not-allowed' : 'pointer',
                        pointerEvents: 'auto',
                        position: 'relative',
                        zIndex: 25
                      }}
                    >
                      {selectedPersonIndex === null 
                        ? '👆 Klik Foto Untuk Memilih Target' 
                        : '🔍 Mulai Pendalaman Target Terpilih'}
                    </button>
                    
                    {/* Selection status */}
                    <p className="text-xs mt-2 text-center" style={{ color: 'var(--foreground-muted)' }}>
                      {selectedPersonIndex === null 
                        ? `Belum ada target dipilih (${photosFetched}/${totalNiks} foto dimuat)` 
                        : `Target: ${personsFound[selectedPersonIndex]?.nama || personsFound[selectedPersonIndex]?.name || 'Unknown'} - NIK: ${personsFound[selectedPersonIndex]?.nik}`}
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
                      // Determine NIK status - if investigation is completed and this NIK has data, consider it completed
                      let nikStatus = nikData?.status || 'processing';
                      if (investigation?.status === 'completed' && nikData) {
                        nikStatus = 'completed';
                      }
                      
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
                                onClick={() => {
                                  // Merge nik_photos data with investigation results
                                  const nikPhotoData = searchResults?.nik_photos?.[nik];
                                  const mergedResult = {
                                    ...nikData,
                                    nik_data: {
                                      ...nikData?.nik_data,
                                      // Add photo from nik_photos if not already present
                                      photo: nikData?.nik_data?.photo || nikPhotoData?.photo
                                    }
                                  };
                                  setDetailDialog({ 
                                    open: true, 
                                    type: 'nik_combined', 
                                    result: mergedResult, 
                                    nik: nik 
                                  });
                                }}
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
                            <span className="flex items-center gap-1">
                              {getStatusIcon(getSubQueryStatus(nikData, 'passport_data'))}
                              🛂
                            </span>
                            <span className="flex items-center gap-1">
                              {getStatusIcon(getSubQueryStatus(nikData, 'perlintasan_data'))}
                              ✈️
                            </span>
                            {/* FAKTA OSINT indicator */}
                            <span 
                              className="flex items-center gap-1 cursor-pointer hover:opacity-80"
                              onClick={() => {
                                const osintStatus = getOsintStatus(nik);
                                if (osintStatus === 'completed') {
                                  // Show OSINT details
                                  setOsintDetailDialog({
                                    open: true,
                                    nik: nik,
                                    data: osintResults[nik] || investigation?.osint_results?.[nik]
                                  });
                                }
                              }}
                              title={getOsintStatus(nik) === 'completed' ? 'Lihat hasil FAKTA OSINT' : 'FAKTA OSINT belum dijalankan'}
                            >
                              {getOsintStatus(nik) === 'processing' ? (
                                <Loader2 className="w-3 h-3 animate-spin" style={{ color: '#3b82f6' }} />
                              ) : getOsintStatus(nik) === 'completed' ? (
                                <div className="relative">
                                  <Globe className="w-3 h-3" style={{ color: '#3b82f6' }} />
                                  <CheckCircle 
                                    className="w-2 h-2 absolute -bottom-0.5 -right-0.5" 
                                    style={{ color: '#22c55e' }} 
                                  />
                                </div>
                              ) : (
                                <Globe className="w-3 h-3 opacity-40" style={{ color: 'var(--foreground-muted)' }} />
                              )}
                              <span className={getOsintStatus(nik) === 'completed' ? 'text-blue-400' : ''}>
                                OSINT
                              </span>
                            </span>
                            
                            {/* SNA (Social Network Analytics) indicator */}
                            <span 
                              className="flex items-center gap-1 cursor-pointer hover:opacity-80"
                              onClick={() => {
                                const snaStatus = getSnaStatus(nik);
                                if (snaStatus === 'completed') {
                                  // Show SNA details
                                  setSnaDetailDialog({
                                    open: true,
                                    nik: nik,
                                    data: getSnaData(nik)
                                  });
                                }
                              }}
                              title={getSnaStatus(nik) === 'completed' ? 'Lihat hasil SNA' : 'SNA belum dijalankan'}
                            >
                              {getSnaStatus(nik) === 'processing' ? (
                                <Loader2 className="w-3 h-3 animate-spin" style={{ color: '#f59e0b' }} />
                              ) : getSnaStatus(nik) === 'completed' ? (
                                <div className="relative">
                                  <Network className="w-3 h-3" style={{ color: '#f59e0b' }} />
                                  <CheckCircle 
                                    className="w-2 h-2 absolute -bottom-0.5 -right-0.5" 
                                    style={{ color: '#22c55e' }} 
                                  />
                                </div>
                              ) : (
                                <Network className="w-3 h-3 opacity-40" style={{ color: 'var(--foreground-muted)' }} />
                              )}
                              <span className={getSnaStatus(nik) === 'completed' ? 'text-amber-400' : ''}>
                                SNA
                              </span>
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

              {/* PENDALAMAN LANJUTAN Button - Show when investigation completed */}
              {investigation?.status === 'completed' && (
                <div className="mt-4 relative">
                  <Button
                    onClick={() => setShowAdvancedDropdown(!showAdvancedDropdown)}
                    className="w-full"
                    data-testid="pendalaman-lanjutan-btn"
                    style={{
                      background: 'linear-gradient(145deg, #8b5cf6, #7c3aed)',
                      color: '#fff',
                      boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)'
                    }}
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    PENDALAMAN LANJUTAN
                    {showAdvancedDropdown ? (
                      <ChevronUp className="w-4 h-4 ml-2" />
                    ) : (
                      <ChevronDown className="w-4 h-4 ml-2" />
                    )}
                  </Button>
                  
                  {/* Dropdown Menu */}
                  {showAdvancedDropdown && (
                    <div 
                      className="absolute top-full left-0 right-0 mt-2 rounded-md border shadow-lg z-50 overflow-hidden"
                      style={{
                        backgroundColor: 'var(--background-elevated)',
                        borderColor: 'var(--borders-default)'
                      }}
                    >
                      {/* FAKTA OSINT */}
                      <button
                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-opacity-50 transition-colors text-left"
                        style={{ 
                          backgroundColor: 'transparent',
                          borderBottom: '1px solid var(--borders-subtle)'
                        }}
                        onClick={() => {
                          // Get selected NIK and name
                          if (selectedNiks.length > 0) {
                            const nik = selectedNiks[0];
                            const nikData = investigation?.results?.[nik];
                            const name = nikData?.nik_data?.data?.['Full Name'] || 
                                        nikData?.nik_data?.data?.['Nama'] ||
                                        searchResults?.name || '';
                            
                            if (name) {
                              startFaktaOsint(nik, name);
                              setShowAdvancedDropdown(false);
                            } else {
                              toast.error('Nama target tidak ditemukan');
                            }
                          } else {
                            toast.error('Tidak ada NIK yang dipilih');
                          }
                        }}
                        disabled={isLoadingOsint[selectedNiks[0]]}
                        data-testid="fakta-osint-btn"
                      >
                        <div 
                          className="w-8 h-8 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}
                        >
                          {isLoadingOsint[selectedNiks[0]] ? (
                            <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#3b82f6' }} />
                          ) : getOsintStatus(selectedNiks[0]) === 'completed' ? (
                            <div className="relative">
                              <Globe className="w-4 h-4" style={{ color: '#3b82f6' }} />
                              <CheckCircle className="w-2.5 h-2.5 absolute -bottom-0.5 -right-0.5" style={{ color: '#22c55e' }} />
                            </div>
                          ) : (
                            <Globe className="w-4 h-4" style={{ color: '#3b82f6' }} />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-sm" style={{ color: 'var(--foreground-primary)' }}>
                            FAKTA OSINT
                          </p>
                          <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                            {isLoadingOsint[selectedNiks[0]] ? 'Sedang mencari...' : 
                             getOsintStatus(selectedNiks[0]) === 'completed' ? 'Lihat hasil OSINT' :
                             'Pencarian informasi terbuka'}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 ml-auto" style={{ color: 'var(--foreground-muted)' }} />
                      </button>
                      
                      {/* CALL DATA RECORDER */}
                      <button
                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-opacity-50 transition-colors text-left"
                        style={{ 
                          backgroundColor: 'transparent',
                          borderBottom: '1px solid var(--borders-subtle)'
                        }}
                        onClick={() => {
                          toast.info('Fitur CALL DATA RECORDER akan segera hadir');
                          setShowAdvancedDropdown(false);
                        }}
                        data-testid="call-data-recorder-btn"
                      >
                        <div 
                          className="w-8 h-8 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)' }}
                        >
                          <Phone className="w-4 h-4" style={{ color: '#10b981' }} />
                        </div>
                        <div>
                          <p className="font-semibold text-sm" style={{ color: 'var(--foreground-primary)' }}>
                            CALL DATA RECORDER
                          </p>
                          <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                            Analisis data panggilan
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 ml-auto" style={{ color: 'var(--foreground-muted)' }} />
                      </button>
                      
                      {/* SOCIAL NETWORK ANALYTICS */}
                      <button
                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-opacity-50 transition-colors text-left"
                        style={{ backgroundColor: 'transparent' }}
                        onClick={() => {
                          // Get selected NIK and name
                          if (selectedNiks.length > 0) {
                            const nik = selectedNiks[0];
                            const nikData = investigation?.results?.[nik];
                            const name = nikData?.nik_data?.data?.['Full Name'] || 
                                        nikData?.nik_data?.data?.['Nama'] ||
                                        searchResults?.name || '';
                            
                            if (name) {
                              const snaStatus = getSnaStatus(nik);
                              if (snaStatus === 'completed') {
                                // Show SNA results
                                setSnaDetailDialog({
                                  open: true,
                                  nik: nik,
                                  data: getSnaData(nik)
                                });
                              } else {
                                // Open input dialog for manual links
                                openSnaInputDialog(nik, name);
                              }
                              setShowAdvancedDropdown(false);
                            } else {
                              toast.error('Nama target tidak ditemukan');
                            }
                          } else {
                            toast.error('Tidak ada NIK yang dipilih');
                          }
                        }}
                        disabled={isLoadingSna[selectedNiks[0]]}
                        data-testid="social-network-analytics-btn"
                      >
                        <div 
                          className="w-8 h-8 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: 'rgba(245, 158, 11, 0.2)' }}
                        >
                          {isLoadingSna[selectedNiks[0]] ? (
                            <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#f59e0b' }} />
                          ) : getSnaStatus(selectedNiks[0]) === 'completed' ? (
                            <div className="relative">
                              <Network className="w-4 h-4" style={{ color: '#f59e0b' }} />
                              <CheckCircle className="w-2.5 h-2.5 absolute -bottom-0.5 -right-0.5" style={{ color: '#22c55e' }} />
                            </div>
                          ) : (
                            <Network className="w-4 h-4" style={{ color: '#f59e0b' }} />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-sm" style={{ color: 'var(--foreground-primary)' }}>
                            SOCIAL NETWORK ANALYTICS
                          </p>
                          <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                            {isLoadingSna[selectedNiks[0]] ? 'Sedang menganalisis...' : 
                             getSnaStatus(selectedNiks[0]) === 'completed' ? 'Lihat hasil SNA' :
                             'Analisis jaringan sosial'}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 ml-auto" style={{ color: 'var(--foreground-muted)' }} />
                      </button>
                    </div>
                  )}
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
          </div>
        </DraggableDialogContent>
      </DraggableDialog>

      {/* Combined NIK Result Detail Dialog */}
      {detailDialog.type === 'nik_combined' ? (
        <DraggableDialog open={detailDialog.open} onOpenChange={() => setDetailDialog({ open: false, type: null, result: null, nik: null })}>
          <DraggableDialogContent 
            className="flex flex-col"
            style={{ 
              backgroundColor: 'var(--background-elevated)',
              border: '1px solid var(--borders-default)',
              zIndex: 9999,
              width: '700px',
              maxWidth: '95vw',
              height: '80vh',
              maxHeight: '85vh'
            }}
          >
            <DraggableDialogHeader className="flex-shrink-0">
              <DraggableDialogTitle style={{ color: 'var(--foreground-primary)' }}>
                Hasil Pendalaman NIK: <span className="font-mono">{detailDialog.nik}</span>
              </DraggableDialogTitle>
            </DraggableDialogHeader>
            
            <div className="flex-1 overflow-y-auto mt-4 space-y-6 pr-2" style={{ minHeight: 0 }}>
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
                          <div key={key} className="flex flex-wrap">
                            <span className="font-medium w-28 flex-shrink-0" style={{ color: 'var(--foreground-muted)' }}>{key}:</span>
                            <span className="flex-1 break-words" style={{ color: 'var(--foreground-primary)', wordBreak: 'break-word', minWidth: 0 }}>{String(value)}</span>
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
                    {/* Show family members table if available - FILTERED: only show members with NIK and name, remove duplicates */}
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
                              {/* Filter: must have NIK AND name (check multiple name fields), remove duplicates */}
                              {detailDialog.result.nkk_data.family_data.members
                                .map(member => ({
                                  ...member,
                                  displayName: member.name || member.nama || member.full_name || member.fullName || ''
                                }))
                                .filter(member => 
                                  member.nik && 
                                  member.displayName && 
                                  member.displayName !== '-' &&
                                  member.displayName.trim() !== ''
                                )
                                .filter((member, index, self) => 
                                  self.findIndex(m => m.nik === member.nik && m.displayName === member.displayName) === index
                                )
                                .map((member, idx) => (
                                <tr 
                                  key={idx}
                                  style={{ 
                                    backgroundColor: member.nik === detailDialog.nik ? 'rgba(255, 59, 92, 0.15)' : 'transparent'
                                  }}
                                >
                                  <td className="py-1.5 px-2 border" style={{ borderColor: 'var(--borders-subtle)', color: 'var(--foreground-muted)' }}>{idx + 1}</td>
                                  <td className="py-1.5 px-2 border font-mono" style={{ borderColor: 'var(--borders-subtle)', color: 'var(--foreground-primary)' }}>{member.nik || '-'}</td>
                                  <td className="py-1.5 px-2 border" style={{ borderColor: 'var(--borders-subtle)', color: 'var(--foreground-primary)' }}>{member.displayName || '-'}</td>
                                  <td className="py-1.5 px-2 border" style={{ borderColor: 'var(--borders-subtle)', color: 'var(--foreground-muted)' }}>{member.relationship || member.hubungan || member.shdk || '-'}</td>
                                  <td className="py-1.5 px-2 border" style={{ borderColor: 'var(--borders-subtle)', color: 'var(--foreground-muted)' }}>{member.gender || member.jk || member.jenis_kelamin || '-'}</td>
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
                          <div key={key} className="flex flex-wrap">
                            <span className="font-medium w-28 flex-shrink-0" style={{ color: 'var(--foreground-muted)' }}>{key}:</span>
                            <span className="flex-1 break-words" style={{ color: 'var(--foreground-primary)', wordBreak: 'break-word', minWidth: 0 }}>{String(value)}</span>
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
                          <div key={key} className="flex flex-wrap">
                            <span className="font-medium w-28 flex-shrink-0" style={{ color: 'var(--foreground-muted)' }}>{key}:</span>
                            <span className="flex-1 break-words" style={{ color: 'var(--foreground-primary)', wordBreak: 'break-word', minWidth: 0 }}>
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

              {/* Passport Data Section */}
              {detailDialog.result?.passport_data && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm" style={{ color: 'var(--foreground-muted)' }}>🛂</span>
                    <span className="font-semibold text-sm uppercase" style={{ color: 'var(--foreground-primary)' }}>
                      DATA PASSPORT
                    </span>
                    {getStatusIcon(detailDialog.result.passport_data.status)}
                  </div>
                  <div className="p-3 rounded-md" style={{ backgroundColor: 'var(--background-tertiary)' }}>
                    {detailDialog.result.passport_data.passports && detailDialog.result.passport_data.passports.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold" style={{ color: 'var(--accent-primary)' }}>
                          Ditemukan {detailDialog.result.passport_data.passports.length} passport:
                        </p>
                        <div className="space-y-1">
                          {detailDialog.result.passport_data.passports.map((passport, idx) => (
                            <div 
                              key={idx}
                              className="flex items-center gap-2 p-2 rounded"
                              style={{ backgroundColor: 'var(--background-secondary)' }}
                            >
                              <span className="text-xs">🛂</span>
                              <span className="font-mono text-sm" style={{ color: 'var(--accent-primary)' }}>
                                {passport}
                              </span>
                            </div>
                          ))}
                        </div>
                        
                        {/* WNI Data - handle both 'result' and 'data' arrays */}
                        {(detailDialog.result.passport_data.wni_data?.result || detailDialog.result.passport_data.wni_data?.data) && (
                          <div className="mt-3 pt-2 border-t" style={{ borderColor: 'var(--borders-subtle)' }}>
                            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--foreground-muted)' }}>
                              Detail Data Passport:
                            </p>
                            {(() => {
                              const wniArray = detailDialog.result.passport_data.wni_data?.result || detailDialog.result.passport_data.wni_data?.data || [];
                              return Array.isArray(wniArray) ? (
                                wniArray.slice(0, 5).map((item, idx) => (
                                  <div key={idx} className="text-xs space-y-1 mb-2 p-2 rounded" style={{ backgroundColor: 'var(--background-secondary)' }}>
                                    {(item.nama_lengkap || item.GIVENNAME) && (
                                      <p><span style={{ color: 'var(--foreground-muted)' }}>Nama:</span> <span style={{ color: 'var(--foreground-primary)' }}>{item.nama_lengkap || item.GIVENNAME}</span></p>
                                    )}
                                    {(item.no_paspor || item.TRAVELDOCUMENTNO) && (
                                      <p><span style={{ color: 'var(--foreground-muted)' }}>No Passport:</span> <span className="font-mono" style={{ color: 'var(--accent-primary)' }}>{item.no_paspor || item.TRAVELDOCUMENTNO}</span></p>
                                    )}
                                    {item.no_paspor_lama && (
                                      <p><span style={{ color: 'var(--foreground-muted)' }}>No Passport Lama:</span> <span className="font-mono" style={{ color: 'var(--foreground-muted)' }}>{item.no_paspor_lama}</span></p>
                                    )}
                                    {(item.tempat_lahir || item.PLACEOFBIRTH) && (
                                      <p><span style={{ color: 'var(--foreground-muted)' }}>Tempat Lahir:</span> <span style={{ color: 'var(--foreground-primary)' }}>{item.tempat_lahir || item.PLACEOFBIRTH}</span></p>
                                    )}
                                    {(item.tanggal_lahir || item.DATEOFBIRTH) && (
                                      <p><span style={{ color: 'var(--foreground-muted)' }}>Tgl Lahir:</span> <span style={{ color: 'var(--foreground-primary)' }}>{item.tanggal_lahir || item.DATEOFBIRTH}</span></p>
                                    )}
                                    {item.alamat && (
                                      <p className="break-words"><span style={{ color: 'var(--foreground-muted)' }}>Alamat:</span> <span style={{ color: 'var(--foreground-primary)', wordBreak: 'break-word' }}>{item.alamat}</span></p>
                                    )}
                                    {item.pekerjaan && (
                                      <p><span style={{ color: 'var(--foreground-muted)' }}>Pekerjaan:</span> <span style={{ color: 'var(--foreground-primary)' }}>{item.pekerjaan}</span></p>
                                    )}
                                    {item.jenis_paspor && (
                                      <p><span style={{ color: 'var(--foreground-muted)' }}>Jenis Paspor:</span> <span style={{ color: 'var(--foreground-primary)' }}>{item.jenis_paspor}</span></p>
                                    )}
                                    {item.kantor_penerbit && (
                                      <p><span style={{ color: 'var(--foreground-muted)' }}>Kantor Penerbit:</span> <span style={{ color: 'var(--foreground-primary)' }}>{item.kantor_penerbit}</span></p>
                                    )}
                                    {item.tanggal_diterbitkan_paspor && (
                                      <p><span style={{ color: 'var(--foreground-muted)' }}>Tgl Terbit:</span> <span style={{ color: 'var(--foreground-primary)' }}>{item.tanggal_diterbitkan_paspor}</span></p>
                                    )}
                                    {item.tanggal_habis_berlaku_paspor && (
                                      <p><span style={{ color: 'var(--foreground-muted)' }}>Berlaku s/d:</span> <span style={{ color: 'var(--foreground-primary)' }}>{item.tanggal_habis_berlaku_paspor}</span></p>
                                    )}
                                    {item.status_paspor && (
                                      <p><span style={{ color: 'var(--foreground-muted)' }}>Status:</span> <span className={item.status_paspor === 'TERUJI' ? 'text-green-400' : ''} style={{ color: item.status_paspor === 'TERUJI' ? undefined : 'var(--foreground-primary)' }}>{item.status_paspor}</span></p>
                                    )}
                                    {item.email && (
                                      <p><span style={{ color: 'var(--foreground-muted)' }}>Email:</span> <span style={{ color: 'var(--foreground-primary)' }}>{item.email}</span></p>
                                    )}
                                    {item.no_hp && (
                                      <p><span style={{ color: 'var(--foreground-muted)' }}>No HP:</span> <span style={{ color: 'var(--foreground-primary)' }}>{item.no_hp}</span></p>
                                    )}
                                  </div>
                                ))
                              ) : null;
                            })()}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                        {detailDialog.result.passport_data.status === 'no_data' ? 'Tidak ditemukan data passport' : `Status: ${detailDialog.result.passport_data.status}`}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Perlintasan (Immigration Crossing) Data Section */}
              {detailDialog.result?.perlintasan_data && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm" style={{ color: 'var(--foreground-muted)' }}>✈️</span>
                    <span className="font-semibold text-sm uppercase" style={{ color: 'var(--foreground-primary)' }}>
                      DATA PERLINTASAN IMIGRASI
                    </span>
                    {getStatusIcon(detailDialog.result.perlintasan_data.status)}
                  </div>
                  <div className="p-3 rounded-md" style={{ backgroundColor: 'var(--background-tertiary)' }}>
                    {detailDialog.result.perlintasan_data.results && detailDialog.result.perlintasan_data.results.length > 0 ? (
                      <div className="space-y-3">
                        {detailDialog.result.perlintasan_data.results.map((passportResult, pIdx) => {
                          // Sort crossings: oldest first, then departure (D) before arrival (A)
                          const sortedCrossings = passportResult.crossings ? [...passportResult.crossings].sort((a, b) => {
                            // First sort by date (oldest first)
                            const dateA = new Date(a.movement_date);
                            const dateB = new Date(b.movement_date);
                            if (dateA.getTime() !== dateB.getTime()) {
                              return dateA - dateB; // Oldest first
                            }
                            // If same date, departure (D) comes before arrival (A)
                            if (a.direction_code === 'D' && b.direction_code === 'A') return -1;
                            if (a.direction_code === 'A' && b.direction_code === 'D') return 1;
                            return 0;
                          }) : [];
                          
                          return (
                            <div key={pIdx}>
                            {sortedCrossings.length > 0 ? (
                              <div>
                                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--accent-primary)' }}>
                                  Passport {passportResult.passport_no}: {sortedCrossings.length} perjalanan
                                </p>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs border-collapse">
                                    <thead>
                                      <tr style={{ backgroundColor: 'var(--background-secondary)' }}>
                                        <th className="py-1.5 px-2 text-left border" style={{ borderColor: 'var(--borders-subtle)', color: 'var(--foreground-muted)' }}>No</th>
                                        <th className="py-1.5 px-2 text-left border" style={{ borderColor: 'var(--borders-subtle)', color: 'var(--foreground-muted)' }}>Tanggal</th>
                                        <th className="py-1.5 px-2 text-left border" style={{ borderColor: 'var(--borders-subtle)', color: 'var(--foreground-muted)' }}>Arah</th>
                                        <th className="py-1.5 px-2 text-left border" style={{ borderColor: 'var(--borders-subtle)', color: 'var(--foreground-muted)' }}>TPI</th>
                                        <th className="py-1.5 px-2 text-left border" style={{ borderColor: 'var(--borders-subtle)', color: 'var(--foreground-muted)' }}>Tujuan/Asal</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {sortedCrossings.map((crossing, cIdx) => (
                                        <tr key={cIdx}>
                                          <td className="py-1.5 px-2 border text-center" style={{ borderColor: 'var(--borders-subtle)', color: 'var(--foreground-muted)' }}>
                                            {cIdx + 1}
                                          </td>
                                          <td className="py-1.5 px-2 border" style={{ borderColor: 'var(--borders-subtle)', color: 'var(--foreground-primary)' }}>
                                            {crossing.movement_date}
                                          </td>
                                          <td className="py-1.5 px-2 border" style={{ borderColor: 'var(--borders-subtle)' }}>
                                            <span 
                                              className="px-1.5 py-0.5 rounded text-xs font-semibold"
                                              style={{ 
                                                backgroundColor: crossing.direction_code === 'A' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                                color: crossing.direction_code === 'A' ? '#10b981' : '#ef4444'
                                              }}
                                            >
                                              {crossing.direction_code === 'A' ? '🛬 MASUK' : '🛫 KELUAR'}
                                            </span>
                                          </td>
                                          <td className="py-1.5 px-2 border" style={{ borderColor: 'var(--borders-subtle)', color: 'var(--foreground-primary)' }}>
                                            {crossing.tpi_name}
                                          </td>
                                          <td className="py-1.5 px-2 border" style={{ borderColor: 'var(--borders-subtle)', color: 'var(--foreground-muted)' }}>
                                            {crossing.port_description}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                                Passport {passportResult.passport_no}: {passportResult.message || 'Tidak ada data perlintasan'}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    ) : detailDialog.result.perlintasan_data.status === 'no_passport' ? (
                      <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                        Tidak ada passport untuk dicek perlintasannya
                      </p>
                    ) : (
                      <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                        Status: {detailDialog.result.perlintasan_data.status}
                      </p>
                    )}
                  </div>
                </div>
              )}
              
              {/* FAKTA OSINT Section in View Dialog */}
              {(() => {
                const osintData = osintResults[detailDialog.nik] || investigation?.osint_results?.[detailDialog.nik];
                if (!osintData) return null;
                
                return (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="relative">
                        <Globe className="w-4 h-4" style={{ color: '#3b82f6' }} />
                        <CheckCircle className="w-2.5 h-2.5 absolute -bottom-0.5 -right-0.5" style={{ color: '#22c55e' }} />
                      </div>
                      <span className="font-semibold text-sm uppercase" style={{ color: 'var(--foreground-primary)' }}>
                        FAKTA OSINT
                      </span>
                      <CheckCircle className="w-4 h-4" style={{ color: '#22c55e' }} />
                    </div>
                    <div className="p-3 rounded-md space-y-4" style={{ backgroundColor: 'var(--background-tertiary)' }}>
                      {/* AI Summary */}
                      {osintData.summary && (
                        <div>
                          <p className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: 'var(--accent-primary)' }}>
                            <Zap className="w-3 h-3" />
                            Ringkasan & Anteseden
                          </p>
                          <p className="text-xs whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--foreground-primary)' }}>
                            {cleanDisplayText(osintData.summary)}
                          </p>
                        </div>
                      )}
                      
                      {/* Social Media */}
                      {osintData.social_media?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--foreground-secondary)' }}>
                            📱 Media Sosial ({osintData.social_media.length})
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            {osintData.social_media.map((sm, idx) => (
                              <a
                                key={idx}
                                href={sm.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 rounded flex items-center gap-2 hover:opacity-80 transition-opacity"
                                style={{ backgroundColor: 'var(--background-secondary)' }}
                              >
                                <span className="text-sm">
                                  {sm.platform === 'facebook' && '📘'}
                                  {sm.platform === 'instagram' && '📷'}
                                  {sm.platform === 'twitter' && '🐦'}
                                  {sm.platform === 'youtube' && '▶️'}
                                  {sm.platform === 'tiktok' && '🎵'}
                                  {sm.platform === 'linkedin' && '💼'}
                                </span>
                                <div>
                                  <p className="text-xs font-medium capitalize" style={{ color: 'var(--foreground-primary)' }}>
                                    {sm.platform}
                                  </p>
                                  <p className="text-xs" style={{ color: 'var(--accent-primary)' }}>
                                    @{sm.username}
                                  </p>
                                </div>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Legal Cases */}
                      {osintData.legal_cases?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold mb-2" style={{ color: '#ef4444' }}>
                            ⚠️ Catatan Hukum ({osintData.legal_cases.length})
                          </p>
                          <div className="space-y-2">
                            {osintData.legal_cases.map((lc, idx) => (
                              <div
                                key={idx}
                                className="p-2 rounded border"
                                style={{ 
                                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                  borderColor: 'rgba(239, 68, 68, 0.3)'
                                }}
                              >
                                <p className="text-xs font-medium" style={{ color: 'var(--foreground-primary)' }}>
                                  {lc.source}
                                </p>
                                <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>
                                  {lc.note}
                                </p>
                                {lc.url && (
                                  <a
                                    href={lc.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs mt-1 inline-block hover:underline"
                                    style={{ color: 'var(--accent-primary)' }}
                                  >
                                    🔗 Lihat sumber
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Web Mentions */}
                      {osintData.web_mentions?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--foreground-secondary)' }}>
                            🌐 Temuan Web ({osintData.web_mentions.length})
                          </p>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {osintData.web_mentions.map((wm, idx) => (
                              <div
                                key={idx}
                                className="p-2 rounded text-xs"
                                style={{ backgroundColor: 'var(--background-secondary)' }}
                              >
                                <a
                                  href={wm.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium hover:underline line-clamp-2"
                                  style={{ color: 'var(--accent-primary)' }}
                                >
                                  {wm.title}
                                </a>
                                <p className="mt-1" style={{ color: 'var(--foreground-muted)' }}>
                                  {wm.snippet}
                                </p>
                                <p className="mt-1 text-xs break-all" style={{ color: 'var(--foreground-muted)' }}>
                                  {wm.url}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Family Cache Data in View Dialog */}
                      {osintData.family_cache?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--foreground-secondary)' }}>
                            👨‍👩‍👧‍👦 Data Keluarga dari Cache ({osintData.family_cache.length})
                          </p>
                          <div className="space-y-2">
                            {osintData.family_cache.map((fm, idx) => (
                              <div
                                key={idx}
                                className="p-2 rounded border text-xs"
                                style={{ 
                                  backgroundColor: 'var(--background-secondary)',
                                  borderColor: 'var(--borders-subtle)'
                                }}
                              >
                                <div className="flex items-center justify-between">
                                  <p className="font-medium" style={{ color: 'var(--foreground-primary)' }}>
                                    {fm.nama} <span className="opacity-60">({fm.hubungan})</span>
                                  </p>
                                  <div className="flex gap-1">
                                    {fm.has_investigation && (
                                      <span className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6' }}>NIK</span>
                                    )}
                                    {fm.has_osint && (
                                      <span className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' }}>OSINT</span>
                                    )}
                                  </div>
                                </div>
                                <p className="opacity-60 mt-1">NIK: {fm.nik}</p>
                                {fm.osint_data?.social_media?.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {fm.osint_data.social_media.slice(0, 3).map((sm, smIdx) => (
                                      <span key={smIdx} className="text-xs opacity-70">
                                        {sm.platform === 'facebook' && '📘'}
                                        {sm.platform === 'instagram' && '📷'}
                                        {sm.platform === 'linkedin' && '💼'}
                                        {sm.platform}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* No data message */}
                      {!osintData.summary && !osintData.social_media?.length && !osintData.legal_cases?.length && !osintData.web_mentions?.length && !osintData.family_cache?.length && (
                        <p className="text-xs text-center py-4" style={{ color: 'var(--foreground-muted)' }}>
                          Tidak ditemukan data OSINT
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}
              
              {/* ============ SNA SECTION IN VIEW ============ */}
              {(() => {
                const snaData = snaResults[detailDialog.nik] || investigation?.sna_results?.[detailDialog.nik];
                if (!snaData) return null;
                
                return (
                  <div 
                    className="p-4 rounded-lg mt-4"
                    style={{ backgroundColor: 'var(--background-tertiary)', border: '1px solid rgba(245, 158, 11, 0.3)' }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <Network className="w-4 h-4" style={{ color: '#f59e0b' }} />
                      <h4 className="font-semibold text-sm" style={{ color: '#f59e0b' }}>
                        SOCIAL NETWORK ANALYTICS
                      </h4>
                    </div>
                    
                    <div className="space-y-4 text-xs">
                      {/* Platform Statistics */}
                      {snaData.statistics && (
                        <div>
                          <p className="font-semibold mb-2" style={{ color: 'var(--foreground-secondary)' }}>
                            📊 Statistik Jaringan
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {snaData.statistics.total_followers > 0 && (
                              <div className="p-2 rounded text-center" style={{ backgroundColor: 'var(--background-secondary)' }}>
                                <p className="text-lg font-bold" style={{ color: '#3b82f6' }}>
                                  {snaData.statistics.total_followers?.toLocaleString() || 0}
                                </p>
                                <p style={{ color: 'var(--foreground-muted)' }}>Followers</p>
                              </div>
                            )}
                            {snaData.statistics.total_following > 0 && (
                              <div className="p-2 rounded text-center" style={{ backgroundColor: 'var(--background-secondary)' }}>
                                <p className="text-lg font-bold" style={{ color: '#10b981' }}>
                                  {snaData.statistics.total_following?.toLocaleString() || 0}
                                </p>
                                <p style={{ color: 'var(--foreground-muted)' }}>Following</p>
                              </div>
                            )}
                            {snaData.statistics.total_likes > 0 && (
                              <div className="p-2 rounded text-center" style={{ backgroundColor: 'var(--background-secondary)' }}>
                                <p className="text-lg font-bold" style={{ color: '#ef4444' }}>
                                  {snaData.statistics.total_likes?.toLocaleString() || 0}
                                </p>
                                <p style={{ color: 'var(--foreground-muted)' }}>Likes</p>
                              </div>
                            )}
                            {snaData.statistics.total_posts > 0 && (
                              <div className="p-2 rounded text-center" style={{ backgroundColor: 'var(--background-secondary)' }}>
                                <p className="text-lg font-bold" style={{ color: '#8b5cf6' }}>
                                  {snaData.statistics.total_posts?.toLocaleString() || 0}
                                </p>
                                <p style={{ color: 'var(--foreground-muted)' }}>Posts</p>
                              </div>
                            )}
                            {snaData.statistics.total_friends > 0 && (
                              <div className="p-2 rounded text-center" style={{ backgroundColor: 'var(--background-secondary)' }}>
                                <p className="text-lg font-bold" style={{ color: '#f59e0b' }}>
                                  {snaData.statistics.total_friends?.toLocaleString() || 0}
                                </p>
                                <p style={{ color: 'var(--foreground-muted)' }}>Friends</p>
                              </div>
                            )}
                            {snaData.statistics.total_connections > 0 && (
                              <div className="p-2 rounded text-center" style={{ backgroundColor: 'var(--background-secondary)' }}>
                                <p className="text-lg font-bold" style={{ color: '#0077b5' }}>
                                  {snaData.statistics.total_connections?.toLocaleString() || 0}
                                </p>
                                <p style={{ color: 'var(--foreground-muted)' }}>Connections</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Profiles */}
                      {snaData.profiles?.length > 0 && (
                        <div>
                          <p className="font-semibold mb-2" style={{ color: 'var(--foreground-secondary)' }}>
                            📱 Profil ({snaData.profiles.length})
                          </p>
                          <div className="space-y-2">
                            {snaData.profiles.map((profile, idx) => (
                              <div 
                                key={idx} 
                                className="p-2 rounded flex items-center justify-between"
                                style={{ backgroundColor: 'var(--background-secondary)' }}
                              >
                                <div className="flex items-center gap-2">
                                  <span>
                                    {profile.platform === 'instagram' && '📷'}
                                    {profile.platform === 'facebook' && '📘'}
                                    {profile.platform === 'twitter' && '🐦'}
                                    {profile.platform === 'tiktok' && '🎵'}
                                    {profile.platform === 'linkedin' && '💼'}
                                    {profile.platform === 'youtube' && '▶️'}
                                  </span>
                                  <div>
                                    <p className="font-medium" style={{ color: 'var(--foreground-primary)' }}>
                                      @{profile.username}
                                    </p>
                                    <p style={{ color: 'var(--foreground-muted)' }}>
                                      {profile.platform}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right" style={{ color: 'var(--foreground-muted)' }}>
                                  {profile.followers > 0 && <p>{profile.followers?.toLocaleString()} followers</p>}
                                  {profile.likes > 0 && <p>{profile.likes?.toLocaleString()} likes</p>}
                                  {profile.posts > 0 && <p>{profile.posts?.toLocaleString()} posts</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* AI Analysis */}
                      {snaData.analysis && (
                        <div>
                          <p className="font-semibold mb-2" style={{ color: 'var(--foreground-secondary)' }}>
                            🤖 Analisis AI
                          </p>
                          <p className="whitespace-pre-wrap" style={{ color: 'var(--foreground-primary)' }}>
                            {cleanDisplayText(snaData.analysis)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
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

      {/* Family Tree Dialog - Higher z-index, Minimizable, Draggable */}
      {familyTreeDialog.isMinimized && (
        <div 
          className="fixed bottom-20 right-4 z-[10000] p-3 rounded-lg shadow-xl cursor-pointer hover:scale-105 transition-all"
          onClick={() => setFamilyTreeDialog(prev => ({ ...prev, isMinimized: false }))}
          style={{
            backgroundColor: 'var(--accent-secondary)',
            color: 'white'
          }}
        >
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4" />
            <span className="text-sm font-semibold">Family Tree</span>
            <Maximize2 className="w-4 h-4 ml-2" />
          </div>
        </div>
      )}

      <DraggableDialog open={familyTreeDialog.open && !familyTreeDialog.isMinimized} onOpenChange={(open) => setFamilyTreeDialog(prev => ({ ...prev, open }))}>
        <DraggableDialogContent 
          className="max-w-2xl max-h-[80vh] overflow-y-auto"
          style={{
            backgroundColor: 'var(--background-elevated)',
            borderColor: 'var(--borders-strong)',
            zIndex: 10000
          }}
        >
          <DraggableDialogHeader className="pb-2">
            <div className="flex items-center justify-between w-full pr-8">
              <DraggableDialogTitle 
                className="text-lg font-bold flex items-center gap-2"
                style={{ color: 'var(--foreground-primary)' }}
              >
                <GitBranch className="w-5 h-5" style={{ color: 'var(--accent-secondary)' }} />
                Family Tree (NKK)
              </DraggableDialogTitle>
              {/* Minimize Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFamilyTreeDialog(prev => ({ ...prev, isMinimized: true }))}
                className="h-7 w-7 p-0"
                title="Minimize"
                style={{ color: 'var(--foreground-muted)' }}
              >
                <Minus className="w-4 h-4" />
              </Button>
            </div>
          </DraggableDialogHeader>
          
          {familyTreeDialog.familyData && (
            <div className="space-y-4">
              {/* Family Tree Visualization */}
              <FamilyTreeViz 
                members={familyTreeDialog.familyData.members} 
                targetNik={familyTreeDialog.targetNik} 
              />
              
              {/* Raw NKK Data Table - FILTERED */}
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
                      {/* Filter: must have NIK AND name (check multiple fields), remove duplicates */}
                      {familyTreeDialog.familyData.members
                        .map(member => ({
                          ...member,
                          displayName: member.name || member.nama || member.full_name || member.fullName || ''
                        }))
                        .filter(member => 
                          member.nik && 
                          member.displayName && 
                          member.displayName !== '-' &&
                          member.displayName.trim() !== ''
                        )
                        .filter((member, index, self) => 
                          self.findIndex(m => m.nik === member.nik && m.displayName === member.displayName) === index
                        )
                        .map((member, idx) => (
                        <tr 
                          key={idx}
                          className="border-b"
                          style={{ 
                            borderColor: 'var(--borders-subtle)',
                            backgroundColor: member.nik === familyTreeDialog.targetNik ? 'rgba(255, 59, 92, 0.1)' : 'transparent'
                          }}
                        >
                          <td className="py-1.5 px-2 font-mono" style={{ color: 'var(--foreground-primary)' }}>{member.nik || '-'}</td>
                          <td className="py-1.5 px-2" style={{ color: 'var(--foreground-primary)' }}>{member.displayName || '-'}</td>
                          <td className="py-1.5 px-2" style={{ color: 'var(--foreground-muted)' }}>{member.relationship || member.hubungan || member.shdk || '-'}</td>
                          <td className="py-1.5 px-2" style={{ color: 'var(--foreground-muted)' }}>{member.gender || member.jk || member.jenis_kelamin || '-'}</td>
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

      {/* FAKTA OSINT Detail Dialog */}
      <DraggableDialog open={osintDetailDialog.open} onOpenChange={() => setOsintDetailDialog({ open: false, nik: null, data: null })}>
        <DraggableDialogContent 
          className="flex flex-col"
          style={{ 
            backgroundColor: 'var(--background-elevated)',
            border: '1px solid var(--borders-default)',
            zIndex: 9999,
            width: '700px',
            maxWidth: '95vw',
            height: '80vh',
            maxHeight: '85vh'
          }}
        >
          <DraggableDialogHeader className="flex-shrink-0">
            <DraggableDialogTitle className="flex items-center gap-2" style={{ color: 'var(--foreground-primary)' }}>
              <Globe className="w-5 h-5" style={{ color: '#3b82f6' }} />
              FAKTA OSINT - NIK: <span className="font-mono">{osintDetailDialog.nik}</span>
            </DraggableDialogTitle>
          </DraggableDialogHeader>
          
          <div className="flex-1 overflow-y-auto mt-4 space-y-4 pr-2" style={{ minHeight: 0 }}>
            {osintDetailDialog.data ? (
              <>
                {/* AI Summary */}
                {osintDetailDialog.data.summary && (
                  <div className="p-3 rounded-md" style={{ backgroundColor: 'var(--background-tertiary)' }}>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--accent-primary)' }}>
                      <Zap className="w-4 h-4" />
                      Ringkasan AI
                    </h4>
                    <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--foreground-primary)' }}>
                      {osintDetailDialog.data.summary}
                    </p>
                  </div>
                )}
                
                {/* Social Media */}
                {osintDetailDialog.data.social_media?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--foreground-secondary)' }}>
                      📱 Media Sosial ({osintDetailDialog.data.social_media.length})
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {osintDetailDialog.data.social_media.map((sm, idx) => (
                        <a
                          key={idx}
                          href={sm.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-md flex items-center gap-2 hover:opacity-80 transition-opacity"
                          style={{ backgroundColor: 'var(--background-tertiary)' }}
                        >
                          <span className="text-lg">
                            {sm.platform === 'facebook' && '📘'}
                            {sm.platform === 'instagram' && '📷'}
                            {sm.platform === 'twitter' && '🐦'}
                            {sm.platform === 'youtube' && '▶️'}
                            {sm.platform === 'tiktok' && '🎵'}
                            {sm.platform === 'linkedin' && '💼'}
                            {sm.platform === 'email' && '📧'}
                            {sm.platform === 'github' && '💻'}
                            {sm.platform === 'telegram' && '✈️'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium capitalize" style={{ color: 'var(--foreground-primary)' }}>
                              {sm.platform}
                            </p>
                            <p className="text-xs truncate" style={{ color: 'var(--accent-primary)' }}>
                              {sm.platform === 'email' ? sm.username : `@${sm.username}`}
                            </p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Legal Cases */}
                {osintDetailDialog.data.legal_cases?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2" style={{ color: '#ef4444' }}>
                      ⚠️ Catatan Hukum ({osintDetailDialog.data.legal_cases.length})
                    </h4>
                    <div className="space-y-2">
                      {osintDetailDialog.data.legal_cases.map((lc, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded-md border"
                          style={{ 
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            borderColor: 'rgba(239, 68, 68, 0.3)'
                          }}
                        >
                          <p className="text-sm font-medium" style={{ color: 'var(--foreground-primary)' }}>
                            {lc.source}
                          </p>
                          <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>
                            {lc.note}
                          </p>
                          {lc.url && (
                            <a
                              href={lc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs mt-1 inline-block hover:underline"
                              style={{ color: 'var(--accent-primary)' }}
                            >
                              🔗 Lihat sumber
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Web Mentions */}
                {osintDetailDialog.data.web_mentions?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--foreground-secondary)' }}>
                      🌐 Temuan Web ({osintDetailDialog.data.web_mentions.length})
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {osintDetailDialog.data.web_mentions.map((wm, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded-md text-sm"
                          style={{ backgroundColor: 'var(--background-tertiary)' }}
                        >
                          <a
                            href={wm.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium hover:underline line-clamp-1"
                            style={{ color: 'var(--accent-primary)' }}
                          >
                            {wm.title}
                          </a>
                          <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--foreground-muted)' }}>
                            {wm.snippet}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Family Cache Data */}
                {osintDetailDialog.data.family_cache?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--foreground-secondary)' }}>
                      👨‍👩‍👧‍👦 Data Keluarga dari Cache ({osintDetailDialog.data.family_cache.length})
                    </h4>
                    <div className="space-y-3">
                      {osintDetailDialog.data.family_cache.map((fm, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-md border"
                          style={{ 
                            backgroundColor: 'var(--background-tertiary)',
                            borderColor: 'var(--borders-subtle)'
                          }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="text-sm font-semibold" style={{ color: 'var(--foreground-primary)' }}>
                                {fm.nama}
                              </p>
                              <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                                {fm.hubungan} • NIK: {fm.nik}
                              </p>
                            </div>
                            <div className="flex gap-1">
                              {fm.has_investigation && (
                                <span className="px-2 py-0.5 rounded text-xs" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6' }}>
                                  Data NIK
                                </span>
                              )}
                              {fm.has_osint && (
                                <span className="px-2 py-0.5 rounded text-xs" style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' }}>
                                  OSINT
                                </span>
                              )}
                            </div>
                          </div>
                          
                          {/* Investigation Data */}
                          {fm.investigation_data?.nik_data?.data && (
                            <div className="mt-2 text-xs space-y-1" style={{ color: 'var(--foreground-muted)' }}>
                              {fm.investigation_data.nik_data.data.Address && (
                                <p>📍 {fm.investigation_data.nik_data.data.Address || fm.investigation_data.nik_data.data.Alamat}</p>
                              )}
                              {fm.investigation_data.nik_data.data.Occupation && (
                                <p>💼 {fm.investigation_data.nik_data.data.Occupation || fm.investigation_data.nik_data.data.Pekerjaan}</p>
                              )}
                            </div>
                          )}
                          
                          {/* OSINT Data */}
                          {fm.osint_data && (
                            <div className="mt-2">
                              {fm.osint_data.social_media?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {fm.osint_data.social_media.slice(0, 4).map((sm, smIdx) => (
                                    <a
                                      key={smIdx}
                                      href={sm.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-2 py-0.5 rounded text-xs hover:opacity-80"
                                      style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--accent-primary)' }}
                                    >
                                      {sm.platform === 'facebook' && '📘'}
                                      {sm.platform === 'instagram' && '📷'}
                                      {sm.platform === 'linkedin' && '💼'}
                                      {sm.platform === 'twitter' && '🐦'}
                                      {sm.platform === 'tiktok' && '🎵'}
                                      {sm.platform === 'email' && '📧'}
                                      {' '}{sm.platform}
                                    </a>
                                  ))}
                                </div>
                              )}
                              {fm.osint_data.summary && (
                                <p className="text-xs mt-2 text-green-400">✓ Laporan OSINT tersedia</p>
                              )}
                            </div>
                          )}
                          
                          {/* Search Info */}
                          {fm.search_info && (
                            <p className="text-xs mt-2 opacity-60">
                              Dari pencarian: {fm.search_info.name} ({fm.search_info.created_by})
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* No results message */}
                {!osintDetailDialog.data.social_media?.length && 
                 !osintDetailDialog.data.legal_cases?.length && 
                 !osintDetailDialog.data.web_mentions?.length &&
                 !osintDetailDialog.data.family_cache?.length && (
                  <div className="text-center py-8" style={{ color: 'var(--foreground-muted)' }}>
                    <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Tidak ditemukan informasi OSINT untuk target ini</p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8" style={{ color: 'var(--foreground-muted)' }}>
                <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin" />
                <p>Memuat data...</p>
              </div>
            )}
          </div>
        </DraggableDialogContent>
      </DraggableDialog>

      {/* SOCIAL NETWORK ANALYTICS Detail Dialog */}
      <DraggableDialog open={snaDetailDialog.open} onOpenChange={() => setSnaDetailDialog({ open: false, nik: null, data: null })}>
        <DraggableDialogContent 
          className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
          style={{ 
            backgroundColor: 'var(--background-elevated)',
            border: '1px solid var(--borders-default)',
            zIndex: 10000
          }}
        >
          <DraggableDialogHeader>
            <DraggableDialogTitle style={{ color: 'var(--foreground-primary)' }}>
              <div className="flex items-center gap-2">
                <Network className="w-5 h-5" style={{ color: '#f59e0b' }} />
                SOCIAL NETWORK ANALYTICS - NIK: <span className="font-mono">{snaDetailDialog.nik}</span>
              </div>
            </DraggableDialogTitle>
          </DraggableDialogHeader>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {snaDetailDialog.data ? (
              <>
                {/* Statistics Summary */}
                {snaDetailDialog.data.statistics && (
                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--foreground-secondary)' }}>
                      📊 Statistik Jaringan
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 rounded-md text-center" style={{ backgroundColor: 'var(--background-tertiary)' }}>
                        <p className="text-2xl font-bold" style={{ color: '#3b82f6' }}>
                          {(snaDetailDialog.data.statistics.total_followers || 0).toLocaleString()}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>Total Followers</p>
                      </div>
                      <div className="p-3 rounded-md text-center" style={{ backgroundColor: 'var(--background-tertiary)' }}>
                        <p className="text-2xl font-bold" style={{ color: '#10b981' }}>
                          {(snaDetailDialog.data.statistics.total_following || 0).toLocaleString()}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>Total Following</p>
                      </div>
                      <div className="p-3 rounded-md text-center" style={{ backgroundColor: 'var(--background-tertiary)' }}>
                        <p className="text-2xl font-bold" style={{ color: '#f59e0b' }}>
                          {(snaDetailDialog.data.statistics.total_friends || 0).toLocaleString()}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>Total Connections</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Social Media Profiles */}
                {snaDetailDialog.data.profiles?.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--foreground-secondary)' }}>
                      📱 Profil Media Sosial ({snaDetailDialog.data.profiles.length})
                    </h3>
                    <div className="space-y-2">
                      {snaDetailDialog.data.profiles.map((profile, idx) => (
                        <div 
                          key={idx} 
                          className="p-3 rounded-md"
                          style={{ backgroundColor: 'var(--background-tertiary)' }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">
                                {profile.platform === 'facebook' && '📘'}
                                {profile.platform === 'instagram' && '📷'}
                                {profile.platform === 'twitter' && '🐦'}
                                {profile.platform === 'linkedin' && '💼'}
                                {profile.platform === 'tiktok' && '🎵'}
                                {profile.platform === 'youtube' && '▶️'}
                              </span>
                              <div>
                                <p className="font-medium text-sm" style={{ color: 'var(--foreground-primary)' }}>
                                  {profile.platform.toUpperCase()}
                                </p>
                                <p className="text-xs" style={{ color: 'var(--accent-primary)' }}>
                                  @{profile.username}
                                </p>
                              </div>
                            </div>
                            <div className="text-right text-xs" style={{ color: 'var(--foreground-muted)' }}>
                              <p>{profile.followers?.toLocaleString() || 0} followers</p>
                              <p>{profile.following?.toLocaleString() || 0} following</p>
                            </div>
                          </div>
                          {profile.bio && (
                            <p className="text-xs mt-2 p-2 rounded" style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--foreground-muted)' }}>
                              {profile.bio.slice(0, 200)}...
                            </p>
                          )}
                          {profile.url && (
                            <a 
                              href={profile.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-xs mt-2 inline-block hover:underline"
                              style={{ color: 'var(--accent-primary)' }}
                            >
                              Buka profil →
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Network Graph Visualization */}
                {snaDetailDialog.data.network_graph && (
                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--foreground-secondary)' }}>
                      🕸️ Graf Jaringan
                    </h3>
                    <div 
                      className="p-4 rounded-md relative"
                      style={{ backgroundColor: 'var(--background-tertiary)', minHeight: '200px' }}
                    >
                      {/* Simple Network Visualization */}
                      <div className="flex flex-col items-center justify-center gap-4">
                        {/* Center node (Target) */}
                        <div 
                          className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg"
                          style={{ backgroundColor: '#f59e0b', color: 'white' }}
                        >
                          <User className="w-8 h-8" />
                        </div>
                        <p className="text-xs font-medium" style={{ color: 'var(--foreground-primary)' }}>TARGET</p>
                        
                        {/* Connection lines and platform nodes */}
                        <div className="flex flex-wrap justify-center gap-4 mt-4">
                          {snaDetailDialog.data.network_graph.nodes?.filter(n => n.id !== 'target').map((node, idx) => (
                            <div key={idx} className="flex flex-col items-center">
                              <div className="w-1 h-6" style={{ backgroundColor: 'var(--borders-default)' }} />
                              <div 
                                className="w-10 h-10 rounded-full flex items-center justify-center text-xs"
                                style={{ 
                                  backgroundColor: node.platform === 'twitter' ? '#1da1f2' :
                                                   node.platform === 'instagram' ? '#e1306c' :
                                                   node.platform === 'facebook' ? '#4267b2' :
                                                   node.platform === 'linkedin' ? '#0077b5' :
                                                   node.platform === 'tiktok' ? '#000000' :
                                                   '#888888',
                                  color: 'white'
                                }}
                              >
                                {node.platform?.slice(0, 2).toUpperCase()}
                              </div>
                              <p className="text-xs mt-1 max-w-[60px] truncate" style={{ color: 'var(--foreground-muted)' }}>
                                {node.label}
                              </p>
                              <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                                {node.followers?.toLocaleString() || '0'}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* AI Analysis */}
                {snaDetailDialog.data.analysis && (
                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--foreground-secondary)' }}>
                      🤖 Analisis AI
                    </h3>
                    <div 
                      className="p-4 rounded-md text-sm whitespace-pre-wrap"
                      style={{ 
                        backgroundColor: 'var(--background-tertiary)',
                        color: 'var(--foreground-primary)'
                      }}
                    >
                      {snaDetailDialog.data.analysis}
                    </div>
                  </div>
                )}

                {/* No results message */}
                {!snaDetailDialog.data.profiles?.length && !snaDetailDialog.data.analysis && (
                  <div className="text-center py-8" style={{ color: 'var(--foreground-muted)' }}>
                    <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Tidak ada data Social Network Analytics</p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8" style={{ color: 'var(--foreground-muted)' }}>
                <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin" />
                <p>Memuat data...</p>
              </div>
            )}
          </div>
        </DraggableDialogContent>
      </DraggableDialog>

      {/* SNA Input Dialog - untuk memasukkan link social media manual */}
      <DraggableDialog open={snaInputDialog.open} onOpenChange={() => setSnaInputDialog({ open: false, nik: null, name: null })}>
        <DraggableDialogContent 
          className="max-w-md"
          style={{ 
            backgroundColor: 'var(--background-elevated)',
            border: '1px solid var(--borders-default)',
            zIndex: 10001
          }}
        >
          <DraggableDialogHeader>
            <DraggableDialogTitle style={{ color: 'var(--foreground-primary)' }}>
              <div className="flex items-center gap-2">
                <Network className="w-5 h-5" style={{ color: '#f59e0b' }} />
                Social Network Analytics
              </div>
            </DraggableDialogTitle>
          </DraggableDialogHeader>
          
          <div className="p-4 space-y-4">
            <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
              Masukkan link profil media sosial target (opsional). Jika tidak diisi, SNA akan menggunakan data dari hasil OSINT.
            </p>
            
            {/* Instagram */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-1" style={{ color: 'var(--foreground-primary)' }}>
                <span>📷</span> Instagram
              </label>
              <input
                type="url"
                placeholder="https://instagram.com/username"
                value={snaManualLinks.instagram}
                onChange={(e) => setSnaManualLinks(prev => ({ ...prev, instagram: e.target.value }))}
                className="w-full px-3 py-2 rounded text-sm"
                style={{ 
                  backgroundColor: 'var(--background-secondary)',
                  border: '1px solid var(--borders-subtle)',
                  color: 'var(--foreground-primary)'
                }}
                data-testid="sna-input-instagram"
              />
            </div>
            
            {/* Facebook */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-1" style={{ color: 'var(--foreground-primary)' }}>
                <span>📘</span> Facebook
              </label>
              <input
                type="url"
                placeholder="https://facebook.com/username"
                value={snaManualLinks.facebook}
                onChange={(e) => setSnaManualLinks(prev => ({ ...prev, facebook: e.target.value }))}
                className="w-full px-3 py-2 rounded text-sm"
                style={{ 
                  backgroundColor: 'var(--background-secondary)',
                  border: '1px solid var(--borders-subtle)',
                  color: 'var(--foreground-primary)'
                }}
                data-testid="sna-input-facebook"
              />
            </div>
            
            {/* TikTok */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-1" style={{ color: 'var(--foreground-primary)' }}>
                <span>🎵</span> TikTok
              </label>
              <input
                type="url"
                placeholder="https://tiktok.com/@username"
                value={snaManualLinks.tiktok}
                onChange={(e) => setSnaManualLinks(prev => ({ ...prev, tiktok: e.target.value }))}
                className="w-full px-3 py-2 rounded text-sm"
                style={{ 
                  backgroundColor: 'var(--background-secondary)',
                  border: '1px solid var(--borders-subtle)',
                  color: 'var(--foreground-primary)'
                }}
                data-testid="sna-input-tiktok"
              />
            </div>
            
            {/* Twitter/X */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-1" style={{ color: 'var(--foreground-primary)' }}>
                <span>🐦</span> Twitter / X
              </label>
              <input
                type="url"
                placeholder="https://twitter.com/username"
                value={snaManualLinks.twitter}
                onChange={(e) => setSnaManualLinks(prev => ({ ...prev, twitter: e.target.value }))}
                className="w-full px-3 py-2 rounded text-sm"
                style={{ 
                  backgroundColor: 'var(--background-secondary)',
                  border: '1px solid var(--borders-subtle)',
                  color: 'var(--foreground-primary)'
                }}
                data-testid="sna-input-twitter"
              />
            </div>
            
            {/* LinkedIn */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-1" style={{ color: 'var(--foreground-primary)' }}>
                <span>💼</span> LinkedIn
              </label>
              <input
                type="url"
                placeholder="https://linkedin.com/in/username"
                value={snaManualLinks.linkedin}
                onChange={(e) => setSnaManualLinks(prev => ({ ...prev, linkedin: e.target.value }))}
                className="w-full px-3 py-2 rounded text-sm"
                style={{ 
                  backgroundColor: 'var(--background-secondary)',
                  border: '1px solid var(--borders-subtle)',
                  color: 'var(--foreground-primary)'
                }}
                data-testid="sna-input-linkedin"
              />
            </div>
            
            {/* Info about OSINT data */}
            {(() => {
              const osintData = osintResults[snaInputDialog.nik] || investigation?.osint_results?.[snaInputDialog.nik];
              if (osintData?.social_media?.length > 0) {
                return (
                  <div className="p-3 rounded text-xs" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                    <p className="font-medium mb-1" style={{ color: '#3b82f6' }}>
                      ℹ️ Data dari OSINT ({osintData.social_media.length} profil)
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {osintData.social_media.map((sm, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--foreground-muted)' }}>
                          {sm.platform}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              }
              return null;
            })()}
            
            {/* Action buttons */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setSnaInputDialog({ open: false, nik: null, name: null })}
                className="flex-1 px-4 py-2 rounded text-sm"
                style={{ 
                  backgroundColor: 'var(--background-secondary)',
                  color: 'var(--foreground-primary)',
                  border: '1px solid var(--borders-subtle)'
                }}
              >
                Batal
              </button>
              <button
                onClick={() => {
                  const hasManualLinks = snaManualLinks.instagram || snaManualLinks.facebook || snaManualLinks.tiktok || snaManualLinks.twitter || snaManualLinks.linkedin;
                  const osintData = osintResults[snaInputDialog.nik] || investigation?.osint_results?.[snaInputDialog.nik];
                  const hasOsintData = osintData?.social_media?.length > 0;
                  
                  if (!hasManualLinks && !hasOsintData) {
                    toast.error('Masukkan minimal satu link media sosial atau jalankan OSINT terlebih dahulu');
                    return;
                  }
                  
                  startSocialNetworkAnalytics(snaInputDialog.nik, snaInputDialog.name, hasManualLinks ? snaManualLinks : null);
                  setSnaInputDialog({ open: false, nik: null, name: null });
                }}
                className="flex-1 px-4 py-2 rounded text-sm font-medium"
                style={{ 
                  backgroundColor: '#f59e0b',
                  color: 'white'
                }}
                data-testid="sna-start-btn"
              >
                Mulai SNA
              </button>
            </div>
          </div>
        </DraggableDialogContent>
      </DraggableDialog>
    </>
  );
};

export default NonGeointSearchDialog;
