import { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Calendar, Plus, Phone, Trash2, Play, Pause } from 'lucide-react';
import { toast } from 'sonner';

const Scheduling = () => {
  const [schedules, setSchedules] = useState([]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    case_id: '',
    phone_number: '',
    interval_type: 'hourly',
    interval_value: 1,
    active: true
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [schedulesRes, casesRes] = await Promise.all([
        axios.get(`${API}/schedules`),
        axios.get(`${API}/cases`)
      ]);

      setSchedules(schedulesRes.data);
      setCases(casesRes.data.filter(c => c.status === 'active'));
    } catch (error) {
      toast.error('Failed to load schedules');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSchedule = async (e) => {
    e.preventDefault();
    
    if (!newSchedule.phone_number.startsWith('62')) {
      toast.error('Nomor telepon harus dimulai dengan 62');
      return;
    }

    try {
      await axios.post(`${API}/schedules`, newSchedule);
      toast.success('Schedule created successfully');
      setDialogOpen(false);
      setNewSchedule({
        case_id: '',
        phone_number: '',
        interval_type: 'hourly',
        interval_value: 1,
        active: true
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create schedule');
    }
  };

  const handleToggleSchedule = async (scheduleId, currentStatus) => {
    try {
      await axios.patch(`${API}/schedules/${scheduleId}`, {
        active: !currentStatus
      });
      toast.success(`Schedule ${!currentStatus ? 'activated' : 'paused'}`);
      fetchData();
    } catch (error) {
      toast.error('Failed to update schedule');
    }
  };

  const handleDeleteSchedule = async (scheduleId) => {
    if (!window.confirm('Are you sure you want to delete this schedule?')) {
      return;
    }

    try {
      await axios.delete(`${API}/schedules/${scheduleId}`);
      toast.success('Schedule deleted successfully');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete schedule');
    }
  };

  const getCaseName = (caseId) => {
    const caseItem = cases.find(c => c.id === caseId);
    return caseItem ? caseItem.name : 'Unknown';
  };

  const getIntervalText = (type, value) => {
    const types = {
      minutes: 'menit',
      hourly: 'jam',
      daily: 'hari',
      weekly: 'minggu',
      monthly: 'bulan'
    };
    return `Setiap ${value} ${types[type] || type}`;
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
            SCHEDULING
          </h1>
          <p style={{ color: 'var(--foreground-secondary)' }}>
            Jadwalkan tracking otomatis untuk target
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              data-testid="create-schedule-button"
              className="px-6 py-6 font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--background-primary)',
                fontFamily: 'Rajdhani, sans-serif'
              }}
            >
              <Plus className="w-5 h-5 mr-2" />
              New Schedule
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
                Create New Schedule
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateSchedule} className="space-y-4 mt-4">
              <div>
                <Label 
                  htmlFor="case" 
                  className="text-xs uppercase tracking-wide mb-2 block"
                  style={{ color: 'var(--foreground-secondary)' }}
                >
                  Select Case
                </Label>
                <Select 
                  value={newSchedule.case_id} 
                  onValueChange={(value) => setNewSchedule({ ...newSchedule, case_id: value })}
                  required
                >
                  <SelectTrigger
                    style={{
                      backgroundColor: 'var(--background-tertiary)',
                      borderColor: 'var(--borders-default)',
                      color: 'var(--foreground-primary)'
                    }}
                  >
                    <SelectValue placeholder="Pilih case" />
                  </SelectTrigger>
                  <SelectContent
                    style={{
                      backgroundColor: 'var(--background-elevated)',
                      borderColor: 'var(--borders-strong)',
                      color: 'var(--foreground-primary)'
                    }}
                  >
                    {cases.map((caseItem) => (
                      <SelectItem key={caseItem.id} value={caseItem.id}>
                        {caseItem.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label 
                  htmlFor="phone" 
                  className="text-xs uppercase tracking-wide mb-2 block"
                  style={{ color: 'var(--foreground-secondary)' }}
                >
                  Phone Number
                </Label>
                <Input
                  id="phone"
                  type="text"
                  value={newSchedule.phone_number}
                  onChange={(e) => setNewSchedule({ ...newSchedule, phone_number: e.target.value })}
                  className="font-mono bg-background-tertiary border-borders-default"
                  style={{ color: '#000000' }}
                  placeholder="62XXXXXXXXXX"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label 
                    htmlFor="interval-type" 
                    className="text-xs uppercase tracking-wide mb-2 block"
                    style={{ color: 'var(--foreground-secondary)' }}
                  >
                    Interval Type
                  </Label>
                  <Select 
                    value={newSchedule.interval_type} 
                    onValueChange={(value) => setNewSchedule({ ...newSchedule, interval_type: value })}
                  >
                    <SelectTrigger
                      style={{
                        backgroundColor: 'var(--background-tertiary)',
                        borderColor: 'var(--borders-default)',
                        color: 'var(--foreground-primary)'
                      }}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                      style={{
                        backgroundColor: 'var(--background-elevated)',
                        borderColor: 'var(--borders-strong)',
                        color: 'var(--foreground-primary)'
                      }}
                    >
                      <SelectItem value="minutes">Per Menit</SelectItem>
                      <SelectItem value="hourly">Per Jam</SelectItem>
                      <SelectItem value="daily">Per Hari</SelectItem>
                      <SelectItem value="weekly">Per Minggu</SelectItem>
                      <SelectItem value="monthly">Per Bulan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label 
                    htmlFor="interval-value" 
                    className="text-xs uppercase tracking-wide mb-2 block"
                    style={{ color: 'var(--foreground-secondary)' }}
                  >
                    Interval Value
                  </Label>
                  <Input
                    id="interval-value"
                    type="number"
                    min="1"
                    value={newSchedule.interval_value}
                    onChange={(e) => setNewSchedule({ ...newSchedule, interval_value: parseInt(e.target.value) })}
                    className="bg-background-tertiary border-borders-default"
                    style={{ color: '#000000' }}
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full py-6 font-semibold uppercase tracking-wide"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--background-primary)',
                  fontFamily: 'Rajdhani, sans-serif'
                }}
              >
                Create Schedule
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Schedules List */}
      {schedules.length === 0 ? (
        <div 
          className="text-center py-20 rounded-lg border"
          style={{
            backgroundColor: 'var(--background-secondary)',
            borderColor: 'var(--borders-default)'
          }}
        >
          <Calendar className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--foreground-muted)' }} />
          <p className="text-lg mb-4" style={{ color: 'var(--foreground-muted)' }}>Belum ada schedule</p>
          <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>Buat schedule pertama Anda untuk tracking otomatis</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {schedules.map((schedule) => (
            <div
              key={schedule.id}
              data-testid={`schedule-card-${schedule.id}`}
              className="p-6 rounded-lg border transition-all duration-300"
              style={{
                backgroundColor: 'var(--background-secondary)',
                borderColor: 'var(--borders-default)',
                borderLeftWidth: '4px',
                borderLeftColor: schedule.active ? 'var(--status-success)' : 'var(--foreground-muted)'
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 
                    className="text-lg font-bold mb-1"
                    style={{ 
                      fontFamily: 'Barlow Condensed, sans-serif',
                      color: 'var(--foreground-primary)'
                    }}
                  >
                    {getCaseName(schedule.case_id)}
                  </h3>
                  <p className="text-sm font-mono" style={{ color: 'var(--accent-primary)' }}>
                    {schedule.phone_number}
                  </p>
                </div>
                <span 
                  className="px-3 py-1 rounded-full text-xs font-medium uppercase"
                  style={{
                    backgroundColor: schedule.active ? 'rgba(0, 255, 136, 0.1)' : 'rgba(93, 107, 121, 0.1)',
                    color: schedule.active ? 'var(--status-success)' : 'var(--foreground-muted)',
                    fontFamily: 'Rajdhani, sans-serif'
                  }}
                >
                  {schedule.active ? 'Active' : 'Paused'}
                </span>
              </div>

              <div className="mb-4">
                <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--foreground-muted)' }}>
                  Interval
                </p>
                <p className="text-sm font-semibold" style={{ color: 'var(--foreground-primary)' }}>
                  {getIntervalText(schedule.interval_type, schedule.interval_value)}
                </p>
              </div>

              <div className="mb-4">
                <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--foreground-muted)' }}>
                  Next Run
                </p>
                <p className="text-sm" style={{ color: 'var(--foreground-secondary)' }}>
                  {schedule.next_run ? new Date(schedule.next_run).toLocaleString('id-ID') : 'Not scheduled'}
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleToggleSchedule(schedule.id, schedule.active)}
                  className="flex-1"
                  style={{
                    backgroundColor: schedule.active ? 'var(--status-warning)' : 'var(--status-success)',
                    color: 'var(--background-primary)'
                  }}
                >
                  {schedule.active ? <Pause className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                  {schedule.active ? 'Pause' : 'Resume'}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDeleteSchedule(schedule.id)}
                  style={{
                    backgroundColor: 'var(--status-error)',
                    color: 'white'
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Scheduling;
