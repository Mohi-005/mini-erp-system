import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  Foundation,
  foundationClient,
  authLabel,
  type AuthTextKey,
  type Snapshot,
} from '@mini-erp/shared/auth';
import { tokens, typography, translations } from '@mini-erp/shared';
import DemoApp from './App';

const client = foundationClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  AsyncStorage,
  true,
);
const foundation = new Foundation(
  client,
  'minierp://auth/callback',
  Crypto.randomUUID,
);
function Action({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        disabled && s.disabled,
        pressed && s.pressed,
      ]}
    >
      <Text style={s.buttonText}>{label}</Text>
    </Pressable>
  );
}
function Forms({ state }: { state: Snapshot }) {
  const [mode, setMode] = useState<'login' | 'signup' | 'recovery'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState(state.onboardingName);
  const [displayName, setDisplayName] = useState(
    state.profile?.display_name ?? '',
  );
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [invalid, setInvalid] = useState(false);
  const a = (key: AuthTextKey) => authLabel(state.locale, key);
  const onboarding = state.phase === 'onboarding';
  const reset = state.phase === 'reset-password';
  const locked = state.busy || !!state.request;
  function field(
    key: AuthTextKey,
    value: string,
    change: (v: string) => void,
    secure = false,
  ) {
    return (
      <View style={s.field} key={key}>
        <Text style={s.body}>{a(key)}</Text>
        <TextInput
          accessibilityLabel={a(key)}
          style={s.input}
          value={value}
          onChangeText={change}
          editable={!locked}
          secureTextEntry={secure}
          autoCapitalize={key === 'email' || secure ? 'none' : 'sentences'}
          autoCorrect={!secure && key !== 'email'}
          keyboardType={
            key === 'email'
              ? 'email-address'
              : key === 'phone'
                ? 'phone-pad'
                : 'default'
          }
          autoComplete={
            secure
              ? mode === 'signup' || reset
                ? 'new-password'
                : 'current-password'
              : key === 'email'
                ? 'email'
                : 'off'
          }
          maxLength={
            key === 'email'
              ? 254
              : key === 'phone'
                ? 30
                : key === 'address'
                  ? 500
                  : key === 'businessName'
                    ? 120
                    : secure
                      ? 128
                      : 100
          }
        />
      </View>
    );
  }
  function submit() {
    setInvalid(false);
    if (onboarding) {
      if (!state.request && (!name.trim() || !displayName.trim())) {
        setInvalid(true);
        return;
      }
      void foundation.onboard({ name, displayName, phone, address });
      return;
    }
    if (reset) {
      if (password.length < 8) {
        setInvalid(true);
        return;
      }
      void foundation.setPassword(password);
      setPassword('');
      return;
    }
    if (
      !email.includes('@') ||
      (mode !== 'recovery' && !password) ||
      (mode === 'signup' &&
        (password.length < 8 || !name.trim() || !displayName.trim()))
    ) {
      setInvalid(true);
      return;
    }
    if (mode === 'recovery') void foundation.requestRecovery(email);
    else if (mode === 'signup')
      void foundation.signup(email, password, displayName, name);
    else void foundation.login(email, password);
    setPassword('');
  }
  return (
    <>
      <Text accessibilityRole="header" style={s.subtitle}>
        {a(onboarding ? 'onboarding' : reset ? 'resetPassword' : mode)}
      </Text>
      {(onboarding || mode === 'signup') && !reset && (
        <>
          {field('displayName', displayName, setDisplayName)}
          {field('businessName', name, setName)}
        </>
      )}
      {onboarding ? (
        <>
          {field('phone', phone, setPhone)}
          {field('address', address, setAddress)}
          <Text style={s.body}>{a('securityNote')}</Text>
        </>
      ) : (
        <>
          {!reset && field('email', email, setEmail)}
          {(reset || mode !== 'recovery') &&
            field(
              reset ? 'newPassword' : 'password',
              password,
              setPassword,
              true,
            )}
        </>
      )}
      {(mode === 'signup' || reset) && (
        <Text style={s.body}>{a('passwordHint')}</Text>
      )}
      {invalid && (
        <Text accessibilityRole="alert" style={s.body}>
          {a('loginError')}
        </Text>
      )}
      <Action
        label={a(
          state.busy
            ? 'waiting'
            : onboarding
              ? state.request
                ? 'retryOnboarding'
                : 'createBusiness'
              : reset
                ? 'resetPassword'
                : mode === 'recovery'
                  ? 'requestReset'
                  : mode,
        )}
        onPress={submit}
        disabled={state.busy || state.phase === 'unconfigured'}
      />
      {!onboarding && !reset && (
        <View style={s.links}>
          {(['login', 'signup', 'recovery'] as const)
            .filter((m) => m !== mode)
            .map((m) => (
              <Action
                key={m}
                label={a(m === 'recovery' ? 'forgot' : m)}
                disabled={state.busy}
                onPress={() => {
                  setMode(m);
                  setPassword('');
                  setInvalid(false);
                }}
              />
            ))}
        </View>
      )}
    </>
  );
}
export default function FoundationApp() {
  const state = useSyncExternalStore(
    foundation.subscribe,
    foundation.getSnapshot,
  );
  const [demo, setDemo] = useState(false);
  const [demoLocale, setDemoLocale] = useState<Snapshot['locale']>('bn');
  const a = (key: AuthTextKey) => authLabel(state.locale, key);
  useEffect(() => {
    const stop = foundation.start();
    const onState = (status: string | null | undefined) => {
      if (status === 'active') {
        client?.auth.startAutoRefresh();
        void foundation.refresh();
      } else client?.auth.stopAutoRefresh();
    };
    onState(AppState.currentState);
    const lifecycle = AppState.addEventListener('change', onState);
    const links = Linking.addEventListener('url', ({ url }) => {
      void foundation.handleNativeLink(url);
    });
    void Linking.getInitialURL().then((url) => {
      if (url) void foundation.handleNativeLink(url);
    });
    return () => {
      stop();
      lifecycle.remove();
      links.remove();
      client?.auth.stopAutoRefresh();
    };
  }, []);
  if (demo)
    return (
      <View style={s.fill}>
        <View style={s.boundary}>
          <Text style={s.body}>{authLabel(demoLocale, 'demoBoundary')}</Text>
          <Action
            label={authLabel(demoLocale, 'back')}
            onPress={() => setDemo(false)}
          />
        </View>
        <DemoApp initialLocale={demoLocale} onLocaleChange={setDemoLocale} />
      </View>
    );
  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.fill}>
        <ScrollView
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Text style={s.brand}>হ · {translations[state.locale].appName}</Text>
          <Action
            label={state.locale === 'bn' ? 'English' : 'বাংলা'}
            onPress={() =>
              void foundation.setLocale(state.locale === 'bn' ? 'en' : 'bn')
            }
          />
          <Text accessibilityRole="header" style={s.title}>
            {a(state.phase === 'ready' ? 'ready' : 'welcome')}
          </Text>
          {state.message && (
            <Text accessibilityRole="alert" style={s.notice}>
              {a(state.message)}
            </Text>
          )}
          {state.phase === 'loading' && (
            <Text style={s.body}>{a('loading')}</Text>
          )}
          {state.phase === 'unconfigured' && (
            <View style={s.card}>
              <Text style={s.subtitle}>{a('config')}</Text>
              <Text style={s.body}>{a('configHint')}</Text>
            </View>
          )}
          {[
            'unconfigured',
            'signed-out',
            'onboarding',
            'reset-password',
          ].includes(state.phase) && (
            <View style={s.card}>
              <Forms
                key={`${state.phase}:${state.user?.id ?? ''}`}
                state={state}
              />
            </View>
          )}
          {state.phase === 'verify-email' && (
            <View style={s.card}>
              <Text style={s.subtitle}>{a('verify')}</Text>
              <Action label={a('login')} onPress={foundation.signedOutForm} />
            </View>
          )}
          {state.phase === 'choose-business' && (
            <View style={s.card}>
              <Text style={s.subtitle}>{a('selectBusiness')}</Text>
              {state.tenants.map((t) => (
                <Action
                  key={t.business.id}
                  label={t.business.name}
                  onPress={() => foundation.selectBusiness(t.business.id)}
                />
              ))}
            </View>
          )}
          {state.phase === 'ready' && state.active && (
            <View style={s.card}>
              <Text style={s.subtitle}>{state.active.business.name}</Text>
              <Text style={s.body}>{state.profile?.display_name}</Text>
              <Text style={s.body}>{state.user?.email}</Text>
              <Text style={s.body}>
                {a(state.active.member.role === 'OWNER' ? 'owner' : 'staff')} ·
                BDT · Asia/Dhaka
              </Text>
              <Text style={s.notice}>{a('foundationOnly')}</Text>
              {state.active.member.role === 'STAFF' &&
                !state.active.permissions.length && (
                  <Text style={s.body}>{a('noPermissions')}</Text>
                )}
              {state.tenants.length > 1 && (
                <Action
                  label={a('switchBusiness')}
                  onPress={foundation.chooseBusiness}
                />
              )}
            </View>
          )}
          {state.phase === 'error' && (
            <Action
              label={a('retry')}
              onPress={() =>
                void (state.message === 'logoutError'
                  ? foundation.logout()
                  : foundation.refresh())
              }
            />
          )}
          {state.user && (
            <Action
              label={a('logout')}
              disabled={state.busy}
              onPress={() => void foundation.logout()}
            />
          )}
          {state.phase !== 'loading' && (
            <Action
              label={a('demo')}
              onPress={() => {
                setDemoLocale(state.locale);
                setDemo(true);
              }}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: tokens.color.background },
  content: { padding: 20, gap: 18, paddingBottom: 48 },
  card: {
    padding: 20,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: 16,
    backgroundColor: 'white',
    gap: 16,
  },
  brand: {
    fontSize: typography.figure,
    fontWeight: '700',
    color: tokens.color.accent,
  },
  title: {
    fontSize: typography.page,
    lineHeight: 44,
    color: tokens.color.ink,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: typography.section,
    lineHeight: 34,
    color: tokens.color.ink,
    fontWeight: '700',
  },
  body: {
    fontSize: typography.body,
    lineHeight: 26,
    color: tokens.color.ink,
    flexShrink: 1,
  },
  notice: {
    backgroundColor: tokens.color.mint,
    padding: 16,
    borderRadius: 10,
    fontSize: typography.body,
    lineHeight: 26,
    color: tokens.color.ink,
  },
  button: {
    minHeight: 50,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tokens.color.accent,
    backgroundColor: 'white',
  },
  buttonText: {
    fontSize: typography.body,
    lineHeight: 26,
    color: tokens.color.accent,
    fontWeight: '700',
    textAlign: 'center',
  },
  disabled: { opacity: 0.5 },
  pressed: { backgroundColor: tokens.color.mint },
  field: { gap: 8 },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: 12,
    borderRadius: 8,
    fontSize: typography.body,
    color: tokens.color.ink,
  },
  links: { gap: 12 },
  boundary: { padding: 12, gap: 8, backgroundColor: '#fff5dd' },
});
