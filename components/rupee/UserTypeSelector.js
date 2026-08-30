'use client';
import { GraduationCap, Store } from 'lucide-react';
import { useApp } from '@/app/providers';
import { t } from '@/lib/i18n';

// Choose Student vs Micro-entrepreneur.
export function UserTypeSelector({ value, onChange }) {
  const { lang } = useApp();
  const options = [
    { key: 'student', icon: GraduationCap, label: t(lang, 'student'), desc: 'Allowance, scholarships, fees & study goals.' },
    { key: 'micro_entrepreneur', icon: Store, label: t(lang, 'micro_ent'), desc: 'Business income, operating costs & growth goals.' },
  ];
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {options.map((o) => {
        const active = value === o.key;
        const Icon = o.icon;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={active}
            className={`text-left rounded-xl border-2 p-5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'border-primary bg-secondary shadow-sm' : 'border-border hover:border-primary/50 bg-card'}`}
          >
            <div className={`h-11 w-11 rounded-lg flex items-center justify-center mb-3 ${active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-primary'}`}>
              <Icon className="h-6 w-6" />
            </div>
            <div className="font-semibold">{o.label}</div>
            <div className="text-sm text-muted-foreground mt-1">{o.desc}</div>
          </button>
        );
      })}
    </div>
  );
}

export default UserTypeSelector;
