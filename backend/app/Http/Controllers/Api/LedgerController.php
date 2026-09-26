<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\BusinessRuleException;
use App\Services\LedgerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Customer and supplier statements — the Laravel side of src/lib/ledger-math.ts.
 */
class LedgerController extends Controller
{
    public function __construct(private readonly LedgerService $ledger) {}

    public function customer(Request $request, string $id): JsonResponse
    {
        if (! DB::table('customers')->where('id', $id)->exists()) {
            throw new BusinessRuleException("Customer {$id} not found");
        }

        $result = $this->ledger->customerStatement($id, $this->locationNamer());

        return response()->json($this->ranged($request, $result, [
            'party' => DB::table('customers')->where('id', $id)->first(),
        ]));
    }

    public function supplier(Request $request, string $id): JsonResponse
    {
        if (! DB::table('suppliers')->where('id', $id)->exists()) {
            throw new BusinessRuleException("Supplier {$id} not found");
        }

        $result = $this->ledger->supplierStatement($id, $this->locationNamer());

        return response()->json($this->ranged($request, $result, [
            'party' => DB::table('suppliers')->where('id', $id)->first(),
        ]));
    }

    /** Outstanding balance list for receivables / payables screens. */
    public function outstanding(Request $request): JsonResponse
    {
        $kind = $request->query('kind', 'customer');

        if ($kind === 'supplier') {
            $rows = DB::table('purchases as p')
                ->join('suppliers as s', 's.id', '=', 'p.supplier_id')
                ->where('p.due', '>', 0)
                ->groupBy('s.id', 's.name', 's.phone')
                ->orderByDesc(DB::raw('SUM(p.due)'))
                ->get(['s.id', 's.name', 's.phone', DB::raw('SUM(p.due) as due'), DB::raw('COUNT(*) as invoices')]);
        } else {
            $rows = DB::table('sales as sa')
                ->join('customers as c', 'c.id', '=', 'sa.customer_id')
                ->where('sa.due', '>', 0)
                ->groupBy('c.id', 'c.name', 'c.phone')
                ->orderByDesc(DB::raw('SUM(sa.due)'))
                ->get(['c.id', 'c.name', 'c.phone', DB::raw('SUM(sa.due) as due'), DB::raw('COUNT(*) as invoices')]);
        }

        return response()->json([
            'kind' => $kind,
            'rows' => $rows,
            'totalDue' => round((float) $rows->sum('due'), 2),
        ]);
    }

    private function ranged(Request $request, array $result, array $extra): array
    {
        $from = $request->query('from');
        $to = $request->query('to');

        $entries = ($from || $to)
            ? $this->ledger->filterByRange($result['entries'], $from, $to)
            : $result['entries'];

        return $extra + [
            'entries' => $entries,
            // Summary always covers the whole history so the closing balance is real.
            'summary' => $result['summary'],
            'rangeSummary' => $this->ledger->summarize($entries),
        ];
    }

    private function locationNamer(): callable
    {
        $names = DB::table('showrooms')->pluck('name', 'id');

        return fn (?string $id) => $id === null ? 'Factory' : ($names[$id] ?? '—');
    }
}
