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
  Plane,
  Globe
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export const NonGeointButton = ({ onOpenSearch }) => {
  return (
    <Button
      onClick={onOpenSearch}
      className="shadow-lg"
      style={{
        backgroundColor: 'var(--accent-secondary)',
        color: 'var(--background-primary)',
        border: '2px solid var(--accent-secondary)'
      }}
      data-testid="nongeoint-search-btn"
    >
      <Search className="w-4 h-4 mr-2" />
      NON GEOINT
    </Button>
  );
};

export const NonGeointSearchDialog = ({ 
  open, 
  onOpenChange, 
  onNikPendalaman 
}) => {
  const [searchName, setSearchName] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [currentSearchId, setCurrentSearchId] = useState(null);
  const [searchResults, setSearchResults] = useState(null);
  const [selectedNiks, setSelectedNiks] = useState([]);
  const [processingPendalaman, setProcessingPendalaman] = useState(false);
  const pollingRef = useRef(null);

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      // Reset state when dialog closes
      setIsSearching(false);
      setCurrentSearchId(null);
    }
  }, [open]);

  const startSearch = async () => {
    if (!searchName.trim()) {
      toast.error('Masukkan nama untuk dicari');
      return;
    }

    setIsSearching(true);
    setSearchResults(null);
    setSelectedNiks([]);

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
      setCurrentSearchId(data.search_id);
      
      // Start polling for results
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

      // Stop polling when completed or error
      if (data.status === 'completed' || data.status === 'error') {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        setIsSearching(false);

        if (data.status === 'completed' && data.niks_found?.length > 0) {
          toast.success(`Ditemukan ${data.niks_found.length} NIK`);
        } else if (data.status === 'error') {
          toast.error(data.error || 'Search failed');
        }
      }
    } catch (error) {
      console.error('Polling error:', error);
    }
  };

  const handleNikToggle = (nik) => {
    setSelectedNiks(prev => 
      prev.includes(nik) 
        ? prev.filter(n => n !== nik)
        : [...prev, nik]
    );
  };

  const handleSelectAll = () => {
    if (searchResults?.niks_found) {
      if (selectedNiks.length === searchResults.niks_found.length) {
        setSelectedNiks([]);
      } else {
        setSelectedNiks([...searchResults.niks_found]);
      }
    }
  };

  const handlePendalaman = async () => {
    if (selectedNiks.length === 0) {
      toast.error('Pilih minimal satu NIK untuk pendalaman');
      return;
    }

    setProcessingPendalaman(true);
    toast.info(`Memulai pendalaman ${selectedNiks.length} NIK...`);

    // Call pendalaman for each selected NIK
    for (const nik of selectedNiks) {
      if (onNikPendalaman) {
        await onNikPendalaman(nik);
        // Small delay between calls
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    setProcessingPendalaman(false);
    toast.success('Pendalaman selesai');
    onOpenChange(false);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-2xl max-h-[80vh] overflow-y-auto"
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
              disabled={isSearching}
              style={{
                backgroundColor: 'var(--background-tertiary)',
                borderColor: 'var(--borders-default)',
                color: 'var(--foreground-primary)'
              }}
              data-testid="nongeoint-name-input"
            />
            <Button
              onClick={startSearch}
              disabled={isSearching || !searchName.trim()}
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--background-primary)'
              }}
              data-testid="nongeoint-start-search-btn"
            >
              {isSearching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </Button>
          </div>

          <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
            Pencarian akan dilakukan secara berurutan: CAPIL → Passport WNI → Passport WNA
          </p>
        </div>

        {/* Search Progress / Results */}
        {(isSearching || searchResults) && (
          <div className="mt-6 space-y-4">
            <h3 
              className="text-sm font-semibold"
              style={{ color: 'var(--foreground-secondary)' }}
            >
              {isSearching ? 'Proses Pencarian...' : 'Hasil Pencarian'}
            </h3>

            {/* Query Status */}
            <div className="space-y-2">
              {['capil', 'pass_wni', 'pass_wna'].map(queryType => {
                const result = searchResults?.results?.[queryType];
                const status = result?.status || (isSearching ? 'pending' : 'pending');
                
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
                      {getStatusIcon(status)}
                    </div>
                    
                    {result?.niks_found?.length > 0 && (
                      <div className="mt-2 text-xs" style={{ color: 'var(--foreground-muted)' }}>
                        NIK ditemukan: {result.niks_found.join(', ')}
                      </div>
                    )}
                    
                    {result?.error && (
                      <div className="mt-2 text-xs text-red-400">
                        {result.error}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* NIK Results */}
            {searchResults?.niks_found?.length > 0 && !isSearching && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 
                    className="text-sm font-semibold"
                    style={{ color: 'var(--foreground-secondary)' }}
                  >
                    NIK Ditemukan ({searchResults.niks_found.length})
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAll}
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    {selectedNiks.length === searchResults.niks_found.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
                  </Button>
                </div>

                <div className="space-y-2">
                  {searchResults.niks_found.map(nik => (
                    <div 
                      key={nik}
                      className="flex items-center gap-3 p-3 rounded-md border cursor-pointer hover:bg-opacity-50"
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

                {/* Pendalaman Button */}
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    style={{
                      borderColor: 'var(--borders-default)',
                      color: 'var(--foreground-secondary)'
                    }}
                  >
                    Tutup
                  </Button>
                  <Button
                    onClick={handlePendalaman}
                    disabled={selectedNiks.length === 0 || processingPendalaman}
                    style={{
                      backgroundColor: 'var(--accent-primary)',
                      color: 'var(--background-primary)'
                    }}
                    data-testid="nongeoint-pendalaman-btn"
                  >
                    {processingPendalaman ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Memproses...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4 mr-2" />
                        Pendalaman NIK ({selectedNiks.length})
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* No Results */}
            {searchResults?.status === 'completed' && searchResults?.niks_found?.length === 0 && (
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
  );
};

export default NonGeointSearchDialog;
