<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CashRegister;
use App\Models\HeldSale;
use App\Services\BusinessRuleException;
use App\Services\Num;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * POS cash registers and held (parked) sales — same rules as pos-v7-store.ts:
 * one open register per cashier + location, expected cash = float + cash payments.
 */
class PosController extends Controller
{
    private const REG_COLS = ['id', 'status', 'opening_float', 'opened_at', 'showroom_id'];

    private function scoped($q, ?string $showroomId)
    {
        return $showroomId === null ? $q->whereNull('showroom_id') : $q->where('showroom_id', $showroomId);
    }

    public function openRegister(Request $request): JsonResponse
    {
        $showroomId = $this->location($request);
        $reg = $this->scoped(CashRegister::query(), $showroomId)
            ->where('cashier_id', $request->user()->id)
            ->where('status', 'open')
            ->orderByDesc('opened_at')
            ->first(self::REG_COLS);

        return response()->json($reg);
    }

    public function storeRegister(Request $request): JsonResponse
    {
        $data = $request->validate([
            'opening_float' => ['required', 'numeric', 'min:0'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);
        $uid = $request->user()->id;
        $reg = CashRegister::create([
            'showroom_id' => $this->location($request),
            'cashier_id' => $uid,
            'opened_by' => $uid,
            'opening_float' => Num::money((string) $data['opening_float']),
            'note_open' => $data['note'] ?? null,
            'status' => 'open',
            'opened_at' => now(),
        ]);

        return response()->json($reg->only(self::REG_COLS), 201);
    }

    private function summary(CashRegister $reg): array
    {
        $sales = DB::table('sales')->where('register_id', $reg->id);
        $total = (string) ($sales->clone()->sum('total') ?? '0');
        $count = (int) $sales->clone()->count();
        $by = DB::table('sale_payments as p')
            ->join('sales as s', 's.id', '=', 'p.sale_id')
            ->where('s.register_id', $reg->id)
            ->groupBy('p.method')
            ->select('p.method', DB::raw('SUM(p.amount) as amt'))
            ->pluck('amt', 'method');

        $known = ['cash', 'card', 'mobile', 'bank', 'cheque'];
        $other = '0';
        foreach ($by as $method => $amt) {
            if (! in_array($method, $known, true)) {
                $other = Num::add($other, (string) $amt);
            }
        }
        $cash = Num::money((string) ($by['cash'] ?? '0'));

        return [
            'cashSales' => (float) $cash,
            'cardSales' => (float) ($by['card'] ?? 0),
            'mobileSales' => (float) ($by['mobile'] ?? 0),
            'bankSales' => (float) ($by['bank'] ?? 0),
            'chequeSales' => (float) ($by['cheque'] ?? 0),
            'otherSales' => (float) $other,
            'totalSales' => (float) $total,
            'saleCount' => $count,
            'expectedCash' => (float) Num::money(Num::add((string) $reg->opening_float, $cash)),
        ];
    }

    private function ownRegister(Request $request, string $id): CashRegister
    {
        $reg = CashRegister::findOrFail($id);
        if ($reg->showroom_id !== $this->location($request)) {
            throw new BusinessRuleException('Register belongs to another location', true);
        }

        return $reg;
    }

    public function registerSummary(Request $request, string $id): JsonResponse
    {
        return response()->json($this->summary($this->ownRegister($request, $id)));
    }

    public function closeRegister(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'counted_cash' => ['required', 'numeric'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);
        $reg = $this->ownRegister($request, $id);
        if ($reg->status !== 'open') {
            throw new BusinessRuleException('Register is already closed');
        }
        $s = $this->summary($reg);
        $counted = Num::money((string) $data['counted_cash']);
        $expected = Num::money((string) $s['expectedCash']);
        $reg->update([
            'status' => 'closed',
            'closing_cash' => $counted,
            'expected_cash' => $expected,
            'difference' => Num::money(Num::sub($counted, $expected)),
            'note_close' => $data['note'] ?? null,
            'closed_at' => now(),
            'closed_by' => $request->user()->id,
        ]);

        return response()->json(['ok' => true, 'summary' => $s]);
    }

    public function heldIndex(Request $request): JsonResponse
    {
        $rows = $this->scoped(HeldSale::query(), $this->location($request))
            ->orderByDesc('created_at')
            ->limit(50)
            ->get(['id', 'label', 'item_count', 'total', 'created_at', 'snapshot']);

        return response()->json($rows);
    }

    public function heldStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['nullable', 'uuid'],
            'label' => ['nullable', 'string', 'max:120'],
            'snapshot' => ['required', 'array'],
            'item_count' => ['required', 'integer', 'min:0'],
            'total' => ['required', 'numeric'],
        ]);
        $row = HeldSale::create([
            'showroom_id' => $this->location($request),
            'cashier_id' => $request->user()->id,
            'customer_id' => $data['customer_id'] ?? null,
            'label' => $data['label'] ?? null,
            'snapshot' => $data['snapshot'],
            'item_count' => $data['item_count'],
            'total' => Num::money((string) $data['total']),
        ]);

        return response()->json(['id' => $row->id], 201);
    }

    public function heldDestroy(Request $request, string $id): JsonResponse
    {
        $this->scoped(HeldSale::query(), $this->location($request))->where('id', $id)->delete();

        return response()->json(['ok' => true]);
    }
}
