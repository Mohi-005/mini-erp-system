import {
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import {
  modules,
  primaryNavigation,
  translations,
  visual,
  normalizeDigits,
  isDecimalInput,
  presentationStates,
  type Locale,
  type RouteId,
  type VisualKey,
} from '@mini-erp/shared';
import {
  products,
  shops,
  transactions,
  expenses,
  dashboard,
  week,
} from '@mini-erp/shared/demo';
import { Button, StatePanel } from './components';

const symbols: Record<string, string> = {
  home: '⌂',
  sales: '🛒',
  products: '▣',
  purchases: '↓',
  estimator: '▤',
  shops: '⌑',
  customers: '♧',
  suppliers: '♧',
  expenses: '▱',
  payments: '৳',
  invoices: '▧',
  reports: '▥',
  settings: '⚙',
  staff: '♧',
  activity: '◷',
  more: '☰',
};
type Route = RouteId | 'dev-preview';
function readRoute(): Route {
  const hash = location.hash.slice(1);
  if (hash === 'dev-preview' && import.meta.env.DEV) return hash;
  return hash === 'more'
    ? hash
    : (modules.find((item) => item === hash) ?? 'home');
}
function Panel({
  title,
  children,
  action,
}: PropsWithChildren<{ title?: string; action?: ReactNode }>) {
  return (
    <section className="panel">
      {title && (
        <div className="panelhead">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
function Metric({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: string;
}) {
  return (
    <div className="metric">
      <div className="metric-top">
        {label}
        <span aria-hidden="true">{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function Field({ label, children }: PropsWithChildren<{ label: string }>) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Modal({
  title,
  children,
  close,
  closeLabel,
}: PropsWithChildren<{
  title: string;
  close: () => void;
  closeLabel: string;
}>) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!opener.current) opener.current = document.activeElement as HTMLElement;
    node?.showModal();
    return () => node?.close();
  }, []);
  function dismiss() {
    dialog.current?.close();
    close();
    requestAnimationFrame(
      () => opener.current?.isConnected && opener.current.focus(),
    );
  }
  return (
    <dialog
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      aria-labelledby="modal-title"
    >
      <div className="dialog-head">
        <h2 id="modal-title">{title}</h2>
        <Button onClick={dismiss} aria-label={closeLabel}>
          ×
        </Button>
      </div>
      {children}
      <Button onClick={dismiss}>{closeLabel}</Button>
    </dialog>
  );
}
function Table({ children, label }: PropsWithChildren<{ label: string }>) {
  return (
    <div className="tablewrap" tabIndex={0} role="region" aria-label={label}>
      {children}
    </div>
  );
}
export default function App({
  initialLocale = 'bn',
  onLocaleChange,
}: {
  initialLocale?: Locale;
  onLocaleChange?: (locale: Locale) => void;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [route, setRoute] = useState<Route>(readRoute);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [shopId, setShopId] = useState('');
  const [date, setDate] = useState('');
  const [archived, setArchived] = useState(false);
  const [modal, setModal] = useState<{
    kind:
      | 'product'
      | 'shop'
      | 'expense'
      | 'transaction'
      | 'product-detail'
      | 'shop-detail';
    id?: string;
  } | null>(null);
  const [digits, setDigits] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const t = translations[locale];
  const v = (key: VisualKey) => visual(locale, key);
  const num = (n: number) =>
    new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-BD').format(n);
  const money = (n: number) => `৳${num(n)}`;
  const unit = (u: string) =>
    locale === 'en' ? u : u === 'kg' ? 'কেজি' : 'লিটার';
  const displayDate = (d: string) =>
    new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', {
      timeZone: 'Asia/Dhaka',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(`${d}T00:00:00Z`));
  const title =
    route === 'home'
      ? v('greeting')
      : route === 'dev-preview'
        ? t.preview
        : route === 'estimator'
          ? v('estimateHeading')
          : route === 'settings'
            ? v('settingsHeading')
            : route === 'invoices'
              ? v('invoices')
              : t[route];
  const switchLanguage = () => {
    const next = locale === 'bn' ? 'en' : 'bn';
    setLocale(next);
    onLocaleChange?.(next);
  };
  useEffect(() => {
    const change = () => {
      if (location.hash === '#main') return;
      setRoute(readRoute());
      setQuery('');
      setCategory('');
      setModal(null);
      requestAnimationFrame(() => {
        heading.current?.focus();
        window.scrollTo(0, 0);
      });
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `${t.appName} · ${t.demo}`;
  }, [locale, t.appName, t.demo]);
  const filteredProducts = products.filter(
    (p) =>
      normalizeDigits(`${p.bn} ${p.en} ${p.id}`)
        .toLowerCase()
        .includes(normalizeDigits(query).toLowerCase()) &&
      (!category || p.category === category),
  );
  const shopQuery = normalizeDigits(query).trim().toLowerCase();
  const exactShopCode = shops.some((s) => s.code.toLowerCase() === shopQuery);
  const filteredShops = shops.filter(
    (s) =>
      s.archived === archived &&
      (exactShopCode
        ? s.code.toLowerCase() === shopQuery
        : normalizeDigits(`${s.bn} ${s.en} ${s.code}`)
            .toLowerCase()
            .includes(shopQuery)),
  );
  const filteredTransactions = transactions.filter(
    (r) => (!shopId || r.shopId === shopId) && (!date || r.date === date),
  );
  function renderTransactions(
    rows: readonly (typeof transactions)[number][] = transactions,
  ) {
    return (
      <Table label={v('tableScroll')}>
        <table>
          <thead>
            <tr>
              {[
                'reference',
                'customer',
                'date',
                'type',
                'amount',
                'remaining',
                'detail',
              ].map((k) => (
                <th key={k}>{v(k as VisualKey)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.ref}</strong>
                </td>
                <td>{shops.find((s) => s.id === r.shopId)?.[locale]}</td>
                <td>{displayDate(r.date)}</td>
                <td>{v(r.kind)}</td>
                <td>{money(r.total)}</td>
                <td>
                  <span className={`tag ${r.due ? 'amber' : ''}`}>
                    {money(r.due)}
                  </span>
                </td>
                <td>
                  <Button
                    onClick={() => setModal({ kind: 'transaction', id: r.id })}
                  >
                    {v('detail')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="empty">{v('noResults')}</p>}
      </Table>
    );
  }
  const search = (
    <div className="toolbar">
      <Field label={v('search')}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </Field>
      {(route === 'products' || route === 'sales' || route === 'purchases') && (
        <Field label={v('allProducts')}>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">{v('allProducts')}</option>
            <option value="grains">{v('grains')}</option>
            <option value="essentials">{v('essentials')}</option>
          </select>
        </Field>
      )}
    </div>
  );
  const productCards = (
    <div className="productgrid">
      {filteredProducts.map((p) => (
        <button
          className="productcard"
          key={p.id}
          onClick={() => setModal({ kind: 'product-detail', id: p.id })}
        >
          <span className="producticon" aria-hidden="true">
            {p.icon}
          </span>
          <b>{p[locale]}</b>
          <strong>
            {money(route === 'purchases' ? p.buy : p.price)}{' '}
            <small>/ {unit(p.unit)}</small>
          </strong>
          <small>
            {v('stock')}: {num(p.stock)} {unit(p.unit)}
          </small>
          <span className="card-action">{v('detail')} →</span>
        </button>
      ))}
      {!filteredProducts.length && <p className="empty">{v('noResults')}</p>}
    </div>
  );
  function pageContent() {
    if (route === 'home')
      return (
        <>
          <section className="welcome">
            <div>
              <h2>{v('welcome')}</h2>
              <p>{v('subtitle')}</p>
            </div>
            <div className="row">
              <a className="button" href="#sales">
                ＋ {v('sale')}
              </a>
              <a className="button" href="#purchases">
                ↓ {v('buy')}
              </a>
            </div>
          </section>
          <section className="metrics">
            {(
              [
                ['salesToday', dashboard.sales, 'sales'],
                ['profit', dashboard.profit, 'reports'],
                ['due', dashboard.due, 'customers'],
                ['expense', dashboard.expense, 'expenses'],
              ] as const
            ).map(([key, value, icon]) => (
              <Metric
                key={key}
                label={v(key)}
                value={money(value)}
                note={v('sampleDate')}
                icon={symbols[icon]}
              />
            ))}
          </section>
          <div className="grid">
            <Panel
              title={v('chart')}
              action={<span className="tag">{v('week')}</span>}
            >
              <p>{v('sampleDate')}</p>
              <div
                className="chart"
                role="img"
                aria-label={`${v('chart')}: ${week.map((amount, i) => `${num(i + 11)}: ${money(amount)}`).join(', ')}`}
              >
                {week.map((amount, i) => (
                  <div className="barcol" key={i}>
                    <span
                      className="bar"
                      style={{ height: `${amount / 14}%` }}
                    />
                    <small>{num(i + 11)}</small>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title={v('stockCheck')}>
              <p>{v('stockHint')}</p>
              {products
                .filter((p) => p.stock <= p.min)
                .map((p) => (
                  <div className="stockrow" key={p.id}>
                    <span className="producticon" aria-hidden="true">
                      {p.icon}
                    </span>
                    <div className="detail">
                      <b>{p[locale]}</b>
                      <small>
                        {num(p.stock)} {unit(p.unit)}
                      </small>
                    </div>
                    <span className="tag amber">{v('low')}</span>
                  </div>
                ))}
            </Panel>
          </div>
          <Panel
            title={v('recent')}
            action={
              <a className="button" href="#invoices">
                {v('all')} →
              </a>
            }
          >
            {renderTransactions()}
          </Panel>
        </>
      );
    if (route === 'sales' || route === 'purchases') {
      const purchase = route === 'purchases';
      const sample = transactions[purchase ? 2 : 0];
      return (
        <div className="pos">
          <section>
            {search}
            {productCards}
          </section>
          <Panel title={v(purchase ? 'purchaseBasket' : 'basket')}>
            <p className="notice">{v('basketHint')}</p>
            <div className="stockrow">
              <span className="producticon">🌾</span>
              <div className="detail">
                <b>{sample[locale]}</b>
                <small>
                  {num(sample.quantity)} {unit(sample.unit)} ×{' '}
                  {money(sample.price)}
                </small>
              </div>
              <b>{money(sample.total)}</b>
            </div>
            <div className="summary">
              <div className="row between">
                <b>{v('total')}</b>
                <strong className="figure">{money(sample.total)}</strong>
              </div>
              <Field label={v(purchase ? 'supplier' : 'customer')}>
                <select disabled value={sample.shopId}>
                  {shops.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s[locale]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={v('paid')}>
                <input readOnly value={money(sample.paid)} />
              </Field>
              <Field label={v('method')}>
                <select disabled>
                  <option>{v('cash')}</option>
                </select>
              </Field>
              <div className="row between">
                <span>{v('remaining')}</span>
                <b>{money(sample.due)}</b>
              </div>
              <Button disabled>{v('review')}</Button>
            </div>
          </Panel>
        </div>
      );
    }
    if (route === 'products')
      return (
        <>
          <section className="metrics">
            <Metric
              label={v('count')}
              value={num(products.length)}
              note={v('sample')}
              icon="▣"
            />
            <Metric
              label={v('stockValue')}
              value={money(dashboard.stockValue)}
              note={v('sample')}
              icon="▥"
            />
            <Metric
              label={v('low')}
              value={num(2)}
              note={v('sample')}
              icon="↓"
            />
            <Metric
              label={v('supplierDue')}
              value={money(dashboard.supplierDue)}
              note={v('sample')}
              icon="৳"
            />
          </section>
          <Panel>
            {search}
            <Table label={v('tableScroll')}>
              <table>
                <thead>
                  <tr>
                    {['product', 'price', 'stock', 'status', 'detail'].map(
                      (k) => (
                        <th key={k}>{v(k as VisualKey)}</th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="row">
                          <span className="producticon">{p.icon}</span>
                          <div>
                            <b>{p[locale]}</b>
                            <small>{p.id}</small>
                          </div>
                        </div>
                      </td>
                      <td>{money(p.price)}</td>
                      <td>
                        {num(p.stock)} {unit(p.unit)}
                      </td>
                      <td>
                        <span
                          className={`tag ${p.stock <= p.min ? 'amber' : ''}`}
                        >
                          {v(p.stock <= p.min ? 'low' : 'enough')}
                        </span>
                      </td>
                      <td>
                        <Button
                          onClick={() =>
                            setModal({ kind: 'product-detail', id: p.id })
                          }
                        >
                          {v('detail')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Table>
            {!filteredProducts.length && <p>{v('noResults')}</p>}
          </Panel>
        </>
      );
    if (route === 'shops')
      return (
        <Panel>
          {search}
          <div className="row filter-row">
            <Button aria-pressed={!archived} onClick={() => setArchived(false)}>
              {v('active')}
            </Button>
            <Button aria-pressed={archived} onClick={() => setArchived(true)}>
              {v('archived')}
            </Button>
          </div>
          <Table label={v('tableScroll')}>
            <table>
              <thead>
                <tr>
                  {['name', 'code', 'remaining', 'detail'].map((k) => (
                    <th key={k}>{v(k as VisualKey)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredShops.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Button
                        onClick={() =>
                          setModal({ kind: 'shop-detail', id: s.id })
                        }
                      >
                        {s[locale]} ↗
                      </Button>
                    </td>
                    <td>{s.code}</td>
                    <td>{money(s.due)}</td>
                    <td>
                      <a
                        className="button"
                        href="#invoices"
                        onClick={() => {
                          setShopId(s.id);
                          setDate('');
                        }}
                      >
                        {t.invoices}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Table>
          {!filteredShops.length && <p>{v('noResults')}</p>}
        </Panel>
      );
    if (route === 'customers' || route === 'suppliers')
      return (
        <>
          <p>{v('relationships')}</p>
          <div className="notice">
            {v(route === 'customers' ? 'due' : 'supplierDue')}:{' '}
            <b>
              {money(
                route === 'customers' ? dashboard.due : dashboard.supplierDue,
              )}
            </b>{' '}
            · {v('sample')}
          </div>
          <Panel>
            {(route === 'customers'
              ? shops.filter((s) => !s.archived)
              : shops.filter((s) => s.id === 'demo-shop-karim')
            ).map((s) => (
              <div className="stockrow" key={s.id}>
                <span className="avatar">{s[locale].slice(0, 1)}</span>
                <div className="detail">
                  <b>{s[locale]}</b>
                  <small>{s.code}</small>
                </div>
                <b>{money(route === 'customers' ? s.due : 1000)}</b>
                <Button disabled>
                  {v(route === 'suppliers' ? 'paySupplier' : 'collect')}
                </Button>
              </div>
            ))}
          </Panel>
        </>
      );
    if (route === 'expenses')
      return (
        <>
          <p>{v('expenseHint')}</p>
          <Panel title={v('expenses')}>
            {expenses.map((e) => (
              <div className="stockrow" key={e.id}>
                <span className="producticon">▱</span>
                <div className="detail">
                  <b>{v(e.category)}</b>
                  <small>
                    {displayDate(e.date)} · {v(e.method)}
                  </small>
                </div>
                <b>{money(e.amount)}</b>
              </div>
            ))}
          </Panel>
        </>
      );
    if (route === 'estimator')
      return (
        <>
          <p className="notice">
            {v('estimateHint')} {v('estimateUnavailable')}
          </p>
          <div className="estimate">
            <Panel title={v('plan')}>
              <div className="formgrid">
                {(
                  [
                    ['quantity', 500],
                    ['buyPrice', 60],
                    ['price', 70],
                    ['transport', 1000],
                    ['other', 0],
                  ] as const
                ).map(([key, value]) => (
                  <Field label={v(key)} key={key}>
                    <input readOnly value={num(value)} />
                  </Field>
                ))}
              </div>
            </Panel>
            <section className="estimate-result">
              <h2>{v('expectedProfit')}</h2>
              <strong className="big">{money(4000)}</strong>
              {(
                [
                  ['investment', 31000],
                  ['expectedSales', 35000],
                  ['goodsCost', 31000],
                ] as const
              ).map(([key, value]) => (
                <div className="row between" key={key}>
                  <span>{v(key)}</span>
                  <b>{money(value)}</b>
                </div>
              ))}
              <p>
                {v('sample')} · {v('estimateUnavailable')}
              </p>
            </section>
          </div>
        </>
      );
    if (route === 'invoices')
      return (
        <Panel>
          <div className="invoice-filters">
            <Field label={v('customer')}>
              <select
                value={shopId}
                onChange={(e) => setShopId(e.target.value)}
              >
                <option value="">{v('allShops')}</option>
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s[locale]} · {s.code}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={v('filterDate')}>
              <input
                type="date"
                onInput={(e) => setDate(e.currentTarget.value)}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Button
              onClick={() => {
                setShopId('');
                setDate('');
              }}
            >
              {v('clear')}
            </Button>
          </div>
          {renderTransactions(filteredTransactions)}
        </Panel>
      );
    if (route === 'reports')
      return (
        <>
          <section className="metrics">
            <Metric
              label={v('salesToday')}
              value={money(1400)}
              note={v('sampleDate')}
              icon="▥"
            />
            <Metric
              label={v('goodsCost')}
              value={money(1200)}
              note={v('sampleDate')}
              icon="▣"
            />
            <Metric
              label={v('expense')}
              value={money(150)}
              note={v('sampleDate')}
              icon="▱"
            />
            <Metric
              label={v('profit')}
              value={money(50)}
              note={v('sampleDate')}
              icon="৳"
            />
          </section>
          <Panel title={v('recent')}>{renderTransactions()}</Panel>
        </>
      );
    if (route === 'settings')
      return (
        <Panel>
          <div className="stockrow">
            <div className="detail">
              <h2>{v('language')}</h2>
              <p>{t.tagline}</p>
            </div>
            <Button onClick={switchLanguage}>
              {locale === 'bn' ? 'English' : 'বাংলা'}
            </Button>
          </div>
          <div className="stockrow">
            <div className="detail">
              <h2>{v('profile')}</h2>
              <p>{v('business')}</p>
            </div>
            <Button disabled>{v('save')}</Button>
          </div>
          <div className="stockrow">
            <div className="detail">
              <h2>{v('role')}</h2>
              <p>{v('roleNote')}</p>
            </div>
            <span className="tag">{v('owner')}</span>
          </div>
        </Panel>
      );
    if (route === 'more')
      return (
        <Panel>
          <nav className="more-grid" aria-label={t.more}>
            {modules
              .filter((item) => !primaryNavigation.some((p) => p === item))
              .map((item) => (
                <a key={item} href={`#${item}`}>
                  <span aria-hidden="true">{symbols[item]}</span>
                  {t[item]} →
                </a>
              ))}
          </nav>
        </Panel>
      );
    if (route === 'dev-preview' && import.meta.env.DEV)
      return (
        <Panel title={t.preview}>
          <p>{t.patternsNote}</p>
          <Field label={t.numberLabel}>
            <input value={digits} onChange={(e) => setDigits(e.target.value)} />
          </Field>
          <p role="status">
            {digits &&
              (isDecimalInput(digits)
                ? normalizeDigits(digits)
                : t.invalidNumber)}
          </p>
          {presentationStates.map((state) => (
            <StatePanel key={state} state={state} locale={locale} />
          ))}
        </Panel>
      );
    return (
      <Panel title={t.notReady}>
        <p>{t.notReadyBody}</p>
      </Panel>
    );
  }
  function dialogContent() {
    if (!modal) return null;
    if (modal.kind === 'transaction') {
      const r = transactions.find((r) => r.id === modal.id)!;
      return (
        <>
          <div className="receipt-brand">
            <strong>{v('business')}</strong>
            <p>
              {r.ref} · {displayDate(r.date)}
            </p>
          </div>
          <div className="receipt">
            <h3>{shops.find((s) => s.id === r.shopId)?.[locale]}</h3>
            <p>
              {r[locale]} · {num(r.quantity)} {unit(r.unit)} × {money(r.price)}
            </p>
            {(
              [
                ['total', r.total],
                ['paid', r.paid],
                ['remaining', r.due],
              ] as const
            ).map(([key, value]) => (
              <div className="row between" key={key}>
                <span>{v(key)}</span>
                <b>{money(value)}</b>
              </div>
            ))}
          </div>
          <Button disabled>{v('print')}</Button>
        </>
      );
    }
    if (modal.kind === 'product-detail') {
      const p = products.find((p) => p.id === modal.id)!;
      return (
        <>
          <h3>{p[locale]}</h3>
          <p>
            {p.id} · {num(p.stock)} {unit(p.unit)}
          </p>
          <p>
            {v('price')}: {money(p.price)}
          </p>
          <p>{v('archiveHint')}</p>
          <div className="row">
            <Button disabled>{v('archive')}</Button>
            <Button disabled>{v('restore')}</Button>
          </div>
        </>
      );
    }
    if (modal.kind === 'shop-detail') {
      const s = shops.find((s) => s.id === modal.id)!;
      return (
        <>
          <h3>{s[locale]}</h3>
          <p>{s.code}</p>
          <p>
            {v('remaining')}: {money(s.due)}
          </p>
          <p>{v('archiveHint')}</p>
          <Button disabled>{v(s.archived ? 'restore' : 'archive')}</Button>
        </>
      );
    }
    const fields: VisualKey[] =
      modal.kind === 'product'
        ? [
            'name',
            'englishName',
            'code',
            'buyPrice',
            'price',
            'stock',
            'quantity',
          ]
        : modal.kind === 'shop'
          ? ['name', 'ownerName', 'phone', 'code', 'address', 'email']
          : ['category', 'amount', 'date', 'method', 'note'];
    return (
      <>
        <p className="notice">{v('formNote')}</p>
        <form onSubmit={(e) => e.preventDefault()}>
          {fields.map((key) => (
            <Field key={key} label={v(key)}>
              <input
                type={
                  key === 'date' ? 'date' : key === 'email' ? 'email' : 'text'
                }
                inputMode={
                  ['amount', 'buyPrice', 'price', 'stock', 'quantity'].includes(
                    key,
                  )
                    ? 'decimal'
                    : undefined
                }
              />
            </Field>
          ))}
          <Button disabled>{v('save')}</Button>
        </form>
      </>
    );
  }
  return (
    <>
      <a className="skip-link" href="#main">
        {t.skip}
      </a>
      <div className="app-layout">
        <aside className="sidebar">
          <div className="brand">
            <span className="logo">হ</span>
            <div>
              <strong>{t.appName}</strong>
              <small>{t.tagline}</small>
            </div>
          </div>
          <div className="shop-identity">
            <b>{v('business')}</b>
            <small>{v('location')}</small>
          </div>
          <p className="navlabel">{v('workspace')}</p>
          <nav className="nav" aria-label={t.navigation}>
            {modules.map((item) => (
              <a
                href={`#${item}`}
                key={item}
                aria-current={route === item ? 'page' : undefined}
              >
                <span className="nav-icon" aria-hidden="true">
                  {symbols[item]}
                </span>
                {t[item]}
              </a>
            ))}
          </nav>
          <footer>
            <span className="avatar">র</span>
            <div>
              {v('owner')}
              <small>{t.demo}</small>
            </div>
          </footer>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div className="crumb">
              {v('workspace')} / <b>{route === 'home' ? t.home : title}</b>
            </div>
            <div className="mobilebrand">
              <span className="logo">হ</span>
              {t.appName}
            </div>
            <div className="topactions">
              <span className="demo-label">{v('sample')}</span>
              <Button
                onClick={switchLanguage}
                lang={locale === 'bn' ? 'en' : 'bn'}
              >
                {locale === 'bn' ? 'English' : 'বাংলা'}
              </Button>
            </div>
          </header>
          <main id="main" tabIndex={-1}>
            <p className="demo-banner">{v('demoNote')}</p>
            <div className="pagehead">
              <div>
                <h1 ref={heading} tabIndex={-1}>
                  {title}
                </h1>
                <p>{route === 'home' ? v('sampleDate') : v('subtitle')}</p>
              </div>
              {route === 'products' || route === 'purchases' ? (
                <Button onClick={() => setModal({ kind: 'product' })}>
                  ＋ {v('addProduct')}
                </Button>
              ) : route === 'shops' ? (
                <Button onClick={() => setModal({ kind: 'shop' })}>
                  ＋ {v('addShop')}
                </Button>
              ) : route === 'expenses' ? (
                <Button onClick={() => setModal({ kind: 'expense' })}>
                  ＋ {v('addExpense')}
                </Button>
              ) : null}
            </div>
            {pageContent()}
            <p className="footnote">{v('demoFooter')}</p>
          </main>
          <nav className="bottomnav" aria-label={t.navigation}>
            {primaryNavigation.map((item) => (
              <a
                key={item}
                href={`#${item}`}
                aria-current={route === item ? 'page' : undefined}
              >
                <span aria-hidden="true">{symbols[item]}</span>
                {item === 'products' ? t.stock : t[item]}
              </a>
            ))}
          </nav>
        </div>
      </div>
      {modal && (
        <Modal
          title={`${v('sample')} · ${v(modal.kind === 'transaction' ? 'invoices' : modal.kind === 'product' ? 'addProduct' : modal.kind === 'shop' ? 'addShop' : modal.kind === 'expense' ? 'addExpense' : 'detail')}`}
          close={() => setModal(null)}
          closeLabel={v('close')}
        >
          <p className="demo-label">{t.demo}</p>
          {dialogContent()}
        </Modal>
      )}
    </>
  );
}
