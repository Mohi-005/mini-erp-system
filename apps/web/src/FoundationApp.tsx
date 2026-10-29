import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react';
import {
  Foundation,
  foundationClient,
  authLabel,
  capturePasswordRecoveryCallbackIntent,
  type Snapshot,
} from '@mini-erp/shared/auth';
import DemoApp from './App';
import MasterDataWorkspace from './MasterDataWorkspace';
import InventoryWorkspace from './InventoryWorkspace';
import SalesWorkspace from './SalesWorkspace';
import { translations } from '@mini-erp/shared';

// Capture recovery callback intent before Supabase processes and cleans the URL.
const initialPasswordRecoveryCallback = capturePasswordRecoveryCallbackIntent();

const client = foundationClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);

const foundation = new Foundation(
  client,
  `${location.origin}/auth/callback`,
  undefined,
  initialPasswordRecoveryCallback,
);

function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {visible ? (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c5 0 8.5 4.1 9.5 7-.4 1.1-1.3 2.5-2.6 3.7" />
          <path d="M6.2 6.2C4.1 7.6 2.9 9.6 2.5 12c1 2.9 4.5 7 9.5 7 1.2 0 2.4-.3 3.4-.7" />
        </>
      ) : (
        <>
          <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

function AuthForm({ state }: { state: Snapshot }) {
  const [mode, setMode] = useState<'login' | 'signup' | 'recovery'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);

  const a = (key: Parameters<typeof authLabel>[1]) =>
    authLabel(state.locale, key);

  const disabled = state.busy || state.phase === 'unconfigured';

  const passwordMismatch =
    mode === 'signup' &&
    confirmTouched &&
    confirmPassword.length > 0 &&
    password !== confirmPassword;

  function changeMode(nextMode: 'login' | 'signup' | 'recovery') {
    setMode(nextMode);
    setPassword('');
    setConfirmPassword('');
    setConfirmTouched(false);
    setShowPassword(false);
    setShowConfirmPassword(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled) return;

    if (mode === 'signup' && password !== confirmPassword) {
      setConfirmTouched(true);
      return;
    }

    if (mode === 'signup') {
      void foundation.signup(email, password, displayName, businessName);
    } else if (mode === 'recovery') {
      void foundation.requestRecovery(email);
    } else {
      void foundation.login(email, password);
    }

    setPassword('');
    setConfirmPassword('');
    setConfirmTouched(false);
    setShowPassword(false);
    setShowConfirmPassword(false);
  }

  return (
    <>
      <h2>{a(mode)}</h2>

      <form onSubmit={submit} className="auth-form">
        {mode === 'signup' && (
          <>
            <label className="field">
              <span>{a('displayName')}</span>
              <input
                autoComplete="name"
                required
                maxLength={100}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>

            <label className="field">
              <span>{a('businessName')}</span>
              <input
                autoComplete="organization"
                required
                maxLength={120}
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
              />
            </label>
          </>
        )}

        <label className="field">
          <span>{a('email')}</span>
          <input
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        {mode !== 'recovery' && (
          <div className="field">
            <label htmlFor="auth-password">{a('password')}</label>

            <div className="password-input-wrap">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={
                  mode === 'signup' ? 'new-password' : 'current-password'
                }
                required
                minLength={mode === 'signup' ? 8 : 1}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />

              <button
                type="button"
                className="password-visibility"
                aria-label={a(showPassword ? 'hidePassword' : 'showPassword')}
                aria-pressed={showPassword}
                aria-controls="auth-password"
                title={a(showPassword ? 'hidePassword' : 'showPassword')}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                <PasswordVisibilityIcon visible={showPassword} />
              </button>
            </div>
          </div>
        )}

        {mode === 'signup' && <p>{a('passwordHint')}</p>}

        {mode === 'signup' && (
          <div className="field">
            <label htmlFor="auth-confirm-password">
              {a('confirmPassword')}
            </label>

            <div className="password-input-wrap">
              <input
                id="auth-confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={8}
                aria-invalid={passwordMismatch}
                aria-describedby={
                  passwordMismatch ? 'auth-confirm-password-error' : undefined
                }
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setConfirmTouched(true);
                }}
              />

              <button
                type="button"
                className="password-visibility"
                aria-label={a(
                  showConfirmPassword ? 'hidePassword' : 'showPassword',
                )}
                aria-pressed={showConfirmPassword}
                aria-controls="auth-confirm-password"
                title={a(showConfirmPassword ? 'hidePassword' : 'showPassword')}
                onClick={() => setShowConfirmPassword((visible) => !visible)}
              >
                <PasswordVisibilityIcon visible={showConfirmPassword} />
              </button>
            </div>

            {passwordMismatch && (
              <p
                className="field-error"
                id="auth-confirm-password-error"
                role="alert"
              >
                {a('passwordMismatch')}
              </p>
            )}
          </div>
        )}

        <button className="button auth-primary" disabled={disabled}>
          {a(
            state.busy
              ? 'waiting'
              : mode === 'recovery'
                ? 'requestReset'
                : mode,
          )}
        </button>
      </form>

      <div className="row auth-links">
        {mode !== 'login' && (
          <button
            type="button"
            className="button"
            disabled={state.busy}
            onClick={() => changeMode('login')}
          >
            {a('login')}
          </button>
        )}

        {mode !== 'signup' && (
          <button
            type="button"
            className="button"
            disabled={state.busy}
            onClick={() => changeMode('signup')}
          >
            {a('signup')}
          </button>
        )}

        {mode !== 'recovery' && (
          <button
            type="button"
            className="button"
            disabled={state.busy}
            onClick={() => changeMode('recovery')}
          >
            {a('forgot')}
          </button>
        )}
      </div>
    </>
  );
}

function Onboarding({ state }: { state: Snapshot }) {
  const [name, setName] = useState(state.onboardingName);
  const [displayName, setDisplayName] = useState(
    state.profile?.display_name ?? '',
  );
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  const a = (key: Parameters<typeof authLabel>[1]) =>
    authLabel(state.locale, key);

  return (
    <form
      className="auth-form"
      onSubmit={(event) => {
        event.preventDefault();
        void foundation.onboard({ name, displayName, phone, address });
      }}
    >
      <h2>{a('onboarding')}</h2>

      <fieldset disabled={state.busy || !!state.request}>
        <label className="field">
          <span>{a('businessName')}</span>
          <input
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <label className="field">
          <span>{a('displayName')}</span>
          <input
            required
            maxLength={100}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>

        <label className="field">
          <span>{a('phone')}</span>
          <input
            type="tel"
            autoComplete="tel"
            placeholder="+880"
            maxLength={30}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </label>

        <label className="field">
          <span>{a('address')}</span>
          <input
            autoComplete="street-address"
            maxLength={500}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </label>
      </fieldset>

      <p>{a('securityNote')}</p>

      <button className="button auth-primary" disabled={state.busy}>
        {a(
          state.busy
            ? 'waiting'
            : state.request
              ? 'retryOnboarding'
              : 'createBusiness',
        )}
      </button>
    </form>
  );
}

function ResetPassword({ state }: { state: Snapshot }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);

  const a = (key: Parameters<typeof authLabel>[1]) =>
    authLabel(state.locale, key);

  const passwordMismatch =
    confirmTouched &&
    confirmPassword.length > 0 &&
    password !== confirmPassword;

  function submit(event: FormEvent) {
    event.preventDefault();

    if (state.busy) return;

    if (
      password.length < 8 ||
      confirmPassword.length === 0 ||
      password !== confirmPassword
    ) {
      setConfirmTouched(true);
      return;
    }

    void foundation.setPassword(password);
    setPassword('');
    setConfirmPassword('');
    setConfirmTouched(false);
    setShowPassword(false);
    setShowConfirmPassword(false);
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="reset-new-password">{a('newPassword')}</label>

        <div className="password-input-wrap">
          <input
            id="reset-new-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          <button
            type="button"
            className="password-visibility"
            aria-label={a(showPassword ? 'hidePassword' : 'showPassword')}
            aria-pressed={showPassword}
            aria-controls="reset-new-password"
            title={a(showPassword ? 'hidePassword' : 'showPassword')}
            disabled={state.busy}
            onClick={() => setShowPassword((visible) => !visible)}
          >
            <PasswordVisibilityIcon visible={showPassword} />
          </button>
        </div>
      </div>

      <div className="field">
        <label htmlFor="reset-confirm-password">{a('confirmPassword')}</label>

        <div className="password-input-wrap">
          <input
            id="reset-confirm-password"
            type={showConfirmPassword ? 'text' : 'password'}
            autoComplete="new-password"
            minLength={8}
            required
            aria-invalid={passwordMismatch}
            aria-describedby={
              passwordMismatch ? 'reset-confirm-password-error' : undefined
            }
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setConfirmTouched(true);
            }}
          />

          <button
            type="button"
            className="password-visibility"
            aria-label={a(
              showConfirmPassword ? 'hidePassword' : 'showPassword',
            )}
            aria-pressed={showConfirmPassword}
            aria-controls="reset-confirm-password"
            title={a(showConfirmPassword ? 'hidePassword' : 'showPassword')}
            disabled={state.busy}
            onClick={() => setShowConfirmPassword((visible) => !visible)}
          >
            <PasswordVisibilityIcon visible={showConfirmPassword} />
          </button>
        </div>

        {passwordMismatch && (
          <p
            className="field-error"
            id="reset-confirm-password-error"
            role="alert"
          >
            {a('passwordMismatch')}
          </p>
        )}
      </div>

      <button className="button" disabled={state.busy}>
        {a('resetPassword')}
      </button>
    </form>
  );
}

export default function FoundationApp() {
  const state = useSyncExternalStore(
    foundation.subscribe,
    foundation.getSnapshot,
  );

  const [demo, setDemo] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [salesOpen, setSalesOpen] = useState(false);
  const [demoLocale, setDemoLocale] = useState<Snapshot['locale']>('bn');

  const a = (key: Parameters<typeof authLabel>[1]) =>
    authLabel(state.locale, key);

  useEffect(() => foundation.start(), []);

  useEffect(() => {
    if (!demo) {
      document.documentElement.lang = state.locale;
      document.title = translations[state.locale].appName;
    }
  }, [state.locale, demo]);

  useEffect(() => {
    if (state.phase === 'ready') return;

    // Defer the workspace reset until after this effect's synchronous phase.
    // This avoids cascading renders while still clearing stale routes on logout
    // or when the authenticated business context is no longer ready.
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setInventoryOpen(false);
      setSalesOpen(false);
    });

    return () => {
      active = false;
    };
  }, [state.phase]);

  if (state.phase === 'ready' && state.active && !demo) {
    const onLogout = () => {
      setInventoryOpen(false);
      setSalesOpen(false);
      void foundation.logout();
    };
    const onSwitchBusiness = () => {
      setInventoryOpen(false);
      setSalesOpen(false);
      foundation.chooseBusiness();
    };
    const onToggleLocale = () => {
      void foundation.setLocale(state.locale === 'bn' ? 'en' : 'bn');
    };
    const onOpenDemo = () => {
      setDemoLocale(state.locale);
      setDemo(true);
    };

    if (salesOpen) {
      return (
        <SalesWorkspace
          client={foundation.client}
          tenant={state.active}
          locale={state.locale}
          displayName={state.profile?.display_name ?? ''}
          email={state.user?.email ?? ''}
          canSwitchBusiness={state.tenants.length > 1}
          onLogout={onLogout}
          onSwitchBusiness={onSwitchBusiness}
          onToggleLocale={onToggleLocale}
          onOpenDemo={onOpenDemo}
          onBackToMasterData={() => setSalesOpen(false)}
        />
      );
    }

    if (inventoryOpen) {
      return (
        <InventoryWorkspace
          client={foundation.client}
          tenant={state.active}
          locale={state.locale}
          displayName={state.profile?.display_name ?? ''}
          email={state.user?.email ?? ''}
          canSwitchBusiness={state.tenants.length > 1}
          onLogout={onLogout}
          onSwitchBusiness={onSwitchBusiness}
          onToggleLocale={onToggleLocale}
          onOpenDemo={onOpenDemo}
          onBackToMasterData={() => setInventoryOpen(false)}
        />
      );
    }

    return (
      <MasterDataWorkspace
        client={foundation.client}
        tenant={state.active}
        locale={state.locale}
        displayName={state.profile?.display_name ?? ''}
        email={state.user?.email ?? ''}
        canSwitchBusiness={state.tenants.length > 1}
        onLogout={onLogout}
        onSwitchBusiness={onSwitchBusiness}
        onToggleLocale={onToggleLocale}
        onOpenDemo={onOpenDemo}
        onOpenInventory={() => {
          setSalesOpen(false);
          setInventoryOpen(true);
        }}
        onOpenSales={() => {
          setInventoryOpen(false);
          setSalesOpen(true);
        }}
        onSettingsSaved={() => {
          void foundation.refresh();
        }}
      />
    );
  }

  if (demo) {
    return (
      <>
        <div className="account-boundary">
          <span>{authLabel(demoLocale, 'demoBoundary')}</span>
          <button className="button" onClick={() => setDemo(false)}>
            {authLabel(demoLocale, 'back')}
          </button>
        </div>

        <DemoApp initialLocale={demoLocale} onLocaleChange={setDemoLocale} />
      </>
    );
  }

  return (
    <div className="auth-shell">
      <header className="auth-header">
        <strong className="auth-brand">
          হ · {translations[state.locale].appName}
        </strong>

        <button
          className="button"
          onClick={() =>
            void foundation.setLocale(state.locale === 'bn' ? 'en' : 'bn')
          }
        >
          {state.locale === 'bn' ? 'English' : 'বাংলা'}
        </button>
      </header>

      <main className="auth-card">
        <h1>{a(state.phase === 'ready' ? 'ready' : 'welcome')}</h1>

        {state.message && (
          <p className="notice" role="status">
            {a(state.message)}
          </p>
        )}

        {state.phase === 'loading' && <p role="status">{a('loading')}</p>}

        {state.phase === 'unconfigured' && (
          <div className="notice">
            <h2>{a('config')}</h2>
            <p>{a('configHint')}</p>
          </div>
        )}

        {(state.phase === 'signed-out' || state.phase === 'unconfigured') && (
          <AuthForm state={state} />
        )}

        {state.phase === 'verify-email' && (
          <>
            <h2>{a('verify')}</h2>
            <button className="button" onClick={foundation.signedOutForm}>
              {a('login')}
            </button>
          </>
        )}

        {state.phase === 'reset-password' && <ResetPassword state={state} />}

        {state.phase === 'onboarding' && (
          <Onboarding state={state} key={state.user?.id} />
        )}

        {state.phase === 'choose-business' && (
          <section>
            <h2>{a('selectBusiness')}</h2>

            <div className="auth-form">
              {state.tenants.map((tenant) => (
                <button
                  className="button"
                  key={tenant.business.id}
                  onClick={() => foundation.selectBusiness(tenant.business.id)}
                >
                  {tenant.business.name}
                </button>
              ))}
            </div>
          </section>
        )}

        {state.phase === 'ready' && state.active && (
          <section>
            <h2>{state.active.business.name}</h2>
            <p>
              {state.profile?.display_name} · {state.user?.email}
            </p>
            <p>
              <span className="tag">
                {a(state.active.member.role === 'OWNER' ? 'owner' : 'staff')}
              </span>{' '}
              · BDT · Asia/Dhaka
            </p>
            <p className="notice">{a('foundationOnly')}</p>

            {state.active.member.role === 'STAFF' &&
              !state.active.permissions.length && <p>{a('noPermissions')}</p>}

            {state.tenants.length > 1 && (
              <button className="button" onClick={foundation.chooseBusiness}>
                {a('switchBusiness')}
              </button>
            )}
          </section>
        )}

        {state.phase === 'error' && (
          <button
            className="button"
            onClick={() =>
              void (state.message === 'logoutError'
                ? foundation.logout()
                : foundation.refresh())
            }
          >
            {a('retry')}
          </button>
        )}

        {state.user && (
          <button
            className="button"
            disabled={state.busy}
            onClick={() => void foundation.logout()}
          >
            {a('logout')}
          </button>
        )}

        {state.phase !== 'loading' && (
          <div className="auth-demo">
            <button
              className="button"
              onClick={() => {
                setDemoLocale(state.locale);
                setDemo(true);
              }}
            >
              {a('demo')}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
