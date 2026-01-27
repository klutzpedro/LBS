import React, { useState } from 'react';
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
  Check
} from 'lucide-react';
import { toast } from 'sonner';

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
export const SimpleQueryDialog = ({ open, onOpenChange }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [searchValue, setSearchValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

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
          width: isMinimized ? '300px' : '600px',
          maxWidth: '95vw',
          height: isMinimized ? 'auto' : '75vh',
          maxHeight: '85vh',
          backgroundColor: 'var(--background-elevated)',
          border: '1px solid var(--borders-default)'
        }}
      >
        <DraggableDialogHeader className="cursor-move flex-shrink-0 mb-3">
          <div className="flex items-center justify-between w-full">
            <DraggableDialogTitle className="flex items-center gap-2" style={{ color: 'var(--foreground-primary)' }}>
              <Search className="w-5 h-5" style={{ color: '#f59e0b' }} />
              Query Satuan
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
                style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', border: '1px solid #f59e0b' }}
              >
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#f59e0b' }} />
                <span className="text-sm" style={{ color: '#f59e0b' }}>{statusMessage}</span>
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
                          }`}
                          style={{
                            backgroundColor: selectedType === type.id 
                              ? 'rgba(245, 158, 11, 0.15)' 
                              : 'var(--background-tertiary)',
                            borderColor: selectedType === type.id 
                              ? '#f59e0b' 
                              : 'var(--borders-default)',
                            ringColor: '#f59e0b'
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <IconComponent 
                              className="w-4 h-4" 
                              style={{ color: selectedType === type.id ? '#f59e0b' : 'var(--foreground-muted)' }} 
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
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground-primary)' }}>
                    Hasil Query: {currentType?.label}
                  </h3>
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
                    <pre 
                      className="text-xs whitespace-pre-wrap font-mono"
                      style={{ color: '#00ff88' }}
                    >
                      {result.raw_response}
                    </pre>
                  ) : (
                    <p className="text-sm" style={{ color: 'var(--status-error)' }}>
                      {result.error || 'Tidak ada hasil'}
                    </p>
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

export default SimpleQueryDialog;
