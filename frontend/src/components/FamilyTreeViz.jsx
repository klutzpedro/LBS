import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Sparkles, RefreshCw } from 'lucide-react';

export const FamilyTreeViz = ({ members, targetNik }) => {
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);

  if (!members || members.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
          Tidak ada data family
        </p>
      </div>
    );
  }

  // Organize members by relationship
  const head = members.find(m => m.relationship?.includes('KEPALA'));
  const spouse = members.find(m => m.relationship?.includes('ISTRI') || m.relationship?.includes('SUAMI'));
  
  // Sort children by DOB (oldest first = Anak 1)
  // If no DOB field, try to extract from Indonesian NIK
  const children = members
    .filter(m => m.relationship?.includes('ANAK'))
    .sort((a, b) => {
      // Parse DOB from various sources
      const parseDOB = (member) => {
        // First try explicit DOB fields
        const dobField = member.dob || member.birth_date || member.tanggal_lahir || member.tgl_lahir;
        if (dobField) {
          const str = String(dobField).trim();
          // Try DD-MM-YYYY or DD/MM/YYYY
          let match = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
          if (match) {
            return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
          }
          // Try YYYY-MM-DD
          match = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
          if (match) {
            return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
          }
          // Fallback: try native Date parse
          const parsed = new Date(str);
          if (!isNaN(parsed)) return parsed;
        }
        
        // Try to extract from Indonesian NIK (16 digits)
        // Format: PPPPPP-DDMMYY-XXXX (PP=province, DD=day, MM=month, YY=year)
        // For females, DD is +40 (e.g., 41 = day 1)
        const nik = member.nik;
        if (nik && nik.length >= 12) {
          const nikStr = String(nik).replace(/\D/g, ''); // Remove non-digits
          if (nikStr.length >= 12) {
            let day = parseInt(nikStr.substring(6, 8));
            const month = parseInt(nikStr.substring(8, 10));
            const year = parseInt(nikStr.substring(10, 12));
            
            // If day > 40, it's a female (subtract 40)
            if (day > 40) day -= 40;
            
            // Determine century: if year > 50, assume 1900s; else 2000s
            const fullYear = year > 50 ? 1900 + year : 2000 + year;
            
            if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
              return new Date(fullYear, month - 1, day);
            }
          }
        }
        
        return new Date(9999, 11, 31); // No DOB = put at end
      };
      
      const dobA = parseDOB(a);
      const dobB = parseDOB(b);
      return dobA - dobB; // Oldest first (smaller date = older)
    })
    .map((child, idx) => ({
      ...child,
      childOrder: idx + 1 // Add child order for display
    }));
  
  const others = members.filter(m => 
    !m.relationship?.includes('KEPALA') && 
    !m.relationship?.includes('ISTRI') && 
    !m.relationship?.includes('SUAMI') && 
    !m.relationship?.includes('ANAK')
  );

  const fetchAIAnalysis = async () => {
    setLoadingAI(true);
    try {
      const response = await axios.post(`${API}/ai/family-analysis`, {
        members: members,
        target_nik: targetNik
      });
      if (response.data.success) {
        setAiAnalysis(response.data.analysis);
      } else {
        setAiAnalysis(response.data.analysis || 'Gagal menganalisis');
      }
    } catch (error) {
      console.error('AI Analysis error:', error);
      setAiAnalysis('Tidak dapat menganalisis keluarga');
    } finally {
      setLoadingAI(false);
    }
  };

  const MemberCard = ({ member, isTarget, isHead, childOrder }) => (
    <div 
      className="p-2 rounded border text-center"
      style={{
        backgroundColor: isTarget ? 'rgba(255, 59, 92, 0.15)' : isHead ? 'rgba(0, 217, 255, 0.1)' : 'var(--background-tertiary)',
        borderColor: isTarget ? 'var(--status-error)' : isHead ? 'var(--accent-primary)' : 'var(--borders-default)',
        borderWidth: isTarget || isHead ? '2px' : '1px',
        minWidth: '120px',
        maxWidth: '140px'
      }}
    >
      <p 
        className="text-xs uppercase tracking-wide mb-0.5"
        style={{ 
          color: isTarget ? 'var(--status-error)' : isHead ? 'var(--accent-primary)' : 'var(--foreground-muted)',
          fontFamily: 'Rajdhani, sans-serif',
          fontWeight: 'bold',
          fontSize: '9px'
        }}
      >
        {childOrder ? `ANAK ${childOrder}` : (member.relationship || 'MEMBER')}
      </p>
      <p 
        className="text-xs font-semibold mb-0.5 truncate"
        style={{ 
          color: 'var(--foreground-primary)',
          fontFamily: 'Barlow Condensed, sans-serif'
        }}
        title={member.name}
      >
        {member.name || 'Unknown'}
      </p>
      {(member.dob || member.birth_date || member.tanggal_lahir) && (
        <p 
          className="text-xs mb-0.5"
          style={{ 
            color: 'var(--foreground-muted)',
            fontSize: '8px'
          }}
        >
          {member.dob || member.birth_date || member.tanggal_lahir}
        </p>
      )}
      <p 
        className="font-mono truncate"
        style={{ 
          color: isTarget ? 'var(--status-error)' : 'var(--accent-primary)',
          fontSize: '9px'
        }}
      >
        {member.nik}
      </p>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* AI Analysis Section */}
      <div 
        className="p-2 rounded border"
        style={{
          backgroundColor: 'var(--background-tertiary)',
          borderColor: 'var(--borders-subtle)'
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1">
            <Sparkles className="w-3 h-3" style={{ color: 'var(--accent-secondary)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--foreground-primary)' }}>
              AI Analysis
            </span>
          </div>
          <Button
            size="sm"
            onClick={fetchAIAnalysis}
            disabled={loadingAI}
            className="h-6 px-2 text-xs"
            style={{
              backgroundColor: 'var(--accent-secondary)',
              color: 'var(--background-primary)'
            }}
          >
            {loadingAI ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : aiAnalysis ? (
              <RefreshCw className="w-3 h-3" />
            ) : (
              'Analisis'
            )}
          </Button>
        </div>
        {aiAnalysis ? (
          <p className="text-xs leading-relaxed" style={{ color: 'var(--foreground-secondary)' }}>
            {aiAnalysis}
          </p>
        ) : (
          <p className="text-xs italic" style={{ color: 'var(--foreground-muted)' }}>
            Klik "Analisis" untuk mendapatkan insight AI tentang keluarga ini
          </p>
        )}
      </div>

      {/* Family Tree Visual */}
      <div className="space-y-2">
        {/* Parents Row */}
        <div className="flex justify-center gap-3">
          {head && <MemberCard member={head} isTarget={head.nik === targetNik} isHead={true} />}
          {spouse && <MemberCard member={spouse} isTarget={spouse.nik === targetNik} isHead={false} />}
        </div>

        {/* Connection Line */}
        {(head || spouse) && children.length > 0 && (
          <div className="flex justify-center">
            <div 
              className="h-4 w-0.5"
              style={{ backgroundColor: 'var(--borders-default)' }}
            />
          </div>
        )}

        {/* Children Row */}
        {children.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {children.map((child, idx) => (
              <MemberCard 
                key={idx} 
                member={child} 
                isTarget={child.nik === targetNik} 
                isHead={false}
                childOrder={child.childOrder}
              />
            ))}
          </div>
        )}

        {/* Other Members */}
        {others.length > 0 && (
          <>
            <div className="flex justify-center">
              <div 
                className="h-4 w-0.5"
                style={{ backgroundColor: 'var(--borders-default)' }}
              />
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {others.map((member, idx) => (
                <MemberCard key={idx} member={member} isTarget={member.nik === targetNik} isHead={false} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Legend */}
      <div 
        className="flex items-center justify-center gap-4 py-1"
        style={{ borderTop: '1px solid var(--borders-subtle)' }}
      >
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded" style={{ backgroundColor: 'var(--accent-primary)' }} />
          <span className="text-xs" style={{ color: 'var(--foreground-muted)', fontSize: '9px' }}>Kepala</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded" style={{ backgroundColor: 'var(--status-error)' }} />
          <span className="text-xs" style={{ color: 'var(--foreground-muted)', fontSize: '9px' }}>Target</span>
        </div>
        <span className="text-xs font-mono" style={{ color: 'var(--foreground-muted)', fontSize: '9px' }}>
          {members.length} anggota
        </span>
      </div>
    </div>
  );
};
