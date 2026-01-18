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

  useEffect(() => {
    if (open && target) {
      // Set default date range (last 7 days)
      const today = new Date();
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      setToDate(today.toISOString().split('T')[0] + 'T23:59');
      setFromDate(weekAgo.toISOString().split('T')[0] + 'T00:00');
      fetchHistory();
    }
  }, [open, target]);

  const fetchHistory = async () => {
    if (!target) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      // Fetch all history first without date filter to ensure we get data
      let url = `${API}/targets/${target.id}/history`;
      
      // Only add date filters if both are set
      if (fromDate && toDate) {
        const fromISO = new Date(fromDate).toISOString();
        const toISO = new Date(toDate).toISOString();
        url += `?from_date=${encodeURIComponent(fromISO)}&to_date=${encodeURIComponent(toISO)}`;
      }

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setHistory(response.data.history || []);
    } catch (error) {
      console.error('Failed to fetch history:', error);
      toast.error('Gagal memuat history');
    } finally {
      setLoading(false);
    }
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
