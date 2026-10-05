// To someone who just entered their address in the newsletter form: one click confirms it is really theirs.
import * as React from 'react';
import { Shell, H1, P, Muted, Btn } from './ui.jsx';

export default function ConfirmSubscription({ brand, confirmUrl }) {
  return (
    <Shell
      brand={brand}
      title="Confirm your subscription"
      preview={`One click to start getting updates from ${brand.name}.`}
      reason={`You are receiving this because this address was entered on the ${brand.name} website. If that was not you, ignore this email and you will not be subscribed.`}
    >
      <H1>Confirm your subscription</H1>
      <P muted>Thanks for your interest in {brand.name}. Confirm your email address to start receiving news about new drops, events and stories.</P>
      <Btn href={confirmUrl}>Confirm subscription</Btn>
      <Muted style={{ margin: '20px 0 0', fontSize: 13 }}>Button not working? Copy this link into your browser: {confirmUrl}</Muted>
    </Shell>
  );
}
