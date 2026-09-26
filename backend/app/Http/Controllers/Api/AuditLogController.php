<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\BusinessRuleException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Audit trail — readable by global admins (superadmins) only, like the current database. */
class AuditLogController extends Controller
{
    private function admin(Request $request): void
    {
        if (! $request->user()?->isGlobalAdmin()) {
            throw new BusinessRuleException('Only superadmins can view the activity log', true);
        }
    }

    public function index(Request $request): JsonResponse
    {
        $this->admin($request);
        [$limit, $offset] = $this->paginationParams($request);
        $q = DB::table('audit_log');
        if ($v = $request->query('from')) $q->where('occurred_at', '>=', $v.' 00:00:00');
        if ($v = $request->query('to')) $q->where('occurred_at', '<=', $v.' 23:59:59');
        if ($v = $request->query('actor')) $q->where('actor_email', $v);
        if ($v = $request->query('table')) $q->where('table_name', $v);
        if ($v = $request->query('action')) $q->where('action', $v);
        $total = (clone $q)->count();
        $rows = $q->orderByDesc('occurred_at')->limit($limit)->offset($offset)->get()->map(function ($r) {
            foreach (['changed_fields', 'old_data', 'new_data'] as $k) {
                $r->$k = $r->$k ? json_decode($r->$k, true) : null;
            }

            return $r;
        });

        return response()->json(['total' => $total, 'rows' => $rows]);
    }

    public function filters(Request $request): JsonResponse
    {
        $this->admin($request);

        return response()->json([
            'actors' => DB::table('audit_log')->whereNotNull('actor_email')->distinct()->orderBy('actor_email')->pluck('actor_email'),
            'tables' => DB::table('audit_log')->whereNotNull('table_name')->distinct()->orderBy('table_name')->pluck('table_name'),
        ]);
    }

    public function purge(Request $request): JsonResponse
    {
        $this->admin($request);
        $data = $request->validate(['before' => ['required', 'date']]);
        $n = DB::table('audit_log')->where('occurred_at', '<', $data['before'])->delete();

        return response()->json(['deleted' => $n]);
    }

    /** Sign-in / custom events written by the app itself. */
    public function event(Request $request): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', 'in:login,logout,rpc'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);
        $u = $request->user();
        DB::table('audit_log')->insert([
            'id' => (string) Str::uuid(), 'occurred_at' => now(),
            'actor_id' => $u?->id, 'actor_email' => $u?->email,
            'action' => $data['action'], 'note' => $data['note'] ?? null,
        ]);

        return response()->json(['ok' => true], 201);
    }
}
