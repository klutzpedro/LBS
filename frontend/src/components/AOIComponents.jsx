import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Target, 
  Plus, 
  Trash2, 
  Eye, 
  EyeOff, 
  Bell, 
  BellOff,
  Pencil,
  Check,
  X,
  MapPin,
  Search
} from 'lucide-react';
import { toast } from 'sonner';

export const AOIPanel = ({ 
  open, 
  onClose, 
  targets, 
  onStartDrawing, 
  onToggleAOIVisibility,
  aois,
  setAois,
  refreshAOIs
}) => {
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [newAOI, setNewAOI] = useState({
    name: '',
    aoi_type: 'polygon',
    coordinates: '',
    radius: 500,
    monitored_targets: []
  });
  const [showNewForm, setShowNewForm] = useState(false);

  const fetchAOIs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/aois`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAois(response.data.aois || []);
    } catch (error) {
      console.error('Failed to fetch AOIs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchAOIs();
    }
  }, [open]);

  const handleCreateAOI = async () => {
    if (!newAOI.name.trim()) {
      toast.error('Nama AOI harus diisi');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      
      // Parse coordinates
      let coords = [];
      if (newAOI.coordinates.trim()) {
        const coordLines = newAOI.coordinates.split('\n').filter(l => l.trim());
        coords = coordLines.map(line => {
          const [lat, lng] = line.split(',').map(s => parseFloat(s.trim()));
          return [lat, lng];
        });
      }

      const payload = {
        name: newAOI.name,
        aoi_type: newAOI.aoi_type,
        coordinates: coords,
        radius: newAOI.aoi_type === 'circle' ? parseFloat(newAOI.radius) : null,
        monitored_targets: newAOI.monitored_targets,
        is_visible: false, // Default hidden
        alarm_enabled: true
      };

      await axios.post(`${API}/aois`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success('AOI berhasil dibuat');
      setNewAOI({ name: '', aoi_type: 'polygon', coordinates: '', radius: 500, monitored_targets: [] });
      setShowNewForm(false);
      fetchAOIs();
      if (refreshAOIs) refreshAOIs();
    } catch (error) {
      console.error('Failed to create AOI:', error);
      toast.error('Gagal membuat AOI');
    }
  };

  const handleDeleteAOI = async (aoiId) => {
    if (!confirm('Hapus AOI ini?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/aois/${aoiId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('AOI dihapus');
      fetchAOIs();
      if (refreshAOIs) refreshAOIs();
    } catch (error) {
      console.error('Failed to delete AOI:', error);
      toast.error('Gagal menghapus AOI');
    }
  };

  const handleToggleVisibility = async (aoi) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/aois/${aoi.id}`, {
        is_visible: !aoi.is_visible
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchAOIs();
      if (onToggleAOIVisibility) onToggleAOIVisibility(aoi.id, !aoi.is_visible);
      if (refreshAOIs) refreshAOIs();
    } catch (error) {
      console.error('Failed to toggle visibility:', error);
    }
  };

  const handleToggleAlarm = async (aoi) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/aois/${aoi.id}`, {
        alarm_enabled: !aoi.alarm_enabled
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(aoi.alarm_enabled ? 'Alarm dinonaktifkan' : 'Alarm diaktifkan');
      fetchAOIs();
      if (refreshAOIs) refreshAOIs();
    } catch (error) {
      console.error('Failed to toggle alarm:', error);
    }
  };

  const handleUpdateTargets = async (aoi, targetId, add) => {
    try {
      const token = localStorage.getItem('token');
      let newTargets = [...(aoi.monitored_targets || [])];
      
      if (add) {
        if (!newTargets.includes(targetId)) {
          newTargets.push(targetId);
        }
      } else {
        newTargets = newTargets.filter(t => t !== targetId);
      }

      await axios.put(`${API}/aois/${aoi.id}`, {
        monitored_targets: newTargets
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchAOIs();
      if (refreshAOIs) refreshAOIs();
    } catch (error) {
      console.error('Failed to update targets:', error);
      toast.error('Gagal update target');
    }
  };

  const handleStartDraw = (type) => {
    if (onStartDrawing) {
      onStartDrawing(type);
      onClose();
    }
  };

  const handleSaveEdit = async (aoiId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/aois/${aoiId}`, {
        name: editName
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEditingId(null);
      fetchAOIs();
      if (refreshAOIs) refreshAOIs();
    } catch (error) {
      console.error('Failed to update name:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-xl"
        style={{ backgroundColor: 'var(--background-elevated)', borderColor: 'var(--borders-default)' }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: 'var(--foreground-primary)' }}>
            <Target className="w-5 h-5" style={{ color: 'var(--accent-secondary)' }} />
            Area of Interest (AOI)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Draw Buttons */}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => handleStartDraw('polygon')}
              className="flex-1"
              style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--background-primary)' }}
            >
              <Pencil className="w-4 h-4 mr-1" />
              Gambar Polygon
            </Button>
            <Button
              size="sm"
              onClick={() => handleStartDraw('circle')}
              className="flex-1"
              style={{ backgroundColor: 'var(--accent-secondary)', color: 'var(--background-primary)' }}
            >
              <MapPin className="w-4 h-4 mr-1" />
              Gambar Lingkaran
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowNewForm(!showNewForm)}
              style={{ borderColor: 'var(--borders-default)', color: 'var(--foreground-primary)' }}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {/* Manual Input Form */}
          {showNewForm && (
            <div 
              className="p-3 rounded-lg border space-y-3"
              style={{ backgroundColor: 'var(--background-tertiary)', borderColor: 'var(--borders-default)' }}
            >
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>Nama AOI</Label>
                  <Input
                    value={newAOI.name}
                    onChange={(e) => setNewAOI({ ...newAOI, name: e.target.value })}
                    placeholder="Nama area"
                    className="h-8 text-sm"
                    style={{ backgroundColor: 'var(--background-secondary)', borderColor: 'var(--borders-default)', color: 'var(--foreground-primary)' }}
                  />
                </div>
                <div>
                  <Label className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>Tipe</Label>
                  <Select value={newAOI.aoi_type} onValueChange={(v) => setNewAOI({ ...newAOI, aoi_type: v })}>
                    <SelectTrigger className="h-8" style={{ backgroundColor: 'var(--background-secondary)', borderColor: 'var(--borders-default)', color: 'var(--foreground-primary)' }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="polygon">Polygon</SelectItem>
                      <SelectItem value="circle">Lingkaran</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
                  Koordinat {newAOI.aoi_type === 'polygon' ? '(satu per baris: lat,lng)' : '(titik pusat: lat,lng)'}
                </Label>
                <textarea
                  value={newAOI.coordinates}
                  onChange={(e) => setNewAOI({ ...newAOI, coordinates: e.target.value })}
                  placeholder={newAOI.aoi_type === 'polygon' ? '-6.2088,106.8456\n-6.2100,106.8470\n-6.2120,106.8450' : '-6.2088,106.8456'}
                  rows={3}
                  className="w-full p-2 rounded text-xs font-mono"
                  style={{ backgroundColor: 'var(--background-secondary)', borderColor: 'var(--borders-default)', color: 'var(--foreground-primary)', border: '1px solid var(--borders-default)' }}
                />
              </div>

              {newAOI.aoi_type === 'circle' && (
                <div>
                  <Label className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>Radius (meter)</Label>
                  <Input
                    type="number"
                    value={newAOI.radius}
                    onChange={(e) => setNewAOI({ ...newAOI, radius: e.target.value })}
                    className="h-8 text-sm"
                    style={{ backgroundColor: 'var(--background-secondary)', borderColor: 'var(--borders-default)', color: 'var(--foreground-primary)' }}
                  />
                </div>
              )}

              <div>
                <Label className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>Monitor Target</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {targets.filter(t => t.status === 'completed').map(target => (
                    <label
                      key={target.id}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer"
                      style={{ 
                        backgroundColor: newAOI.monitored_targets.includes(target.id) ? 'var(--accent-primary)' : 'var(--background-secondary)',
                        color: newAOI.monitored_targets.includes(target.id) ? 'var(--background-primary)' : 'var(--foreground-secondary)'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={newAOI.monitored_targets.includes(target.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewAOI({ ...newAOI, monitored_targets: [...newAOI.monitored_targets, target.id] });
                          } else {
                            setNewAOI({ ...newAOI, monitored_targets: newAOI.monitored_targets.filter(t => t !== target.id) });
                          }
                        }}
                        className="hidden"
                      />
                      {target.phone_number.slice(-6)}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button size="sm" onClick={handleCreateAOI} className="flex-1" style={{ backgroundColor: 'var(--status-success)' }}>
                  <Check className="w-4 h-4 mr-1" /> Simpan
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowNewForm(false)} style={{ borderColor: 'var(--borders-default)' }}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* AOI List */}
          <div 
            className="border rounded-lg overflow-hidden"
            style={{ borderColor: 'var(--borders-default)', maxHeight: '300px', overflowY: 'auto' }}
          >
            {loading ? (
              <div className="p-4 text-center" style={{ color: 'var(--foreground-muted)' }}>
                Loading...
              </div>
            ) : aois.length === 0 ? (
              <div className="p-4 text-center" style={{ color: 'var(--foreground-muted)' }}>
                Belum ada AOI. Buat baru dengan tombol di atas.
              </div>
            ) : (
              aois.map((aoi, idx) => (
                <div 
                  key={aoi.id}
                  className="p-3 border-b last:border-b-0"
                  style={{ borderColor: 'var(--borders-subtle)', backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.05)' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    {editingId === aoi.id ? (
                      <div className="flex items-center gap-1 flex-1">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-6 text-sm flex-1"
                          style={{ backgroundColor: 'var(--background-tertiary)', color: 'var(--foreground-primary)' }}
                        />
                        <Button size="icon" className="h-6 w-6" onClick={() => handleSaveEdit(aoi.id)}>
                          <Check className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingId(null)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span 
                            className="font-semibold text-sm"
                            style={{ color: 'var(--foreground-primary)' }}
                          >
                            {aoi.name}
                          </span>
                          <span 
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{ 
                              backgroundColor: aoi.aoi_type === 'polygon' ? 'var(--accent-primary)' : 'var(--accent-secondary)',
                              color: 'var(--background-primary)'
                            }}
                          >
                            {aoi.aoi_type}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setEditingId(aoi.id); setEditName(aoi.name); }}
                            className="p-1 rounded hover:bg-opacity-20"
                            title="Edit nama"
                          >
                            <Pencil className="w-3 h-3" style={{ color: 'var(--foreground-muted)' }} />
                          </button>
                          <button
                            onClick={() => handleToggleVisibility(aoi)}
                            className="p-1 rounded hover:bg-opacity-20"
                            title={aoi.is_visible ? 'Sembunyikan' : 'Tampilkan'}
                          >
                            {aoi.is_visible ? (
                              <Eye className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                            ) : (
                              <EyeOff className="w-4 h-4" style={{ color: 'var(--foreground-muted)' }} />
                            )}
                          </button>
                          <button
                            onClick={() => handleToggleAlarm(aoi)}
                            className="p-1 rounded hover:bg-opacity-20"
                            title={aoi.alarm_enabled ? 'Nonaktifkan alarm' : 'Aktifkan alarm'}
                          >
                            {aoi.alarm_enabled ? (
                              <Bell className="w-4 h-4" style={{ color: 'var(--status-warning)' }} />
                            ) : (
                              <BellOff className="w-4 h-4" style={{ color: 'var(--foreground-muted)' }} />
                            )}
                          </button>
                          <button
                            onClick={() => handleDeleteAOI(aoi.id)}
                            className="p-1 rounded hover:bg-opacity-20"
                            title="Hapus AOI"
                          >
                            <Trash2 className="w-4 h-4" style={{ color: 'var(--status-error)' }} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Monitored Targets */}
                  <div>
                    <span className="text-xs" style={{ color: 'var(--foreground-muted)' }}>Target dimonitor:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {targets.filter(t => t.status === 'completed').map(target => {
                        const isMonitored = (aoi.monitored_targets || []).includes(target.id);
                        return (
                          <button
                            key={target.id}
                            onClick={() => handleUpdateTargets(aoi, target.id, !isMonitored)}
                            className="px-2 py-0.5 rounded text-xs transition-colors"
                            style={{ 
                              backgroundColor: isMonitored ? 'var(--accent-primary)' : 'var(--background-tertiary)',
                              color: isMonitored ? 'var(--background-primary)' : 'var(--foreground-muted)',
                              border: `1px solid ${isMonitored ? 'var(--accent-primary)' : 'var(--borders-default)'}`
                            }}
                          >
                            {target.phone_number.slice(-6)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// AOI Alert Notification Component
export const AOIAlertNotification = ({ alerts, onAcknowledge, onAcknowledgeAll }) => {
  if (!alerts || alerts.length === 0) return null;

  const unacknowledged = alerts.filter(a => !a.acknowledged);
  if (unacknowledged.length === 0) return null;

  return (
    <div 
      className="fixed bottom-4 right-4 z-[2000] max-w-md animate-pulse"
      style={{
        backgroundColor: 'var(--status-error)',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(255, 59, 92, 0.5)'
      }}
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-white animate-bounce" />
            <span className="text-white font-bold">AOI ALERT!</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onAcknowledgeAll}
            className="text-white hover:bg-white/20"
          >
            Acknowledge All
          </Button>
        </div>
        
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {unacknowledged.map(alert => (
            <div 
              key={alert.id}
              className="p-2 rounded bg-white/10"
            >
              <p className="text-white text-sm font-semibold">
                Target {alert.target_phones?.join(', ')} memasuki AOI "{alert.aoi_name}"
              </p>
              <p className="text-white/80 text-xs">
                Waktu: {new Date(alert.timestamp).toLocaleString('id-ID')}
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onAcknowledge(alert.id)}
                className="mt-1 text-white hover:bg-white/20 h-6 text-xs"
              >
                <Check className="w-3 h-3 mr-1" /> OK
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
