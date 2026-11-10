import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { HttpError } from '../../utils/httpError';

type Subnet = [address: string, prefix: number, family: 'ipv4' | 'ipv6'];

/** Addresses a user-supplied URL must never reach. */
const BLOCKED_SUBNETS: Subnet[] = [
  /** "This network", private (10/8, 172.16/12, 192.168/16), carrier-grade NAT, loopback */
  ['0.0.0.0', 8, 'ipv4'],
  ['10.0.0.0', 8, 'ipv4'],
  ['100.64.0.0', 10, 'ipv4'],
  ['127.0.0.0', 8, 'ipv4'],
  ['172.16.0.0', 12, 'ipv4'],
  ['192.168.0.0', 16, 'ipv4'],
  /** Link-local, incl. the 169.254.169.254 cloud metadata endpoint */
  ['169.254.0.0', 16, 'ipv4'],
  /** IETF protocol assignments, benchmarking, multicast, reserved (incl. broadcast) */
  ['192.0.0.0', 24, 'ipv4'],
  ['198.18.0.0', 15, 'ipv4'],
  ['224.0.0.0', 4, 'ipv4'],
  ['240.0.0.0', 4, 'ipv4'],
  /** Unspecified, loopback */
  ['::', 128, 'ipv6'],
  ['::1', 128, 'ipv6'],
  /**
   * NAT64 could wrap any of the IPv4 ranges above. IPv4-mapped addresses (`::ffff:127.0.0.1`) need no rule:
   * `BlockList` already matches them against the IPv4 rules — and a `::ffff:0:0/96` rule would block ALL IPv4.
   */
  ['64:ff9b::', 96, 'ipv6'],
  /** Unique local, link-local, multicast */
  ['fc00::', 7, 'ipv6'],
  ['fe80::', 10, 'ipv6'],
  ['ff00::', 8, 'ipv6'],
];

const blockedAddresses = new BlockList();

BLOCKED_SUBNETS.forEach(([address, prefix, family]) => blockedAddresses.addSubnet(address, prefix, family));

const isBlocked = (address: string) => blockedAddresses.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4');

/**
 * Guards server-side fetches of user-supplied URLs (SSRF): https only, default port only,
 * and every address the hostname resolves to must be public.
 *
 * Known limitation: the hostname is resolved again by `fetch` itself, so a DNS record that changes between the two
 * lookups (DNS rebinding) isn't caught; closing that needs a custom undici dispatcher with a checked `lookup`.
 */
export const assertPublicUrl = async (url: URL): Promise<void> => {
  if (url.protocol !== 'https:') {
    throw new HttpError(400, 'Only https URLs are supported');
  }

  /** `URL` normalizes `:443` away for https, so any remaining port is non-default. */
  if (url.port) {
    throw new HttpError(400, 'URLs with a custom port are not supported');
  }

  /** IPv6 literals come bracketed in `hostname` (`[::1]`); `lookup` wants them bare. */
  const hostname = url.hostname.replace(/^\[(.*)\]$/, '$1');

  let addresses: Array<{ address: string }>;

  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new HttpError(502, `Could not reach ${url.hostname}`);
  }

  if (addresses.length === 0 || addresses.some(({ address }) => isBlocked(address))) {
    throw new HttpError(400, 'This address is not allowed');
  }
};
