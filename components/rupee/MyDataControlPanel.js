'use client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Trash2, Download, ShieldOff, Receipt, FileJson, FileSpreadsheet } from 'lucide-react';
import { formatINR, formatDate } from '@/lib/format';
import { EmptyState } from './common';

// Full data-control centre: view/delete receipts, export, withdraw consent, delete everything.
export function MyDataControlPanel({ receipts = [], consent, lang = 'en', onDeleteReceipt, onExportJson, onExportCsv, onWithdrawConsent, onDeleteAll, busy }) {
  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-3 gap-3">
        <Button variant="outline" onClick={onExportJson}><FileJson className="h-4 w-4 mr-2" /> Download JSON</Button>
        <Button variant="outline" onClick={onExportCsv}><FileSpreadsheet className="h-4 w-4 mr-2" /> Download CSV</Button>
        {consent?.active && <Button variant="outline" onClick={onWithdrawConsent}><ShieldOff className="h-4 w-4 mr-2" /> Withdraw consent</Button>}
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2"><Receipt className="h-4 w-4 text-primary" /> Your receipts</h3>
          <Badge variant="secondary">{receipts.length}</Badge>
        </div>
        {receipts.length === 0 ? (
          <EmptyState icon={Receipt} title="No receipts stored" hint="Receipts you scan and save will appear here, and you can delete each one anytime." />
        ) : (
          <div className="space-y-2">
            {receipts.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.merchant || 'Receipt'}</div>
                  <div className="text-xs text-muted-foreground">{r.receipt_date ? formatDate(r.receipt_date, lang) : 'No date'} · {r.category} · {formatINR(r.total)}</div>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" className="text-rose-500 shrink-0"><Trash2 className="h-4 w-4" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this receipt?</AlertDialogTitle>
                      <AlertDialogDescription>This removes the receipt and its private image permanently. This cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => onDeleteReceipt(r.id)}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5 border-rose-200">
        <h3 className="font-semibold text-rose-600">Delete all my data</h3>
        <p className="text-sm text-muted-foreground mt-1">Permanently removes your profile, receipts, goals and matches, and withdraws consent.</p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="mt-3 text-rose-600 border-rose-300" disabled={busy}><Trash2 className="h-4 w-4 mr-2" /> Delete all my data</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete everything?</AlertDialogTitle>
              <AlertDialogDescription>All your RupeeRizz data will be permanently deleted. This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={onDeleteAll}>Yes, delete all</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>
    </div>
  );
}

export default MyDataControlPanel;
