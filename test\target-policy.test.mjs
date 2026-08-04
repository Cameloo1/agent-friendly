import test from "node:test";
import assert from "node:assert/strict";

import {
  TargetPolicyError,
  isBlockedIPv4,
  isBlockedIPv6,
  validatePublicTarget,
} from "../plugins/is-it-agent-ready/src/target-policy.mjs";

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

test("accepts public HTTP and HTTPS targets", async () => {
  assert.equal(await validatePublicTarget("https://example.com/docs", { lookup: publicLookup }), "https://example.com/docs");
  assert.equal(await validatePublicTarget("http://example.com/", { lookup: publicLookup }), "http://example.com/");
});

test("rejects invalid and unsupported URL schemes", async () => {
  for (const candidate of ["not-a-url", "file:///etc/passwd", "ftp://example.com/", "data:text/plain,hello"]) {
    await assert.rejects(() => validatePublicTarget(candidate, { lookup: publicLookup }), TargetPolicyError);
  }
});

test("rejects credentials, queries, and fragments", async () => {
  const candidates = [
    "https://user@example.com/",
    "https://user:secret@example.com/",
    "https://example.com/?token=secret",
    "https://example.com/#private",
  ];
  for (const candidate of candidates) {
    await assert.rejects(() => validatePublicTarget(candidate, { lookup: publicLookup }), TargetPolicyError);
  }
});

test("rejects local, internal, metadata, and single-label hostnames without DNS", async () => {
  let lookups = 0;
  const lookup = async () => {
    lookups += 1;
    return [{ address: "93.184.216.34", family: 4 }];
  };
  const candidates = [
    "http://localhost/",
    "http://api.localhost/",
    "http://service.local/",
    "http://service.internal/",
    "http://service.intranet/",
    "http://router.lan/",
    "http://host.home.arpa/",
    "http://metadata.google.internal/",
    "http://instance-data.ec2.internal/",
    "http://printer/",
  ];
  for (const candidate of candidates) {
    await assert.rejects(() => validatePublicTarget(candidate, { lookup }), TargetPolicyError);
  }
  assert.equal(lookups, 0);
});

test("rejects non-public IPv4 ranges and numeric loopback spellings", async () => {
  const candidates = [
    "http://0.0.0.0/",
    "http://10.0.0.1/",
    "http://100.64.0.1/",
    "http://127.0.0.1/",
    "http://169.254.169.254/",
    "http://172.16.0.1/",
    "http://192.168.0.1/",
    "http://192.0.2.1/",
    "http://198.18.0.1/",
    "http://198.51.100.1/",
    "http://203.0.113.1/",
    "http://224.0.0.1/",
    "http://2130706433/",
  ];
  for (const candidate of candidates) {
    await assert.rejects(() => validatePublicTarget(candidate), TargetPolicyError);
  }
  assert.equal(isBlockedIPv4("8.8.8.8"), false);
});

test("rejects non-public IPv6 ranges", async () => {
  const candidates = [
    "http://[::]/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[fc00::1]/",
    "http://[fd12::1]/",
    "http://[fe80::1]/",
    "http://[fec0::1]/",
    "http://[ff02::1]/",
    "http://[2001:db8::1]/",
  ];
  for (const candidate of candidates) {
    await assert.rejects(() => validatePublicTarget(candidate), TargetPolicyError);
  }
  assert.equal(isBlockedIPv6("2606:4700:4700::1111"), false);
});

test("rejects a public hostname when any resolved address is non-public", async () => {
  const lookup = async () => [
    { address: "93.184.216.34", family: 4 },
    { address: "10.0.0.5", family: 4 },
  ];
  await assert.rejects(() => validatePublicTarget("https://example.com/", { lookup }), TargetPolicyError);
});

test("rejects DNS failures before an upstream scan", async () => {
  const lookup = async () => {
    throw new Error("NXDOMAIN");
  };
  await assert.rejects(() => validatePublicTarget("https://missing.example/", { lookup }), TargetPolicyError);
});
