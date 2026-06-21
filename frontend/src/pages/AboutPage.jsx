import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Cpu, Globe, RotateCcw, Zap } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const FEATURES = [
  {
    Icon: Shield,
    title: 'Automated Recovery',
    color: '#059669',
    bg: 'rgba(5,150,105,0.1)',
    desc: 'Real-time monitoring of CPU and memory detects issues and initiates automated recoveries without manual intervention.',
  },
  {
    Icon: Globe,
    title: 'Connectivity Monitoring',
    color: '#6366f1',
    bg: 'rgba(99,102,241,0.1)',
    desc: 'Continuous network checks quickly identify and flag potential outages or upstream problems before users are impacted.',
  },
  {
    Icon: Cpu,
    title: 'Broadband Intelligence',
    color: '#2563eb',
    bg: 'rgba(37,99,235,0.1)',
    desc: 'Automated speed tests assess actual broadband performance regularly, highlighting underperformance and supporting SLA compliance.',
  },
  {
    Icon: RotateCcw,
    title: 'Event Diagnostics',
    color: '#d97706',
    bg: 'rgba(217,119,6,0.1)',
    desc: 'Every device reboot is logged with detailed reason codes, timestamps, and root cause categories for improved diagnostics.',
  },
];

function AboutPage() {
  const { T } = useTheme();
  const R = 16;

  return (
    <div style={{ padding: '28px 28px 40px', maxWidth: 860, margin: '0 auto', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          background: T.cardBg,
          border: `1px solid ${T.border}`,
          borderRadius: R,
          padding: '24px 24px 22px',
          marginBottom: 24,
          boxShadow: T.shadow,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 18,
        }}
      >
        <div style={{
          width: 50, height: 50, borderRadius: 13, flexShrink: 0,
          background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 20px rgba(99,102,241,0.3)',
        }}>
          <Zap size={22} color="#fff" />
        </div>
        <div>
          <h2 style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 700, color: T.textPrimary }}>
            About Self-Healing Gateway
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: T.textMuted, lineHeight: 1.65 }}>
            An intelligent self-healing system ensuring uninterrupted broadband connectivity through proactive monitoring and automated recovery actions.
          </p>
        </div>
      </motion.div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {FEATURES.map(({ Icon, title, color, bg, desc }, i) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.35 }}
            whileHover={{ y: -3 }}
            style={{
              background: T.cardBg,
              border: `1px solid ${T.border}`,
              borderRadius: R,
              padding: '22px 22px 20px',
              boxShadow: T.shadow,
              cursor: 'default',
              transition: 'transform 0.2s',
            }}
          >
            <div style={{
              width: 42, height: 42, borderRadius: 11,
              background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 14,
            }}>
              <Icon size={20} color={color} />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600, color: T.textPrimary }}>
              {title}
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: T.textMuted, lineHeight: 1.65 }}>
              {desc}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default AboutPage;
