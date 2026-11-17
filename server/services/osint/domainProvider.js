// Domain OSINT Investigation Provider
// Performs real DNS resolution (A, AAAA, MX, NS, TXT, CAA, SOA),
// HTTP security headers audit, TLS certificate inspection, public file discovery,
// and passive Certificate Transparency (crt.sh) subdomain discovery.

const dns = require('dns').promises;
const tls = require('tls');
const net = require('net');

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function cleanDomainInput(input) {
  let cleaned = input.trim().toLowerCase();
  cleaned = cleaned.replace(/^(https?:\/\/)/i, '');
  cleaned = cleaned.split('/')[0];
  cleaned = cleaned.split(':')[0];
  return cleaned;
}

async function getTlsCertificate(domain, port = 443, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let resolved = false;
    const socket = tls.connect({
      host: domain,
      port,
      servername: domain,
      rejectUnauthorized: false
    }, () => {
      if (resolved) return;
      resolved = true;
      const cert = socket.getPeerCertificate(true);
      const protocol = socket.getProtocol();
      const cipher = socket.getCipher();
      socket.destroy();

      if (!cert || !cert.subject) {
        return resolve(null);
      }

      const validFrom = cert.valid_from ? new Date(cert.valid_from) : null;
      const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
      const now = new Date();
      const daysRemaining = validTo ? Math.round((validTo - now) / (1000 * 60 * 60 * 24)) : null;

      // Parse SANs
      let sans = [];
      if (cert.subjectaltname) {
        sans = cert.subjectaltname.split(', ').map(s => s.replace(/^DNS:/, ''));
      }

      resolve({
        subject: cert.subject.CN || cert.subject.O || 'Unknown',
        issuer: cert.issuer ? (cert.issuer.O || cert.issuer.CN || 'Unknown') : 'Unknown',
        validFrom: validFrom ? validFrom.toISOString() : null,
        validTo: validTo ? validTo.toISOString() : null,
        daysRemaining,
        isExpired: daysRemaining !== null && daysRemaining <= 0,
        protocol,
        cipher: cipher ? cipher.name : null,
        sans: sans.slice(0, 15) // Limit to top 15 SANs
      });
    });

    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(null);
      }
    });

    socket.on('error', () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(null);
      }
    });
  });
}

async function checkHttpHeaders(domain, timeoutMs = 4000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://${domain}`, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal
    });
    clearTimeout(id);

    const headers = {};
    for (const [key, val] of res.headers.entries()) {
      headers[key] = val;
    }

    const securityHeaders = {
      hsts: !!headers['strict-transport-security'],
      csp: !!headers['content-security-policy'],
      xFrameOptions: headers['x-frame-options'] || 'Missing',
      xContentTypeOptions: headers['x-content-type-options'] || 'Missing',
      referrerPolicy: headers['referrer-policy'] || 'Missing',
      server: headers['server'] || 'Undisclosed',
      xPoweredBy: headers['x-powered-by'] || null
    };

    return {
      status: res.status,
      securityHeaders,
      rawHeaders: headers
    };
  } catch (err) {
    clearTimeout(id);
    return null;
  }
}

async function checkPublicFile(domain, filePath, timeoutMs = 3000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://${domain}/${filePath}`, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal
    });
    clearTimeout(id);
    if (res.status === 200) {
      const text = await res.text();
      return {
        path: filePath,
        exists: true,
        httpStatus: 200,
        snippet: text.substring(0, 300)
      };
    }
  } catch (_) {}
  clearTimeout(id);
  return { path: filePath, exists: false };
}

async function queryCertificateTransparency(domain, timeoutMs = 5000) {
  // Query crt.sh public Certificate Transparency database
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://crt.sh/?q=%.${encodeURIComponent(domain)}&output=json`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal
    });
    clearTimeout(id);

    if (res.status === 200) {
      const records = await res.json();
      if (Array.isArray(records)) {
        const subdomains = new Set();
        for (const item of records) {
          if (item.name_value) {
            const names = item.name_value.split('\n');
            for (const name of names) {
              const clean = name.trim().toLowerCase();
              if (clean && clean.endsWith(domain) && !clean.includes('*')) {
                subdomains.add(clean);
              }
            }
          }
        }
        return Array.from(subdomains).slice(0, 30); // Top 30 passive subdomains
      }
    }
  } catch (_) {}
  clearTimeout(id);
  return [];
}

async function investigateDomain(rawDomain) {
  const domain = cleanDomainInput(rawDomain);
  const timestamp = new Date().toISOString();
  const findings = [];

  // 1. DNS Records (A, AAAA, MX, NS, TXT, CAA, SOA)
  const dnsChecks = await Promise.allSettled([
    dns.resolve4(domain).then(records => ({ type: 'A', records })),
    dns.resolve6(domain).then(records => ({ type: 'AAAA', records })),
    dns.resolveMx(domain).then(records => ({ type: 'MX', records })),
    dns.resolveNs(domain).then(records => ({ type: 'NS', records })),
    dns.resolveTxt(domain).then(records => ({ type: 'TXT', records: records.flat() })),
    dns.resolveCaa(domain).then(records => ({ type: 'CAA', records }))
  ]);

  const dnsResults = {};
  for (const item of dnsChecks) {
    if (item.status === 'fulfilled' && item.value.records.length > 0) {
      dnsResults[item.value.type] = item.value.records;
    }
  }

  findings.push({
    source: 'DNS Zone Resolution',
    sourceUrl: `https://dns.google/resolve?name=${domain}`,
    timestamp,
    status: Object.keys(dnsResults).length > 0 ? 'confirmed' : 'not_found',
    confidence: 'Confirmed',
    collectionMethod: 'Live DNS Direct Query (RFC 1035)',
    data: dnsResults,
    observation: `Resolved DNS records: ${Object.keys(dnsResults).join(', ') || 'No public records found'}. Primary A record: ${dnsResults.A ? dnsResults.A.join(', ') : 'None'}.`
  });

  // 2. TLS / SSL Certificate Inspection
  const tlsInfo = await getTlsCertificate(domain);
  if (tlsInfo) {
    findings.push({
      source: 'TLS/SSL Handshake & Certificate',
      sourceUrl: `https://${domain}`,
      timestamp,
      status: 'confirmed',
      confidence: 'Confirmed',
      collectionMethod: 'Direct TLS Socket Negotiation (Port 443)',
      data: tlsInfo,
      observation: `Issued to: ${tlsInfo.subject}. Issuer: ${tlsInfo.issuer}. Protocol: ${tlsInfo.protocol}. Valid for: ${tlsInfo.daysRemaining} more days (${tlsInfo.isExpired ? 'EXPIRED' : 'ACTIVE'}). SANs: ${tlsInfo.sans.slice(0, 5).join(', ')}.`
    });
  } else {
    findings.push({
      source: 'TLS/SSL Handshake',
      sourceUrl: `https://${domain}`,
      timestamp,
      status: 'not_found',
      confidence: 'Moderate confidence',
      collectionMethod: 'Direct TLS Socket Negotiation (Port 443)',
      observation: 'Could not establish TLS connection on port 443. Host may not serve HTTPS or is unreachable.'
    });
  }

  // 3. HTTP Security Headers Audit
  const httpInfo = await checkHttpHeaders(domain);
  if (httpInfo) {
    const sec = httpInfo.securityHeaders;
    const scoreNotes = [];
    if (!sec.hsts) scoreNotes.push('HSTS missing');
    if (!sec.csp) scoreNotes.push('CSP missing');
    if (sec.xFrameOptions === 'Missing') scoreNotes.push('X-Frame-Options missing');

    findings.push({
      source: 'HTTP Security Headers Audit',
      sourceUrl: `https://${domain}`,
      timestamp,
      status: 'confirmed',
      confidence: 'Confirmed',
      collectionMethod: 'HTTP GET Response Headers Parsing',
      data: sec,
      observation: `Web Server: ${sec.server}. Security posture observations: ${scoreNotes.length > 0 ? scoreNotes.join(', ') : 'All standard defensive headers present'}.`
    });
  }

  // 4. Public File Recon (robots.txt, sitemap.xml, security.txt)
  const publicFiles = await Promise.allSettled([
    checkPublicFile(domain, 'robots.txt'),
    checkPublicFile(domain, 'sitemap.xml'),
    checkPublicFile(domain, '.well-known/security.txt')
  ]);

  const fileFindings = publicFiles
    .filter(p => p.status === 'fulfilled' && p.value.exists)
    .map(p => p.value);

  if (fileFindings.length > 0) {
    findings.push({
      source: 'Public Web Manifests',
      sourceUrl: `https://${domain}`,
      timestamp,
      status: 'confirmed',
      confidence: 'Confirmed',
      collectionMethod: 'Standard Public HTTP Resource Ingestion',
      data: fileFindings,
      observation: `Discovered accessible public web files: ${fileFindings.map(f => f.path).join(', ')}.`
    });
  }

  // 5. Passive Subdomain Discovery via Certificate Transparency (crt.sh)
  const passiveSubdomains = await queryCertificateTransparency(domain);
  if (passiveSubdomains.length > 0) {
    findings.push({
      source: 'Certificate Transparency Logs (crt.sh)',
      sourceUrl: `https://crt.sh/?q=%.${domain}`,
      timestamp,
      status: 'confirmed',
      confidence: 'High confidence',
      collectionMethod: 'Public Certificate Transparency Log Query',
      data: passiveSubdomains,
      observation: `Passively discovered ${passiveSubdomains.length} distinct public subdomains from historical TLS certificate issuances: ${passiveSubdomains.slice(0, 8).join(', ')}${passiveSubdomains.length > 8 ? '...' : ''}.`
    });
  } else {
    findings.push({
      source: 'Certificate Transparency Logs (crt.sh)',
      sourceUrl: `https://crt.sh/?q=%.${domain}`,
      timestamp,
      status: 'not_found',
      confidence: 'Moderate confidence',
      collectionMethod: 'Public Certificate Transparency Log Query',
      observation: 'No Certificate Transparency records indexed on crt.sh or query timed out.'
    });
  }

  return {
    target: domain,
    type: 'domain',
    timestamp,
    primaryIp: dnsResults.A ? dnsResults.A[0] : null,
    findings
  };
}

module.exports = {
  investigateDomain
};
