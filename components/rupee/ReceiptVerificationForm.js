'use client';
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Check, Loader2, AlertTriangle } from 'lucide-react';
import { SecurityAlertBanner } from './SecurityAlertBanner';

export const CATEGORIES = ['Food & Drinks', 'Travel', 'Shopping', 'Education', 'Bills', 'Health', 'Business Supplies', 'Inventory', 'Rent', 'Marketing', 'Other'];

function confBadge(c) {
  if (c == null) return null;
  const low = c < 0.75;
  return <Badge variant="secondary" className={low ? 'text-amber-700' : 'text-emerald-700'}>{Math.round(c * 100)}%</Badge>;
}

// Editable verification screen. Nothing here updates plans until the user confirms.
export function ReceiptVerificationForm({ initial, onConfirm, saving }) {
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState('');
  const [total, setTotal] = useState('');
  const [category, setCategory] = useState('Other');
  const [items, setItems] = useState([]);
  const [needs, setNeeds] = useState([]);

  useEffect(() => {
    if (!initial) return;
    setMerchant(initial.merchant || '');
    setDate(initial.date || '');
    setTotal(initial.total != null ? String(initial.total) : '');
    setItems((initial.items || []).map((i) => ({ item_name: i.name || i.item_name || '', price: i.price ?? '', category: i.category || 'Other', confidence: i.confidence })));
    setCategory(initial.items?.[0]?.category || 'Other');
    setNeeds(initial.needs_user_verification || []);
  }, [initial]);

  const updateItem = (idx, key, val) => setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, [key]: val } : it)));
  const addItem = () => setItems((arr) => [...arr, { item_name: '', price: '', category: 'Other', confidence: null }]);
  const removeItem = (idx) => setItems((arr) => arr.filter((_, i) => i !== idx));

  const submit = () => {
    onConfirm({
      merchant, receipt_date: date || null, total: total === '' ? null : Number(total), currency: 'INR', category,
      overall_confidence: initial?.total_confidence ?? null, user_verified: true,
      items: items.map((it) => ({ item_name: it.item_name, price: Number(it.price) || 0, category: it.category, confidence: it.confidence })),
    });
  };

  return (
    <Card className="p-5 space-y-4">
      {needs.length > 0 && (
        <SecurityAlertBanner variant="verify">
          <span className="font-medium">Please verify these AI-read values before they update your savings plan:</span> {needs.join(', ')}
        </SecurityAlertBanner>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="m">Merchant</Label>
          <Input id="m" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Shop / merchant" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d">Date {needs.includes('date') && <AlertTriangle className="h-3 w-3 inline text-amber-500" />}</Label>
          <Input id="d" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t">Total (₹)</Label>
          <Input id="t" type="number" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="0" />
        </div>
        <div className="space-y-1.5">
          <Label>Overall category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Items</Label>
          <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-3.5 w-3.5 mr-1" /> Add item</Button>
        </div>
        <div className="space-y-2">
          {items.map((it, idx) => (
            <div key={idx} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center rounded-lg border p-2">
              <Input className="flex-1" value={it.item_name} onChange={(e) => updateItem(idx, 'item_name', e.target.value)} placeholder="Item name" />
              <Input className="w-24" type="number" value={it.price} onChange={(e) => updateItem(idx, 'price', e.target.value)} placeholder="₹" />
              <Select value={it.category} onValueChange={(v) => updateItem(idx, 'category', v)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              {confBadge(it.confidence)}
              <Button size="icon" variant="ghost" className="text-rose-500" onClick={() => removeItem(idx)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          {items.length === 0 && <p className="text-sm text-muted-foreground">No items — add one or just save the total.</p>}
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={submit} disabled={saving}>{saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving…</> : <><Check className="h-4 w-4 mr-1" /> Confirm and save</>}</Button>
      </div>
    </Card>
  );
}

export default ReceiptVerificationForm;
