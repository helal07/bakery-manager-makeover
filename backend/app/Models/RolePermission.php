<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RolePermission extends Model
{
    use HasUuids;

    protected $table = 'role_permissions';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'role_id',
        'permission_key',
    ];

    protected function casts(): array
    {
        return [

        ];
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(AppRole::class, 'role_id');
    }
}
