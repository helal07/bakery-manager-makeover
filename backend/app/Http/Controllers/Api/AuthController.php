<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppRole;
use App\Models\Showroom;
use App\Models\User;
use App\Services\AccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Replaces Supabase GoTrue: token login through Sanctum, plus the session
 * bootstrap the React app needs (profile, permissions, allowed locations).
 */
class AuthController extends Controller
{
    public function __construct(private readonly AccessService $access) {}

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'device' => ['nullable', 'string', 'max:60'],
        ]);

        $user = User::where('email', $data['email'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['Email or password is wrong'],
            ]);
        }

        if (property_exists($user, 'is_active') || isset($user->is_active)) {
            if ($user->is_active === false || $user->is_active === 0) {
                throw ValidationException::withMessages([
                    'email' => ['This account is disabled'],
                ]);
            }
        }

        if (! $this->access->isAppStaff($user)) {
            throw ValidationException::withMessages([
                'email' => ['Your account is not linked to any staff record'],
            ]);
        }

        $token = $user->createToken($data['device'] ?? 'web')->plainTextToken;

        return response()->json([
            'token' => $token,
            'session' => $this->sessionPayload($user),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['ok' => true]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json($this->sessionPayload($request->user()));
    }

    public function changePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $user = $request->user();

        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['Current password is wrong'],
            ]);
        }

        $user->password = Hash::make($data['password']);
        $user->save();

        return response()->json(['ok' => true]);
    }

    /** Everything the app loads once per session (replaces the rbac cache round-trips). */
    private function sessionPayload(User $user): array
    {
        $assignments = DB::table('user_role_assignments')
            ->leftJoin('app_roles', 'app_roles.id', '=', 'user_role_assignments.role_id')
            ->where('user_role_assignments.user_id', $user->id)
            ->get([
                'user_role_assignments.role_id',
                'user_role_assignments.showroom_id',
                'app_roles.name as role_name',
                'app_roles.is_active as role_active',
            ]);

        $roleIds = $assignments->pluck('role_id')->filter()->unique()->values();

        $permissions = DB::table('role_permissions')
            ->whereIn('role_id', $roleIds)
            ->whereIn('role_id', AppRole::where('is_active', true)->pluck('id'))
            ->pluck('permission_key')
            ->unique()
            ->sort()
            ->values();

        $isGlobalAdmin = $this->access->isGlobalAdmin($user);
        $isFactoryUser = $this->access->isFactoryUser($user);

        $showrooms = Showroom::where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'code', 'city', 'is_factory']);

        if (! $isGlobalAdmin) {
            $allowed = $assignments->pluck('showroom_id')->filter()->unique();
            $showrooms = $showrooms->whereIn('id', $allowed)->values();
        }

        return [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
            ],
            'profile' => $user->profile,
            'employee' => $user->employee,
            'roles' => $assignments->pluck('role_name')->filter()->unique()->values(),
            'permissions' => $permissions,
            'is_global_admin' => $isGlobalAdmin,
            'is_factory_user' => $isFactoryUser,
            // null entry = the factory, shown only to users who may work there.
            'locations' => $showrooms,
            'can_access_factory' => $this->access->canAccessLocation($user, null),
        ];
    }
}
