<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DamagedLedger extends Model
{
    use HasUuids;

    protected $table = 'damaged_ledger';

    protected $keyType = 'string';

    public $incrementing = false;

    public const UPDATED_AT = null;

    protected $fillable = [
        'product_id',
        'showroom_id',
        'qty',
        'kind',
        'ref_type',
        'ref_id',
        'sale_amount',
        'customer_name',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'qty' => 'decimal:4',
            'sale_amount' => 'decimal:2',
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
}
