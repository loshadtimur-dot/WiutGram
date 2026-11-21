'use strict';

// Transactional email through HTTPS APIs only. No SMTP ports and no native
// dependencies, so it works on any host including Railway.
// Providers: Resend (RESEND_API_KEY) or Brevo (BREVO_API_KEY).
// MAIL_DEBUG=1 prints the message to the log instead of sending it, which is
// how the verification flow can be exercised locally.

function provider() {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.BREVO_API_KEY) return 'brevo';
  return '';
}

function isMailerConfigured() {
  return Boolean(provider()) || process.env.MAIL_DEBUG === '1';
}

function fromAddress() {
  return process.env.MAIL_FROM || 'Wiutgram <noreply@wiutgram.app>';
}

async function postJson(url, headers, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`MAIL_PROVIDER_${response.status}: ${detail.slice(0, 300)}`);
  }
  return response;
}

// Returns true when the message left the process, false when the provider is
// not configured. Provider failures are thrown so callers can decide what to do.
async function sendMail({ to, subject, html, text }) {
  const kind = provider();
  if (kind === 'resend') {
    await postJson(
      'https://api.resend.com/emails',
      { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      { from: fromAddress(), to: [to], subject, html, text }
    );
    return true;
  }
  if (kind === 'brevo') {
    const match = fromAddress().match(/^(.*)<(.+)>$/);
    const sender = match
      ? { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2].trim() }
      : { name: 'Wiutgram', email: fromAddress() };
    await postJson(
      'https://api.brevo.com/v3/smtp/email',
      { 'api-key': process.env.BREVO_API_KEY },
      { sender, to: [{ email: to }], subject, htmlContent: html, textContent: text }
    );
    return true;
  }
  if (process.env.MAIL_DEBUG === '1') {
    console.log(`[mail:debug] to=${to} subject="${subject}"\n${text || html}`);
    return true;
  }
  return false;
}

module.exports = { isMailerConfigured, sendMail };
