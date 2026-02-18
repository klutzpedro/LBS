import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  MapPin, 
  Star, 
  Flag, 
  Home, 
  Building, 
  Trash2, 
  Edit2, 
  Eye, 
  EyeOff,
  X,
  Check,
  Navigation,
  Plus
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Icon options for plotted points
const ICON_OPTIONS = [
  { value: 'pin', label: 'Pin', icon: MapPin },
  { value: 'star', label: 'Star', icon: Star },
  { value: 'flag', label: 'Flag', icon: Flag },
  { value: 'home', label: 'Home', icon: Home },
  { value: 'building', label: 'Building', icon: Building },
  { value: 'navigation', label: 'Navigation', icon: Navigation },
];

// Color options
const COLOR_OPTIONS = [
  '#FF5733', '#33FF57', '#3357FF', '#FF33F5', '#33FFF5', 
  '#F5FF33', '#FF8C00', '#8B0000', '#006400', '#00008B'
];

// Get icon component by value
const getIconComponent = (iconValue) => {
  const option = ICON_OPTIONS.find(o => o.value === iconValue);
  return option ? option.icon : MapPin;
};

/**
 * Panel for managing plotted points
 */
export const PlottedPointsPanel = ({
  isOpen,
  onClose,
  plottedPoints,
  onRefresh,
  onPointClick,
  currentUsername,
  isPlottingMode,
  onStartPlotting,
  onCancelPlotting
}) => {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPoint, setEditingPoint] = useState(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('pin');
  const [editColor, setEditColor] = useState('#FF5733');
  const [saving, setSaving] = useState(false);

  const handleToggleVisibility = async (point) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/plots/${point.id}/visibility`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      onRefresh();
      toast.success(point.is_visible ? 'Pin disembunyikan' : 'Pin ditampilkan');
    } catch (error) {
      toast.error('Gagal mengubah visibilitas: ' + error.message);
    }
  };

  const handleDelete = async (point) => {
    if (!window.confirm(`Hapus pin "${point.name}"?`)) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/plots/${point.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        toast.success('Pin berhasil dihapus');
        onRefresh();
      } else {
        const data = await response.json();
        toast.error(data.detail || 'Gagal menghapus pin');
      }
    } catch (error) {
      toast.error('Gagal menghapus pin: ' + error.message);
    }
  };

  const handleOpenEdit = (point) => {
    setEditingPoint(point);
    setEditName(point.name);
    setEditIcon(point.icon || 'pin');
    setEditColor(point.color || '#FF5733');
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) {
      toast.error('Nama tidak boleh kosong');
      return;
    }
    
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/plots/${editingPoint.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: editName,
          icon: editIcon,
          color: editColor
        })
      });
      
      if (response.ok) {
        toast.success('Pin berhasil diperbarui');
        setEditDialogOpen(false);
        onRefresh();
      } else {
        const data = await response.json();
        toast.error(data.detail || 'Gagal memperbarui pin');
      }
    } catch (error) {
      toast.error('Gagal memperbarui pin: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const canModify = (point) => {
    return point.created_by === currentUsername;
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Main Panel */}
      <div 
        className="absolute top-4 right-4 w-80 rounded-lg border shadow-xl z-[1000] max-h-[70vh] flex flex-col"
        style={{ 
          backgroundColor: 'var(--background-elevated)',
          borderColor: 'var(--borders-default)'
        }}
        data-testid="plotted-points-panel"
      >
        {/* Header */}
        <div 
          className="px-4 py-3 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--borders-default)' }}
        >
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
            <h3 
              className="font-semibold"
              style={{ color: 'var(--foreground-primary)' }}
            >
              Plot Posisi
            </h3>
            <span 
              className="text-xs px-2 py-0.5 rounded"
              style={{ 
                backgroundColor: 'var(--background-tertiary)',
                color: 'var(--foreground-muted)'
              }}
            >
              {plottedPoints.length}
            </span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            className="w-8 h-8"
          >
            <X className="w-4 h-4" style={{ color: 'var(--foreground-secondary)' }} />
          </Button>
        </div>

        {/* Add Button */}
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--borders-default)' }}>
          {isPlottingMode ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
                Klik pada peta untuk menambah pin baru
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={onCancelPlotting}
                className="w-full"
                style={{ borderColor: 'var(--status-error)', color: 'var(--status-error)' }}
              >
                <X className="w-4 h-4 mr-2" />
                Batal Plotting
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              onClick={onStartPlotting}
              className="w-full"
              style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--background-primary)' }}
              data-testid="start-plotting-button"
            >
              <Plus className="w-4 h-4 mr-2" />
              Tambah Pin Baru
            </Button>
          )}
        </div>

        {/* Points List */}
        <div 
          className="flex-1 overflow-y-auto p-2"
          style={{ 
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--accent-primary) var(--background-tertiary)'
          }}
        >
          {plottedPoints.length === 0 ? (
            <p 
              className="text-center py-8 text-sm"
              style={{ color: 'var(--foreground-muted)' }}
            >
              Belum ada pin. Klik &quot;Tambah Pin Baru&quot; untuk memulai.
            </p>
          ) : (
            <div className="space-y-2">
              {plottedPoints.map((point) => {
                const IconComponent = getIconComponent(point.icon);
                const isOwner = canModify(point);
                
                return (
                  <div
                    key={point.id}
                    className="p-3 rounded-lg border group hover:border-opacity-80 transition-all"
                    style={{
                      backgroundColor: point.is_visible ? 'var(--background-tertiary)' : 'var(--background-secondary)',
                      borderColor: point.color || 'var(--borders-default)',
                      borderLeftWidth: '4px',
                      opacity: point.is_visible ? 1 : 0.6
                    }}
                    data-testid={`plotted-point-${point.id}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div 
                        className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: point.color || '#FF5733' }}
                      >
                        <IconComponent className="w-4 h-4 text-white" />
                      </div>
                      
                      {/* Info */}
                      <div 
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => onPointClick(point)}
                      >
                        <p 
                          className="font-medium text-sm truncate"
                          style={{ color: 'var(--foreground-primary)' }}
                        >
                          {point.name}
                        </p>
                        <p 
                          className="text-xs truncate"
                          style={{ color: 'var(--foreground-muted)' }}
                        >
                          {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}
                        </p>
                        <p 
                          className="text-xs mt-1"
                          style={{ color: 'var(--foreground-muted)' }}
                        >
                          oleh: {point.created_by}
                        </p>
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Toggle Visibility - Owner Only */}
                        {isOwner && (
                          <button
                            onClick={() => handleToggleVisibility(point)}
                            className="p-1.5 rounded hover:bg-black/10"
                            title={point.is_visible ? 'Sembunyikan' : 'Tampilkan'}
                          >
                            {point.is_visible ? (
                              <Eye className="w-4 h-4" style={{ color: 'var(--status-success)' }} />
                            ) : (
                              <EyeOff className="w-4 h-4" style={{ color: 'var(--foreground-muted)' }} />
                            )}
                          </button>
                        )}
                        
                        {/* Edit - Owner Only */}
                        {isOwner && (
                          <button
                            onClick={() => handleOpenEdit(point)}
                            className="p-1.5 rounded hover:bg-black/10"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                          </button>
                        )}
                        
                        {/* Delete - Owner Only */}
                        {isOwner && (
                          <button
                            onClick={() => handleDelete(point)}
                            className="p-1.5 rounded hover:bg-black/10"
                            title="Hapus"
                          >
                            <Trash2 className="w-4 h-4" style={{ color: 'var(--status-error)' }} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent 
          style={{ 
            backgroundColor: 'var(--background-elevated)',
            borderColor: 'var(--borders-default)'
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--foreground-primary)' }}>
              <Edit2 className="w-5 h-5 inline mr-2" />
              Edit Pin
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Name */}
            <div>
              <label 
                className="text-sm font-medium block mb-2"
                style={{ color: 'var(--foreground-secondary)' }}
              >
                Nama Pin
              </label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Masukkan nama pin"
                style={{ 
                  backgroundColor: 'var(--background-primary)',
                  borderColor: 'var(--borders-default)',
                  color: 'var(--foreground-primary)'
                }}
              />
            </div>
            
            {/* Icon Selection */}
            <div>
              <label 
                className="text-sm font-medium block mb-2"
                style={{ color: 'var(--foreground-secondary)' }}
              >
                Ikon
              </label>
              <div className="flex flex-wrap gap-2">
                {ICON_OPTIONS.map((option) => {
                  const IconComp = option.icon;
                  return (
                    <button
                      key={option.value}
                      onClick={() => setEditIcon(option.value)}
                      className={`p-2 rounded border transition-all ${
                        editIcon === option.value ? 'ring-2 ring-offset-2' : ''
                      }`}
                      style={{
                        backgroundColor: editIcon === option.value ? 'var(--accent-primary)' : 'var(--background-tertiary)',
                        borderColor: 'var(--borders-default)',
                        color: editIcon === option.value ? 'white' : 'var(--foreground-primary)'
                      }}
                      title={option.label}
                    >
                      <IconComp className="w-5 h-5" />
                    </button>
                  );
                })}
              </div>
            </div>
            
            {/* Color Selection */}
            <div>
              <label 
                className="text-sm font-medium block mb-2"
                style={{ color: 'var(--foreground-secondary)' }}
              >
                Warna
              </label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setEditColor(color)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      editColor === color ? 'ring-2 ring-offset-2' : ''
                    }`}
                    style={{
                      backgroundColor: color,
                      borderColor: editColor === color ? 'white' : 'transparent'
                    }}
                    title={color}
                  />
                ))}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={saving}
            >
              Batal
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={saving}
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              {saving ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

/**
 * Dialog for creating a new plotted point
 */
export const NewPlotDialog = ({
  isOpen,
  onClose,
  coordinates,
  onSave
}) => {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('pin');
  const [color, setColor] = useState('#FF5733');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Nama tidak boleh kosong');
      return;
    }
    
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/plots`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: name.trim(),
          latitude: coordinates.lat,
          longitude: coordinates.lng,
          icon,
          color
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        toast.success(`Pin "${name}" berhasil ditambahkan!`);
        onSave(data.point);
        setName('');
        setIcon('pin');
        setColor('#FF5733');
        onClose();
      } else {
        const data = await response.json();
        toast.error(data.detail || 'Gagal menambahkan pin');
      }
    } catch (error) {
      toast.error('Gagal menambahkan pin: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        style={{ 
          backgroundColor: 'var(--background-elevated)',
          borderColor: 'var(--borders-default)'
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--foreground-primary)' }}>
            <MapPin className="w-5 h-5 inline mr-2" style={{ color: 'var(--accent-primary)' }} />
            Tambah Pin Baru
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Coordinates */}
          <div 
            className="p-3 rounded-lg"
            style={{ backgroundColor: 'var(--background-tertiary)' }}
          >
            <p 
              className="text-xs font-medium"
              style={{ color: 'var(--foreground-muted)' }}
            >
              Koordinat
            </p>
            <p 
              className="text-sm font-mono"
              style={{ color: 'var(--foreground-primary)' }}
            >
              {coordinates?.lat?.toFixed(6)}, {coordinates?.lng?.toFixed(6)}
            </p>
          </div>
          
          {/* Name */}
          <div>
            <label 
              className="text-sm font-medium block mb-2"
              style={{ color: 'var(--foreground-secondary)' }}
            >
              Nama Pin *
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Rumah Target A, Basecamp, dll"
              autoFocus
              style={{ 
                backgroundColor: 'var(--background-primary)',
                borderColor: 'var(--borders-default)',
                color: 'var(--foreground-primary)'
              }}
            />
          </div>
          
          {/* Icon Selection */}
          <div>
            <label 
              className="text-sm font-medium block mb-2"
              style={{ color: 'var(--foreground-secondary)' }}
            >
              Ikon
            </label>
            <div className="flex flex-wrap gap-2">
              {ICON_OPTIONS.map((option) => {
                const IconComp = option.icon;
                return (
                  <button
                    key={option.value}
                    onClick={() => setIcon(option.value)}
                    className={`p-2 rounded border transition-all ${
                      icon === option.value ? 'ring-2 ring-offset-2' : ''
                    }`}
                    style={{
                      backgroundColor: icon === option.value ? color : 'var(--background-tertiary)',
                      borderColor: 'var(--borders-default)',
                      color: icon === option.value ? 'white' : 'var(--foreground-primary)'
                    }}
                    title={option.label}
                  >
                    <IconComp className="w-5 h-5" />
                  </button>
                );
              })}
            </div>
          </div>
          
          {/* Color Selection */}
          <div>
            <label 
              className="text-sm font-medium block mb-2"
              style={{ color: 'var(--foreground-secondary)' }}
            >
              Warna
            </label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    color === c ? 'ring-2 ring-offset-2' : ''
                  }`}
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? 'white' : 'transparent'
                  }}
                  title={c}
                />
              ))}
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Batal
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            {saving ? 'Menyimpan...' : 'Simpan Pin'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PlottedPointsPanel;
