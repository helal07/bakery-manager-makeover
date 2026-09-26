<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserRoleAssignment extends Model
{
    use HasUuids;

    protected $table = 'user_role_assignments';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'user_id',
        'role_id',
        'showroom_id',
    ];

    protected function casts(): array
    {
        return [

        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(AppRole::class, 'role_id');
    }

    public function showroom(): BelongsTo
    {
        return $this->belongsTo(Showroom::class, 'showroom_id');
    }
}
