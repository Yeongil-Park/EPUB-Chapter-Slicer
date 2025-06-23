import React, { useState, useEffect } from "react";
import EPUBUploader from "./EPUBUploader";
import EPUBReader from "./EPUBReader";
import BooksList from "./BooksList";
import api from "../services/api";
import "../styles/App.css";

function App() {
  const [books, setBooks] = useState([]);
  const [selectedBookId, setSelectedBookId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        setLoading(true);
        const data = await api.getAllBooks();
        setBooks(data);

        // 첫 번째 책을 기본 선택
        if (data.length > 0 && !selectedBookId) {
          setSelectedBookId(data[0].id);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchBooks();
  }, []);

  const handleBookSelect = (bookId) => {
    setSelectedBookId(bookId);
  };

  const handleUploadComplete = (book) => {
    setBooks((prevBooks) => [book, ...prevBooks]);
    setSelectedBookId(book.id);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>EPUB Chapter Slicer</h1>
      </header>

      <div className="app-content">
        <div className="sidebar">
          <EPUBUploader onUploadComplete={handleUploadComplete} />

          {loading ? (
            <p>Loading books...</p>
          ) : error ? (
            <p className="error">Error: {error}</p>
          ) : (
            <BooksList
              books={books}
              selectedBookId={selectedBookId}
              onBookSelect={handleBookSelect}
            />
          )}
        </div>

        <div className="reader-container">
          {selectedBookId ? (
            <EPUBReader bookId={selectedBookId} />
          ) : (
            <div className="empty-state">
              <p>Select a book or upload a new EPUB file to get started.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
