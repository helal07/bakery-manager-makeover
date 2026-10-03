<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    use HasUuids;

    protected $table = 'products';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'sku',
        'name',
        'category',
        'category_id',
        'unit',
        'price',
        'cost',
        'transfer_price',
        'threshold',
        'shelf_life_days',
        'mfg_date',
        'expiry_date',
        'image_url',
        'barcode',
        'description',
        'is_active',
        'show_on_landing',
    ];

    protected function casts(): array
    {
        return [
            'price' => 'decimal:2',
            'cost' => 'decimal:2',
            'transfer_price' => 'decimal:2',
            'threshold' => 'decimal:4',
            'mfg_date' => 'date',
            'expiry_date' => 'date',
            'is_active' => 'boolean',
            'show_on_landing' => 'boolean',
        ];
    }

    public function categoryRelation(): BelongsTo
    {
        return $this->belongsTo(ProductCategory::class, 'category_id');
    }

    public function recipes(): HasMany
    {
        return $this->hasMany(Recipe::class, 'product_id');
    }

    public function sellingPrices(): HasMany
    {
        return $this->hasMany(ProductSellingPrice::class, 'product_id');
    }

    public function stock(): HasMany
    {
        return $this->hasMany(ProductStock::class, 'product_id');
    }

    public function ledger(): HasMany
    {
        return $this->hasMany(StockLedger::class, 'product_id');
    }

    public function saleItems(): HasMany
    {
        return $this->hasMany(SaleItem::class, 'product_id');
    }

    public function overheadDefaults(): HasMany
    {
        return $this->hasMany(RecipeOverhead::class, 'product_id');
    }
}
