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
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { connect, getIsConnected } = require('./src/db/connection');
const { Settings, Category, Product, Order, Lookbook, Article, Pages, Subscriber, Log } = require('./src/db/models');
const crypto = require('crypto');

const app  = express();
const port = process.env.PORT || 3000;

// Add HTTP request logging
app.use(morgan('dev'));

// Trust the edge proxy (Fly.io, Heroku, etc) so req.protocol properly detects HTTPS
app.set('trust proxy', 1);

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Disabled to avoid breaking Cloudinary/External fonts for now
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requests per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) => req.path.startsWith('/admin') // Don't limit admin if same IP
});

const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 checkouts per hour per IP
  message: { error: 'Too many checkouts. Please wait an hour.' }
});

app.use('/api/checkout', checkoutLimiter);
app.use('/api/', apiLimiter);

// ─── Admin Auth ───────────────────────────────────────────────────────────────
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;

if (!ADMIN_USER || !ADMIN_PASS) {
  console.error('FATAL: ADMIN_USER and ADMIN_PASS must be set in .env');
  process.exit(1);
}

// ─── System Failsafe (Hard Maintenance) ───────────────────────────────────────
const hardMaintenanceHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Others. — Maintenance</title>
    <style>
        body { margin: 0; background: #000; color: #fff; height: 100vh; display: flex; align-items: center; justify-content: center; text-align: center; font-family: sans-serif; }
        h1 { font-family: serif; font-size: 3rem; letter-spacing: 0.2em; margin-bottom: 1.5rem; }
        p { color: #666; max-width: 400px; line-height: 1.6; font-size: 0.9rem; }
    </style>
</head>
<body>
    <div>
        <h1>OTHERS.</h1>
        <p>Our store is currently undergoing urgent technical maintenance. We apologize for the inconvenience and will be back shortly.</p>
    </div>
</body>
</html>
`;

app.use((req, res, next) => {
  // If DB is down, intercept public routes
  // Bypass if: Admin route OR API route OR static asset
  const isAsset = /\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|json|woff2?|mp4|webm|map)$/i.test(req.path);
  const isAdmin = req.path.startsWith('/admin') || req.path.startsWith('/api/admin');
  const isApi = req.path.startsWith('/api/');

  if (!getIsConnected() && !isAdmin && !isApi && !isAsset) {
    return res.status(503).send(hardMaintenanceHTML);
  }
  next();
});

function basicAuth(req, res, next) {
  const h = req.headers['authorization'];
  if (!h || !h.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Others. Admin"');
    return res.status(401).send('Authentication required.');
  }
  
  try {
    const [user, pass] = Buffer.from(h.slice(6), 'base64').toString().split(':');
    
    // Timing-safe comparison to prevent side-channel attacks
    const userBuffer = Buffer.from(user);
    const adminUserBuffer = Buffer.from(ADMIN_USER);
    const passBuffer = Buffer.from(pass);
    const adminPassBuffer = Buffer.from(ADMIN_PASS);

    if (userBuffer.length === adminUserBuffer.length &&
        passBuffer.length === adminPassBuffer.length &&
        crypto.timingSafeEqual(userBuffer, adminUserBuffer) &&
        crypto.timingSafeEqual(passBuffer, adminPassBuffer)) {
      return next();
    }
  } catch (e) {
    // Basic auth format error
  }

  res.set('WWW-Authenticate', 'Basic realm="Others. Admin"');
  return res.status(401).send('Invalid credentials.');
}

// ─── PayFast Config ───────────────────────────────────────────────────────────
const isSandbox = process.env.PAYFAST_SANDBOX === 'true';

const PF = {
  merchantId:  (isSandbox ? process.env.PAYFAST_MERCHANT_ID_SANDBOX : process.env.PAYFAST_MERCHANT_ID_LIVE) || '',
  merchantKey: (isSandbox ? process.env.PAYFAST_MERCHANT_KEY_SANDBOX : process.env.PAYFAST_MERCHANT_KEY_LIVE) || '',
  passphrase:  (isSandbox ? process.env.PAYFAST_PASSPHRASE_SANDBOX : process.env.PAYFAST_PASSPHRASE_LIVE) || '',
  sandbox:     isSandbox,
};

// Simple visual indicator of active payment mode
console.log(`PayFast mode   → ${PF.sandbox ? 'SANDBOX' : 'LIVE'}`);

if (!PF.merchantId || !PF.merchantKey) {
  console.error(`FATAL: PAYFAST_MERCHANT_ID_${PF.sandbox ? 'SANDBOX' : 'LIVE'} and PAYFAST_MERCHANT_KEY_${PF.sandbox ? 'SANDBOX' : 'LIVE'} must be set in .env`);
  process.exit(1);
}
const PF_HOST = PF.sandbox
  ? 'https://sandbox.payfast.co.za/eng/process'
  : 'https://www.payfast.co.za/eng/process';

// ─── Email Notifier ──────────────────────────────────────────────────────────
async function sendOrderNotification(order) {
  let recipients = ['othersworldwide@gmail.com'];
  try {
    const site = await Settings.findOne({ _id: 'main' }).lean();
    if (site?.adminNotificationEmails) {
      recipients = site.adminNotificationEmails.split(',').map(s => s.trim()).filter(Boolean);
    } else if (process.env.ADMIN_EMAIL) {
      recipients = [process.env.ADMIN_EMAIL];
    }
    
    await Log.create({
      id: `log-${Date.now()}-adm-mail`,
      type: 'info', message: `Order notification: Sending to ${recipients.join(', ')}`,
      context: 'EMAIL', data: { orderId: order.id, recipients }
    }).catch(() => {});
  } catch (e) {
    console.error('Failed to fetch admin emails for notification:', e);
  }

  if (recipients.length === 0 || !process.env.SMTP_HOST) return;

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
      from: `"Others. Store" <${process.env.SMTP_FROM || process.env.ADMIN_EMAIL || 'othersworldwide@gmail.com'}>`,
      to: recipients.join(', '),
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
  
  await Log.create({
    id: `log-${Date.now()}-cus-mail`,
    type: 'info', message: `Customer update: Sending "${order.status}" email to ${order.email}`,
    context: 'EMAIL', data: { orderId: order.id, status: order.status, email: order.email }
  }).catch(() => {});
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
  const allowed = ['processing', 'shipped', 'delivered', 'cancelled', 'paid', 'pending_payment'];
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

// ─── API: Admin Diagnostics ──────────────────────────────────────────────────
app.get('/api/admin/status', basicAuth, async (req, res) => {
  try {
    const isConn = getIsConnected();
    const dbStatus = isConn ? 'connected' : 'disconnected';
    const cloudinaryOk = !!(process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_CLOUD_NAME);
    let emailStatus = (process.env.SMTP_HOST && process.env.SMTP_USER) ? 'configured' : 'not_configured';

    let stats = { orders: 0, products: 0, subscribers: 0, logs: 0 };
    if (isConn) {
      try {
        stats = {
          orders: await Order.countDocuments(),
          products: await Product.countDocuments(),
          subscribers: await Subscriber.countDocuments(),
          logs: await Log.countDocuments({ type: 'error' }),
        };
      } catch (e) {
        console.warn('Could not fetch DB stats:', e.message);
      }
    }

    res.json({
      db: dbStatus,
      email: emailStatus,
      cloudinary: cloudinaryOk ? 'configured' : 'missing',
      stats,
      _db_offline: !isConn
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch diagnostics.' });
  }
});

app.get('/api/admin/logs', basicAuth, async (req, res) => {
  try {
    if (!getIsConnected()) {
      return res.json([{ 
        timestamp: new Date(), 
        type: 'error', 
        context: 'SYSTEM', 
        message: 'DATABASE DISCONNECTED: Persistent logs are currently unavailable.' 
      }]);
    }
    const logs = await Log.find().sort({ timestamp: -1 }).limit(100).lean();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs.' });
  }
});

app.delete('/api/admin/logs', basicAuth, async (req, res) => {
  try {
    await Log.deleteMany({});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear logs.' });
  }
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
    if (!getIsConnected()) {
      return res.json({
        site: { name: 'Others. (DATABASE OFFLINE)', logo: '', currency: 'R', navLogoSize: 40 },
        categories: [], products: [], orders: [], lookbooks: [], community: [], subscribers: [],
        pages: { shipping: { content: '' }, faq: { items: [] }, contact: { address: '', details: [] } },
        _db_offline: true
      });
    }
    const data = await readData();
    res.json(data);
  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({ error: 'Failed to fetch data' });
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
    .filter(k => k !== 'signature' && params[k] !== null && params[k] !== undefined)
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
  
  await Log.create({
    id: `log-${Date.now()}-checkout`,
    type: 'info', message: 'Checkout initiated',
    context: 'PAYMENT', data: { customer: order?.customer, email: order?.email, total: order?.total }
  }).catch(() => {});
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

  await Log.create({
    id: `log-${Date.now()}-itn-rx`,
    type: 'info', message: 'ITN: Request received from PayFast',
    context: 'PAYFAST_ITN', data: { body: req.body, ip: (req.headers['x-forwarded-for'] || req.socket.remoteAddress) }
  }).catch(() => {});

  try {
    // Step 2 — IP allowlist check (skip in sandbox mode)
    if (!PF.sandbox) {
      const srcIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      if (!PF_IPS.includes(srcIp)) {
        await Log.create({
          id: `log-${Date.now()}-itn-ip`,
          type: 'warn', message: `ITN: rejected from untrusted IP ${srcIp}`,
          context: 'PAYFAST_ITN', data: { ip: srcIp }
        });
        return;
      }
    }

    const itnData = req.body;
    const { m_payment_id: orderId, payment_status, pf_payment_id, amount_gross } = itnData;

    const received = { ...itnData };
    delete received.signature;
    const computed = pfSignature(received);
    if (computed !== itnData.signature) {
      await Log.create({
        id: `log-${Date.now()}-itn-sig`,
        type: 'error', message: 'ITN: invalid signature (tampering check failed)',
        context: 'PAYFAST_ITN', data: { received: itnData.signature, computed, orderId }
      });
      return;
    }

    const dbOrder = await Order.findOne({ id: orderId }).lean();
    if (!dbOrder) {
      await Log.create({
        id: `log-${Date.now()}-itn-orphan`,
        type: 'error', message: `ITN: received for unknown order ${orderId}`,
        context: 'PAYFAST_ITN', data: { itnData }
      });
      return;
    }
    if (Math.abs(parseFloat(amount_gross) - dbOrder.total) > 0.05) {
      await Log.create({
        id: `log-${Date.now()}-itn-amt`,
        type: 'error', message: `ITN: amount mismatch for #${orderId}`,
        context: 'PAYFAST_ITN', data: { orderId, itnAmount: amount_gross, dbTotal: dbOrder.total }
      });
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
      if (updated) {
        await Log.create({
          id: `log-${Date.now()}-pay-ok`,
          type: 'info', message: `Payment completed for order ${orderId}`,
          context: 'PAYMENT', data: { orderId, pfId: pf_payment_id }
        }).catch(() => {});

        // Trigger admin notifications for the newly paid order
        sendOrderNotification(updated).catch(e => console.error('Error sending ITN admin notification:', e));
        
        // Also send customer success email
        sendCustomerStatusEmail(updated).catch(e => console.error('Error sending ITN customer email:', e));
      }
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
      await Log.create({
        id: `log-${Date.now()}-pay-fail`,
        type: 'warn', message: `Payment failure/cancel: status=${payment_status} for order ${orderId}`,
        context: 'PAYMENT', data: { orderId, status: payment_status }
      }).catch(() => {});

      console.log(`ITN: order ${orderId} — payment_status=${payment_status}`);
    }
  } catch (err) {
    console.error('ITN processing error:', err.message);
  }
});

// ─── Individual Product SEO (Dynamic OG Tags) ─────────────────────────────────
app.get('/shop/:id', async (req, res) => {
  try {
    const product = await Product.findOne({ id: req.params.id });
    const indexPath = path.resolve(__dirname, 'public', 'index.html');
    let html = fs.readFileSync(indexPath, 'utf-8');

    if (product) {
      const title = `${product.name} — Others.`;
      const desc = (product.description || '').replace(/"/g, '&quot;').slice(0, 200);
      let img = product.image || (product.images && product.images[0]) || '';
      
      // Basic Cloudinary optimization for sharing
      if (img.includes('res.cloudinary.com')) {
        img = img.replace('/upload/', '/upload/c_limit,w_1200,q_auto,f_auto/');
      }

      const meta = `
  <title>${title}</title>
  <meta name="description" content="${desc}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:image" content="${img}">
  <meta property="og:url" content="${req.protocol}://${req.get('host')}${req.originalUrl}">
  <meta property="og:type" content="product">
  <meta name="twitter:card" content="summary_large_image">`;

      // Inject into head (replace default title if present)
      html = html.replace('<title>The Other Shop</title>', '');
      html = html.replace('<head>', `<head>${meta}`);
    }
    res.send(html);
  } catch (err) {
    console.warn('Metadata injection failed:', err.message);
    res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
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
connect().catch(err => {
  console.error('Initial DB Connection failed - starting in failsafe mode');
});

app.listen(port, () => {
  console.log(`\nOthers. Store  → http://localhost:${port}`);
  console.log(`PayFast mode   → ${PF.sandbox ? 'SANDBOX' : 'LIVE'}`);
  console.log(`Admin          → http://localhost:${port}/admin  [${ADMIN_USER}]`);
  console.log(`MongoDB        → ${getIsConnected() ? 'connected' : 'OFFLINE (failsafe active)'}\n`);
});

// ─── Database Alerts ─────────────────────────────────────────────────────────
mongoose.connection.on('disconnected', () => {
  notifyAdminOfError(
    new Error('DATABASE_CONNECTION_LOST'),
    null,
    'CRITICAL: The store database has disconnected. Automated Hard Maintenance mode is now active.'
  ).catch(e => console.error('Failsafe alert failed:', e.message));
});

// ─── Error Notification ──────────────────────────────────────────────────────
let lastErrorEmailTime = 0;
const ERROR_EMAIL_THROTTLE = 15 * 60 * 1000; // 15 minutes

async function notifyAdminOfError(err, req = null, customMsg = null) {
  if (!process.env.ADMIN_EMAIL || !process.env.SMTP_HOST) return;
  const now = Date.now();
  if (now - lastErrorEmailTime < ERROR_EMAIL_THROTTLE) return;
  
  lastErrorEmailTime = now;
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      secure: Number(process.env.SMTP_PORT) === 465,
    });

    const site = await Settings.findOne({ _id: 'main' }).lean();
    let recipients = site?.adminNotificationEmails 
      ? site.adminNotificationEmails.split(',').map(s => s.trim()).filter(Boolean)
      : (process.env.ADMIN_EMAIL ? [process.env.ADMIN_EMAIL] : ['othersworldwide@gmail.com']);

    if (recipients.length === 0) return;

    await transporter.sendMail({
      from: `"Others. System" <${process.env.SMTP_FROM || process.env.ADMIN_EMAIL || 'othersworldwide@gmail.com'}>`,
      to: recipients.join(', '),
      subject: `[ALERT] Site Error: ${err.message.slice(0, 50)}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #111; max-width: 600px; border: 1px solid #eee;">
          <h2 style="color: #d32f2f; text-transform: uppercase; letter-spacing: 0.1em;">${customMsg ? 'System Alert' : 'Critical Site Error'}</h2>
          <p>${customMsg || 'The system detected an internal error that might require your attention.'}</p>
          <div style="background: #f9f9f9; padding: 15px; border-left: 4px solid #d32f2f; margin: 20px 0;">
            ${req ? `<p style="margin: 0 0 10px;"><strong>Path:</strong> ${req.method} ${req.url}</p>` : ''}
            <p style="margin: 0;"><strong>Message:</strong> ${err.message}</p>
          </div>
          <p style="margin-top: 30px;">
            <a href="${req ? `${req.protocol}://${req.get('host')}` : 'http://localhost:' + port}/admin" 
               style="display: inline-block; padding: 12px 24px; background: #000; color: #fff; text-decoration: none; font-weight: bold; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase;">
               Open Admin Dashboard
            </a>
          </p>
          <hr style="margin: 30px 0; border: 0; border-top: 1px solid #eee;" />
          <p style="font-size: 12px; color: #888;">This alert is throttled to once every 15 minutes.</p>
        </div>
      `
    });
  } catch (e) {
    console.error('Failed to send error notification email:', e);
  }
}

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  const status = err.status || 500;
  
  // Log to DB
  Log.create({
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: status >= 500 ? 'error' : 'warn',
    message: err.message,
    context: 'SERVER_ERROR',
    data: { 
      path: req.url, 
      method: req.method,
      stack: err.stack?.slice(0, 500)
    }
  }).catch(e => console.error('Failed to save log to DB:', e));

  // Notify admin if it's a 500 error
  if (status === 500) {
    notifyAdminOfError(err, req).catch(console.error);
  }

  console.error(`[Server Error] ${req.method} ${req.url}`, err);
  
  res.status(status).json({
    error: status === 500 ? 'Internal Server Error' : err.message,
    ok: false
  });
});
