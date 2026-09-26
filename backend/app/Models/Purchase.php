<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Purchase extends Model
{
    use HasUuids;

    protected $table = 'purchases';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'code',
        'supplier_id',
        'category_id',
        'showroom_id',
        'purchase_date',
        'subtotal',
        'discount',
        'tax',
        'total',
        'paid',
        'due',
        'status',
        'payment',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'purchase_date' => 'date',
            'subtotal' => 'decimal:2',
            'discount' => 'decimal:2',
            'tax' => 'decimal:2',
            'total' => 'decimal:2',
            'paid' => 'decimal:2',
            'due' => 'decimal:2',
        ];
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'supplier_id');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(PurchaseCategory::class, 'category_id');
    }

    public function showroom(): BelongsTo
    {
        return $this->belongsTo(Showroom::class, 'showroom_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(PurchaseItem::class, 'purchase_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(SupplierPayment::class, 'purchase_id');
    }

    public function returns(): HasMany
    {
        return $this->hasMany(PurchaseReturn::class, 'purchase_id');
    }
}
