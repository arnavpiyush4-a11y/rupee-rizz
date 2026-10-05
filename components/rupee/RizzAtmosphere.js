'use client';

import { motion } from 'framer-motion';

export function RizzAtmosphere({ compact = false }) {
  return (
    <div className={`rr-atmosphere ${compact ? 'rr-atmosphere--compact' : ''}`} aria-hidden="true">
      <motion.div className="rr-orb rr-orb--mint" animate={{ x: [0, 18, -8, 0], y: [0, -10, 14, 0], rotate: [0, 5, -4, 0] }} transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="rr-orb rr-orb--amber" animate={{ x: [0, -14, 10, 0], y: [0, 12, -6, 0], scale: [1, 1.06, .96, 1] }} transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="rr-orb rr-orb--blue" animate={{ x: [0, 10, -12, 0], y: [0, 14, 8, 0] }} transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="rr-ring rr-ring--one" animate={{ rotate: 360 }} transition={{ duration: 30, repeat: Infinity, ease: 'linear' }} />
      <motion.div className="rr-ring rr-ring--two" animate={{ rotate: -360 }} transition={{ duration: 38, repeat: Infinity, ease: 'linear' }} />
      <div className="rr-noise" />
      <div className="rr-grid" />
    </div>
  );
}

export function FloatingSticker({ children, className = '', delay = 0 }) {
  return (
    <motion.div
      className={`rr-sticker ${className}`}
      initial={{ opacity: 0, y: 14, scale: 0.92 }}
      animate={{ opacity: 1, y: [0, -8, 0], scale: 1 }}
      transition={{ opacity: { duration: .5, delay }, y: { duration: 4.5, repeat: Infinity, delay, ease: 'easeInOut' } }}
    >
      {children}
    </motion.div>
  );
}

export default RizzAtmosphere;
