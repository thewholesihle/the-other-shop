// To the store owner: the "send a test email" button in Site status.
import * as React from 'react';
import { Shell, H1, Muted, Alert } from './ui.jsx';

export default function TestEmail({ brand, from, sandbox, kind = 'order emails and system alerts' }) {
  return (
    <Shell
      brand={brand}
      title="Notifications are working"
      preview={`This address receives ${kind}.`}
      reason="You asked for this test from Site status in your admin panel."
    >
      <H1>Notifications are working</H1>
      <Muted>This is a test message from your {brand.name} admin panel. This address is on the list for <strong>{kind}</strong>, so you will get emails like this when they happen.</Muted>
      {sandbox ? (
        <Alert tone="warning" title="You are sending from a shared test address">
          {from} is Resend's sandbox sender. Customers will not receive order emails until you verify your own domain in Resend and set SMTP_FROM to an address on it. A verified domain also keeps your emails out of spam.
        </Alert>
      ) : (
        <Alert tone="success" title={`Sending from ${from}`}>Your sender address is set up.</Alert>
      )}
    </Shell>
  );
}
