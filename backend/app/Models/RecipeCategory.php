<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class RecipeCategory extends Model
{
    use HasUuids;

    protected $table = 'recipe_categories';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'name',
        'color',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }
}
