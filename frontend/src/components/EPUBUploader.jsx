import React, { useState } from "react";
import api from "../services/api";
import "../styles/EPUBUploader.css";

const EPUBUploader = ({ onUploadComplete }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.type === "application/epub+zip") {
      setFile(selectedFile);
      setError(null);
    } else {
      setFile(null);
      setError("Please select a valid EPUB file.");
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      setProgress(10); // 파싱 시작
      const book = await api.uploadEPUB(file);
      setProgress(100); // 완료

      if (onUploadComplete) {
        onUploadComplete(book);
      }
    } catch (err) {
      console.error("Upload error:", err);
      setError(`Error uploading file: ${err.message}`);
    } finally {
      setUploading(false);
      setFile(null);
    }
  };

  return (
    <div className="epub-uploader">
      <h3>Upload EPUB Book</h3>

      <div className="upload-form">
        <input
          type="file"
          accept=".epub,application/epub+zip"
          onChange={handleFileChange}
          disabled={uploading}
        />

        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="upload-button"
        >
          {uploading ? "Processing..." : "Upload & Process"}
        </button>
      </div>

      {uploading && (
        <div className="progress-container">
          <div className="progress-bar">
            <div className="progress" style={{ width: `${progress}%` }}></div>
          </div>
          <span className="progress-text">{progress}%</span>
        </div>
      )}

      {error && <p className="error-message">{error}</p>}

      {file && !uploading && (
        <div className="file-info">
          <p>
            Selected file: {file.name} ({(file.size / 1024 / 1024).toFixed(2)}{" "}
            MB)
          </p>
        </div>
      )}
    </div>
  );
};

export default EPUBUploader;
