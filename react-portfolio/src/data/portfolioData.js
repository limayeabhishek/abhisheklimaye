export const TOOLKIT_ITEMS = [
  {
    id: 'osint',
    title: 'OSINT Search',
    description: 'Multi-source digital footprint reconnaissance workstation with cross-source correlation and report export.',
    route: '/toolkit/osint',
  },
  {
    id: 'hash-calculator',
    title: 'HashCalculator',
    description: 'Forensic cryptographic hash engine for text and local files (MD5, SHA-1, SHA-256, SHA-512) with verification.',
    route: '/toolkit/hash-calculator',
  },
  {
    id: 'port-scanner',
    title: 'Port Scanner',
    description: 'Interactive TCP service & port exposure simulator for common forensic and perimeter reconnaissance baselines.',
    route: '/toolkit/port-scanner',
  },
  {
    id: 'pass-check',
    title: 'PassCheck',
    description: 'Client-side credential entropy, character-set diversity, and brute-force crack-time evaluator.',
    route: '/toolkit/pass-check',
  },
  {
    id: 'audiosync',
    title: 'AudioSync',
    description: 'Real-time multi-device speaker sync room for shared listening across phones and laptops via QR code.',
    route: '/toolkit/audiosync',
  },
];

export const PROJECTS_ITEMS = [
  {
    slug: 'uav-security-lab',
    title: 'SECUREDRONE (UAV-Security-Lab)',
    shortDesc: 'Empirical UAV security research platform, MAVLink 2 auditing, firmware reverse engineering, and GNSS resilience.',
    tagline: 'Open UAV Security Research & Assessment Platform',
    githubUrl: 'https://github.com/limayeabhishek/UAV-Security-Lab',
    overview: [
      'Open-source, empirical cybersecurity engineering platform designed for verifiable research into Unmanned Aerial Vehicle (UAV) systems, communication protocols, companion computers, flight-controller firmware, and cyber-physical navigation resilience.',
      'The project provides a rigorous testing and vulnerability assessment environment combining software-in-the-loop (SITL) autopilot simulation, containerized Linux companion computers, production firmware reverse engineering, offline RF signal processing, and synthetic GNSS spoofing detection.',
    ],
    sections: [
      {
        heading: 'Core Research Architecture',
        bullets: [
          'Stage 01 — Protocol Reconnaissance: Headless PX4 SITL orchestration, MAVLink v1/v2 frame parsing, endpoint identification, and baseline telemetry capture across simulated networks.',
          'Stage 02 — MAVLink Security Engine: Custom assessment framework covering protocol parsing, MAVLink 2 cryptographic signature validation (HMAC-SHA256), replay attack resistance, and parameter trust-boundary auditing.',
          'Stage 03 — Companion Computer Hardening: Security auditing of companion services, REST API authorization bypasses, privilege escalation surfaces, and serial link isolation.',
          'Stage 04 — Firmware Reverse Engineering: Production autopilot binary analysis (.apj / .px4), container unpacking, CPU architecture validation (ARM Cortex-M7 / STM32F767), memory layout recovery, and Ghidra disassembly.',
          'Stage 05 — RF & Cyber-Physical Resilience: Offline 2-GFSK IQ signal demodulation, link-layer framing extraction, synthetic GNSS anomaly generation, kinematic innovation (chi-squared) analysis, and failsafe transition verification.',
          'Stage 06 — Threat Modeling & Remediation: End-to-end STRIDE threat modeling, CVSS v3.1/v4.0 scored vulnerability registry, defensive remediation guidelines, and automated regression test suites.',
        ],
      },
      {
        heading: 'Key Deliverables & Artifacts',
        bullets: [
          'Technical Manual & Textbook: Exhaustive engineering guide covering protocol mathematics, memory maps, and step-by-step auditing methodologies.',
          'Academic Research Report: 5-page publication-grade LaTeX technical report documenting empirical findings and defense-in-depth mitigations.',
          'Empirical Evidence & Telemetry PCAPs: Over 3,700 captured baseline frames, cryptographic verification logs, and demodulation analysis plots.',
          'Automated Test Suite: Comprehensive unit and regression test suite verifying protocol parsing, replay detection, and cryptographic validation.',
        ],
      },
    ],
    tags: ['MAVLink 2', 'PX4 Autopilot', 'SITL', 'Ghidra', 'ARM Cortex-M7', 'GNSS Resilience', 'Python'],
  },
  {
    slug: 'macheimdall',
    title: 'MacHeimdall',
    shortDesc: 'Advanced security monitoring and forensics tool for macOS.',
    tagline: 'macOS Intrusion Detection & Log Forensic Analysis',
    githubUrl: 'https://github.com/limayeabhishek/MacHeimdall',
    overview: [
      'Advanced security monitoring and forensics tool for macOS.',
      'MacHeimdall is designed to provide deep visibility into macOS system activities, helping security practitioners detect and investigate potential threats. It focuses on gathering critical forensic artifacts and monitoring system calls to identify anomalous behavior specific to the Mac ecosystem.',
    ],
    sections: [
      {
        heading: 'Technical Highlights',
        bullets: [
          'In-depth ingestion and parsing of macOS Unified Logs and sysdiagnose archives.',
          'Detection of persistence mechanisms (LaunchDaemons, LaunchAgents, Login Items).',
          'Audit of authorization traces, TCC permissions, and Gatekeeper bypass vectors.',
        ],
      },
    ],
    tags: ['macOS Forensics', 'Unified Logs', 'DFIR', 'Threat Detection', 'Shell', 'Python'],
  },
  {
    slug: 'sentinelsoc',
    title: 'SentinelSOC',
    shortDesc: 'Security Operations Center (SOC) framework and integration scripts.',
    tagline: 'Security Operations Center Framework & Integration Suite',
    githubUrl: 'https://github.com/limayeabhishek/SentinelSOC',
    overview: [
      'Security Operations Center (SOC) framework and integration scripts.',
      'SentinelSOC provides a structured approach to managing security operations. It includes a suite of scripts and configurations designed to integrate various security tools, automate alert triaging, and streamline the incident response lifecycle for modern security teams.',
    ],
    sections: [
      {
        heading: 'Technical Highlights',
        bullets: [
          'Automated alert triaging scripts integrating threat intelligence feeds.',
          'Standardized detection rules and incident response playbooks.',
          'Modular log normalizers for multi-source correlation.',
        ],
      },
    ],
    tags: ['SOC Automation', 'SIEM', 'Alert Triage', 'Incident Response', 'Python'],
  },
  {
    slug: 'smartdeck',
    title: 'SmartDeck',
    shortDesc: 'Open-source alternative for digital forensics orchestration.',
    tagline: 'Digital Forensics Orchestration Platform',
    githubUrl: 'https://github.com/limayeabhishek/SmartDeck',
    overview: [
      'Open-source alternative for digital forensics orchestration.',
      'SmartDeck is an orchestration platform tailored for digital forensics and incident response (DFIR). It allows investigators to automate repetitive tasks, manage evidence collection across multiple endpoints, and maintain a clear audit trail of forensic actions.',
    ],
    sections: [
      {
        heading: 'Technical Highlights',
        bullets: [
          'Automated evidence acquisition across remote and local targets.',
          'Cryptographic chain-of-custody tracking with hash logging.',
          'Streamlined artifact extraction for rapid triage and scoping.',
        ],
      },
    ],
    tags: ['Digital Forensics', 'Evidence Integrity', 'DFIR', 'Automation', 'Python'],
  },
  {
    slug: 'cyber-lab',
    title: 'Abhishek-cyber-lab',
    shortDesc: 'A collection of cybersecurity lab environments and walkthroughs.',
    tagline: 'Cybersecurity Lab Environments & Defensive Walkthroughs',
    githubUrl: 'https://github.com/limayeabhishek/Abhishek-cyber-lab',
    overview: [
      'A collection of cybersecurity lab environments and walkthroughs.',
      'This repository serves as a personal laboratory for exploring various cybersecurity concepts, including penetration testing, vulnerability assessment, and defensive security configurations. It contains documentation and setup guides for various lab scenarios.',
    ],
    sections: [
      {
        heading: 'Technical Highlights',
        bullets: [
          'Virtual lab topologies for adversary emulation and defense testing.',
          'Detailed configuration guides for network isolation and monitoring.',
          'Step-by-step documentation for blue-team defensive exercises.',
        ],
      },
    ],
    tags: ['Security Labs', 'Network Topologies', 'Vulnerability Assessment', 'Hardening'],
  },
];

export const FALLBACK_PUBLIC_THOUGHT = {
  id: 'fallback-public-1',
  slug: 'your-data-is-more-powerful-than-you-think',
  title: 'Your Data Is More Powerful Than You Think',
  excerpt: 'I often hear people joke, “I don’t care if someone has my data — I have nothing to hide.” But the truth is...',
  published_at: '2026-01-20',
  is_private: false,
  linkedinUrl:
    'https://www.linkedin.com/posts/abhishekdlimaye_dataprivacy-cybersecurity-digitalfootprint-activity-7406284265597992961-F90x?utm_source=share&utm_medium=member_desktop&rcm=ACoAAEXa-V0B8xDM430upffh-v2mGm1sIu8LGhc',
  content: `I often hear people joke, "I don't care if someone has my data — I have nothing to hide." But the truth is, your data is not just about you. It paints a bigger picture that companies, marketers, and even governments can use to understand entire populations.

Your personal data — what you search, watch, click on, and even how long you pause on a post — is constantly being analyzed. It's not just about what you actively share; algorithms can also learn from scrolling patterns, response times, and browsing behavior across apps.

That's why you might notice ads or recommendations for things you only recently searched for or showed interest in. This isn't a coincidence — it's data collection and machine learning at work.

Companies across industries rely on this data:
- Entertainment platforms use it to recommend shows and movies you're more likely to watch.
- Healthcare organizations study trends to improve treatments and develop targeted solutions.
- Tech companies use it to design products that feel intuitive to your habits.

This tailored experience can feel convenient, but it also means organizations know a lot about you. Even something as simple as health or lifestyle preferences can influence pricing, product availability, and marketing strategies.

On a larger scale, patterns derived from millions of users can shape decisions in business, healthcare, and even politics.

The key takeaway? Protecting your digital presence is more than just safeguarding your privacy — it's about maintaining control over how your information shapes the world around you.

Cybersecurity and responsible data handling are not just for experts. They are for all of us.

Your data is powerful. Treat it that way.`,
};

export const LOCKED_PRIVATE_THOUGHT_PREVIEW = {
  id: 'locked-private-preview',
  slug: 'inside-lab-triage-memory-artifacts-live-forensics',
  title: 'Inside Lab Triage: Notes on Memory Artifacts & Live Forensics',
  excerpt:
    'Field notes from volatile memory acquisition, process-injection triage, and preserving ephemeral kernel indicators before a host is powered down...',
  published_at: '2026-11-15',
  is_private: true,
};
