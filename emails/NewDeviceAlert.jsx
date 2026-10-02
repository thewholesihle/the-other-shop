// To the store owner: the admin panel was signed in to from a device not seen before.
import * as React from 'react';
import { Shell, H1, P, Muted, KeyValue, Alert, Btn } from './ui.jsx';

export default function NewDeviceAlert({ brand, device, ip, when, reviewUrl }) {
  return (
    <Shell
      brand={brand}
      title="New admin sign-in"
      preview={`New sign-in from ${device}`}
      reason="This is a security notice about your admin account, sent automatically."
    >
      <H1>New admin sign-in</H1>
      <Muted>Your admin panel was just signed in to from a device we haven't seen before.</Muted>
      <KeyValue rows={[
        { label: 'Device', value: device },
        { label: 'IP address', value: ip },
        { label: 'Time', value: when },
      ]} />
      <Alert tone="warning" title="Was this you?">
        If so, no action is needed. If not, change your admin password now and turn on two-factor sign-in.
      </Alert>
      {reviewUrl ? <Btn href={reviewUrl} variant="outline">Review sign-in activity</Btn> : null}
    </Shell>
  );
}
