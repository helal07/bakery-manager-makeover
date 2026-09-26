<?php

namespace App\Http\Middleware;

use App\Services\AccessService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Resolves the location the request works on and verifies access, the same way
 * user_can_access_location() did.
 *
 * The client sends `X-Location-Id`; the literal value `factory` (or an absent /
 * empty header) means the factory, i.e. showroom_id IS NULL.
 *
 * Controllers read it back with $request->attributes->get('showroomId').
 */
class ScopeLocation
{
    public function __construct(private readonly AccessService $access) {}

    public function handle(Request $request, Closure $next): Response
    {
        $raw = $request->header('X-Location-Id', $request->query('location'));
        $showroomId = ($raw === null || $raw === '' || $raw === 'factory' || $raw === 'null')
            ? null
            : (string) $raw;

        if (! $this->access->canAccessLocation($request->user(), $showroomId)) {
            return response()->json([
                'message' => 'Your account cannot access this location',
            ], 403);
        }

        $request->attributes->set('showroomId', $showroomId);

        return $next($request);
    }
}
