// The vendor-doc fields the owner may edit from the client (branding + every
// tunable setting). This list is the client half of a contract with
// firestore.rules: the vendor `update` rule allows exactly these keys
// (`affectedKeys().hasOnly([...])`). If the two drift, settings either silently
// fail to save (a key missing here) or the whole write is rejected (a key here
// the rules don't allow). tests/vendor-settings.test.mjs pins them equal.
//
// Regression note: `stockAlerts` and `rewards` were once missing here, so those
// settings appeared to save but were dropped before the write and reset on
// refresh. Keep this in lockstep with firestore.rules.
export const VENDOR_SETTING_KEYS = [
  "name",
  "logoUrl",
  "sharingMode",
  "invVarianceThreshold",
  "blindCounts",
  "varianceThreshold",
  "digest",
  "patternRules",
  "fiscalStartMonth",
  "aiSearch",
  "aiInsights",
  "stockAlerts",
  "rewards",
];
