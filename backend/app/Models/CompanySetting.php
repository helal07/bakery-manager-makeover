<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class CompanySetting extends Model
{
    use HasUuids;

    protected $table = 'company_settings';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'name',
        'tagline',
        'logo_url',
        'address',
        'phone',
        'email',
        'vat_reg',
        'footer_note',
        'currency',
        'settings',
        'is_current',
    ];

    protected function casts(): array
    {
        return [
            'settings' => 'array',
            'is_current' => 'boolean',
        ];
    }
}
