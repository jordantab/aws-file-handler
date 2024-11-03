"use client";

import { useState } from "react";

const HomePage = () => {
  const [text, setText] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // TODO: Update alerts with custom modals

  // Handle text input change
  const handleTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(event.target.value);
  };

  // Handle file selection
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setFile(event.target.files[0]);
    }
  };

  // Handle upload button click
  const handleUpload = async () => {
    if (!file) {
      alert("Please select a file to upload.");
      return;
    }

    try {
      setIsUploading(true);

      // 1: Request pre-signed URL
      const response = await fetch(`/api/generate-url?fileName=${file.name}`);
      if (!response.ok) {
        throw new Error("Failed to get pre-signed URL");
      }
      const { url } = await response.json();

      // 2: Upload the file directly to S3 using the pre-signed URL
      await fetch(url, {
        method: "PUT",
        body: file,
      });

      alert("File uploaded successfully!");
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Failed to upload the file.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="bg-white p-6 rounded-md shadow-md w-full max-w-lg">
        <h1 className="text-2xl font-bold mb-4 text-center">
          Upload Your File
        </h1>

        {/* Text Input */}
        <textarea
          value={text}
          onChange={handleTextChange}
          className="w-full p-2 mb-4 border rounded-md focus:outline-none focus:ring focus:border-blue-300"
          placeholder="Enter your text here (1024 characters max)"
          maxLength={1024}
          rows={4}
        />

        {/* File Upload Input */}
        <input
          type="file"
          onChange={handleFileChange}
          className="mb-4"
          accept=".txt"
        />

        {/* Upload Button */}
        <button
          onClick={handleUpload}
          className={`w-full p-2 text-white rounded-md ${
            isUploading
              ? "bg-gray-500 cursor-not-allowed"
              : "bg-blue-500 hover:bg-blue-600"
          }`}
        >
          {isUploading ? "Uploading..." : "Upload"}
        </button>
      </div>
    </div>
  );
};

export default HomePage;
