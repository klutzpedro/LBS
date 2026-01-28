import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  DraggableDialog, 
  DraggableDialogContent, 
  DraggableDialogHeader, 
  DraggableDialogTitle 
} from '@/components/ui/draggable-dialog';
import { 
  Search, 
  Loader2, 
  Minus, 
  Maximize2,
  User,
  CreditCard,
  Users,
  Phone,
  Plane,
  Car,
  FileText,
  Copy,
  Check,
  History,
  Clock,
  Trash2,
  X,
  Download
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Query types configuration
const QUERY_TYPES = [
  { 
    id: 'capil_name', 
    label: 'CAPIL (Nama)', 
    description: 'Cari data kependudukan berdasarkan nama',
    icon: User,
    placeholder: 'Masukkan nama lengkap...',
    validation: (v) => v.length >= 3,
    errorMsg: 'Nama minimal 3 karakter'
  },
  { 
    id: 'capil_nik', 
    label: 'CAPIL (NIK)', 
    description: 'Cari data kependudukan berdasarkan NIK',
    icon: CreditCard,
    placeholder: 'Masukkan NIK (16 angka)...',
    validation: (v) => /^\d{16}$/.test(v),
    errorMsg: 'NIK harus 16 angka'
  },
  { 
    id: 'nkk', 
    label: 'Kartu Keluarga (NKK)', 
    description: 'Cari data kartu keluarga berdasarkan NKK',
    icon: Users,
    placeholder: 'Masukkan NKK (16 angka)...',
    validation: (v) => /^\d{16}$/.test(v),
    errorMsg: 'NKK harus 16 angka'
  },
  { 
    id: 'reghp', 
    label: 'RegHP (NIK)', 
    description: 'Cari nomor HP terdaftar berdasarkan NIK',
    icon: Phone,
    placeholder: 'Masukkan NIK (16 angka)...',
    validation: (v) => /^\d{16}$/.test(v),
    errorMsg: 'NIK harus 16 angka'
  },
  { 
    id: 'reghp_phone', 
    label: 'RegHP (HP)', 
    description: 'Cari NIK berdasarkan nomor HP',
    icon: Phone,
    placeholder: 'Masukkan nomor HP (62xxxxxxxxx)...',
    validation: (v) => /^62\d{8,13}$/.test(v.replace(/\s/g, '')),
    errorMsg: 'Format: 62xxxxxxxxx (10-15 digit)'
  },
  { 
    id: 'passport_wna', 
    label: 'Passport WNA (Nama)', 
    description: 'Cari data passport WNA berdasarkan nama',
    icon: Plane,
    placeholder: 'Masukkan nama lengkap...',
    validation: (v) => v.length >= 3,
    errorMsg: 'Nama minimal 3 karakter'
  },
  { 
    id: 'passport_wni', 
    label: 'Passport WNI (Nama)', 
    description: 'Cari data passport WNI berdasarkan nama',
    icon: Plane,
    placeholder: 'Masukkan nama lengkap...',
    validation: (v) => v.length >= 3,
    errorMsg: 'Nama minimal 3 karakter'
  },
  { 
    id: 'passport_number', 
    label: 'Passport (Nomor)', 
    description: 'Cari data passport berdasarkan nomor passport',
    icon: FileText,
    placeholder: 'Masukkan nomor passport (ex: X1122553)...',
    validation: (v) => v.length >= 6,
    errorMsg: 'Nomor passport minimal 6 karakter'
  },
  { 
    id: 'plat_mobil', 
    label: 'Plat Nomor Kendaraan', 
    description: 'Cari data kendaraan berdasarkan plat nomor',
    icon: Car,
    placeholder: 'Masukkan plat nomor (ex: B1171BAM)...',
    validation: (v) => v.length >= 4,
    errorMsg: 'Plat nomor minimal 4 karakter'
  },
  { 
    id: 'perlintasan', 
    label: 'Perlintasan (No Passport)', 
    description: 'Cari data perlintasan/keluar masuk berdasarkan nomor passport',
    icon: Plane,
    placeholder: 'Masukkan nomor passport (ex: X1122553)...',
    validation: (v) => v.length >= 6,
    errorMsg: 'Nomor passport minimal 6 karakter',
    fullWidth: true  // Flag for full width display
  }
];

// Simple Query Button
export const SimpleQueryButton = ({ onClick }) => {
  return (
    <Button
      onClick={onClick}
      size="sm"
      className="shadow-lg hover:scale-105 transition-all duration-200"
      style={{
        background: 'linear-gradient(145deg, #f59e0b, #d97706)',
        color: '#fff',
        border: 'none',
        boxShadow: '0 4px 15px rgba(245, 158, 11, 0.4)',
        borderRadius: '8px',
        padding: '8px 16px',
        fontSize: '13px',
        fontWeight: '600'
      }}
      title="Query Satuan"
      data-testid="simple-query-btn"
    >
      <Search className="w-4 h-4 mr-2" />
      Query
    </Button>
  );
};

// Simple Query Dialog
export const SimpleQueryDialog = ({ open, onOpenChange, initialResult = null }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [searchValue, setSearchValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      if (initialResult) {
        // If we have initial result from history, show it
        console.log('[SimpleQuery] Dialog opened with history result:', initialResult);
        setSelectedType(initialResult.query_type);
        setSearchValue(initialResult.query_value || '');
        setResult({
          response: initialResult.raw_response,
          cached: true,
          cacheTime: initialResult.created_at
        });
        setStatusMessage('');
      } else {
        // Fresh form
        console.log('[SimpleQuery] Dialog opened - fresh state');
        setSelectedType(null);
        setSearchValue('');
        setResult(null);
        setStatusMessage('');
      }
      setCopied(false);
    }
  }, [open, initialResult]);

  const handleSearch = async () => {
    if (!selectedType) {
      toast.error('Pilih jenis query terlebih dahulu');
      return;
    }

    const queryType = QUERY_TYPES.find(t => t.id === selectedType);
    if (!queryType.validation(searchValue)) {
      toast.error(queryType.errorMsg);
      return;
    }

    setIsLoading(true);
    setResult(null);
    setStatusMessage('Mengirim query ke server...');

    try {
      const token = localStorage.getItem('token');
      
      // Show queue message
      setStatusMessage('Menunggu antrian (query diproses satu per satu untuk menghindari tabrakan data)...');
      
      const response = await fetch(`${API_URL}/api/simple-query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query_type: selectedType,
          query_value: searchValue.toUpperCase()
        })
      });

      const data = await response.json();

      if (response.ok) {
        setResult(data);
        setStatusMessage('');
        if (data.success) {
          if (data.verified === false) {
            toast.warning('Query berhasil, tapi respons mungkin tidak sesuai. Coba ulangi jika hasil tidak relevan.');
          } else {
            toast.success('Query berhasil');
          }
        } else {
          toast.warning(data.error || 'Tidak ada hasil');
        }
      } else {
        toast.error(data.detail || 'Query gagal');
        setResult({ success: false, error: data.detail });
        setStatusMessage('');
      }
    } catch (error) {
      console.error('Query error:', error);
      toast.error('Terjadi kesalahan');
      setResult({ success: false, error: error.message });
      setStatusMessage('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (result?.raw_response) {
      navigator.clipboard.writeText(result.raw_response);
      setCopied(true);
      toast.success('Disalin ke clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const resetSearch = () => {
    setSelectedType(null);
    setSearchValue('');
    setResult(null);
  };

  const currentType = QUERY_TYPES.find(t => t.id === selectedType);

  return (
    <DraggableDialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent 
        className="flex flex-col p-4"
        style={{ 
          width: isMinimized ? '300px' : '650px',
          maxWidth: '95vw',
          height: isMinimized ? 'auto' : '85vh',
          maxHeight: '90vh',
          backgroundColor: 'var(--background-elevated)',
          border: '1px solid var(--borders-default)'
        }}
      >
        <DraggableDialogHeader className="cursor-move flex-shrink-0 mb-3">
          <div className="flex items-center justify-between w-full">
            <DraggableDialogTitle className="flex items-center gap-2" style={{ color: 'var(--foreground-primary)' }}>
              <Search className="w-5 h-5" style={{ color: '#10b981' }} />
              SIMPLE QUERY
            </DraggableDialogTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setIsMinimized(!isMinimized)}
              >
                {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </DraggableDialogHeader>

        {!isMinimized && (
          <div className="flex-1 overflow-y-auto space-y-4" style={{ minHeight: 0 }}>
            {/* Status Message */}
            {isLoading && statusMessage && (
              <div 
                className="p-3 rounded-lg flex items-center gap-3"
                style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981' }}
              >
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#10b981' }} />
                <span className="text-sm" style={{ color: '#10b981' }}>{statusMessage}</span>
              </div>
            )}
            
            {/* Query Type Selection */}
            {!result && (
              <>
                <div>
                  <Label className="text-sm mb-2 block" style={{ color: 'var(--foreground-secondary)' }}>
                    Pilih Jenis Query:
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    {QUERY_TYPES.map((type) => {
                      const IconComponent = type.icon;
                      return (
                        <button
                          key={type.id}
                          onClick={() => {
                            setSelectedType(type.id);
                            setSearchValue('');
                          }}
                          className={`p-3 rounded-lg border text-left transition-all ${
                            selectedType === type.id ? 'ring-2' : ''
                          } ${type.fullWidth ? 'col-span-2' : ''}`}
                          style={{
                            backgroundColor: selectedType === type.id 
                              ? 'rgba(16, 185, 129, 0.15)' 
                              : 'var(--background-tertiary)',
                            borderColor: selectedType === type.id 
                              ? '#10b981' 
                              : 'var(--borders-default)',
                            ringColor: '#10b981'
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <IconComponent 
                              className="w-4 h-4" 
                              style={{ color: selectedType === type.id ? '#10b981' : 'var(--foreground-muted)' }} 
                            />
                            <span 
                              className="text-sm font-medium"
                              style={{ color: 'var(--foreground-primary)' }}
                            >
                              {type.label}
                            </span>
                          </div>
                          <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>
                            {type.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Search Input */}
                {selectedType && (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-sm mb-2 block" style={{ color: 'var(--foreground-secondary)' }}>
                        {currentType?.label}:
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder={currentType?.placeholder}
                          value={searchValue}
                          onChange={(e) => setSearchValue(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                          disabled={isLoading}
                          className="flex-1"
                          style={{ color: '#fff', backgroundColor: 'var(--background-tertiary)' }}
                        />
                        <Button
                          onClick={handleSearch}
                          disabled={isLoading || !searchValue}
                          style={{
                            background: 'linear-gradient(145deg, #f59e0b, #d97706)',
                            color: '#fff'
                          }}
                        >
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Search className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Results - Raw Response */}
            {result && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground-primary)' }}>
                      Hasil Query: {currentType?.label}
                    </h3>
                    {result.cached && (
                      <span 
                        className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{ backgroundColor: 'rgba(0, 255, 136, 0.2)', color: '#00ff88' }}
                      >
                        DARI CACHE
                      </span>
                    )}
                    {result.source === 'CP_API' && (
                      <span 
                        className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6' }}
                      >
                        VIA CP API
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopy}
                      disabled={!result.raw_response}
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={resetSearch}
                    >
                      Query Baru
                    </Button>
                  </div>
                </div>

                {/* Query Info */}
                <div 
                  className="p-2 rounded text-xs"
                  style={{ backgroundColor: 'var(--background-tertiary)' }}
                >
                  <span style={{ color: 'var(--foreground-muted)' }}>Query: </span>
                  <span style={{ color: 'var(--foreground-primary)' }}>{searchValue.toUpperCase()}</span>
                  {result.cached && result.cached_at && (
                    <span style={{ color: 'var(--foreground-muted)', marginLeft: '10px' }}>
                      (disimpan: {new Date(result.cached_at).toLocaleDateString('id-ID')})
                    </span>
                  )}
                </div>

                {/* Raw Response Display */}
                <div 
                  className="p-4 rounded-lg border overflow-auto"
                  style={{ 
                    backgroundColor: '#1a1a2e',
                    borderColor: 'var(--borders-default)',
                    maxHeight: '50vh'
                  }}
                >
                  {result.success && result.raw_response ? (
                    <div className="space-y-3">
                      {/* Photo Display for CAPIL NIK */}
                      {result.photo && (
                        <div className="flex flex-col items-center mb-4 p-3 rounded" style={{ backgroundColor: 'var(--background-tertiary)' }}>
                          <img 
                            src={result.photo} 
                            alt="Foto KTP"
                            className="max-w-[150px] max-h-[200px] rounded border mb-2"
                            style={{ borderColor: 'var(--borders-default)' }}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const link = document.createElement('a');
                              link.href = result.photo;
                              link.download = `foto_${result.query_value || 'nik'}.jpg`;
                              link.click();
                              toast.success('Foto berhasil didownload');
                            }}
                            className="text-xs"
                          >
                            <Download className="w-3 h-3 mr-1" />
                            Download Foto
                          </Button>
                        </div>
                      )}
                      <pre 
                        className="text-xs whitespace-pre-wrap font-mono"
                        style={{ color: '#00ff88' }}
                      >
                        {result.raw_response}
                      </pre>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm" style={{ color: 'var(--status-error)' }}>
                        {result.error || 'Tidak ada hasil'}
                      </p>
                      {result.retry_suggested && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleSearch}
                          className="mt-2"
                        >
                          Coba Lagi
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </DraggableDialogContent>
    </DraggableDialog>
  );
};

// ============================================
// SIMPLE QUERY HISTORY DIALOG
// ============================================
export const SimpleQueryHistoryDialog = ({ open, onOpenChange, onSelectHistory }) => {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      params.append('limit', '100');
      if (filterType) params.append('query_type', filterType);
      
      const response = await fetch(`${API_URL}/api/simple-query/history?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setHistory(data.history || []);
      } else {
        toast.error('Gagal memuat history');
      }
    } catch (error) {
      console.error('Load history error:', error);
      toast.error('Gagal memuat history');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadHistory();
    }
  }, [open, filterType]);

  const handleViewDetail = (item) => {
    setSelectedItem(item);
    setDetailOpen(true);
  };

  const handleUseResult = (item) => {
    if (onSelectHistory) {
      onSelectHistory(item);
    }
    onOpenChange(false);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const getTypeIcon = (type) => {
    const icons = {
      capil_name: User,
      capil_nik: CreditCard,
      nkk: Users,
      reghp: Phone,
      passport_wna: Plane,
      passport_wni: Plane,
      passport_number: FileText,
      plat_mobil: Car,
      perlintasan: Plane
    };
    const Icon = icons[type] || Search;
    return <Icon className="w-4 h-4" />;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent 
          className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col"
          style={{ 
            backgroundColor: 'var(--background-elevated)',
            border: '1px solid var(--borders-default)'
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" style={{ color: 'var(--foreground-primary)' }}>
              <History className="w-5 h-5" style={{ color: '#10b981' }} />
              History Simple Query
              <span className="text-xs font-normal px-2 py-1 rounded" style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}>
                Shared Cache - Semua User
              </span>
            </DialogTitle>
          </DialogHeader>

          {/* Filter */}
          <div className="flex gap-2 flex-wrap py-2">
            <Button
              size="sm"
              variant={filterType === '' ? 'default' : 'outline'}
              onClick={() => setFilterType('')}
              style={filterType === '' ? { backgroundColor: '#10b981', color: '#000' } : {}}
            >
              Semua
            </Button>
            {QUERY_TYPES.map(type => (
              <Button
                key={type.id}
                size="sm"
                variant={filterType === type.id ? 'default' : 'outline'}
                onClick={() => setFilterType(type.id)}
                style={filterType === type.id ? { backgroundColor: '#10b981', color: '#000' } : {}}
              >
                {type.label}
              </Button>
            ))}
          </div>

          {/* History List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#10b981' }} />
                <span className="ml-2" style={{ color: 'var(--foreground-muted)' }}>Memuat history...</span>
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-8" style={{ color: 'var(--foreground-muted)' }}>
                Belum ada history pencarian
              </div>
            ) : (
              history.map((item, index) => (
                <div
                  key={item.cache_key || index}
                  className="p-3 rounded-lg border cursor-pointer hover:border-green-500 transition-colors"
                  style={{ 
                    backgroundColor: 'var(--background-tertiary)',
                    borderColor: 'var(--borders-default)'
                  }}
                  onClick={() => handleViewDetail(item)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div 
                        className="p-2 rounded"
                        style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)' }}
                      >
                        {getTypeIcon(item.query_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span 
                            className="text-xs px-2 py-0.5 rounded"
                            style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--foreground-muted)' }}
                          >
                            {item.type_label || item.query_type}
                          </span>
                        </div>
                        <p 
                          className="font-medium truncate mt-1"
                          style={{ color: 'var(--foreground-primary)' }}
                        >
                          {item.query_value}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs flex items-center gap-1" style={{ color: 'var(--foreground-muted)' }}>
                            <Clock className="w-3 h-3" />
                            {formatDate(item.created_at)}
                          </span>
                          {item.created_by && (
                            <span className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                              oleh: {item.created_by}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUseResult(item);
                      }}
                      style={{ borderColor: '#10b981', color: '#10b981' }}
                    >
                      Gunakan
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center pt-3 border-t" style={{ borderColor: 'var(--borders-default)' }}>
            <span className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
              Total: {history.length} hasil tersimpan
            </span>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Tutup
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent 
          className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
          style={{ 
            backgroundColor: 'var(--background-elevated)',
            border: '1px solid var(--borders-default)'
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" style={{ color: 'var(--foreground-primary)' }}>
              {selectedItem && getTypeIcon(selectedItem.query_type)}
              Detail: {selectedItem?.type_label || selectedItem?.query_type}
            </DialogTitle>
          </DialogHeader>

          {selectedItem && (
            <div className="flex-1 overflow-y-auto space-y-3">
              {/* Query Info */}
              <div 
                className="p-3 rounded-lg"
                style={{ backgroundColor: 'var(--background-tertiary)' }}
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-xs" style={{ color: 'var(--foreground-muted)' }}>Query:</span>
                    <p className="font-medium" style={{ color: 'var(--foreground-primary)' }}>
                      {selectedItem.query_value}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs" style={{ color: 'var(--foreground-muted)' }}>Waktu Cache:</span>
                    <p className="font-medium" style={{ color: 'var(--foreground-primary)' }}>
                      {formatDate(selectedItem.created_at)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Raw Response */}
              <div 
                className="p-4 rounded-lg border overflow-auto"
                style={{ 
                  backgroundColor: '#1a1a2e',
                  borderColor: 'var(--borders-default)',
                  maxHeight: '50vh'
                }}
              >
                {/* Photo Display */}
                {selectedItem.photo && (
                  <div className="flex flex-col items-center mb-4 p-3 rounded" style={{ backgroundColor: 'var(--background-tertiary)' }}>
                    <img 
                      src={selectedItem.photo} 
                      alt="Foto KTP"
                      className="max-w-[150px] max-h-[200px] rounded border mb-2"
                      style={{ borderColor: 'var(--borders-default)' }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = selectedItem.photo;
                        link.download = `foto_${selectedItem.query_value || 'nik'}.jpg`;
                        link.click();
                        toast.success('Foto berhasil didownload');
                      }}
                      className="text-xs"
                    >
                      <Download className="w-3 h-3 mr-1" />
                      Download Foto
                    </Button>
                  </div>
                )}
                <pre 
                  className="text-xs whitespace-pre-wrap font-mono"
                  style={{ color: '#00ff88' }}
                >
                  {selectedItem.raw_response || 'Tidak ada data'}
                </pre>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: 'var(--borders-default)' }}>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              Tutup
            </Button>
            <Button
              onClick={() => {
                handleUseResult(selectedItem);
                setDetailOpen(false);
              }}
              style={{ backgroundColor: '#10b981', color: '#000' }}
            >
              Gunakan Hasil Ini
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SimpleQueryDialog;
