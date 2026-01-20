import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Shield, 
  LogOut, 
  Settings as SettingsIcon, 
  Plus, 
  FolderOpen,
  CheckCircle,
  XCircle,
  Activity,
  Search,
  Trash2,
  History,
  Printer
} from 'lucide-react';
import { CountdownTimer } from './CountdownTimer';

/**
 * Main sidebar component containing header, cases, and targets sections
 */
export const Sidebar = ({
  // Auth & Telegram
  username,
  telegramAuthorized,
  telegramUser,
  onLogout,
  
  // Cases
  cases,
  selectedCase,
  onSelectCase,
  onNewCase,
  onDeleteCase,
  onPrintCase,
  printingCase,
  
  // Targets
  targets,
  filteredTargets,
  searchQuery,
  onSearchChange,
  selectedTargetForChat,
  onTargetClick,
  onAddTarget,
  onDeleteTarget,
  onPerbaharui,
  visibleTargets,
  onToggleVisibility,
  
  // History
  activeHistoryTargets,
  onShowHistory,
  onHideHistory,
  
  // Scheduling
  activeSchedules,
  onOpenScheduleDialog,
  onCancelSchedule,
  onCountdownEnd,
  
  // Print
  onPrintTarget,
  printingTarget,
  
  // Processing state
  globalProcessing,
  globalProcessType,
  onResetProcessing
}) => {
  const navigate = useNavigate();

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'var(--status-success)';
      case 'not_found': return 'var(--status-warning)';
      case 'error': return 'var(--status-error)';
      default: return 'var(--status-processing)';
    }
  };

  const getTargetSchedule = (phoneNumber) => {
    return activeSchedules.find(s => s.phone_number === phoneNumber && s.active);
  };

  return (
    <aside 
      className="w-80 flex flex-col border-r"
      style={{ 
        backgroundColor: 'var(--background-secondary)',
        borderColor: 'var(--borders-default)'
      }}
    >
      {/* Header */}
      <SidebarHeader 
        telegramAuthorized={telegramAuthorized}
        telegramUser={telegramUser}
        onLogout={onLogout}
        onNavigateSettings={() => navigate('/settings')}
      />

      {/* Global Processing Indicator */}
      {globalProcessing && (
        <ProcessingIndicator processType={globalProcessType} onReset={onResetProcessing} />
      )}

      {/* Cases Section */}
      <CasesSection 
        cases={cases}
        selectedCase={selectedCase}
        onSelectCase={onSelectCase}
        onNewCase={onNewCase}
        onDeleteCase={onDeleteCase}
        onPrintCase={onPrintCase}
        printingCase={printingCase}
      />

      {/* Targets Section */}
      <TargetsSection 
        targets={targets}
        filteredTargets={filteredTargets}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        selectedCase={selectedCase}
        selectedTargetForChat={selectedTargetForChat}
        onTargetClick={onTargetClick}
        onAddTarget={onAddTarget}
        onDeleteTarget={onDeleteTarget}
        onPerbaharui={onPerbaharui}
        visibleTargets={visibleTargets}
        onToggleVisibility={onToggleVisibility}
        activeHistoryTargets={activeHistoryTargets}
        onShowHistory={onShowHistory}
        onHideHistory={onHideHistory}
        activeSchedules={activeSchedules}
        onOpenScheduleDialog={onOpenScheduleDialog}
        onCancelSchedule={onCancelSchedule}
        onCountdownEnd={onCountdownEnd}
        onPrintTarget={onPrintTarget}
        printingTarget={printingTarget}
        getStatusColor={getStatusColor}
        getTargetSchedule={getTargetSchedule}
      />
    </aside>
  );
};

// Header sub-component with real-time status indicator
const SidebarHeader = ({ telegramAuthorized, telegramUser, onLogout, onNavigateSettings }) => {
  // Import useTelegram for enhanced status info
  const { telegramConnected, lastChecked, status, refreshStatus, loading } = require('@/context/TelegramContext').useTelegram();
  
  const getStatusInfo = () => {
    switch (status) {
      case 'connected':
        return {
          color: 'var(--status-success)',
          bgColor: 'rgba(0, 255, 136, 0.1)',
          icon: '🟢',
          text: `@${telegramUser?.username || 'Connected'}`,
          subtext: 'Real-time active'
        };
      case 'authorized_disconnected':
        return {
          color: 'var(--status-warning)',
          bgColor: 'rgba(255, 184, 0, 0.1)',
          icon: '🟡',
          text: 'Session active, reconnecting...',
          subtext: 'Temporary disconnect'
        };
      default:
        return {
          color: 'var(--status-error)',
          bgColor: 'rgba(255, 59, 92, 0.1)',
          icon: '🔴',
          text: 'Telegram disconnected',
          subtext: 'Setup required'
        };
    }
  };
  
  const statusInfo = getStatusInfo();
  
  return (
    <div className="p-4 border-b" style={{ borderColor: 'var(--borders-default)' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' }}
          >
            <Shield className="w-6 h-6" style={{ color: 'var(--background-primary)' }} />
          </div>
          <div>
            <h1 
              className="text-xl font-bold"
              style={{ fontFamily: 'Barlow Condensed, sans-serif', color: 'var(--foreground-primary)' }}
            >
              WASKITA LBS
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={onNavigateSettings}
            data-testid="settings-button"
            title="Settings"
          >
            <SettingsIcon className="w-5 h-5" style={{ color: 'var(--foreground-secondary)' }} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onLogout}
            data-testid="logout-button"
            title="Logout"
          >
            <LogOut className="w-5 h-5" style={{ color: 'var(--status-error)' }} />
          </Button>
        </div>
      </div>

      {/* Enhanced Telegram Status with Real-time Indicator */}
      <div 
        className="p-3 rounded-lg border text-sm cursor-pointer hover:opacity-90 transition-opacity"
        style={{
          backgroundColor: statusInfo.bgColor,
          borderColor: statusInfo.color
        }}
        onClick={refreshStatus}
        title="Click to refresh status"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div 
              className={`w-2.5 h-2.5 rounded-full ${status === 'connected' ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: statusInfo.color }}
            />
            <div>
              <span className="font-medium" style={{ color: 'var(--foreground-primary)' }}>
                {statusInfo.text}
              </span>
              <p className="text-xs mt-0.5" style={{ color: 'var(--foreground-muted)' }}>
                {statusInfo.subtext}
              </p>
            </div>
          </div>
          {/* Real-time indicator */}
          <div className="flex flex-col items-end gap-1">
            {loading ? (
              <Activity className="w-4 h-4 animate-spin" style={{ color: statusInfo.color }} />
            ) : (
              <div className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                {lastChecked ? (
                  <span title={lastChecked.toLocaleTimeString('id-ID')}>
                    {new Date().getTime() - lastChecked.getTime() < 15000 ? '● LIVE' : '○ Checking...'}
                  </span>
                ) : ''}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Processing indicator sub-component
const ProcessingIndicator = ({ processType, onReset }) => (
  <div 
    className="p-2 rounded-lg border text-xs animate-pulse mx-4 mb-2"
    style={{
      backgroundColor: 'rgba(0, 217, 255, 0.1)',
      borderColor: 'var(--accent-primary)'
    }}
  >
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 animate-spin" style={{ color: 'var(--accent-primary)' }} />
        <span style={{ color: 'var(--foreground-primary)' }}>
          {processType === 'pendalaman' && 'Processing Pendalaman...'}
          {processType === 'nik' && 'Processing NIK Query...'}
          {processType === 'family' && 'Processing Family Query...'}
        </span>
      </div>
      {onReset && (
        <button
          onClick={onReset}
          className="text-xs px-2 py-1 rounded"
          style={{ 
            backgroundColor: 'var(--status-error)', 
            color: 'white' 
          }}
          title="Reset jika stuck"
        >
          Reset
        </button>
      )}
    </div>
  </div>
);

// Cases section sub-component
const CasesSection = ({ 
  cases, 
  selectedCase, 
  onSelectCase, 
  onNewCase, 
  onDeleteCase,
  onPrintCase,
  printingCase
}) => (
  <div className="p-4 border-b" style={{ borderColor: 'var(--borders-default)' }}>
    <div className="flex items-center justify-between mb-3">
      <h2 
        className="text-sm uppercase tracking-wide font-semibold"
        style={{ color: 'var(--foreground-secondary)', fontFamily: 'Rajdhani, sans-serif' }}
      >
        Cases
      </h2>
      <Button
        size="sm"
        onClick={onNewCase}
        data-testid="new-case-button"
        style={{
          backgroundColor: 'var(--accent-primary)',
          color: 'var(--background-primary)'
        }}
      >
        <Plus className="w-4 h-4" />
      </Button>
    </div>
    <div className="space-y-2">
      {cases.map((caseItem) => (
        <div
          key={caseItem.id}
          className="p-3 rounded-md border cursor-pointer transition-all flex items-center justify-between group"
          onClick={() => onSelectCase(caseItem)}
          style={{
            backgroundColor: selectedCase?.id === caseItem.id ? 'var(--background-tertiary)' : 'transparent',
            borderColor: selectedCase?.id === caseItem.id ? 'var(--accent-primary)' : 'var(--borders-subtle)',
            borderLeftWidth: '3px'
          }}
        >
          <div className="flex-1">
            <p className="font-semibold text-sm" style={{ color: 'var(--foreground-primary)' }}>
              {caseItem.name}
            </p>
            <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
              {caseItem.target_count || 0} targets
            </p>
          </div>
          <div className="flex items-center gap-1">
            {selectedCase?.id === caseItem.id && (
              <Button
                size="icon"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onPrintCase();
                }}
                disabled={printingCase}
                className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8"
                style={{ color: 'var(--accent-secondary)' }}
                title="Export Case ke PDF"
              >
                <Printer className={`w-4 h-4 ${printingCase ? 'animate-pulse' : ''}`} />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteCase(caseItem);
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8"
              style={{ color: 'var(--status-error)' }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ))}
      {cases.length === 0 && (
        <p className="text-xs text-center py-4" style={{ color: 'var(--foreground-muted)' }}>
          Belum ada case
        </p>
      )}
    </div>
  </div>
);

// Targets section sub-component
const TargetsSection = ({
  filteredTargets,
  searchQuery,
  onSearchChange,
  selectedCase,
  selectedTargetForChat,
  onTargetClick,
  onAddTarget,
  onDeleteTarget,
  onPerbaharui,
  visibleTargets,
  onToggleVisibility,
  activeHistoryTargets,
  onShowHistory,
  onHideHistory,
  onOpenScheduleDialog,
  onCancelSchedule,
  onCountdownEnd,
  onPrintTarget,
  printingTarget,
  getStatusColor,
  getTargetSchedule
}) => (
  <div className="flex-1 overflow-y-auto p-4">
    {/* Search Bar */}
    <div className="mb-3">
      <div className="relative">
        <Search 
          className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
          style={{ color: 'var(--foreground-muted)' }}
        />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search phone, nama, NIK..."
          className="pl-10 bg-background-tertiary border-borders-default text-xs"
          style={{ color: '#000000' }}
        />
      </div>
    </div>

    <div className="flex items-center justify-between mb-3">
      <h2 
        className="text-sm uppercase tracking-wide font-semibold"
        style={{ color: 'var(--foreground-secondary)', fontFamily: 'Rajdhani, sans-serif' }}
      >
        Targets {searchQuery && `(${filteredTargets.length})`}
      </h2>
      {selectedCase && (
        <Button
          size="sm"
          onClick={onAddTarget}
          data-testid="add-target-button"
          style={{
            backgroundColor: 'var(--accent-primary)',
            color: 'var(--background-primary)'
          }}
        >
          <Plus className="w-4 h-4" />
        </Button>
      )}
    </div>
    
    <div 
      className="space-y-2 overflow-y-auto pr-1"
      style={{ 
        maxHeight: '360px',
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--accent-primary) var(--background-tertiary)'
      }}
    >
      {filteredTargets.map((target) => (
        <TargetCard 
          key={target.id}
          target={target}
          isSelected={selectedTargetForChat === target.id}
          isVisible={visibleTargets.has(target.id)}
          isHistoryActive={activeHistoryTargets.includes(target.id)}
          schedule={getTargetSchedule(target.phone_number)}
          isPrinting={printingTarget === target.id}
          onTargetClick={onTargetClick}
          onDelete={onDeleteTarget}
          onPerbaharui={onPerbaharui}
          onToggleVisibility={onToggleVisibility}
          onShowHistory={onShowHistory}
          onHideHistory={onHideHistory}
          onOpenScheduleDialog={onOpenScheduleDialog}
          onCancelSchedule={onCancelSchedule}
          onCountdownEnd={onCountdownEnd}
          onPrint={onPrintTarget}
          getStatusColor={getStatusColor}
        />
      ))}
      
      {!selectedCase && (
        <p className="text-xs text-center py-4" style={{ color: 'var(--foreground-muted)' }}>
          Pilih case terlebih dahulu
        </p>
      )}
      {selectedCase && filteredTargets.length === 0 && searchQuery && (
        <p className="text-xs text-center py-4" style={{ color: 'var(--foreground-muted)' }}>
          Tidak ditemukan untuk &quot;{searchQuery}&quot;
        </p>
      )}
      {selectedCase && filteredTargets.length === 0 && !searchQuery && (
        <p className="text-xs text-center py-4" style={{ color: 'var(--foreground-muted)' }}>
          Belum ada target
        </p>
      )}
    </div>
  </div>
);

// Target card sub-component
const TargetCard = ({
  target,
  isSelected,
  isVisible,
  isHistoryActive,
  schedule,
  isPrinting,
  onTargetClick,
  onDelete,
  onPerbaharui,
  onToggleVisibility,
  onShowHistory,
  onHideHistory,
  onOpenScheduleDialog,
  onCancelSchedule,
  onCountdownEnd,
  onPrint,
  getStatusColor
}) => (
  <div
    className="rounded-md border group"
    style={{
      backgroundColor: isSelected ? 'var(--background-elevated)' : 'var(--background-tertiary)',
      borderColor: 'var(--borders-subtle)',
      borderLeftWidth: '3px',
      borderLeftColor: getStatusColor(target.status)
    }}
  >
    {/* Target Info - Clickable */}
    <div className="p-3">
      <div className="flex items-start gap-2">
        {/* Checkbox */}
        {target.status === 'completed' && target.data && (
          <input
            type="checkbox"
            checked={isVisible}
            onChange={(e) => {
              e.stopPropagation();
              onToggleVisibility(target.id);
            }}
            className="mt-1 w-4 h-4 cursor-pointer"
            style={{ accentColor: 'var(--accent-primary)' }}
          />
        )}
        
        {/* Target Info */}
        <div
          onClick={() => onTargetClick(target)}
          className="flex-1 cursor-pointer hover:opacity-80 transition-all"
        >
          <div className="flex items-center justify-between mb-1">
            <p className="font-mono text-xs" style={{ color: 'var(--accent-primary)' }}>
              {target.phone_number}
            </p>
            <div className="flex items-center gap-2">
              {target.status === 'completed' ? (
                <CheckCircle className="w-4 h-4" style={{ color: 'var(--status-success)' }} />
              ) : target.status === 'not_found' ? (
                <XCircle className="w-4 h-4" style={{ color: 'var(--status-warning)' }} />
              ) : target.status === 'error' ? (
                <XCircle className="w-4 h-4" style={{ color: 'var(--status-error)' }} />
              ) : (
                <Activity className="w-4 h-4 animate-pulse" style={{ color: 'var(--status-processing)' }} />
              )}
              
              {/* Print Button */}
              {target.status === 'completed' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPrint(target);
                  }}
                  disabled={isPrinting}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1"
                  style={{ color: 'var(--accent-secondary)' }}
                  title="Export PDF"
                >
                  <Printer className={`w-4 h-4 ${isPrinting ? 'animate-pulse' : ''}`} />
                </button>
              )}
              
              {/* History Button */}
              {target.status === 'completed' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isHistoryActive) {
                      onHideHistory(target.id);
                    } else {
                      onShowHistory(target);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1"
                  style={{ 
                    color: isHistoryActive ? 'var(--status-success)' : 'var(--accent-primary)' 
                  }}
                  title={isHistoryActive ? "Sembunyikan History" : "Riwayat Posisi"}
                >
                  <History className="w-4 h-4" />
                </button>
              )}
              
              {/* Delete Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(target);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1"
                style={{ color: 'var(--status-error)' }}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          {target.data && (
            <p className="text-xs line-clamp-1" style={{ color: 'var(--foreground-secondary)' }}>
              {target.data.address}
            </p>
          )}
          {target.status === 'not_found' && (
            <p className="text-xs" style={{ color: 'var(--status-warning)' }}>
              Target OFF / Tidak ditemukan
            </p>
          )}
          {target.status === 'error' && (
            <p className="text-xs" style={{ color: 'var(--status-error)' }}>
              Error: {target.error}
            </p>
          )}
          <p className="text-xs uppercase mt-1" style={{ color: 'var(--foreground-muted)' }}>
            {target.status}
          </p>
        </div>
      </div>
    </div>
    
    {/* Action Buttons - Only for completed targets */}
    {target.status === 'completed' && (
      <div className="px-3 pb-3 flex gap-2">
        <Button
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onPerbaharui(target);
          }}
          className="flex-1 text-xs"
          style={{
            backgroundColor: 'var(--status-info)',
            color: 'var(--background-primary)'
          }}
        >
          🔄 Perbaharui
        </Button>
        
        {schedule ? (
          <div className="flex-1 flex flex-col items-center">
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onCancelSchedule(schedule.id);
              }}
              className="w-full text-xs"
              style={{
                backgroundColor: 'var(--status-error)',
                color: 'white'
              }}
            >
              ❌ Batal Jadwal
            </Button>
            <CountdownTimer 
              nextRun={schedule.next_run}
              scheduleId={schedule.id}
              onCountdownEnd={onCountdownEnd}
            />
          </div>
        ) : (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onOpenScheduleDialog(target);
            }}
            className="flex-1 text-xs"
            style={{
              backgroundColor: 'var(--status-success)',
              color: 'var(--background-primary)'
            }}
          >
            📅 Jadwalkan
          </Button>
        )}
      </div>
    )}
  </div>
);

export default Sidebar;
