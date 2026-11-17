// Offline database of recognized temporary/disposable email domains
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  '10minutemail.com', '10minutemail.net', '10minutemail.org', '10minutemail.co.uk',
  'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamail.biz', 'guerrillamailblock.com',
  'mailinator.com', 'mailinator.net', 'mailinator2.com', 'mailin8r.com',
  'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmailaddress.com', 'tempail.com',
  'yopmail.com', 'yopmail.fr', 'yopmail.net',
  'trashmail.com', 'trashmail.net', 'trashmail.org',
  'throwawaymail.com', 'sharklasers.com', 'dispostable.com', 'getairmail.com',
  'fakemailgenerator.com', 'mytemp.email', 'nada.ltd', 'mohmal.com', 'burnermail.io',
  'inboxkitten.com', 'crazymailing.com', 'dropmail.me', 'fakeinbox.com', 'maildrop.cc',
  'generator.email', 'zillamail.com', 'burneremail.com', 'temporary-mail.net',
  'disposablemail.com', 'tempinbox.com', 'maildrop.cc', 'getnada.com', 'emailondeck.com',
  'spam4.me', 'binkmail.com', 'safetymail.info', 'trashmail.me', 'disposableinbox.com',
  'tempr.email', 'mytempemail.com', 'fakemail.net', 'minuteinbox.com', 'crazymail.com'
]);

function isDisposableEmailDomain(domain) {
  if (!domain) return false;
  return DISPOSABLE_EMAIL_DOMAINS.has(domain.toLowerCase().trim());
}

module.exports = {
  DISPOSABLE_EMAIL_DOMAINS,
  isDisposableEmailDomain
};
