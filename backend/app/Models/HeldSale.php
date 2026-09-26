<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HeldSale extends Model
{
    use HasUuids;

    protected $table = 'held_sales';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'showroom_id',
        'cashier_id',
        'customer_id',
        'customer_name',
        'customer_phone',
        'label',
        'snapshot',
        'items',
        'item_count',
        'subtotal',
        'discount',
        'tax',
        'total',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'snapshot' => 'array',
            'items' => 'array',
            'item_count' => 'integer',
            'subtotal' => 'decimal:2',
            'discount' => 'decimal:2',
            'tax' => 'decimal:2',
            'total' => 'decimal:2',
        ];
    }

    public function showroom(): BelongsTo
    {
        return $this->belongsTo(Showroom::class, 'showroom_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }
}
