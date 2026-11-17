// Email OSINT Investigation Provider
// Performs real DNS MX, SPF, and DMARC queries, provider identification,
// disposable domain detection, and documented breach status checks.

const dns = require('dns').promises;
const { isDisposableEmailDomain } = require('./disposableDomains');

async function investigateEmail(email) {
  const cleanEmail = email.trim().toLowerCase();
  const timestamp = new Date().toISOString();
  const findings = [];

  // 1. Syntax Validation
  const emailRegex = /^([a-zA-Z0-9_\.\+-]+)@([a-zA-Z0-9\.-]+\.[a-zA-Z]{2,})$/;
  const match = cleanEmail.match(emailRegex);

  if (!match) {
    return {
      target: cleanEmail,
      type: 'email',
      timestamp,
      isValid: false,
      error: 'Invalid RFC 5322 email address format.',
      findings: []
    };
  }

  const localPart = match[1];
  const domain = match[2];

  findings.push({
    source: 'RFC 5322 Validator',
    sourceUrl: 'https://datatracker.ietf.org/doc/html/rfc5322',
    timestamp,
    status: 'confirmed',
    confidence: 'Confirmed',
    collectionMethod: 'Local Deterministic Regex Parsing',
    observation: `Valid email syntax. Local-part: "${localPart}", Domain: "${domain}".`
  });

  // 2. Disposable / Burner Domain Verification
  const isDisposable = isDisposableEmailDomain(domain);
  findings.push({
    source: 'Disposable Email Intelligence',
    sourceUrl: 'https://github.com/disposable-email-domains/disposable-email-domains',
    timestamp,
    status: isDisposable ? 'confirmed' : 'not_found',
    confidence: 'Confirmed',
    collectionMethod: 'Offline Threat Intelligence Signature Database',
    observation: isDisposable
      ? `High Risk: "${domain}" matches a recognized temporary/throwaway email provider.`
      : `Clean: "${domain}" is not listed in offline burner email database.`
  });

  // 3. DNS MX Records
  let mxRecords = [];
  try {
    mxRecords = await dns.resolveMx(domain);
    mxRecords.sort((a, b) => a.priority - b.priority);

    // Identify provider
    let providerName = 'Custom / Independent Mail Infrastructure';
    const mxStrings = mxRecords.map(r => r.exchange.toLowerCase()).join(' ');
    if (mxStrings.includes('google.com') || mxStrings.includes('googlemail.com') || mxStrings.includes('aspmx.l.google.com')) {
      providerName = 'Google Workspace / Gmail';
    } else if (mxStrings.includes('outlook.com') || mxStrings.includes('microsoft.com') || mxStrings.includes('pphosted.com')) {
      providerName = 'Microsoft 365 / Exchange Online';
    } else if (mxStrings.includes('protonmail.ch') || mxStrings.includes('proton.me')) {
      providerName = 'ProtonMail (End-to-End Encrypted)';
    } else if (mxStrings.includes('tutanota.com') || mxStrings.includes('tuta.com')) {
      providerName = 'Tuta Mail';
    } else if (mxStrings.includes('icloud.com') || mxStrings.includes('apple.com')) {
      providerName = 'Apple iCloud Mail';
    } else if (mxStrings.includes('zoho.com')) {
      providerName = 'Zoho Mail';
    }

    findings.push({
      source: 'DNS MX Resolution',
      sourceUrl: `https://dns.google/resolve?name=${domain}&type=MX`,
      timestamp,
      status: 'confirmed',
      confidence: 'Confirmed',
      collectionMethod: 'Live DNS Lookup (RFC 1035)',
      data: mxRecords,
      provider: providerName,
      observation: `Identified mail provider: ${providerName}. Found ${mxRecords.length} MX record(s). Primary exchange: ${mxRecords[0]?.exchange || 'none'}.`
    });
  } catch (mxErr) {
    findings.push({
      source: 'DNS MX Resolution',
      sourceUrl: `https://dns.google/resolve?name=${domain}&type=MX`,
      timestamp,
      status: 'not_found',
      confidence: 'High confidence',
      collectionMethod: 'Live DNS Lookup',
      observation: `No active MX records found for domain "${domain}". Domain cannot receive mail directly.`
    });
  }

  // 4. DNS SPF Record
  try {
    const txtRecords = await dns.resolveTxt(domain);
    const spfRecord = txtRecords.flat().find(r => r.startsWith('v=spf1'));
    if (spfRecord) {
      findings.push({
        source: 'DNS SPF Policy',
        sourceUrl: `https://dns.google/resolve?name=${domain}&type=TXT`,
        timestamp,
        status: 'confirmed',
        confidence: 'Confirmed',
        collectionMethod: 'Live DNS TXT Query',
        data: spfRecord,
        observation: `Sender Policy Framework (SPF) published: "${spfRecord.substring(0, 100)}${spfRecord.length > 100 ? '...' : ''}".`
      });
    } else {
      findings.push({
        source: 'DNS SPF Policy',
        sourceUrl: `https://dns.google/resolve?name=${domain}&type=TXT`,
        timestamp,
        status: 'not_found',
        confidence: 'High confidence',
        collectionMethod: 'Live DNS TXT Query',
        observation: `No SPF (v=spf1) record published on apex domain "${domain}". Risk of domain spoofing.`
      });
    }
  } catch (spfErr) {
    // TXT not found
  }

  // 5. DNS DMARC Record
  try {
    const dmarcRecords = await dns.resolveTxt(`_dmarc.${domain}`);
    const dmarcRecord = dmarcRecords.flat().find(r => r.startsWith('v=DMARC1'));
    if (dmarcRecord) {
      findings.push({
        source: 'DNS DMARC Policy',
        sourceUrl: `https://dns.google/resolve?name=_dmarc.${domain}&type=TXT`,
        timestamp,
        status: 'confirmed',
        confidence: 'Confirmed',
        collectionMethod: 'Live DNS Query (_dmarc)',
        data: dmarcRecord,
        observation: `DMARC policy active: "${dmarcRecord}".`
      });
    } else {
      findings.push({
        source: 'DNS DMARC Policy',
        sourceUrl: `https://dns.google/resolve?name=_dmarc.${domain}&type=TXT`,
        timestamp,
        status: 'not_found',
        confidence: 'High confidence',
        collectionMethod: 'Live DNS Query (_dmarc)',
        observation: `No DMARC policy found for "${domain}". Email spoofing protection is unconfigured.`
      });
    }
  } catch (dmarcErr) {
    findings.push({
      source: 'DNS DMARC Policy',
      sourceUrl: `https://dns.google/resolve?name=_dmarc.${domain}&type=TXT`,
      timestamp,
      status: 'not_found',
      confidence: 'High confidence',
      collectionMethod: 'Live DNS Query (_dmarc)',
      observation: `No DMARC policy discovered at _dmarc.${domain}.`
    });
  }

  // 6. Have I Been Pwned / Breach Check (Strictly honest, non-fake)
  const hibpKey = process.env.HIBP_API_KEY;
  if (hibpKey) {
    try {
      const hibpRes = await fetch(`https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(cleanEmail)}?truncateResponse=false`, {
        headers: {
          'hibp-api-key': hibpKey,
          'user-agent': 'Portfolio-OSINT-Platform'
        }
      });
      if (hibpRes.status === 200) {
        const breaches = await hibpRes.json();
        findings.push({
          source: 'Have I Been Pwned (HIBP)',
          sourceUrl: `https://haveibeenpwned.com/account/${encodeURIComponent(cleanEmail)}`,
          timestamp,
          status: 'confirmed',
          confidence: 'Confirmed',
          collectionMethod: 'Authorized HIBP REST API v3',
          data: breaches.map(b => ({ name: b.Name, breachDate: b.BreachDate, pwnCount: b.PwnCount, dataClasses: b.DataClasses })),
          observation: `Account exposed in ${breaches.length} documented public breaches: ${breaches.map(b => b.Name).slice(0, 5).join(', ')}${breaches.length > 5 ? '...' : ''}.`
        });
      } else if (hibpRes.status === 404) {
        findings.push({
          source: 'Have I Been Pwned (HIBP)',
          sourceUrl: 'https://haveibeenpwned.com',
          timestamp,
          status: 'not_found',
          confidence: 'Confirmed',
          collectionMethod: 'Authorized HIBP REST API v3',
          observation: 'No breach exposures discovered in HIBP database.'
        });
      }
    } catch (err) {
      findings.push({
        source: 'Have I Been Pwned (HIBP)',
        sourceUrl: 'https://haveibeenpwned.com',
        timestamp,
        status: 'unavailable',
        confidence: 'Unverified',
        collectionMethod: 'HIBP API',
        observation: 'HIBP service request timed out or returned connection error.'
      });
    }
  } else {
    findings.push({
      source: 'Breach Exposure Database',
      sourceUrl: 'https://haveibeenpwned.com/API/v3',
      timestamp,
      status: 'unavailable',
      confidence: 'Unverified',
      collectionMethod: 'API Credential Audit',
      observation: 'HIBP_API_KEY is not configured in backend environment. Live breach check was not performed.'
    });
  }

  return {
    target: cleanEmail,
    type: 'email',
    domain,
    localPart,
    timestamp,
    findings
  };
}

module.exports = {
  investigateEmail
};
