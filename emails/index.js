// Registry of every email the store sends. Built into emails/dist/templates.cjs by scripts/build-emails.js.
import OrderNotification from './OrderNotification.jsx';
import OrderUpdate from './OrderUpdate.jsx';
import NewDeviceAlert from './NewDeviceAlert.jsx';
import WeeklySummary from './WeeklySummary.jsx';
import TestEmail from './TestEmail.jsx';
import Newsletter from './Newsletter.jsx';
import ConfirmSubscription from './ConfirmSubscription.jsx';
import SystemAlert from './SystemAlert.jsx';

export const templates = { OrderNotification, OrderUpdate, NewDeviceAlert, WeeklySummary, TestEmail, Newsletter, ConfirmSubscription, SystemAlert };
