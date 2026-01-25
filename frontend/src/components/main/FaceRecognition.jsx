import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  DraggableDialog, 
  DraggableDialogContent, 
  DraggableDialogHeader, 
  DraggableDialogTitle 
} from '@/components/ui/draggable-dialog';
import { 
  Camera, 
  Loader2, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Upload,
  User,
  Minus,
  Maximize2,
  Download,
  RefreshCw,
  History,
  Search,
  ArrowLeft,
  Calendar,
  Percent,
  FileText
} from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// FR Button Component
export const FaceRecognitionButton = ({ onClick, isProcessing = false }) => {
  return (
    <Button
      onClick={onClick}
      className="shadow-xl hover:scale-105 transition-all duration-200"
      style={{
        background: isProcessing 
          ? 'linear-gradient(145deg, #ef4444, #dc2626)' 
          : 'linear-gradient(145deg, #06b6d4, #0891b2)',
        color: '#fff',
        border: 'none',
        boxShadow: isProcessing 
          ? '0 6px 20px rgba(239, 68, 68, 0.4), 0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.3)'
          : '0 6px 20px rgba(6, 182, 212, 0.4), 0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.3)',
        fontWeight: 'bold',
        padding: '10px 20px',
        borderRadius: '8px',
        textShadow: '0 1px 0 rgba(0,0,0,0.2)',
        animation: isProcessing ? 'pulse-fr 2s infinite' : 'none'
      }}
      data-testid="face-recognition-btn"
    >
      <style>
        {`
          @keyframes pulse-fr {
            0%, 100% { box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4), 0 2px 4px rgba(0,0,0,0.2); }
            50% { box-shadow: 0 6px 30px rgba(239, 68, 68, 0.7), 0 2px 4px rgba(0,0,0,0.2); }
          }
        `}
      </style>
      {isProcessing ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Processing...
        </>
      ) : (
        <>
          <Camera className="w-4 h-4 mr-2" />
          Face Recognition
        </>
      )}
    </Button>
  );
};

// Main FR Dialog Component
export const FaceRecognitionDialog = ({ open, onOpenChange }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState('search'); // 'search' or 'history'
  
  // Search/Upload state
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedImagePreview, setUploadedImagePreview] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState('upload'); // upload, matching, fetching_nik, completed
  const [matchResults, setMatchResults] = useState(null);
  const [nikData, setNikData] = useState(null);
  const [botPhoto, setBotPhoto] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [currentSessionId, setCurrentSessionId] = useState(null);
  
  // History state
  const [historyList, setHistoryList] = useState([]);
  const [historySearch, setHistorySearch] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
  
  const fileInputRef = useRef(null);

  // Fetch history when dialog opens or tab changes to history
  useEffect(() => {
    if (open && activeTab === 'history') {
      fetchHistory();
    }
  }, [open, activeTab]);

  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/face-recognition/history`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setHistoryList(data.history || []);
      }
    } catch (error) {
      console.error('[FR] Error fetching history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const resetSearchState = () => {
    setUploadedImage(null);
    setUploadedImagePreview(null);
    setIsProcessing(false);
    setCurrentStep('upload');
    setMatchResults(null);
    setNikData(null);
    setBotPhoto(null);
    setStatusMessage('');
    setCurrentSessionId(null);
    setSelectedHistoryItem(null);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Pilih file gambar (JPG, PNG, etc.)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ukuran file maksimal 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadedImage(event.target.result);
      setUploadedImagePreview(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadedImage(event.target.result);
        setUploadedImagePreview(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const startFaceRecognition = async () => {
    if (!uploadedImage) {
      toast.error('Upload foto terlebih dahulu');
      return;
    }

    setIsProcessing(true);
    setCurrentStep('matching');
    setStatusMessage('Mengirim foto ke bot Telegram...');

    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${API_URL}/api/face-recognition/match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          image: uploadedImage
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Face recognition failed');
      }

      const data = await response.json();
      console.log('[FR] Match results:', data);
      
      setMatchResults(data.matches);
      setCurrentSessionId(data.session_id);
      setStatusMessage('Hasil pencocokan diterima. Mengambil data NIK terbaik...');
      setCurrentStep('fetching_nik');

      if (data.matches && data.matches.length > 0) {
        const topMatch = data.matches[0];
        setStatusMessage(`Mengambil detail NIK ${topMatch.nik}...`);
        
        const nikResponse = await fetch(`${API_URL}/api/face-recognition/get-nik-details`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            nik: topMatch.nik,
            fr_session_id: data.session_id
          })
        });

        if (nikResponse.ok) {
          const nikResult = await nikResponse.json();
          console.log('[FR] NIK details:', nikResult);
          
          setNikData(nikResult.nik_data);
          setBotPhoto(nikResult.photo);
          setCurrentStep('completed');
          setStatusMessage('');
          toast.success('Face Recognition selesai!');
          
          // Refresh history after successful search
          fetchHistory();
        } else {
          throw new Error('Failed to fetch NIK details');
        }
      } else {
        setCurrentStep('completed');
        setStatusMessage('Tidak ditemukan kecocokan wajah');
        toast.warning('Tidak ditemukan kecocokan wajah');
      }

    } catch (error) {
      console.error('[FR] Error:', error);
      toast.error(error.message || 'Face Recognition gagal');
      setCurrentStep('upload');
      setStatusMessage('');
    } finally {
      setIsProcessing(false);
    }
  };

  const loadHistoryItem = (item) => {
    setSelectedHistoryItem(item);
    setUploadedImagePreview(item.input_image_full || null);
    setMatchResults(item.matches || []);
    setNikData(item.nik_data || null);
    setBotPhoto(item.photo || null);
    setCurrentStep('completed');
    setActiveTab('search');
  };

  const generatePDF = (data = null) => {
    const pdfData = data || {
      matches: matchResults,
      nikData: nikData,
      inputImage: uploadedImagePreview,
      botPhoto: botPhoto,
      sessionId: currentSessionId || selectedHistoryItem?.id
    };

    if (!pdfData.nikData && (!pdfData.matches || pdfData.matches.length === 0)) {
      toast.error('Tidak ada data untuk di-download');
      return;
    }

    const pdf = new jsPDF();
    let yPos = 20;
    const lineHeight = 7;
    const margin = 14;
    const pageHeight = 280;

    // Title
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('LAPORAN FACE RECOGNITION', 105, yPos, { align: 'center' });
    yPos += 10;

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Tanggal: ${new Date().toLocaleDateString('id-ID', { 
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' 
    })}`, margin, yPos);
    yPos += 5;
    
    if (pdfData.sessionId) {
      pdf.text(`Session ID: ${pdfData.sessionId}`, margin, yPos);
      yPos += 10;
    }

    // Match Results
    if (pdfData.matches && pdfData.matches.length > 0) {
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Hasil Pencocokan Wajah:', margin, yPos);
      yPos += lineHeight;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdfData.matches.forEach((match, idx) => {
        pdf.text(`${idx + 1}. NIK: ${match.nik} - ${match.percentage}% Match`, margin + 5, yPos);
        yPos += lineHeight;
      });
      yPos += 5;
    }

    // NIK Data
    if (pdfData.nikData) {
      if (yPos > pageHeight - 50) {
        pdf.addPage();
        yPos = 20;
      }
      
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Data NIK:', margin, yPos);
      yPos += lineHeight;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      Object.entries(pdfData.nikData).forEach(([key, value]) => {
        if (key !== 'photo' && value) {
          if (yPos > pageHeight) {
            pdf.addPage();
            yPos = 20;
          }
          pdf.text(`${key}: ${String(value)}`, margin + 5, yPos);
          yPos += lineHeight;
        }
      });
    }

    // Footer
    pdf.setFontSize(8);
    pdf.text('Generated by WASKITA LBS - Face Recognition Module', 105, 285, { align: 'center' });

    const fileName = `FR_${pdfData.nikData?.NIK || pdfData.sessionId || 'result'}_${new Date().toISOString().split('T')[0]}.pdf`;
    pdf.save(fileName);
    toast.success('PDF berhasil diunduh');
  };

  const getStepIndicator = () => {
    const steps = [
      { key: 'upload', label: 'Upload' },
      { key: 'matching', label: 'Cocokkan' },
      { key: 'fetching_nik', label: 'Ambil Data' },
      { key: 'completed', label: 'Selesai' }
    ];

    const currentIndex = steps.findIndex(s => s.key === currentStep);

    return (
      <div className="flex items-center justify-center gap-1 mb-4">
        {steps.map((step, idx) => (
          <React.Fragment key={step.key}>
            <div 
              className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                idx < currentIndex ? 'bg-green-500 text-white' :
                idx === currentIndex ? 'bg-cyan-500 text-white' :
                'bg-gray-600 text-gray-400'
              }`}
            >
              {idx < currentIndex ? <CheckCircle className="w-4 h-4" /> : idx + 1}
            </div>
            {idx < steps.length - 1 && (
              <div className={`w-6 h-0.5 ${idx < currentIndex ? 'bg-green-500' : 'bg-gray-600'}`} />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  // Filter history based on search
  const filteredHistory = historyList.filter(item => {
    if (!historySearch) return true;
    const searchLower = historySearch.toLowerCase();
    return (
      (item.selected_nik && item.selected_nik.includes(historySearch)) ||
      (item.nik_data?.Nama && item.nik_data.Nama.toLowerCase().includes(searchLower)) ||
      (item.id && item.id.includes(searchLower))
    );
  });

  return (
    <DraggableDialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent 
        className={`${isMinimized ? 'h-auto' : 'max-h-[85vh]'} overflow-hidden flex flex-col`}
        style={{ 
          width: isMinimized ? '300px' : '750px',
          maxWidth: '95vw',
          backgroundColor: 'var(--background-elevated)',
          border: '1px solid var(--borders-default)'
        }}
      >
        <DraggableDialogHeader className="cursor-move flex-shrink-0">
          <div className="flex items-center justify-between w-full">
            <DraggableDialogTitle className="flex items-center gap-2" style={{ color: 'var(--foreground-primary)' }}>
              <Camera className="w-5 h-5" style={{ color: '#06b6d4' }} />
              Face Recognition
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
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Tab Navigation */}
            <div className="flex border-b" style={{ borderColor: 'var(--borders-default)' }}>
              <button
                onClick={() => { setActiveTab('search'); setSelectedHistoryItem(null); }}
                className={`flex-1 py-2 px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                  activeTab === 'search' 
                    ? 'border-b-2 border-cyan-500 text-cyan-500' 
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Camera className="w-4 h-4" />
                Pencarian Baru
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex-1 py-2 px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                  activeTab === 'history' 
                    ? 'border-b-2 border-cyan-500 text-cyan-500' 
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <History className="w-4 h-4" />
                History ({historyList.length})
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {/* SEARCH TAB */}
              {activeTab === 'search' && (
                <div className="space-y-4">
                  {/* Back button if viewing from history */}
                  {selectedHistoryItem && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        resetSearchState();
                        setActiveTab('history');
                      }}
                      className="mb-2"
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Kembali ke History
                    </Button>
                  )}

                  {/* Status Message */}
                  {statusMessage && (
                    <div 
                      className="p-3 rounded-md text-center text-sm"
                      style={{ 
                        backgroundColor: 'rgba(6, 182, 212, 0.1)',
                        color: '#06b6d4'
                      }}
                    >
                      <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                      {statusMessage}
                    </div>
                  )}

                  {/* Step Indicator - only show during active search */}
                  {!selectedHistoryItem && currentStep !== 'upload' && getStepIndicator()}

                  {/* Upload Section */}
                  {currentStep === 'upload' && !selectedHistoryItem && (
                    <div className="space-y-4">
                      <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
                        Upload foto wajah untuk mencari kecocokan di database Dukcapil
                      </p>

                      <div
                        onClick={() => fileInputRef.current?.click()}
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-cyan-500 transition-colors"
                        style={{ 
                          borderColor: uploadedImagePreview ? '#06b6d4' : 'var(--borders-default)',
                          backgroundColor: 'var(--background-tertiary)'
                        }}
                      >
                        {uploadedImagePreview ? (
                          <div className="space-y-3">
                            <img 
                              src={uploadedImagePreview} 
                              alt="Preview" 
                              className="max-h-48 mx-auto rounded-lg shadow-lg"
                            />
                            <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                              Klik untuk ganti foto
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <Upload className="w-12 h-12 mx-auto" style={{ color: 'var(--foreground-muted)' }} />
                            <p style={{ color: 'var(--foreground-primary)' }}>
                              Klik atau drag & drop foto di sini
                            </p>
                            <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                              Format: JPG, PNG (Max 5MB)
                            </p>
                          </div>
                        )}
                      </div>

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileSelect}
                        className="hidden"
                      />

                      <Button
                        onClick={startFaceRecognition}
                        disabled={!uploadedImage || isProcessing}
                        className="w-full"
                        style={{
                          background: uploadedImage ? 'linear-gradient(145deg, #06b6d4, #0891b2)' : '#4b5563',
                          color: '#fff'
                        }}
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Memproses...
                          </>
                        ) : (
                          <>
                            <Camera className="w-4 h-4 mr-2" />
                            Mulai Face Recognition
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Results Section */}
                  {(currentStep === 'completed' || currentStep === 'fetching_nik' || selectedHistoryItem) && (
                    <div className="space-y-4">
                      {/* Photo Comparison */}
                      {(uploadedImagePreview || botPhoto) && (
                        <div className="grid grid-cols-2 gap-4">
                          <div 
                            className="p-3 rounded-lg text-center"
                            style={{ backgroundColor: 'var(--background-tertiary)' }}
                          >
                            <p className="text-xs font-semibold mb-2" style={{ color: '#f59e0b' }}>
                              📷 FOTO INPUT
                            </p>
                            {uploadedImagePreview ? (
                              <img 
                                src={uploadedImagePreview} 
                                alt="Input" 
                                className="max-h-36 mx-auto rounded-lg border-2"
                                style={{ borderColor: '#f59e0b' }}
                              />
                            ) : (
                              <div className="h-36 flex items-center justify-center">
                                <User className="w-12 h-12" style={{ color: 'var(--foreground-muted)' }} />
                              </div>
                            )}
                          </div>

                          <div 
                            className="p-3 rounded-lg text-center"
                            style={{ backgroundColor: 'var(--background-tertiary)' }}
                          >
                            <p className="text-xs font-semibold mb-2" style={{ color: '#10b981' }}>
                              🎯 FOTO DATABASE
                            </p>
                            {botPhoto ? (
                              <img 
                                src={botPhoto} 
                                alt="Database" 
                                className="max-h-36 mx-auto rounded-lg border-2"
                                style={{ borderColor: '#10b981' }}
                              />
                            ) : currentStep === 'fetching_nik' ? (
                              <div className="h-36 flex items-center justify-center">
                                <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
                              </div>
                            ) : (
                              <div className="h-36 flex items-center justify-center">
                                <User className="w-12 h-12" style={{ color: 'var(--foreground-muted)' }} />
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Match Results */}
                      {matchResults && matchResults.length > 0 && (
                        <div 
                          className="p-3 rounded-lg"
                          style={{ backgroundColor: 'var(--background-tertiary)' }}
                        >
                          <p className="text-sm font-semibold mb-2" style={{ color: 'var(--foreground-primary)' }}>
                            <Percent className="w-4 h-4 inline mr-1" />
                            Hasil Pencocokan Wajah:
                          </p>
                          <div className="space-y-2 max-h-32 overflow-y-auto">
                            {matchResults.map((match, idx) => (
                              <div 
                                key={idx}
                                className={`flex items-center justify-between p-2 rounded ${idx === 0 ? 'ring-2 ring-green-500' : ''}`}
                                style={{ backgroundColor: 'var(--background-secondary)' }}
                              >
                                <span className="font-mono text-sm" style={{ color: 'var(--accent-primary)' }}>
                                  {match.nik}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span 
                                    className={`px-2 py-1 rounded text-xs font-bold ${
                                      match.percentage >= 80 ? 'bg-green-500/20 text-green-400' :
                                      match.percentage >= 50 ? 'bg-yellow-500/20 text-yellow-400' :
                                      'bg-red-500/20 text-red-400'
                                    }`}
                                  >
                                    {match.percentage}%
                                  </span>
                                  {idx === 0 && (
                                    <span className="text-xs text-green-400">✓ Top</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* NIK Data */}
                      {nikData && (
                        <div 
                          className="p-3 rounded-lg"
                          style={{ backgroundColor: 'var(--background-tertiary)' }}
                        >
                          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--foreground-primary)' }}>
                            📋 Data NIK:
                          </p>
                          <div className="grid grid-cols-2 gap-2 text-xs max-h-40 overflow-y-auto">
                            {Object.entries(nikData).map(([key, value]) => {
                              if (key === 'photo' || !value) return null;
                              return (
                                <div key={key} className="flex">
                                  <span 
                                    className="w-24 flex-shrink-0 font-medium"
                                    style={{ color: 'var(--foreground-muted)' }}
                                  >
                                    {key}:
                                  </span>
                                  <span style={{ color: 'var(--foreground-primary)' }}>
                                    {String(value)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* No Results */}
                      {currentStep === 'completed' && !selectedHistoryItem && (!matchResults || matchResults.length === 0) && (
                        <div 
                          className="p-6 rounded-lg text-center"
                          style={{ backgroundColor: 'var(--background-tertiary)' }}
                        >
                          <AlertCircle className="w-12 h-12 mx-auto mb-3 text-yellow-500" />
                          <p style={{ color: 'var(--foreground-primary)' }}>
                            Tidak ditemukan kecocokan wajah
                          </p>
                          <p className="text-xs mt-2" style={{ color: 'var(--foreground-muted)' }}>
                            Coba upload foto dengan kualitas lebih baik
                          </p>
                        </div>
                      )}

                      {/* Action Buttons */}
                      {(currentStep === 'completed' || selectedHistoryItem) && (
                        <div className="flex gap-2">
                          <Button
                            onClick={resetSearchState}
                            variant="outline"
                            className="flex-1"
                          >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Cari Baru
                          </Button>
                          {(nikData || (matchResults && matchResults.length > 0)) && (
                            <Button
                              onClick={() => generatePDF()}
                              className="flex-1"
                              style={{
                                background: 'linear-gradient(145deg, #10b981, #059669)',
                                color: '#fff'
                              }}
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Download PDF
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* HISTORY TAB */}
              {activeTab === 'history' && (
                <div className="space-y-4">
                  {/* Search Filter */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--foreground-muted)' }} />
                    <Input
                      placeholder="Cari NIK atau nama..."
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      className="pl-10"
                      style={{
                        backgroundColor: 'var(--background-tertiary)',
                        borderColor: 'var(--borders-default)'
                      }}
                    />
                  </div>

                  {/* History List */}
                  {isLoadingHistory ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
                    </div>
                  ) : filteredHistory.length === 0 ? (
                    <div className="text-center py-8">
                      <History className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--foreground-muted)' }} />
                      <p style={{ color: 'var(--foreground-muted)' }}>
                        {historySearch ? 'Tidak ada hasil yang cocok' : 'Belum ada history pencarian'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                      {filteredHistory.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          className="p-3 rounded-lg cursor-pointer hover:ring-2 hover:ring-cyan-500 transition-all"
                          style={{ backgroundColor: 'var(--background-tertiary)' }}
                          onClick={() => loadHistoryItem(item)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm" style={{ color: 'var(--accent-primary)' }}>
                                  {item.selected_nik || 'No NIK'}
                                </span>
                                {item.matches && item.matches.length > 0 && (
                                  <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">
                                    {item.matches[0]?.percentage || 0}% Match
                                  </span>
                                )}
                              </div>
                              {item.nik_data?.Nama && (
                                <p className="text-sm mt-1" style={{ color: 'var(--foreground-primary)' }}>
                                  {item.nik_data.Nama}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: 'var(--foreground-muted)' }}>
                                <Calendar className="w-3 h-3" />
                                {new Date(item.created_at).toLocaleDateString('id-ID', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  generatePDF({
                                    matches: item.matches,
                                    nikData: item.nik_data,
                                    sessionId: item.id
                                  });
                                }}
                                title="Download PDF"
                              >
                                <FileText className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </DraggableDialogContent>
    </DraggableDialog>
  );
};

export default FaceRecognitionDialog;
