import { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FolderOpen, Plus, Eye } from 'lucide-react';
import { toast } from 'sonner';

const CaseManagement = () => {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newCase, setNewCase] = useState({ name: '', description: '' });

  useEffect(() => {
    fetchCases();
  }, []);

  const fetchCases = async () => {
    try {
      const response = await axios.get(`${API}/cases`);
      setCases(response.data);
    } catch (error) {
      toast.error('Failed to load cases');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCase = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/cases`, newCase);
      toast.success('Case created successfully');
      setDialogOpen(false);
      setNewCase({ name: '', description: '' });
      fetchCases();
    } catch (error) {
      toast.error('Failed to create case');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: 'var(--accent-primary)' }} />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8" style={{ backgroundColor: 'var(--background-primary)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 
            className="text-5xl font-bold mb-2"
            style={{ 
              fontFamily: 'Barlow Condensed, sans-serif',
              color: 'var(--foreground-primary)'
            }}
          >
            CASE MANAGEMENT
          </h1>
          <p style={{ color: 'var(--foreground-secondary)' }}>
            Kelola case dan investigasi
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              data-testid="create-case-button"
              className="px-6 py-6 font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--background-primary)',
                fontFamily: 'Rajdhani, sans-serif'
              }}
            >
              <Plus className="w-5 h-5 mr-2" />
              New Case
            </Button>
          </DialogTrigger>
          <DialogContent 
            className="bg-background-elevated border-borders-strong"
            style={{
              backgroundColor: 'var(--background-elevated)',
              borderColor: 'var(--borders-strong)'
            }}
          >
            <DialogHeader>
              <DialogTitle 
                className="text-2xl font-bold"
                style={{ 
                  fontFamily: 'Barlow Condensed, sans-serif',
                  color: 'var(--foreground-primary)'
                }}
              >
                Create New Case
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateCase} className="space-y-4 mt-4">
              <div>
                <Label 
                  htmlFor="case-name" 
                  className="text-xs uppercase tracking-wide mb-2 block"
                  style={{ color: 'var(--foreground-secondary)' }}
                >
                  Case Name
                </Label>
                <Input
                  id="case-name"
                  value={newCase.name}
                  onChange={(e) => setNewCase({ ...newCase, name: e.target.value })}
                  data-testid="case-name-input"
                  className="bg-background-tertiary border-borders-default focus:border-accent-primary"
                  placeholder="Enter case name"
                  required
                />
              </div>
              <div>
                <Label 
                  htmlFor="case-description" 
                  className="text-xs uppercase tracking-wide mb-2 block"
                  style={{ color: 'var(--foreground-secondary)' }}
                >
                  Description
                </Label>
                <Textarea
                  id="case-description"
                  value={newCase.description}
                  onChange={(e) => setNewCase({ ...newCase, description: e.target.value })}
                  data-testid="case-description-input"
                  className="bg-background-tertiary border-borders-default focus:border-accent-primary min-h-[100px]"
                  placeholder="Enter case description"
                />
              </div>
              <Button
                type="submit"
                data-testid="submit-case-button"
                className="w-full py-6 font-semibold uppercase tracking-wide"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--background-primary)',
                  fontFamily: 'Rajdhani, sans-serif'
                }}
              >
                Create Case
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Cases Grid */}
      {cases.length === 0 ? (
        <div 
          className="text-center py-20 rounded-lg border"
          style={{
            backgroundColor: 'var(--background-secondary)',
            borderColor: 'var(--borders-default)'
          }}
        >
          <FolderOpen className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--foreground-muted)' }} />
          <p className="text-lg mb-4" style={{ color: 'var(--foreground-muted)' }}>Belum ada case</p>
          <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>Buat case pertama Anda untuk memulai tracking</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cases.map((caseItem) => (
            <div
              key={caseItem.id}
              data-testid={`case-card-${caseItem.id}`}
              className="p-6 rounded-lg border transition-all duration-300 hover:border-opacity-50"
              style={{
                backgroundColor: 'var(--background-secondary)',
                borderColor: 'var(--borders-default)',
                borderLeftWidth: '4px',
                borderLeftColor: caseItem.status === 'active' ? 'var(--accent-primary)' : 'var(--foreground-muted)'
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 
                    className="text-xl font-bold mb-2"
                    style={{ 
                      fontFamily: 'Barlow Condensed, sans-serif',
                      color: 'var(--foreground-primary)'
                    }}
                  >
                    {caseItem.name}
                  </h3>
                  <p 
                    className="text-sm line-clamp-2"
                    style={{ color: 'var(--foreground-tertiary)' }}
                  >
                    {caseItem.description || 'No description'}
                  </p>
                </div>
                <span 
                  className="px-3 py-1 rounded-full text-xs font-medium uppercase"
                  style={{
                    backgroundColor: caseItem.status === 'active' ? 'rgba(0, 217, 255, 0.1)' : 'rgba(93, 107, 121, 0.1)',
                    color: caseItem.status === 'active' ? 'var(--accent-primary)' : 'var(--foreground-muted)',
                    fontFamily: 'Rajdhani, sans-serif'
                  }}
                >
                  {caseItem.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--foreground-muted)' }}>Targets</p>
                  <p className="text-2xl font-bold" style={{ color: 'var(--accent-primary)', fontFamily: 'Barlow Condensed, sans-serif' }}>
                    {caseItem.target_count || 0}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--foreground-muted)' }}>Created</p>
                  <p className="text-sm" style={{ color: 'var(--foreground-secondary)' }}>
                    {new Date(caseItem.created_at).toLocaleDateString('id-ID')}
                  </p>
                </div>
              </div>

              <Button
                data-testid={`view-case-${caseItem.id}`}
                className="w-full py-3 font-medium"
                style={{
                  backgroundColor: 'var(--background-tertiary)',
                  color: 'var(--foreground-primary)',
                  border: '1px solid var(--borders-default)'
                }}
              >
                <Eye className="w-4 h-4 mr-2" />
                View Details
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CaseManagement;