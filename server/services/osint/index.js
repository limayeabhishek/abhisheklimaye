const { investigateUsername } = require('./usernameProvider');
const { investigateEmail } = require('./emailProvider');
const { investigateDomain } = require('./domainProvider');
const { investigateIp } = require('./ipProvider');
const { investigatePersonOrOrg } = require('./personProvider');
const { correlateFindings } = require('./correlationEngine');

async function runInvestigation(target, type) {
  if (!target || typeof target !== 'string') {
    throw new Error('Valid target string is required.');
  }

  const cleanTarget = target.trim();
  const normalizedType = (type || 'username').toLowerCase().trim();

  let rawResults;

  switch (normalizedType) {
    case 'username':
      rawResults = await investigateUsername(cleanTarget);
      break;
    case 'email':
      rawResults = await investigateEmail(cleanTarget);
      break;
    case 'domain':
      rawResults = await investigateDomain(cleanTarget);
      break;
    case 'ip':
      rawResults = await investigateIp(cleanTarget);
      break;
    case 'organization':
    case 'person':
      rawResults = await investigatePersonOrOrg(cleanTarget, normalizedType);
      break;
    default:
      throw new Error(`Unsupported investigation type: "${type}". Allowed: username, email, domain, ip, organization, person.`);
  }

  // Pass raw findings through correlation engine
  return correlateFindings(rawResults);
}

module.exports = {
  runInvestigation
};
