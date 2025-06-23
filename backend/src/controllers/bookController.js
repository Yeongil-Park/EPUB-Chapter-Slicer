const supabase = require("../utils/supabaseClient");

exports.createBook = async (req, res) => {
  try {
    const { title, author, sections, fileName } = req.body;

    // 요청 데이터 유효성 검사 강화
    if (!title || !author || !sections) {
      return res.status(400).json({
        error: "Missing required book data: title, author, or sections",
      });
    }

    if (!Array.isArray(sections)) {
      return res.status(400).json({ error: "Sections must be an array" });
    }

    console.log(
      `Processing book: ${title} by ${author} with ${sections.length} sections`
    );

    // 1. 책 정보 저장 - file_name 대신 file_path 사용
    const { data: book, error: bookError } = await supabase
      .from("books")
      .insert({
        title,
        author,
        upload_date: new Date(),
        file_name: fileName || "unknown.epub", // file_name 대신 file_path 사용
      })
      .select()
      .single();

    if (bookError) {
      console.error("Error creating book in Supabase:", bookError);
      return res.status(500).json({
        error: bookError.message,
        details: "Failed to create book record in database",
      });
    }

    console.log(`Book created with ID: ${book.id}`);

    // 2. 각 섹션 저장 - 일괄 삽입으로 변경하여 성능 개선
    const sectionsToInsert = sections.map((section) => ({
      book_id: book.id,
      title: section.title || "Untitled Section",
      content: section.content || "",
      order_num: section.order || 0,
    }));

    const { error: sectionsError } = await supabase
      .from("book_sections")
      .insert(sectionsToInsert);

    if (sectionsError) {
      console.error("Error inserting sections:", sectionsError);
      // 섹션 저장 실패 시 생성된 책 정보도 삭제
      await supabase.from("books").delete().eq("id", book.id);
      return res.status(500).json({
        error: sectionsError.message,
        details: "Failed to save book sections",
      });
    }

    console.log(`Successfully saved ${sectionsToInsert.length} sections`);

    // 3. 저장된 책 정보 반환
    res.status(201).json({
      id: book.id,
      title: book.title,
      author: book.author,
      upload_date: book.upload_date,
      sections_count: sections.length,
    });
  } catch (error) {
    console.error("Unexpected error in createBook controller:", error);
    res.status(500).json({
      error: error.message || "Unknown server error",
      details: "An unexpected error occurred while processing the book",
    });
  }
};

exports.getBookById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Book ID is required" });
    }

    // 1. 책 정보 조회
    const { data: book, error: bookError } = await supabase
      .from("books")
      .select("*")
      .eq("id", id)
      .single();

    if (bookError) {
      if (bookError.code === "PGRST116") {
        return res.status(404).json({ error: "Book not found" });
      }
      return res.status(500).json({ error: bookError.message });
    }

    // 2. 책 섹션 조회
    const { data: sections, error: sectionsError } = await supabase
      .from("book_sections")
      .select("*")
      .eq("book_id", id)
      .order("order_num", { ascending: true });

    if (sectionsError) {
      return res.status(500).json({ error: sectionsError.message });
    }

    // 3. 책과 섹션 정보 반환
    res.json({
      ...book,
      sections,
    });
  } catch (error) {
    console.error("Error getting book:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getAllBooks = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("books")
      .select()
      .order("upload_date", { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (error) {
    console.error("Error getting books:", error);
    res.status(500).json({ error: error.message });
  }
};
