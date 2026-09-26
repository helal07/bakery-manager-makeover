<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * One-to-one port of the database access functions:
 *   is_app_staff, is_bootstrap_superadmin, user_is_global_admin,
 *   user_is_factory_user, user_has_showroom_access, user_can_access_location,
 *   user_has_permission, assert_app_staff, assert_location_access, assert_permission.
 *
 * $actor === null means a trusted system call (the old service_role) and
 * every assert passes, exactly like before.
 */
class AccessService
{
    public function isAppStaff(?User $user): bool
    {
        if (! $user) {
            return false;
        }

        return DB::table('user_roles')->where('user_id', $user->id)->exists()
            || DB::table('user_role_assignments')->where('user_id', $user->id)->exists();
    }

    /** Fixed role superadmin/owner, or an assignment to a role named "superadmin". */
    public function isBootstrapSuperadmin(?User $user): bool
    {
        if (! $user) {
            return false;
        }

        return DB::table('user_roles')
            ->where('user_id', $user->id)
            ->whereIn(DB::raw('lower(role)'), ['superadmin', 'owner'])
            ->exists()
            || DB::table('user_role_assignments as a')
                ->join('app_roles as r', 'r.id', '=', 'a.role_id')
                ->where('a.user_id', $user->id)
                ->where(DB::raw('lower(r.name)'), 'superadmin')
                ->exists();
    }

    /** Bootstrap superadmin, or any assignment without a showroom. */
    public function isGlobalAdmin(?User $user): bool
    {
        if (! $user) {
            return false;
        }

        return $this->isBootstrapSuperadmin($user)
            || DB::table('user_role_assignments')
                ->where('user_id', $user->id)
                ->whereNull('showroom_id')
                ->exists();
    }

    /** Factory access (showroom_id NULL). Same three branches as sql/31. */
    public function isFactoryUser(?User $user): bool
    {
        if (! $user) {
            return false;
        }
        if ($this->isGlobalAdmin($user)) {
            return true;
        }

        $assignedToFactory = DB::table('user_role_assignments as a')
            ->join('showrooms as s', 's.id', '=', 'a.showroom_id')
            ->where('a.user_id', $user->id)
            ->where('s.is_factory', true)
            ->exists();
        if ($assignedToFactory) {
            return true;
        }

        $hasAny = DB::table('user_role_assignments')->where('user_id', $user->id)->exists();
        $hasShowroom = DB::table('user_role_assignments')
            ->where('user_id', $user->id)
            ->whereNotNull('showroom_id')
            ->exists();

        return $hasAny && ! $hasShowroom;
    }

    public function hasShowroomAccess(?User $user, ?string $showroomId): bool
    {
        if (! $user) {
            return false;
        }

        return $this->isGlobalAdmin($user)
            || ($showroomId !== null && DB::table('user_role_assignments')
                ->where('user_id', $user->id)
                ->where('showroom_id', $showroomId)
                ->exists());
    }

    /** $showroomId === null means the factory. */
    public function canAccessLocation(?User $user, ?string $showroomId): bool
    {
        if (! $user) {
            return false;
        }

        return $showroomId === null
            ? $this->isFactoryUser($user)
            : $this->hasShowroomAccess($user, $showroomId);
    }

    public function hasPermission(?User $user, string $key): bool
    {
        if (! $user) {
            return false;
        }

        return $this->isBootstrapSuperadmin($user)
            || DB::table('user_role_assignments as a')
                ->join('app_roles as r', function ($j) {
                    $j->on('r.id', '=', 'a.role_id')->where('r.is_active', true);
                })
                ->join('role_permissions as rp', 'rp.role_id', '=', 'r.id')
                ->where('a.user_id', $user->id)
                ->where('rp.permission_key', $key)
                ->exists();
    }

    // ---- asserts (null actor = trusted system call) ----------------------

    public function assertAppStaff(?User $actor, bool $system = false): void
    {
        if ($system) {
            return;
        }
        if (! $this->isAppStaff($actor)) {
            throw BusinessRuleException::forbidden('Not authorized');
        }
    }

    public function assertLocation(?User $actor, ?string $showroomId, bool $system = false): void
    {
        if ($system) {
            return;
        }
        if (! $this->canAccessLocation($actor, $showroomId)) {
            throw BusinessRuleException::forbidden('Not authorized for this location');
        }
    }

    public function assertPermission(?User $actor, string $key, bool $system = false): void
    {
        if ($system) {
            return;
        }
        if (! $this->hasPermission($actor, $key)) {
            throw BusinessRuleException::forbidden("Not authorized: {$key} permission required");
        }
    }
}
