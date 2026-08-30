'use client';
import { useEffect, useState, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { api } from '@/lib/apiClient';
import { useApp } from '@/app/providers';
import { t } from '@/lib/i18n';
import { Loading } from '@/components/rupee/common';
import { SchemeMatcher } from '@/components/rupee/SchemeMatcher';
import { BeforeYouBorrowView } from '@/components/rupee/views/BeforeYouBorrowView';

const TABS = [
  { key: 'scholarship', label: 'Scholarships' },
  { key: 'education_support', label: 'Education support' },
  { key: 'business_support', label: 'Business support' },
  { key: 'subsidy', label: 'Subsidies' },
  { key: 'responsible_credit', label: 'Responsible credit' },
  { key: 'byb', label: 'Before You Borrow' },
];

export function OptionsView() {
  const { lang } = useApp();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api('/schemes/match'); setMatches(d.matches || []); }
    catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;
  const byCat = (c) => matches.filter((m) => m.category === c);
  const available = TABS.filter((tb) => tb.key === 'byb' || byCat(tb.key).length > 0);
  const defaultTab = available[0]?.key || 'byb';

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">{t(lang, 'options_title')}</h1><p className="text-muted-foreground text-sm">Support matched only from your consented profile. Status is always “potentially relevant” — verify officially.</p></div>
      <Tabs defaultValue={defaultTab}>
        <TabsList className="flex flex-wrap h-auto justify-start gap-1">
          {available.map((tb) => <TabsTrigger key={tb.key} value={tb.key}>{tb.label}</TabsTrigger>)}
        </TabsList>
        {available.filter((tb) => tb.key !== 'byb').map((tb) => (
          <TabsContent key={tb.key} value={tb.key} className="mt-4">
            <SchemeMatcher schemes={byCat(tb.key)} lang={lang} />
          </TabsContent>
        ))}
        <TabsContent value="byb" className="mt-4">
          <BeforeYouBorrowView embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default OptionsView;
