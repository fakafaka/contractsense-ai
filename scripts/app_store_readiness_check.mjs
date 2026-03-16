#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const strict = process.argv.includes("--strict");

function readJson(file) {
  const p = path.join(root, file);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function ok(msg) {
  console.log(`✅ ${msg}`);
}
function warn(msg) {
  console.log(`⚠️ ${msg}`);
}
function fail(msg) {
  console.log(`❌ ${msg}`);
}

function isHttpsUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isPositiveInteger(value) {
  return /^\d+$/.test(String(value)) && Number(value) > 0;
}

let hardFailures = 0;

try {
  const pkg = readJson("package.json");
  if (pkg.scripts?.["eval:quality"]) ok("quality eval script present");
  else {
    fail("missing package.json script: eval:quality");
    hardFailures++;
  }

  if (pkg.scripts?.["test"]) ok("test script present");
  else {
    fail("missing package.json script: test");
    hardFailures++;
  }

  if (pkg.scripts?.["appstore:check"]) ok("appstore:check script present");
  else {
    fail("missing package.json script: appstore:check");
    hardFailures++;
  }
} catch (e) {
  fail(`failed reading package.json: ${e.message}`);
  hardFailures++;
}

try {
  const eas = readJson("eas.json");
  if (eas.build?.preview && eas.build?.production) ok("eas.json has preview and production profiles");
  else {
    fail("eas.json missing preview/production build profiles");
    hardFailures++;
  }

  const easAppleId = eas.submit?.production?.ios?.appleId || process.env.EAS_APPLE_ID;
  if (strict) {
    if (!easAppleId || String(easAppleId).trim().length === 0) {
      fail("EAS appleId is required in strict mode (eas.json submit.production.ios.appleId or EAS_APPLE_ID env)");
      hardFailures++;
    } else {
      ok("EAS appleId configured for strict mode");
    }
  } else if (!easAppleId || String(easAppleId).trim().length === 0) {
    warn("EAS appleId not set (ok for non-strict)");
  }
} catch (e) {
  fail(`failed reading eas.json: ${e.message}`);
  hardFailures++;
}

const appConfigPath = path.join(root, "app.config.ts");
if (!fs.existsSync(appConfigPath)) {
  fail("missing app.config.ts");
  hardFailures++;
} else {
  const appConfig = fs.readFileSync(appConfigPath, "utf8");
  const checks = [
    ["ios.buildNumber wiring", /iosBuildNumber/],
    ["android.versionCode wiring", /androidVersionCode/],
    ["privacy policy URL wiring", /privacyPolicyUrl/],
    ["terms URL wiring", /termsOfUseUrl/],
  ];
  for (const [name, re] of checks) {
    if (re.test(appConfig)) ok(`${name} present in app.config.ts`);
    else {
      fail(`${name} missing in app.config.ts`);
      hardFailures++;
    }
  }
}

const envChecks = [
  ["PRIVACY_POLICY_URL", process.env.PRIVACY_POLICY_URL],
  ["TERMS_OF_USE_URL", process.env.TERMS_OF_USE_URL],
  ["IOS_BUILD_NUMBER", process.env.IOS_BUILD_NUMBER],
  ["ANDROID_VERSION_CODE", process.env.ANDROID_VERSION_CODE],
  ["IOS_SUBSCRIPTION_PRODUCT_ID", process.env.IOS_SUBSCRIPTION_PRODUCT_ID],
  ["ANDROID_SUBSCRIPTION_PRODUCT_ID", process.env.ANDROID_SUBSCRIPTION_PRODUCT_ID],
  ["APPLE_SHARED_SECRET", process.env.APPLE_SHARED_SECRET],
  ["APPLE_BUNDLE_ID", process.env.APPLE_BUNDLE_ID],
];

for (const [key, value] of envChecks) {
  if (value && String(value).trim().length > 0) ok(`env set: ${key}`);
  else if (strict) {
    fail(`env missing in strict mode: ${key}`);
    hardFailures++;
  } else {
    warn(`env not set (ok for non-strict): ${key}`);
  }
}


if (strict) {
  const missingIap = [
    ["IOS_SUBSCRIPTION_PRODUCT_ID", process.env.IOS_SUBSCRIPTION_PRODUCT_ID],
    ["ANDROID_SUBSCRIPTION_PRODUCT_ID", process.env.ANDROID_SUBSCRIPTION_PRODUCT_ID],
  ].filter(([, value]) => !value || String(value).trim().length === 0);

  if (missingIap.length > 0) {
    fail(`strict mode requires subscription product IDs: ${missingIap.map(([k]) => k).join(", ")}`);
    hardFailures++;
  } else {
    ok("strict mode: subscription product IDs are configured");
  }

  const missingAppleBilling = [
    ["APPLE_SHARED_SECRET", process.env.APPLE_SHARED_SECRET],
    ["APPLE_BUNDLE_ID", process.env.APPLE_BUNDLE_ID],
  ].filter(([, value]) => !value || String(value).trim().length === 0);

  if (missingAppleBilling.length > 0) {
    fail(`strict mode requires Apple billing env vars: ${missingAppleBilling.map(([k]) => k).join(", ")}`);
    hardFailures++;
  } else {
    ok("strict mode: Apple billing env vars are configured");
  }
}
const privacy = process.env.PRIVACY_POLICY_URL;
if (privacy && !isHttpsUrl(privacy)) {
  fail("PRIVACY_POLICY_URL must be a valid https URL");
  hardFailures++;
} else if (privacy) {
  ok("PRIVACY_POLICY_URL is valid https URL");
}

const terms = process.env.TERMS_OF_USE_URL;
if (terms && !isHttpsUrl(terms)) {
  fail("TERMS_OF_USE_URL must be a valid https URL");
  hardFailures++;
} else if (terms) {
  ok("TERMS_OF_USE_URL is valid https URL");
}

const iosBuild = process.env.IOS_BUILD_NUMBER;
if (iosBuild && !isPositiveInteger(iosBuild)) {
  fail("IOS_BUILD_NUMBER must be a positive integer");
  hardFailures++;
} else if (iosBuild) {
  ok("IOS_BUILD_NUMBER is a positive integer");
}

const androidCode = process.env.ANDROID_VERSION_CODE;
if (androidCode && !isPositiveInteger(androidCode)) {
  fail("ANDROID_VERSION_CODE must be a positive integer");
  hardFailures++;
} else if (androidCode) {
  ok("ANDROID_VERSION_CODE is a positive integer");
}


function isStoreProductId(value) {
  return /^[a-zA-Z0-9._-]+$/.test(value);
}

function isBundleId(value) {
  return /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(value);
}

const iosProductId = process.env.IOS_SUBSCRIPTION_PRODUCT_ID;
if (iosProductId && !isStoreProductId(iosProductId)) {
  fail("IOS_SUBSCRIPTION_PRODUCT_ID has invalid format");
  hardFailures++;
} else if (iosProductId) {
  ok("IOS_SUBSCRIPTION_PRODUCT_ID format looks valid");
}

const androidProductId = process.env.ANDROID_SUBSCRIPTION_PRODUCT_ID;
if (androidProductId && !isStoreProductId(androidProductId)) {
  fail("ANDROID_SUBSCRIPTION_PRODUCT_ID has invalid format");
  hardFailures++;
} else if (androidProductId) {
  ok("ANDROID_SUBSCRIPTION_PRODUCT_ID format looks valid");
}

const bundleId = process.env.APPLE_BUNDLE_ID;
if (bundleId && !isBundleId(bundleId)) {
  fail("APPLE_BUNDLE_ID has invalid format");
  hardFailures++;
} else if (bundleId) {
  ok("APPLE_BUNDLE_ID format looks valid");
}

const sharedSecret = process.env.APPLE_SHARED_SECRET;
if (sharedSecret && String(sharedSecret).trim().length < 8) {
  fail("APPLE_SHARED_SECRET seems too short");
  hardFailures++;
} else if (sharedSecret) {
  ok("APPLE_SHARED_SECRET is present");
}

if (hardFailures > 0) {
  fail(`App Store readiness check failed with ${hardFailures} issue(s).`);
  process.exit(1);
}

ok("App Store readiness check passed.");
