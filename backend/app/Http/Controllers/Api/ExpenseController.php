<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Num;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Expenses + expense categories — same fields as expense-store.ts. */
class ExpenseController extends Controller
{
    public function categories(): JsonResponse
    {
        return response()->json(DB::table('expense_categories')->orderBy('name')->get(['id', 'name', 'is_active']));
    }

    public function storeCategory(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:120', 'unique:expense_categories,name']]);
        $id = (string) Str::uuid();
        DB::table('expense_categories')->insert([
            'id' => $id, 'name' => trim($data['name']), 'is_active' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return response()->json(['id' => $id, 'name' => trim($data['name']), 'is_active' => true], 201);
    }

    public function updateCategory(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120', 'unique:expense_categories,name,'.$id],
            'is_active' => ['sometimes', 'boolean'],
        ]);
        DB::table('expense_categories')->where('id', $id)->update($data + ['updated_at' => now()]);

        return response()->json(['ok' => true]);
    }

    public function destroyCategory(string $id): JsonResponse
    {
        DB::table('expense_categories')->where('id', $id)->delete();

        return response()->json(['ok' => true]);
    }

    private function scoped(Request $request)
    {
        $showroomId = $this->location($request);
        $q = DB::table('expenses');

        return $showroomId === null ? $q->whereNull('showroom_id') : $q->where('showroom_id', $showroomId);
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json($this->scoped($request)->orderByDesc('expense_date')->orderByDesc('created_at')
            ->limit(5000)->get(['id', 'expense_date', 'category', 'description', 'amount', 'showroom_id']));
    }

    private function rules(Request $request, bool $partial): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'date' => [$req, 'date'],
            'category' => [$req, 'string', 'max:120'],
            'desc' => [$req, 'string', 'max:500'],
            'amount' => [$req, 'numeric', 'gt:0'],
        ]);
    }

    private function row(array $d): array
    {
        $row = [];
        if (isset($d['date'])) $row['expense_date'] = $d['date'];
        if (isset($d['category'])) {
            $row['category'] = $d['category'];
            $row['category_id'] = DB::table('expense_categories')->where('name', $d['category'])->value('id');
        }
        if (isset($d['desc'])) $row['description'] = $d['desc'];
        if (isset($d['amount'])) $row['amount'] = Num::money($d['amount']);

        return $row;
    }

    public function store(Request $request): JsonResponse
    {
        $row = $this->row($this->rules($request, false)) + [
            'id' => (string) Str::uuid(),
            'showroom_id' => $this->location($request),
            'created_by' => $request->user()?->id,
            'created_at' => now(), 'updated_at' => now(),
        ];
        DB::table('expenses')->insert($row);

        return response()->json(DB::table('expenses')->where('id', $row['id'])->first(), 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $this->scoped($request)->where('id', $id)->update($this->row($this->rules($request, true)) + ['updated_at' => now()]);

        return response()->json(['ok' => true]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->scoped($request)->where('id', $id)->delete();

        return response()->json(['ok' => true]);
    }
}
