<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Recipe extends Model
{
    use HasUuids;

    protected $table = 'recipes';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'product_id',
        'material_id',
        'sub_recipe_id',
        'category_id',
        'qty',
    ];

    protected function casts(): array
    {
        return [
            'qty' => 'decimal:4',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function material(): BelongsTo
    {
        return $this->belongsTo(RawMaterial::class, 'material_id');
    }

    public function subRecipe(): BelongsTo
    {
        return $this->belongsTo(SubRecipe::class, 'sub_recipe_id');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(RecipeCategory::class, 'category_id');
    }
}
