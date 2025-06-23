import JSZip from "jszip";

// path 모듈 대체 유틸리티 함수
const pathUtils = {
  dirname: (path) => {
    return path.replace(/\/[^/]*$/, "");
  },
  join: (dir, file) => {
    if (file.startsWith("/")) return file;

    // 상대 경로 처리
    const parts = dir.split("/");
    const fileParts = file.split("/");

    for (const part of fileParts) {
      if (part === "..") {
        parts.pop();
      } else if (part !== ".") {
        parts.push(part);
      }
    }

    return parts.join("/");
  },
};

class EPUBParser {
  async parseEPUB(file) {
    try {
      console.log(
        `Starting to parse EPUB file: ${file.name} (${file.size} bytes)`
      );

      // 파일을 ArrayBuffer로 읽기
      const arrayBuffer = await this.readFileAsArrayBuffer(file);
      const zip = new JSZip();

      // EPUB 압축 해제
      const contents = await zip.loadAsync(arrayBuffer);

      // container.xml 파일에서 OPF 파일 경로 추출
      const containerFile = contents.file("META-INF/container.xml");
      if (!containerFile) {
        throw new Error("Invalid EPUB: container.xml not found");
      }

      const containerXml = await containerFile.async("string");

      // 브라우저의 기본 DOMParser 사용
      const parser = new DOMParser();
      const containerDoc = parser.parseFromString(
        containerXml,
        "application/xml"
      );

      const rootfileElement = containerDoc.getElementsByTagName("rootfile")[0];
      if (!rootfileElement) {
        throw new Error(
          "Invalid EPUB: rootfile element not found in container.xml"
        );
      }

      const rootfilePath = rootfileElement.getAttribute("full-path");
      const opfDir = pathUtils.dirname(rootfilePath);

      // OPF 파일 파싱
      const opfFile = contents.file(rootfilePath);
      if (!opfFile) {
        throw new Error(`OPF file not found at path: ${rootfilePath}`);
      }

      const opfContent = await opfFile.async("string");
      const opfDoc = parser.parseFromString(opfContent, "application/xml");

      // 책 메타데이터 추출
      const titleElement =
        opfDoc.getElementsByTagName("dc:title")[0] ||
        opfDoc.querySelector("*|title"); // 네임스페이스 고려
      const title = titleElement ? titleElement.textContent : "Unknown Title";

      const creatorElement =
        opfDoc.getElementsByTagName("dc:creator")[0] ||
        opfDoc.querySelector("*|creator"); // 네임스페이스 고려
      const creator = creatorElement
        ? creatorElement.textContent
        : "Unknown Author";

      // 매니페스트 항목 추출
      const manifestItems = {};
      const manifestElements = opfDoc.getElementsByTagName("item");
      for (let i = 0; i < manifestElements.length; i++) {
        const item = manifestElements[i];
        manifestItems[item.getAttribute("id")] = {
          href: item.getAttribute("href"),
          mediaType: item.getAttribute("media-type"),
        };
      }

      // 스파인 순서 추출
      const spine = [];
      const spineElements = opfDoc.getElementsByTagName("itemref");
      for (let i = 0; i < spineElements.length; i++) {
        spine.push(spineElements[i].getAttribute("idref"));
      }

      // NCX 파일 찾기
      let ncxItem;
      for (const id in manifestItems) {
        if (manifestItems[id].mediaType === "application/x-dtbncx+xml") {
          ncxItem = manifestItems[id];
          break;
        }
      }

      // NCX 파일이 없는 경우 대체 방법 사용
      if (!ncxItem) {
        console.warn(
          "NCX file not found, attempting to use spine for navigation"
        );
        // 스파인 기반 목차 생성
        const toc = await this.extractTocFromSpine(
          spine,
          contents,
          opfDir,
          manifestItems,
          parser
        );

        return {
          title,
          author: creator,
          sections: toc,
        };
      }

      const ncxPath = pathUtils.join(opfDir, ncxItem.href);
      const ncxFile = contents.file(ncxPath);

      if (!ncxFile) {
        throw new Error(`NCX file not found at path: ${ncxPath}`);
      }

      const ncxContent = await ncxFile.async("string");
      const ncxDoc = parser.parseFromString(ncxContent, "application/xml");

      // 목차(TOC) 추출
      const navPoints = ncxDoc.getElementsByTagName("navPoint");
      const toc = await this.extractToc(
        navPoints,
        contents,
        opfDir,
        manifestItems,
        spine,
        parser
      );

      return {
        title,
        author: creator,
        sections: toc,
      };
    } catch (error) {
      console.error("Error parsing EPUB:", error);
      throw error;
    }
  }

  async extractToc(navPoints, contents, opfDir, manifestItems, spine, parser) {
    const toc = [];
    const allChapterFiles = new Map(); // 모든 챕터 파일 경로와 내용을 저장할 맵

    // 먼저 모든 챕터 파일 내용을 미리 로드
    for (let i = 0; i < navPoints.length; i++) {
      const navPoint = navPoints[i];
      const content = navPoint.getElementsByTagName("content")[0];
      if (!content) continue;

      const src = content.getAttribute("src");
      if (!src) continue;

      const srcParts = src.split("#");
      const filePath = srcParts[0];
      const fullPath = pathUtils.join(opfDir, filePath);

      if (!allChapterFiles.has(fullPath)) {
        try {
          const fileEntry = contents.file(fullPath);
          if (fileEntry) {
            const htmlContent = await fileEntry.async("string");
            allChapterFiles.set(fullPath, htmlContent);
          }
        } catch (error) {
          console.error(`Error loading file ${fullPath}:`, error);
        }
      }
    }

    // 챕터 내용 추출
    for (let i = 0; i < navPoints.length; i++) {
      const navPoint = navPoints[i];
      const navLabel = navPoint.getElementsByTagName("navLabel")[0];
      if (!navLabel) continue;

      const text = navLabel.getElementsByTagName("text")[0];
      if (!text) continue;

      const title = text.textContent || `Section ${i + 1}`;

      const content = navPoint.getElementsByTagName("content")[0];
      if (!content) continue;

      const src = content.getAttribute("src");
      if (!src) continue;

      const srcParts = src.split("#");
      const filePath = srcParts[0];
      const anchor = srcParts.length > 1 ? srcParts[1] : null;

      const fullPath = pathUtils.join(opfDir, filePath);

      try {
        // 이미 로드된 파일 내용 사용
        const htmlContent = allChapterFiles.get(fullPath);
        if (!htmlContent) {
          console.warn(
            `File content not found for: ${fullPath}, skipping section`
          );
          continue;
        }

        // 브라우저 DOM 파싱 사용
        const doc = parser.parseFromString(htmlContent, "text/html");

        // 내용 추출 로직 개선
        let sectionContent = "";

        // 다음 챕터 정보 찾기 (현재 챕터 다음에 오는 챕터)
        let nextChapterPath = null;
        let nextChapterAnchor = null;
        if (i + 1 < navPoints.length) {
          const nextNavPoint = navPoints[i + 1];
          const nextContent = nextNavPoint.getElementsByTagName("content")[0];
          if (nextContent) {
            const nextSrc = nextContent.getAttribute("src");
            if (nextSrc) {
              const nextSrcParts = nextSrc.split("#");
              const nextFilePath = nextSrcParts[0];
              nextChapterPath = pathUtils.join(opfDir, nextFilePath);
              nextChapterAnchor =
                nextSrcParts.length > 1 ? nextSrcParts[1] : null;
            }
          }
        }

        // 1. 앵커가 있는 경우 해당 요소부터 다음 챕터 앵커까지의 내용 추출
        if (anchor) {
          const element = doc.getElementById(anchor);
          if (element) {
            // 같은 파일에 다음 챕터가 있는 경우
            if (fullPath === nextChapterPath && nextChapterAnchor) {
              const nextElement = doc.getElementById(nextChapterAnchor);
              if (nextElement) {
                // 현재 앵커부터 다음 앵커 전까지의 내용 추출
                let currentNode = element;
                while (currentNode && currentNode !== nextElement) {
                  if (currentNode.nodeType === Node.ELEMENT_NODE) {
                    sectionContent += currentNode.outerHTML;
                  }
                  currentNode = currentNode.nextSibling;
                }
              } else {
                // 다음 앵커를 찾지 못한 경우 현재 앵커의 내용만 추출
                sectionContent = element.outerHTML;
              }
            } else {
              // 다음 챕터가 다른 파일에 있는 경우 현재 앵커부터 파일 끝까지 추출
              let currentNode = element;
              while (currentNode) {
                if (currentNode.nodeType === Node.ELEMENT_NODE) {
                  sectionContent += currentNode.outerHTML;
                }
                currentNode = currentNode.nextSibling;
              }
            }
          }
        }

        // 2. 앵커가 없거나 앵커 처리가 실패한 경우 전체 내용 사용
        if (!sectionContent) {
          sectionContent = doc.body ? doc.body.innerHTML : "";
        }

        // 3. 내용이 여전히 없는 경우 대체 방법 시도
        if (!sectionContent) {
          console.warn(
            `Failed to extract content for chapter "${title}", using alternative method`
          );
          // 전체 HTML에서 제목을 찾아 그 이후의 내용 추출
          const titleRegex = new RegExp(
            title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "i"
          );
          const htmlString = doc.body ? doc.body.innerHTML : "";
          const titleMatch = htmlString.match(titleRegex);

          if (titleMatch && titleMatch.index !== -1) {
            sectionContent = htmlString.substring(
              titleMatch.index + titleMatch[0].length
            );
          } else {
            sectionContent = htmlString;
          }
        }

        // HTML을 텍스트로 변환
        const textContent = this.convertHtmlToText(sectionContent);

        // 내용이 제목과 동일한 경우 대체 방법 시도
        if (textContent.trim() === title.trim()) {
          console.warn(
            `Chapter "${title}" content is identical to title, using alternative method`
          );

          // 전체 HTML에서 제목 이후의 내용 추출
          const fullHtml = doc.body ? doc.body.innerHTML : "";
          const titleIndex = fullHtml.indexOf(title);

          if (titleIndex !== -1) {
            const contentAfterTitle = fullHtml.substring(
              titleIndex + title.length
            );
            const alternativeText = this.convertHtmlToText(contentAfterTitle);

            if (alternativeText.trim().length > 0) {
              toc.push({
                title,
                content: alternativeText,
                order: i,
              });
              continue;
            }
          }
        }

        // 최종 내용 저장
        toc.push({
          title,
          content: textContent,
          order: i,
        });
      } catch (error) {
        console.error(`Error processing nav point ${title}:`, error);
        toc.push({
          title,
          content: `Error loading content: ${error.message}`,
          order: i,
        });
      }
    }

    // 목차가 비어있는 경우 스파인에서 추출 시도
    if (toc.length === 0) {
      console.warn("No TOC entries found from navPoints, using spine instead");
      return await this.extractTocFromSpine(
        spine,
        contents,
        opfDir,
        manifestItems,
        parser
      );
    }

    return toc;
  }

  // 스파인에서 목차 추출하는 메서드
  async extractTocFromSpine(spine, contents, opfDir, manifestItems, parser) {
    const toc = [];

    for (let i = 0; i < spine.length; i++) {
      const idref = spine[i];
      const item = manifestItems[idref];

      if (!item) {
        console.warn(`Manifest item not found for spine idref: ${idref}`);
        continue;
      }

      const fullPath = pathUtils.join(opfDir, item.href);

      try {
        const fileEntry = contents.file(fullPath);
        if (!fileEntry) {
          console.warn(`File not found: ${fullPath}, skipping section`);
          continue;
        }

        const htmlContent = await fileEntry.async("string");
        const doc = parser.parseFromString(htmlContent, "text/html");

        // 제목 추출 시도
        let title = `Chapter ${i + 1}`;
        const titleElement =
          doc.querySelector("title") ||
          doc.querySelector("h1") ||
          doc.querySelector("h2");

        if (titleElement && titleElement.textContent.trim()) {
          title = titleElement.textContent.trim();
        }

        // 내용 추출
        let sectionContent = "";

        // 제목 요소가 있는 경우 그 다음부터의 내용을 추출
        if (titleElement && titleElement.parentNode) {
          let currentNode = titleElement.nextSibling;
          while (currentNode) {
            if (currentNode.nodeType === Node.ELEMENT_NODE) {
              sectionContent += currentNode.outerHTML;
            }
            currentNode = currentNode.nextSibling;
          }
        }

        // 내용이 없는 경우 본문 전체 사용
        if (!sectionContent) {
          sectionContent = doc.body ? doc.body.innerHTML : "";
        }

        // HTML을 텍스트로 변환
        const textContent = this.convertHtmlToText(sectionContent);

        // 내용이 제목과 동일한 경우 대체 방법 시도
        if (textContent.trim() === title.trim()) {
          console.warn(
            `Spine chapter "${title}" content is identical to title, using alternative method`
          );

          // 전체 HTML에서 제목 이후의 내용 추출
          const fullHtml = doc.body ? doc.body.innerHTML : "";
          const titleIndex = fullHtml.indexOf(title);

          if (titleIndex !== -1) {
            const contentAfterTitle = fullHtml.substring(
              titleIndex + title.length
            );
            const alternativeText = this.convertHtmlToText(contentAfterTitle);

            if (alternativeText.trim().length > 0) {
              toc.push({
                title,
                content: alternativeText,
                order: i,
              });
              continue;
            }
          }
        }

        toc.push({
          title,
          content: textContent,
          order: i,
        });
      } catch (error) {
        console.error(`Error processing spine item ${idref}:`, error);
        toc.push({
          title: `Chapter ${i + 1}`,
          content: `Error loading content: ${error.message}`,
          order: i,
        });
      }
    }

    return toc;
  }

  // HTML을 텍스트로 변환하는 함수
  convertHtmlToText(html) {
    if (!html) return "";

    // HTML 특수 문자 디코딩
    html = html
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&nbsp;/g, " ");

    // HTML 태그 제거 및 텍스트 추출
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;

    // 텍스트 추출 및 정제
    let text = tempDiv.textContent || tempDiv.innerText || "";

    // 연속된 공백 제거 및 정리
    text = text
      .replace(/\s+/g, " ")
      .replace(/\n\s*\n/g, "\n")
      .trim();

    return text;
  }

  readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsArrayBuffer(file);
    });
  }
}

export default new EPUBParser();
