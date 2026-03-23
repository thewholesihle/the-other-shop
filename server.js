'use strict';
require('dotenv').config();

const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const multer   = require('multer');
const md5      = require('md5');
const morgan   = require('morgan');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const { connect } = require('./src/db/connection');
const { Settings, Category, Product, Order, Lookbook, Article, Pages, Subscriber } = require('./src/db/models');

const app  = express();
const port = process.env.PORT || 3000;

// Add HTTP request logging
app.use(morgan('dev'));

// Trust the edge proxy (Fly.io, Heroku, etc) so req.protocol properly detects HTTPS
app.set('trust proxy', 1);

// ─── Admin Auth ───────────────────────────────────────────────────────────────
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;

if (!ADMIN_USER || !ADMIN_PASS) {
  console.error('FATAL: ADMIN_USER and ADMIN_PASS must be set in .env');
  process.exit(1);
}

function basicAuth(req, res, next) {
  const h = req.headers['authorization'];
  if (!h || !h.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Others. Admin"');
    return res.status(401).send('Authentication required.');
  }
  const [user, pass] = Buffer.from(h.slice(6), 'base64').toString().split(':');
  if (user === ADMIN_USER && pass === ADMIN_PASS) return next();
  res.set('WWW-Authenticate', 'Basic realm="Others. Admin"');
  return res.status(401).send('Invalid credentials.');
}

// ─── PayFast Config ───────────────────────────────────────────────────────────
const isSandbox = process.env.PAYFAST_SANDBOX !== 'false';

if (!process.env.PAYFAST_MERCHANT_ID || !process.env.PAYFAST_MERCHANT_KEY) {
  console.error('FATAL: PAYFAST_MERCHANT_ID and PAYFAST_MERCHANT_KEY must be set in .env');
  console.error('       For sandbox testing, use the PayFast test credentials from your PayFast dashboard.');
  process.exit(1);
}

const PF = {
  merchantId:  (process.env.PAYFAST_MERCHANT_ID || '').trim(),
  merchantKey: (process.env.PAYFAST_MERCHANT_KEY || '').trim(),
  passphrase:  (process.env.PAYFAST_PASSPHRASE || '').trim(),
  sandbox:     isSandbox,
};
const PF_HOST = PF.sandbox
  ? 'https://sandbox.payfast.co.za/eng/process'
  : 'https://www.payfast.co.za/eng/process';

// ─── Email Notifier ──────────────────────────────────────────────────────────
async function sendOrderNotification(order) {
  if (!process.env.SMTP_HOST || !process.env.ADMIN_EMAIL) return;
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false for 587
    });

    const itemsHtml = (order.items || []).map(i => `<li style="padding: 10px 0; border-bottom: 1px solid #eaeaea; display: flex; justify-content: space-between;"><span>${i.quantity} &times; ${i.name} <span style="color:#666; font-size:12px;">(${i.size || '-'})</span></span> <span>R${(i.price * i.quantity).toFixed(2)}</span></li>`).join('');
    
    await transporter.sendMail({
      from: `"Others. Store" <${process.env.SMTP_FROM || process.env.ADMIN_EMAIL}>`,
      to: process.env.ADMIN_EMAIL,
      subject: `New Order Paid: #${order.id}`,
      html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff; color: #111111; line-height: 1.6;">
          <div style="text-align: center; margin-bottom: 40px;">
            <h1 style="font-size: 24px; font-weight: 800; letter-spacing: 0.15em; text-transform: uppercase; margin: 0; color: #000;">OTHERS.</h1>
          </div>
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 4px;">
            <h2 style="font-size: 18px; margin-top: 0; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #eaeaea; padding-bottom: 10px;">New Order Paid</h2>
            <p style="margin: 0 0 10px; font-size: 15px;"><strong>Order ID:</strong> #${order.id}</p>
            <p style="margin: 0 0 10px; font-size: 15px;"><strong>Customer:</strong> ${order.customer} <span style="color: #666;">(${order.email})</span></p>
            <p style="margin: 0 0 20px; font-size: 15px;"><strong>Address:</strong> ${order.address}</p>
            
            <h3 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 30px; border-bottom: 1px solid #eaeaea; padding-bottom: 10px;">Order Summary</h3>
            <ul style="list-style: none; padding: 0; margin: 0 0 20px; font-size: 15px;">
              ${itemsHtml}
            </ul>
            <div style="display: flex; justify-content: space-between; font-weight: bold; border-top: 1px solid #111; padding-top: 15px; margin-top: 15px; font-size: 16px;">
              <span>Total Paid:</span>
              <span>R${order.total.toFixed(2)}</span>
            </div>
          </div>
          <p style="text-align: center; margin-top: 40px; font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.1em;">Log into the Admin Panel to fulfill this order.</p>
        </div>
      `
    });
    console.log(`[Email] Notification sent for order ${order.id}`);
  } catch (err) {
    console.error('[Email] Failed to send invoice email:', err.message);
  }
}

// ─── Cloudinary Upload (━ replaces multer diskStorage) ────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (_req, file) => ({
    folder:         'others-store',
    resource_type:  file.mimetype.startsWith('video/') ? 'video' : 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm'],
    transformation: file.mimetype.startsWith('image/')
      ? [{ quality: 'auto', fetch_format: 'auto' }]
      : undefined,
  }),
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const ok = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm))$/.test(file.mimetype);
    cb(ok ? null : new Error('Unsupported file type'), ok);
  },
});

// ─── Cloudinary Garbage Collector Helper ──────────────────────────────────────
const deleteCloudinaryAsset = async (url) => {
  if (!url || typeof url !== 'string' || !url.includes('res.cloudinary.com')) return;
  try {
    const parts = url.split('/');
    const folderIndex = parts.indexOf('others-store');
    if (folderIndex !== -1) {
      const publicIdWithExt = parts.slice(folderIndex).join('/');
      const publicId = publicIdWithExt.replace(/\.[^/.]+$/, "");
      const isVideo = url.match(/\.(mp4|webm)$/i);
      await cloudinary.uploader.destroy(publicId, { resource_type: isVideo ? 'video' : 'image' });
      console.log(`[Cloudinary] Deleted asset: ${publicId}`);
    }
  } catch (err) {
    console.warn(`[Cloudinary] Failed to delete asset: ${url}`, err.message);
  }
};

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── DB helpers ───────────────────────────────────────────────────────────────

/** Assemble the full store data shape expected by the frontend */
async function readData() {
  const [site, categories, products, orders, lookbooks, community, pages, subscribers] = await Promise.all([
    Settings.findOne({ _id: 'main' }).lean(),
    Category.find().lean(),
    Product.find().lean(),
    Order.find().sort({ createdAt: -1 }).lean(),
    Lookbook.find().lean(),
    Article.find().lean(),
    Pages.findOne({ _id: 'main' }).lean(),
    Subscriber.find().sort({ date: -1 }).lean(),
  ]);

  return {
    site:        site        || {},
    categories:  categories  || [],
    products:    products    || [],
    orders:      orders      || [],
    lookbooks:   lookbooks   || [],
    community:   community   || [],
    pages:       pages       || { shipping: { content: '' }, faq: { items: [] }, contact: { address: '', details: [] } },
    subscribers: subscribers || [],
  };
}

/** Persist a full data blob (from admin save) back to MongoDB */
async function writeData(blob) {
  const ops = [];

  if (blob.site) {
    ops.push(Settings.findOneAndUpdate(
      { _id: 'main' }, { $set: blob.site },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    ));
  }

  if (blob.categories) {
    ops.push(...blob.categories.map(c =>
      Category.findOneAndUpdate({ id: c.id }, { $set: c }, { upsert: true })
    ));
  }

  if (blob.products) {
    ops.push(...blob.products.map(p =>
      Product.findOneAndUpdate({ id: p.id }, { $set: p }, { upsert: true })
    ));
  }

  if (blob.lookbooks) {
    ops.push(...blob.lookbooks.map(lb =>
      Lookbook.findOneAndUpdate({ id: lb.id }, { $set: lb }, { upsert: true })
    ));
  }

  if (blob.community) {
    ops.push(...blob.community.map(a =>
      Article.findOneAndUpdate({ id: a.id }, { $set: a }, { upsert: true })
    ));
  }

  if (blob.pages) {
    ops.push(Pages.findOneAndUpdate(
      { _id: 'main' }, { $set: blob.pages },
      { upsert: true, setDefaultsOnInsert: true }
    ));
  }

  if (blob.subscribers) {
    ops.push(...blob.subscribers.map(s =>
      Subscriber.findOneAndUpdate(
        { email: s.email?.toLowerCase() },
        { $set: s },
        { upsert: true }
      )
    ));
  }

  await Promise.all(ops);
}

// ─── API: Delete Product ─────────────────────────────────────────────────────
app.delete('/api/products/:id', basicAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const target = await Product.findOne({ id }).lean();
    if (!target) return res.status(404).json({ error: 'Product not found.' });
    
    // Garbage collect assets
    if (target.image) await deleteCloudinaryAsset(target.image);
    if (target.images && target.images.length) {
      for (const img of target.images) await deleteCloudinaryAsset(img);
    }
    
    await Product.deleteOne({ id });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/products/:id', err);
    res.status(500).json({ error: 'Could not delete product.' });
  }
});

// ─── API: Delete Community Post ──────────────────────────────────────────────
app.delete('/api/community/:id', basicAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const target = await Article.findOne({ id }).lean();
    if (!target) return res.status(404).json({ error: 'Post not found.' });

    // Garbage collect asset
    if (target.image) await deleteCloudinaryAsset(target.image);

    await Article.deleteOne({ id });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/community/:id', err);
    res.status(500).json({ error: 'Could not delete post.' });
  }
});

// ─── API: Delete Lookbook ────────────────────────────────────────────────────
app.delete('/api/lookbooks/:id', basicAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const target = await Lookbook.findOne({ id }).lean();
    if (!target) return res.status(404).json({ error: 'Lookbook not found.' });

    // Garbage collect assets
    if (target.items && target.items.length) {
      for (const item of target.items) {
        if (item.url) await deleteCloudinaryAsset(item.url);
      }
    }

    await Lookbook.deleteOne({ id });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/lookbooks/:id', err);
    res.status(500).json({ error: 'Could not delete lookbook.' });
  }
});

// ─── Email Notifier Helper for Customers ──────────────────────────────────────
async function sendCustomerStatusEmail(order) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !order.email) return;
  try {
    const site = await Settings.findOne({ _id: 'main' }).lean();
    const siteName = site?.name || 'Others.';
    const templates = site?.emailTemplates || {};

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      secure: Number(process.env.SMTP_PORT) === 465,
    });

    const statusMap = {
      shipped: 'shipped',
      delivered: 'delivered',
      cancelled: 'cancelled',
      paid: 'confirmed'
    };
    
    // Get custom template or fallback
    let messageBody = templates[order.status] || `Your order status has been updated to: ${order.status}.`;
    // Inject order ID
    messageBody = messageBody.replace(/{orderId}/g, `<strong>#${order.id}</strong>`);

    const itemsHtml = (order.items || []).map(i => `
      <li style="padding: 12px 0; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 14px;">
          ${i.image ? `<img src="${i.image}" style="width: 32px; height: 32px; object-fit: cover; margin-right: 12px; vertical-align: middle; background: #f5f5f5;" />` : ''}
          ${i.quantity} &times; ${i.name} <span style="color:#888; font-size:11px; margin-left: 4px;">(${i.size || '-'})</span>
        </span> 
        <span style="font-weight: 600; font-size: 14px;">${site?.currency || 'R'}${(i.price * i.quantity).toFixed(2)}</span>
      </li>`).join('');

    await transporter.sendMail({
      from: `"${siteName}" <${process.env.SMTP_FROM || process.env.ADMIN_EMAIL}>`,
      to: order.email,
      subject: `Order Update: #${order.id} [${statusMap[order.status]?.toUpperCase() || order.status.toUpperCase()}]`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 48px 24px; background-color: #ffffff; color: #111111; line-height: 1.6;">
          <div style="text-align: center; margin-bottom: 48px;">
            ${(site?.emailLogo || site?.logo) ? `<img src="${site.emailLogo || site.logo}" alt="${siteName}" style="max-height: 48px; max-width: 200px; display: block; margin: 0 auto;" />` : `<h1 style="font-size: 24px; font-weight: 800; letter-spacing: 0.15em; text-transform: uppercase; margin: 0; color: #000;">${siteName}</h1>`}
          </div>
          
          <p style="font-size: 16px; margin-bottom: 24px;">Hi ${order.customer.split(' ')[0] || 'there'},</p>
          <p style="font-size: 16px; margin-bottom: 32px; color: #333;">${messageBody}</p>
          
          ${order.adminNote ? `
          <div style="background-color: #f7f7f7; padding: 24px; border-left: 2px solid #111; margin-bottom: 32px; border-radius: 4px;">
            <p style="margin: 0; font-size: 14px; font-style: italic; color: #444; line-height: 1.5;">"${order.adminNote}"</p>
          </div>
          ` : ''}
          
          <div style="margin-bottom: 40px; border: 1px solid #eee; padding: 24px; border-radius: 8px;">
            <h3 style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #888; border-bottom: 1px solid #eee; padding-bottom: 12px; margin-top:0; margin-bottom: 16px;">Order Details</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">
              ${itemsHtml}
            </ul>
            <div style="padding-top: 16px; text-align: right; font-size: 16px; font-weight: 700;">
              Total: ${site?.currency || 'R'}${order.total.toFixed(2)}
            </div>
          </div>
          
          <p style="font-size: 16px; margin-top: 48px; margin-bottom: 8px; text-align: center; font-weight: 500;">Thank you for shopping with ${siteName}.</p>
          
          <div style="text-align: center; margin-top: 64px; font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 0.1em; border-top: 1px solid #f0f0f0; padding-top: 32px;">
            ${site?.footerTagline ? `<p style="margin-bottom: 8px;">${site.footerTagline}</p>` : ''}
            <p>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
          </div>
        </div>
      `
    });
    console.log(`[Email] Customer status update sent for order ${order.id}`);
  } catch (err) {
    console.error('[Email] Failed to send customer email:', err.message);
  }
}

// ─── API: Update Order Status (accept / reject) ─────────────────────────────────
app.patch('/api/orders/:id/status', basicAuth, async (req, res) => {
  const allowed = ['shipped', 'delivered', 'cancelled', 'paid', 'pending_payment'];
  const { status, reason } = req.body;
  if (!allowed.includes(status))
    return res.status(400).json({ error: `Invalid status. Must be one of: ${allowed.join(', ')}` });
  try {
    const oldOrder = await Order.findOne({ id: req.params.id }).lean();
    if (!oldOrder) return res.status(404).json({ error: 'Order not found.' });

    const update = { status };
    if (reason) update.adminNote = reason;
    const order = await Order.findOneAndUpdate(
      { id: req.params.id },
      { $set: update },
      { returnDocument: 'after' }
    );

    // If cancelled manually, restore stock mapped into MongoDB
    if (status === 'cancelled' && oldOrder.status !== 'cancelled') {
        const orderItems = Array.isArray(order.items) ? order.items : [];
        for (const item of orderItems) {
          const pId = item.productId || item.id;
          let query = { id: pId };
          if (mongoose.Types.ObjectId.isValid(pId)) query = { $or: [{ id: pId }, { _id: pId }] };
          await Product.updateOne(query, { $inc: { stock: item.quantity } });
        }
    }

    // Email customer if status explicitly changed
    if (status !== oldOrder.status) {
        sendCustomerStatusEmail(order).catch(console.error);
    }

    res.json({ ok: true, order });
  } catch (err) {
    console.error('PATCH /api/orders/:id/status', err);
    res.status(500).json({ error: 'Could not update order status.' });
  }
});

// ─── API: Delete Order ──────────────────────────────────────────────────────────
app.delete('/api/orders/:id', basicAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findOne({ id }).lean();
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    
    // Restore product stock if it hasn't been cancelled
    if (order.status !== 'cancelled') {
      const orderItems = Array.isArray(order.items) ? order.items : [];
      let restorationCount = 0;
      for (const item of orderItems) {
        if (!item.quantity) continue;
        const pId = item.productId || item.id;
        let query = { id: pId };
        if (mongoose.Types.ObjectId.isValid(pId)) query = { $or: [{ id: pId }, { _id: pId }] };
        const result = await Product.updateOne(query, { $inc: { stock: item.quantity } });
        if (result.modifiedCount > 0) restorationCount++;
      }
      console.log(`[Order API] Restored stock for ${restorationCount} items from deleted order ${id}`);
    }

    await Order.deleteOne({ id });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/orders/:id', err);
    res.status(500).json({ error: 'Could not delete order.' });
  }
});

// ─── API: Upload ──────────────────────────────────────────────────────────────
app.post('/api/upload', basicAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  res.json({ url: req.file.path }); // Cloudinary returns secure_url as .path
});

app.post('/api/upload/multi', basicAuth, upload.array('images', 20), (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded.' });
  res.json({ urls: req.files.map(f => f.path) }); // Cloudinary: .path = secure_url
});

// ─── API: Store Data ──────────────────────────────────────────────────────────

// ─── PWA & Favicon Manifest ───────────────────────────────────────────────────
app.get('/manifest.json', async (req, res) => {
  try {
    const site = await Settings.findOne({ _id: 'main' }).lean();
    if (!site) return res.status(404).json({ error: 'Settings not found.' });

    const name = site.name || 'Others.';
    const iconBase = site.favicon || site.logo || '';
    
    let icons = [];
    if (iconBase.includes('cloudinary.com')) {
      icons = [
        { src: iconBase.replace('/upload/', '/upload/c_pad,w_192,h_192/'), sizes: '192x192', type: 'image/png' },
        { src: iconBase.replace('/upload/', '/upload/c_pad,w_512,h_512/'), sizes: '512x512', type: 'image/png' },
        { src: iconBase.replace('/upload/', '/upload/c_pad,w_180,h_180/'), sizes: '180x180', type: 'image/png', purpose: 'apple-touch-icon' }
      ];
    }

    res.json({
      name,
      short_name: name,
      start_url: '/',
      display: 'standalone',
      background_color: site.colors?.background || '#ffffff',
      theme_color: site.colors?.primary || '#111111',
      icons
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate manifest.' });
  }
});

app.get('/api/data', async (req, res) => {
  try {
    res.json(await readData());
  } catch (err) {
    console.error('GET /api/data', err);
    res.status(500).json({ error: 'Database read failed.' });
  }
});

app.post('/api/data', basicAuth, async (req, res) => {
  try {
    await writeData(req.body);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/data', err);
    res.status(500).json({ error: 'Database write failed.' });
  }
});

// ─── API: Products (granular) ─────────────────────────────────────────────────
app.get('/api/products', async (_req, res) => {
  try { res.json(await Product.find().lean()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── API: Newsletter ──────────────────────────────────────────────────────────
app.post('/api/newsletter', async (req, res) => {
  const email = (req.body.email || '').toLowerCase().trim();
  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email.' });
  }
  try {
    const existing = await Subscriber.findOne({ email });
    if (existing) return res.json({ ok: true, already: true });

    await Subscriber.create({
      id: `s-${Date.now()}`,
      email,
      date: new Date().toISOString().slice(0, 10),
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/newsletter', err);
    res.status(500).json({ error: 'Could not save subscriber.' });
  }
});

// ─── API: Newsletter Broadcast (Admin Only) ──────────────────────────────────
app.post('/api/newsletter/broadcast', basicAuth, async (req, res) => {
  const { subject, html, subscriberIds } = req.body;
  if (!subject || !html) return res.status(400).json({ error: 'Subject and HTML body required.' });
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return res.status(500).json({ error: 'SMTP not configured on server.' });

  try {
    let query = {};
    if (subscriberIds && Array.isArray(subscriberIds) && subscriberIds.length > 0) {
      query = { _id: { $in: subscriberIds } };
    }

    const subscribers = await Subscriber.find(query).lean();
    if (subscribers.length === 0) return res.status(400).json({ error: 'No active recipients found matching selection.' });
    
    const site = await Settings.findOne({ _id: 'main' }).lean();
    const siteName = site?.name || 'Others.';

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      secure: Number(process.env.SMTP_PORT) === 465,
    });

    const emailHtml = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff; color: #111111; line-height: 1.6;">
        <div style="text-align: center; margin-bottom: 40px;">
          ${site?.logo ? `<img src="${site.logo}" alt="${siteName}" style="max-height: 45px; max-width: 200px; display: block; margin: 0 auto;" />` : `<h1 style="font-size: 24px; font-weight: 800; letter-spacing: 0.15em; text-transform: uppercase; margin: 0; color: #000;">${siteName}</h1>`}
        </div>
        
        <div style="font-size: 16px; margin-bottom: 30px;">
          ${html}
        </div>
        
        <div style="text-align: center; margin-top: 50px; font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 0.1em; border-top: 1px solid #eaeaea; padding-top: 30px;">
          <p>${site?.footerTagline || ''}</p>
          <p>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
        </div>
      </div>
    `;

    // Process individually for privacy and deliverability
    let sentCount = 0;
    for (const sub of subscribers) {
      try {
        await transporter.sendMail({
          from: `"${siteName}" <${process.env.SMTP_FROM || process.env.ADMIN_EMAIL}>`,
          to: sub.email,
          subject: subject,
          html: emailHtml
        });
        sentCount++;
      } catch (mailErr) {
        console.warn(`[Broadcast] Failed to send to ${sub.email}:`, mailErr.message);
      }
    }

    console.log(`[Broadcast] Delivered ${sentCount}/${subscribers.length} individual emails`);
    res.json({ ok: true, sentCount });
  } catch (err) {
    console.error('POST /api/newsletter/broadcast', err);
    res.status(500).json({ error: 'Mail delivery failed. Check your SMTP configurations.' });
  }
});

// ─── PayFast Helpers ─────────────────────────────────────────────────────────
/**
 * PHP-equivalent urlencode:
 * JS encodeURIComponent leaves !'()*~ unescaped and encodes spaces as %20.
 * PayFast (PHP backend) requires spaces as + and escapes those characters.
 */
function pfUrlEncode(str) {
  return encodeURIComponent(String(str).trim())
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
    .replace(/~/g, '%7E')
    .replace(/%20/g, '+');
}

function pfSignature(params) {
  const str = Object.keys(params)
    .filter(k => k !== 'signature' && params[k] !== '' && params[k] !== null && params[k] !== undefined)
    .map(k => `${k}=${pfUrlEncode(params[k])}`)
    .join('&');
  const withPassphrase = PF.passphrase
    ? `${str}&passphrase=${pfUrlEncode(PF.passphrase)}`
    : str;
  return md5(withPassphrase);
}

/** PayFast-permitted source IP ranges (keep in sync with docs) */
const PF_IPS = [
  '197.97.145.144', '197.97.145.145', '197.97.145.146', '197.97.145.147',
  '41.74.179.194',  '41.74.179.195',  '41.74.179.196',  '41.74.179.197',
];

// ─── API: Checkout (PayFast) ──────────────────────────────────────────────────
app.post('/api/checkout', async (req, res) => {
  const { order } = req.body;
  if (!order) return res.status(400).json({ error: 'Missing order.' });

  let shippingConfig = { freeMinimum: 500, standardRate: 99 };
  try {
    const site = await Settings.findOne({ _id: 'main' }).lean();
    if (site?.shipping) shippingConfig = site.shipping;
  } catch { /* use defaults */ }

  const subtotal     = parseFloat(order.total) || 0;
  const shippingCost = subtotal >= shippingConfig.freeMinimum ? 0 : shippingConfig.standardRate;
  const grandTotal   = (subtotal + shippingCost).toFixed(2);
  const orderId      = `ORD-${Date.now()}`;

  // ── Stock validation ──────────────────────────────────────────────────────
  const orderItems = Array.isArray(order.items) ? order.items : [];
  const stockErrors = [];
  const itemsToDeduct = [];
  
  for (const item of orderItems) {
    const pId = item.productId || item.id;
    let query = { id: pId };
    if (mongoose.Types.ObjectId.isValid(pId)) query = { $or: [{ id: pId }, { _id: pId }] };
    
    const product = await Product.findOne(query).lean();
    if (!product) {
      stockErrors.push(`"${item.name}" is no longer available.`);
    } else if (product.stock < item.quantity) {
      stockErrors.push(
        product.stock === 0
          ? `"${item.name}" is sold out.`
          : `"${item.name}" only has ${product.stock} unit${product.stock !== 1 ? 's' : ''} left (you requested ${item.quantity}).`
      );
    } else {
      itemsToDeduct.push({ query, quantity: item.quantity });
    }
  }
  if (stockErrors.length > 0) {
    return res.status(400).json({ error: 'Some items are out of stock.', stockErrors });
  }

  // Deduct stock safely now that we validated everything
  for (const { query, quantity } of itemsToDeduct) {
    await Product.updateOne(query, { $inc: { stock: -quantity } });
  }

  try {
    await Order.create({
      id: orderId,
      customer: order.customer || '',
      email:    order.email    || '',
      phone:    order.phone    || '',
      address:  order.address  || '',
      items:    orderItems,
      total:    parseFloat(grandTotal),
      shippingCost,
      status: 'pending_payment',
    });
  } catch (err) {
    console.error('Order save error:', err.message);
    return res.status(500).json({ error: 'Could not create order.' });
  }

  const baseUrl = `${req.protocol}://${req.get('host')}`;

  // Fields MUST be in this exact order per PayFast documentation
  const params = {};
  // Merchant details
  params.merchant_id   = PF.merchantId;
  params.merchant_key  = PF.merchantKey;
  // Return URLs
  params.return_url    = `${baseUrl}/payment/success`;
  params.cancel_url    = `${baseUrl}/payment/cancel?orderId=${orderId}`;
  params.notify_url    = `${baseUrl}/api/payfast/itn`;
  // Buyer details
  params.name_first    = (order.customer || 'Customer').split(' ')[0].slice(0, 100);
  params.name_last     = (order.customer || '').split(' ').slice(1).join(' ').slice(0, 100);
  params.email_address = (order.email || '').slice(0, 255);
  // Transaction details
  params.m_payment_id  = orderId;           // our internal order reference
  params.amount        = grandTotal;        // must be '0.00' format, min R1.00
  params.item_name     = `Others. Order ${orderId}`.slice(0, 100);
  params.item_description = `${order.items?.length || 1} item(s)`.slice(0, 255);

  // Clean the params object of any empty properties so they don't get piped to the form
  Object.keys(params).forEach(k => {
    if (params[k] === '' || params[k] === null || params[k] === undefined) {
      delete params[k];
    }
  });

  // Generate signature (passphrase appended inside pfSignature)
  params.signature = pfSignature(params);

  res.json({ paymentUrl: PF_HOST, params, orderId });
});

// ─── API: Cancel Payment (Restore Stock) ───────────────────────────────────────
app.post('/api/payfast/cancel', async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: 'Missing orderId.' });

  try {
    const order = await Order.findOne({ id: orderId });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    // Only cancel if it's still pending_payment to avoid double-cancelling or cancelling paid orders
    if (order.status === 'pending_payment') {
      order.status = 'cancelled';
      await order.save();

      // Restore stock
      const orderItems = Array.isArray(order.items) ? order.items : [];
      for (const item of orderItems) {
        const pId = item.productId || item.id;
        let query = { id: pId };
        if (mongoose.Types.ObjectId.isValid(pId)) query = { $or: [{ id: pId }, { _id: pId }] };
        await Product.updateOne(query, { $inc: { stock: item.quantity } });
      }
      
      console.log(`[PayFast] Order ${orderId} cancelled by user. Stock restored.`);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Cancel payment error:', err);
    res.status(500).json({ error: 'Failed to process cancellation.' });
  }
});

// ─── API: PayFast ITN ─────────────────────────────────────────────────────────
app.post('/api/payfast/itn', async (req, res) => {
  // Step 1 — Respond 200 immediately so PayFast does not retry
  res.status(200).send('OK');

  try {
    // Step 2 — IP allowlist check (skip in sandbox mode)
    if (!PF.sandbox) {
      const srcIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      if (!PF_IPS.includes(srcIp)) {
        console.warn(`ITN: rejected from untrusted IP ${srcIp}`);
        return;
      }
    }

    const itnData = req.body;
    const { m_payment_id: orderId, payment_status, pf_payment_id, amount_gross } = itnData;

    // Step 3 — Validate signature
    const received = { ...itnData };
    delete received.signature; // exclude from re-computation
    if (pfSignature(received) !== itnData.signature) {
      console.warn('ITN: invalid signature — possible tampering, ignoring.');
      return;
    }

    // Step 4 — Compare amount against our DB record (prevent amount tampering)
    const dbOrder = await Order.findOne({ id: orderId }).lean();
    if (!dbOrder) {
      console.warn(`ITN: order ${orderId} not found in DB.`);
      return;
    }
    if (Math.abs(parseFloat(amount_gross) - dbOrder.total) > 0.05) {
      console.warn(`ITN: amount mismatch — ITN ${amount_gross} vs DB ${dbOrder.total}`);
      return;
    }

    // Step 5 — Server-to-server data validation with PayFast
    if (!PF.sandbox) {
      const pfValidateHost = 'www.payfast.co.za';
      const pfValidatePath = '/eng/query/validate';
      const pfBody = Object.entries(itnData)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      try {
        const { default: https } = await import('node:https');
        await new Promise((resolve, reject) => {
          const pfReq = https.request({
            host: pfValidateHost, path: pfValidatePath, method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(pfBody) },
          }, pfRes => {
            let body = '';
            pfRes.on('data', c => (body += c));
            pfRes.on('end', () => body.trim() === 'VALID' ? resolve() : reject(new Error(`PayFast validation: ${body.trim()}`)));
          });
          pfReq.on('error', reject);
          pfReq.write(pfBody);
          pfReq.end();
        });
      } catch (e) {
        console.warn('ITN: PayFast server validation failed —', e.message);
        return;
      }
    }

    // Step 6 — All checks passed, update order status
    if (payment_status === 'COMPLETE') {
      const updated = await Order.findOneAndUpdate(
        { id: orderId },
        { $set: { status: 'paid', payfastId: pf_payment_id || '' } },
        { returnDocument: 'after' }
      );
      if (updated) sendOrderNotification(updated).catch(e => console.error(e));
      console.log(`✓ ITN: order ${orderId} marked PAID (PayFast ID: ${pf_payment_id})`);
    } else {
      const updated = await Order.findOneAndUpdate(
        { id: orderId },
        { $set: { status: 'cancelled' } },
        { returnDocument: 'before' }
      );
      // Only selectively restore stock if the order wasn't ALREADY cancelled.
      if (updated && updated.status !== 'cancelled') {
        const orderItems = Array.isArray(updated.items) ? updated.items : [];
        for (const item of orderItems) {
          const pId = item.productId || item.id;
          let query = { id: pId };
          if (mongoose.Types.ObjectId.isValid(pId)) query = { $or: [{ id: pId }, { _id: pId }] };
          await Product.updateOne(query, { $inc: { stock: item.quantity } });
        }
      }
      console.log(`ITN: order ${orderId} — payment_status=${payment_status}`);
    }
  } catch (err) {
    console.error('ITN processing error:', err.message);
  }
});

// ─── Admin Routes (Basic Auth protected) ─────────────────────────────────────
app.get(/^\/admin(\/.*)?$/, basicAuth, (_req, res) => {
  res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
});

// ─── SPA Fallback ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
connect().then(() => {
  app.listen(port, () => {
    console.log(`\nOthers. Store  → http://localhost:${port}`);
    console.log(`PayFast mode   → ${PF.sandbox ? 'SANDBOX' : 'LIVE'}`);
    console.log(`Admin          → http://localhost:${port}/admin  [${ADMIN_USER}]`);
    console.log(`MongoDB        → connected\n`);
  });
});
