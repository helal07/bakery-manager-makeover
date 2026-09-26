<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class LandingCarousel extends Model
{
    use HasUuids;

    protected $table = 'landing_carousels';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'title',
        'subtitle',
        'image_url',
        'link_url',
        'sort_order',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
            'is_active' => 'boolean',
        ];
    }
}
