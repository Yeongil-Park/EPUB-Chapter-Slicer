import axios from "axios";
import { createClient } from "@supabase/supabase-js";
import epubParser from "./epub-parser";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080/api";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// Axios 인스턴스 생성 및 설정
const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 60000, // 타임아웃 60초로 증가
  headers: {
    "Content-Type": "application/json",
  },
});

// 요청 인터셉터 추가
apiClient.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error("API Request Error:", error);
    return Promise.reject(error);
  }
);

// 응답 인터셉터 추가
apiClient.interceptors.response.use(
  (response) => {
    console.log(`API Response: ${response.status} ${response.statusText}`);
    return response;
  },
  (error) => {
    console.error("API Response Error:", error.response || error);
    return Promise.reject(error);
  }
);

const api = {
  // Supabase를 통한 데이터 액세스
  async getAllBooks() {
    try {
      const { data, error } = await supabase
        .from("books")
        .select() // '*' 제거하여 캐싱 문제 방지
        .order("upload_date", { ascending: false });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error fetching books from Supabase:", error);
      throw error;
    }
  },

  async getBookById(id) {
    try {
      const { data: book, error: bookError } = await supabase
        .from("books")
        .select() // '*' 제거
        .eq("id", id)
        .single();

      if (bookError) throw bookError;

      const { data: sections, error: sectionsError } = await supabase
        .from("book_sections")
        .select() // '*' 제거
        .eq("book_id", id)
        .order("order_num", { ascending: true });

      if (sectionsError) throw sectionsError;

      return { ...book, sections };
    } catch (error) {
      console.error(`Error fetching book ID ${id}:`, error);
      throw error;
    }
  },

  // 프론트엔드에서 EPUB 파싱 후 백엔드로 전송
  async uploadEPUB(file) {
    try {
      console.log(
        `Starting to parse EPUB file: ${file.name} (${file.size} bytes)`
      );

      // 1. 프론트엔드에서 EPUB 파싱
      const parsedBook = await epubParser.parseEPUB(file);
      console.log(
        `EPUB parsed successfully: ${parsedBook.title} with ${parsedBook.sections.length} sections`
      );

      // 2. 파싱된 데이터를 백엔드로 전송
      const bookData = {
        title: parsedBook.title,
        author: parsedBook.author,
        sections: parsedBook.sections,
        fileName: file.name,
      };

      console.log(
        `Sending parsed book data to server: ${bookData.title} by ${bookData.author}`
      );
      const response = await apiClient.post("/books", bookData);

      console.log("Book uploaded successfully:", response.data);
      return response.data;
    } catch (error) {
      console.error("Error uploading and parsing EPUB:", error);

      // 더 자세한 오류 메시지 생성
      const errorMessage =
        error.response?.data?.error || error.message || "Unknown error";
      const errorDetails = error.response?.data?.details || "";

      throw new Error(
        `Error uploading file: ${errorMessage}${
          errorDetails ? ` - ${errorDetails}` : ""
        }`
      );
    }
  },
};

export default api;
