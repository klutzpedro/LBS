import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  DraggableDialog, 
  DraggableDialogContent, 
  DraggableDialogHeader, 
  DraggableDialogTitle 
} from '@/components/ui/draggable-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  Users, 
  UserCheck, 
  UserX, 
  Trash2, 
  Clock, 
  CheckCircle, 
  XCircle,
  Loader2,
  RefreshCw,
  Minus,
  Maximize2,
  Key,
  Shield,
  ShieldOff
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export const UserManagementButton = ({ onClick }) => {
  return (
    <Button
      onClick={onClick}
      size="icon"
      className="shadow-xl hover:scale-105 transition-all duration-200"
      style={{
        background: 'linear-gradient(145deg, #8b5cf6, #7c3aed)',
        color: '#fff',
        border: 'none',
        boxShadow: '0 6px 20px rgba(139, 92, 246, 0.4), 0 2px 4px rgba(0,0,0,0.2)',
        borderRadius: '8px',
        width: '42px',
        height: '42px'
      }}
      title="Kelola User"
      data-testid="user-management-btn"
    >
      <Users className="w-5 h-5" />
    </Button>
  );
};

export const UserManagementDialog = ({ open, onOpenChange }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [users, setUsers] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('pending'); // pending, all
  
  // Change Password Dialog
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (open) {
      fetchUsers();
    }
  }, [open]);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      // Fetch all users
      const allResponse = await fetch(`${API_URL}/api/auth/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (allResponse.ok) {
        const allData = await allResponse.json();
        setUsers(allData.users || []);
      }

      // Fetch pending users
      const pendingResponse = await fetch(`${API_URL}/api/auth/users/pending`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (pendingResponse.ok) {
        const pendingData = await pendingResponse.json();
        setPendingUsers(pendingData.users || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Gagal memuat data user');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (userId, userName) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/auth/users/${userId}/approve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success(`User ${userName} berhasil disetujui`);
        fetchUsers();
      } else {
        const data = await response.json();
        toast.error(data.detail || 'Gagal menyetujui user');
      }
    } catch (error) {
      toast.error('Terjadi kesalahan');
    }
  };

  const handleReject = async (userId, userName) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/auth/users/${userId}/reject`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success(`Pendaftaran ${userName} ditolak`);
        fetchUsers();
      } else {
        const data = await response.json();
        toast.error(data.detail || 'Gagal menolak user');
      }
    } catch (error) {
      toast.error('Terjadi kesalahan');
    }
  };

  const handleDelete = async (userId, userName) => {
    if (!window.confirm(`Yakin ingin menghapus user ${userName}?`)) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/auth/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success(`User ${userName} berhasil dihapus`);
        fetchUsers();
      } else {
        const data = await response.json();
        toast.error(data.detail || 'Gagal menghapus user');
      }
    } catch (error) {
      toast.error('Terjadi kesalahan');
    }
  };

  const handleOpenChangePassword = (user) => {
    setSelectedUser(user);
    setNewPassword('');
    setConfirmPassword('');
    setChangePasswordOpen(true);
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast.error('Semua field harus diisi');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Password tidak cocok');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password minimal 6 karakter');
      return;
    }

    setChangingPassword(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/auth/users/${selectedUser.id}/change-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ new_password: newPassword })
      });

      if (response.ok) {
        toast.success(`Password ${selectedUser.username} berhasil diubah`);
        setChangePasswordOpen(false);
      } else {
        const data = await response.json();
        toast.error(data.detail || 'Gagal mengubah password');
      }
    } catch (error) {
      toast.error('Terjadi kesalahan');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleToggleRole = async (userId, userName, currentIsAdmin) => {
    const newRole = !currentIsAdmin;
    const roleLabel = newRole ? 'Admin' : 'User biasa';
    
    if (!window.confirm(`Ubah role ${userName} menjadi ${roleLabel}?`)) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/auth/users/${userId}/role`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_admin: newRole })
      });

      if (response.ok) {
        toast.success(`Role ${userName} diubah menjadi ${roleLabel}`);
        fetchUsers();
      } else {
        const data = await response.json();
        toast.error(data.detail || 'Gagal mengubah role');
      }
    } catch (error) {
      toast.error('Terjadi kesalahan');
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'approved':
        return (
          <span className="px-2 py-1 rounded text-xs font-semibold bg-green-500/20 text-green-400 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Aktif
          </span>
        );
      case 'pending':
        return (
          <span className="px-2 py-1 rounded text-xs font-semibold bg-yellow-500/20 text-yellow-400 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Menunggu
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2 py-1 rounded text-xs font-semibold bg-red-500/20 text-red-400 flex items-center gap-1">
            <XCircle className="w-3 h-3" /> Ditolak
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <DraggableDialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent 
        className="flex flex-col p-4"
        style={{ 
          width: isMinimized ? '300px' : '600px',
          maxWidth: '95vw',
          height: isMinimized ? 'auto' : '70vh',
          maxHeight: '80vh',
          backgroundColor: 'var(--background-elevated)',
          border: '1px solid var(--borders-default)'
        }}
      >
        <DraggableDialogHeader className="cursor-move flex-shrink-0 mb-3">
          <div className="flex items-center justify-between w-full">
            <DraggableDialogTitle className="flex items-center gap-2" style={{ color: 'var(--foreground-primary)' }}>
              <Users className="w-5 h-5" style={{ color: '#8b5cf6' }} />
              Kelola User
              {pendingUsers.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white">
                  {pendingUsers.length}
                </span>
              )}
            </DraggableDialogTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={fetchUsers}
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
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
          <>
            {/* Tabs */}
            <div className="flex gap-2 mb-4">
              <Button
                variant={activeTab === 'pending' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('pending')}
                className="flex items-center gap-2"
                style={activeTab === 'pending' ? { backgroundColor: '#8b5cf6' } : {}}
              >
                <Clock className="w-4 h-4" />
                Pending ({pendingUsers.length})
              </Button>
              <Button
                variant={activeTab === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('all')}
                className="flex items-center gap-2"
                style={activeTab === 'all' ? { backgroundColor: '#8b5cf6' } : {}}
              >
                <Users className="w-4 h-4" />
                Semua User ({users.length})
              </Button>
            </div>

            {/* User List */}
            <div className="flex-1 overflow-y-auto space-y-2" style={{ minHeight: 0 }}>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#8b5cf6' }} />
                </div>
              ) : activeTab === 'pending' ? (
                pendingUsers.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--foreground-muted)' }} />
                    <p style={{ color: 'var(--foreground-muted)' }}>
                      Tidak ada pendaftaran yang menunggu
                    </p>
                  </div>
                ) : (
                  pendingUsers.map((user) => (
                    <div
                      key={user.id}
                      className="p-3 rounded-lg"
                      style={{ backgroundColor: 'var(--background-tertiary)' }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold" style={{ color: 'var(--foreground-primary)' }}>
                            {user.full_name}
                          </p>
                          <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
                            @{user.username}
                          </p>
                          <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>
                            {new Date(user.created_at).toLocaleDateString('id-ID', {
                              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                            })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleApprove(user.id, user.full_name)}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            <UserCheck className="w-4 h-4 mr-1" />
                            Setujui
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleReject(user.id, user.full_name)}
                          >
                            <UserX className="w-4 h-4 mr-1" />
                            Tolak
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )
              ) : (
                users.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--foreground-muted)' }} />
                    <p style={{ color: 'var(--foreground-muted)' }}>
                      Belum ada user terdaftar
                    </p>
                  </div>
                ) : (
                  users.map((user) => (
                    <div
                      key={user.id}
                      className="p-3 rounded-lg"
                      style={{ backgroundColor: 'var(--background-tertiary)' }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold" style={{ color: 'var(--foreground-primary)' }}>
                              {user.full_name}
                            </p>
                            {getStatusBadge(user.status)}
                            {user.is_admin && (
                              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-500/20 text-purple-400 flex items-center gap-1">
                                <Shield className="w-3 h-3" /> Admin
                              </span>
                            )}
                          </div>
                          <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
                            @{user.username}
                          </p>
                          <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>
                            Daftar: {new Date(user.created_at).toLocaleDateString('id-ID', {
                              day: 'numeric', month: 'short', year: 'numeric'
                            })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {/* Toggle Admin Role */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleToggleRole(user.id, user.full_name, user.is_admin)}
                            title={user.is_admin ? "Jadikan User Biasa" : "Jadikan Admin"}
                            className="h-8 w-8 p-0"
                          >
                            {user.is_admin ? (
                              <ShieldOff className="w-4 h-4 text-orange-400" />
                            ) : (
                              <Shield className="w-4 h-4 text-purple-400" />
                            )}
                          </Button>
                          {/* Change Password */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenChangePassword(user)}
                            title="Ganti Password"
                            className="h-8 w-8 p-0"
                          >
                            <Key className="w-4 h-4 text-blue-400" />
                          </Button>
                          {user.status === 'rejected' && (
                            <Button
                              size="sm"
                              onClick={() => handleApprove(user.id, user.full_name)}
                              className="bg-green-600 hover:bg-green-700 text-white h-8 w-8 p-0"
                            >
                              <UserCheck className="w-4 h-4" />
                            </Button>
                          )}
                          {user.status === 'approved' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReject(user.id, user.full_name)}
                              title="Nonaktifkan"
                              className="h-8 w-8 p-0"
                            >
                              <UserX className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(user.id, user.full_name)}
                            title="Hapus"
                            className="h-8 w-8 p-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          </>
        )}
      </DraggableDialogContent>
      
      {/* Change Password Dialog */}
      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent style={{ backgroundColor: 'var(--background-elevated)', borderColor: 'var(--borders-default)' }}>
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--foreground-primary)' }}>
              <Key className="w-5 h-5 inline mr-2" />
              Ganti Password - {selectedUser?.username}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium" style={{ color: 'var(--foreground-secondary)' }}>
                Password Baru
              </label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Masukkan password baru (min 6 karakter)"
                style={{ backgroundColor: 'var(--background-primary)', borderColor: 'var(--borders-default)', color: 'var(--foreground-primary)' }}
              />
            </div>
            <div>
              <label className="text-sm font-medium" style={{ color: 'var(--foreground-secondary)' }}>
                Konfirmasi Password
              </label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ulangi password baru"
                style={{ backgroundColor: 'var(--background-primary)', borderColor: 'var(--borders-default)', color: 'var(--foreground-primary)' }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePasswordOpen(false)} disabled={changingPassword}>
              Batal
            </Button>
            <Button onClick={handleChangePassword} disabled={changingPassword} style={{ backgroundColor: 'var(--accent-primary)' }}>
              {changingPassword ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DraggableDialog>
  );
};

export default UserManagementDialog;
