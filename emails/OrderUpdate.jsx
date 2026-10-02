// To the customer: payment receipt and every status change after it.
import * as React from 'react';
import { Shell, H1, P, Muted, H2, KeyValue, ItemList, Totals, Alert, Badge, Separator, money } from './ui.jsx';

const STATUS = {
  paid:       { badge: ['success', 'Confirmed'],  line: (n) => `Thank you for your order, ${n}.` },
  processing: { badge: ['info', 'Preparing'],     line: (n) => `${n}, we're preparing your order.` },
  shipped:    { badge: ['info', 'Shipped'],       line: (n) => `${n}, your order is on its way.` },
  delivered:  { badge: ['success', 'Delivered'],  line: (n) => `${n}, your order has arrived.` },
  cancelled:  { badge: ['destructive', 'Cancelled'], line: (n) => `${n}, your order has been cancelled.` },
};

/** "{orderId}" in the admin-editable message becomes the order number in bold. */
function Message({ text, orderId }) {
  const parts = String(text || '').split('{orderId}');
  return parts.map((part, i) => (
    <React.Fragment key={i}>{part}{i < parts.length - 1 ? <strong>{orderId}</strong> : null}</React.Fragment>
  ));
}

export default function OrderUpdate({ brand, order, currency = 'R', message, supportEmail }) {
  const first = (order.customer || '').split(' ')[0] || 'there';
  const s = STATUS[order.status] || { badge: ['neutral', 'Updated'], line: (n) => `${n}, your order has been updated.` };
  const headline = s.line(first);
  const showTracking = ['shipped', 'delivered'].includes(order.status) && (order.trackingNumber || order.carrier);
  const showTotals = ['paid', 'cancelled'].includes(order.status);
  const address = (order.address || '').split(',').map(x => x.trim()).filter(Boolean).join(', ');

  return (
    <Shell
      brand={brand}
      title={`Order ${order.id}`}
      preview={headline}
      reason={`You're receiving this because you placed order ${order.id} at ${brand.name}.`}
    >
      <Badge tone={s.badge[0]}>{s.badge[1]}</Badge>
      <H1 style={{ margin: '12px 0 8px' }}>{headline}</H1>
      <P style={{ color: '#52525b', margin: '0 0 24px' }}><Message text={message} orderId={order.id} /></P>

      {order.adminNote ? <Alert tone="neutral" title="A note from us">{order.adminNote}</Alert> : null}

      <KeyValue rows={[
        { label: 'Order number', value: order.id },
        showTracking && { label: 'Carrier', value: order.carrier },
        showTracking && { label: 'Tracking number', value: order.trackingNumber },
        order.estimatedDelivery && { label: 'Estimated delivery', value: order.estimatedDelivery },
        { label: 'Delivery address', value: address },
      ]} />

      <H2 style={{ margin: '24px 0 4px' }}>Your items</H2>
      <ItemList items={order.items} currency={currency} showPrice={showTotals} />
      {showTotals ? (
        <Totals rows={[
          { label: 'Subtotal', value: money(order.total - (order.shippingCost || 0), currency) },
          { label: 'Shipping', value: order.shippingCost ? money(order.shippingCost, currency) : 'Free' },
          { label: 'Total', value: money(order.total, currency) },
        ]} />
      ) : null}

      <Separator />
      <Muted style={{ margin: 0, fontSize: 13 }}>
        Questions about your order? Reply to this email{supportEmail ? ` or write to ${supportEmail}` : ''} and we'll help.
      </Muted>
    </Shell>
  );
}
