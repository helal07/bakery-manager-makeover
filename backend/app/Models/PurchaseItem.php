<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseItem extends Model
{
    use HasUuids;

    protected $table = 'purchase_items';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'purchase_id',
        'material_id',
        'product_id',
        'name',
        'unit',
        'qty',
        'price',
    ];

    protected function casts(): array
    {
        return [
            'qty' => 'decimal:4',
            'price' => 'decimal:4',
        ];
    }

    public function purchase(): BelongsTo
    {
        return $this->belongsTo(Purchase::class, 'purchase_id');
    }

    public function material(): BelongsTo
    {
        return $this->belongsTo(RawMaterial::class, 'material_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }
}
