<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CustomerGroup extends Model
{
    use HasUuids;

    protected $table = 'customer_groups';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'name',
        'discount_pct',
        'pricing_mode',
        'selling_price_group_id',
        'is_default',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'discount_pct' => 'decimal:4',
            'is_default' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function sellingPriceGroup(): BelongsTo
    {
        return $this->belongsTo(SellingPriceGroup::class, 'selling_price_group_id');
    }

    public function customers(): HasMany
    {
        return $this->hasMany(Customer::class, 'group_id');
    }
}
