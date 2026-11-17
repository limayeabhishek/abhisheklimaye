import React from 'react';
import { ExternalLink, Terminal, Shield, Cpu, FolderGit2 } from 'lucide-react';

const projectsList = [
  {
    id: 'securedrone',
    title: 'SECUREDRONE (UAV-Security-Lab)',
    tagline: 'Open UAV Security Research & Assessment Platform',
    description: 'Empirical cybersecurity engineering platform designed for verifiable research into Unmanned Aerial Vehicle (UAV) systems, communication protocols, companion computers, flight-controller firmware, and cyber-physical navigation resilience.',
    highlights: [
      'MAVLink 2 cryptographic signing (HMAC-SHA256) and replay attack evaluation.',
      'Headless PX4 SITL simulation and Wireshark telemetry capture (3,748 frames).',
      'Production STM32F767 firmware reverse engineering with Ghidra disassembly.',
      'Offline RF 2-GFSK IQ signal demodulation and Chi-squared GNSS spoofing anomaly detection.',
      'Includes 5-page publication-grade LaTeX research report and 40+ page technical manual.'
    ],
    tags: ['MAVLink 2', 'PX4 Autopilot', 'SITL', 'Ghidra', 'ARM Cortex-M7', 'GNSS Resilience', 'Python'],
    githubUrl: 'https://github.com/limayeabhishek/UAV-Security-Lab'
  },
  {
    id: 'macheimdall',
    title: 'MacHeimdall',
    tagline: 'macOS Intrusion Detection & Log Forensic Analysis',
    description: 'DFIR case study and security monitoring tool engineered for macOS environments. Gathers critical forensic artifacts, traces authentication events, and audits system calls to detect anomalous behavior within Apple ecosystems.',
    highlights: [
      'In-depth ingestion and parsing of macOS Unified Logs and sysdiagnose archives.',
      'Detection of persistence mechanisms (LaunchDaemons, LaunchAgents, Login Items).',
      'Audit of authorization traces, TCC permissions, and Gatekeeper bypass vectors.'
    ],
    tags: ['macOS Forensics', 'Unified Logs', 'DFIR', 'Threat Detection', 'Shell', 'Python'],
    githubUrl: 'https://github.com/limayeabhishek/MacHeimdall'
  },
  {
    id: 'sentinelsoc',
    title: 'SentinelSOC',
    tagline: 'Security Operations Center Framework & Integration Suite',
    description: 'Structured framework designed to streamline and automate security operations workflows, SIEM alert triage, and incident response pipelines for blue teams.',
    highlights: [
      'Automated alert triaging scripts integrating threat intelligence feeds.',
      'Standardized detection rules and incident response playbooks.',
      'Modular log normalizers for multi-source correlation.'
    ],
    tags: ['SOC Automation', 'SIEM', 'Alert Triage', 'Incident Response', 'Python'],
    githubUrl: 'https://github.com/limayeabhishek/SentinelSOC'
  },
  {
    id: 'smartdeck',
    title: 'SmartDeck',
    tagline: 'Digital Forensics Orchestration Platform',
    description: 'Open-source alternative for digital forensics orchestration. Automates evidence collection across endpoints, maintains tamper-evident audit trails, and accelerates forensic triage.',
    highlights: [
      'Automated evidence acquisition across remote and local targets.',
      'Cryptographic chain-of-custody tracking with hash logging.',
      'Streamlined artifact extraction for rapid triage and scoping.'
    ],
    tags: ['Digital Forensics', 'Evidence Integrity', 'DFIR', 'Automation', 'Python'],
    githubUrl: 'https://github.com/limayeabhishek/SmartDeck'
  },
  {
    id: 'cyber-lab',
    title: 'Abhishek-cyber-lab',
    tagline: 'Cybersecurity Lab Environments & Defensive Walkthroughs',
    description: 'A collection of hands-on security lab topologies, defensive testing environments, network hardening walkthroughs, and practical vulnerability assessments.',
    highlights: [
      'Virtual lab topologies for adversary emulation and defense testing.',
      'Detailed configuration guides for network isolation and monitoring.',
      'Step-by-step documentation for blue-team defensive exercises.'
    ],
    tags: ['Security Labs', 'Network Topologies', 'Vulnerability Assessment', 'Hardening'],
    githubUrl: 'https://github.com/limayeabhishek/Abhishek-cyber-lab'
  }
];

const Projects = () => {
  return (
    <div className="page-container">
      <div className="projects-page-header">
        <h2 className="page-title">Research & Engineering Projects</h2>
        <p className="page-subtitle">
          Empirical cybersecurity research, digital forensics tooling, aerospace protocol auditing, and operational security frameworks.
        </p>
      </div>

      <div className="projects-feed">
        {projectsList.map((project) => (
          <div key={project.id} className="project-detail-card">
            <div className="project-card-top">
              <div>
                <h3 className="project-title">{project.title}</h3>
                <div className="project-tagline">{project.tagline}</div>
              </div>
              <a
                href={project.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="project-github-btn"
                title="View on GitHub"
              >
                <FolderGit2 size={14} strokeWidth={1.5} />
                <span>GITHUB</span>
                <ExternalLink size={12} strokeWidth={1.5} />
              </a>
            </div>

            <p className="project-desc">{project.description}</p>

            <div className="project-highlights">
              <div className="highlights-title">KEY TECHNICAL DELIVERABLES:</div>
              <ul className="highlights-list">
                {project.highlights.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="project-tech-tags">
              {project.tags.map((tag, tIdx) => (
                <span key={tIdx} className="tech-tag">{tag}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Projects;
