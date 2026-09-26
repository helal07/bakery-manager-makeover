<?php

namespace App\Http\Middleware;

use App\Services\AccessService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Dynamic RBAC guard — port of user_has_permission() / assert_permission().
 *
 * Usage: ->middleware('perm:production.batches.create')
 * Several keys means "any of": ->middleware('perm:sales.view,sales.create')
 */
class CheckPermission
{
    public function __construct(private readonly AccessService $access) {}

    public function handle(Request $request, Closure $next, string ...$keys): Response
    {
        $user = $request->user();

        foreach ($keys as $key) {
            if ($this->access->hasPermission($user, $key)) {
                return $next($request);
            }
        }

        return response()->json([
            'message' => 'You do not have permission to do this',
            'required' => $keys,
        ], 403);
    }
}
