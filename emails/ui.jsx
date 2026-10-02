// shadcn/ui, translated for email. Same zinc palette, radius and type scale as the admin panel, but as inline
// styles on tables (the only layout every mail client agrees on) built from React Email components.
// CSS variables, flexbox and grid don't survive Outlook/Gmail, so tokens are plain hex values.
import * as React from 'react';
import { Html, Head, Body, Container, Section, Row, Column, Heading, Text, Link, Img, Hr, Preview, Button as REButton } from '@react-email/components';

export const t = {
  page: '#f4f4f5',        // zinc-100  — the outer canvas (shadcn "muted")
  card: '#ffffff',
  fg: '#09090b',          // zinc-950
  muted: '#52525b',       // zinc-600 — secondary text, 7:1 on white (AA even on the page colour)
  border: '#e4e4e7',      // zinc-200
  primary: '#18181b',     // zinc-900
  primaryFg: '#fafafa',
  radius: 8,              // shadcn --radius (cards); controls use radiusSm
  radiusSm: 6,
  font: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
};

// shadcn's alert/badge variants. Every pair is ≥ 4.5:1.
export const tones = {
  neutral:     { bg: '#f4f4f5', bd: '#e4e4e7', fg: '#3f3f46' },
  success:     { bg: '#f0fdf4', bd: '#bbf7d0', fg: '#166534' },
  warning:     { bg: '#fffbeb', bd: '#fde68a', fg: '#92400e' },
  destructive: { bg: '#fef2f2', bd: '#fecaca', fg: '#991b1b' },
  info:        { bg: '#eff6ff', bd: '#bfdbfe', fg: '#1e40af' },
};

const css = `
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
  a { text-decoration: none; }
  .em-prose p { margin: 0 0 16px; font-size: 15px; line-height: 1.65; color: ${t.fg}; }
  .em-prose h1, .em-prose h2, .em-prose h3 { margin: 24px 0 8px; line-height: 1.3; color: ${t.fg}; letter-spacing: -0.01em; }
  .em-prose h1 { font-size: 22px; } .em-prose h2 { font-size: 19px; } .em-prose h3 { font-size: 16px; }
  .em-prose a { color: ${t.primary}; text-decoration: underline; }
  .em-prose img { max-width: 100% !important; height: auto !important; border-radius: ${t.radiusSm}px; }
  .em-prose ul, .em-prose ol { margin: 0 0 16px; padding-left: 22px; font-size: 15px; line-height: 1.65; }
  .em-prose blockquote { margin: 0 0 16px; padding: 4px 0 4px 16px; border-left: 3px solid ${t.border}; color: ${t.muted}; }
  @media only screen and (max-width: 600px) {
    .em-wrap { padding: 16px 12px !important; }
    .em-card { padding: 20px !important; }
    .em-h1 { font-size: 22px !important; }
    .em-stack { display: block !important; width: 100% !important; max-width: 100% !important; box-sizing: border-box !important; }
    .em-left { text-align: left !important; }
    .em-btn { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; }
    .em-gap { padding-bottom: 8px !important; }
  }
`;

/** The whole email: canvas, brand header, white card, footer. Light-only on purpose (see color-scheme):
 *  a store logo is made for a light page and would vanish if a client auto-inverted it. */
export function Shell({ brand, title, preview, reason, unsubscribeUrl, children }) {
  const links = [
    brand.contactUrl && { label: 'Contact us', href: brand.contactUrl },
    ...(brand.socials || []),
    unsubscribeUrl && { label: 'Unsubscribe', href: unsubscribeUrl },
  ].filter(Boolean);
  return (
    <Html lang="en" dir="ltr">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
        <title>{title || brand.name}</title>
        <style>{css}</style>
      </Head>
      {preview ? <Preview>{preview}</Preview> : null}
      <Body style={{ margin: 0, padding: 0, background: t.page, fontFamily: t.font, color: t.fg }}>
        <Container className="em-wrap" style={{ width: '100%', maxWidth: 600, margin: '0 auto', padding: '32px 16px' }}>
          <Section style={{ paddingBottom: 20 }}>
            {brand.logoUrl ? (
              <Link href={brand.url || undefined} data-skip-in-text="true">
                <Img src={brand.logoUrl} alt={brand.name} height={32} style={{ height: 32, width: 'auto', maxWidth: 180 }} />
              </Link>
            ) : (
              <Link href={brand.url || undefined} data-skip-in-text="true" style={{ color: t.fg, fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>{brand.name}</Link>
            )}
          </Section>

          <Section className="em-card" style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: t.radius, padding: 32 }}>
            {children}
          </Section>

          <Section style={{ paddingTop: 20 }}>
            {reason ? <Text style={{ margin: '0 0 12px', fontSize: 12, lineHeight: '18px', color: t.muted }}>{reason}</Text> : null}
            {links.length ? (
              <Text style={{ margin: '0 0 12px', fontSize: 12, lineHeight: '20px', color: t.muted }}>
                {links.map((l, i) => (
                  <React.Fragment key={l.label}>
                    {i > 0 ? ' · ' : null}
                    <Link href={l.href} style={{ color: t.muted, textDecoration: 'underline' }}>{l.label}</Link>
                  </React.Fragment>
                ))}
              </Text>
            ) : null}
            {brand.address ? <Text style={{ margin: '0 0 4px', fontSize: 12, lineHeight: '18px', color: t.muted }}>{brand.name} &middot; {brand.address}</Text> : null}
            <Text style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: t.muted }}>&copy; {new Date().getFullYear()} {brand.name}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const H1 = ({ children, style }) => (
  <Heading as="h1" className="em-h1" style={{ margin: '0 0 8px', fontSize: 24, lineHeight: '30px', fontWeight: 600, letterSpacing: '-0.02em', color: t.fg, ...style }}>{children}</Heading>
);
export const H2 = ({ children, style }) => (
  <Heading as="h2" style={{ margin: '28px 0 12px', fontSize: 16, lineHeight: '22px', fontWeight: 600, letterSpacing: '-0.01em', color: t.fg, ...style }}>{children}</Heading>
);
export const P = ({ children, style }) => <Text style={{ margin: '0 0 16px', fontSize: 15, lineHeight: '24px', color: t.fg, ...style }}>{children}</Text>;
export const Muted = ({ children, style }) => <Text style={{ margin: '0 0 16px', fontSize: 14, lineHeight: '22px', color: t.muted, ...style }}>{children}</Text>;

export function Separator({ style }) {
  return <Hr style={{ border: 'none', borderTop: `1px solid ${t.border}`, margin: '24px 0', ...style }} />;
}

/** shadcn Button. `href` makes it a link-button (the only kind email has). */
export function Btn({ href, children, variant = 'default' }) {
  const outline = variant === 'outline';
  return (
    <REButton
      href={href}
      className="em-btn"
      style={{
        display: 'inline-block', boxSizing: 'border-box', padding: '11px 20px', borderRadius: t.radiusSm,
        fontSize: 14, lineHeight: '20px', fontWeight: 500, textAlign: 'center',
        background: outline ? t.card : t.primary, color: outline ? t.fg : t.primaryFg,
        border: `1px solid ${outline ? t.border : t.primary}`,
      }}
    >
      {children}
    </REButton>
  );
}

/** shadcn Badge. */
export function Badge({ tone = 'neutral', children }) {
  const c = tones[tone] || tones.neutral;
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 9999, border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, fontSize: 12, lineHeight: '18px', fontWeight: 600 }}>
      {children}
    </span>
  );
}

/** shadcn Alert. */
export function Alert({ tone = 'neutral', title, children }) {
  const c = tones[tone] || tones.neutral;
  return (
    <Section style={{ background: c.bg, border: `1px solid ${c.bd}`, borderRadius: t.radius, margin: '0 0 16px' }}>
      <Row><Column style={{ padding: '14px 16px' }}>
        {title ? <Text style={{ margin: 0, fontSize: 14, lineHeight: '20px', fontWeight: 600, color: c.fg }}>{title}</Text> : null}
        {children ? <Text style={{ margin: title ? '4px 0 0' : 0, fontSize: 14, lineHeight: '21px', color: c.fg }}>{children}</Text> : null}
      </Column></Row>
    </Section>
  );
}

/** A bordered list of details: a small muted label over its value. Stacked (not side by side) so it reads the
 *  same on a phone and on desktop, and as plain text. */
export function KeyValue({ rows }) {
  const list = rows.filter(r => r && r.value !== undefined && r.value !== null && r.value !== '');
  if (!list.length) return null;
  return (
    <Section style={{ border: `1px solid ${t.border}`, borderRadius: t.radius, margin: '0 0 20px' }}>
      {list.map((r, i) => (
        <Row key={r.label}>
          <Column style={{ padding: '12px 16px', borderTop: i ? `1px solid ${t.border}` : 'none' }}>
            <Text style={{ margin: 0, fontSize: 12, lineHeight: '16px', color: t.muted }}>{r.label}</Text>
            <Text style={{ margin: '2px 0 0', fontSize: 14, lineHeight: '21px', color: t.fg, fontWeight: 500 }}>{r.value}</Text>
          </Column>
        </Row>
      ))}
    </Section>
  );
}

/** One order line: thumbnail, name + variant, and quantity / price. */
export function ItemRow({ item, currency = 'R', showPrice = false }) {
  const variant = [item.size, item.color].filter(Boolean).join(' / ');
  return (
    <Row style={{ borderBottom: `1px solid ${t.border}` }}>
      <Column style={{ width: 64, padding: '12px 12px 12px 0', verticalAlign: 'top' }}>
        {item.image ? <Img src={item.image} alt="" width={52} height={52} style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: t.radiusSm, border: `1px solid ${t.border}`, background: t.page }} /> : <div style={{ width: 52, height: 52, borderRadius: t.radiusSm, background: t.page }} />}
      </Column>
      <Column style={{ padding: '12px 0', verticalAlign: 'middle' }}>
        <Text style={{ margin: 0, fontSize: 14, lineHeight: '20px', fontWeight: 500, color: t.fg }}>{item.name}</Text>
        <Text style={{ margin: '2px 0 0', fontSize: 13, lineHeight: '18px', color: t.muted }}>{[variant, `Qty ${item.quantity}`].filter(Boolean).join(' · ')}</Text>
      </Column>
      {showPrice ? (
        <Column align="right" style={{ padding: '12px 0 12px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: 14, fontWeight: 500, color: t.fg }}>
          {money(item.price * item.quantity, currency)}
        </Column>
      ) : null}
    </Row>
  );
}

export function ItemList({ items, currency, showPrice }) {
  return (
    <Section style={{ margin: '0 0 8px', borderTop: `1px solid ${t.border}` }}>
      {(items || []).map((item, i) => <ItemRow key={`${item.name}-${i}`} item={item} currency={currency} showPrice={showPrice} />)}
    </Section>
  );
}

/** Label/amount lines, the last one emphasised as the total. */
export function Totals({ rows }) {
  return (
    <table role="presentation" data-text-format="dataTable" width="100%" cellPadding={0} cellSpacing={0} style={{ margin: '0 0 24px' }}>
      <tbody>
        {rows.map((r, i) => {
          const last = i === rows.length - 1 && rows.length > 1;
          const pad = last ? '12px 0 0' : '8px 0 0';
          return (
            <tr key={r.label}>
              <td style={{ padding: pad, fontSize: last ? 16 : 14, fontWeight: last ? 600 : 400, color: last ? t.fg : t.muted }}>{r.label}</td>
              <td align="right" style={{ padding: pad, fontSize: last ? 16 : 14, fontWeight: last ? 600 : 400, color: t.fg, whiteSpace: 'nowrap' }}>{r.value}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** A small stat card (label, big number, one line of context). */
export function Stat({ label, value, note, noteTone }) {
  const color = noteTone === 'up' ? '#166534' : noteTone === 'down' ? '#991b1b' : t.muted;
  return (
    <Column className="em-stack em-gap" style={{ width: '50%', verticalAlign: 'top', padding: '0 6px 12px 0' }}>
      <Section style={{ border: `1px solid ${t.border}`, borderRadius: t.radius }}>
        <Row><Column style={{ padding: '14px 16px' }}>
          <Text style={{ margin: 0, fontSize: 13, lineHeight: '18px', color: t.muted }}>{label}</Text>
          <Text style={{ margin: '4px 0 2px', fontSize: 24, lineHeight: '30px', fontWeight: 600, letterSpacing: '-0.02em', color: t.fg }}>{value}</Text>
          <Text style={{ margin: 0, fontSize: 12, lineHeight: '18px', color }}>{note}</Text>
        </Column></Row>
      </Section>
    </Column>
  );
}

/** A simple table: first column left, the rest right-aligned numbers. */
export function DataTable({ head, rows }) {
  const cell = (c, i, header) => ({
    textAlign: i === 0 ? 'left' : 'right', padding: '9px 0', fontSize: header ? 12 : 13, lineHeight: '18px',
    fontWeight: header ? 500 : 400, color: header ? t.muted : t.fg, borderBottom: `1px solid ${t.border}`,
  });
  return (
    <table role="presentation" data-text-format="dataTable" width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', margin: '0 0 8px' }}>
      <thead><tr>{head.map((h, i) => <th key={h} style={{ ...cell(h, i, true), textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, i) => <td key={i} style={cell(c, i, false)}>{c}</td>)}</tr>)}</tbody>
    </table>
  );
}

export const money = (n, currency = 'R') => `${currency}${Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
