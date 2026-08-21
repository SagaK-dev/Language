import { describe, expect, it } from 'vitest';
import { isAllowedPublicUrl, isBlockedHostname } from './article';

describe('article URL validation', () => {
  it('allows normal public web URLs', () => {
    expect(isAllowedPublicUrl(new URL('https://example.com/story'))).toBe(true);
  });

  it('blocks localhost and private IPv4 ranges', () => {
    expect(isBlockedHostname('localhost')).toBe(true);
    expect(isBlockedHostname('127.0.0.1')).toBe(true);
    expect(isBlockedHostname('10.10.0.2')).toBe(true);
    expect(isBlockedHostname('172.20.0.3')).toBe(true);
    expect(isBlockedHostname('192.168.1.2')).toBe(true);
    expect(isBlockedHostname('169.254.169.254')).toBe(true);
  });

  it('blocks private and mapped IPv6 addresses', () => {
    expect(isBlockedHostname('[::1]')).toBe(true);
    expect(isBlockedHostname('[fd00::1]')).toBe(true);
    expect(isBlockedHostname('[fe80::1]')).toBe(true);
    expect(isBlockedHostname('[::ffff:127.0.0.1]')).toBe(true);
  });

  it('blocks credentials and non-web ports', () => {
    expect(isAllowedPublicUrl(new URL('https://user:pass@example.com/'))).toBe(false);
    expect(isAllowedPublicUrl(new URL('https://example.com:8443/'))).toBe(false);
    expect(isAllowedPublicUrl(new URL('file:///tmp/example.html'))).toBe(false);
  });
});
