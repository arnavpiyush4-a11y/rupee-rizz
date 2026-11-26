'use client';
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Trash2,
  Check,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  ScanSearch,
} from 'lucide-react';
import { SecurityAlertBanner } from './SecurityAlertBanner';

export const CATEGORIES = [
  'Food & Drinks',
  'Travel',
  'Shopping',
  'Education',
  'Bills',
  'Health',
  'Business Supplies',
  'Inventory',
  'Rent',
  'Marketing',
  'Other',
];

function confBadge(c) {
  if (c == null) return null;
  const low = c < 0.75;
  return (
    <Badge
      variant="secondary"
      className={low ? 'text-amber-700' : 'text-emerald-700'}
    >
      {Math.round(c * 100)}%
    </Badge>
  );
}

// Editable verification screen. Nothing here updates plans until the user confirms.
export function ReceiptVerificationForm({ initial, onConfirm, saving }) {
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState('');
  const [total, setTotal] = useState('');
  const [category, setCategory] = useState('Other');
  const [items, setItems] = useState([]);
  const [business, setBusiness] = useState({});
  const [inr, setInr] = useState(false);
  const [needs, setNeeds] = useState([]);

  useEffect(() => {
    if (!initial) return;
    setBusiness(initial.business || {});
    setInr(initial.currency === 'INR');
    setMerchant(initial.merchant || '');
    setDate(initial.date || '');
    setTotal(initial.total != null ? String(initial.total) : '');
    setItems(
      (initial.items || []).map((i) => ({
        ...i,
        item_name: i.name || i.item_name || '',
        price: i.price ?? '',
        category: i.category || 'Other',
        confidence: i.confidence,
      })),
    );
    setCategory(
      initial.category ||
        initial.items?.find((i) => i.category)?.category ||
        'Other',
    );
    setNeeds(initial.needs_user_verification || []);
  }, [initial]);

  const updateItem = (idx, key, val) =>
    setItems((arr) =>
      arr.map((it, i) => (i === idx ? { ...it, [key]: val } : it)),
    );
  const addItem = () =>
    setItems((arr) => [
      ...arr,
      { item_name: '', price: '', category: 'Other', confidence: null },
    ]);
  const removeItem = (idx) =>
    setItems((arr) => arr.filter((_, i) => i !== idx));

  const submit = () => {
    onConfirm({
      merchant,
      receipt_date: date || null,
      total: total === '' ? null : Number(total),
      currency: 'INR',
      category,
      overall_confidence: initial?.total_confidence ?? null,
      user_verified: true,
      items: items.map((it) => ({
        ...it,
        price: it.price === '' ? null : Number(it.price),
      })),
      ticket: initial.ticket,
      reviewed_business: business,
    });
  };

  return (
    <Card className="p-5 space-y-4">
      <section>
        <strong>Local document scan · {business.docType}</strong>
        <p>
          Mean OCR word confidence{' '}
          {Math.round(
            100 * (initial?.extraction_meta?.overall_confidence || 0),
          )}
          %. Compare the source before confirming.
        </p>
        {(initial?.extraction_meta?.warnings || []).map((w) => (
          <p key={w}>{w}</p>
        ))}
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            ['invoice', 'Invoice number'],
            ['gstin', 'GSTIN'],
            ['tax', 'Included GST (₹)'],
          ].map(([k, label]) => (
            <label key={k}>
              {label}
              <Input
                value={business[k] ?? ''}
                onChange={(e) =>
                  setBusiness({ ...business, [k]: e.target.value })
                }
              />
            </label>
          ))}
          <label>
            Payment evidence
            <select
              value={business.method || ''}
              onChange={(e) =>
                setBusiness({ ...business, method: e.target.value })
              }
            >
              <option value="">Unknown</option>
              {['cash', 'digital', 'udhaar'].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
        </div>
        <details>
          <summary>Review tax and credit details</summary>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              ['taxable', 'Taxable value'],
              ['discount', 'Discount'],
              ['outstanding', 'Documented outstanding'],
              ['repayment_reference', 'Repayment reference'],
              ['supplierState', 'Supplier state code'],
              ['placeOfSupply', 'Place of supply state code'],
            ].map(([k, label]) => (
              <label key={k}>
                {label}
                <Input
                  value={business[k] ?? ''}
                  onChange={(e) =>
                    setBusiness({ ...business, [k]: e.target.value })
                  }
                />
              </label>
            ))}
            {['cgst', 'sgst', 'igst'].flatMap((k) =>
              ['amount', 'rate'].map((f) => (
                <label key={k + f}>
                  {k.toUpperCase()} {f}
                  <Input
                    value={business.taxes?.[k]?.[f] ?? ''}
                    onChange={(e) =>
                      setBusiness({
                        ...business,
                        taxes: {
                          ...business.taxes,
                          [k]: { ...business.taxes?.[k], [f]: e.target.value },
                        },
                      })
                    }
                  />
                </label>
              )),
            )}
          </div>
        </details>
      </section>
      {needs.length > 0 && (
        <SecurityAlertBanner variant="verify">
          <span className="font-medium">
            Please verify these AI-read values before they update your savings
            plan:
          </span>{' '}
          {needs.join(', ')}
        </SecurityAlertBanner>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="m">Merchant</Label>
          <Input
            id="m"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="Shop / merchant"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d">
            Date{' '}
            {needs.includes('date') && (
              <AlertTriangle className="h-3 w-3 inline text-amber-500" />
            )}
          </Label>
          <Input
            id="d"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t">Total (₹)</Label>
          <Input
            id="t"
            type="number"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Overall category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Items</Label>
          <Button size="sm" variant="outline" onClick={addItem}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add item
          </Button>
        </div>
        <div className="space-y-2">
          {items.map((it, idx) => (
            <div
              key={idx}
              className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-lg border p-2"
            >
              <Input
                className="flex-1"
                value={it.item_name}
                onChange={(e) => updateItem(idx, 'item_name', e.target.value)}
                placeholder="Item name"
              />
              <Input
                aria-label="SKU"
                placeholder="SKU"
                value={it.sku ?? ''}
                onChange={(e) => updateItem(idx, 'sku', e.target.value)}
              />
              <Input
                aria-label="Unit"
                placeholder="Unit"
                value={it.unit ?? ''}
                onChange={(e) => updateItem(idx, 'unit', e.target.value)}
              />
              <Input
                aria-label="Quantity"
                type="number"
                placeholder="Qty"
                value={it.quantity ?? ''}
                onChange={(e) =>
                  updateItem(
                    idx,
                    'quantity',
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
              />
              <Input
                aria-label="Unit price"
                type="number"
                placeholder="Rate"
                value={it.unit_price ?? ''}
                onChange={(e) =>
                  updateItem(
                    idx,
                    'unit_price',
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
              />
              <Input
                className="w-24"
                type="number"
                value={it.price}
                onChange={(e) => updateItem(idx, 'price', e.target.value)}
                placeholder="₹"
              />
              <Select
                value={it.category}
                onValueChange={(v) => updateItem(idx, 'category', v)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {confBadge(it.confidence)}
              <Button
                size="icon"
                variant="ghost"
                className="text-rose-500"
                onClick={() => removeItem(idx)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No items — add one or just save the total.
            </p>
          )}
        </div>
      </div>

      <label>
        <input
          type="checkbox"
          checked={inr}
          onChange={(e) => setInr(e.target.checked)}
        />{' '}
        I checked that these amounts are in Indian rupees.
      </label>
      <div className="flex justify-end">
        <Button
          onClick={submit}
          disabled={
            saving || !inr || !merchant.trim() || !date || !(Number(total) > 0)
          }
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-1" /> Confirm and save
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}

export default ReceiptVerificationForm;
