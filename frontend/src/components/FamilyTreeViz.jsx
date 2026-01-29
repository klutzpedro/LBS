import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Sparkles, RefreshCw } from 'lucide-react';

// Member Card Component - extracted outside to avoid unstable nested component
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

export const FamilyTreeViz = ({ members, targetNik }) => {
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);

  // Debug: Log members data
  useEffect(() => {
    console.log('[FamilyTreeViz] Received members:', members);
    console.log('[FamilyTreeViz] members type:', typeof members);
    console.log('[FamilyTreeViz] members is array:', Array.isArray(members));
    console.log('[FamilyTreeViz] members length:', members?.length);
    console.log('[FamilyTreeViz] targetNik:', targetNik);
  }, [members, targetNik]);

  // Normalize member data - handle different field names
  const normalizedMembers = useMemo(() => {
    // Handle case where members might be the full object with 'members' property
    let membersList = members;
    
    // If members is an object with 'members' property, extract it
    if (members && typeof members === 'object' && !Array.isArray(members)) {
      if (members.members && Array.isArray(members.members)) {
        console.log('[FamilyTreeViz] Extracting members array from object');
        membersList = members.members;
      } else {
        console.warn('[FamilyTreeViz] Invalid members format:', members);
        return [];
      }
    }
    
    if (!membersList || !Array.isArray(membersList) || membersList.length === 0) {
      console.warn('[FamilyTreeViz] No valid members array');
      return [];
    }
    
    console.log('[FamilyTreeViz] Processing', membersList.length, 'members');
    
    return membersList.map(m => ({
      ...m,
      name: m.name || m.full_name || m.nama || m.Full_Name || m['Full Name'] || 'Unknown',
      relationship: (m.relationship || m.hubungan || m.shdk || m.Relationship || m.SHDK || '').toString().toUpperCase(),
      dob: m.dob || m.birth_date || m.tanggal_lahir || m.Dob || m.DOB || m['Tanggal Lahir'] || null,
      gender: (m.gender || m.jenis_kelamin || m.Gender || m['Jenis Kelamin'] || '').toString().toUpperCase()
    }));
  }, [members]);

  // Organize members by relationship
  const { head, spouse, children, others } = useMemo(() => {
    if (normalizedMembers.length === 0) {
      return { head: null, spouse: null, children: [], others: [] };
    }

    const headMember = normalizedMembers.find(m => 
      m.relationship?.includes('KEPALA') || 
      m.relationship?.includes('HEAD') ||
      m.relationship === '1'
    );
    
    const spouseMember = normalizedMembers.find(m => 
      m.relationship?.includes('ISTRI') || 
      m.relationship?.includes('SUAMI') ||
      m.relationship?.includes('WIFE') ||
      m.relationship?.includes('HUSBAND') ||
      m.relationship?.includes('SPOUSE') ||
      m.relationship === '2'
    );
    
    // Sort children by DOB (oldest first = Anak 1)
    const childrenMembers = normalizedMembers
      .filter(m => 
        m.relationship?.includes('ANAK') || 
        m.relationship?.includes('CHILD') ||
        m.relationship?.includes('SON') ||
        m.relationship?.includes('DAUGHTER') ||
        m.relationship === '3' || m.relationship === '4' || m.relationship === '5'
      )
      .sort((a, b) => {
        // Try to parse DOB for sorting
        const dobA = a.dob || '';
        const dobB = b.dob || '';
        
        // Try to extract year from DOB
        const yearMatchA = dobA.match(/(\d{4})/);
        const yearMatchB = dobB.match(/(\d{4})/);
        
        if (yearMatchA && yearMatchB) {
          return parseInt(yearMatchA[1]) - parseInt(yearMatchB[1]);
        }
        
        // Fallback: try to extract from NIK (positions 7-12 = DDMMYY)
        if (a.nik && b.nik) {
          const nikDobA = a.nik.substring(6, 12);
          const nikDobB = b.nik.substring(6, 12);
          return nikDobA.localeCompare(nikDobB);
        }
        
        return 0;
      })
      .map((child, idx) => ({
        ...child,
        childOrder: idx + 1
      }));
    
    // Collect names from main family tree (head, spouse, children)
    const mainFamilyNames = new Set();
    if (headMember?.name && headMember.name !== 'Unknown') {
      mainFamilyNames.add(headMember.name.toUpperCase().trim());
    }
    if (spouseMember?.name && spouseMember.name !== 'Unknown') {
      mainFamilyNames.add(spouseMember.name.toUpperCase().trim());
    }
    childrenMembers.forEach(child => {
      if (child.name && child.name !== 'Unknown') {
        mainFamilyNames.add(child.name.toUpperCase().trim());
      }
    });
    
    // Filter others: 
    // 1. Must have real name (not "Unknown" or empty)
    // 2. Not already in main family tree (by name)
    // 3. Remove duplicates by name
    const othersMembers = normalizedMembers
      .filter(m => 
        !m.relationship?.includes('KEPALA') && 
        !m.relationship?.includes('HEAD') &&
        !m.relationship?.includes('ISTRI') && 
        !m.relationship?.includes('SUAMI') && 
        !m.relationship?.includes('WIFE') &&
        !m.relationship?.includes('HUSBAND') &&
        !m.relationship?.includes('SPOUSE') &&
        !m.relationship?.includes('ANAK') &&
        !m.relationship?.includes('CHILD') &&
        !m.relationship?.includes('SON') &&
        !m.relationship?.includes('DAUGHTER') &&
        m.relationship !== '1' && m.relationship !== '2' && 
        m.relationship !== '3' && m.relationship !== '4' && m.relationship !== '5'
      )
      // Filter out Unknown and empty names
      .filter(m => m.name && m.name !== 'Unknown' && m.name.trim() !== '')
      // Filter out names already in main family tree
      .filter(m => !mainFamilyNames.has(m.name.toUpperCase().trim()))
      // Remove duplicates by name
      .filter((m, idx, self) => 
        self.findIndex(x => x.name.toUpperCase().trim() === m.name.toUpperCase().trim()) === idx
      );

    return { 
      head: headMember, 
      spouse: spouseMember, 
      children: childrenMembers, 
      others: othersMembers 
    };
  }, [normalizedMembers]);

  if (!members || members.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
          Tidak ada data family
        </p>
      </div>
    );
  }

  // AI Analysis for family
  const analyzeFamily = async () => {
    setLoadingAI(true);
    try {
      const membersText = normalizedMembers.map(m => 
        `${m.name || 'Unknown'} (${m.relationship || 'Unknown'}, ${m.gender === 'L' ? 'Laki-laki' : m.gender === 'P' ? 'Perempuan' : '-'}${m.dob ? ', lahir ' + m.dob : ''})`
      ).join('\n');
      
      const targetInfo = normalizedMembers.find(m => m.nik === targetNik);
      const familySummary = `ANGGOTA KELUARGA:\n${membersText}\n${targetInfo ? '\nTarget investigasi: ' + (targetInfo.name || 'Unknown') + ' (' + (targetInfo.relationship || '-') + ')' : ''}`;
      
      const response = await axios.post(`${API}/api/ai/analyze-family`, {
        family_data: familySummary
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      setAiAnalysis(response.data.analysis);
    } catch (error) {
      console.error('AI Analysis error:', error);
      setAiAnalysis('Tidak dapat menganalisis keluarga');
    } finally {
      setLoadingAI(false);
    }
  };

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
          <span className="text-xs font-semibold" style={{ color: 'var(--foreground-secondary)' }}>
            AI ANALYSIS
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={analyzeFamily}
            disabled={loadingAI}
            className="h-6 text-xs"
          >
            {loadingAI ? (
              <RefreshCw className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <Sparkles className="w-3 h-3 mr-1" />
            )}
            {loadingAI ? 'Analyzing...' : 'Analisis'}
          </Button>
        </div>
        {aiAnalysis ? (
          <p className="text-xs" style={{ color: 'var(--foreground-primary)' }}>
            {aiAnalysis}
          </p>
        ) : (
          <p className="text-xs italic" style={{ color: 'var(--foreground-muted)' }}>
            Klik &quot;Analisis&quot; untuk mendapatkan insight AI tentang keluarga ini
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
              className="w-0.5 h-3"
              style={{ backgroundColor: 'var(--borders-default)' }}
            />
          </div>
        )}
        
        {/* Children Row */}
        {children.length > 0 && (
          <div className="flex justify-center gap-2 flex-wrap">
            {children.map((child) => (
              <MemberCard 
                key={child.nik} 
                member={child} 
                isTarget={child.nik === targetNik} 
                isHead={false}
                childOrder={child.childOrder}
              />
            ))}
          </div>
        )}
        
        {/* Others Row */}
        {others.length > 0 && (
          <>
            <div 
              className="text-center text-xs py-1"
              style={{ color: 'var(--foreground-muted)' }}
            >
              Anggota Lain
            </div>
            <div className="flex justify-center gap-2 flex-wrap">
              {others.map((other) => (
                <MemberCard 
                  key={other.nik} 
                  member={other} 
                  isTarget={other.nik === targetNik} 
                  isHead={false}
                />
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
          {normalizedMembers.length} anggota
        </span>
      </div>
    </div>
  );
};
