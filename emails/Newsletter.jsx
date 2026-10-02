// Marketing broadcast. The body is the admin's rich-text content (already sanitised by the server).
import * as React from 'react';
import { Shell } from './ui.jsx';

export default function Newsletter({ brand, subject, html, preview, unsubscribeUrl }) {
  return (
    <Shell
      brand={brand}
      title={subject}
      preview={preview || subject}
      reason={`You are receiving this because you subscribed to ${brand.name} updates. You can unsubscribe at any time.`}
      unsubscribeUrl={unsubscribeUrl}
    >
      <div className="em-prose" style={{ fontSize: 15, lineHeight: '24px' }} dangerouslySetInnerHTML={{ __html: html }} />
    </Shell>
  );
}
