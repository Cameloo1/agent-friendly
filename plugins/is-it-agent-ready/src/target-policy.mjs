import { isIP } from "node:net";
import { lookup as defaultLookup } from "node:dns/promises";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google",
  "instance-data.ec2.internal",
]);

const BLOCKED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".lan",
  ".home.arpa",
];

export class TargetPolicyError extends Error {
  constructor(message, code = "invalid_target") {
    super(message);
    this.name = "TargetPolicyError";
    this.code = code;
  }
}

function reject(message, code) {
  throw new TargetPolicyError(message, code);
}

function normalizeHostname(hostname) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function parseIPv4(address) {
  const parts = address.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const numbers = parts.map(Number);
  if (numbers.some((part) => part > 255)) return null;
  return numbers;
}

export function isBlockedIPv4(address) {
  const parts = parseIPv4(address);
  if (!parts) return true;
  const [a, b, c] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function parseIPv6(address) {
  let input = address.toLowerCase();
  if (input.includes("%")) return null;

  const ipv4Match = input.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (ipv4Match) {
    const ipv4 = parseIPv4(ipv4Match[1]);
    if (!ipv4) return null;
    const high = ((ipv4[0] << 8) | ipv4[1]).toString(16);
    const low = ((ipv4[2] << 8) | ipv4[3]).toString(16);
    input = input.slice(0, -ipv4Match[1].length) + `${high}:${low}`;
  }

  if ((input.match(/::/g) || []).length > 1) return null;
  const [leftRaw, rightRaw = ""] = input.split("::");
  const left = leftRaw === "" ? [] : leftRaw.split(":");
  const right = rightRaw === "" ? [] : rightRaw.split(":");
  if ([...left, ...right].some((word) => !/^[0-9a-f]{1,4}$/.test(word))) return null;

  const missing = 8 - left.length - right.length;
  if (input.includes("::")) {
    if (missing < 1) return null;
  } else if (missing !== 0) {
    return null;
  }

  return [...left, ...Array(Math.max(missing, 0)).fill("0"), ...right].map((word) =>
    Number.parseInt(word, 16),
  );
}

export function isBlockedIPv6(address) {
  const words = parseIPv6(address);
  if (!words || words.length !== 8) return true;

  const allZero = words.every((word) => word === 0);
  const loopback = words.slice(0, 7).every((word) => word === 0) && words[7] === 1;
  const ipv4Compatible = words.slice(0, 6).every((word) => word === 0);
  const ipv4Mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  const uniqueLocal = (words[0] & 0xfe00) === 0xfc00;
  const linkLocal = (words[0] & 0xffc0) === 0xfe80;
  const siteLocal = (words[0] & 0xffc0) === 0xfec0;
  const multicast = (words[0] & 0xff00) === 0xff00;
  const discardOnly = words[0] === 0x0100 && words.slice(1, 4).every((word) => word === 0);
  const documentation = words[0] === 0x2001 && words[1] === 0x0db8;
  const benchmarking = words[0] === 0x2001 && words[1] === 0x0002 && words[2] === 0;
  const localTranslation = words[0] === 0x0064 && words[1] === 0xff9b && words[2] === 1;

  return (
    allZero ||
    loopback ||
    ipv4Compatible ||
    ipv4Mapped ||
    uniqueLocal ||
    linkLocal ||
    siteLocal ||
    multicast ||
    discardOnly ||
    documentation ||
    benchmarking ||
    localTranslation
  );
}

export function assertPublicAddress(address) {
  const family = isIP(address);
  if (family === 4 && isBlockedIPv4(address)) {
    reject(`Refusing non-public IPv4 address ${address}.`, "non_public_address");
  }
  if (family === 6 && isBlockedIPv6(address)) {
    reject(`Refusing non-public IPv6 address ${address}.`, "non_public_address");
  }
  if (family === 0) reject(`Resolver returned an invalid address: ${address}.`, "invalid_resolution");
}

export async function validatePublicTarget(raw, { lookup = defaultLookup } = {}) {
  if (typeof raw !== "string" || raw.trim() === "") {
    reject("Scan target must be a non-empty absolute URL.", "invalid_url");
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    reject("Scan target must be a valid absolute URL.", "invalid_url");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    reject("Scan target must use http or https.", "invalid_scheme");
  }
  if (parsed.username || parsed.password) {
    reject("Scan target must not contain a username or password.", "credentials_in_url");
  }
  if (parsed.search) {
    reject("Scan target must not contain a query string; provide the public site URL only.", "query_in_url");
  }
  if (parsed.hash) {
    reject("Scan target must not contain a fragment; provide the public site URL only.", "fragment_in_url");
  }

  const host = normalizeHostname(parsed.hostname);
  if (!host) reject("Scan target must contain a hostname.", "missing_hostname");
  if (BLOCKED_HOSTS.has(host) || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    reject(`Refusing local or internal hostname ${host}.`, "internal_hostname");
  }

  const literalFamily = isIP(host);
  if (literalFamily > 0) {
    assertPublicAddress(host);
  } else {
    if (!host.includes(".")) reject(`Refusing single-label intranet hostname ${host}.`, "internal_hostname");

    let resolved;
    try {
      resolved = await lookup(host, { all: true, verbatim: true });
    } catch (error) {
      reject(`Could not resolve scan target ${host}: ${error.message}`, "dns_resolution_failed");
    }

    if (!Array.isArray(resolved) || resolved.length === 0) {
      reject(`Scan target ${host} did not resolve to an address.`, "dns_resolution_failed");
    }
    for (const record of resolved) assertPublicAddress(record.address);
  }

  return parsed.toString();
}
