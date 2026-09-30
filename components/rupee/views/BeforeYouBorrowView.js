'use client';
import { useEffect, useState, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { api } from '@/lib/apiClient';
import { useApp } from '@/app/providers';
import { t } from '@/lib/i18n';
import { Loading } from '@/components/rupee/common';
import { BeforeYouBorrowComparison } from '@/components/rupee/BeforeYouBorrowComparison';

export function BeforeYouBorrowView({ embedded = false }) {
  const { lang } = useApp();
  const [goals, setGoals] = useState([]);
  const [goalId, setGoalId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const compute = useCallback(async (gid) => {
    setLoading(true);
    try { const d = await api('/before-you-borrow', { method: 'POST', body: { goalId: gid || undefined } }); setData(d); }
    catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    (async () => {
      try { const g = await api('/goals'); setGoals(g.goals || []); const first = g.goals?.[0]?.id || ''; setGoalId(first); await compute(first); }
      catch (e) { toast.error(e.message); setLoading(false); }
    })();
  }, [compute]);

  const onChange = (gid) => { setGoalId(gid); compute(gid); };

  return (
    <div className="space-y-4">
      {!embedded && <div><h1 className="text-2xl font-bold">{t(lang, 'before_you_borrow')}</h1><p className="text-muted-foreground text-sm">Safer options first — borrowing only if genuinely suitable.</p></div>}
      {goals.length > 0 && (
        <div className="max-w-xs">
          <Select value={goalId} onValueChange={onChange}>
            <SelectTrigger><SelectValue placeholder="Choose a goal" /></SelectTrigger>
            <SelectContent>{goals.map((g) => <SelectItem key={g.id} value={g.id}>{g.goal_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      {loading ? <Loading /> : <BeforeYouBorrowComparison data={data} lang={lang} />}
    </div>
  );
}

export default BeforeYouBorrowView;
