<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseReturnItem extends Model
{
    use HasUuids;

    protected $table = 'purchase_return_items';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'return_id',
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

    public function purchaseReturn(): BelongsTo
    {
        return $this->belongsTo(PurchaseReturn::class, 'return_id');
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
