'use strict';

// ─── Courier Guy (Ship Logic) API client ─────────────────────────────────────
// Reference: Postman collection "The Courier Guy API" (Ship Logic platform).
// Kept independent of Mongoose/Express on purpose — callers (server.js routes)
// resolve DB data into plain objects first, this module only talks to the
// courier's HTTP API. That split is what makes this testable and keeps a
// courier-API quirk from ever needing a change to route/DB code.
//
// Sandbox vs live: the docs are explicit that requests shown as
// api.portal.thecourierguy.co.za must actually go to api.shiplogic.com while
// testing in the sandbox — the displayed URL is the *live* one. Get this
// backwards and every request 401s with a real-looking key.
const SANDBOX_BASE_URL = 'https://api.shiplogic.com';
const LIVE_BASE_URL = 'https://api.portal.thecourierguy.co.za';

// Every documented status the API can return for a shipment/parcel, mapped to a
// short display label and a coarse "stage" the admin UI groups on. Two statuses
// intentionally map to the same stage as their related "assigned" status per the
// docs' own note that end-users aren't shown collection/delivery-unassigned or
// -rejected as distinct states.
const STATUS_INFO = {
  'submitted':                { label: 'Submitted',              stage: 'booked' },
  'collection-assigned':      { label: 'Collection scheduled',   stage: 'collection' },
  'collection-unassigned':    { label: 'Collection scheduled',   stage: 'collection' },
  'collection-rejected':      { label: 'Collection scheduled',   stage: 'collection' },
  'collection-exception':     { label: 'Collection issue',       stage: 'exception' },
  'collection-failed-attempt':{ label: 'Collection attempt failed', stage: 'exception' },
  'collected':                { label: 'Collected',              stage: 'transit' },
  'awaiting-dropoff':         { label: 'Awaiting drop-off',      stage: 'collection' },
  'at-hub':                   { label: 'At courier hub',         stage: 'transit' },
  'on-hold':                  { label: 'On hold',                stage: 'exception' },
  'on-hold-internal':         { label: 'At courier hub',         stage: 'transit' },
  'returned-to-hub':          { label: 'Returned to hub',        stage: 'exception' },
  'manifested':               { label: 'Manifested',             stage: 'transit' },
  'ready-for-dispatch':       { label: 'Ready for dispatch',     stage: 'transit' },
  'in-transit':               { label: 'In transit',             stage: 'transit' },
  'at-destination-hub':       { label: 'At destination hub',     stage: 'transit' },
  'delivery-assigned':        { label: 'Out for delivery soon',  stage: 'delivery' },
  'delivery-unassigned':      { label: 'Out for delivery soon',  stage: 'delivery' },
  'delivery-rejected':        { label: 'Out for delivery soon',  stage: 'delivery' },
  'out-for-delivery':         { label: 'Out for delivery',       stage: 'delivery' },
  'delivery-exception':       { label: 'Delivery issue',         stage: 'exception' },
  'delivery-failed-attempt':  { label: 'Delivery attempt failed', stage: 'exception' },
  'ready-for-pickup':         { label: 'Ready for pickup',       stage: 'delivery' },
  'delivered':                { label: 'Delivered',              stage: 'done' },
  'returned-to-sender':       { label: 'Returned to sender',     stage: 'exception' },
  'undeliverable':            { label: 'Undeliverable',          stage: 'exception' },
  'cancelled':                { label: 'Cancelled',              stage: 'cancelled' },
  'floor-check':              { label: 'Floor check',            stage: 'transit' },
  // Seen only on the tracking endpoint's status list, not the shipment-statuses
  // page's descriptions — kept so an unrecognised-looking status still renders.
  'swad-dimensions':          { label: 'Dimensions being checked', stage: 'transit' },
  'swad-imaging':             { label: 'Being imaged',           stage: 'transit' },
  'in-locker':                { label: 'In locker',              stage: 'delivery' },
  'collect-and-return-to-hub':{ label: 'Returning to hub',       stage: 'exception' },
  'collected-from-locker':    { label: 'Collected from locker',  stage: 'done' },
  'collected-from-counter':   { label: 'Collected from counter', stage: 'done' },
};

function statusInfo(status) {
  return STATUS_INFO[status] || { label: status || 'Unknown', stage: 'unknown' };
}

function isSandbox() {
  // Defaults to sandbox (the safer default) — same reasoning as this project's
  // existing PAYFAST_SANDBOX default: an unset flag should never accidentally
  // book a real, billable shipment.
  return process.env.COURIER_GUY_SANDBOX !== 'false';
}

function apiKey() {
  // COURIER_GUY_API_KEY is the documented name; COURIER_GUY is accepted too so an
  // already-set env var doesn't need renaming to start working.
  return process.env.COURIER_GUY_API_KEY || process.env.COURIER_GUY || '';
}

function isConfigured() {
  return Boolean(apiKey());
}

function baseUrl() {
  return isSandbox() ? SANDBOX_BASE_URL : LIVE_BASE_URL;
}

/**
 * Low-level request helper. Every call site gets back a consistent
 * `{ ok, status, data, error }` shape instead of a thrown exception for
 * expected API-level failures (400/401/403/404/429/500/etc.) — callers only
 * need a try/catch for truly unexpected bugs, matching this codebase's existing
 * pattern (see sendCustomerStatusEmail's {sent, reason} return shape).
 */
async function request(method, path, body) {
  if (!isConfigured()) {
    return { ok: false, status: 0, error: 'Courier Guy is not configured (no API key set).' };
  }

  // "/v3" forces JSON error bodies — without it, some error responses come back
  // as plain text, which would otherwise need a second code path just to avoid
  // throwing on JSON.parse. See "HTTP responses" in the docs.
  const url = `${baseUrl()}/v3${path}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${apiKey()}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    // Network failure, DNS failure, or our own 15s abort — none of these ever
    // reach the API, so there's no status code to report.
    const timedOut = err.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      error: timedOut
        ? 'Courier Guy did not respond in time (15s). Please try again.'
        : `Could not reach Courier Guy: ${err.message}`,
    };
  } finally {
    clearTimeout(timeout);
  }

  // 204 No Content (DELETE-style success) has no body to parse at all.
  if (res.status === 204) {
    return { ok: true, status: 204, data: null };
  }

  const rawText = await res.text();
  let data = null;
  let parseFailed = false;
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      // Despite the /v3 prefix, still defend against a non-JSON body rather
      // than letting a courier-side quirk crash the request.
      parseFailed = true;
    }
  }

  if (res.ok) {
    return { ok: true, status: res.status, data: parseFailed ? rawText : data };
  }

  // Prefer the API's own descriptive message (the docs promise one on 400/403);
  // fall back to a plain-English explanation per documented status code.
  const apiMessage = !parseFailed && data && (data.error || data.message || data.errors);
  const fallbackByStatus = {
    400: 'Request rejected as invalid.',
    401: 'Courier Guy API key is invalid or has been revoked — check the key in Settings.',
    403: 'Not permitted to perform this action on this Courier Guy account.',
    404: 'Courier Guy endpoint or resource not found.',
    405: 'Courier Guy rejected the request method (likely an integration bug).',
    412: 'Courier Guy requires a customer reference for this branch.',
    422: 'Courier Guy could not process this request.',
    423: 'This Courier Guy account is closed.',
    429: 'Too many requests to Courier Guy — please wait a moment and try again.',
    500: 'Courier Guy had an internal error. Usually safe to retry shortly.',
  };
  const error = (typeof apiMessage === 'string' && apiMessage)
    || (Array.isArray(apiMessage) && apiMessage.join('; '))
    || fallbackByStatus[res.status]
    || (parseFailed ? rawText.slice(0, 300) : `Courier Guy returned HTTP ${res.status}.`);

  return { ok: false, status: res.status, error, raw: parseFailed ? rawText : data };
}

/** Ship Logic's shared address shape. `type` defaults sensibly per side rather
 * than being left to the API's own 'unknown' default, since we always know
 * whether an address is the store (business) or a customer (residential). */
function toAddress({ company = '', street, local_area, city, zone, country = 'ZA', code, lat, lng, type }) {
  const addr = {
    type,
    company,
    street_address: street || '',
    local_area: local_area || '',
    city: city || '',
    zone: zone || '',
    country,
    code: code || '',
  };
  if (typeof lat === 'number' && typeof lng === 'number') {
    addr.lat = lat;
    addr.lng = lng;
  }
  return addr;
}

/** Builds the collection_address/collection_contact pair from site settings.
 * Every shipment uses the same one — it's the store's own pickup point, not
 * anything on the order. */
function collectionFromSite(site) {
  const c = site?.courier || {};
  return {
    address: toAddress({
      type: 'business',
      company: c.collectionCompany,
      street: c.collectionStreet,
      local_area: c.collectionSuburb,
      city: c.collectionCity,
      zone: c.collectionProvince,
      country: c.collectionCountry || 'ZA',
      code: c.collectionPostalCode,
    }),
    contact: {
      name: c.collectionContactName || '',
      mobile_number: c.collectionMobileNumber || '',
      email: c.collectionEmail || '',
    },
  };
}

/** Builds the delivery_address/delivery_contact pair from an order. The
 * checkout form collects one combined "city/suburb" field, so it's used for
 * both `city` and `local_area` — better duplicated than left blank, since
 * `local_area` only improves geocoding accuracy and isn't itself required. */
function deliveryFromOrder(order) {
  return {
    address: toAddress({
      type: 'residential',
      street: order.deliveryStreet,
      local_area: order.deliveryCity,
      city: order.deliveryCity,
      zone: order.deliveryProvince,
      country: order.deliveryCountry || 'ZA',
      code: order.deliveryPostalCode,
    }),
    contact: {
      name: order.customer || '',
      mobile_number: order.phone || '',
      email: order.email || '',
    },
  };
}

/**
 * Resolves the parcel(s) for an order into Ship Logic's shape. One consolidated
 * parcel per order (assumes everything ships together in one box, which is true
 * for the vast majority of clothing orders): weight is genuinely additive so
 * it's summed from each line item's real product weight (falling back to the
 * site default per unit when a product has none set); dimensions use the site's
 * default box size rather than summing product dimensions, since stacking items
 * into one box doesn't make its length the sum of every item's length.
 *
 * `products` is a Map of productId -> product (already fetched by the caller —
 * kept out of this module to avoid a Mongoose dependency here).
 */
function buildParcel({ order, site, products, overrides = {} }) {
  const c = site?.courier || {};
  const defaultWeight = c.defaultParcelWeightKg || 1;

  let weightKg = 0;
  for (const item of order.items || []) {
    const product = products?.get(item.id);
    const unitWeight = product?.weightKg > 0 ? product.weightKg : defaultWeight;
    weightKg += unitWeight * (item.quantity || 1);
  }
  if (weightKg <= 0) weightKg = defaultWeight;

  const parcel = {
    parcel_description: `Order #${order.id}`,
    submitted_length_cm: overrides.lengthCm ?? (c.defaultParcelLengthCm || 30),
    submitted_width_cm:  overrides.widthCm  ?? (c.defaultParcelWidthCm  || 25),
    submitted_height_cm: overrides.heightCm ?? (c.defaultParcelHeightCm || 10),
    submitted_weight_kg: overrides.weightKg ?? Math.round(weightKg * 100) / 100,
  };
  return [parcel];
}

/** Rates and shipment-creation both need real address fields on both sides.
 * Checked here, before ever calling the API, so an incomplete Settings >
 * Courier Guy address fails fast with a specific "go fill this in" message —
 * rather than round-tripping to Ship Logic only to surface their own equally
 * real but less actionable error (e.g. plain "The collection address is
 * missing.", with no indication of where to fix that). */
function addressError(address, whatLabel, whereToFixIt) {
  if (!address.street_address || !address.code) {
    return `${whatLabel} is missing a street address or postal code${whereToFixIt ? ` — set it in ${whereToFixIt}` : ''}.`;
  }
  return null;
}

/** POST /rates — quotes service levels for a delivery address + parcel set.
 * Returns the raw rate objects verbatim (see the caveat in the module doc
 * comment below about the exact response shape) alongside the request that was
 * sent, so a caller can display both if the shape turns out to need adjusting. */
async function getRates({ site, order, parcels, declaredValue }) {
  const collection = collectionFromSite(site);
  const delivery = deliveryFromOrder(order);

  const collectionErr = addressError(collection.address, "The store's collection address", 'Settings → Courier Guy');
  if (collectionErr) return { ok: false, status: 0, error: collectionErr };
  const deliveryErr = addressError(delivery.address, "This order's delivery address", null);
  if (deliveryErr) return { ok: false, status: 0, error: deliveryErr };

  const body = {
    collection_address: collection.address,
    delivery_address: delivery.address,
    parcels,
  };
  if (declaredValue) body.declared_value = declaredValue;
  return request('POST', '/rates', body);
}

/** POST /shipments — books the shipment. Returns the created shipment object on
 * success (id, tracking references, rate, service level, etc.) exactly as
 * Courier Guy sent it back — server.js is responsible for extracting the
 * fields it wants onto the Order document. */
async function createShipment({ site, order, parcels, serviceLevelCode, serviceLevelId, declaredValue, customTrackingReference, specialInstructions }) {
  const collection = collectionFromSite(site);
  const delivery = deliveryFromOrder(order);

  const collectionErr = addressError(collection.address, "The store's collection address", 'Settings → Courier Guy');
  if (collectionErr) return { ok: false, status: 0, error: collectionErr };
  const deliveryErr = addressError(delivery.address, "This order's delivery address", null);
  if (deliveryErr) return { ok: false, status: 0, error: deliveryErr };
  if (!collection.contact.email && !collection.contact.mobile_number) {
    return { ok: false, status: 0, error: 'Set a collection contact email or mobile number (Settings > Courier Guy) before booking a shipment.' };
  }
  if (!delivery.contact.email && !delivery.contact.mobile_number) {
    return { ok: false, status: 0, error: 'This order has no customer email or phone number — Courier Guy requires at least one to book a shipment.' };
  }
  if (!serviceLevelCode && !serviceLevelId) {
    return { ok: false, status: 0, error: 'No service level selected — fetch rates and choose one before booking.' };
  }

  const body = {
    collection_address: collection.address,
    collection_contact: collection.contact,
    delivery_address: delivery.address,
    delivery_contact: delivery.contact,
    parcels,
    customer_reference: order.id,
    customer_reference_name: 'Order no.',
    mute_notifications: false,
  };
  if (serviceLevelCode) body.service_level_code = serviceLevelCode;
  if (serviceLevelId) body.service_level_id = serviceLevelId;
  if (declaredValue) body.declared_value = declaredValue;
  if (customTrackingReference) body.custom_tracking_reference = customTrackingReference;
  if (specialInstructions) body.special_instructions_delivery = specialInstructions;

  return request('POST', '/shipments', body);
}

/** POST /shipments/cancel — the docs note charges are reversed automatically if
 * the shipment hasn't been collected yet. */
async function cancelShipment({ trackingReference }) {
  if (!trackingReference) return { ok: false, status: 0, error: 'No tracking reference on this order to cancel.' };
  return request('POST', '/shipments/cancel', { tracking_reference: trackingReference });
}

/** GET /tracking/shipments — current status + full event history. */
async function trackShipment({ trackingReference }) {
  if (!trackingReference) return { ok: false, status: 0, error: 'No tracking reference on this order yet.' };
  return request('GET', `/tracking/shipments?tracking_reference=${encodeURIComponent(trackingReference)}`);
}

/** GET /shipments/label — a signed, time-limited (24h) S3 URL to the waybill
 * PDF. Needs the shipment's numeric `id`, not its tracking reference. */
async function getLabelUrl({ shipmentId }) {
  if (!shipmentId) return { ok: false, status: 0, error: 'This order has no Courier Guy shipment id yet.' };
  return request('GET', `/shipments/label?id=${encodeURIComponent(shipmentId)}`);
}

/** GET /shipments/label/stickers — same idea as the waybill label, but the
 * smaller per-parcel sticker format. */
async function getStickerUrl({ shipmentId }) {
  if (!shipmentId) return { ok: false, status: 0, error: 'This order has no Courier Guy shipment id yet.' };
  return request('GET', `/shipments/label/stickers?id=${encodeURIComponent(shipmentId)}`);
}

module.exports = {
  isConfigured,
  isSandbox,
  statusInfo,
  buildParcel,
  getRates,
  createShipment,
  cancelShipment,
  trackShipment,
  getLabelUrl,
  getStickerUrl,
};

// ─── POST /rates response shape (confirmed against a live sandbox call) ──────
// {
//   "message": "Success",
//   "service_days": { "collection_service_days": null, "delivery_service_days": null },
//   "rates": [
//     {
//       "rate": 198.63,                 // final all-inclusive price — base + surcharges + adjustments + VAT
//       "rate_excluding_vat": 172.72,
//       "base_rate": { "charge": 105, ... },
//       "service_level": { "id": 246084, "code": "LOF", "name": "Local Overnight",
//                           "description": "...", "delivery_date_from": "...", "delivery_date_to": "..." },
//       "surcharges": [...], "rate_adjustments": [...], "time_based_rate_adjustments": [...],
//       "charged_weight": 2, "actual_weight": 2, "volumetric_weight": 2
//     }
//   ]
// }
// The route handler (server.js, POST /api/courier/orders/:id/rates) unwraps
// `.rates` before sending it to the frontend, so `getRates()` itself is left
// returning the raw envelope — callers that want service_days/message can still
// get them from `result.data` directly if that's ever needed.
