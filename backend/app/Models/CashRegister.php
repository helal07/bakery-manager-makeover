<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CashRegister extends Model
{
    use HasUuids;

    protected $table = 'cash_registers';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'showroom_id',
        'cashier_id',
        'opened_by',
        'closed_by',
        'opening_float',
        'closing_cash',
        'expected_cash',
        'difference',
        'status',
        'opened_at',
        'closed_at',
        'note_open',
        'note_close',
    ];

    protected function casts(): array
    {
        return [
            'opening_float' => 'decimal:2',
            'closing_cash' => 'decimal:2',
            'expected_cash' => 'decimal:2',
            'difference' => 'decimal:2',
            'opened_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }

    public function showroom(): BelongsTo
    {
        return $this->belongsTo(Showroom::class, 'showroom_id');
    }

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class, 'register_id');
    }
}
