<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class LandingContent extends Model
{
    use HasUuids;

    protected $table = 'landing_content';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'section',
        'content',
        'is_current',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'content' => 'array',
            'is_current' => 'boolean',
        ];
    }
}
