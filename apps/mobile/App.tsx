import { useEffect, useState, type PropsWithChildren } from 'react';
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  modules,
  primaryNavigation,
  tokens,
  typography,
  translations,
  visual,
  type Locale,
  type RouteId,
} from '@mini-erp/shared';
import {
  products,
  shops,
  transactions,
  expenses,
  dashboard,
} from '@mini-erp/shared/demo';

function Action({
  children,
  onPress,
  selected = false,
}: PropsWithChildren<{ onPress: () => void; selected?: boolean }>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        selected && s.selected,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={s.buttonText}>{children}</Text>
    </Pressable>
  );
}
function Panel({ children }: PropsWithChildren) {
  return <View style={s.card}>{children}</View>;
}
export default function App({
  initialLocale = 'bn',
  onLocaleChange,
}: {
  initialLocale?: Locale;
  onLocaleChange?: (locale: Locale) => void;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [route, setRoute] = useState<RouteId>('home');
  const t = translations[locale];
  const v = (key: Parameters<typeof visual>[1]) => visual(locale, key);
  const money = (value: number) =>
    `৳${new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-BD').format(value)}`;
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (route === 'home') return false;
      setRoute('home');
      return true;
    });
    return () => handler.remove();
  }, [route]);
  const records = (
    <Panel>
      <Text style={s.subtitle}>{v('recent')}</Text>
      {transactions.map((r) => (
        <View style={s.record} key={r.id}>
          <Text style={s.body}>{r.ref}</Text>
          <Text style={s.subtitle}>{r[locale]}</Text>
          <Text style={s.body}>
            {r.date} · {money(r.total)}
          </Text>
        </View>
      ))}
    </Panel>
  );
  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.safe}>
        <ScrollView
          key={route}
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.header}>
            <Text style={s.brand}>হ {t.appName}</Text>
            <Action
              onPress={() => {
                const next = locale === 'bn' ? 'en' : 'bn';
                setLocale(next);
                onLocaleChange?.(next);
              }}
            >
              {locale === 'bn' ? 'English' : 'বাংলা'}
            </Action>
          </View>
          <Panel>
            <Text style={s.subtitle}>{v('business')}</Text>
            <Text style={s.body}>{v('location')}</Text>
          </Panel>
          <Text style={s.demo}>{v('demoNote')}</Text>
          <Text accessibilityRole="header" style={s.title}>
            {route === 'home' ? v('greeting') : t[route]}
          </Text>
          {route === 'home' ? (
            <>
              <View style={s.welcome}>
                <Text style={s.welcomeTitle}>{v('welcome')}</Text>
                <Text style={s.welcomeBody}>{v('subtitle')}</Text>
                <Action onPress={() => setRoute('sales')}>{v('sale')}</Action>
                <Action onPress={() => setRoute('purchases')}>
                  {v('buy')}
                </Action>
              </View>
              <Text style={s.body}>{v('sampleDate')}</Text>
              {(
                [
                  ['salesToday', dashboard.sales],
                  ['profit', dashboard.profit],
                  ['due', dashboard.due],
                  ['expense', dashboard.expense],
                ] as const
              ).map(([key, value]) => (
                <Panel key={key}>
                  <Text style={s.body}>{v(key)}</Text>
                  <Text style={s.figure}>{money(value)}</Text>
                </Panel>
              ))}
              {records}
            </>
          ) : route === 'more' ? (
            <Panel>
              {modules
                .filter(
                  (item) =>
                    !primaryNavigation.some((primary) => primary === item),
                )
                .map((item) => (
                  <Action key={item} onPress={() => setRoute(item)}>
                    {t[item]}
                  </Action>
                ))}
            </Panel>
          ) : ['sales', 'purchases', 'products'].includes(route) ? (
            <>
              <Text style={s.body}>{v('basketHint')}</Text>
              {products.map((p) => (
                <Panel key={p.id}>
                  <Text style={s.subtitle}>
                    {p.icon} {p[locale]}
                  </Text>
                  <Text style={s.body}>
                    {money(route === 'purchases' ? p.buy : p.price)} · {p.stock}{' '}
                    {locale === 'bn'
                      ? p.unit === 'kg'
                        ? 'কেজি'
                        : 'লিটার'
                      : p.unit}
                  </Text>
                </Panel>
              ))}
              {route !== 'products' && (
                <Panel>
                  <Text style={s.subtitle}>
                    {v(route === 'sales' ? 'basket' : 'purchaseBasket')}
                  </Text>
                  <Text style={s.body}>
                    {transactions[route === 'sales' ? 0 : 2][locale]}
                  </Text>
                  <Text style={s.figure}>
                    {money(route === 'sales' ? 1400 : 3000)}
                  </Text>
                  <Text style={s.body}>{v('review')}</Text>
                </Panel>
              )}
            </>
          ) : ['shops', 'customers', 'suppliers'].includes(route) ? (
            <>
              {shops
                .filter((shop) =>
                  route === 'suppliers'
                    ? shop.id === 'demo-shop-karim'
                    : route === 'customers'
                      ? !shop.archived
                      : true,
                )
                .map((shop) => (
                  <Panel key={shop.id}>
                    <Text style={s.subtitle}>{shop[locale]}</Text>
                    <Text style={s.body}>{shop.code}</Text>
                    <Text style={s.body}>
                      {v('remaining')}:{' '}
                      {money(
                        route === 'suppliers'
                          ? dashboard.supplierDue
                          : shop.due,
                      )}
                    </Text>
                    <Text style={s.body}>
                      {v(shop.archived ? 'restore' : 'archive')}
                    </Text>
                  </Panel>
                ))}
            </>
          ) : route === 'expenses' ? (
            <>
              {expenses.map((expense) => (
                <Panel key={expense.id}>
                  <Text style={s.subtitle}>{v(expense.category)}</Text>
                  <Text style={s.body}>
                    {expense.date} · {v(expense.method)}
                  </Text>
                  <Text style={s.figure}>{money(expense.amount)}</Text>
                </Panel>
              ))}
            </>
          ) : route === 'estimator' ? (
            <>
              <Text style={s.body}>{v('estimateUnavailable')}</Text>
              <Panel>
                <Text style={s.subtitle}>{v('plan')}</Text>
                <Text style={s.body}>{v('quantity')}: 500</Text>
                <Text style={s.body}>
                  {v('buyPrice')}: {money(60)}
                </Text>
                <Text style={s.body}>
                  {v('price')}: {money(70)}
                </Text>
                <Text style={s.body}>
                  {v('transport')}: {money(1000)}
                </Text>
              </Panel>
              <View style={s.welcome}>
                <Text style={s.welcomeTitle}>{v('expectedProfit')}</Text>
                <Text style={s.welcomeTitle}>{money(4000)}</Text>
              </View>
            </>
          ) : route === 'invoices' || route === 'reports' ? (
            records
          ) : route === 'settings' ? (
            <Panel>
              <Text style={s.subtitle}>{v('language')}</Text>
              <Action onPress={() => setLocale(locale === 'bn' ? 'en' : 'bn')}>
                {locale === 'bn' ? 'English' : 'বাংলা'}
              </Action>
              <Text style={s.body}>{v('roleNote')}</Text>
            </Panel>
          ) : (
            <Panel>
              <Text style={s.subtitle}>{t.notReady}</Text>
              <Text style={s.body}>{t.notReadyBody}</Text>
            </Panel>
          )}
          {route !== 'home' && (
            <Action onPress={() => setRoute('home')}>{t.back}</Action>
          )}
          <Text style={s.supporting}>{v('demoFooter')}</Text>
          <View style={s.navigation}>
            {primaryNavigation.map((item) => (
              <Action
                selected={route === item}
                key={item}
                onPress={() => setRoute(item)}
              >
                {item === 'products' ? t.stock : t[item]}
              </Action>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const c = tokens.color;
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  content: { padding: 20, gap: 16, paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  brand: { color: c.accent, fontSize: typography.page, fontWeight: '700' },
  title: { color: c.ink, fontSize: typography.page, fontWeight: '700' },
  subtitle: { color: c.ink, fontSize: typography.section, fontWeight: '700' },
  figure: { color: c.ink, fontSize: typography.figure, fontWeight: '700' },
  body: {
    color: c.muted,
    fontSize: typography.body,
    lineHeight: typography.lineHeight,
  },
  supporting: {
    color: c.muted,
    fontSize: typography.supporting,
    lineHeight: 23,
  },
  demo: {
    color: c.warning,
    fontSize: typography.supporting,
    lineHeight: 23,
    padding: 12,
    backgroundColor: '#fff5dd',
  },
  button: {
    minHeight: 48,
    padding: 14,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    backgroundColor: c.surface,
  },
  buttonText: { fontSize: typography.body, color: c.accent },
  selected: { backgroundColor: c.mint },
  card: {
    padding: 20,
    gap: 12,
    backgroundColor: c.surface,
    borderRadius: 12,
    borderColor: c.border,
    borderWidth: 1,
  },
  record: { paddingTop: 12, borderTopWidth: 1, borderColor: c.border },
  welcome: {
    backgroundColor: c.accent,
    padding: 24,
    borderRadius: 12,
    gap: 12,
  },
  welcomeTitle: {
    color: c.surface,
    fontSize: typography.section,
    fontWeight: '700',
  },
  welcomeBody: {
    color: c.surface,
    fontSize: typography.body,
    lineHeight: typography.lineHeight,
  },
  navigation: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: c.border,
  },
});
