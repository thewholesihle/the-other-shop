'use strict';
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/others';

let isConnected = false;

async function connect() {
  if (isConnected) return;

  mongoose.set('strictQuery', true); // reject unknown fields in queries

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    isConnected = true;
    console.log(`MongoDB connected → ${MONGODB_URI.replace(/:\/\/[^@]*@/, '://***:***@')}`);
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    isConnected = false;
    // We allow the server to keep running so it can show a maintenance page
  }

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    console.warn('MongoDB disconnected — reconnecting…');
  });

  mongoose.connection.on('reconnected', () => {
    isConnected = true;
    console.log('MongoDB reconnected.');
  });
}

// Graceful shutdown
process.on('SIGINT',  () => mongoose.connection.close().then(() => process.exit(0)));
process.on('SIGTERM', () => mongoose.connection.close().then(() => process.exit(0)));

module.exports = { connect, getIsConnected: () => isConnected };
