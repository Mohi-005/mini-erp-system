import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '../src/database.types.ts';
import {
  Foundation,
  capturePasswordRecoveryCallbackIntent,
  membershipPhase,
  publicConfig,
} from '../src/auth.ts';
import { can } from '../src/permissions.ts';
import { authText } from '../src/auth-text.ts';

test('Staff defaults deny; inactive membership and unknown roles never authorize', () => {
  assert.equal(
    can({ role: 'STAFF', status: 'ACTIVE' }, [], 'sales.create'),
    false,
  );
  assert.equal(
    can({ role: 'STAFF', status: 'ACTIVE' }, ['sales.create'], 'sales.create'),
    true,
  );
  assert.equal(
    can(
      { role: 'STAFF', status: 'INACTIVE' },
      ['sales.create'],
      'sales.create',
    ),
    false,
  );
  assert.equal(
    can({ role: 'OWNER', status: 'ACTIVE' }, [], 'products.manage'),
    true,
  );
  assert.equal(
    can(
      { role: 'PLATFORM_DEVELOPER', status: 'ACTIVE' },
      ['sales.create'],
      'sales.create',
    ),
    false,
  );
});
test('zero, one, and multiple memberships have explicit states', () => {
  assert.equal(membershipPhase(0), 'onboarding');
  assert.equal(membershipPhase(1), 'ready');
  assert.equal(membershipPhase(2), 'choose-business');
});
test('public config rejects privileged/legacy keys and unsafe URL credentials', () => {
  const publicPlaceholder = 'sb_publishable_test_placeholder_not_a_credential';
  assert.equal(publicConfig('http://127.0.0.1:54321', publicPlaceholder), true);
  assert.equal(publicConfig('http://10.0.2.2:54321', publicPlaceholder), true);
  assert.equal(
    publicConfig('https://example.test', 'sb_secret_test_placeholder'),
    false,
  );
  assert.equal(
    publicConfig('https://example.test', 'legacy.jwt.placeholder'),
    false,
  );
  assert.equal(
    publicConfig('https://user:password@example.test', publicPlaceholder),
    false,
  );
  assert.equal(publicConfig(undefined, undefined), false);
  assert.equal(
    new Foundation(null, 'https://example.test').getSnapshot().phase,
    'unconfigured',
  );
});
test('auth interface text has Bangla and English for every key', () => {
  for (const pair of Object.values(authText))
    assert.ok(pair[0].length && pair[1].length);
});

// These SDK doubles test client state transitions only. They do NOT test Auth,
// PostgreSQL, RLS, delivery, or actual session persistence.
function sdk(auth: Record<string, unknown>) {
  return { auth } as unknown as SupabaseClient<Database>;
}

function installFakeWindow(initialHref: string) {
  const values = new Map<string, string>();
  const fakeWindow = {
    location: { href: initialHref },
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: fakeWindow,
  });
  return {
    values,
    setHref(href: string) {
      fakeWindow.location.href = href;
    },
    restore() {
      if (previous) {
        Object.defineProperty(globalThis, 'window', previous);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    },
  };
}

test('password recovery callback restores reset mode if the recovery event was missed', async () => {
  const browser = installFakeWindow('http://127.0.0.1:5173/');
  try {
    const request = new Foundation(
      sdk({
        resetPasswordForEmail: async () => ({ error: null }),
      }),
      'http://127.0.0.1:5173/auth/callback',
    );
    await request.requestRecovery('test@example.test');
    assert.equal(request.getSnapshot().message, 'resetRequested');
    assert.equal(browser.values.size, 1);

    browser.setHref(
      'http://127.0.0.1:5173/auth/callback?code=synthetic-one-time-code',
    );
    const initialRecoveryIntent = capturePasswordRecoveryCallbackIntent();
    assert.equal(initialRecoveryIntent, true);

    // Simulate Supabase exchanging the one-time code and cleaning the URL
    // before React's start effect subscribes to auth state changes.
    browser.setHref('http://127.0.0.1:5173/auth/callback');
    const recovered = new Foundation(
      sdk({
        getSession: async () => ({ data: { session: {} }, error: null }),
        getUser: async () => ({
          data: {
            user: {
              id: 'synthetic-recovery-user',
              user_metadata: {},
            } as User,
          },
          error: null,
        }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe() {} } },
        }),
      }),
      'http://127.0.0.1:5173/auth/callback',
      undefined,
      initialRecoveryIntent,
    );
    const stop = recovered.start();
    await recovered.refresh();
    assert.equal(recovered.getSnapshot().phase, 'reset-password');
    assert.equal(recovered.getSnapshot().user?.id, 'synthetic-recovery-user');
    assert.equal(browser.values.size, 0);
    stop();
  } finally {
    browser.restore();
  }
});

test('recovery callback capture requires a recent recovery request marker', () => {
  const browser = installFakeWindow(
    'http://127.0.0.1:5173/auth/callback?code=unrelated-confirmation-code',
  );
  try {
    assert.equal(capturePasswordRecoveryCallbackIntent(), false);
  } finally {
    browser.restore();
  }
});

test('failed recovery request clears the pending callback marker', async () => {
  const browser = installFakeWindow('http://127.0.0.1:5173/');
  try {
    const foundation = new Foundation(
      sdk({
        resetPasswordForEmail: async () => ({
          error: new Error('synthetic rate limit'),
        }),
      }),
      'http://127.0.0.1:5173/auth/callback',
    );
    await foundation.requestRecovery('test@example.test');
    assert.equal(foundation.getSnapshot().message, 'recoveryError');
    assert.equal(browser.values.size, 0);
  } finally {
    browser.restore();
  }
});
test('failed login and recovery never become authenticated/sent success', async () => {
  const foundation = new Foundation(
    sdk({
      signInWithPassword: async () => ({ error: new Error('rejected') }),
      resetPasswordForEmail: async () => ({ error: new Error('unavailable') }),
    }),
    'https://example.test',
  );
  await foundation.login('test@example.test', 'synthetic password');
  assert.equal(foundation.getSnapshot().phase, 'signed-out');
  assert.equal(foundation.getSnapshot().message, 'loginError');
  assert.equal(foundation.getSnapshot().active, null);
  await foundation.requestRecovery('test@example.test');
  assert.equal(foundation.getSnapshot().message, 'recoveryError');
});
test('signup with no session requires verification, never creates tenant locally', async () => {
  const foundation = new Foundation(
    sdk({ signUp: async () => ({ data: { session: null }, error: null }) }),
    'https://example.test',
  );
  await foundation.signup(
    'test@example.test',
    'synthetic password',
    'Synthetic owner',
    'Synthetic shop',
  );
  assert.equal(foundation.getSnapshot().phase, 'verify-email');
  assert.equal(foundation.getSnapshot().user, null);
  assert.deepEqual(foundation.getSnapshot().tenants, []);
});
test('a late session response cannot restore user context after sign-out', async () => {
  let resolveUser!: (value: { data: { user: User }; error: null }) => void;
  let requested!: () => void;
  const userRequested = new Promise<void>((resolve) => {
    requested = resolve;
  });
  const lateUser = new Promise<{ data: { user: User }; error: null }>(
    (resolve) => {
      resolveUser = resolve;
    },
  );
  const foundation = new Foundation(
    sdk({
      getSession: async () => ({ data: { session: {} }, error: null }),
      getUser: () => {
        requested();
        return lateUser;
      },
      signOut: async () => ({ error: null }),
    }),
    'https://example.test',
  );
  const loading = foundation.refresh();
  await userRequested;
  await foundation.logout();
  resolveUser({ data: { user: { id: 'old-user' } as User }, error: null });
  await loading;
  assert.equal(foundation.getSnapshot().phase, 'signed-out');
  assert.equal(foundation.getSnapshot().user, null);
  assert.deepEqual(foundation.getSnapshot().tenants, []);
});

test('account change clears old tenant synchronously before deferred reload', async () => {
  let changed!: () => void;
  const rows: Record<string, unknown[]> = {
    profiles: [
      {
        id: 'synthetic-old-user',
        display_name: 'Synthetic old user',
        preferred_language: 'bn',
      },
    ],
    business_members: [
      {
        id: 'synthetic-member',
        business_id: 'synthetic-business',
        user_id: 'synthetic-old-user',
        role: 'OWNER',
        status: 'ACTIVE',
      },
    ],
    businesses: [{ id: 'synthetic-business', name: 'Synthetic old business' }],
    business_settings: [
      { business_id: 'synthetic-business', default_language: 'bn' },
    ],
    business_member_permissions: [],
  };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: {} }, error: null }),
      getUser: async () => ({
        data: { user: { id: 'synthetic-old-user', user_metadata: {} } },
        error: null,
      }),
      onAuthStateChange: (callback: (event: 'SIGNED_IN') => void) => {
        changed = () => callback('SIGNED_IN');
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
    from: (table: string) => {
      const result = { data: rows[table], error: null };
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: rows[table][0], error: null }),
        order: async () => result,
        in: async () => result,
      };
      return query;
    },
  } as unknown as SupabaseClient<Database>;
  const foundation = new Foundation(client, 'https://example.test');
  const stop = foundation.start();
  await foundation.refresh();
  assert.equal(
    foundation.getSnapshot().active?.business.id,
    'synthetic-business',
  );
  changed();
  assert.equal(foundation.getSnapshot().phase, 'loading');
  assert.equal(foundation.getSnapshot().user, null);
  assert.equal(foundation.getSnapshot().profile, null);
  assert.equal(foundation.getSnapshot().active, null);
  assert.deepEqual(foundation.getSnapshot().tenants, []);
  stop();
});
