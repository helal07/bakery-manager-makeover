<?php

namespace App\Services;

use RuntimeException;

/**
 * Thrown when a business rule blocks an action (not enough stock, no access…).
 * Controllers turn it into HTTP 422 (or 403 when $forbidden is true) with the
 * same message text the old database functions raised, so the UI shows the
 * exact same error to the user.
 */
class BusinessRuleException extends RuntimeException
{
    public function __construct(string $message, public readonly bool $forbidden = false)
    {
        parent::__construct($message);
    }

    public static function forbidden(string $message = 'Not authorized'): self
    {
        return new self($message, true);
    }
}
