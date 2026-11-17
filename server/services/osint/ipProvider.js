// IP Address OSINT Investigation Provider
// Performs IP validation, reverse DNS (PTR) lookup, scope classification (RFC 1918/Bogon),
// and approximate public ASN/ISP/Geolocation retrieval.

const dns = require('dns').promises;
const net = require('net');

function classifyIpScope(ip) {
  if (net.isIPv4(ip)) {
    const octets = ip.split('.').map(Number);
    if (octets[0] === 10) return { scope: 'RFC 1918 Private (10.0.0.0/8)', isPublic: false };
    if (octets[0] === 172 && (octets[1] >= 16 && octets[1] <= 31)) return { scope: 'RFC 1918 Private (172.16.0.0/12)', isPublic: false };
    if (octets[0] === 192 && octets[1] === 168) return { scope: 'RFC 1918 Private (192.168.0.0/16)', isPublic: false };
    if (octets[0] === 127) return { scope: 'RFC 1122 Loopback (127.0.0.0/8)', isPublic: false };
    if (octets[0] === 169 && octets[1] === 254) return { scope: 'RFC 3927 Link-Local (169.254.0.0/16)', isPublic: false };
    if (octets[0] === 100 && (octets[1] >= 64 && octets[1] <= 127)) return { scope: 'RFC 6598 Carrier-Grade NAT (100.64.0.0/10)', isPublic: false };
    if (octets[0] >= 224 && octets[0] <= 239) return { scope: 'RFC 5771 Multicast (Class D)', isPublic: false };
    return { scope: 'Public Internet Routable', isPublic: true };
  } else if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower.startsWith('fe80:')) return { scope: 'IPv6 Link-Local / Loopback', isPublic: false };
    if (lower.startsWith('fc') || lower.startsWith('fd')) return { scope: 'IPv6 Unique Local (ULA)', isPublic: false };
    return { scope: 'IPv6 Global Unicast', isPublic: true };
  }
  return { scope: 'Invalid Address Format', isPublic: false };
}

async function queryPublicGeoIp(ip, timeoutMs = 4000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // ip-api.com free non-commercial endpoint (HTTP)
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org,as,query`, {
      signal: controller.signal
    });
    clearTimeout(id);
    if (res.status === 200) {
      const data = await res.json();
      if (data.status === 'success') {
        return data;
      }
    }
  } catch (_) {}
  clearTimeout(id);
  return null;
}

async function investigateIp(rawIp) {
  const ip = rawIp.trim();
  const timestamp = new Date().toISOString();
  const findings = [];

  const ipVersion = net.isIP(ip);
  if (!ipVersion) {
    return {
      target: ip,
      type: 'ip',
      timestamp,
      isValid: false,
      error: 'Invalid IPv4 or IPv6 address.',
      findings: []
    };
  }

  // 1. Scope & Classification
  const { scope, isPublic } = classifyIpScope(ip);
  findings.push({
    source: 'IANA IPv4/IPv6 Address Registry',
    sourceUrl: 'https://www.iana.org/assignments/ipv4-address-space/ipv4-address-space.xhtml',
    timestamp,
    status: 'confirmed',
    confidence: 'Confirmed',
    collectionMethod: 'Deterministic Network Math (RFC 6890 / 1918)',
    observation: `Address Scope: ${scope}. ${isPublic ? 'Publicly routable on the global internet.' : 'Non-routable private/local network address.'}`
  });

  // 2. Reverse DNS / PTR
  try {
    const hostnames = await dns.reverse(ip);
    if (hostnames && hostnames.length > 0) {
      findings.push({
        source: 'Reverse DNS (PTR Lookup)',
        sourceUrl: `https://dns.google/resolve?name=${ip}`,
        timestamp,
        status: 'confirmed',
        confidence: 'Confirmed',
        collectionMethod: 'Live In-Addr.Arpa DNS Query',
        data: hostnames,
        observation: `PTR Hostname(s): ${hostnames.join(', ')}.`
      });
    }
  } catch (err) {
    findings.push({
      source: 'Reverse DNS (PTR Lookup)',
      sourceUrl: `https://dns.google/resolve?name=${ip}`,
      timestamp,
      status: 'not_found',
      confidence: 'High confidence',
      collectionMethod: 'Live In-Addr.Arpa DNS Query',
      observation: 'No reverse DNS PTR record configured for this IP.'
    });
  }

  // 3. Geolocation, ASN, and ISP (Only for public IPs)
  if (isPublic) {
    const geoData = await queryPublicGeoIp(ip);
    if (geoData) {
      findings.push({
        source: 'Public BGP & Geolocation Registry',
        sourceUrl: `https://bgp.he.net/ip/${ip}`,
        timestamp,
        status: 'confirmed',
        confidence: 'High confidence',
        collectionMethod: 'Public IP Geolocation and Autonomous System Lookup',
        data: {
          asn: geoData.as,
          isp: geoData.isp,
          org: geoData.org,
          country: geoData.country,
          region: geoData.regionName,
          city: geoData.city,
          approxLat: geoData.lat,
          approxLon: geoData.lon,
          timezone: geoData.timezone
        },
        observation: `Autonomous System: ${geoData.as || 'Unknown'}. ISP / Org: ${geoData.isp || geoData.org || 'Unknown'}. Approximate Location: ${geoData.city ? geoData.city + ', ' : ''}${geoData.regionName ? geoData.regionName + ', ' : ''}${geoData.country} (Approximate city-level, not a physical residential address).`
      });
    } else {
      findings.push({
        source: 'Public Geolocation Registry',
        sourceUrl: `https://bgp.he.net/ip/${ip}`,
        timestamp,
        status: 'unavailable',
        confidence: 'Unverified',
        collectionMethod: 'Public Geolocation Endpoint',
        observation: 'Geolocation registry request timed out or was rate limited.'
      });
    }
  }

  // 4. Mathematical Representations (IPv4)
  if (ipVersion === 4) {
    const octets = ip.split('.').map(Number);
    const dword = (octets[0] * 16777216) + (octets[1] * 65536) + (octets[2] * 256) + octets[3];
    const hex = '0x' + octets.map(o => o.toString(16).padStart(2, '0')).join('');
    findings.push({
      source: 'IPv4 Address Notations',
      sourceUrl: 'https://en.wikipedia.org/wiki/IPv4#Address_representations',
      timestamp,
      status: 'confirmed',
      confidence: 'Confirmed',
      collectionMethod: 'Mathematical Encoding',
      data: { dword, hex, binary: octets.map(o => o.toString(2).padStart(8, '0')).join('.') },
      observation: `Decimal DWORD: ${dword}. Hexadecimal: ${hex}. (Used to identify URL obfuscation techniques).`
    });
  }

  return {
    target: ip,
    type: 'ip',
    ipVersion,
    scope,
    isPublic,
    timestamp,
    findings
  };
}

module.exports = {
  investigateIp
};
