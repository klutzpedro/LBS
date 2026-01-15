import { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { Clock, Search, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const History = () => {
  const [targets, setTargets] = useState([]);
  const [filteredTargets, setFilteredTargets] = useState([]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [caseFilter, setCaseFilter] = useState('all');

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    filterTargets();
  }, [targets, searchQuery, statusFilter, caseFilter]);

  const fetchData = async () => {
    try {
      const [targetsRes, casesRes] = await Promise.all([
        axios.get(`${API}/targets`),
        axios.get(`${API}/cases`)
      ]);

      setTargets(targetsRes.data);
      setCases(casesRes.data);
    } catch (error) {
      toast.error('Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const filterTargets = () => {
    let filtered = [...targets];

    if (searchQuery) {
      filtered = filtered.filter(t => 
        t.phone_number.includes(searchQuery) ||
        t.data?.name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(t => t.status === statusFilter);
    }

    if (caseFilter !== 'all') {
      filtered = filtered.filter(t => t.case_id === caseFilter);
    }

    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    setFilteredTargets(filtered);
  };

  const getCaseName = (caseId) => {
    const caseItem = cases.find(c => c.id === caseId);
    return caseItem ? caseItem.name : 'Unknown';
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
      <div className="mb-8">
        <h1 
          className="text-5xl font-bold mb-2"
          style={{ 
            fontFamily: 'Barlow Condensed, sans-serif',
            color: 'var(--foreground-primary)'
          }}
        >
          HISTORY
        </h1>
        <p style={{ color: 'var(--foreground-secondary)' }}>
          Riwayat query dan tracking
        </p>
      </div>

      {/* Filters */}
      <div 
        className="p-6 rounded-lg border mb-6"
        style={{
          backgroundColor: 'var(--background-secondary)',
          borderColor: 'var(--borders-default)'
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search 
              className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
              style={{ color: 'var(--foreground-muted)' }}
            />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="search-input"
              placeholder="Search phone or name..."
              className="pl-10 bg-background-tertiary border-borders-default"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="bg-background-tertiary border-borders-default">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>

          <Select value={caseFilter} onValueChange={setCaseFilter}>
            <SelectTrigger className="bg-background-tertiary border-borders-default">
              <SelectValue placeholder="Filter by case" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cases</SelectItem>
              {cases.map((caseItem) => (
                <SelectItem key={caseItem.id} value={caseItem.id}>
                  {caseItem.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* History Table */}
      {filteredTargets.length === 0 ? (
        <div 
          className="text-center py-20 rounded-lg border"
          style={{
            backgroundColor: 'var(--background-secondary)',
            borderColor: 'var(--borders-default)'
          }}
        >
          <Clock className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--foreground-muted)' }} />
          <p style={{ color: 'var(--foreground-muted)' }}>Tidak ada data yang ditemukan</p>
        </div>
      ) : (
        <div 
          className="rounded-lg border overflow-hidden"
          style={{
            backgroundColor: 'var(--background-secondary)',
            borderColor: 'var(--borders-default)'
          }}
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead 
                className="border-b"
                style={{ 
                  backgroundColor: 'var(--background-tertiary)',
                  borderColor: 'var(--borders-default)'
                }}
              >
                <tr>
                  <th 
                    className="text-left p-4 text-xs uppercase tracking-wide font-semibold"
                    style={{ 
                      color: 'var(--foreground-secondary)',
                      fontFamily: 'Rajdhani, sans-serif'
                    }}
                  >
                    Timestamp
                  </th>
                  <th 
                    className="text-left p-4 text-xs uppercase tracking-wide font-semibold"
                    style={{ 
                      color: 'var(--foreground-secondary)',
                      fontFamily: 'Rajdhani, sans-serif'
                    }}
                  >
                    Case
                  </th>
                  <th 
                    className="text-left p-4 text-xs uppercase tracking-wide font-semibold"
                    style={{ 
                      color: 'var(--foreground-secondary)',
                      fontFamily: 'Rajdhani, sans-serif'
                    }}
                  >
                    Phone Number
                  </th>
                  <th 
                    className="text-left p-4 text-xs uppercase tracking-wide font-semibold"
                    style={{ 
                      color: 'var(--foreground-secondary)',
                      fontFamily: 'Rajdhani, sans-serif'
                    }}
                  >
                    Status
                  </th>
                  <th 
                    className="text-left p-4 text-xs uppercase tracking-wide font-semibold"
                    style={{ 
                      color: 'var(--foreground-secondary)',
                      fontFamily: 'Rajdhani, sans-serif'
                    }}
                  >
                    Location
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTargets.map((target) => (
                  <tr
                    key={target.id}
                    data-testid={`history-row-${target.id}`}
                    className="border-b hover:bg-background-elevated transition-colors"
                    style={{ borderColor: 'var(--borders-subtle)' }}
                  >
                    <td className="p-4 text-sm" style={{ color: 'var(--foreground-primary)' }}>
                      {new Date(target.created_at).toLocaleString('id-ID')}
                    </td>
                    <td className="p-4 text-sm" style={{ color: 'var(--foreground-primary)' }}>
                      {getCaseName(target.case_id)}
                    </td>
                    <td className="p-4 text-sm font-mono" style={{ color: 'var(--accent-primary)' }}>
                      {target.phone_number}
                    </td>
                    <td className="p-4">
                      <span 
                        className="px-3 py-1 rounded-full text-xs font-medium uppercase"
                        style={{
                          backgroundColor:
                            target.status === 'completed'
                              ? 'rgba(0, 255, 136, 0.1)'
                              : target.status === 'error'
                              ? 'rgba(255, 59, 92, 0.1)'
                              : 'rgba(167, 139, 250, 0.1)',
                          color:
                            target.status === 'completed'
                              ? 'var(--status-success)'
                              : target.status === 'error'
                              ? 'var(--status-error)'
                              : 'var(--status-processing)',
                          fontFamily: 'Rajdhani, sans-serif'
                        }}
                      >
                        {target.status}
                      </span>
                    </td>
                    <td className="p-4 text-sm" style={{ color: 'var(--foreground-secondary)' }}>
                      {target.data ? (
                        <span className="font-mono">
                          {target.data.latitude?.toFixed(4)}, {target.data.longitude?.toFixed(4)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default History;