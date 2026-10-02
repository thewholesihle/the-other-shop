// To the store owner: a customer's payment went through.
import * as React from 'react';
import { Shell, H1, Muted, H2, KeyValue, ItemList, Totals, Btn, Badge, Separator, money } from './ui.jsx';

const METHODS = { payfast: 'PayFast', yoco: 'Yoco' };

export default function OrderNotification({ brand, order, currency = 'R', adminUrl }) {
  const subtotal = order.total - (order.shippingCost || 0);
  return (
    <Shell
      brand={brand}
      title={`New order ${order.id}`}
      preview={`${money(order.total, currency)} from ${order.customer || 'a customer'} · order ${order.id}`}
      reason={`You're receiving this because your address is listed under Settings → Emails & alerts for ${brand.name}.`}
    >
      <Badge tone="success">Paid</Badge>
      <H1 style={{ margin: '12px 0 4px' }}>New order from {order.customer || 'a customer'}</H1>
      <Muted style={{ margin: '0 0 24px' }}>Order {order.id}. The payment is confirmed, so it is ready to pack.</Muted>

      <KeyValue rows={[
        { label: 'Customer', value: order.customer },
        { label: 'Email', value: order.email },
        { label: 'Phone', value: order.phone },
        { label: 'Delivery address', value: order.address },
        { label: 'Payment', value: [METHODS[order.paymentMethod], order.paymentRef].filter(Boolean).join(' \u00b7 ') },
      ]} />

      <H2 style={{ margin: '24px 0 4px' }}>Items</H2>
      <ItemList items={order.items} currency={currency} showPrice />
      <Totals rows={[
        { label: 'Subtotal', value: money(subtotal, currency) },
        { label: 'Shipping', value: order.shippingCost ? money(order.shippingCost, currency) : 'Free' },
        { label: 'Total paid', value: money(order.total, currency) },
      ]} />

      {adminUrl ? <Btn href={adminUrl}>Open order in admin</Btn> : null}
      <Separator />
      <Muted style={{ margin: 0, fontSize: 13 }}>Reply to this email to write to the customer directly.</Muted>
    </Shell>
  );
}
