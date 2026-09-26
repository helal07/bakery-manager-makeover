<?php

namespace App\Services;

/**
 * Exact decimal arithmetic on strings (PHP bcmath), so quantities and money
 * never pick up float rounding errors. Postgres `numeric` was exact too.
 * Internal scale 10; the MySQL columns store 4 (qty) / 2 (money) places.
 */
final class Num
{
    public const SCALE = 10;

    public static function of(mixed $v): string
    {
        if ($v === null || $v === '') {
            return '0';
        }
        if (is_float($v)) {
            return rtrim(rtrim(sprintf('%.10F', $v), '0'), '.') ?: '0';
        }

        $s = trim((string) $v);
        if (! is_numeric($s)) {
            throw new BusinessRuleException("Invalid number: {$s}");
        }

        return $s;
    }

    public static function add(mixed $a, mixed $b): string
    {
        return bcadd(self::of($a), self::of($b), self::SCALE);
    }

    public static function sub(mixed $a, mixed $b): string
    {
        return bcsub(self::of($a), self::of($b), self::SCALE);
    }

    public static function mul(mixed $a, mixed $b): string
    {
        return bcmul(self::of($a), self::of($b), self::SCALE);
    }

    public static function div(mixed $a, mixed $b): string
    {
        return bcdiv(self::of($a), self::of($b), self::SCALE);
    }

    public static function neg(mixed $a): string
    {
        return bcmul(self::of($a), '-1', self::SCALE);
    }

    public static function abs(mixed $a): string
    {
        $s = self::of($a);

        return self::cmp($s, '0') < 0 ? self::neg($s) : $s;
    }

    public static function cmp(mixed $a, mixed $b): int
    {
        return bccomp(self::of($a), self::of($b), self::SCALE);
    }

    /** Half-up rounding, like JS toFixed / Postgres round(). */
    public static function round(mixed $a, int $places): string
    {
        $s = self::of($a);
        $half = '0.'.str_repeat('0', $places).'5';
        $r = self::cmp($s, '0') < 0 ? bcsub($s, $half, $places) : bcadd($s, $half, $places);

        return $r === '-0'.($places ? '.'.str_repeat('0', $places) : '') ? ltrim($r, '-') : $r;
    }

    public static function money(mixed $a): string
    {
        return self::round($a, 2);
    }

    public static function qty(mixed $a): string
    {
        return self::round($a, 4);
    }
}
