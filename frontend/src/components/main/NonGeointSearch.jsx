import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

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
  
  // Try to parse multiple person entries from raw text
  // Common patterns: numbered list, separated by lines, etc.
  const lines = text.split('\n');
  let currentPerson = {};
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Check for name patterns
    const namaMatch = trimmed.match(/(?:nama|name)\s*[:\-]?\s*(.+)/i);
    if (namaMatch) {
      if (currentPerson.nama) {
        persons.push({ ...currentPerson });
        currentPerson = {};
      }
      currentPerson.nama = namaMatch[1].trim();
    }
    
    // Check for NIK
    const nikMatch = trimmed.match(/(?:nik)\s*[:\-]?\s*(\d{16})/i);
    if (nikMatch) {
      currentPerson.nik = nikMatch[1];
    }
    
    // Check for TTL (Tempat Tanggal Lahir)
    const ttlMatch = trimmed.match(/(?:ttl|tempat.*lahir|tgl.*lahir|tanggal.*lahir)\s*[:\-]?\s*(.+)/i);
    if (ttlMatch) {
      currentPerson.ttl = ttlMatch[1].trim();
    }
    
    // Check for birthplace separately
    const tempatMatch = trimmed.match(/(?:tempat\s+lahir)\s*[:\-]?\s*(.+)/i);
    if (tempatMatch && !currentPerson.tempat_lahir) {
      currentPerson.tempat_lahir = tempatMatch[1].trim();
    }
    
    // Check for birthdate separately
    const tglMatch = trimmed.match(/(?:tgl\s+lahir|tanggal\s+lahir)\s*[:\-]?\s*(.+)/i);
    if (tglMatch && !currentPerson.tgl_lahir) {
      currentPerson.tgl_lahir = tglMatch[1].trim();
    }
    
    // Check for address
    const alamatMatch = trimmed.match(/(?:alamat|address)\s*[:\-]?\s*(.+)/i);
    if (alamatMatch) {
      currentPerson.alamat = alamatMatch[1].trim();
    }
  }
  
  // Don't forget the last person
  if (currentPerson.nama) {
    persons.push(currentPerson);
  }
  
  // If we couldn't parse individual persons, try using parsed_data
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
    
    // Combine tempat and tgl lahir if ttl is empty
    if (!person.ttl && (person.tempat_lahir || person.tgl_lahir)) {
      person.ttl = [person.tempat_lahir, person.tgl_lahir].filter(Boolean).join(', ');
    }
    
    if (person.nama) {
      persons.push(person);
    }
  }
  
  return persons;
};

// Result Detail Popup
const ResultDetailDialog = ({ open, onClose, queryType, result }) => {
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
        className="max-w-xl max-h-[70vh] overflow-y-auto"
        style={{ 
          backgroundColor: 'var(--background-elevated)',
          border: '1px solid var(--borders-default)'
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--foreground-primary)' }}>
            Hasil {getQueryLabel(queryType)}
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
                {result.niks_found.map(nik => (
                  <span 
                    key={nik}
                    className="px-2 py-1 rounded text-xs font-mono"
                    style={{ 
                      backgroundColor: 'var(--accent-primary-transparent)',
                      color: 'var(--accent-primary)'
                    }}
                  >
                    {nik}
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
                    <span style={{ color: 'var(--foreground-primary)' }}>{value}</span>
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
              {result.error}
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
                    {getStatusBadge(search.status)}
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

// NIK Investigation Results Component
const NikInvestigationResults = ({ investigation, searchResults, onPrint }) => {
  const [expandedNiks, setExpandedNiks] = useState({});
  const [detailDialog, setDetailDialog] = useState({ open: false, type: null, result: null });

  const toggleNik = (nik) => {
    setExpandedNiks(prev => ({ ...prev, [nik]: !prev[nik] }));
  };

  const getStatusIcon = (status) => {
    if (!status || status === 'processing' || status.startsWith('processing_')) {
      return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
    }
    if (status === 'completed') {
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    }
    return <AlertCircle className="w-4 h-4 text-yellow-500" />;
  };

  const getQueryTypeLabel = (type) => {
    switch (type) {
      case 'nik_data': return 'NIK';
      case 'nkk_data': return 'NKK';
      case 'regnik_data': return 'RegNIK';
      default: return type;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground-secondary)' }}>
          Hasil Pendalaman NIK
        </h3>
        {investigation?.status === 'completed' && (
          <Button
            size="sm"
            onClick={onPrint}
            style={{
              backgroundColor: 'var(--accent-secondary)',
              color: '#fff'
            }}
          >
            <Printer className="w-4 h-4 mr-1" />
            Print PDF
          </Button>
        )}
      </div>

      {Object.entries(investigation?.results || {}).map(([nik, nikResult]) => (
        <div 
          key={nik}
          className="rounded-md border overflow-hidden"
          style={{
            backgroundColor: 'var(--background-tertiary)',
            borderColor: 'var(--borders-subtle)'
          }}
        >
          {/* NIK Header */}
          <div 
            className="p-3 flex items-center justify-between cursor-pointer"
            onClick={() => toggleNik(nik)}
            style={{ backgroundColor: 'var(--background-secondary)' }}
          >
            <div className="flex items-center gap-2">
              {getStatusIcon(nikResult?.status)}
              <span className="font-mono font-medium" style={{ color: 'var(--foreground-primary)' }}>
                {nik}
              </span>
            </div>
            {expandedNiks[nik] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>

          {/* NIK Details */}
          {expandedNiks[nik] && (
            <div className="p-3 space-y-2">
              {['nik_data', 'nkk_data', 'regnik_data'].map(queryType => {
                const result = nikResult?.[queryType];
                const hasData = result && (result.data || result.raw_text);
                
                return (
                  <div 
                    key={queryType}
                    className="flex items-center justify-between p-2 rounded"
                    style={{ backgroundColor: 'var(--background-primary)' }}
                  >
                    <div className="flex items-center gap-2">
                      {getStatusIcon(result?.status)}
                      <span className="text-sm" style={{ color: 'var(--foreground-primary)' }}>
                        {getQueryTypeLabel(queryType)}
                      </span>
                    </div>
                    {hasData && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDetailDialog({ open: true, type: queryType, result })}
                        className="h-7 px-2"
                        style={{ color: 'var(--accent-primary)' }}
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        View
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* Detail Dialog */}
      <ResultDetailDialog
        open={detailDialog.open}
        onClose={() => setDetailDialog({ open: false, type: null, result: null })}
        queryType={detailDialog.type}
        result={detailDialog.result}
      />
    </div>
  );
};

export const NonGeointSearchDialog = ({ 
  open, 
  onOpenChange, 
  onNikPendalaman,
  initialSearch = null
}) => {
  const [searchName, setSearchName] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  
  // New: Person selection state
  const [personsFound, setPersonsFound] = useState([]);
  const [selectedPersonIndex, setSelectedPersonIndex] = useState(null);
  const [showPersonSelection, setShowPersonSelection] = useState(false);
  
  // NIK selection (can select one or more)
  const [selectedNiks, setSelectedNiks] = useState([]);
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [investigation, setInvestigation] = useState(null);
  const [detailDialog, setDetailDialog] = useState({ open: false, type: null, result: null });
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
      
      // If only 1 person found, auto-select and skip to NIK selection
      if (persons.length === 1) {
        setSelectedPersonIndex(0);
        setShowPersonSelection(false);
      } else if (persons.length > 1) {
        // Multiple persons found, show selection
        setShowPersonSelection(true);
        setSelectedPersonIndex(null);
      } else {
        // No persons parsed, proceed normally
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

  // Handle person selection (single select only)
  const handlePersonSelect = (index) => {
    setSelectedPersonIndex(index);
  };

  // Confirm person selection and move to NIK step
  const confirmPersonSelection = () => {
    if (selectedPersonIndex === null) {
      toast.error('Pilih salah satu nama');
      return;
    }
    setShowPersonSelection(false);
    
    // If selected person has NIK, pre-select it
    const selectedPerson = personsFound[selectedPersonIndex];
    if (selectedPerson?.nik) {
      setSelectedNiks([selectedPerson.nik]);
    }
  };

  // Handle NIK toggle (can select multiple)
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
      }, 2000);

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
      setInvestigation(data);

      if (data.status === 'completed' || data.status === 'error') {
        if (investigationPollingRef.current) {
          clearInterval(investigationPollingRef.current);
          investigationPollingRef.current = null;
        }
        setIsInvestigating(false);

        if (data.status === 'completed') {
          toast.success('Pendalaman NIK selesai');
        }
      }
    } catch (error) {
      console.error('Investigation polling error:', error);
    }
  };

  const generatePDF = () => {
    const pdf = new jsPDF();
    let yPos = 20;
    const lineHeight = 7;
    const pageHeight = 280;
    
    const addText = (text, x = 14, fontSize = 10, isBold = false) => {
      if (yPos > pageHeight) {
        pdf.addPage();
        yPos = 20;
      }
      pdf.setFontSize(fontSize);
      if (isBold) {
        pdf.setFont('helvetica', 'bold');
      } else {
        pdf.setFont('helvetica', 'normal');
      }
      pdf.text(text, x, yPos);
      yPos += lineHeight;
    };

    const addSection = (title) => {
      yPos += 5;
      addText(title, 14, 12, true);
      yPos += 2;
    };

    // Title
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('LAPORAN NON GEOINT', 105, yPos, { align: 'center' });
    yPos += 10;

    // Search Info
    addText(`Nama Pencarian: ${searchResults?.name || '-'}`, 14, 11, true);
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
    if (investigation?.results) {
      addSection('4. HASIL PENDALAMAN NIK');
      
      Object.entries(investigation.results).forEach(([nik, nikResult], idx) => {
        yPos += 3;
        addText(`${idx + 1}. NIK: ${nik}`, 14, 11, true);
        
        // NIK Data
        if (nikResult.nik_data?.data) {
          addText('   Data NIK:', 14, 10, true);
          Object.entries(nikResult.nik_data.data).forEach(([key, value]) => {
            addText(`      ${key}: ${value}`);
          });
        }
        
        // NKK Data
        if (nikResult.nkk_data?.data) {
          addText('   Data NKK:', 14, 10, true);
          Object.entries(nikResult.nkk_data.data).forEach(([key, value]) => {
            addText(`      ${key}: ${value}`);
          });
        }
        
        // RegNIK Data
        if (nikResult.regnik_data?.data) {
          addText('   Data RegNIK:', 14, 10, true);
          Object.entries(nikResult.regnik_data.data).forEach(([key, value]) => {
            addText(`      ${key}: ${value}`);
          });
        }
      });
    }

    // Footer
    yPos = pageHeight;
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'italic');
    pdf.text('Generated by WASKITA LBS - NON GEOINT Module', 105, yPos, { align: 'center' });

    // Save PDF
    pdf.save(`NON_GEOINT_${searchResults?.name || 'report'}_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('PDF berhasil dibuat');
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'processing':
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

  // Determine current step
  const getCurrentStep = () => {
    if (isSearching) return 'searching';
    if (!searchResults) return 'input';
    if (searchResults.status !== 'completed') return 'searching';
    if (showPersonSelection && personsFound.length > 1) return 'select_person';
    if (!investigation && searchResults.niks_found?.length > 0) return 'select_nik';
    if (isInvestigating || investigation) return 'investigation';
    return 'no_results';
  };

  const currentStep = getCurrentStep();

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
                              onClick={() => setDetailDialog({ open: true, type: queryType, result })}
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

              {/* STEP: Person Selection (if multiple persons found) */}
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

              {/* STEP: NIK Selection */}
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
                        className="flex items-center gap-3 p-3 rounded-md border cursor-pointer"
                        onClick={() => handleNikToggle(nik)}
                        style={{
                          backgroundColor: selectedNiks.includes(nik) 
                            ? 'var(--accent-primary-transparent)' 
                            : 'var(--background-tertiary)',
                          borderColor: selectedNiks.includes(nik)
                            ? 'var(--accent-primary)'
                            : 'var(--borders-subtle)'
                        }}
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

              {/* Investigation Results */}
              {currentStep === 'investigation' && (
                <NikInvestigationResults 
                  investigation={investigation}
                  searchResults={searchResults}
                  onPrint={generatePDF}
                />
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
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Result Detail Dialog */}
      <ResultDetailDialog
        open={detailDialog.open}
        onClose={() => setDetailDialog({ open: false, type: null, result: null })}
        queryType={detailDialog.type}
        result={detailDialog.result}
      />
    </>
  );
};

export default NonGeointSearchDialog;
