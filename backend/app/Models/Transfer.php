<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Transfer extends Model
{
    use HasUuids;

    protected $table = 'transfers';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'code',
        'source_showroom_id',
        'dest_showroom_id',
        'kind',
        'status',
        'note',
        'created_by',
        'sent_at',
        'received_at',
    ];

    protected function casts(): array
    {
        return [
            'sent_at' => 'datetime',
            'received_at' => 'datetime',
        ];
    }

    public function sourceShowroom(): BelongsTo
    {
        return $this->belongsTo(Showroom::class, 'source_showroom_id');
    }

    public function destShowroom(): BelongsTo
    {
        return $this->belongsTo(Showroom::class, 'dest_showroom_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(TransferItem::class, 'transfer_id');
    }
}
