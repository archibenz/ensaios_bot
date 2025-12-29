import { describe, expect, test } from 'vitest';
import { canonicalize } from '@ton-resume/shared';
import { verifyInitData } from './index';
import { createHmac } from 'crypto';

describe('canonicalize', () => {
  test('sorts keys consistently', () => {
    const a = canonicalize({ b: 1, a: 2 });
    const b = canonicalize({ a: 2, b: 1 });
    expect(a).toEqual(b);
    expect(a).toEqual('{"a":2,"b":1}');
  });
});

describe('verifyInitData', () => {
  const botToken = 'test-token';
  const user = { id: 123, username: 'alice' };
  const params = new URLSearchParams();
  params.set('user', JSON.stringify(user));
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  params.set('hash', hash);

  test('validates signed payload', () => {
    const result = verifyInitData(params.toString(), botToken);
    expect(result).toEqual(user);
  });
});
