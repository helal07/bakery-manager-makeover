<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockLedger extends Model
{
    use HasUuids;

    protected $table = 'stock_ledger';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'product_id',
        'showroom_id',
        'qty',
        'kind',
        'ref_type',
        'ref_id',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'qty' => 'decimal:4',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function showroom(): BelongsTo
    {
        return $this->belongsTo(Showroom::class, 'showroom_id');
    }

    public function consumption(): HasMany
    {
        return $this->hasMany(RawStockLedger::class, 'ref_id');
    }

    public function overheads(): HasMany
    {
        return $this->hasMany(ProductionOverhead::class, 'batch_id');
    }
}
