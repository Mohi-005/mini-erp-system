import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';
import {
  translations,
  type Locale,
  type PresentationState,
} from '@mini-erp/shared';

export function Button({
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className="button" type="button" {...props}>
      {children}
    </button>
  );
}
export function Card({ children }: PropsWithChildren) {
  return <section className="card">{children}</section>;
}
export function StatePanel({
  state,
  locale,
}: {
  state: PresentationState;
  locale: Locale;
}) {
  const t = translations[locale];
  const body = {
    loading: t.loadingBody,
    empty: t.emptyBody,
    error: t.errorBody,
    denied: t.deniedBody,
  };
  return (
    <div
      className={`state state-${state}`}
      role={state === 'error' ? 'alert' : 'status'}
    >
      <strong>{t[state]}</strong>
      <p>{body[state]}</p>
    </div>
  );
}
