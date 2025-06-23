import React from "react";

const BooksList = ({ books, selectedBookId, onBookSelect }) => {
  if (books.length === 0) {
    return (
      <div className="books-list">
        <h3>Your Books</h3>
        <p>No books found. Upload an EPUB file to get started.</p>
      </div>
    );
  }

  return (
    <div className="books-list">
      <h3>Your Books</h3>
      <ul>
        {books.map((book) => (
          <li
            key={book.id}
            className={book.id === selectedBookId ? "selected" : ""}
            onClick={() => onBookSelect(book.id)}
          >
            <div className="book-title">{book.title}</div>
            <div className="book-author">by {book.author}</div>
            <div className="book-date">
              {new Date(book.upload_date).toLocaleDateString()}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default BooksList;
