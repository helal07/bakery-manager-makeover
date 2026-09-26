<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Showroom extends Model
{
    use HasUuids;

    protected $table = 'showrooms';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'name',
        'code',
        'city',
        'address',
        'phone',
        'manager_name',
        'is_factory',
        'is_active',
        'settings',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'is_factory' => 'boolean',
            'is_active' => 'boolean',
            'settings' => 'array',
        ];
    }

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class, 'showroom_id');
    }

    public function purchases(): HasMany
    {
        return $this->hasMany(Purchase::class, 'showroom_id');
    }

    public function expenses(): HasMany
    {
        return $this->hasMany(Expense::class, 'showroom_id');
    }

    public function employees(): HasMany
    {
        return $this->hasMany(Employee::class, 'showroom_id');
    }

    public function productStock(): HasMany
    {
        return $this->hasMany(ProductStock::class, 'showroom_id');
    }

    public function rawMaterialStock(): HasMany
    {
        return $this->hasMany(RawMaterialStock::class, 'showroom_id');
    }

    public function outgoingTransfers(): HasMany
    {
        return $this->hasMany(Transfer::class, 'source_showroom_id');
    }

    public function incomingTransfers(): HasMany
    {
        return $this->hasMany(Transfer::class, 'dest_showroom_id');
    }

    public function roleAssignments(): HasMany
    {
        return $this->hasMany(UserRoleAssignment::class, 'showroom_id');
    }
}
