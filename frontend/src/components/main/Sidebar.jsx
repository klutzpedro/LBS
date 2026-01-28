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
  
  // Import useCpApi for CP API status
  const cpApiStatus = require('@/context/CpApiContext').useCpApi();
  const { connected: cpApiConnected, quotaRemaining, quotaInitial, loading: cpLoading, refreshStatus: refreshCpStatus } = cpApiStatus;
  
  const getStatusInfo = () => {
    switch (status) {
      case 'connected':
        return {
          color: 'var(--status-success)',
          bgColor: 'rgba(0, 255, 136, 0.1)',
          icon: '🟢',
          text: `@${telegramUser?.username || 'Connected'}`,
          subtext: 'NIK/NKK Active'
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
          subtext: 'Setup required for NIK/NKK'
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
              Netra
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

      {/* CP API Status (Position Query) */}
      <div 
        className="p-3 rounded-lg border text-sm mb-2"
        style={{
          backgroundColor: cpApiStatus.useTelegram 
            ? (telegramConnected ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 59, 92, 0.1)')
            : cpApiStatus.quotaExceeded 
              ? 'rgba(255, 184, 0, 0.1)' 
              : cpApiConnected 
                ? 'rgba(0, 255, 136, 0.1)' 
                : 'rgba(255, 59, 92, 0.1)',
          borderColor: cpApiStatus.useTelegram 
            ? (telegramConnected ? 'var(--status-success)' : 'var(--status-error)')
            : cpApiStatus.quotaExceeded 
              ? 'var(--status-warning)' 
              : cpApiConnected 
                ? 'var(--status-success)' 
                : 'var(--status-error)'
        }}
      >
        <div 
          className="flex items-center justify-between cursor-pointer hover:opacity-90 transition-opacity"
          onClick={refreshCpStatus}
          title="Click to refresh status"
        >
          <div className="flex items-center gap-2">
            <div 
              className={`w-2.5 h-2.5 rounded-full ${(cpApiStatus.useTelegram ? telegramConnected : (cpApiConnected && !cpApiStatus.quotaExceeded)) ? 'animate-pulse' : ''}`}
              style={{ 
                backgroundColor: cpApiStatus.useTelegram 
                  ? (telegramConnected ? 'var(--status-success)' : 'var(--status-error)')
                  : cpApiStatus.quotaExceeded 
                    ? 'var(--status-warning)' 
                    : cpApiConnected 
                      ? 'var(--status-success)' 
                      : 'var(--status-error)' 
              }}
            />
            <div>
              <span className="font-medium" style={{ color: 'var(--foreground-primary)' }}>
                {cpApiStatus.useTelegram 
                  ? `Telegram Bot ${telegramConnected ? 'Active' : 'Disconnected'}`
                  : cpApiStatus.quotaExceeded 
                    ? 'CP API (Quota Habis)' 
                    : `CP API ${cpApiConnected ? 'Connected' : 'Disconnected'}`
                }
              </span>
              <p className="text-xs mt-0.5" style={{ color: 'var(--foreground-muted)' }}>
                {cpApiStatus.useTelegram ? 'Query posisi via Bot' : 'Position Query Service'}
              </p>
            </div>
          </div>
          {/* Quota Counter - Only show when NOT using Telegram */}
          {!cpApiStatus.useTelegram && (
            <div className="flex flex-col items-end">
              <div 
                className="text-sm font-bold px-2 py-0.5 rounded"
                style={{ 
                  backgroundColor: cpApiStatus.quotaExceeded 
                    ? 'rgba(255, 59, 92, 0.2)'
                    : quotaRemaining > 50 
                      ? 'rgba(0, 255, 136, 0.2)' 
                      : quotaRemaining > 10 
                        ? 'rgba(255, 184, 0, 0.2)' 
                        : 'rgba(255, 59, 92, 0.2)',
                  color: cpApiStatus.quotaExceeded 
                    ? 'var(--status-error)'
                    : quotaRemaining > 50 
                      ? 'var(--status-success)' 
                      : quotaRemaining > 10 
                        ? 'var(--status-warning)' 
                        : 'var(--status-error)'
                }}
              >
                {cpLoading ? '...' : (cpApiStatus.quotaExceeded ? '0' : quotaRemaining)}
              </div>
              <span className="text-xs" style={{ color: 'var(--foreground-muted)' }}>Quota</span>
            </div>
          )}
        </div>
        
        {/* Toggle Button - Show when quota exceeded OR already using telegram */}
        {(cpApiStatus.quotaExceeded || cpApiStatus.useTelegram) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              cpApiStatus.toggleTelegram && cpApiStatus.toggleTelegram();
            }}
            className="w-full mt-2 px-3 py-1.5 rounded text-xs font-medium transition-colors"
            style={{
              backgroundColor: cpApiStatus.useTelegram ? 'rgba(59, 130, 246, 0.2)' : 'rgba(0, 255, 136, 0.2)',
              color: cpApiStatus.useTelegram ? '#3b82f6' : 'var(--status-success)',
              border: `1px solid ${cpApiStatus.useTelegram ? '#3b82f6' : 'var(--status-success)'}`
            }}
          >
            {cpApiStatus.useTelegram ? '↩ Kembali ke CP API' : '🤖 Gunakan Bot Telegram'}
          </button>
        )}
      </div>

      {/* Telegram Status (NIK/NKK Query) */}
      <div 
        className="p-3 rounded-lg border text-sm cursor-pointer hover:opacity-90 transition-opacity"
        style={{
          backgroundColor: statusInfo.bgColor,
          borderColor: statusInfo.color
        }}
        onClick={refreshStatus}
        title="Telegram Bot - Click to refresh"
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

// Cases section sub-component with slider for multiple cases
const CasesSection = ({ 
  cases, 
  selectedCase, 
  onSelectCase, 
  onNewCase, 
  onDeleteCase,
  onPrintCase,
  printingCase
}) => {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  
  // Find selected case index or use current index
  const selectedIndex = cases.findIndex(c => c.id === selectedCase?.id);
  const displayIndex = selectedIndex >= 0 ? selectedIndex : currentIndex;
  const currentCase = cases[displayIndex];
  
  const handlePrev = () => {
    const newIndex = displayIndex > 0 ? displayIndex - 1 : cases.length - 1;
    setCurrentIndex(newIndex);
    if (cases[newIndex]) onSelectCase(cases[newIndex]);
  };
  
  const handleNext = () => {
    const newIndex = displayIndex < cases.length - 1 ? displayIndex + 1 : 0;
    setCurrentIndex(newIndex);
    if (cases[newIndex]) onSelectCase(cases[newIndex]);
  };

  return (
    <div className="p-4 border-b" style={{ borderColor: 'var(--borders-default)' }}>
      <div className="flex items-center justify-between mb-3">
        <h2 
          className="text-sm uppercase tracking-wide font-semibold"
          style={{ color: 'var(--foreground-secondary)', fontFamily: 'Rajdhani, sans-serif' }}
        >
          Cases {cases.length > 1 && `(${displayIndex + 1}/${cases.length})`}
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
      
      {cases.length === 0 ? (
        <p className="text-xs text-center py-4" style={{ color: 'var(--foreground-muted)' }}>
          Belum ada case
        </p>
      ) : (
        <div className="relative">
          {/* Navigation arrows for multiple cases */}
          {cases.length > 1 && (
            <div className="flex items-center justify-between mb-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={handlePrev}
                className="h-6 w-6 p-0"
                style={{ color: 'var(--foreground-secondary)' }}
              >
                ◀
              </Button>
              <div className="flex gap-1">
                {cases.map((_, idx) => (
                  <div
                    key={idx}
                    className="w-2 h-2 rounded-full cursor-pointer transition-all"
                    onClick={() => {
                      setCurrentIndex(idx);
                      onSelectCase(cases[idx]);
                    }}
                    style={{
                      backgroundColor: idx === displayIndex ? 'var(--accent-primary)' : 'var(--borders-default)'
                    }}
                  />
                ))}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleNext}
                className="h-6 w-6 p-0"
                style={{ color: 'var(--foreground-secondary)' }}
              >
                ▶
              </Button>
            </div>
          )}
          
          {/* Single case display */}
          {currentCase && (
            <div
              className="p-3 rounded-md border cursor-pointer transition-all flex items-center justify-between group"
              onClick={() => onSelectCase(currentCase)}
              style={{
                backgroundColor: selectedCase?.id === currentCase.id ? 'var(--background-tertiary)' : 'transparent',
                borderColor: selectedCase?.id === currentCase.id ? 'var(--accent-primary)' : 'var(--borders-subtle)',
                borderLeftWidth: '3px'
              }}
            >
              <div className="flex-1">
                <p className="font-semibold text-sm" style={{ color: 'var(--foreground-primary)' }}>
                  {currentCase.name}
                </p>
                <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                  {currentCase.target_count || 0} targets
                </p>
              </div>
              <div className="flex items-center gap-1">
                {selectedCase?.id === currentCase.id && (
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
                    onDeleteCase(currentCase);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8"
                  style={{ color: 'var(--status-error)' }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

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
    
    {/* Action Buttons - For completed, not_found, and error targets */}
    {(target.status === 'completed' || target.status === 'not_found' || target.status === 'error') && (
      <div className="px-3 pb-3 flex gap-2">
        <Button
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onPerbaharui(target);
          }}
          className="flex-1 text-xs"
          style={{
            backgroundColor: target.status === 'completed' ? 'var(--status-info)' : 'var(--status-warning)',
            color: 'var(--background-primary)'
          }}
          title={target.status === 'not_found' ? 'Coba query ulang - mungkin target sudah ON' : 'Perbaharui lokasi'}
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
            title={target.status === 'not_found' ? 'Jadwalkan query otomatis - akan mencoba saat target ON' : 'Jadwalkan pembaruan lokasi otomatis'}
          >
            📅 Jadwalkan
          </Button>
        )}
      </div>
    )}
  </div>
);

export default Sidebar;
