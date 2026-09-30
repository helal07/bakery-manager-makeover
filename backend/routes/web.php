<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json([
        'status' => 'online',
        'service' => 'Bakery Manager Laravel 12 Backend API',
        'frontend_url' => 'http://localhost:8080',
        'health' => url('/up'),
    ]);
});
