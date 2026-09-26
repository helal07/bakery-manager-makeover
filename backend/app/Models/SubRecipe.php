<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SubRecipe extends Model
{
    use HasUuids;

    protected $table = 'sub_recipes';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'name',
        'yield_qty',
        'yield_unit',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'yield_qty' => 'decimal:4',
            'is_active' => 'boolean',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(SubRecipeItem::class, 'sub_recipe_id');
    }
}
