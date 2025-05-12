import pkg from "pdfjs-dist";
const { getDocument } = pkg;
import mammoth from "mammoth";
import textract from "textract";
import csvParser from "csv-parser";
import { Readable } from "stream";

/**
 * Parses a file buffer based on its file type and extracts text content.
 * @param {Buffer} fileBuffer - The file buffer to parse.
 * @param {string} fileType - The file extension (e.g., 'pdf', 'docx').
 * @returns {Promise<string|Object>} The extracted text content or an error object.
 */
export async function parseFile(fileBuffer, fileType) {
  try {
    // Validate inputs
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
      throw new Error("fileBuffer must be a valid Buffer");
    }
    if (!fileType || typeof fileType !== "string" || fileType.trim() === "") {
      throw new Error("fileType must be a non-empty string");
    }

    const normalizedFileType = fileType.toLowerCase();
    let content = "";

    if (normalizedFileType === "pdf") {
      try {
        const pdf = await getDocument({ data: fileBuffer }).promise;
        const maxPages = pdf.numPages;
        let text = "";

        for (let i = 1; i <= maxPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item) => item.str).join(" ");
          text += pageText + "\n";
        }

        content = text;
      } catch (error) {
        throw new Error(`Failed to parse PDF: ${error.message}`);
      }
    } else if (normalizedFileType === "docx") {
      try {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        content = result.value;
      } catch (error) {
        throw new Error(`Failed to parse DOCX: ${error.message}`);
      }
    } else if (normalizedFileType === "doc") {
      try {
        content = await new Promise((resolve, reject) => {
          textract.fromBufferWithMime(
            "application/msword",
            fileBuffer,
            (error, text) => {
              if (error) reject(error);
              else resolve(text);
            }
          );
        });
      } catch (error) {
        throw new Error(`Failed to parse DOC: ${error.message}`);
      }
    } else if (normalizedFileType === "csv") {
      try {
        content = await new Promise((resolve, reject) => {
          const results = [];
          Readable.from(fileBuffer)
            .pipe(csvParser())
            .on("data", (data) => results.push(JSON.stringify(data)))
            .on("end", () => resolve(results.join("\n")))
            .on("error", (err) => reject(err));
        });
      } catch (error) {
        throw new Error(`Failed to parse CSV: ${error.message}`);
      }
    } else if (normalizedFileType === "txt") {
      try {
        content = fileBuffer.toString("utf8");
      } catch (error) {
        throw new Error(`Failed to parse TXT: ${error.message}`);
      }
    } else {
      throw new Error(`Unsupported file type: ${normalizedFileType}`);
    }

    if (!content || content.trim() === "") {
      throw new Error("Parsed content is empty or invalid");
    }

    console.log(`Successfully parsed ${normalizedFileType} file`);
    return content;
  } catch (error) {
    console.error(`Error parsing ${fileType} file: ${error.message}`);
    return { error: error.message, source: "document" };
  }
}