<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Employee extends Model
{
    use HasUuids;

    protected $table = 'employees';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'name',
        'role',
        'role_id',
        'showroom_id',
        'user_id',
        'designation',
        'email',
        'phone',
        'address',
        'national_id',
        'salary',
        'attendance',
        'joining_date',
        'date_of_birth',
        'gender',
        'emergency_contact',
        'emergency_phone',
        'notes',
        'avatar_url',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'salary' => 'decimal:2',
            'attendance' => 'decimal:2',
            'joining_date' => 'date',
            'date_of_birth' => 'date',
            'is_active' => 'boolean',
        ];
    }

    public function appRole(): BelongsTo
    {
        return $this->belongsTo(AppRole::class, 'role_id');
    }

    public function showroom(): BelongsTo
    {
        return $this->belongsTo(Showroom::class, 'showroom_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
