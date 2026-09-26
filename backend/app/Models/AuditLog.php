<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AuditLog extends Model
{
    use HasUuids;

    protected $table = 'audit_log';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'occurred_at',
        'actor_id',
        'actor_email',
        'action',
        'table_name',
        'record_id',
        'showroom_id',
        'changed_fields',
        'old_data',
        'new_data',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'occurred_at' => 'datetime',
            'changed_fields' => 'array',
            'old_data' => 'array',
            'new_data' => 'array',
        ];
    }

    public function showroom(): BelongsTo
    {
        return $this->belongsTo(Showroom::class, 'showroom_id');
    }
}
