#!/usr/bin/env node
import mysql from "mysql2/promise";

function usage() {
  console.log(
    "Usage: node scripts/reconcile-anonymous-users.mjs <canonicalAnonOpenId> <duplicateAnonOpenId> [--dry-run]",
  );
}

const [, , canonicalOpenId, duplicateOpenId, ...rest] = process.argv;
const dryRun = rest.includes("--dry-run");

if (!canonicalOpenId || !duplicateOpenId) {
  usage();
  process.exit(1);
}

if (canonicalOpenId === duplicateOpenId) {
  console.error("canonical and duplicate openId must be different");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const connection = await mysql.createConnection(databaseUrl);

async function getUserByOpenId(openId, { forUpdate = false } = {}) {
  const suffix = forUpdate ? " FOR UPDATE" : "";
  const [rows] = await connection.execute(
    `SELECT id, openId, loginMethod FROM users WHERE openId = ? LIMIT 1${suffix}`,
    [openId],
  );
  return rows[0] ?? null;
}

try {
  await connection.beginTransaction();
  const canonicalUser = await getUserByOpenId(canonicalOpenId, { forUpdate: true });
  const duplicateUser = await getUserByOpenId(duplicateOpenId, { forUpdate: true });

  if (!canonicalUser || !duplicateUser) {
    console.error("Could not find both users", { canonicalOpenId, duplicateOpenId });
    process.exit(1);
  }

  if (!canonicalUser.openId.startsWith("anon:") || !duplicateUser.openId.startsWith("anon:")) {
    console.error("This script is only for anonymous users (openId starting with anon:)");
    process.exit(1);
  }

  console.log("Reconciling anonymous users", {
    canonicalUser,
    duplicateUser,
    dryRun,
  });

  await connection.execute("UPDATE contracts SET userId = ? WHERE userId = ?", [
    canonicalUser.id,
    duplicateUser.id,
  ]);
  await connection.execute("UPDATE analyses SET userId = ? WHERE userId = ?", [
    canonicalUser.id,
    duplicateUser.id,
  ]);
  await connection.execute("UPDATE iapPurchases SET userId = ? WHERE userId = ?", [
    canonicalUser.id,
    duplicateUser.id,
  ]);

  const [creditRows] = await connection.execute(
    "SELECT userId, freeCreditsGranted, paidCreditsGranted, creditsConsumed FROM userCredits WHERE userId IN (?, ?)",
    [canonicalUser.id, duplicateUser.id],
  );

  const canonicalCredits = creditRows.find((row) => row.userId === canonicalUser.id) ?? null;
  const duplicateCredits = creditRows.find((row) => row.userId === duplicateUser.id) ?? null;

  if (canonicalCredits && duplicateCredits) {
    const mergedFree = Math.max(
      Number(canonicalCredits.freeCreditsGranted),
      Number(duplicateCredits.freeCreditsGranted),
    );
    const mergedPaid = Number(canonicalCredits.paidCreditsGranted) + Number(duplicateCredits.paidCreditsGranted);
    const mergedConsumedRaw = Number(canonicalCredits.creditsConsumed) + Number(duplicateCredits.creditsConsumed);
    const mergedConsumed = Math.min(mergedConsumedRaw, mergedFree + mergedPaid);

    await connection.execute(
      "UPDATE userCredits SET freeCreditsGranted = ?, paidCreditsGranted = ?, creditsConsumed = ? WHERE userId = ?",
      [mergedFree, mergedPaid, mergedConsumed, canonicalUser.id],
    );
    await connection.execute("DELETE FROM userCredits WHERE userId = ?", [duplicateUser.id]);
  } else if (!canonicalCredits && duplicateCredits) {
    await connection.execute("UPDATE userCredits SET userId = ? WHERE userId = ?", [
      canonicalUser.id,
      duplicateUser.id,
    ]);
  }

  await connection.execute("DELETE FROM users WHERE id = ?", [duplicateUser.id]);

  if (dryRun) {
    await connection.rollback();
    console.log("Dry run complete (rolled back)");
  } else {
    await connection.commit();
    console.log("Reconciliation committed successfully");
  }
} catch (error) {
  await connection.rollback();
  console.error("Reconciliation failed, rolled back", error);
  process.exit(1);
} finally {
  await connection.end();
}
