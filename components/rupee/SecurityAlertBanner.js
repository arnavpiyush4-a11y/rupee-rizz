'use client';
import { ShieldAlert, Info, Lock } from 'lucide-react';

// Shows friendly, non-alarming security/privacy alerts (masking, verify-before-use, deletable).
const variants = {
  mask: { icon: ShieldAlert, cls: 'bg-amber-50 border-amber-200 text-amber-800' },
  verify: { icon: Info, cls: 'bg-sky-50 border-sky-200 text-sky-800' },
  info: { icon: Lock, cls: 'bg-secondary border-border text-secondary-foreground' },
};

export function SecurityAlertBanner({ variant = 'info', children, className = '' }) {
  const v = variants[variant] || variants.info;
  const Icon = v.icon;
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${v.cls} ${className}`} role="status">
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      {/* `min-w-0` lets this column shrink inside the flex row; without it a long
          word (an email address, a code) pushes the banner past the card edge on
          narrow screens instead of wrapping. */}
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">{children}</div>
    </div>
  );
}

export default SecurityAlertBanner;
