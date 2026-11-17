// OSINT Investigation Correlation Engine
// Synthesizes raw findings across disparate providers, detects cross-source relationships,
// calculates confidence classifications, and produces structured analyst reports.

function generateInvestigationId() {
  const timePart = Date.now().toString(36).toUpperCase();
  const randPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `INV-${timePart}-${randPart}`;
}

function correlateFindings(rawInvestigation) {
  const { target, type, timestamp, findings = [] } = rawInvestigation;
  const investigationId = generateInvestigationId();

  const confirmedFindings = [];
  const possibleFindings = [];
  const unverifiedFindings = [];
  const relationships = [];
  const sourcesReferenced = [];

  // Group findings and catalogue sources
  for (const f of findings) {
    if (f.source && f.sourceUrl) {
      sourcesReferenced.push({
        name: f.source,
        url: f.sourceUrl,
        collectionMethod: f.collectionMethod || 'Automated Probe',
        status: f.status
      });
    }

    if (f.confidence === 'Confirmed') {
      confirmedFindings.push(f);
    } else if (f.confidence === 'High confidence' || f.confidence === 'Moderate confidence') {
      possibleFindings.push(f);
    } else {
      unverifiedFindings.push(f);
    }
  }

  // Cross-Source Correlation Logic
  if (type === 'username') {
    const github = findings.find(f => f.platform === 'GitHub' && f.status === 'confirmed');
    if (github && github.metadata && github.metadata.blog) {
      relationships.push({
        from: 'GitHub Profile',
        to: 'Personal Website Domain',
        link: github.metadata.blog,
        explanation: `GitHub account bio for "${target}" explicitly links to external website "${github.metadata.blog}".`,
        confidence: 'High confidence'
      });
    }

    const confirmedPlatforms = findings.filter(f => f.status === 'confirmed');
    if (confirmedPlatforms.length > 1) {
      relationships.push({
        from: confirmedPlatforms[0].platform,
        to: confirmedPlatforms.slice(1).map(p => p.platform).join(', '),
        explanation: `Identical username "${target}" successfully registered across ${confirmedPlatforms.length} distinct public services. Indicates potential cross-platform handle reuse.`,
        confidence: 'Moderate confidence'
      });
    }
  } else if (type === 'domain') {
    const dnsFinding = findings.find(f => f.source === 'DNS Zone Resolution' && f.data);
    const tlsFinding = findings.find(f => f.source.includes('TLS') && f.data);
    const ctFinding = findings.find(f => f.source.includes('Certificate Transparency') && f.data);

    if (dnsFinding && dnsFinding.data && dnsFinding.data.A) {
      relationships.push({
        from: `Domain (${target})`,
        to: `Primary IP Infrastructure (${dnsFinding.data.A[0]})`,
        link: dnsFinding.data.A[0],
        explanation: `Domain apex record delegates directly to network host ${dnsFinding.data.A.join(', ')}.`,
        confidence: 'Confirmed'
      });
    }

    if (tlsFinding && tlsFinding.data && tlsFinding.data.issuer) {
      relationships.push({
        from: `Domain (${target})`,
        to: `Certificate Authority (${tlsFinding.data.issuer})`,
        explanation: `TLS encryption negotiated via certificate issued by "${tlsFinding.data.issuer}".`,
        confidence: 'Confirmed'
      });
    }

    if (ctFinding && Array.isArray(ctFinding.data) && ctFinding.data.length > 0) {
      relationships.push({
        from: `Domain (${target})`,
        to: `Discovered Subdomains (${ctFinding.data.length} endpoints)`,
        explanation: `Passive Certificate Transparency records expose ${ctFinding.data.length} historical public subdomains for this root.`,
        confidence: 'High confidence'
      });
    }
  } else if (type === 'email') {
    const mxFinding = findings.find(f => f.source === 'DNS MX Resolution' && f.provider);
    if (mxFinding) {
      relationships.push({
        from: `Email Identity (${target})`,
        to: `Mail Host (${mxFinding.provider})`,
        explanation: `Mail routing for this address is managed by ${mxFinding.provider}.`,
        confidence: 'Confirmed'
      });
    }
  }

  // Exposure Observations & Security Recommendations
  const exposureObservations = [];
  const recommendations = [];

  if (type === 'domain') {
    const secHeaders = findings.find(f => f.source === 'HTTP Security Headers Audit' && f.data);
    if (secHeaders && secHeaders.data) {
      if (!secHeaders.data.hsts) {
        exposureObservations.push('HTTP Strict Transport Security (HSTS) is not enforced.');
        recommendations.push('Implement Strict-Transport-Security header (max-age=31536000; includeSubDomains; preload) to defend against SSL stripping attacks.');
      }
      if (!secHeaders.data.csp) {
        exposureObservations.push('Content Security Policy (CSP) header is absent.');
        recommendations.push('Deploy a restrictive Content-Security-Policy to mitigate Cross-Site Scripting (XSS) and resource injection.');
      }
    }
    const dnsFinding = findings.find(f => f.source === 'DNS Zone Resolution');
    if (dnsFinding && dnsFinding.data && !dnsFinding.data.CAA) {
      recommendations.push('Configure DNS Certification Authority Authorization (CAA) records to restrict unauthorized TLS certificate issuance.');
    }
  } else if (type === 'email') {
    const spfFinding = findings.find(f => f.source === 'DNS SPF Policy' && f.status === 'not_found');
    const dmarcFinding = findings.find(f => f.source === 'DNS DMARC Policy' && f.status === 'not_found');
    if (spfFinding) {
      exposureObservations.push('Sender Policy Framework (SPF) record is missing on target domain.');
      recommendations.push('Publish an SPF TXT record (v=spf1) designating authorized mail servers to prevent domain spoofing.');
    }
    if (dmarcFinding) {
      exposureObservations.push('DMARC record is not published for this domain.');
      recommendations.push('Deploy a DMARC policy (_dmarc.domain) with reporting enabled (p=reject or p=quarantine) to ensure email integrity.');
    }
  } else if (type === 'username') {
    if (confirmedFindings.length > 2) {
      exposureObservations.push(`Handle reuse confirmed across ${confirmedFindings.length} distinct public services.`);
      recommendations.push('Maintain distinct pseudonyms between developer, social, and personal services to reduce cross-platform tracking and correlation.');
    }
  }

  // Executive Summary Synthesis
  let summary = `Investigation completed for target "${target}" (Type: ${type.toUpperCase()}). `;
  summary += `Discovered ${confirmedFindings.length} confirmed indicator(s) and ${possibleFindings.length} potential correlation(s) across ${sourcesReferenced.length} queried intelligence source(s). `;
  if (relationships.length > 0) {
    summary += `Correlation engine established ${relationships.length} cross-source infrastructure or identity relationship(s).`;
  }

  return {
    investigationId,
    target,
    type,
    timestamp,
    executiveSummary: summary,
    confirmedFindings,
    possibleFindings,
    unverifiedFindings,
    relationships,
    sourcesReferenced,
    exposureObservations,
    recommendations,
    limitations: [
      'All intelligence gathered strictly via passive, non-intrusive, and lawful public endpoints.',
      'Identical usernames across multiple platforms indicate potential reuse but do not conclusively prove common individual attribution without external corroboration.',
      'Geolocation estimates for IP addresses are network-level approximations provided by public BGP registries and do not represent physical residential locations.'
    ]
  };
}

module.exports = {
  correlateFindings
};
