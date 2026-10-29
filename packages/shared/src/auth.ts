import {
  createClient,
  processLock,
  type SupportedStorage,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';
import type {
  Database,
  Business,
  Member,
  Profile,
  Settings,
} from './database.types.ts';
import type { Locale } from './translations.ts';
import type { AuthTextKey } from './auth-text.ts';
export { authLabel, authText, type AuthTextKey } from './auth-text.ts';
export { can, permissionKeys, type Permission } from './permissions.ts';
export type Tenant = {
  business: Business;
  member: Member;
  settings: Settings;
  permissions: string[];
};
export type Phase =
  | 'unconfigured'
  | 'loading'
  | 'signed-out'
  | 'verify-email'
  | 'reset-password'
  | 'onboarding'
  | 'choose-business'
  | 'ready'
  | 'error';
export type Snapshot = {
  phase: Phase;
  locale: Locale;
  busy: boolean;
  message: AuthTextKey | null;
  user: User | null;
  profile: Profile | null;
  tenants: Tenant[];
  active: Tenant | null;
  onboardingName: string;
  request: Onboarding | null;
};
type Onboarding = {
  p_request_id: string;
  p_business_name: string;
  p_display_name: string;
  p_phone: string | null;
  p_address: string | null;
};

// This short-lived browser marker remembers that a recovery email was requested.
// It is not an authorization credential: the reset screen still requires a valid
// Supabase session obtained from the one-time callback code.
const PASSWORD_RECOVERY_MARKER_KEY = 'mini-erp:password-recovery-requested-at';
const PASSWORD_RECOVERY_MARKER_TTL_MS = 60 * 60 * 1000;

function writePasswordRecoveryMarker() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      PASSWORD_RECOVERY_MARKER_KEY,
      String(Date.now()),
    );
  } catch {
    // PKCE itself requires usable browser storage. Let Supabase report any
    // underlying problem through the normal request flow.
  }
}

function clearPasswordRecoveryMarker() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PASSWORD_RECOVERY_MARKER_KEY);
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

function hasRecentPasswordRecoveryMarker(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const saved = window.localStorage.getItem(PASSWORD_RECOVERY_MARKER_KEY);
    if (!saved) return false;
    const timestamp = Number(saved);
    const age = Date.now() - timestamp;
    return (
      Number.isFinite(timestamp) &&
      timestamp > 0 &&
      age >= 0 &&
      age <= PASSWORD_RECOVERY_MARKER_TTL_MS
    );
  } catch {
    return false;
  }
}

function consumePasswordRecoveryMarker(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const saved = window.localStorage.getItem(PASSWORD_RECOVERY_MARKER_KEY);
    window.localStorage.removeItem(PASSWORD_RECOVERY_MARKER_KEY);
    if (!saved) return false;
    const timestamp = Number(saved);
    const age = Date.now() - timestamp;
    return (
      Number.isFinite(timestamp) &&
      timestamp > 0 &&
      age >= 0 &&
      age <= PASSWORD_RECOVERY_MARKER_TTL_MS
    );
  } catch {
    return false;
  }
}

function isWebAuthCallbackUrl(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const url = new URL(window.location.href);
    if (url.pathname !== '/auth/callback') return false;
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    return (
      url.searchParams.has('code') ||
      url.searchParams.has('access_token') ||
      hash.has('access_token') ||
      hash.get('type') === 'recovery'
    );
  } catch {
    return false;
  }
}

// Capture recovery intent before foundationClient() constructs the Supabase client.
// Supabase may exchange the callback code and clean the URL before React effects run.
export function capturePasswordRecoveryCallbackIntent(): boolean {
  return isWebAuthCallbackUrl() && hasRecentPasswordRecoveryMarker();
}
export function publicConfig(
  url: string | undefined,
  key: string | undefined,
): boolean {
  if (!url || !key?.startsWith('sb_publishable_')) return false;
  try {
    const parsed = new URL(url);
    return (
      !parsed.username &&
      !parsed.password &&
      (parsed.protocol === 'https:' ||
        (parsed.protocol === 'http:' &&
          /^(localhost|127\.0\.0\.1|10\.0\.2\.2)$/.test(parsed.hostname)))
    );
  } catch {
    return false;
  }
}
export function foundationClient(
  url: string | undefined,
  key: string | undefined,
  storage?: SupportedStorage,
  native = false,
): SupabaseClient<Database> | null {
  if (!publicConfig(url, key)) return null;
  return createClient<Database>(url!, key!, {
    auth: {
      ...(storage ? { storage } : {}),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: !native,
      flowType: 'pkce',
      ...(native ? { lock: processLock } : {}),
    },
  });
}
export function membershipPhase(
  count: number,
): 'onboarding' | 'ready' | 'choose-business' {
  return count === 0 ? 'onboarding' : count === 1 ? 'ready' : 'choose-business';
}
export class Foundation {
  private listeners = new Set<() => void>();
  private generation = 0;
  private recovering = false;
  private logoutRequested = false;
  private snapshot: Snapshot;
  readonly client: SupabaseClient<Database> | null;
  readonly redirectTo: string;
  readonly newRequestId: () => string;
  private readonly initialPasswordRecoveryCallback: boolean;
  constructor(
    client: SupabaseClient<Database> | null,
    redirectTo: string,
    newRequestId: () => string = () => crypto.randomUUID(),
    initialPasswordRecoveryCallback = false,
  ) {
    this.client = client;
    this.redirectTo = redirectTo;
    this.newRequestId = newRequestId;
    this.initialPasswordRecoveryCallback = initialPasswordRecoveryCallback;
    this.snapshot = {
      phase: client ? 'loading' : 'unconfigured',
      locale: 'bn',
      busy: false,
      message: null,
      user: null,
      profile: null,
      tenants: [],
      active: null,
      onboardingName: '',
      request: null,
    };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private patch(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((l) => l());
  }
  private clear(phase: Phase, message: AuthTextKey | null = null) {
    this.patch({
      phase,
      message,
      user: null,
      profile: null,
      active: null,
      tenants: [],
      request: null,
      onboardingName: '',
      busy: false,
    });
  }
  start = () => {
    if (!this.client) return () => {};
    // FoundationApp captures this intent before constructing the Supabase client.
    // The client may exchange the PKCE code and clean the URL before React's effect
    // subscribes to PASSWORD_RECOVERY. A valid Supabase session is still required
    // below before the reset form can render.
    if (this.initialPasswordRecoveryCallback) {
      this.recovering = consumePasswordRecoveryMarker() || this.recovering;
    } else {
      clearPasswordRecoveryMarker();
    }
    let running = true;
    const { data } = this.client.auth.onAuthStateChange((event) => {
      if (!running) return;
      if (event === 'SIGNED_OUT') {
        this.generation++;
        this.recovering = false;
        clearPasswordRecoveryMarker();
        this.clear('signed-out');
      } else {
        if (event === 'PASSWORD_RECOVERY') {
          this.recovering = true;
          clearPasswordRecoveryMarker();
        }
        // Clear synchronously at the event boundary, before deferred SDK work.
        // Otherwise an old in-flight load could briefly restore another account.
        this.generation++;
        this.patch({
          phase: 'loading',
          user: null,
          profile: null,
          active: null,
          tenants: [],
          message: null,
        });
        // Do not await another SDK operation while inside the auth callback lock.
        if (!this.logoutRequested)
          setTimeout(() => {
            if (running) void this.refresh();
          }, 0);
      }
    });
    void this.refresh();
    return () => {
      running = false;
      this.generation++;
      data.subscription.unsubscribe();
    };
  };
  refresh = async () => {
    if (!this.client || this.logoutRequested) return;
    const generation = ++this.generation;
    // Remove old tenant/profile context before any asynchronous session check.
    this.patch({
      phase: 'loading',
      active: null,
      tenants: [],
      user: null,
      profile: null,
      message: null,
    });
    try {
      const session = await this.client.auth.getSession();
      if (generation !== this.generation) return;
      if (session.error) throw session.error;
      if (!session.data.session) {
        this.recovering = false;
        clearPasswordRecoveryMarker();
        this.clear('signed-out');
        return;
      }
      const verified = await this.client.auth.getUser();
      if (generation !== this.generation) return;
      if (verified.error || !verified.data.user) {
        if (verified.error?.status === 401 || verified.error?.status === 403) {
          await this.client.auth.signOut({ scope: 'local' });
          if (generation === this.generation)
            this.clear('signed-out', 'loginError');
          return;
        }
        throw verified.error ?? new Error('Missing user');
      }
      const user = verified.data.user;
      if (this.recovering) {
        this.patch({ phase: 'reset-password', user, busy: false });
        return;
      }
      const [profileResult, memberResult] = await Promise.all([
        this.client
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle(),
        this.client
          .from('business_members')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'ACTIVE')
          .order('created_at'),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (memberResult.error) throw memberResult.error;
      const members = memberResult.data;
      let tenants: Tenant[] = [];
      if (members.length) {
        const [businesses, settings, permissions] = await Promise.all([
          this.client
            .from('businesses')
            .select('*')
            .in(
              'id',
              members.map((m) => m.business_id),
            ),
          this.client
            .from('business_settings')
            .select('*')
            .in(
              'business_id',
              members.map((m) => m.business_id),
            ),
          this.client
            .from('business_member_permissions')
            .select('*')
            .in(
              'member_id',
              members.map((m) => m.id),
            ),
        ]);
        if (businesses.error) throw businesses.error;
        if (settings.error) throw settings.error;
        if (permissions.error) throw permissions.error;
        tenants = members.map((member) => {
          const business = businesses.data.find(
            (b) => b.id === member.business_id,
          );
          const config = settings.data.find(
            (b) => b.business_id === member.business_id,
          );
          if (!business || !config)
            throw new Error('Tenant context incomplete');
          return {
            member,
            business,
            settings: config,
            permissions: permissions.data
              .filter((p) => p.member_id === member.id)
              .map((p) => p.permission),
          };
        });
      }
      if (generation !== this.generation) return;
      const profile = profileResult.data;
      const active = tenants.length === 1 ? tenants[0] : null;
      this.patch({
        phase: membershipPhase(tenants.length),
        user,
        profile,
        tenants,
        active,
        locale:
          profile?.preferred_language ??
          active?.settings.default_language ??
          'bn',
        busy: false,
        onboardingName:
          typeof user.user_metadata.business_name === 'string'
            ? user.user_metadata.business_name.slice(0, 120)
            : '',
      });
    } catch {
      if (generation === this.generation) this.clear('error', 'error');
    }
  };
  selectBusiness = (id: string) => {
    const active = this.snapshot.tenants.find((t) => t.business.id === id);
    if (active)
      this.patch({
        active,
        phase: 'ready',
        locale:
          this.snapshot.profile?.preferred_language ??
          active.settings.default_language ??
          'bn',
      });
  };
  chooseBusiness = () => this.patch({ active: null, phase: 'choose-business' });
  signedOutForm = () => this.clear('signed-out');
  async login(email: string, password: string) {
    if (!this.client || this.snapshot.busy) return;
    this.recovering = false;
    clearPasswordRecoveryMarker();
    this.logoutRequested = false;
    this.patch({ busy: true, message: null });
    try {
      const { error } = await this.client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      await this.refresh();
    } catch {
      this.clear('signed-out', 'loginError');
    }
  }
  async signup(
    email: string,
    password: string,
    displayName: string,
    businessName: string,
  ) {
    if (!this.client || this.snapshot.busy) return;
    this.recovering = false;
    clearPasswordRecoveryMarker();
    this.logoutRequested = false;
    this.patch({ busy: true, message: null, onboardingName: businessName });
    try {
      const { data, error } = await this.client.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: this.redirectTo,
          data: {
            display_name: displayName.trim(),
            business_name: businessName.trim(),
          },
        },
      });
      if (error) throw error;
      if (data.session) await this.refresh();
      else this.clear('verify-email', 'verificationHint');
    } catch {
      this.clear('signed-out', 'signupError');
    }
  }
  async requestRecovery(email: string) {
    if (!this.client || this.snapshot.busy) return;
    writePasswordRecoveryMarker();
    this.patch({ busy: true, message: null });
    try {
      const { error } = await this.client.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: this.redirectTo },
      );
      if (error) throw error;
      this.patch({ busy: false, message: 'resetRequested' });
    } catch {
      clearPasswordRecoveryMarker();
      this.patch({ busy: false, message: 'recoveryError' });
    }
  }
  async setPassword(password: string) {
    if (
      !this.client ||
      this.snapshot.phase !== 'reset-password' ||
      this.snapshot.busy
    )
      return;
    this.patch({ busy: true, message: null });
    try {
      const { error } = await this.client.auth.updateUser({ password });
      if (error) throw error;
      this.recovering = false;
      clearPasswordRecoveryMarker();
      await this.logout();
      if (this.getSnapshot().phase === 'signed-out')
        this.patch({ message: 'resetDone' });
    } catch {
      this.patch({ busy: false, message: 'error' });
    }
  }
  async logout() {
    if (!this.client) return;
    this.logoutRequested = true;
    this.generation++;
    this.recovering = false;
    clearPasswordRecoveryMarker();
    this.clear('signed-out');
    try {
      const { error } = await this.client.auth.signOut({ scope: 'local' });
      if (error) throw error;
    } catch {
      this.patch({ phase: 'error', message: 'logoutError' });
    }
  }
  async setLocale(locale: Locale) {
    if (this.snapshot.busy) return;
    this.patch({ locale });
    if (!this.client || !this.snapshot.user) return;
    const generation = this.generation;
    this.patch({ busy: true });
    try {
      const { data, error } = await this.client
        .from('profiles')
        .update({ preferred_language: locale })
        .eq('id', this.snapshot.user.id)
        .select()
        .single();
      if (generation !== this.generation) return;
      if (error) throw error;
      this.patch({ profile: data, message: null, busy: false });
    } catch {
      if (generation === this.generation)
        this.patch({ message: 'preferenceError', busy: false });
    }
  }
  async onboard(input: {
    name: string;
    displayName: string;
    phone: string;
    address: string;
  }) {
    if (
      !this.client ||
      this.snapshot.busy ||
      this.snapshot.phase !== 'onboarding'
    )
      return;
    if (
      !input.name.trim() ||
      input.name.trim().length > 120 ||
      !input.displayName.trim() ||
      input.displayName.trim().length > 100 ||
      input.phone.length > 30 ||
      input.address.length > 500
    ) {
      this.patch({ message: 'signupError' });
      return;
    }
    // Freeze the payload/key through an uncertain response and retries. No new key
    // until the current outcome is recovered; reload queries membership first.
    const request = this.snapshot.request ?? {
      p_request_id: this.newRequestId(),
      p_business_name: input.name.trim(),
      p_display_name: input.displayName.trim(),
      p_phone: input.phone.trim() || null,
      p_address: input.address.trim() || null,
    };
    this.patch({ request, busy: true, message: null });
    try {
      const { error } = await this.client.rpc(
        'create_initial_business',
        request,
      );
      if (error) throw error;
      this.patch({ request: null });
      await this.refresh();
    } catch {
      this.patch({ busy: false, message: 'uncertain' });
    }
  }
  async handleNativeLink(url: string) {
    if (!this.client) return;
    try {
      const parsed = new URL(url);
      if (
        parsed.protocol !== 'minierp:' ||
        parsed.hostname !== 'auth' ||
        parsed.pathname !== '/callback'
      )
        return;
      const code = parsed.searchParams.get('code');
      if (!code) {
        this.clear('error', 'error');
        return;
      }
      const { error } = await this.client.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } catch {
      this.clear('error', 'error');
    }
    // Auth events handle both normal confirmation and PASSWORD_RECOVERY.
  }
}
