<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SaleReturnItem extends Model
{
    use HasUuids;

    protected $table = 'sale_return_items';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'return_id',
        'sale_item_id',
        'product_id',
        'product_name',
        'qty',
        'line_total',
        'condition',
    ];

    protected function casts(): array
    {
        return [
            'qty' => 'decimal:4',
            'line_total' => 'decimal:2',
        ];
    }

    public function saleReturn(): BelongsTo
    {
        return $this->belongsTo(SaleReturn::class, 'return_id');
    }

    public function saleItem(): BelongsTo
    {
        return $this->belongsTo(SaleItem::class, 'sale_item_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }
}
