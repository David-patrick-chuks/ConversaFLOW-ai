import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { URL } from "url";

// Apply stealth plugin to evade bot detection
puppeteer.use(StealthPlugin());

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
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-gpu",
      ],
    });
    const page = await browser.newPage();

    // Set user agent to mimic a real browser
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Enable JavaScript and block unnecessary resources
    await page.setJavaScriptEnabled(true);
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["image", "stylesheet", "font"].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Navigate to the URL and wait for content to load
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Check for Cloudflare verification page
    const pageContent = await page.content();
    if (
      pageContent.includes("Verifying you are human") ||
      pageContent.includes("Cloudflare")
    ) {
      throw new Error("Cloudflare verification detected");
    }

    // Wait for dynamic content (e.g., Medium articles)
    await page.waitForTimeout(2000); // Wait 2 seconds for JavaScript to render

    // Extract main content (target Medium article body if available)
    const htmlContent = await page.evaluate(() => {
      const article = document.querySelector("article") || document.body;
      return article.innerHTML;
    });

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
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a"))
        .map((anchor) => anchor.href)
        .filter((href) => href && href.startsWith("http"));
    });

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
      new URL(baseUrl);
    } catch {
      throw new Error("Invalid URL format");
    }

    const visitedLinks = new Set();
    const linksToVisit = [baseUrl];
    let combinedContent = "";
    const maxPages = 10; // Reduced limit for Medium to avoid excessive scraping
    let pageCount = 0;

    while (linksToVisit.length > 0 && pageCount < maxPages) {
      const currentLink = linksToVisit.pop();
      if (currentLink && !visitedLinks.has(currentLink)) {
        visitedLinks.add(currentLink);
        pageCount++;

        try {
          const cleanedContent = await scrapeAndCleanContent(currentLink);
          if (cleanedContent) {
            combinedContent += `\n\n${cleanedContent}`;
          }
        } catch (error) {
          console.error(`Skipping ${currentLink}: ${error.message}`);
          continue;
        }

        const newLinks = await getAllLinks(currentLink);
        const parsedBaseUrl = new URL(baseUrl);
        for (const link of newLinks) {
          try {
            const parsedLink = new URL(link);
            // Only follow links within the same domain
            if (
              parsedLink.hostname === parsedBaseUrl.hostname &&
              !visitedLinks.has(link) &&
              !linksToVisit.includes(link)
            ) {
              linksToVisit.push(link);
            }
          } catch {
            // Skip invalid URLs
            continue;
          }
        }
      }
    }

    if (!combinedContent || combinedContent.trim() === "") {
      throw new Error("No content scraped from website");
    }

    console.log(`Successfully scraped ${pageCount} pages from ${baseUrl}`);
    console.log(`Total content length: ${combinedContent.length} characters`);

    return combinedContent.trim();
  } catch (error) {
    console.error(`Error scraping website ${baseUrl}: ${error.message}`);
    return { error: error.message, source: "website" };
  }
}



// Example usage (for testing)
scrapeAllRoutes(
  "https://medium.com/codex/what-are-ai-agents-your-step-by-step-guide-to-build-your-own-df54193e2de3"
)
  .then((result) => console.log("Scraping result:", result))
  .catch((error) => console.error("Scraping error:", error));
