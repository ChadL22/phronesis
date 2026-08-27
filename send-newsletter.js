#!/usr/bin/env node
/**
 * Phronesis Newsletter — Send monthly dispatch
 *
 * Pulls the newsletter template from a Google Doc, pulls the current
 * subscriber list, wraps the template in a Phronesis-branded email shell,
 * and sends via Gmail: To -> your own address, Bcc -> every subscriber.
 *
 * One-time setup:
 *   1. npm install
 *   2. Fill in newsletter.config.json (docId, toAddress)
 *   3. Put your OAuth "Desktop app" client JSON at
 *      .google-credentials/client_secret.json
 *
 * Usage:
 *   node send-newsletter.js                    interactive send
 *   node send-newsletter.js --subject "..."     skip the subject prompt
 *   node send-newsletter.js --dry-run           preview only, sends nothing
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const http = require('http');
const { google } = require('googleapis');
const open = require('open');

const ROOT = __dirname;
const CONFIG = require(path.join(ROOT, 'newsletter.config.json'));
const CRED_DIR = path.join(ROOT, '.google-credentials');
const CLIENT_SECRET_PATH = path.join(CRED_DIR, 'client_secret.json');
const TOKEN_PATH = path.join(CRED_DIR, 'token.json');
const OAUTH_PORT = 8991;

// Sensitive but non-restricted scopes. Fine for personal-use apps under
// 100 users without going through Google's full verification review.
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/drive.readonly',
];

// Existing Cloudflare Worker that already exposes the KV subscriber list.
// Unauthenticated — see the note in the chat about closing this off later.
const SUBSCRIBERS_ENDPOINT = 'https://phronesis-newsletter.sclanga315.workers.dev/subscribers';

// ── AUTH ──────────────────────────────────────────────────────────

async function getAuthClient() {
  if (!fs.existsSync(CLIENT_SECRET_PATH)) {
    console.error(`Missing ${CLIENT_SECRET_PATH}`);
    console.error('Download your OAuth "Desktop app" client JSON from Google Cloud Console (APIs & Services > Credentials) and save it there.');
    process.exit(1);
  }

  const { client_id, client_secret } = JSON.parse(fs.readFileSync(CLIENT_SECRET_PATH, 'utf8')).installed;
  const redirectUri = `http://localhost:${OAUTH_PORT}/oauth2callback`;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

  if (fs.existsSync(TOKEN_PATH)) {
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));
    return oAuth2Client;
  }

  return runConsentFlow(oAuth2Client, redirectUri);
}

function runConsentFlow(oAuth2Client, redirectUri) {
  return new Promise((resolve, reject) => {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });

    const server = http
      .createServer(async (req, res) => {
        if (!req.url.startsWith('/oauth2callback')) return;

        const code = new URL(req.url, redirectUri).searchParams.get('code');
        res.end('Signed in. You can close this tab and go back to the terminal.');
        server.close();

        try {
          const { tokens } = await oAuth2Client.getToken(code);
          oAuth2Client.setCredentials(tokens);
          fs.mkdirSync(CRED_DIR, { recursive: true });
          fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
          console.log('Signed in. Credentials saved for next time.');
          resolve(oAuth2Client);
        } catch (err) {
          reject(err);
        }
      })
      .listen(OAUTH_PORT, () => {
        console.log('Opening browser for one-time Google sign-in...');
        console.log('If it does not open automatically, visit:\n' + authUrl);
        open(authUrl);
      });
  });
}

// ── TEMPLATE ──────────────────────────────────────────────────────

async function fetchTemplateHtml(auth) {
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.export(
    { fileId: CONFIG.docId, mimeType: 'text/html' },
    { responseType: 'text' }
  );
  return res.data;
}

// Google's raw export carries its own inline styling and no brand
// identity. This wraps the doc body in a simple, email-safe Phronesis
// shell (table-based, inline CSS, web-font fallbacks) so the dispatch
// actually looks like Phronesis when it lands in an inbox.
function wrapInBrandedShell(bodyHtml, subject) {
  const strippedBody = bodyHtml
    .replace(/<\/?html[^>]*>/gi, '')
    .replace(/<head>[\s\S]*?<\/head>/gi, '')
    .replace(/<\/?body[^>]*>/gi, '');

  return `<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; background:#EDE9DF;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EDE9DF; padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#F6F3EC; border:1px solid #D9D5CA;">
          <tr>
            <td style="padding:28px 40px; border-bottom:1px solid #D9D5CA;">
              <span style="font-family:Georgia,'Times New Roman',serif; font-size:22px; color:#1A1916; letter-spacing:0.02em;">Phronesis <span style="font-family:Arial,sans-serif; font-size:11px; letter-spacing:0.16em; text-transform:uppercase; color:#8A8880;">Research</span></span>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px; font-family:Georgia,'Times New Roman',serif; font-size:17px; line-height:1.7; color:#4A4944;">
              ${strippedBody}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px; border-top:1px solid #D9D5CA; font-family:Arial,sans-serif; font-size:11px; color:#8A8880;">
              You are receiving this because you subscribed at phronesisresearch.org.
              <a href="https://phronesisresearch.org/subscribe" style="color:#2B4736;">Manage your subscription</a>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── SUBSCRIBERS ───────────────────────────────────────────────────

async function fetchSubscribers() {
  const res = await fetch(SUBSCRIBERS_ENDPOINT);
  if (!res.ok) throw new Error(`Failed to fetch subscribers: ${res.status}`);
  const data = await res.json();
  return data.subscribers.map((s) => s.email);
}

// ── EMAIL ─────────────────────────────────────────────────────────

function buildRawMessage({ to, bcc, subject, html }) {
  const message = [
    `To: ${to}`,
    `Bcc: ${bcc.join(', ')}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    '',
    html,
  ].join('\r\n');

  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sendEmail(auth, payload) {
  const gmail = google.gmail({ version: 'v1', auth });
  const raw = buildRawMessage(payload);
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
}

// ── CLI ───────────────────────────────────────────────────────────

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const subjectFlagIndex = args.indexOf('--subject');
  const subjectArg = subjectFlagIndex !== -1 ? args[subjectFlagIndex + 1] : null;

  if (CONFIG.docId === 'REPLACE_WITH_GOOGLE_DOC_ID' || CONFIG.toAddress === 'REPLACE_WITH_YOUR_EMAIL') {
    console.error('Fill in docId and toAddress in newsletter.config.json before running this.');
    process.exit(1);
  }

  const auth = await getAuthClient();

  console.log('Fetching template from Google Docs...');
  const rawHtml = await fetchTemplateHtml(auth);

  console.log('Fetching subscriber list...');
  const subscribers = await fetchSubscribers();

  const subject = subjectArg || (await ask(`Subject line [${CONFIG.defaultSubject}]: `)) || CONFIG.defaultSubject;
  const html = CONFIG.wrapInBrandedShell ? wrapInBrandedShell(rawHtml, subject) : rawHtml;

  console.log('\n──────────────────────────────');
  console.log(`To:      ${CONFIG.toAddress}`);
  console.log(`Bcc:     ${subscribers.length} subscriber(s)`);
  console.log(`Subject: ${subject}`);
  console.log(`Preview: ${rawHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220)}...`);
  console.log('──────────────────────────────\n');

  if (dryRun) {
    console.log('Dry run: nothing sent.');
    return;
  }

  const confirm = await ask(`Send to ${subscribers.length} subscriber(s)? Type "yes" to send: `);
  if (confirm.trim().toLowerCase() !== 'yes') {
    console.log('Cancelled. Nothing sent.');
    return;
  }

  console.log('Sending...');
  await sendEmail(auth, { to: CONFIG.toAddress, bcc: subscribers, subject, html });
  console.log('Sent.');
}

main().catch((err) => {
  console.error('Failed:', err.message || err);
  process.exit(1);
});
