import { useState, useEffect, useRef } from 'react';

// Countdown Timer Component - Real-time with seconds
export const CountdownTimer = ({ nextRun, onCountdownEnd, scheduleId }) => {
  const [timeLeft, setTimeLeft] = useState('');
  const hasTriggeredRef = useRef(false);
  
  useEffect(() => {
    // Reset trigger flag when nextRun changes
    hasTriggeredRef.current = false;
  }, [nextRun]);
  
  useEffect(() => {
    if (!nextRun) return;
    
    const calculateTimeLeft = () => {
      const now = new Date();
      const target = new Date(nextRun);
      const diff = target - now;
      
      if (diff <= 0) {
        setTimeLeft('0:00');
        // Trigger callback only once when countdown ends
        if (!hasTriggeredRef.current && onCountdownEnd) {
          hasTriggeredRef.current = true;
          onCountdownEnd(scheduleId);
        }
        return;
      }
      
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      // Always show seconds for real-time feel
      if (days > 0) {
        setTimeLeft(`${days}h ${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
      } else {
        setTimeLeft(`${minutes}:${String(seconds).padStart(2, '0')}`);
      }
    };
    
    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);
    
    return () => clearInterval(interval);
  }, [nextRun, onCountdownEnd, scheduleId]);
  
  if (!nextRun) return null;
  
  return (
    <span className="text-xs font-mono" style={{ color: 'var(--status-warning)' }}>
      ⏱ {timeLeft}
    </span>
  );
};
