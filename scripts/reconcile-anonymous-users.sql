-- One-time anonymous-user reconciliation plan
--
-- Purpose:
--   Merge duplicate anonymous users so credits/history are not stranded.
--
-- This script is written for the known duplicate pair:
--   canonical: anon:dev-mmyozl6t-rwqv688y
--   duplicate: anon:dev-mnd7qgmp-s9ojxfmc
--
-- Safety:
--   1) Run on production in a maintenance window.
--   2) Take a DB backup/snapshot first.
--   3) Execute inside a single transaction.

START TRANSACTION;

SET @canonical_open_id := 'anon:dev-mmyozl6t-rwqv688y';
SET @duplicate_open_id := 'anon:dev-mnd7qgmp-s9ojxfmc';

SELECT id INTO @canonical_user_id
FROM users
WHERE openId = @canonical_open_id
LIMIT 1
FOR UPDATE;

SELECT id INTO @duplicate_user_id
FROM users
WHERE openId = @duplicate_open_id
LIMIT 1
FOR UPDATE;

-- Abort manually if either variable is NULL before continuing.
SELECT @canonical_user_id AS canonical_user_id, @duplicate_user_id AS duplicate_user_id;

-- Move all user-owned rows to canonical user.
UPDATE contracts SET userId = @canonical_user_id WHERE userId = @duplicate_user_id;
UPDATE analyses SET userId = @canonical_user_id WHERE userId = @duplicate_user_id;
UPDATE iapPurchases SET userId = @canonical_user_id WHERE userId = @duplicate_user_id;

-- Merge credit ledgers without granting extra free credits:
-- merged free = MAX(canonical.free, duplicate.free)
-- merged paid = canonical.paid + duplicate.paid
-- merged consumed = MIN(canonical.used + duplicate.used, merged free + merged paid)
SELECT freeCreditsGranted, paidCreditsGranted, creditsConsumed
INTO @c_free, @c_paid, @c_used
FROM userCredits
WHERE userId = @canonical_user_id
LIMIT 1
FOR UPDATE;

SELECT freeCreditsGranted, paidCreditsGranted, creditsConsumed
INTO @d_free, @d_paid, @d_used
FROM userCredits
WHERE userId = @duplicate_user_id
LIMIT 1
FOR UPDATE;

SET @c_free := COALESCE(@c_free, 0);
SET @c_paid := COALESCE(@c_paid, 0);
SET @c_used := COALESCE(@c_used, 0);
SET @d_free := COALESCE(@d_free, 0);
SET @d_paid := COALESCE(@d_paid, 0);
SET @d_used := COALESCE(@d_used, 0);

SET @merged_free := GREATEST(@c_free, @d_free);
SET @merged_paid := @c_paid + @d_paid;
SET @merged_used_raw := @c_used + @d_used;
SET @merged_used := LEAST(@merged_used_raw, @merged_free + @merged_paid);

INSERT INTO userCredits (userId, freeCreditsGranted, paidCreditsGranted, creditsConsumed)
VALUES (@canonical_user_id, @merged_free, @merged_paid, @merged_used)
ON DUPLICATE KEY UPDATE
  freeCreditsGranted = VALUES(freeCreditsGranted),
  paidCreditsGranted = VALUES(paidCreditsGranted),
  creditsConsumed = VALUES(creditsConsumed);

DELETE FROM userCredits WHERE userId = @duplicate_user_id;
DELETE FROM users WHERE id = @duplicate_user_id;

-- Sanity check results before commit.
SELECT id, openId, loginMethod FROM users WHERE id IN (@canonical_user_id, @duplicate_user_id);
SELECT * FROM userCredits WHERE userId = @canonical_user_id;

COMMIT;
