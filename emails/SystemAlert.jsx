// To the store owner: the server hit an error worth knowing about (throttled to one per 15 minutes).
import * as React from 'react';
import { Shell, H1, Muted, KeyValue, Alert, Btn } from './ui.jsx';

export default function SystemAlert({ brand, heading, message, path, errorMessage, adminUrl, tone = 'destructive', label = 'Error' }) {
  return (
    <Shell
      brand={brand}
      title={heading}
      preview={errorMessage || message}
      reason="This alert is sent automatically and limited to one every 15 minutes, so you will not be flooded."
    >
      <H1>{heading}</H1>
      <Muted>{message}</Muted>
      <Alert tone={tone} title={label}>{errorMessage}</Alert>
      <KeyValue rows={[{ label: 'Where', value: path }]} />
      {adminUrl ? <Btn href={adminUrl}>Open site status</Btn> : null}
    </Shell>
  );
}
