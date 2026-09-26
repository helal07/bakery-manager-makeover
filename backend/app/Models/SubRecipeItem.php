<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SubRecipeItem extends Model
{
    use HasUuids;

    protected $table = 'sub_recipe_items';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'sub_recipe_id',
        'material_id',
        'qty',
    ];

    protected function casts(): array
    {
        return [
            'qty' => 'decimal:4',
        ];
    }

    public function subRecipe(): BelongsTo
    {
        return $this->belongsTo(SubRecipe::class, 'sub_recipe_id');
    }

    public function material(): BelongsTo
    {
        return $this->belongsTo(RawMaterial::class, 'material_id');
    }
}
