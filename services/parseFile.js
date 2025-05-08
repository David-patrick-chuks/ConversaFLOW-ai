import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import textract from 'textract';
import csvParser from 'csv-parser';
import { Readable } from 'stream';

export async function parseFile(fileBuffer, fileType) {
  let content = '';

  if (fileType === 'pdf') {
    const data = await pdfParse(fileBuffer);
    content = data.text;
  } else if (fileType === 'docx') {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    content = result.value;
  } else if (fileType === 'doc') {
    content = await new Promise((resolve, reject) => {
      textract.fromBufferWithMime('application/msword', fileBuffer, (error, text) => {
        if (error) reject(error);
        else resolve(text);
      });
    });
  } else if (fileType === 'csv') {
    content = await new Promise((resolve, reject) => {
      const results = [];
      Readable.from(fileBuffer)
        .pipe(csvParser())
        .on('data', (data) => results.push(JSON.stringify(data)))
        .on('end', () => resolve(results.join('\n')))
        .on('error', (err) => reject(err));
    });
  } else if (fileType === 'txt') {
    content = fileBuffer.toString('utf8');
  } else {
    throw new Error(`Unsupported file type: ${fileType}`);
  }

  return content;
}
