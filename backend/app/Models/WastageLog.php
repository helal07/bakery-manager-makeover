<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WastageLog extends Model
{
    use HasUuids;

    protected $table = 'wastage_log';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'material_id',
        'product_id',
        'showroom_id',
        'qty',
        'reason',
        'notes',
        'ref_ledger_id',
        'logged_at',
    ];

    protected function casts(): array
    {
        return [
            'qty' => 'decimal:4',
            'logged_at' => 'datetime',
        ];
    }

    public function material(): BelongsTo
    {
        return $this->belongsTo(RawMaterial::class, 'material_id');
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
