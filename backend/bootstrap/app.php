<?php

use App\Http\Middleware\CheckPermission;
use App\Http\Middleware\EnsureAppStaff;
use App\Http\Middleware\ScopeLocation;
use App\Services\BusinessRuleException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();

        $middleware->alias([
            'staff' => EnsureAppStaff::class,
            'location' => ScopeLocation::class,
            'perm' => CheckPermission::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Business rules keep the exact messages the database functions used.
        $exceptions->render(function (BusinessRuleException $e, Request $request) {
            return response()->json([
                'message' => $e->getMessage(),
            ], $e->forbidden ? 403 : 422);
        });

        $exceptions->render(function (ModelNotFoundException $e, Request $request) {
            return response()->json(['message' => 'Record not found'], 404);
        });

        $exceptions->render(function (AuthenticationException $e, Request $request) {
            return response()->json(['message' => 'Please sign in again'], 401);
        });
    })
    ->create();
