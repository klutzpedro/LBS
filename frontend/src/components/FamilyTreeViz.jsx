import React from 'react';

export const FamilyTreeViz = ({ members, targetNik }) => {
  if (!members || members.length === 0) {
    return (
      <div className="text-center py-8">
        <p style={{ color: 'var(--foreground-muted)' }}>
          Tidak ada data family
        </p>
      </div>
    );
  }

  // Organize members by relationship
  const head = members.find(m => m.relationship?.includes('KEPALA'));
  const spouse = members.find(m => m.relationship?.includes('ISTRI') || m.relationship?.includes('SUAMI'));
  const children = members.filter(m => m.relationship?.includes('ANAK'));
  const others = members.filter(m => 
    !m.relationship?.includes('KEPALA') && 
    !m.relationship?.includes('ISTRI') && 
    !m.relationship?.includes('SUAMI') && 
    !m.relationship?.includes('ANAK')
  );

  const MemberCard = ({ member, isTarget }) => (
    <div 
      className="p-3 rounded-lg border text-center"
      style={{
        backgroundColor: isTarget ? 'rgba(255, 59, 92, 0.2)' : 'var(--background-tertiary)',
        borderColor: isTarget ? 'var(--status-error)' : 'var(--borders-default)',
        borderWidth: isTarget ? '3px' : '1px',
        minWidth: '180px'
      }}
    >
      <div 
        className="w-3 h-3 rounded-full mx-auto mb-2"
        style={{ backgroundColor: isTarget ? 'var(--status-error)' : 'var(--foreground-muted)' }}
      />
      <p 
        className="text-xs uppercase tracking-wide mb-1"
        style={{ 
          color: isTarget ? 'var(--status-error)' : 'var(--foreground-muted)',
          fontFamily: 'Rajdhani, sans-serif',
          fontWeight: 'bold'
        }}
      >
        {member.relationship || 'MEMBER'}
      </p>
      <p 
        className="text-sm font-semibold mb-1"
        style={{ 
          color: 'var(--foreground-primary)',
          fontFamily: 'Barlow Condensed, sans-serif'
        }}
      >
        {member.name || 'Unknown'}
      </p>
      <p 
        className="text-xs font-mono"
        style={{ color: isTarget ? 'var(--status-error)' : 'var(--accent-primary)' }}
      >
        {member.nik}
      </p>
      {member.gender && (
        <p className="text-xs mt-1" style={{ color: 'var(--foreground-secondary)' }}>
          {member.gender}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Legend */}
      <div 
        className="p-3 rounded-lg border flex items-center gap-4 justify-center"
        style={{
          backgroundColor: 'var(--background-tertiary)',
          borderColor: 'var(--borders-subtle)'
        }}
      >
        <div className="flex items-center gap-2">
          <div 
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: 'var(--status-error)' }}
          />
          <span className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
            = Target Person
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div 
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: 'var(--foreground-muted)' }}
          />
          <span className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
            = Family Member
          </span>
        </div>
      </div>

      {/* Family Tree Structure */}
      <div className="space-y-4">
        {/* Level 1: Kepala Keluarga */}
        {head && (
          <div className="flex justify-center">
            <MemberCard member={head} isTarget={head.nik === targetNik} />
          </div>
        )}

        {/* Connection Line */}
        {head && (spouse || children.length > 0) && (
          <div 
            className="h-8 w-0.5 mx-auto"
            style={{ backgroundColor: 'var(--borders-default)' }}
          />
        )}

        {/* Level 2: Spouse */}
        {spouse && (
          <>
            <div className="flex justify-center">
              <MemberCard member={spouse} isTarget={spouse.nik === targetNik} />
            </div>
            {children.length > 0 && (
              <div 
                className="h-8 w-0.5 mx-auto"
                style={{ backgroundColor: 'var(--borders-default)' }}
              />
            )}
          </>
        )}

        {/* Level 3: Children */}
        {children.length > 0 && (
          <div className="flex flex-wrap justify-center gap-4">
            {children.map((child, idx) => (
              <div key={idx}>
                {idx > 0 && idx < children.length && (
                  <div 
                    className="h-8 w-0.5 mx-auto mb-4"
                    style={{ backgroundColor: 'var(--borders-default)' }}
                  />
                )}
                <MemberCard member={child} isTarget={child.nik === targetNik} />
              </div>
            ))}
          </div>
        )}

        {/* Other Members */}
        {others.length > 0 && (
          <>
            <div 
              className="h-8 w-0.5 mx-auto"
              style={{ backgroundColor: 'var(--borders-default)' }}
            />
            <div className="flex flex-wrap justify-center gap-4">
              {others.map((member, idx) => (
                <MemberCard key={idx} member={member} isTarget={member.nik === targetNik} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Summary */}
      <div 
        className="p-4 rounded-lg border"
        style={{
          backgroundColor: 'var(--background-tertiary)',
          borderColor: 'var(--borders-default)'
        }}
      >
        <p className="text-sm font-semibold mb-2" style={{ color: 'var(--foreground-primary)' }}>
          Family Summary
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span style={{ color: 'var(--foreground-muted)' }}>Total Members:</span>{' '}
            <span style={{ color: 'var(--foreground-primary)' }}>{members.length}</span>
          </div>
          <div>
            <span style={{ color: 'var(--foreground-muted)' }}>Family ID:</span>{' '}
            <span className="font-mono" style={{ color: 'var(--accent-primary)' }}>{members[0]?.family_id || 'N/A'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
