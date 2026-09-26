<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

abstract class Controller
{
    /** The location this request works on. null = factory (showroom_id IS NULL). */
    protected function location(Request $request): ?string
    {
        return $request->attributes->get('showroomId');
    }

    /** Same list user_can_access_location() allows, for building "all my locations" queries. */
    protected function paginationParams(Request $request): array
    {
        $limit = (int) $request->query('limit', 50);
        $limit = max(1, min($limit, 200));
        $offset = max(0, (int) $request->query('offset', 0));

        return [$limit, $offset];
    }
}
