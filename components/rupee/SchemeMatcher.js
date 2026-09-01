'use client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, FileText, CheckCircle2, Info, CalendarCheck } from 'lucide-react';
import { formatDate } from '@/lib/format';

// Renders scheme cards. Status is always "Potentially relevant" — never "Approved".
export function SchemeCard({ scheme, lang = 'en' }) {
  const s = scheme;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold leading-tight">{s.scheme_name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">For {s.target_user === 'student' ? 'students' : 'micro-entrepreneurs'} · {s.benefit_type}</p>
        </div>
        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 shrink-0">{s.eligibility_status || 'Potentially relevant'}</Badge>
      </div>

      <p className="text-sm mt-3">{s.purpose}</p>

      <div className="mt-3 space-y-1.5 text-sm">
        <div className="flex gap-2"><span className="text-muted-foreground w-24 shrink-0">Benefit</span><span className="font-medium">{s.amount_range}</span></div>
        <div className="flex gap-2"><span className="text-muted-foreground w-24 shrink-0">Eligibility</span><span>{s.eligibility_summary}</span></div>
        <div className="flex gap-2"><span className="text-muted-foreground w-24 shrink-0">Conditions</span><span>{s.key_conditions}</span></div>
        <div className="flex gap-2"><span className="text-muted-foreground w-24 shrink-0">Documents</span><span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" />{s.required_documents}</span></div>
      </div>

      {s.match_reason && (
        <div className="mt-3 flex items-start gap-1.5 text-xs rounded-lg bg-secondary/70 px-3 py-2 text-secondary-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {s.match_reason}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground flex items-center gap-1"><CalendarCheck className="h-3.5 w-3.5" /> Verified {formatDate(s.last_verified_date, lang)}</span>
        <a href={s.official_application_link} target="_blank" rel="noopener noreferrer">
          <Button size="sm" variant="outline">Official link <ExternalLink className="h-3.5 w-3.5 ml-1" /></Button>
        </a>
      </div>
    </Card>
  );
}

export function SchemeMatcher({ schemes = [], lang = 'en' }) {
  if (!schemes.length) {
    return <p className="text-sm text-muted-foreground">No matching support found for this section yet.</p>;
  }
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {schemes.map((s) => <SchemeCard key={s.id} scheme={s} lang={lang} />)}
    </div>
  );
}

export default SchemeMatcher;
