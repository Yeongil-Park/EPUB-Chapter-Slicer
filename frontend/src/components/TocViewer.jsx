import React from "react";

const TocViewer = ({ sections, currentIndex, onSectionClick }) => {
  return (
    <div className="toc-viewer">
      <h3>Table of Contents</h3>
      <div className="toc-list">
        {sections.map((section, index) => (
          <div
            key={index}
            className={`toc-item ${index === currentIndex ? "active" : ""}`}
            onClick={() => onSectionClick(index)}
          >
            {section.title}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TocViewer;
