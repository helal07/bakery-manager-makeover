<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Sale extends Model
{
    use HasUuids;

    protected $table = 'sales';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'external_ref',
        'showroom_id',
        'register_id',
        'cashier_id',
        'customer_id',
        'customer_name',
        'customer_phone',
        'subtotal',
        'discount',
        'tax',
        'shipping',
        'total',
        'paid',
        'due',
        'payment_mode',
    ];

    protected function casts(): array
    {
        return [
            'subtotal' => 'decimal:2',
            'discount' => 'decimal:2',
            'tax' => 'decimal:2',
            'shipping' => 'decimal:2',
            'total' => 'decimal:2',
            'paid' => 'decimal:2',
            'due' => 'decimal:2',
        ];
    }

    public function showroom(): BelongsTo
    {
        return $this->belongsTo(Showroom::class, 'showroom_id');
    }

    public function register(): BelongsTo
    {
        return $this->belongsTo(CashRegister::class, 'register_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(SaleItem::class, 'sale_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(SalePayment::class, 'sale_id');
    }

    public function returns(): HasMany
    {
        return $this->hasMany(SaleReturn::class, 'sale_id');
    }

    public function customerPayments(): HasMany
    {
        return $this->hasMany(CustomerPayment::class, 'sale_id');
    }
}
