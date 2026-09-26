<?php

namespace App\Http\Middleware;

use App\Services\AccessService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Port of assert_app_staff(): only an active staff account may touch the API.
 */
class EnsureAppStaff
{
    public function __construct(private readonly AccessService $access) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $this->access->isAppStaff($user)) {
            return response()->json([
                'message' => 'Your account is not linked to any staff record',
            ], 403);
        }

        // Audit triggers read these to know who made the change.
        \Illuminate\Support\Facades\DB::statement('SET @app_user_id = ?, @app_user_email = ?', [$user->id, $user->email]);

        return $next($request);
    }
}
