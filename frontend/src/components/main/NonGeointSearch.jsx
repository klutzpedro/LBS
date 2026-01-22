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
  GitBranch
} from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import { FamilyTreeViz } from '@/components/FamilyTreeViz';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// 3D styled NON GEOINT Button
export const NonGeointButton = ({ onOpenSearch, onOpenHistory }) => {
  return (
    <div className="flex gap-2">
      <Button
        onClick={onOpenSearch}
        className="shadow-xl hover:scale-105 transition-all duration-200"
        style={{
          background: 'linear-gradient(145deg, #f59e0b, #d97706)',
          color: '#000',
          border: 'none',
          boxShadow: '0 6px 20px rgba(245, 158, 11, 0.4), 0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.3)',
          fontWeight: 'bold',
          padding: '10px 20px',
          borderRadius: '8px',
          textShadow: '0 1px 0 rgba(255,255,255,0.3)'
        }}
        data-testid="nongeoint-search-btn"
      >
        <Search className="w-4 h-4 mr-2" />
        NON GEOINT
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

// Person Selection Card
const PersonSelectionCard = ({ person, isSelected, onSelect, index }) => {
  const ttl = person.ttl || [person.tempat_lahir, person.tgl_lahir].filter(Boolean).join(', ') || '-';
  
  return (
    <div 
      className={`p-3 rounded-md border cursor-pointer transition-all ${isSelected ? 'ring-2' : ''}`}
      onClick={onSelect}
      style={{
        backgroundColor: isSelected 
          ? 'var(--accent-primary-transparent)' 
          : 'var(--background-tertiary)',
        borderColor: isSelected
          ? 'var(--accent-primary)'
          : 'var(--borders-subtle)',
        ringColor: isSelected ? 'var(--accent-primary)' : 'transparent'
      }}
    >
      <div className="flex items-start gap-3">
        <div 
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ 
            backgroundColor: isSelected ? 'var(--accent-primary)' : 'var(--background-secondary)',
            color: isSelected ? 'var(--background-primary)' : 'var(--foreground-muted)'
          }}
        >
          {isSelected ? <CheckCircle className="w-5 h-5" /> : <User className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <p 
            className="font-semibold text-sm truncate"
            style={{ color: 'var(--foreground-primary)' }}
          >
            {person.nama || `Hasil ${index + 1}`}
          </p>
          <div className="flex items-center gap-1 mt-1">
            <Calendar className="w-3 h-3" style={{ color: 'var(--foreground-muted)' }} />
            <p 
              className="text-xs truncate"
              style={{ color: 'var(--foreground-muted)' }}
            >
              {ttl}
            </p>
          </div>
          {person.nik && (
            <p 
              className="text-xs font-mono mt-1"
              style={{ color: 'var(--accent-primary)' }}
            >
              NIK: {person.nik}
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
  initialSearch = null
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
  
  const pollingRef = useRef(null);
  const investigationPollingRef = useRef(null);

  // Load initial search if provided
  useEffect(() => {
    if (initialSearch && open) {
      setSearchResults(initialSearch);
      setSearchName(initialSearch.name || '');
    }
  }, [initialSearch, open]);

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      if (investigationPollingRef.current) {
        clearInterval(investigationPollingRef.current);
        investigationPollingRef.current = null;
      }
      setIsSearching(false);
      setIsInvestigating(false);
    }
  }, [open]);

  // Process search results to extract persons
  useEffect(() => {
    if (searchResults?.status === 'completed' && searchResults?.results?.capil) {
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

      if (data.status === 'completed' || data.status === 'error') {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        setIsSearching(false);

        if (data.status === 'completed' && data.niks_found?.length > 0) {
          toast.success(`Ditemukan ${data.niks_found.length} NIK`);
        }
      }
    } catch (error) {
      console.error('Polling error:', error);
    }
  };

  const handlePersonSelect = (index) => {
    setSelectedPersonIndex(index);
  };

  const confirmPersonSelection = () => {
    if (selectedPersonIndex === null) {
      toast.error('Pilih salah satu nama');
      return;
    }
    setShowPersonSelection(false);
    
    const selectedPerson = personsFound[selectedPersonIndex];
    if (selectedPerson?.nik) {
      setSelectedNiks([selectedPerson.nik]);
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
        
        // NKK Data
        if (nikResult?.nkk_data) {
          addText('   [Data NKK]', margin, 10, true);
          addText(`   Status: ${nikResult.nkk_data.status}`);
          if (nikResult.nkk_data.data) {
            Object.entries(nikResult.nkk_data.data).forEach(([key, value]) => {
              addText(`   ${key}: ${value}`);
            });
          }
          if (nikResult.nkk_data.raw_text && !nikResult.nkk_data.data) {
            addText(`   Raw: ${nikResult.nkk_data.raw_text.substring(0, 300)}`);
          }
        }
        
        // RegNIK Data
        if (nikResult?.regnik_data) {
          addText('   [Data RegNIK]', margin, 10, true);
          addText(`   Status: ${nikResult.regnik_data.status}`);
          if (nikResult.regnik_data.data) {
            Object.entries(nikResult.regnik_data.data).forEach(([key, value]) => {
              addText(`   ${key}: ${value}`);
            });
          }
          if (nikResult.regnik_data.raw_text && !nikResult.regnik_data.data) {
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
    if (searchResults.status !== 'completed') return 'searching';
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
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent 
          className="max-w-2xl max-h-[85vh] overflow-y-auto"
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
              <Search className="w-5 h-5" style={{ color: 'var(--accent-secondary)' }} />
              NON GEOINT Search
            </DialogTitle>
          </DialogHeader>

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

              {/* STEP: Person Selection */}
              {currentStep === 'select_person' && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 
                      className="text-sm font-semibold"
                      style={{ color: 'var(--foreground-secondary)' }}
                    >
                      Pilih Nama ({personsFound.length} hasil ditemukan)
                    </h3>
                  </div>
                  
                  <p className="text-xs mb-3" style={{ color: 'var(--foreground-muted)' }}>
                    Ditemukan beberapa orang dengan nama serupa. Pilih salah satu untuk melanjutkan.
                  </p>

                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {personsFound.map((person, idx) => (
                      <PersonSelectionCard
                        key={idx}
                        person={person}
                        index={idx}
                        isSelected={selectedPersonIndex === idx}
                        onSelect={() => handlePersonSelect(idx)}
                      />
                    ))}
                  </div>

                  <div className="mt-4">
                    <Button
                      onClick={confirmPersonSelection}
                      disabled={selectedPersonIndex === null}
                      className="w-full"
                      style={{
                        backgroundColor: 'var(--accent-primary)',
                        color: 'var(--background-primary)'
                      }}
                    >
                      Lanjutkan dengan Nama Terpilih
                    </Button>
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
        </DialogContent>
      </Dialog>

      {/* Combined NIK Result Detail Dialog */}
      {detailDialog.type === 'nik_combined' ? (
        <Dialog open={detailDialog.open} onOpenChange={() => setDetailDialog({ open: false, type: null, result: null, nik: null })}>
          <DialogContent 
            className="max-w-2xl max-h-[85vh] overflow-y-auto"
            style={{ 
              backgroundColor: 'var(--background-elevated)',
              border: '1px solid var(--borders-default)',
              zIndex: 9999
            }}
          >
            <DialogHeader>
              <DialogTitle style={{ color: 'var(--foreground-primary)' }}>
                Hasil Pendalaman NIK: <span className="font-mono">{detailDialog.nik}</span>
              </DialogTitle>
            </DialogHeader>
            
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
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--foreground-secondary)' }}>
                    {getStatusIcon(detailDialog.result.nkk_data.status)}
                    Data NKK (Kartu Keluarga)
                  </h4>
                  <div className="p-3 rounded-md" style={{ backgroundColor: 'var(--background-tertiary)' }}>
                    {detailDialog.result.nkk_data.data && Object.keys(detailDialog.result.nkk_data.data).length > 0 ? (
                      <div className="space-y-1 text-xs">
                        {Object.entries(detailDialog.result.nkk_data.data).map(([key, value]) => (
                          <div key={key} className="flex">
                            <span className="font-medium w-28 flex-shrink-0" style={{ color: 'var(--foreground-muted)' }}>{key}:</span>
                            <span style={{ color: 'var(--foreground-primary)' }}>{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    ) : detailDialog.result.nkk_data.raw_text ? (
                      <pre className="text-xs whitespace-pre-wrap" style={{ color: 'var(--foreground-primary)' }}>
                        {detailDialog.result.nkk_data.raw_text}
                      </pre>
                    ) : (
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
          </DialogContent>
        </Dialog>
      ) : (
        <ResultDetailDialog
          open={detailDialog.open}
          onClose={() => setDetailDialog({ open: false, type: null, result: null, nik: null })}
          queryType={detailDialog.type}
          result={detailDialog.result}
          nik={detailDialog.nik}
        />
      )}
    </>
  );
};

export default NonGeointSearchDialog;
