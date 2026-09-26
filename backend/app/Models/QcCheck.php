<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QcCheck extends Model
{
    use HasUuids;

    protected $table = 'qc_checks';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'batch_id',
        'product_id',
        'showroom_id',
        'result',
        'notes',
        'checked_at',
    ];

    protected function casts(): array
    {
        return [
            'checked_at' => 'datetime',
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
