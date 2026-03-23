const mongoose = require('mongoose');
require('dotenv').config();
const { Log } = require('./src/db/models');

async function checkLogs() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected. Querying logs...');
    
    // Look for ITN specific logs or warnings
    const recentLogs = await Log.find({
      $or: [
        { message: { $regex: /ITN/i } },
        { type: 'warn' },
        { type: 'error' }
      ]
    }).sort({ _id: -1 }).limit(10);
    
    if (recentLogs.length === 0) {
      console.log('No relevant logs found.');
    } else {
      console.log(JSON.stringify(recentLogs, null, 2));
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Diagnostic error:', err);
    process.exit(1);
  }
}

checkLogs();
