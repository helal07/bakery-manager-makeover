<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens;
    use HasUuids;
    use Notifiable;

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'name',
        'email',
        'password',
        'is_active',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
        ];
    }

    public function profile(): HasOne
    {
        return $this->hasOne(UserProfile::class, 'user_id');
    }

    public function employee(): HasOne
    {
        return $this->hasOne(Employee::class, 'user_id');
    }

    /** Fixed role ladder: superadmin, owner, admin, manager, cashier, staff, employee. */
    public function roles(): HasMany
    {
        return $this->hasMany(UserRole::class, 'user_id');
    }

    /** Role + location assignments. showroom_id NULL means factory / global. */
    public function roleAssignments(): HasMany
    {
        return $this->hasMany(UserRoleAssignment::class, 'user_id');
    }

    public function hasRole(string $role): bool
    {
        return $this->roles()->where('role', $role)->exists();
    }

    /** Same rule as user_is_global_admin() — see App\Services\AccessService. */
    public function isGlobalAdmin(): bool
    {
        return app(\App\Services\AccessService::class)->isGlobalAdmin($this);
    }

    /** Same rule as user_can_access_location(). $showroomId null = factory. */
    public function canAccessLocation(?string $showroomId): bool
    {
        return app(\App\Services\AccessService::class)->canAccessLocation($this, $showroomId);
    }

    public function hasPermission(string $key): bool
    {
        return app(\App\Services\AccessService::class)->hasPermission($this, $key);
    }
}
