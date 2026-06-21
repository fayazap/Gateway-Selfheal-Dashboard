import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

export default function PropagateLoader({ size = 13, gap = 7, label }) {
  const { T } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <style>{`
        @keyframes pl-dot {
          0%, 100% { transform: scale(0.45); opacity: 0.2; }
          50% { transform: scale(1.25); opacity: 1; }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: `linear-gradient(180deg, ${T.accent}, ${T.accentSub})`,
            animation: `pl-dot 1.3s ease-in-out ${(i - 2) * 0.16}s infinite`,
            boxShadow: `0 0 6px ${T.accent}40`,
          }} />
        ))}
      </div>
      {label && (
        <span style={{ fontSize: 13, color: T.textMuted, letterSpacing: '0.02em', fontFamily: "'Inter', system-ui, sans-serif" }}>
          {label}
        </span>
      )}
    </div>
  );
}
