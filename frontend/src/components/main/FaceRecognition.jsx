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
  AlertCircle,
  Upload,
  User,
  Minus,
  Maximize2,
  Download,
  RefreshCw,
  History,
  Search,
  Calendar,
  Percent,
  FileText,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// FR Button Component with separate History button (same style as Query Nama)
export const FaceRecognitionButton = ({ onOpenSearch, onOpenHistory, isProcessing = false }) => {
  return (
    <div className="flex gap-2">
      <Button
        onClick={onOpenSearch}
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
          padding: '10px 16px',
          borderRadius: '8px',
          textShadow: '0 1px 0 rgba(0,0,0,0.2)',
          animation: isProcessing ? 'pulse-fr 2s infinite' : 'none',
          width: '160px',
          height: '42px',
          justifyContent: 'center'
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
      {/* History Button - same style as Query Nama history */}
      <Button
        onClick={onOpenHistory}
        size="icon"
        className="shadow-xl hover:scale-105 transition-all duration-200"
        style={{
          background: 'linear-gradient(145deg, #06b6d4, #0891b2)',
          color: '#fff',
          border: 'none',
          boxShadow: '0 6px 20px rgba(6, 182, 212, 0.4), 0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.2)',
          borderRadius: '8px',
          width: '42px',
          height: '42px'
        }}
        title="History Face Recognition"
        data-testid="fr-history-btn"
      >
        <History className="w-5 h-5" />
      </Button>
    </div>
  );
};

// Main FR Search Dialog (without history tab)
export const FaceRecognitionDialog = ({ open, onOpenChange, telegramConnected = false }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  
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
  
  const fileInputRef = useRef(null);

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
  };

  // Reset state when dialog opens (always show fresh form)
  useEffect(() => {
    if (open) {
      console.log('[FR] Dialog opened - resetting to fresh state');
      resetSearchState();
    }
  }, [open]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Pilih file gambar (JPG, PNG, etc.)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Ukuran file maksimal 10MB');
      return;
    }

    // Compress image before upload to avoid 413 error
    compressImage(file, (compressedDataUrl) => {
      setUploadedImage(compressedDataUrl);
      setUploadedImagePreview(compressedDataUrl);
    });
  };

  // Compress image to reduce size for upload
  const compressImage = (file, callback, maxWidth = 1024, quality = 0.7) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions maintaining aspect ratio
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to JPEG with compression
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        
        // Log compression result
        const originalSize = file.size;
        const compressedSize = Math.round((compressedDataUrl.length * 3) / 4); // Approximate base64 decoded size
        console.log(`[FR] Image compressed: ${(originalSize/1024).toFixed(1)}KB -> ~${(compressedSize/1024).toFixed(1)}KB`);
        
        callback(compressedDataUrl);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      // Use same compression for dropped files
      compressImage(file, (compressedDataUrl) => {
        setUploadedImage(compressedDataUrl);
        setUploadedImagePreview(compressedDataUrl);
      });
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
      
      // Add timeout controller for long requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout
      
      let response;
      try {
        response = await fetch(`${API_URL}/api/face-recognition/match`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            image: uploadedImage
          }),
          signal: controller.signal
        });
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        if (fetchErr.name === 'AbortError') {
          throw new Error('Request timeout. Server terlalu lama merespons. Coba lagi.');
        }
        throw fetchErr;
      }
      clearTimeout(timeoutId);

      // Check content type before parsing
      const contentType = response.headers.get('content-type');
      
      if (!response.ok) {
        let errorMsg = 'Face recognition failed';
        
        // Only try to parse JSON if content-type is JSON
        if (contentType && contentType.includes('application/json')) {
          try {
            const error = await response.json();
            errorMsg = error.detail || errorMsg;
          } catch (e) {
            console.error('[FR] Failed to parse error response:', e);
          }
        } else {
          // Response is not JSON (likely HTML error page)
          errorMsg = `Server error (${response.status}). Coba lagi nanti.`;
        }
        
        // Check for Telegram setup errors
        if (errorMsg.includes('Telegram') || errorMsg.includes('login') || errorMsg.includes('setup') || errorMsg.includes('session')) {
          toast.error('⚠️ ' + errorMsg, { duration: 6000 });
          setStatusMessage('');
          setIsProcessing(false);
          setCurrentStep('upload');
          return;
        }
        
        throw new Error(errorMsg);
      }

      // Check content type for success response too
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Server mengembalikan response tidak valid. Coba lagi nanti.');
      }

      const data = await response.json();
      console.log('[FR] Match results:', data);
      
      // Check for quota error
      if (data.error === 'FR_QUOTA_EXHAUSTED') {
        toast.error(data.error_message || 'Kuota Face Recognition habis!');
        setCurrentStep('upload');
        setStatusMessage('');
        return;
      }
      
      setMatchResults(data.matches);
      setCurrentSessionId(data.session_id);
      setStatusMessage('Hasil pencocokan diterima. Mengambil data NIK terbaik...');
      setCurrentStep('fetching_nik');

      if (data.matches && data.matches.length > 0) {
        const topMatch = data.matches[0];
        setStatusMessage(`Mengambil detail NIK TOP: ${topMatch.nik} (${topMatch.percentage}%)...`);
        
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

        const nikContentType = nikResponse.headers.get('content-type');
        
        if (nikResponse.ok && nikContentType && nikContentType.includes('application/json')) {
          const nikResult = await nikResponse.json();
          console.log('[FR] NIK details:', nikResult);
          
          setNikData(nikResult.nik_data);
          setBotPhoto(nikResult.photo);
          setCurrentStep('completed');
          setStatusMessage('');
          toast.success('Face Recognition selesai!');
        } else {
          // Handle error or non-JSON response
          let errorMsg = 'Failed to fetch NIK details';
          if (nikContentType && nikContentType.includes('application/json')) {
            try {
              const errData = await nikResponse.json();
              errorMsg = errData.detail || errorMsg;
            } catch (e) { /* ignore */ }
          }
          throw new Error(errorMsg);
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

  const generatePDF = () => {
    if (!nikData && (!matchResults || matchResults.length === 0)) {
      toast.error('Tidak ada data untuk di-download');
      return;
    }

    const pdf = new jsPDF();
    let yPos = 20;
    const lineHeight = 7;
    const margin = 14;
    const pageHeight = 280;

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
    
    if (currentSessionId) {
      pdf.text(`Session ID: ${currentSessionId}`, margin, yPos);
      yPos += 10;
    }

    // Add photos side by side
    const photoWidth = 50;
    const photoHeight = 60;
    
    if (uploadedImagePreview || botPhoto) {
      yPos += 5;
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      
      // Input photo
      if (uploadedImagePreview) {
        pdf.text('FOTO INPUT:', margin, yPos);
        try {
          pdf.addImage(uploadedImagePreview, 'JPEG', margin, yPos + 3, photoWidth, photoHeight);
        } catch (e) {
          console.log('Error adding input photo to PDF:', e);
        }
      }
      
      // Database photo
      if (botPhoto) {
        pdf.text('FOTO DATABASE:', margin + 70, yPos);
        try {
          pdf.addImage(botPhoto, 'JPEG', margin + 70, yPos + 3, photoWidth, photoHeight);
        } catch (e) {
          console.log('Error adding database photo to PDF:', e);
        }
      }
      
      yPos += photoHeight + 10;
    }

    if (matchResults && matchResults.length > 0) {
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Hasil Pencocokan Wajah:', margin, yPos);
      yPos += lineHeight;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      matchResults.forEach((match, idx) => {
        const matchText = idx === 0 
          ? `${idx + 1}. NIK: ${match.nik} - ${match.percentage}% Match (TOP)`
          : `${idx + 1}. NIK: ${match.nik} - ${match.percentage}% Match`;
        pdf.text(matchText, margin + 5, yPos);
        yPos += lineHeight;
      });
      yPos += 5;
    }

    if (nikData) {
      if (yPos > pageHeight - 50) {
        pdf.addPage();
        yPos = 20;
      }
      
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Data NIK (TOP Match):', margin, yPos);
      yPos += lineHeight;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      Object.entries(nikData).forEach(([key, value]) => {
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

    pdf.setFontSize(8);
    pdf.text('Generated by NETRA - Face Recognition Module', 105, 285, { align: 'center' });

    const fileName = `FR_${nikData?.NIK || currentSessionId || 'result'}_${new Date().toISOString().split('T')[0]}.pdf`;
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

  return (
    <DraggableDialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent 
        className="overflow-hidden flex flex-col p-0"
        style={{ 
          width: isMinimized ? '280px' : '480px',
          maxWidth: '95vw',
          height: 'auto',
          maxHeight: '80vh',
          backgroundColor: 'var(--background-elevated)',
          border: '1px solid var(--borders-default)',
          borderRadius: '8px'
        }}
      >
        {/* Header with drag handle */}
        <div 
          className="cursor-move flex items-center justify-between px-3 py-2 flex-shrink-0"
          style={{ 
            backgroundColor: 'rgba(6, 182, 212, 0.1)',
            borderBottom: '1px solid var(--borders-default)'
          }}
        >
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4" style={{ color: '#06b6d4' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--foreground-primary)' }}>
              Face Recognition
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded hover:bg-white/10"
              onClick={() => setIsMinimized(!isMinimized)}
            >
              {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded hover:bg-red-500/20"
              onClick={() => onOpenChange(false)}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {!isMinimized && (
          <div className="flex-1 overflow-y-auto space-y-2 p-3" style={{ minHeight: 0 }}>
            {/* Telegram Warning - Show if not connected */}
            {!telegramConnected && currentStep === 'upload' && (
              <div 
                className="p-3 rounded-lg text-xs"
                style={{ 
                  backgroundColor: 'rgba(255, 184, 0, 0.15)',
                  border: '1px solid rgba(255, 184, 0, 0.5)',
                  color: 'var(--status-warning)'
                }}
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold mb-1">⚠️ Telegram Belum Terhubung</p>
                    <p className="text-[11px] opacity-90">
                      Fitur Face Recognition memerlukan Telegram yang sudah login. 
                      Silakan setup Telegram di menu <strong>Settings → Telegram Setup</strong> terlebih dahulu.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Status Message */}
            {statusMessage && (
              <div 
                className="p-2 rounded text-center text-xs"
                style={{ 
                  backgroundColor: 'rgba(6, 182, 212, 0.1)',
                  color: '#06b6d4'
                }}
              >
                <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                {statusMessage}
              </div>
            )}

            {/* Step Indicator */}
            {currentStep !== 'upload' && getStepIndicator()}

            {/* Upload Section */}
            {currentStep === 'upload' && (
              <div className="space-y-2">
                <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                  Upload foto wajah untuk mencari kecocokan di database Dukcapil
                </p>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-cyan-500 transition-colors"
                  style={{ 
                    borderColor: uploadedImagePreview ? '#06b6d4' : 'var(--borders-default)',
                    backgroundColor: 'var(--background-tertiary)'
                  }}
                >
                  {uploadedImagePreview ? (
                    <div className="space-y-2">
                      <img 
                        src={uploadedImagePreview} 
                        alt="Preview" 
                        className="max-h-32 mx-auto rounded-lg shadow-lg"
                      />
                      <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                        Klik untuk ganti foto
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="w-8 h-8 mx-auto" style={{ color: 'var(--foreground-muted)' }} />
                      <p className="text-sm" style={{ color: 'var(--foreground-primary)' }}>
                        Klik atau drag & drop foto
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
                  className="w-full h-8 text-sm"
                  style={{
                    background: uploadedImage ? 'linear-gradient(145deg, #06b6d4, #0891b2)' : '#4b5563',
                    color: '#fff'
                  }}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Memproses...
                    </>
                  ) : (
                    <>
                      <Camera className="w-3 h-3 mr-1" />
                      Mulai Face Recognition
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Results Section */}
            {(currentStep === 'completed' || currentStep === 'fetching_nik') && (
              <div className="space-y-2">
                {/* Photo Comparison */}
                {(uploadedImagePreview || botPhoto) && (
                  <div className="grid grid-cols-2 gap-2">
                    <div 
                      className="p-2 rounded-lg text-center"
                      style={{ backgroundColor: 'var(--background-tertiary)' }}
                    >
                      <p className="text-xs font-semibold mb-1" style={{ color: '#f59e0b' }}>
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
                              <span className="text-xs text-green-400">✓ TOP</span>
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
                      📋 Data NIK (TOP Match):
                    </p>
                    <div className="grid grid-cols-1 gap-2 text-xs">
                      {Object.entries(nikData).map(([key, value]) => {
                        if (key === 'photo' || !value) return null;
                        return (
                          <div key={key} className="flex flex-wrap">
                            <span 
                              className="w-28 flex-shrink-0 font-medium"
                              style={{ color: 'var(--foreground-muted)' }}
                            >
                              {key}:
                            </span>
                            <span className="flex-1 break-words" style={{ color: 'var(--foreground-primary)', wordBreak: 'break-word', minWidth: 0 }}>
                              {String(value)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* No Results */}
                {currentStep === 'completed' && (!matchResults || matchResults.length === 0) && (
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
              </div>
            )}
          </div>
        )}
        
        {/* Action Buttons - Fixed at bottom */}
        {!isMinimized && currentStep === 'completed' && (
          <div className="flex gap-2 pt-3 mt-3 border-t flex-shrink-0" style={{ borderColor: 'var(--borders-default)' }}>
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
                onClick={generatePDF}
                className="flex-1"
                style={{
                  background: 'linear-gradient(145deg, #10b981, #059669)',
                  color: '#fff'
                }}
                data-testid="fr-download-pdf-btn"
              >
                <Download className="w-4 h-4 mr-2" />
                Download PDF
              </Button>
            )}
          </div>
        )}
      </DraggableDialogContent>
    </DraggableDialog>
  );
};

// Separate FR History Dialog (same style as Query Nama History)
export const FaceRecognitionHistoryDialog = ({ open, onOpenChange, onSelectItem }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [historyList, setHistoryList] = useState([]);
  const [historySearch, setHistorySearch] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    if (open) {
      fetchHistory();
    }
  }, [open]);

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

  const generatePDF = (item) => {
    const pdf = new jsPDF();
    let yPos = 20;
    const lineHeight = 7;
    const margin = 14;
    const pageHeight = 280;

    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('LAPORAN FACE RECOGNITION', 105, yPos, { align: 'center' });
    yPos += 10;

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Tanggal: ${new Date(item.created_at).toLocaleDateString('id-ID', { 
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' 
    })}`, margin, yPos);
    yPos += 5;
    
    pdf.text(`Session ID: ${item.id}`, margin, yPos);
    yPos += 10;

    // Add photos side by side
    const photoWidth = 50;
    const photoHeight = 60;
    
    if (item.input_image_full || item.photo) {
      yPos += 5;
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      
      // Input photo
      if (item.input_image_full) {
        pdf.text('FOTO INPUT:', margin, yPos);
        try {
          pdf.addImage(item.input_image_full, 'JPEG', margin, yPos + 3, photoWidth, photoHeight);
        } catch (e) {
          console.log('Error adding input photo to PDF:', e);
        }
      }
      
      // Database photo
      if (item.photo) {
        pdf.text('FOTO DATABASE:', margin + 70, yPos);
        try {
          pdf.addImage(item.photo, 'JPEG', margin + 70, yPos + 3, photoWidth, photoHeight);
        } catch (e) {
          console.log('Error adding database photo to PDF:', e);
        }
      }
      
      yPos += photoHeight + 10;
    }

    if (item.matches && item.matches.length > 0) {
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Hasil Pencocokan Wajah:', margin, yPos);
      yPos += lineHeight;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      item.matches.forEach((match, idx) => {
        const matchText = idx === 0 
          ? `${idx + 1}. NIK: ${match.nik} - ${match.percentage}% Match (TOP)`
          : `${idx + 1}. NIK: ${match.nik} - ${match.percentage}% Match`;
        pdf.text(matchText, margin + 5, yPos);
        yPos += lineHeight;
      });
      yPos += 5;
    }

    if (item.nik_data) {
      if (yPos > pageHeight - 50) {
        pdf.addPage();
        yPos = 20;
      }
      
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Data NIK (TOP Match):', margin, yPos);
      yPos += lineHeight;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      Object.entries(item.nik_data).forEach(([key, value]) => {
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

    pdf.setFontSize(8);
    pdf.text('Generated by NETRA - Face Recognition Module', 105, 285, { align: 'center' });

    const fileName = `FR_${item.selected_nik || item.id}_${new Date().toISOString().split('T')[0]}.pdf`;
    pdf.save(fileName);
    toast.success('PDF berhasil diunduh');
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
        className={`${isMinimized ? 'h-auto' : 'max-h-[85vh]'} overflow-hidden flex flex-col p-0`}
        style={{ 
          width: isMinimized ? '300px' : '600px',
          maxWidth: '95vw',
          backgroundColor: 'var(--background-elevated)',
          border: '1px solid var(--borders-default)',
          borderRadius: '8px'
        }}
      >
        {/* Header with drag handle */}
        <div 
          className="cursor-move flex items-center justify-between px-3 py-2 flex-shrink-0"
          style={{ 
            backgroundColor: 'rgba(6, 182, 212, 0.1)',
            borderBottom: '1px solid var(--borders-default)'
          }}
        >
          <div className="flex items-center gap-2">
            <History className="w-4 h-4" style={{ color: '#06b6d4' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--foreground-primary)' }}>
              History Face Recognition
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded hover:bg-white/10"
              onClick={() => setIsMinimized(!isMinimized)}
            >
              {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded hover:bg-red-500/20"
              onClick={() => onOpenChange(false)}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {!isMinimized && (
          <div className="flex-1 overflow-hidden flex flex-col p-3">
            {/* Search Filter */}
            <div className="relative mb-4">
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
            <div className="flex-1 overflow-y-auto">
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
                <div className="space-y-2">
                  {filteredHistory.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-3 rounded-lg hover:ring-2 hover:ring-cyan-500 transition-all"
                      style={{ backgroundColor: 'var(--background-tertiary)' }}
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
                            onClick={() => generatePDF(item)}
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
          </div>
        )}
      </DraggableDialogContent>
    </DraggableDialog>
  );
};

export default FaceRecognitionDialog;
