import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { History, MapPin, Clock, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export const HistoryDialog = ({ open, onClose, target, onShowPath }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Format date for datetime-local input (YYYY-MM-DDTHH:MM)
  const formatDateTimeLocal = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  useEffect(() => {
    if (open && target) {
      // Set default date range
      // FROM (Dari): tanggal lebih AWAL/MUDA (30 hari lalu, jam 00:00)
      // TO (Sampai): tanggal lebih AKHIR/TUA (hari ini, jam 23:59)
      const now = new Date();
      
      // TO = hari ini jam 23:59 (tanggal lebih baru/tua)
      const toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59);
      
      // FROM = 30 hari sebelumnya jam 00:00 (tanggal lebih lama/muda)
      const fromDateObj = new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      fromDateObj.setHours(0, 0, 0, 0);
      
      const fromStr = formatDateTimeLocal(fromDateObj);
      const toStr = formatDateTimeLocal(toDate);
      
      console.log('Date range set:', { from: fromStr, to: toStr });
      
      setFromDate(fromStr);
      setToDate(toStr);
      
      // Fetch with the calculated dates directly
      fetchHistoryWithDates(fromStr, toStr);
    }
  }, [open, target]);

  const fetchHistoryWithDates = async (from, to) => {
    if (!target) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      let url = `${API}/targets/${target.id}/history`;
      
      // Add date filters if provided
      if (from && to) {
        const fromISO = new Date(from).toISOString();
        const toISO = new Date(to).toISOString();
        url += `?from_date=${encodeURIComponent(fromISO)}&to_date=${encodeURIComponent(toISO)}`;
      }

      console.log('Fetching history:', url);
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('History response:', response.data);
      setHistory(response.data.history || []);
      
      if ((response.data.history || []).length === 0) {
        toast.info('Tidak ada data history dalam rentang waktu ini');
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
      toast.error('Gagal memuat history: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = () => {
    // Validate date range
    if (fromDate && toDate) {
      const from = new Date(fromDate);
      const to = new Date(toDate);
      if (from > to) {
        toast.error('Tanggal awal harus lebih kecil dari tanggal akhir');
        return;
      }
    }
    fetchHistoryWithDates(fromDate, toDate);
  };

  const handleShowOnMap = () => {
    if (history.length > 0 && onShowPath) {
      onShowPath(history, target?.id); // Pass target ID for auto-refresh
      onClose();
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-lg"
        style={{ backgroundColor: 'var(--background-elevated)', borderColor: 'var(--borders-default)' }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: 'var(--foreground-primary)' }}>
            <History className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
            Riwayat Posisi: {target?.phone_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Date Range Filters */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>Dari</Label>
              <Input
                type="datetime-local"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-8 text-sm"
                style={{ 
                  backgroundColor: 'var(--background-tertiary)', 
                  borderColor: 'var(--borders-default)',
                  color: 'var(--foreground-primary)'
                }}
              />
            </div>
            <div>
              <Label className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>Sampai</Label>
              <Input
                type="datetime-local"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-8 text-sm"
                style={{ 
                  backgroundColor: 'var(--background-tertiary)', 
                  borderColor: 'var(--borders-default)',
                  color: 'var(--foreground-primary)'
                }}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={fetchHistory}
              disabled={loading}
              size="sm"
              className="flex-1"
              style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--background-primary)' }}
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Muat Data
            </Button>
            <Button
              onClick={handleShowOnMap}
              disabled={history.length === 0}
              size="sm"
              variant="outline"
              className="flex-1"
              style={{ borderColor: 'var(--accent-secondary)', color: 'var(--accent-secondary)' }}
            >
              <MapPin className="w-4 h-4 mr-1" />
              Tampilkan di Peta
            </Button>
          </div>

          {/* History List */}
          <div 
            className="border rounded-lg overflow-hidden"
            style={{ borderColor: 'var(--borders-default)', maxHeight: '300px', overflowY: 'auto' }}
          >
            {loading ? (
              <div className="p-4 text-center">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto" style={{ color: 'var(--accent-primary)' }} />
                <p className="text-xs mt-2" style={{ color: 'var(--foreground-muted)' }}>Memuat...</p>
              </div>
            ) : history.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
                  Tidak ada data history dalam rentang waktu ini
                </p>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ backgroundColor: 'var(--background-tertiary)' }}>
                    <th className="p-2 text-left" style={{ color: 'var(--foreground-secondary)' }}>
                      <Clock className="w-3 h-3 inline mr-1" />
                      Waktu
                    </th>
                    <th className="p-2 text-left" style={{ color: 'var(--foreground-secondary)' }}>
                      <MapPin className="w-3 h-3 inline mr-1" />
                      Koordinat
                    </th>
                    <th className="p-2 text-left" style={{ color: 'var(--foreground-secondary)' }}>Alamat</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item, idx) => (
                    <tr 
                      key={item.id || idx}
                      className="border-t hover:bg-opacity-50"
                      style={{ 
                        borderColor: 'var(--borders-subtle)',
                        backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.1)'
                      }}
                    >
                      <td className="p-2" style={{ color: 'var(--foreground-primary)' }}>
                        {formatDate(item.timestamp)}
                      </td>
                      <td className="p-2 font-mono" style={{ color: 'var(--accent-primary)', fontSize: '10px' }}>
                        {item.latitude?.toFixed(5)}, {item.longitude?.toFixed(5)}
                      </td>
                      <td 
                        className="p-2 truncate max-w-[150px]" 
                        style={{ color: 'var(--foreground-secondary)' }}
                        title={item.address}
                      >
                        {item.address || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <p className="text-xs text-center" style={{ color: 'var(--foreground-muted)' }}>
            Total: {history.length} data posisi
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
