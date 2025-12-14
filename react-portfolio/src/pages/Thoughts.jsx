import React from 'react';

const Thoughts = () => {
  return (
    <div className="page-container">
      <h2 className="page-title">My Thoughts</h2>

      <article className="thought-article">
        <h3>The Importance of Evidence Integrity in Digital Forensics</h3>
        <p>
          In any forensic discipline, the integrity of evidence is paramount. In digital forensics, this principle is both more critical and more challenging to uphold. Unlike a physical object, digital data can be altered, copied, or deleted without leaving obvious traces. An investigator's primary duty is to ensure that the process of examining digital evidence does not modify the original data. This is achieved through the use of write-blockers (hardware or software that prevent write operations to a storage device) and the creation of bit-for-bit forensic images. Every analytical step must be performed on a verified copy, leaving the original source pristine. Failure to maintain this integrity invalidates any findings and undermines the entire investigative process.
        </p>
      </article>

      <article className="thought-article">
        <h3>Why Read-Only Analysis Matters</h3>
        <p>
          Read-only analysis is a non-negotiable tenet of sound forensic practice. Interacting with a live system or a piece of evidence in a way that could change its state—even something as simple as opening a file—can have cascading effects. File access times may be updated, metadata can be altered, and temporary files may be created or deleted. These changes, however small, contaminate the evidence pool. A forensic examination must be a passive observation of the data as it existed at the time of collection. By working on a forensic image with write-blocking capabilities enabled, an analyst can guarantee that their actions are not introducing new variables. This disciplined, read-only approach ensures that any conclusions drawn are based solely on the original state of the evidence.
        </p>
      </article>

      <article className="thought-article">
        <h3>Limitations of Automated Forensic Tools</h3>
        <p>
          Automated forensic tools are indispensable for processing vast quantities of data quickly. They can parse complex file systems, carve out deleted files, and flag known contraband based on hash signatures. However, over-reliance on automation can lead to critical errors. A tool is only as effective as its underlying algorithms and the knowledge of the analyst operating it. Automated tools may fail to parse non-standard data structures, misinterpret context, or generate false positives. The output of any tool should be considered a starting point for analysis, not a final conclusion. It is the investigator's responsibility to manually verify the tool's findings, understand its limitations, and be able to explain how the evidence supports their conclusions independent of the software that processed it.
        </p>
      </article>
    </div>
  );
};

export default Thoughts;