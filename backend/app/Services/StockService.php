<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Finished-product, raw-material and damaged stock movements plus transfers.
 * Ports commit_stock_movement, commit_raw_stock_movement, commit_damaged_movement,
 * commit_damaged_sale, log_finished_product_wastage, commit_transfer_receive,
 * commit_damaged_transfer_approve and the "send transfer" steps of the UI.
 *
 * Rules kept exactly:
 *   - ledger qty is signed: IN positive, OUT negative
 *   - showroom_id NULL = factory
 *   - every movement writes a ledger row AND updates the balance row in the
 *     same transaction; a missing balance row is created
 *
 * $actor === null means a trusted system call (old service_role).
 */
class StockService
{
    public function __construct(private readonly AccessService $access) {}

    // -------------------------------------------------------------------
    // Core movements
    // -------------------------------------------------------------------

    public function productMovement(?User $actor, string $productId, ?string $showroomId, mixed $qty,
        string $kind, ?string $refType = null, ?string $refId = null, ?string $note = null): string
    {
        return DB::transaction(function () use ($actor, $productId, $showroomId, $qty, $kind, $refType, $refId, $note) {
            $this->guard($actor, $showroomId);

            return $this->move('stock_ledger', 'product_stock', 'product_id',
                $productId, $showroomId, $qty, $kind, $refType, $refId, $note);
        });
    }

    public function rawMovement(?User $actor, string $materialId, ?string $showroomId, mixed $qty,
        string $kind, ?string $refType = null, ?string $refId = null, ?string $note = null): string
    {
        return DB::transaction(function () use ($actor, $materialId, $showroomId, $qty, $kind, $refType, $refId, $note) {
            $this->guard($actor, $showroomId);

            return $this->move('raw_stock_ledger', 'raw_material_stock', 'material_id',
                $materialId, $showroomId, $qty, $kind, $refType, $refId, $note);
        });
    }

    public function damagedMovement(?User $actor, string $productId, ?string $showroomId, mixed $qty,
        string $kind, ?string $refType = null, ?string $refId = null, ?string $note = null): string
    {
        return DB::transaction(function () use ($actor, $productId, $showroomId, $qty, $kind, $refType, $refId, $note) {
            $this->guard($actor, $showroomId);

            return $this->move('damaged_ledger', 'damaged_stock', 'product_id',
                $productId, $showroomId, $qty, $kind, $refType, $refId, $note, withCreatedAtOnBalance: false);
        });
    }

    // -------------------------------------------------------------------
    // Damaged sale / finished wastage
    // -------------------------------------------------------------------

    public function damagedSale(?User $actor, string $productId, ?string $showroomId, mixed $qty,
        mixed $unitPrice, ?string $customerName = null, ?string $note = null): string
    {
        return DB::transaction(function () use ($actor, $productId, $showroomId, $qty, $unitPrice, $customerName, $note) {
            $this->guard($actor, $showroomId);
            if ($qty === null || Num::cmp($qty, 0) <= 0) {
                throw new BusinessRuleException('Quantity must be greater than zero');
            }
            if ($unitPrice === null || Num::cmp($unitPrice, 0) < 0) {
                throw new BusinessRuleException('Unit price must be zero or greater');
            }

            $available = $this->lockedBalance('damaged_stock', 'product_id', $productId, $showroomId);
            if (Num::cmp($available, $qty) < 0) {
                throw new BusinessRuleException(sprintf('Insufficient damaged stock (have %s, need %s)',
                    $this->fmt($available), $this->fmt($qty)));
            }

            $id = (string) Str::uuid();
            DB::table('damaged_ledger')->insert([
                'id' => $id,
                'product_id' => $productId,
                'showroom_id' => $showroomId,
                'qty' => Num::qty(Num::neg(Num::abs($qty))),
                'kind' => 'sale_out',
                'ref_type' => 'damaged_sale',
                'note' => $note,
                'sale_amount' => Num::money(Num::mul($qty, $unitPrice)),
                'customer_name' => $customerName,
                'created_at' => now(),
            ]);
            $this->scoped(DB::table('damaged_stock')->where('product_id', $productId), $showroomId)
                ->update(['quantity' => DB::raw('quantity - '.Num::qty($qty)), 'updated_at' => now()]);

            return $id;
        });
    }

    /** Finished product wasted: stock out → damaged in → repurpose queue. Returns queue id. */
    public function finishedWastage(?User $actor, string $productId, ?string $showroomId, mixed $qty,
        ?string $reason, ?string $note = null): string
    {
        return DB::transaction(function () use ($actor, $productId, $showroomId, $qty, $reason, $note) {
            $this->guard($actor, $showroomId);
            if ($qty === null || Num::cmp($qty, 0) <= 0) {
                throw new BusinessRuleException('Quantity must be greater than zero');
            }
            $available = $this->lockedBalance('product_stock', 'product_id', $productId, $showroomId);
            if (Num::cmp($available, $qty) < 0) {
                throw new BusinessRuleException(sprintf('Insufficient finished-product stock (have %s, need %s)',
                    $this->fmt($available), $this->fmt($qty)));
            }

            $this->move('stock_ledger', 'product_stock', 'product_id', $productId, $showroomId,
                Num::neg(Num::abs($qty)), 'wastage_out', 'wastage', null, $reason ?? 'Finished-product wastage');
            $this->move('damaged_ledger', 'damaged_stock', 'product_id', $productId, $showroomId,
                Num::abs($qty), 'damaged_in', 'wastage', null, $note ?? $reason, withCreatedAtOnBalance: false);

            $queueId = (string) Str::uuid();
            DB::table('repurpose_queue')->insert([
                'id' => $queueId,
                'product_id' => $productId,
                'qty' => Num::qty($qty),
                'source_showroom_id' => $showroomId,
                'status' => 'pending',
                'note' => $note ?? $reason,
                'created_at' => now(),
            ]);

            return $queueId;
        });
    }

    // -------------------------------------------------------------------
    // Transfers
    // -------------------------------------------------------------------

    /**
     * Default supply price for a transfer line (sql/35):
     * product.transfer_price when > 0, else product.cost, else 0.
     */
    public function defaultTransferPrice(string $productId): string
    {
        $p = DB::table('products')->where('id', $productId)->first(['transfer_price', 'cost']);
        if (! $p) {
            return '0';
        }

        return Num::cmp($p->transfer_price ?? 0, 0) !== 0 ? Num::money($p->transfer_price) : Num::money($p->cost ?? 0);
    }

    /**
     * Send a draft transfer: checks every line, then takes the stock out of the
     * source (normal or damaged stock) and marks it "sent". All-or-nothing —
     * the old UI could leave half the lines deducted; here it cannot.
     */
    public function sendTransfer(?User $actor, string $transferId): void
    {
        DB::transaction(function () use ($actor, $transferId) {
            $t = DB::table('transfers')->where('id', $transferId)->lockForUpdate()->first();
            if (! $t) {
                throw new BusinessRuleException("Transfer {$transferId} not found");
            }
            $this->guard($actor, $t->source_showroom_id);
            if ($t->status !== 'draft') {
                throw new BusinessRuleException('Only draft transfers can be sent');
            }

            $damaged = $t->kind === 'damaged_return';
            $balance = $damaged ? 'damaged_stock' : 'product_stock';
            $items = DB::table('transfer_items')->where('transfer_id', $transferId)->whereNotNull('product_id')->get();

            foreach ($items as $it) {
                $have = $this->lockedBalance($balance, 'product_id', $it->product_id, $t->source_showroom_id);
                if (Num::cmp($have, $it->qty) < 0) {
                    $name = DB::table('products')->where('id', $it->product_id)->value('name') ?? 'item';
                    throw new BusinessRuleException(sprintf('Insufficient %sstock for %s (have %s, need %s)',
                        $damaged ? 'damaged ' : '', $name, $this->fmt($have), $this->fmt($it->qty)));
                }
            }

            foreach ($items as $it) {
                if ($damaged) {
                    $this->move('damaged_ledger', 'damaged_stock', 'product_id', $it->product_id,
                        $t->source_showroom_id, Num::neg($it->qty), 'transfer_out', 'transfer', $transferId, null,
                        withCreatedAtOnBalance: false);
                } else {
                    $this->move('stock_ledger', 'product_stock', 'product_id', $it->product_id,
                        $t->source_showroom_id, Num::neg($it->qty), 'transfer_out', 'transfer', $transferId, null);
                }
            }

            DB::table('transfers')->where('id', $transferId)
                ->update(['status' => 'sent', 'sent_at' => now(), 'updated_at' => now()]);
        });
    }

    /** Receive a normal transfer — only the destination may accept it. */
    public function receiveTransfer(?User $actor, string $transferId): void
    {
        DB::transaction(function () use ($actor, $transferId) {
            $this->access->assertAppStaff($actor, $actor === null);
            $t = DB::table('transfers')->where('id', $transferId)->lockForUpdate()->first();
            if (! $t) {
                throw new BusinessRuleException("Transfer {$transferId} not found");
            }
            $this->access->assertLocation($actor, $t->dest_showroom_id, $actor === null);
            if ($t->status !== 'sent') {
                throw new BusinessRuleException('Transfer is not pending receipt');
            }
            if ($t->kind === 'damaged_return') {
                throw new BusinessRuleException('Use damaged-return approval for this transfer');
            }

            $items = DB::table('transfer_items')->where('transfer_id', $transferId)->get(['product_id', 'qty']);
            foreach ($items as $it) {
                if ($it->product_id === null) {
                    continue;
                }
                $this->move('stock_ledger', 'product_stock', 'product_id', $it->product_id,
                    $t->dest_showroom_id, $it->qty, 'transfer_in', 'transfer', $transferId, null);
            }

            DB::table('transfers')->where('id', $transferId)
                ->update(['status' => 'received', 'received_at' => now(), 'updated_at' => now()]);
        });
    }

    /**
     * Factory approves a damaged return: damaged stock leaves the showroom and
     * each line enters the repurpose queue.
     */
    public function approveDamagedReturn(?User $actor, string $transferId): void
    {
        DB::transaction(function () use ($actor, $transferId) {
            $this->access->assertAppStaff($actor, $actor === null);
            $t = DB::table('transfers')->where('id', $transferId)->lockForUpdate()->first();
            if (! $t) {
                throw new BusinessRuleException("Transfer {$transferId} not found");
            }
            if ($t->kind !== 'damaged_return') {
                throw new BusinessRuleException("Transfer {$transferId} is not a damaged return");
            }
            $this->access->assertLocation($actor, $t->dest_showroom_id, $actor === null);

            $items = DB::table('transfer_items')->where('transfer_id', $transferId)->get(['product_id', 'qty']);
            foreach ($items as $it) {
                DB::table('damaged_ledger')->insert([
                    'id' => (string) Str::uuid(),
                    'product_id' => $it->product_id,
                    'showroom_id' => $t->source_showroom_id,
                    'qty' => Num::qty(Num::neg(Num::abs($it->qty))),
                    'kind' => 'transfer_out',
                    'ref_type' => 'transfer',
                    'ref_id' => $transferId,
                    'note' => 'Damaged return to factory',
                    'created_at' => now(),
                ]);
                $this->scoped(DB::table('damaged_stock')->where('product_id', $it->product_id), $t->source_showroom_id)
                    ->update(['quantity' => DB::raw('quantity - '.Num::qty(Num::abs($it->qty))), 'updated_at' => now()]);
                DB::table('repurpose_queue')->insert([
                    'id' => (string) Str::uuid(),
                    'product_id' => $it->product_id,
                    'qty' => Num::qty($it->qty),
                    'source_showroom_id' => $t->source_showroom_id,
                    'transfer_id' => $transferId,
                    'status' => 'pending',
                    'created_at' => now(),
                ]);
            }

            DB::table('transfers')->where('id', $transferId)
                ->update(['status' => 'received', 'received_at' => now(), 'updated_at' => now()]);
        });
    }

    // -------------------------------------------------------------------
    // Internals (callers must already be inside a transaction and guarded)
    // -------------------------------------------------------------------

    /**
     * @internal Write one ledger row and apply it to the balance row.
     * Public for ProductionService, which does its own guard + transaction.
     */
    public function move(string $ledger, string $balance, string $keyCol, string $keyId, ?string $showroomId,
        mixed $qty, string $kind, ?string $refType, ?string $refId, ?string $note,
        bool $withCreatedAtOnBalance = true): string
    {
        $q = Num::qty($qty);
        $id = (string) Str::uuid();
        $row = [
            'id' => $id,
            $keyCol => $keyId,
            'showroom_id' => $showroomId,
            'qty' => $q,
            'kind' => $kind,
            'ref_type' => $refType,
            'ref_id' => $refId,
            'note' => $note,
            'created_at' => now(),
        ];
        if ($ledger !== 'damaged_ledger') {
            $row['updated_at'] = now();
        }
        DB::table($ledger)->insert($row);

        $updated = $this->scoped(DB::table($balance)->where($keyCol, $keyId), $showroomId)
            ->update(['quantity' => DB::raw('quantity + ('.$q.')'), 'updated_at' => now()]);

        if ($updated === 0) {
            $bal = [
                'id' => (string) Str::uuid(),
                $keyCol => $keyId,
                'showroom_id' => $showroomId,
                'quantity' => $q,
                'updated_at' => now(),
            ];
            if ($withCreatedAtOnBalance) {
                $bal['created_at'] = now();
            }
            DB::table($balance)->insert($bal);
        }

        return $id;
    }

    /** @internal Current balance, row-locked (SELECT … FOR UPDATE). Missing row = 0. */
    public function lockedBalance(string $table, string $keyCol, string $keyId, ?string $showroomId): string
    {
        $v = $this->scoped(DB::table($table)->where($keyCol, $keyId), $showroomId)
            ->lockForUpdate()->value('quantity');

        return Num::of($v ?? 0);
    }

    /** `showroom_id IS NOT DISTINCT FROM ?` */
    public function scoped($query, ?string $showroomId)
    {
        return $showroomId === null ? $query->whereNull('showroom_id') : $query->where('showroom_id', $showroomId);
    }

    private function guard(?User $actor, ?string $showroomId): void
    {
        $this->access->assertAppStaff($actor, $actor === null);
        $this->access->assertLocation($actor, $showroomId, $actor === null);
    }

    private function fmt(mixed $n): string
    {
        $s = Num::qty($n);

        return str_contains($s, '.') ? rtrim(rtrim($s, '0'), '.') : $s;
    }
}
