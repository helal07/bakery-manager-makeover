<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Customer & supplier statements — a line-for-line port of src/lib/ledger-math.ts.
 *
 * The important rule: money is counted ONCE. An invoice's `paid` column and a
 * payment row linked to that invoice describe the same cash, so the payment
 * rows win and only the uncovered residual of `paid` is credited as an
 * "inline" payment (legacy invoices saved without a payment row).
 *
 * Amounts are returned as floats rounded to 2 places (same as round2 in TS),
 * so the JSON the React app receives is identical.
 */
class LedgerService
{
    public static function round2(mixed $n): float
    {
        return (float) Num::money(is_numeric($n) ? $n : 0);
    }

    public static function shortRef(string $id): string
    {
        return strtoupper(substr($id, 0, 8));
    }

    public static function invoiceStatus(float $total, float $credited): string
    {
        if ($credited <= 0) {
            return 'Due';
        }
        if (self::round2($credited) >= self::round2($total)) {
            return 'Paid';
        }

        return 'Partial';
    }

    /**
     * @param  'customer'|'supplier'  $kind
     * @param  array<int,array{id:string,code?:?string,date:string,total:mixed,paid:mixed,showroom_id?:?string}>  $invoices
     * @param  array<int,array{id:string,date:string,amount:mixed,method?:?string,reference?:?string,note?:?string,invoice_id?:?string,showroom_id?:?string}>  $payments
     * @param  array<int,array{id:string,code?:?string,date:string,amount:mixed,invoice_id?:?string,reason?:?string,showroom_id?:?string}>  $returns
     * @param  callable(?string):string|null  $locationName
     * @return array<int,array<string,mixed>>
     */
    public function buildLedger(string $kind, array $invoices, array $payments, array $returns = [], ?callable $locationName = null): array
    {
        $loc = $locationName ?? fn (?string $id) => $id ?: 'Factory';
        $invType = $kind === 'customer' ? 'Sell' : 'Purchase';

        $linked = [];
        foreach ($payments as $p) {
            if (empty($p['invoice_id'])) {
                continue;
            }
            $linked[$p['invoice_id']] = self::round2(($linked[$p['invoice_id']] ?? 0) + (float) ($p['amount'] ?? 0));
        }

        $raw = [];
        $seq = 0; // keeps JS Array.sort stability for equal dates
        foreach ($invoices as $inv) {
            $total = self::round2($inv['total'] ?? 0);
            $paid = self::round2($inv['paid'] ?? 0);
            $covered = $linked[$inv['id']] ?? 0.0;
            $residual = self::round2(max(0, $paid - $covered));
            $ref = ($inv['code'] ?? '') ?: self::shortRef($inv['id']);

            $raw[] = [$seq++, [
                'date' => $inv['date'], 'ref' => $ref, 'refId' => $inv['id'], 'type' => $invType,
                'location' => $loc($inv['showroom_id'] ?? null),
                'status' => self::invoiceStatus($total, max($paid, $covered)),
                'debit' => $total, 'credit' => 0.0, 'method' => '', 'others' => '',
            ]];

            if ($residual > 0) {
                $raw[] = [$seq++, [
                    'date' => $inv['date'], 'ref' => $ref, 'refId' => $inv['id'], 'type' => 'Payment',
                    'location' => $loc($inv['showroom_id'] ?? null), 'status' => '',
                    'debit' => 0.0, 'credit' => $residual, 'method' => '', 'others' => 'Paid with invoice',
                ]];
            }
        }

        foreach ($payments as $p) {
            $raw[] = [$seq++, [
                'date' => $p['date'], 'ref' => ($p['reference'] ?? '') ?: self::shortRef($p['id']),
                'refId' => $p['invoice_id'] ?? null, 'type' => 'Payment',
                'location' => $loc($p['showroom_id'] ?? null), 'status' => '',
                'debit' => 0.0, 'credit' => self::round2($p['amount'] ?? 0),
                'method' => $p['method'] ?? '', 'others' => $p['note'] ?? '',
            ]];
        }

        foreach ($returns as $r) {
            $raw[] = [$seq++, [
                'date' => $r['date'], 'ref' => ($r['code'] ?? '') ?: self::shortRef($r['id']),
                'refId' => $r['invoice_id'] ?? null, 'type' => 'Return',
                'location' => $loc($r['showroom_id'] ?? null), 'status' => '',
                'debit' => 0.0, 'credit' => self::round2($r['amount'] ?? 0),
                'method' => '', 'others' => $r['reason'] ?? '',
            ]];
        }

        usort($raw, fn ($a, $b) => strcmp((string) $a[1]['date'], (string) $b[1]['date']) ?: $a[0] <=> $b[0]);

        $bal = 0.0;
        $out = [];
        foreach ($raw as [, $e]) {
            $bal = self::round2($bal + $e['debit'] - $e['credit']);
            $e['balance'] = $bal;
            $out[] = $e;
        }

        return $out;
    }

    /** @return array{totalInvoice:float,totalPaid:float,balanceDue:float,advance:float,invoiceCount:int} */
    public function summarize(array $entries): array
    {
        $totalInvoice = 0.0;
        $totalPaid = 0.0;
        $count = 0;
        foreach ($entries as $e) {
            $totalInvoice = self::round2($totalInvoice + $e['debit']);
            $totalPaid = self::round2($totalPaid + $e['credit']);
            if ($e['type'] === 'Sell' || $e['type'] === 'Purchase') {
                $count++;
            }
        }
        $net = self::round2($totalInvoice - $totalPaid);

        return [
            'totalInvoice' => $totalInvoice,
            'totalPaid' => $totalPaid,
            'balanceDue' => max(0.0, $net),
            'advance' => $net < 0 ? -$net : 0.0,
            'invoiceCount' => $count,
        ];
    }

    public function filterByRange(array $entries, ?string $from = null, ?string $to = null): array
    {
        return array_values(array_filter($entries, function ($e) use ($from, $to) {
            $d = substr((string) $e['date'], 0, 10);

            return ! (($from && $d < $from) || ($to && $d > $to));
        }));
    }

    // -------------------------------------------------------------------
    // Loaders — read the same tables the React ledger page reads today
    // -------------------------------------------------------------------

    /**
     * Full customer statement. Like the React page, a sale/payment belongs to
     * the customer when customer_id matches OR the phone digits match
     * (walk-in sales saved with only a phone number). Returns follow sales.
     */
    public function customerStatement(string $customerId, ?callable $locationName = null): array
    {
        $phone = (string) DB::table('customers')->where('id', $customerId)->value('phone');
        $digits = preg_replace('/\D/', '', $phone);
        $mine = function ($q) use ($customerId, $digits) {
            $q->where('customer_id', $customerId);
            if ($digits !== '') {
                $q->orWhereRaw("REGEXP_REPLACE(COALESCE(customer_phone, ''), '[^0-9]', '') = ?", [$digits]);
            }
        };

        $invoices = DB::table('sales')->where($mine)->orderBy('created_at')
            ->get(['id', 'external_ref as code', 'created_at as date', 'total', 'paid', 'showroom_id'])
            ->map(fn ($r) => (array) $r)->all();
        $payments = DB::table('customer_payments')->where($mine)->orderBy('paid_on')
            ->get(['id', 'paid_on as date', 'amount', 'method', 'reference', 'note', 'sale_id as invoice_id', 'showroom_id'])
            ->map(fn ($r) => (array) $r)->all();
        $saleIds = array_column($invoices, 'id');
        $returns = $saleIds === [] ? [] : DB::table('sale_returns as r')
            ->joinSub(DB::table('sales')->where($mine)->select('id'), 's', 's.id', '=', 'r.sale_id')
            ->orderBy('r.created_at')
            ->get(['r.id', 'r.code', 'r.created_at as date', 'r.amount', 'r.sale_id as invoice_id', 'r.reason', 'r.showroom_id'])
            ->map(fn ($r) => (array) $r)->all();

        $entries = $this->buildLedger('customer', $invoices, $payments, $returns, $locationName);

        return ['entries' => $entries, 'summary' => $this->summarize($entries)];
    }

    public function supplierStatement(string $supplierId, ?callable $locationName = null): array
    {
        $invoices = DB::table('purchases')->where('supplier_id', $supplierId)->orderBy('purchase_date')
            ->get(['id', 'code', 'purchase_date as date', 'total', 'paid', 'showroom_id'])
            ->map(fn ($r) => (array) $r)->all();
        $payments = DB::table('supplier_payments')->where('supplier_id', $supplierId)->orderBy('paid_on')
            ->get(['id', 'paid_on as date', 'amount', 'method', 'reference', 'note', 'purchase_id as invoice_id', 'showroom_id'])
            ->map(fn ($r) => (array) $r)->all();
        $returns = DB::table('purchase_returns')->where('supplier_id', $supplierId)->orderBy('created_at')
            ->get(['id', 'code', 'created_at as date', 'amount', 'purchase_id as invoice_id', 'reason', 'showroom_id'])
            ->map(fn ($r) => (array) $r)->all();

        $entries = $this->buildLedger('supplier', $invoices, $payments, $returns, $locationName);

        return ['entries' => $entries, 'summary' => $this->summarize($entries)];
    }
}
