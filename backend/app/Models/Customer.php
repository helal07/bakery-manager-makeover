<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Customer extends Model
{
    use HasUuids;

    protected $table = 'customers';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'name',
        'phone',
        'email',
        'address',
        'loyalty_points',
        'avatar_url',
        'group_id',
        'selling_price_group_id',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'loyalty_points' => 'decimal:2',
            'is_active' => 'boolean',
        ];
    }

    public function group(): BelongsTo
    {
        return $this->belongsTo(CustomerGroup::class, 'group_id');
    }

    public function sellingPriceGroup(): BelongsTo
    {
        return $this->belongsTo(SellingPriceGroup::class, 'selling_price_group_id');
    }

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class, 'customer_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(CustomerPayment::class, 'customer_id');
    }
}
