<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductionOverhead extends Model
{
    use HasUuids;

    protected $table = 'production_overheads';

    protected $keyType = 'string';

    public $incrementing = false;

    public const UPDATED_AT = null;

    protected $fillable = [
        'batch_id',
        'product_id',
        'category_id',
        'amount',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(ProductionOverheadCategory::class, 'category_id');
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(StockLedger::class, 'batch_id');
    }
}
