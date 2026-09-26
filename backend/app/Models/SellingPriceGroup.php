<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SellingPriceGroup extends Model
{
    use HasUuids;

    protected $table = 'selling_price_groups';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'name',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function productPrices(): HasMany
    {
        return $this->hasMany(ProductSellingPrice::class, 'selling_price_group_id');
    }
}
