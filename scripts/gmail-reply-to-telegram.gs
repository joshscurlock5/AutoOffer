/**
 * DriveOffer — Telegram alert when a customer replies to an email.
 *
 * Watches the driveofferca@gmail.com inbox and sends a Telegram message
 * whenever a new customer reply lands. Replies still arrive in Gmail as
 * normal — this only ADDS a heads-up in Telegram.
 *
 * SETUP (one time):
 *  1. Sign in to the Google account that has driveofferca@gmail.com.
 *  2. Go to script.google.com → New project. Delete the sample code and
 *     paste this whole file in.
 *  3. Fill in BOT_TOKEN and CHAT_ID below. BOT_TOKEN = your Amplify
 *     TELEGRAM_BOT_TOKEN. CHAT_ID = your Replies group id
 *     (TELEGRAM_CHAT_REPLIES) so replies land in the Replies channel.
 *  4. Click Save. Pick "checkEmailAndNotify" in the function dropdown and
 *     click Run once — Google will ask you to authorize Gmail access; allow
 *     it. (The first run just silences any existing unread mail, so you
 *     don't get a flood — real alerts start after that.)
 *  5. Click the clock icon (Triggers) → Add Trigger → choose
 *     checkEmailAndNotify, "Time-driven", "Minutes timer", "Every 5 minutes".
 *     Save. Done.
 */

// ====== FILL THESE IN ======
var BOT_TOKEN   = 'PASTE_TELEGRAM_BOT_TOKEN_HERE';
var CHAT_ID     = 'PASTE_TELEGRAM_CHAT_ID_HERE';
var SITE_URL    = 'https://www.driveoffer.ca';   // your live site
var CRON_SECRET = 'PASTE_YOUR_CRON_SECRET_HERE';  // = your Amplify CRON_SECRET; logs the reply onto the customer's analytics profile
// ===========================

// Which emails count as "a customer reply". The default matches inbox mail
// from the last 2 days whose content mentions driveoffer.ca — i.e. replies
// that quote one of our emails. To get pinged for ALL new inbox mail instead,
// change this to: 'in:inbox newer_than:2d'
var SEARCH = 'in:inbox newer_than:2d "driveoffer.ca"';

var LABEL_NAME = 'TGNotified';                 // used to remember what we've already sent
var MY_ADDRESSES = ['driveofferca@gmail.com', 'hello@driveoffer.ca']; // never alert on our own mail

function checkEmailAndNotify() {
  var label = GmailApp.getUserLabelByName(LABEL_NAME) || GmailApp.createLabel(LABEL_NAME);
  var props = PropertiesService.getScriptProperties();
  var firstRun = !props.getProperty('initialized');

  var threads = GmailApp.search(SEARCH + ' -label:' + LABEL_NAME, 0, 50);
  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];
    var msgs = thread.getMessages();
    var msg = msgs[msgs.length - 1]; // newest message in the conversation
    var from = (msg.getFrom() || '').toLowerCase();

    // Skip anything we sent ourselves.
    var mine = false;
    for (var j = 0; j < MY_ADDRESSES.length; j++) {
      if (from.indexOf(MY_ADDRESSES[j]) !== -1) { mine = true; break; }
    }

    if (!mine && !firstRun) {
      var subject = thread.getFirstMessageSubject() || '(no subject)';
      var snippet = (msg.getPlainBody() || '').replace(/\s+/g, ' ').slice(0, 220);
      var link = 'https://mail.google.com/mail/u/0/#inbox/' + thread.getId();
      // Trace the reply back to a lead via the "Ref: <id>" stamped on our emails,
      // so the alert can prefill the /offer command for that customer.
      var ref = '';
      for (var k = 0; k < msgs.length; k++) {
        var rm = (msgs[k].getPlainBody() || '').match(/Ref:\s*([a-z0-9]{6,12})\b/i);
        if (rm) { ref = rm[1]; break; }
      }
      // Longer body for the topic (the flat fallback keeps the short snippet).
      var body = (msg.getPlainBody() || '').replace(/\s+/g, ' ').slice(0, 600);
      // Send to the site: it stamps the customer's profile AND drops the reply into
      // their Replies-group topic. If the topic took it, skip the flat alert below
      // so there's no double-notify.
      var handled = ref ? postReplyToServer(ref, subject, body) : false;
      if (!handled) {
        var offerLine = ref
          ? '\n\nSend an offer → /offer ' + ref + ' <price>'
          : '\n\nSend an offer → /offer <id> <price>  (id is in the Leads alert)';
        var text = '✉️ New email reply\n' +
                   'From: ' + msg.getFrom() + '\n' +
                   'Subject: ' + subject + '\n\n' +
                   '"' + snippet + '"\n\n' +
                   'Open in Gmail: ' + link +
                   offerLine;
        sendTelegram(text);
      }
    }
    thread.addLabel(label); // mark handled so it never double-alerts
  }

  if (firstRun) props.setProperty('initialized', '1'); // silence the existing backlog, once
}

function sendTelegram(text) {
  var url = 'https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage';
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: CHAT_ID, text: text, disable_web_page_preview: true }),
    muteHttpExceptions: true
  });
}

// Send the customer's reply to the site: it records the reply on their analytics
// profile (lastReplyAt / repliesCount) AND posts the message into their Replies-
// group topic. Returns true when the topic took it (so the caller skips the flat
// alert — no double-notify). Best-effort — never breaks the alert.
function postReplyToServer(ref, subject, body) {
  if (!ref || !CRON_SECRET || CRON_SECRET.indexOf('PASTE') === 0) return false;
  try {
    var resp = UrlFetchApp.fetch(SITE_URL + '/api/leads/reply', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + CRON_SECRET },
      payload: JSON.stringify({ ref: ref, channel: 'email', subject: subject, text: body }),
      muteHttpExceptions: true
    });
    var data = JSON.parse(resp.getContentText() || '{}');
    return data && data.topicPosted === true;
  } catch (e) { return false; }
}
