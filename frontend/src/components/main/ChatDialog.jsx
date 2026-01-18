import React from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/**
 * Chat history dialog component
 * Shows Telegram chat messages for a target
 */
export const ChatDialog = ({ 
  open, 
  onOpenChange, 
  chatMessages = [], 
  selectedTarget = null,
  targets = []
}) => {
  const target = targets.find(t => t.id === selectedTarget);
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="z-[9999] max-w-md p-0 max-h-[80vh] flex flex-col"
        style={{
          backgroundColor: 'var(--background-elevated)',
          borderColor: 'var(--borders-default)'
        }}
      >
        {/* Chat Header */}
        <div 
          className="p-4 border-b shrink-0"
          style={{ borderColor: 'var(--borders-default)' }}
        >
          <DialogTitle>
            <h3 
              className="font-semibold text-sm"
              style={{ 
                color: 'var(--foreground-primary)',
                fontFamily: 'Barlow Condensed, sans-serif'
              }}
            >
              CHAT HISTORY
            </h3>
          </DialogTitle>
          <p 
            className="text-xs font-mono mt-1"
            style={{ color: 'var(--accent-primary)' }}
          >
            {target?.phone_number || 'Select target'}
          </p>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: '60vh' }}>
          {chatMessages.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
                Belum ada chat
              </p>
            </div>
          ) : (
            chatMessages.map((msg, idx) => (
              <ChatMessage key={idx} message={msg} />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Individual chat message component
const ChatMessage = ({ message }) => (
  <div
    className={`p-3 rounded-lg ${message.direction === 'sent' ? 'ml-8' : 'mr-8'}`}
    style={{
      backgroundColor: message.direction === 'sent' 
        ? 'rgba(0, 217, 255, 0.2)' 
        : 'var(--background-tertiary)',
      borderLeft: message.direction === 'sent' 
        ? '3px solid var(--accent-primary)' 
        : '3px solid var(--borders-default)'
    }}
  >
    <p className="text-sm" style={{ color: 'var(--foreground-primary)' }}>
      {message.message}
    </p>
    {message.has_buttons && message.buttons && (
      <div className="mt-2 flex flex-wrap gap-1">
        {message.buttons.flat().map((btn, i) => (
          <span 
            key={i}
            className="px-2 py-1 rounded text-xs"
            style={{
              backgroundColor: 'rgba(0, 217, 255, 0.1)',
              color: 'var(--accent-primary)',
              border: '1px solid var(--accent-primary)'
            }}
          >
            {btn}
          </span>
        ))}
      </div>
    )}
    <p 
      className="text-xs mt-1"
      style={{ color: 'var(--foreground-muted)' }}
    >
      {new Date(message.timestamp).toLocaleTimeString('id-ID')}
    </p>
  </div>
);

export default ChatDialog;
