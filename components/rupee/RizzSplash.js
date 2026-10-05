'use client';

import { motion } from 'framer-motion';
import { Sparkles, Wallet } from 'lucide-react';
import { RizzAtmosphere } from './RizzAtmosphere';

export function RizzSplash({ label = 'Booting your money universe…' }) {
  return (
    <div className="rr-splash">
      <RizzAtmosphere />
      <motion.div className="rr-splash-card" animate={{ y: [0, -4, 0] }} transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}>
        <motion.div className="rr-splash-mark" animate={{ rotate: [0, 8, -8, 0], scale: [1, 1.06, 1] }} transition={{ duration: 2.7, repeat: Infinity, ease: 'easeInOut' }}>
          <Wallet size={34} strokeWidth={2.5} />
        </motion.div>
        <div className="rr-brandline">Rupee<span>Rizz</span></div>
        <div className="rr-splash-title">Your money, but alive.</div>
        <div className="rr-splash-label"><Sparkles size={14} /> {label}</div>
        <div className="rr-loading-bar"><motion.span initial={{ width: '8%' }} animate={{ width: '92%' }} transition={{ duration: 1.4, ease: 'easeInOut' }} /></div>
      </motion.div>
    </div>
  );
}

export default RizzSplash;
