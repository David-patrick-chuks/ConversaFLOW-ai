import puppeteer from "puppeteer";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { URL } from "url";

/**
 * Cleans HTML content by removing all tags, leaving only text.
 * @param {string} inputHtml - The HTML content to clean.
 * @returns {string} The cleaned text content.
 */
function cleanHTML(inputHtml) {
  try {
    const window = new JSDOM("").window;
    const DOMPurify = createDOMPurify(window);
    const cleaned = DOMPurify.sanitize(inputHtml, {
      ALLOWED_TAGS: [],
    });
    return cleaned.trim();
  } catch (error) {
    console.error(`Error cleaning HTML: ${error.message}`);
    throw new Error(`Failed to clean HTML content: ${error.message}`);
  }
}

/**
 * Scrapes and cleans content from a single URL.
 * @param {string} url - The URL to scrape.
 * @returns {Promise<string>} The cleaned text content.
 */
async function scrapeAndCleanContent(url) {
  let browser = null;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    const htmlContent = await page.evaluate(() => document.body.innerHTML);
    const cleanedContent = cleanHTML(htmlContent);

    if (!cleanedContent) {
      throw new Error("No content extracted from page");
    }

    console.log(`Successfully scraped content from ${url}`);
    return cleanedContent;
  } catch (error) {
    console.error(`Error scraping ${url}: ${error.message}`);
    throw new Error(`Failed to scrape content: ${error.message}`);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        console.error(`Error closing browser: ${error.message}`);
      }
    }
  }
}

/**
 * Retrieves all links from a URL.
 * @param {string} url - The URL to scrape for links.
 * @returns {Promise<string[]>} An array of link URLs.
 */
async function getAllLinks(url) {
  let browser = null;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a"))
        .map((anchor) => anchor.href)
        .filter((href) => href && href.startsWith("http"))
    );

    console.log(`Retrieved ${links.length} links from ${url}`);
    return links;
  } catch (error) {
    console.error(`Error getting links from ${url}: ${error.message}`);
    return [];
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        console.error(`Error closing browser: ${error.message}`);
      }
    }
  }
}

/**
 * Scrapes content from a website and its linked pages.
 * @param {string} baseUrl - The base URL to start scraping.
 * @returns {Promise<string|Object>} The combined cleaned content or an error object.
 */
export async function scrapeAllRoutes(baseUrl) {
  try {
    // Validate baseUrl
    if (!baseUrl || typeof baseUrl !== "string" || baseUrl.trim() === "") {
      throw new Error("baseUrl must be a non-empty string");
    }
    try {
      new URL(baseUrl); // Ensure valid URL
    } catch {
      throw new Error("Invalid URL format");
    }

    const visitedLinks = new Set();
    const linksToVisit = [baseUrl];
    let combinedContent = "";
    const maxPages = 50; // Limit to prevent infinite scraping
    let pageCount = 0;

    while (linksToVisit.length > 0 && pageCount < maxPages) {
      const currentLink = linksToVisit.pop();
      if (currentLink && !visitedLinks.has(currentLink)) {
        visitedLinks.add(currentLink);
        pageCount++;

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

    if (!combinedContent || combinedContent.trim() === "") {
      throw new Error("No content scraped from website");
    }

    console.log(`Successfully scraped ${pageCount} pages from ${baseUrl}`);
    return combinedContent.trim();
  } catch (error) {
    console.error(`Error scraping website ${baseUrl}: ${error.message}`);
    return { error: error.message, source: "website" };
  }
}

// scrapeAllRoutes("https://conversaflow.vercel.app")
// scrapeAllRoutes("https://youtu.be/xww-80A-wns?si=NNJ6GzinXPZ5rZEc")
