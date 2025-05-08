import puppeteer from 'puppeteer';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

function cleanHTML(inputHtml) {
  const window = new JSDOM('').window;
  const DOMPurify = createDOMPurify(window);
  return DOMPurify.sanitize(inputHtml, {
    ALLOWED_TAGS: []
  });
}

async function scrapeAndCleanContent(url) {
  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'networkidle2' });
    const htmlContent = await page.evaluate(() => document.body.innerHTML);
    await browser.close();

    return cleanHTML(htmlContent);
  } catch (error) {
    console.error('Error scraping and cleaning content:', error);
    return null;
  }
}

async function getAllLinks(url) {
  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'networkidle2' });
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a')).map(anchor => anchor.href)
    );

    await browser.close();
    return links;
  } catch (error) {
    console.error('Error getting links:', error);
    return [];
  }
}

export async function scrapeAllRoutes(baseUrl) {
  const visitedLinks = new Set();
  const linksToVisit = [baseUrl];
  let combinedContent = '';

  while (linksToVisit.length > 0) {
    const currentLink = linksToVisit.pop();
    if (currentLink && !visitedLinks.has(currentLink)) {
      visitedLinks.add(currentLink);

      const cleanedContent = await scrapeAndCleanContent(currentLink);
      if (cleanedContent) {
        combinedContent += `\n\n${cleanedContent}`;
      }

      const newLinks = await getAllLinks(currentLink);
      for (const link of newLinks) {
        if (link.startsWith(baseUrl) && !visitedLinks.has(link)) {
          linksToVisit.push(link);
        }
      }
    }
  }

  return combinedContent;
}
