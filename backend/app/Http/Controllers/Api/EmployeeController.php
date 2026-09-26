<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AccessService;
use App\Services\BusinessRuleException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/** Employees (HR) + their app logins — mirrors employee-access.functions.ts. */
class EmployeeController extends Controller
{
    public function __construct(private readonly AccessService $access) {}

    private const FIELDS = ['name', 'role', 'role_id', 'designation', 'showroom_id', 'email', 'phone', 'address',
        'national_id', 'joining_date', 'date_of_birth', 'gender', 'emergency_contact', 'emergency_phone', 'notes',
        'avatar_url', 'salary', 'attendance', 'is_active'];

    /** Login management is limited to owner / admin / superadmin, like today. */
    private function ensureAdmin(Request $request): void
    {
        $ok = DB::table('user_roles')->where('user_id', $request->user()->id)
            ->whereIn(DB::raw('lower(role)'), ['owner', 'admin', 'superadmin'])->exists()
            || $this->access->isGlobalAdmin($request->user());
        if (! $ok) {
            throw new BusinessRuleException('Only owner or admin can manage logins', true);
        }
    }

    private function scoped(Request $request)
    {
        $q = DB::table('employees');
        if (! $this->access->isGlobalAdmin($request->user())) {
            $ids = DB::table('user_role_assignments')->where('user_id', $request->user()->id)
                ->whereNotNull('showroom_id')->pluck('showroom_id');
            $q->whereIn('showroom_id', $ids);
        }

        return $q;
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'employees' => $this->scoped($request)->orderBy('name')->get(),
            'showrooms' => DB::table('showrooms')->where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'roles' => DB::table('app_roles')->where('is_active', true)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $row = $this->scoped($request)->where('id', $id)->first();

        return $row ? response()->json($row) : response()->json(['message' => 'Employee not found'], 404);
    }

    private function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'], 'role' => ['nullable', 'string', 'max:255'],
            'role_id' => ['nullable', 'uuid', 'exists:app_roles,id'], 'showroom_id' => ['nullable', 'uuid', 'exists:showrooms,id'],
            'designation' => ['nullable', 'string', 'max:255'], 'email' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:255'], 'address' => ['nullable', 'string'],
            'national_id' => ['nullable', 'string', 'max:255'], 'joining_date' => ['nullable', 'date'],
            'date_of_birth' => ['nullable', 'date'], 'gender' => ['nullable', 'string', 'max:16'],
            'emergency_contact' => ['nullable', 'string', 'max:255'], 'emergency_phone' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'], 'avatar_url' => ['nullable', 'string', 'max:1024'],
            'salary' => ['nullable', 'numeric', 'min:0'], 'attendance' => ['nullable', 'numeric', 'min:0'],
            'is_active' => ['nullable', 'boolean'],
        ];
    }

    public function store(Request $request): JsonResponse
    {
        $data = collect($request->validate($this->rules()))->only(self::FIELDS)->all();
        $id = (string) Str::uuid();
        DB::table('employees')->insert($data + ['id' => $id, 'created_at' => now(), 'updated_at' => now()]);

        return response()->json(['id' => $id], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        if (! $this->scoped($request)->where('id', $id)->exists()) {
            return response()->json(['message' => 'Employee not found'], 404);
        }
        $data = collect($request->validate($this->rules()))->only(self::FIELDS)->all();
        DB::table('employees')->where('id', $id)->update($data + ['updated_at' => now()]);

        return response()->json(['ok' => true]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->scoped($request)->where('id', $id)->delete();

        return response()->json(['ok' => true]);
    }

    private function assign(string $userId, string $roleId, ?string $showroomId): void
    {
        DB::table('user_role_assignments')->where('user_id', $userId)
            ->where(fn ($q) => $showroomId ? $q->where('showroom_id', $showroomId) : $q->whereNull('showroom_id'))->delete();
        DB::table('user_role_assignments')->insert([
            'id' => (string) Str::uuid(), 'user_id' => $userId, 'role_id' => $roleId, 'showroom_id' => $showroomId,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function createLogin(Request $request): JsonResponse
    {
        $this->ensureAdmin($request);
        $data = $request->validate([
            'email' => ['required', 'email'], 'password' => ['required', 'string', 'min:8'],
            'employeeId' => ['nullable', 'uuid'], 'roleId' => ['nullable', 'uuid', 'exists:app_roles,id'],
            'showroomId' => ['nullable', 'uuid', 'exists:showrooms,id'],
        ]);
        $email = strtolower(trim($data['email']));

        return DB::transaction(function () use ($data, $email) {
            $userId = DB::table('users')->whereRaw('lower(email) = ?', [$email])->value('id');
            if ($userId) {
                DB::table('users')->where('id', $userId)->update([
                    'password' => Hash::make($data['password']), 'is_active' => true, 'updated_at' => now()]);
            } else {
                $userId = (string) Str::uuid();
                DB::table('users')->insert([
                    'id' => $userId, 'email' => $email, 'password' => Hash::make($data['password']),
                    'is_active' => true, 'email_verified_at' => now(), 'created_at' => now(), 'updated_at' => now(),
                ]);
            }
            if (! empty($data['roleId'])) {
                $this->assign($userId, $data['roleId'], $data['showroomId'] ?? null);
            }
            if (! empty($data['employeeId'])) {
                DB::table('employees')->where('id', $data['employeeId'])->update(['user_id' => $userId, 'email' => $email, 'updated_at' => now()]);
            }

            return response()->json(['ok' => true, 'userId' => $userId]);
        });
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $this->ensureAdmin($request);
        $data = $request->validate(['userId' => ['required', 'uuid'], 'newPassword' => ['required', 'string', 'min:8']]);
        DB::table('users')->where('id', $data['userId'])->update(['password' => Hash::make($data['newPassword']), 'updated_at' => now()]);

        return response()->json(['ok' => true]);
    }

    public function updateAccess(Request $request): JsonResponse
    {
        $this->ensureAdmin($request);
        $data = $request->validate([
            'userId' => ['required', 'uuid'], 'roleId' => ['required', 'uuid', 'exists:app_roles,id'],
            'showroomId' => ['nullable', 'uuid', 'exists:showrooms,id'],
        ]);
        DB::transaction(fn () => $this->assign($data['userId'], $data['roleId'], $data['showroomId'] ?? null));

        return response()->json(['ok' => true]);
    }

    /** Disable the login, sign it out everywhere and drop its role assignments. */
    public function disableLogin(Request $request): JsonResponse
    {
        $this->ensureAdmin($request);
        $data = $request->validate(['userId' => ['required', 'uuid']]);
        DB::transaction(function () use ($data) {
            DB::table('users')->where('id', $data['userId'])->update(['is_active' => false, 'updated_at' => now()]);
            DB::table('personal_access_tokens')->where('tokenable_id', $data['userId'])->delete();
            DB::table('user_role_assignments')->where('user_id', $data['userId'])->delete();
        });

        return response()->json(['ok' => true]);
    }
}
