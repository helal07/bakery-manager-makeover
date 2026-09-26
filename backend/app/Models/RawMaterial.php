<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RawMaterial extends Model
{
    use HasUuids;

    protected $table = 'raw_materials';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'name',
        'unit',
        'cost',
        'min_stock',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'cost' => 'decimal:4',
            'min_stock' => 'decimal:4',
            'is_active' => 'boolean',
        ];
    }

    public function stock(): HasMany
    {
        return $this->hasMany(RawMaterialStock::class, 'material_id');
    }

    public function ledger(): HasMany
    {
        return $this->hasMany(RawStockLedger::class, 'material_id');
    }

    public function recipeLines(): HasMany
    {
        return $this->hasMany(Recipe::class, 'material_id');
    }

    public function subRecipeItems(): HasMany
    {
        return $this->hasMany(SubRecipeItem::class, 'material_id');
    }
}
