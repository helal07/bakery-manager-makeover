<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RawMaterialStock extends Model
{
    use HasUuids;

    protected $table = 'raw_material_stock';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'material_id',
        'showroom_id',
        'quantity',
        'min_stock',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:4',
            'min_stock' => 'decimal:4',
        ];
    }

    public function material(): BelongsTo
    {
        return $this->belongsTo(RawMaterial::class, 'material_id');
    }

    public function showroom(): BelongsTo
    {
        return $this->belongsTo(Showroom::class, 'showroom_id');
    }
}
