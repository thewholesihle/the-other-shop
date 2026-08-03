'use strict';
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/others';

if (!process.env.MONGODB_URI) {
  console.warn('WARNING: MONGODB_URI is not set — falling back to mongodb://localhost:27017/others, which will not work on a hosted platform.');
}

const MAX_RETRY_DELAY_MS = 60_000;
let isConnected = false;
let retryTimer = null;

/**
 * Mongoose does not retry an initial connect() failure on its own — once the
 * promise rejects, nothing else will try again, and the app is stuck showing
 * the maintenance page until a manual restart. This loop keeps attempting
 * with capped exponential backoff so a transient DNS blip, an Atlas cluster
 * still waking up, or a slow network path self-heals instead of requiring a
 * redeploy.
 */
async function attemptConnect(retryDelayMs = 5000) {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    isConnected = true;
    console.log(`MongoDB connected → ${MONGODB_URI.replace(/:\/\/[^@]*@/, '://***:***@')}`);
  } catch (err) {
    isConnected = false;
    console.error(`MongoDB connection failed (${err.name || 'Error'}): ${err.message}`);
    console.log(`MongoDB retrying in ${Math.round(retryDelayMs / 1000)}s…`);
    retryTimer = setTimeout(() => {
      attemptConnect(Math.min(retryDelayMs * 2, MAX_RETRY_DELAY_MS));
    }, retryDelayMs);
  }
}

async function connect() {
  if (isConnected) return;

  mongoose.set('strictQuery', true); // reject unknown fields in queries

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    console.warn('MongoDB disconnected — reconnecting…');
  });

  mongoose.connection.on('reconnected', () => {
    isConnected = true;
    clearTimeout(retryTimer);
    console.log('MongoDB reconnected.');
  });

  return attemptConnect();
}

// Graceful shutdown
process.on('SIGINT',  () => mongoose.connection.close().then(() => process.exit(0)));
process.on('SIGTERM', () => mongoose.connection.close().then(() => process.exit(0)));

module.exports = { connect, getIsConnected: () => isConnected };
