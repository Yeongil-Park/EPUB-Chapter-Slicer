const express = require("express");
const router = express.Router();
const bookController = require("../controllers/bookController");

// 책 생성 (프론트엔드에서 파싱된 데이터 저장)
router.post("/books", bookController.createBook);

// 책 ID로 조회
router.get("/books/:id", bookController.getBookById);

// 모든 책 조회
router.get("/books", bookController.getAllBooks);

module.exports = router;
