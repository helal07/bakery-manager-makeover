<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ProductionOverheadCategory extends Model
{
    use HasUuids;

    protected $table = 'production_overhead_categories';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'name',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }
}
