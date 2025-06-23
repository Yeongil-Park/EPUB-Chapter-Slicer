import React, { useState, useEffect } from "react";
import TocViewer from "./TocViewer";
import api from "../services/api";
import "../styles/EPUBReader.css";

const EPUBReader = ({ bookId }) => {
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);

  useEffect(() => {
    const fetchBook = async () => {
      try {
        setLoading(true);
        const data = await api.getBookById(bookId);
        setBook(data);
        setCurrentSectionIndex(0); // 새 책을 불러올 때 첫 섹션으로 이동
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (bookId) {
      fetchBook();
    }
  }, [bookId]);

  const handleSectionChange = (index) => {
    setCurrentSectionIndex(index);
    // 섹션 변경시 상단으로 스크롤
    document.querySelector(".content-container").scrollTop = 0;
  };

  if (loading) return <div className="loading">Loading book...</div>;
  if (error) return <div className="error">Error loading book: {error}</div>;
  if (!book) return <div className="no-book">No book selected</div>;
  if (!book.sections || book.sections.length === 0)
    return <div className="no-sections">This book has no sections.</div>;

  const currentSection = book.sections[currentSectionIndex];

  return (
    <div className="epub-reader">
      <div className="reader-header">
        <h2>{book.title}</h2>
        <h3>By {book.author}</h3>
      </div>

      <div className="reader-content">
        <TocViewer
          sections={book.sections}
          currentIndex={currentSectionIndex}
          onSectionClick={handleSectionChange}
        />

        <div className="content-container">
          <div className="section-header">
            <h4>{currentSection.title}</h4>
          </div>
          <div
            className="section-content"
            dangerouslySetInnerHTML={{ __html: currentSection.content }}
          />

          <div className="navigation-buttons">
            <button
              onClick={() => handleSectionChange(currentSectionIndex - 1)}
              disabled={currentSectionIndex === 0}
            >
              Previous Chapter
            </button>
            <span className="section-indicator">
              {currentSectionIndex + 1} / {book.sections.length}
            </span>
            <button
              onClick={() => handleSectionChange(currentSectionIndex + 1)}
              disabled={currentSectionIndex === book.sections.length - 1}
            >
              Next Chapter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EPUBReader;
