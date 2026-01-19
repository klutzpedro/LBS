import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Phone } from 'lucide-react';
import { FamilyTreeViz } from '@/components/FamilyTreeViz';

/**
 * New Case Dialog
 */
export const NewCaseDialog = ({ 
  open, 
  onOpenChange, 
  newCaseName, 
  onCaseNameChange, 
  onSubmit, 
  submitting 
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent 
      className="z-[9999] max-w-sm p-4"
      style={{
        backgroundColor: 'var(--background-elevated)',
        borderColor: 'var(--borders-strong)'
      }}
    >
      <DialogHeader className="pb-2">
        <DialogTitle 
          className="text-lg font-bold"
          style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}
        >
          New Case
        </DialogTitle>
      </DialogHeader>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label className="text-xs uppercase tracking-wide mb-1 block" style={{ color: 'var(--foreground-secondary)' }}>
            Case Name
          </Label>
          <Input
            value={newCaseName}
            onChange={(e) => onCaseNameChange(e.target.value)}
            className="bg-background-tertiary border-borders-default h-9"
            style={{ color: '#000000' }}
            placeholder="Enter case name"
            required
          />
        </div>
        <Button
          type="submit"
          disabled={submitting}
          className="w-full py-2 text-sm"
          style={{
            backgroundColor: 'var(--accent-primary)',
            color: 'var(--background-primary)',
            fontFamily: 'Rajdhani, sans-serif'
          }}
        >
          {submitting ? 'Creating...' : 'CREATE CASE'}
        </Button>
      </form>
    </DialogContent>
  </Dialog>
);

/**
 * Add Target Dialog
 */
export const AddTargetDialog = ({ 
  open, 
  onOpenChange, 
  newPhoneNumber, 
  onPhoneNumberChange, 
  onSubmit, 
  submitting,
  telegramAuthorized 
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent 
      className="z-[9999] max-w-sm p-4"
      style={{
        backgroundColor: 'var(--background-elevated)',
        borderColor: 'var(--borders-strong)'
      }}
    >
      <DialogHeader className="pb-2">
        <DialogTitle 
          className="text-lg font-bold"
          style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}
        >
          Add Target
        </DialogTitle>
      </DialogHeader>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label className="text-xs uppercase tracking-wide mb-1 block" style={{ color: 'var(--foreground-secondary)' }}>
            Phone Number
          </Label>
          <div className="relative">
            <Phone 
              className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
              style={{ color: 'var(--foreground-muted)' }}
            />
            <Input
              value={newPhoneNumber}
              onChange={(e) => onPhoneNumberChange(e.target.value)}
              className="pl-10 font-mono bg-background-tertiary border-borders-default h-9"
              style={{ color: '#000000' }}
              placeholder="628123456789"
              required
            />
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--foreground-muted)' }}>
            Format: 62 diikuti 9-12 digit
          </p>
        </div>
        
        {!telegramAuthorized && (
          <div 
            className="p-2 rounded border text-xs"
            style={{
              backgroundColor: 'rgba(255, 184, 0, 0.1)',
              borderColor: 'var(--status-warning)',
              color: 'var(--foreground-secondary)'
            }}
          >
            ⚠️ Telegram belum terhubung. Setup di Settings.
          </div>
        )}
        
        <Button
          type="submit"
          disabled={submitting}
          className="w-full py-2 text-sm"
          style={{
            backgroundColor: 'var(--accent-primary)',
            color: 'var(--background-primary)',
            fontFamily: 'Rajdhani, sans-serif'
          }}
        >
          {submitting ? 'Processing...' : 'START QUERY'}
        </Button>
      </form>
    </DialogContent>
  </Dialog>
);

/**
 * Duplicate Phone Dialog
 */
export const DuplicatePhoneDialog = ({
  open,
  onOpenChange,
  pendingPhoneNumber,
  existingTarget,
  onUseExisting,
  onRefreshLocation
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent 
      className="z-[9999] max-w-sm p-4"
      style={{
        backgroundColor: 'var(--background-elevated)',
        borderColor: 'var(--borders-strong)'
      }}
    >
      <DialogHeader className="pb-2">
        <DialogTitle 
          className="text-lg font-bold"
          style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}
        >
          NOMOR SUDAH ADA
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div 
          className="p-2 rounded border"
          style={{
            backgroundColor: 'rgba(255, 184, 0, 0.1)',
            borderColor: 'var(--status-warning)'
          }}
        >
          <p className="text-xs mb-1" style={{ color: 'var(--foreground-primary)' }}>
            Target <span className="font-mono font-bold" style={{ color: 'var(--accent-primary)' }}>{pendingPhoneNumber}</span> sudah ada.
          </p>
          {existingTarget && (
            <div className="text-xs space-y-0.5" style={{ color: 'var(--foreground-secondary)' }}>
              <p>Status: <span className="font-semibold">{existingTarget.status}</span></p>
              {existingTarget.data && (
                <p>Updated: {new Date(existingTarget.data.timestamp || existingTarget.created_at).toLocaleString('id-ID')}</p>
              )}
              {existingTarget.reghp_status === 'completed' && (
                <p className="font-semibold" style={{ color: 'var(--status-success)' }}>
                  ✓ Data tersedia
                </p>
              )}
            </div>
          )}
        </div>

        <p className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
          Deteksi posisi terbaru?
        </p>

        <div className="flex gap-2">
          <Button
            onClick={onUseExisting}
            variant="outline"
            className="flex-1 py-2 text-xs"
            style={{
              backgroundColor: 'var(--background-tertiary)',
              borderColor: 'var(--borders-default)',
              color: 'var(--foreground-primary)'
            }}
          >
            Data Lama
          </Button>
          <Button
            onClick={onRefreshLocation}
            className="flex-1 py-2 text-xs"
            style={{
              backgroundColor: 'var(--accent-primary)',
              color: 'var(--background-primary)',
              fontFamily: 'Rajdhani, sans-serif'
            }}
          >
            Posisi Baru
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
);

/**
 * Schedule Dialog
 */
export const ScheduleDialog = ({
  open,
  onOpenChange,
  selectedTarget,
  scheduleInterval,
  onIntervalChange,
  onSubmit
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent 
      className="z-[10000] max-w-sm p-4"
      style={{
        backgroundColor: 'var(--background-elevated)',
        borderColor: 'var(--borders-strong)'
      }}
    >
      <DialogHeader className="pb-2">
        <DialogTitle 
          className="text-lg font-bold"
          style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}
        >
          JADWALKAN PEMBAHARUAN
        </DialogTitle>
      </DialogHeader>
      <form onSubmit={onSubmit} className="space-y-3">
        {selectedTarget && (
          <div 
            className="p-2 rounded border"
            style={{
              backgroundColor: 'var(--background-tertiary)',
              borderColor: 'var(--borders-default)'
            }}
          >
            <p className="text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--foreground-muted)' }}>
              Target
            </p>
            <p className="font-mono text-sm" style={{ color: 'var(--accent-primary)' }}>
              {selectedTarget.phone_number}
            </p>
          </div>
        )}

        <div>
          <Label className="text-xs uppercase tracking-wide mb-1 block" style={{ color: 'var(--foreground-secondary)' }}>
            Interval Type
          </Label>
          <Select 
            value={scheduleInterval.type} 
            onValueChange={(value) => onIntervalChange({ ...scheduleInterval, type: value })}
          >
            <SelectTrigger 
              className="w-full h-9"
              style={{
                backgroundColor: 'var(--background-tertiary)',
                borderColor: 'var(--borders-default)',
                color: 'var(--foreground-primary)'
              }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              className="z-[10001]"
              style={{
                backgroundColor: 'var(--background-elevated)',
                borderColor: 'var(--borders-strong)',
                color: 'var(--foreground-primary)'
              }}
            >
              <SelectItem value="minutes" style={{ color: 'var(--foreground-primary)' }}>
                Minutes (Per Menit)
              </SelectItem>
              <SelectItem value="hourly" style={{ color: 'var(--foreground-primary)' }}>
                Hourly (Per Jam)
              </SelectItem>
              <SelectItem value="daily" style={{ color: 'var(--foreground-primary)' }}>
                Daily (Per Hari)
              </SelectItem>
              <SelectItem value="weekly" style={{ color: 'var(--foreground-primary)' }}>
                Weekly (Per Minggu)
              </SelectItem>
              <SelectItem value="monthly" style={{ color: 'var(--foreground-primary)' }}>
                Monthly (Per Bulan)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs uppercase tracking-wide mb-1 block" style={{ color: 'var(--foreground-secondary)' }}>
            Interval Value
          </Label>
          <Input
            type="number"
            min="1"
            value={scheduleInterval.value}
            onChange={(e) => onIntervalChange({ ...scheduleInterval, value: parseInt(e.target.value) })}
            className="bg-background-tertiary border-borders-default h-9"
            style={{ color: '#000000' }}
            placeholder="1"
            required
          />
          <p className="text-xs mt-0.5" style={{ color: 'var(--foreground-muted)' }}>
            {scheduleInterval.type === 'minutes' && `Setiap ${scheduleInterval.value} menit`}
            {scheduleInterval.type === 'hourly' && `Setiap ${scheduleInterval.value} jam`}
            {scheduleInterval.type === 'daily' && `Setiap ${scheduleInterval.value} hari`}
            {scheduleInterval.type === 'weekly' && `Setiap ${scheduleInterval.value} minggu`}
            {scheduleInterval.type === 'monthly' && `Setiap ${scheduleInterval.value} bulan`}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            variant="outline"
            className="flex-1 py-2 text-sm"
            style={{
              backgroundColor: 'var(--background-tertiary)',
              borderColor: 'var(--borders-default)',
              color: 'var(--foreground-primary)'
            }}
          >
            Batal
          </Button>
          <Button
            type="submit"
            className="flex-1 py-2 text-sm"
            style={{
              backgroundColor: 'var(--accent-primary)',
              color: 'var(--background-primary)',
              fontFamily: 'Rajdhani, sans-serif'
            }}
          >
            BUAT JADWAL
          </Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
);

/**
 * Reghp Info Dialog
 */
export const ReghpInfoDialog = ({
  open,
  onOpenChange,
  selectedTarget,
  onShowNikInfo,
  onNikPendalaman,
  loadingNikPendalaman
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent 
      className="z-[9999] max-w-md max-h-[65vh] overflow-y-auto p-4"
      style={{
        backgroundColor: 'var(--background-elevated)',
        borderColor: 'var(--borders-strong)'
      }}
    >
      <DialogHeader className="pb-2">
        <DialogTitle 
          className="text-lg font-bold"
          style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}
        >
          INFO PENDALAMAN (REGHP)
        </DialogTitle>
      </DialogHeader>
      {selectedTarget?.reghp_data && (
        <div className="space-y-2">
          {/* Phone Number */}
          <div>
            <p className="text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--foreground-muted)' }}>
              Phone Number
            </p>
            <p className="font-mono text-sm" style={{ color: 'var(--accent-primary)' }}>
              {selectedTarget.phone_number}
            </p>
          </div>

          {/* Parsed Data */}
          {selectedTarget.reghp_data.parsed_data && (
            <div 
              className="p-2 rounded border"
              style={{
                backgroundColor: 'var(--background-tertiary)',
                borderColor: 'var(--borders-default)'
              }}
            >
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--foreground-primary)' }}>
                Registration Info
              </p>
              <div className="space-y-1">
                {Object.entries(selectedTarget.reghp_data.parsed_data).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-xs">
                    <span style={{ color: 'var(--foreground-muted)' }}>{key}:</span>
                    <span className="font-mono" style={{ color: 'var(--foreground-primary)' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* NIK Entries */}
          {selectedTarget.reghp_data.niks && selectedTarget.reghp_data.niks.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--foreground-muted)' }}>
                NIK Entries ({selectedTarget.reghp_data.niks.length})
              </p>
              <div className="space-y-1">
                {selectedTarget.reghp_data.niks.map((nik) => {
                  const nikQuery = selectedTarget.nik_queries?.[nik];
                  const nikStatus = nikQuery?.status || 'not_started';
                  
                  return (
                    <div 
                      key={nik}
                      className="p-2 rounded border flex items-center justify-between"
                      style={{
                        backgroundColor: 'var(--background-secondary)',
                        borderColor: 'var(--borders-subtle)'
                      }}
                    >
                      <div>
                        <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>NIK</p>
                        <p className="font-mono text-xs" style={{ color: 'var(--accent-primary)' }}>
                          {nik}
                        </p>
                      </div>
                      <div>
                        {nikStatus === 'completed' ? (
                          <Button
                            size="sm"
                            onClick={() => onShowNikInfo(nikQuery.data)}
                            className="text-xs py-1 px-2"
                            style={{
                              backgroundColor: 'var(--accent-secondary)',
                              color: 'var(--background-primary)'
                            }}
                          >
                            📋 Info
                          </Button>
                        ) : nikStatus === 'processing' || loadingNikPendalaman === nik ? (
                          <span className="text-xs" style={{ color: 'var(--status-processing)' }}>
                            ⏳
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => onNikPendalaman(selectedTarget.id, nik)}
                            disabled={loadingNikPendalaman === nik}
                            className="text-xs py-1 px-2 disabled:opacity-50"
                            style={{
                              backgroundColor: 'var(--status-warning)',
                              color: 'var(--background-primary)'
                            }}
                          >
                            {loadingNikPendalaman === nik ? '⏳' : '🔍'} Pendalaman
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Raw Response */}
          <details className="text-xs">
            <summary className="cursor-pointer uppercase tracking-wide mb-1" style={{ color: 'var(--foreground-muted)' }}>
              Raw Response
            </summary>
            <div 
              className="p-2 rounded border font-mono whitespace-pre-wrap mt-1"
              style={{
                backgroundColor: 'var(--background-tertiary)',
                borderColor: 'var(--borders-subtle)',
                color: 'var(--foreground-secondary)',
                maxHeight: '150px',
                overflowY: 'auto',
                fontSize: '10px'
              }}
            >
              {selectedTarget.reghp_data.raw_text}
            </div>
          </details>

          <Button
            onClick={() => onOpenChange(false)}
            className="w-full py-2 text-sm"
            style={{
              backgroundColor: 'var(--accent-primary)',
              color: 'var(--background-primary)'
            }}
          >
            CLOSE
          </Button>
        </div>
      )}
    </DialogContent>
  </Dialog>
);

/**
 * NIK Info Dialog
 */
export const NikInfoDialog = ({
  open,
  onOpenChange,
  selectedNikData,
  selectedReghpTarget,
  onShowFamilyTree,
  onFamilyPendalaman,
  loadingFamilyPendalaman
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent 
      className="z-[9999] max-w-lg max-h-[70vh] overflow-y-auto p-4"
      style={{
        backgroundColor: 'var(--background-elevated)',
        borderColor: 'var(--borders-strong)'
      }}
    >
      <DialogHeader className="pb-2">
        <DialogTitle 
          className="text-lg font-bold"
          style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}
        >
          INFO PENDALAMAN NIK
        </DialogTitle>
      </DialogHeader>
      {selectedNikData && (
        <div className="space-y-2">
          {/* NIK */}
          <div>
            <p className="text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--foreground-muted)' }}>
              NIK
            </p>
            <p className="font-mono text-sm font-bold" style={{ color: 'var(--accent-primary)' }}>
              {selectedNikData.nik}
            </p>
          </div>

          {/* Photo */}
          {selectedNikData.photo && (
            <div>
              <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--foreground-muted)' }}>
                Foto KTP
              </p>
              <div 
                className="rounded border overflow-hidden"
                style={{ borderColor: 'var(--borders-default)', maxWidth: '180px' }}
              >
                <img 
                  src={selectedNikData.photo} 
                  alt="KTP" 
                  className="w-full"
                  style={{ maxHeight: '200px', objectFit: 'contain', backgroundColor: 'var(--background-tertiary)' }}
                />
              </div>
            </div>
          )}

          {/* Parsed Data Table */}
          {selectedNikData.parsed_data && Object.keys(selectedNikData.parsed_data).length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--foreground-primary)', fontFamily: 'Barlow Condensed, sans-serif' }}>
                DATA DIRI LENGKAP
              </p>
              <div 
                className="rounded border overflow-hidden"
                style={{
                  backgroundColor: 'var(--background-tertiary)',
                  borderColor: 'var(--borders-default)'
                }}
              >
                <table className="w-full text-xs">
                  <tbody>
                    {Object.entries(selectedNikData.parsed_data).map(([key, value], idx) => (
                      <NikDataRow 
                        key={idx}
                        dataKey={key}
                        value={value}
                        selectedNikData={selectedNikData}
                        selectedReghpTarget={selectedReghpTarget}
                        onShowFamilyTree={onShowFamilyTree}
                        onFamilyPendalaman={onFamilyPendalaman}
                        loadingFamilyPendalaman={loadingFamilyPendalaman}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <Button
            onClick={() => onOpenChange(false)}
            className="w-full py-2 text-sm"
            style={{
              backgroundColor: 'var(--accent-primary)',
              color: 'var(--background-primary)'
            }}
          >
            CLOSE
          </Button>
        </div>
      )}
    </DialogContent>
  </Dialog>
);

// NIK Data Row component for the table
const NikDataRow = ({
  dataKey,
  value,
  selectedNikData,
  selectedReghpTarget,
  onShowFamilyTree,
  onFamilyPendalaman,
  loadingFamilyPendalaman
}) => {
  const currentNik = selectedNikData.nik;
  const nikQuery = selectedReghpTarget?.nik_queries?.[currentNik];
  const familyStatus = nikQuery?.family_status || 'not_started';
  const familyData = nikQuery?.family_data;

  return (
    <tr 
      className="border-b"
      style={{ borderColor: 'var(--borders-subtle)' }}
    >
      <td 
        className="py-1.5 px-2 font-medium"
        style={{ 
          color: 'var(--foreground-secondary)',
          width: '35%',
          backgroundColor: 'rgba(0, 217, 255, 0.05)'
        }}
      >
        <div className="flex items-center gap-1">
          <span>{dataKey}</span>
          {/* Family ID Button */}
          {dataKey === 'Family ID' && value && (
            <>
              {familyStatus === 'completed' && familyData ? (
                <Button
                  size="sm"
                  onClick={() => onShowFamilyTree(familyData, currentNik)}
                  className="ml-auto"
                  style={{
                    backgroundColor: 'var(--accent-secondary)',
                    color: 'var(--background-primary)',
                    fontSize: '9px',
                    padding: '1px 6px',
                    height: 'auto'
                  }}
                >
                  📋 Info
                </Button>
              ) : familyStatus === 'processing' || loadingFamilyPendalaman === currentNik ? (
                <span 
                  className="ml-auto text-xs"
                  style={{ color: 'var(--status-processing)' }}
                >
                  ⏳
                </span>
              ) : (
                <Button
                  size="sm"
                  onClick={() => onFamilyPendalaman(selectedReghpTarget?.id, value, currentNik)}
                  disabled={loadingFamilyPendalaman === currentNik}
                  className="ml-auto disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--status-warning)',
                    color: 'var(--background-primary)',
                    fontSize: '9px',
                    padding: '1px 6px',
                    height: 'auto'
                  }}
                >
                  {loadingFamilyPendalaman === currentNik ? '⏳' : '🔍'} Family
                </Button>
              )}
            </>
          )}
        </div>
      </td>
      <td 
        className="py-1.5 px-2"
        style={{ color: 'var(--foreground-primary)' }}
      >
        {value}
      </td>
    </tr>
  );
};

/**
 * Family Tree Dialog
 */
export const FamilyTreeDialog = ({
  open,
  onOpenChange,
  selectedFamilyData,
  targetNikForTree
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent 
      className="z-[9999] max-w-2xl max-h-[70vh] overflow-y-auto p-4"
      style={{
        backgroundColor: 'var(--background-elevated)',
        borderColor: 'var(--borders-strong)'
      }}
    >
      <DialogHeader className="pb-2">
        <DialogTitle 
          className="text-lg font-bold"
          style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}
        >
          🌳 FAMILY TREE (NKK)
        </DialogTitle>
      </DialogHeader>
      {selectedFamilyData && (
        <div className="space-y-3">
          {/* Family Tree Visualization */}
          <FamilyTreeViz members={selectedFamilyData.members} targetNik={targetNikForTree} />
          
          {/* Raw NKK Data Table */}
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: 'var(--foreground-primary)', fontFamily: 'Barlow Condensed, sans-serif' }}>
              RAW DATA NKK
            </p>
            <div 
              className="rounded border overflow-hidden"
              style={{
                backgroundColor: 'var(--background-tertiary)',
                borderColor: 'var(--borders-default)'
              }}
            >
              <table className="w-full text-xs">
                <thead 
                  className="border-b"
                  style={{ 
                    backgroundColor: 'var(--background-secondary)',
                    borderColor: 'var(--borders-default)'
                  }}
                >
                  <tr>
                    <th className="py-1.5 px-2 text-left uppercase" style={{ color: 'var(--foreground-secondary)' }}>
                      NIK
                    </th>
                    <th className="py-1.5 px-2 text-left uppercase" style={{ color: 'var(--foreground-secondary)' }}>
                      Nama
                    </th>
                    <th className="py-1.5 px-2 text-left uppercase" style={{ color: 'var(--foreground-secondary)' }}>
                      Relationship
                    </th>
                    <th className="py-1.5 px-2 text-left uppercase" style={{ color: 'var(--foreground-secondary)' }}>
                      Gender
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectedFamilyData.members.map((member, idx) => (
                    <tr 
                      key={idx}
                      className="border-b"
                      style={{ 
                        borderColor: 'var(--borders-subtle)',
                        backgroundColor: member.nik === targetNikForTree ? 'rgba(255, 59, 92, 0.1)' : 'transparent'
                      }}
                    >
                      <td className="py-1.5 px-2 font-mono" style={{ color: member.nik === targetNikForTree ? 'var(--status-error)' : 'var(--accent-primary)' }}>
                        {member.nik}
                      </td>
                      <td className="py-1.5 px-2" style={{ color: 'var(--foreground-primary)' }}>
                        {member.name || '-'}
                      </td>
                      <td className="py-1.5 px-2" style={{ color: 'var(--foreground-secondary)' }}>
                        {member.relationship || '-'}
                      </td>
                      <td className="py-1.5 px-2" style={{ color: 'var(--foreground-secondary)' }}>
                        {member.gender || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          <Button
            onClick={() => onOpenChange(false)}
            className="w-full py-2 text-sm"
            style={{
              backgroundColor: 'var(--accent-primary)',
              color: 'var(--background-primary)'
            }}
          >
            CLOSE
          </Button>
        </div>
      )}
    </DialogContent>
  </Dialog>
);

export default {
  NewCaseDialog,
  AddTargetDialog,
  DuplicatePhoneDialog,
  ScheduleDialog,
  ReghpInfoDialog,
  NikInfoDialog,
  FamilyTreeDialog
};
