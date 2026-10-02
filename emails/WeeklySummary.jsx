// To the store owner: last 7 days at a glance, with anything suspicious flagged first.
import * as React from 'react';
import { Shell, H1, H2, Muted, Alert, Btn, Stat, DataTable, Separator, money as fmt } from './ui.jsx';

const SAST = 'Africa/Johannesburg';
const day = (d) => new Date(d).toLocaleDateString('en-ZA', { timeZone: SAST, day: 'numeric', month: 'short' });
const SEV = { high: ['destructive', 'Review'], medium: ['warning', 'Check'], info: ['neutral', 'Note'] };

function delta(v) {
  if (v === null || v === undefined) return { text: 'No data last week', tone: null };
  return { text: `${v >= 0 ? '↑' : '↓'} ${Math.abs(v)}% vs last week`, tone: v >= 0 ? 'up' : 'down' };
}

export default function WeeklySummary({ brand, report: r, adminUrl }) {
  const money = (n) => fmt(n, r.currency);
  const attention = r.flags.filter(f => f.severity !== 'info');
  const worst = r.flags[0]?.severity;
  const banner = !r.flags.length
    ? { tone: 'success', title: 'Nothing suspicious this week', text: 'No unusual sign-ins, payment anomalies or error spikes were found.' }
    : worst === 'high'
      ? { tone: 'destructive', title: `${attention.length} ${attention.length === 1 ? 'item needs' : 'items need'} your attention`, text: 'See the list below, most serious first.' }
      : worst === 'medium'
        ? { tone: 'warning', title: `${attention.length} ${attention.length === 1 ? 'thing is' : 'things are'} worth a look`, text: 'Probably fine, but worth confirming it was you.' }
        : { tone: 'neutral', title: 'Nothing suspicious, just a few notes', text: 'Housekeeping items are listed below.' };

  const sc = r.sales.statusCounts;
  const statusLine = ['paid', 'processing', 'shipped', 'delivered', 'pending_payment', 'cancelled'].filter(k => sc[k]).map(k => `${k.replace('_', ' ')} ${sc[k]}`).join(' · ') || 'No orders this week.';
  const rev = delta(r.sales.revenueDelta), ord = delta(r.sales.ordersDelta);
  const badPayments = r.payments.badSignature + r.payments.badAmount + r.payments.untrustedIp;

  return (
    <Shell
      brand={brand}
      title="Your weekly summary"
      preview={attention.length ? `${attention.length} to review · ${money(r.sales.revenue)} revenue` : `All quiet · ${money(r.sales.revenue)} revenue, ${r.sales.paidOrders} paid orders`}
      reason={`This is the weekly summary for ${brand.name}, sent to the addresses listed under Settings → Emails & alerts.`}
    >
      <H1>Your weekly summary</H1>
      <Muted>{day(r.from)} {'–'} {day(r.to)} &middot; {r.siteName}</Muted>

      <Alert tone={banner.tone} title={banner.title}>{banner.text}</Alert>

      {r.flags.length ? (
        <>
          <H2>Flagged this week</H2>
          {r.flags.map((f, i) => {
            const [tone, label] = SEV[f.severity] || SEV.info;
            return <Alert key={i} tone={tone} title={`${label}: ${f.title}`}>{f.detail}</Alert>;
          })}
        </>
      ) : null}

      <H2>Sales</H2>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}><tbody>
        <tr>
          <Stat label="Revenue" value={money(r.sales.revenue)} note={rev.text} noteTone={rev.tone} />
          <Stat label="Paid orders" value={String(r.sales.paidOrders)} note={ord.text} noteTone={ord.tone} />
        </tr>
        <tr>
          <Stat label="Average order" value={money(r.sales.avgOrder)} note="Paid orders only" />
          <Stat label="New subscribers" value={String(r.sales.newSubscribers)} note="Newsletter" />
        </tr>
      </tbody></table>
      <Muted style={{ margin: '4px 0 0', fontSize: 13 }}>Orders placed: {r.sales.orders}. {statusLine}</Muted>

      {r.sales.topProducts.length ? (
        <>
          <H2>Top products</H2>
          <DataTable head={['Product', 'Units', 'Revenue']} rows={r.sales.topProducts.map(p => [p.name, String(p.units), money(p.revenue)])} />
        </>
      ) : null}

      <H2>Sign-ins and security</H2>
      <Muted style={{ margin: '0 0 12px', fontSize: 13 }}>
        Successful {r.security.signins} &middot; Failed {r.security.failed} &middot; Lockouts {r.security.lockouts} &middot; Logs cleared {r.security.logsCleared}
      </Muted>
      {r.security.devices.length ? (
        <DataTable head={['Device', 'Sign-ins', 'IP']} rows={r.security.devices.map(d => [`${d.device}${d.isNew ? ' (new)' : ''}`, String(d.count), d.ips.join(', ')])} />
      ) : <Muted style={{ fontSize: 13 }}>No admin sign-ins this week.</Muted>}

      <H2>Payments and system health</H2>
      <Muted style={{ margin: '0 0 4px', fontSize: 13 }}>Suspicious payment notifications: {badPayments}</Muted>
      <Muted style={{ margin: '0 0 4px', fontSize: 13 }}>Server errors {r.health.errors} &middot; Failed emails {r.health.emailFailures} &middot; Database drops {r.health.dbDrops}</Muted>
      {r.health.topErrors.length ? <Muted style={{ fontSize: 12 }}>Most frequent: {r.health.topErrors.map(x => `${x.message} (${x.count}×)`).join('; ')}</Muted> : null}

      <Separator />
      <Muted style={{ margin: '0 0 16px', fontSize: 13 }}>
        The full system log for the period ({r.totalLogs} entries) is attached as a compressed backup (.json.gz). It includes sign-in IP addresses and device details, so keep it somewhere safe.
      </Muted>
      {adminUrl ? <Btn href={adminUrl} variant="outline">Open site status</Btn> : null}
    </Shell>
  );
}
