'use strict';
// Sample data for previewing every email (npm run emails:preview). Not used by the server.
const brand = {
  name: 'Others.',
  logoUrl: 'https://res.cloudinary.com/demo/image/upload/c_limit,w_360,f_png,q_auto/cloudinary_icon.png',
  logoDarkUrl: 'https://res.cloudinary.com/demo/image/upload/e_colorize:100,co_rgb:ffffff/c_limit,w_360,f_png,q_auto/cloudinary_icon.png',
  url: 'https://others.example',
  contactUrl: 'https://others.example/contact',
  address: '1 Main Road, Parkhurst, Johannesburg, 2193',
  socials: [{ label: 'Instagram', href: 'https://instagram.com/others' }, { label: 'YouTube', href: 'https://youtube.com/@others' }],
};
const D = 'https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,h_104,w_104,f_jpg,q_auto/';
const order = {
  id: 'ORD-1790959040186', customer: 'Thandi Mokoena', email: 'thandi@example.com', phone: '082 000 0000',
  address: '14 Example Street, Parkhurst, Johannesburg 2193, Gauteng, South Africa',
  total: 1149, shippingCost: 99, status: 'paid', paymentMethod: 'yoco', paymentRef: 'p_8F2KQ1',
  carrier: 'PostNet', trackingNumber: 'PN123456789', estimatedDelivery: '8 Oct',
  items: [
    { name: 'Boxy Tee — Washed Black with a deliberately long product name', size: 'M', color: 'Black', quantity: 2, price: 450, image: D + 'sample.jpg' },
    { name: 'Everyday Cap', size: '', color: 'Bone', quantity: 1, price: 150, image: D + 'cld-sample-2.jpg' },
  ],
};
const report = {
  siteName: 'Others.', currency: 'R', from: '2026-09-25T00:00:00Z', to: '2026-10-02T00:00:00Z', totalLogs: 412,
  flags: [
    { severity: 'high', title: '2 payment notifications with an invalid signature', detail: 'Someone may be trying to fake or alter a payment confirmation. Check these orders against your PayFast / Yoco dashboard before shipping anything.' },
    { severity: 'medium', title: 'Sign-in from 1 new device', detail: 'Chrome on Windows — 102.15.3.9. Fine if that was you.' },
    { severity: 'info', title: '3 checkouts left unpaid for over a day', detail: 'Their stock is reserved until the customer cancels or the payment provider confirms.' },
  ],
  sales: { revenue: 14820.5, revenueDelta: 12, paidOrders: 17, ordersDelta: -8, avgOrder: 871.8, newSubscribers: 9, orders: 21, statusCounts: { paid: 10, shipped: 7, pending_payment: 3, cancelled: 1 }, topProducts: [{ name: 'Boxy Tee — Washed Black', units: 11, revenue: 4950 }, { name: 'Everyday Cap', units: 6, revenue: 960 }] },
  security: { signins: 6, failed: 2, lockouts: 0, logsCleared: 0, devices: [{ device: 'Chrome on Windows', count: 5, ips: ['102.15.3.9'], isNew: true }, { device: 'Safari on iPhone', count: 1, ips: ['41.1.2.3'], isNew: false }] },
  payments: { badSignature: 2, badAmount: 0, untrustedIp: 0 },
  health: { errors: 3, emailFailures: 0, dbDrops: 0, topErrors: [{ message: 'Cloudinary upload failed', count: 2 }] },
};

const newsletterHtml = '<h2>New drop: Spring capsule</h2><p>Six new pieces are live in the shop today, cut from heavyweight cotton and finished in small batches.</p><p><a href="https://others.example/shop?filter=new">See what is new</a></p><ul><li>Boxy tee in three colours</li><li>Everyday cap</li></ul><p><img src="' + D.replace('h_104,w_104', 'h_400,w_1080') + 'sample.jpg" alt="Spring capsule lookbook" /></p><script>alert(1)</script><p onclick="x()">Thanks for being here.</p>';

module.exports = {
  OrderNotification: { brand, order, currency: 'R', adminUrl: 'https://others.example/admin/orders' },
  'OrderUpdate-paid': { brand, order: { ...order, status: 'paid' }, currency: 'R', message: 'Your payment for order {orderId} has been confirmed. We are now preparing your items for dispatch.', supportEmail: 'hello@others.co.za' },
  'OrderUpdate-shipped': { brand, order: { ...order, status: 'shipped', adminNote: 'We packed an extra sticker for you.' }, currency: 'R', message: 'Great news. Your order {orderId} has been shipped and is on its way to you.', supportEmail: 'hello@others.co.za' },
  'OrderUpdate-cancelled': { brand, order: { ...order, status: 'cancelled' }, currency: 'R', message: 'Your order {orderId} has been cancelled. If you have any questions, please contact our support team.', supportEmail: 'hello@others.co.za' },
  NewDeviceAlert: { brand, device: 'Chrome on Windows', ip: '102.15.3.9', when: '2 Oct 2026, 22:14', reviewUrl: 'https://others.example/admin/status' },
  WeeklySummary: { brand, report, adminUrl: 'https://others.example/admin/status' },
  TestEmail: { brand, from: 'onboarding@resend.dev', sandbox: true },
  Newsletter: { brand, subject: 'New drop: Spring capsule', html: newsletterHtml, preview: 'Six new pieces are live today.', unsubscribeUrl: 'https://others.example/api/newsletter/unsubscribe?email=a%40b.co&token=x' },
  SystemAlert: { brand, heading: 'Site alert', message: 'The system detected an internal error that might need your attention.', errorMessage: 'MongoServerError: connection 4 to db timed out', path: 'POST /api/checkout', adminUrl: 'https://others.example/admin/status' },
};
