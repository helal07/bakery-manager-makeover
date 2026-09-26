<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Permission extends Model
{
    use HasUuids;

    protected $table = 'permissions';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'permission_key',
        'module',
        'label',
    ];

    protected function casts(): array
    {
        return [

        ];
    }
}
