<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/** Company settings, invoice settings, landing page and image uploads. */
class SettingsController extends Controller
{
    private const PUBLIC_COMPANY = ['name', 'tagline', 'address', 'logo_url', 'footer_note'];
    private const COMPANY = ['name', 'tagline', 'address', 'phone', 'email', 'vat_reg', 'logo_url', 'footer_note'];

    private function current()
    {
        return DB::table('company_settings')->where('is_current', true)->orderByDesc('updated_at')->first();
    }

    private function decode($v): array
    {
        return is_string($v) ? (json_decode($v, true) ?: []) : (array) ($v ?? []);
    }

    /** Public branding (no login) — same columns anonymous visitors can read today. */
    public function publicCompany(): JsonResponse
    {
        $row = $this->current();

        return response()->json($row ? collect((array) $row)->only(self::PUBLIC_COMPANY) : null);
    }

    public function company(): JsonResponse
    {
        $row = $this->current();
        if (! $row) {
            return response()->json(null);
        }
        $out = collect((array) $row)->only(self::COMPANY)->all();
        $out['settings'] = $this->decode($row->settings);

        return response()->json($out);
    }

    public function saveCompany(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'], 'tagline' => ['nullable', 'string', 'max:255'],
            'address' => ['nullable', 'string'], 'phone' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'string', 'max:255'], 'vat_reg' => ['nullable', 'string', 'max:255'],
            'logo_url' => ['nullable', 'string', 'max:1024'], 'footer_note' => ['nullable', 'string'],
        ]);

        return DB::transaction(function () use ($data) {
            $row = $this->current();
            if ($row) {
                DB::table('company_settings')->where('is_current', true)->where('id', '<>', $row->id)->update(['is_current' => false]);
                DB::table('company_settings')->where('id', $row->id)->update($data + ['updated_at' => now()]);
            } else {
                DB::table('company_settings')->insert($data + [
                    'id' => (string) Str::uuid(), 'is_current' => true, 'created_at' => now(), 'updated_at' => now(),
                ]);
            }

            return response()->json(['ok' => true]);
        });
    }

    public function saveInvoice(Request $request): JsonResponse
    {
        $data = $request->validate(['invoice' => ['required', 'array']]);
        $row = $this->current();
        if ($row) {
            $s = $this->decode($row->settings);
            $s['invoice'] = $data['invoice'];
            DB::table('company_settings')->where('id', $row->id)->update(['settings' => json_encode($s), 'updated_at' => now()]);
        } else {
            DB::table('company_settings')->insert([
                'id' => (string) Str::uuid(), 'is_current' => true, 'name' => 'Company',
                'settings' => json_encode(['invoice' => $data['invoice']]), 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        return response()->json(['ok' => true]);
    }

    // ---------------- landing page ----------------

    /** Everything the public landing page needs, in one call (no login). */
    public function publicLanding(): JsonResponse
    {
        $content = DB::table('landing_content')->where('is_current', true)->orderByDesc('updated_at')->first();

        return response()->json([
            'content' => $content ? $this->decode($content->content) : null,
            'carousels' => DB::table('landing_carousels')->where('is_active', true)->orderBy('sort_order')
                ->get(['id', 'title', 'subtitle', 'image_url', 'link_url', 'sort_order', 'is_active']),
            'products' => DB::table('products')->where('is_active', true)->where('show_on_landing', true)->orderBy('name')
                ->get(['id', 'name', 'sku', 'category', 'price', 'image_url', 'show_on_landing']),
        ]);
    }

    public function saveLanding(Request $request): JsonResponse
    {
        $data = $request->validate(['content' => ['required', 'array']]);
        $row = DB::table('landing_content')->where('is_current', true)->orderByDesc('updated_at')->first();
        $payload = ['content' => json_encode($data['content']), 'is_current' => true,
            'updated_by' => $request->user()->id, 'updated_at' => now()];
        if ($row) {
            DB::table('landing_content')->where('id', $row->id)->update($payload);
        } else {
            DB::table('landing_content')->insert($payload + ['id' => (string) Str::uuid(), 'created_at' => now()]);
        }

        return response()->json(['ok' => true]);
    }

    public function carousels(): JsonResponse
    {
        return response()->json(DB::table('landing_carousels')->orderBy('sort_order')
            ->get(['id', 'title', 'subtitle', 'image_url', 'link_url', 'sort_order', 'is_active']));
    }

    public function saveCarousel(Request $request, ?string $id = null): JsonResponse
    {
        $data = $request->validate([
            'title' => ['nullable', 'string', 'max:255'], 'subtitle' => ['nullable', 'string', 'max:255'],
            'image_url' => ['required', 'string', 'max:1024'], 'link_url' => ['nullable', 'string', 'max:1024'],
            'sort_order' => ['nullable', 'integer'], 'is_active' => ['nullable', 'boolean'],
        ]);
        $data['title'] = $data['title'] ?? '';
        $data['sort_order'] = $data['sort_order'] ?? 0;
        $data['is_active'] = $data['is_active'] ?? true;
        if ($id) {
            DB::table('landing_carousels')->where('id', $id)->update($data + ['updated_at' => now()]);
        } else {
            $id = (string) Str::uuid();
            DB::table('landing_carousels')->insert($data + ['id' => $id, 'created_at' => now(), 'updated_at' => now()]);
        }

        return response()->json(['id' => $id]);
    }

    public function destroyCarousel(string $id): JsonResponse
    {
        DB::table('landing_carousels')->where('id', $id)->delete();

        return response()->json(['ok' => true]);
    }

    public function landingProducts(): JsonResponse
    {
        return response()->json(DB::table('products')->where('is_active', true)->orderBy('name')
            ->get(['id', 'name', 'sku', 'category', 'price', 'image_url', 'show_on_landing', 'is_active']));
    }

    public function toggleLandingProduct(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['show' => ['required', 'boolean']]);
        DB::table('products')->where('id', $id)->update(['show_on_landing' => $data['show'], 'updated_at' => now()]);

        return response()->json(['ok' => true]);
    }

    // ---------------- uploads ----------------

    /** Store an image on the public disk (run `php artisan storage:link` once) and return its URL. */
    public function upload(Request $request): JsonResponse
    {
        $data = $request->validate([
            'file' => ['required', 'file', 'image', 'max:5120'],
            'folder' => ['nullable', 'string', 'regex:/^[a-z0-9_\-\/]{1,80}$/i'],
        ]);
        $folder = trim($data['folder'] ?? 'uploads', '/');
        $path = $request->file('file')->store($folder, 'public');

        return response()->json(['path' => $path, 'url' => url(Storage::url($path))], 201);
    }
}
