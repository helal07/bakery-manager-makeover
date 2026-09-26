<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RepurposeQueue extends Model
{
    use HasUuids;

    protected $table = 'repurpose_queue';

    protected $keyType = 'string';

    public $incrementing = false;

    public const UPDATED_AT = null;

    protected $fillable = [
        'product_id',
        'qty',
        'source_showroom_id',
        'transfer_id',
        'status',
        'converted_material_id',
        'yield_qty',
        'wastage_qty',
        'note',
        'processed_at',
    ];

    protected function casts(): array
    {
        return [
            'qty' => 'decimal:4',
            'yield_qty' => 'decimal:4',
            'wastage_qty' => 'decimal:4',
            'processed_at' => 'datetime',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function sourceShowroom(): BelongsTo
    {
        return $this->belongsTo(Showroom::class, 'source_showroom_id');
    }

    public function convertedMaterial(): BelongsTo
    {
        return $this->belongsTo(RawMaterial::class, 'converted_material_id');
    }

    public function transfer(): BelongsTo
    {
        return $this->belongsTo(Transfer::class, 'transfer_id');
    }
}
