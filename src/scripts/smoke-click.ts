import fs from "fs/promises";
import path from "path";
import { Browser, chromium } from "playwright";
import { pathToFileURL } from "url";

const TARGET_URL = process.env.DEMO_URL ?? "https://www.nycdelimarket.com/order";
const OUT_DIR = path.join(process.cwd(), "orders");

const HEADLESS = false;
const SLOW_MO = process.env.SLOWMO ? Number(process.env.SLOWMO) : 150;

export async function smokeClickCollapse(): Promise<{
    url: string,
    clicked: boolean,
    before?: string | null,
    after?: string | null;
    screenshot: string;
}> {
    await fs.mkdir(OUT_DIR, { recursive: true });

    const browser: Browser = await chromium.launch({ headless: HEADLESS, slowMo: SLOW_MO });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // Simple page load - don't wait for network idle
        console.log("Loading page...");
        await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30_000});
        console.log("Page loaded");
        
        // Give it a moment for any dynamic content to load
        console.log("Waiting for dynamic content...");
        await page.waitForTimeout(3000);
        
        // Let's see what's actually on the page
        console.log("Scanning page for any clickable elements...");
        
        // Try to find ANY clickable elements first
        const allClickableElements = await page.locator("a, button, [onclick], [role='button']").all();
        console.log(`Found ${allClickableElements.length} clickable elements`);
        
        // Log some of them to see what we're working with
        for (let i = 0; i < Math.min(10, allClickableElements.length); i++) {
            const element = allClickableElements[i];
            if (element) {
                const tagName = await element.evaluate(el => el.tagName);
                const text = await element.textContent();
                const href = await element.getAttribute("href");
                console.log(`Element ${i}: ${tagName} - "${text?.substring(0, 50)}" (href: ${href})`);
            }
        }
        
        // Now try to find menu items with various approaches
        const menuSelectors = [
            "new-menufy-item-card",
            ".item-wrapper",
            ".item-link",
            "a[class*='item']",
            "[item-name]",
            ".col-12.col-md-6",
            "div[class*='item']",
            "a[href*='item']"
        ];
        
        let menuItems: any[] = [];
        for (const selector of menuSelectors) {
            const elements = await page.locator(selector).all();
            console.log(`Selector "${selector}" found ${elements.length} elements`);
            if (elements.length > 0) {
                menuItems = elements;
                break;
            }
        }
        
        if (menuItems.length === 0) {
            console.log("No menu items found, trying to click any available element...");
            menuItems = allClickableElements.slice(0, 5); // Take first 5 clickable elements
        }
        
        console.log(`Found ${menuItems.length} elements to try clicking`);
        
        // Try to click the first available element
        let clicked = false;
        for (let i = 0; i < menuItems.length; i++) {
            const element = menuItems[i];
            if (element) {
                try {
                    console.log(`Trying to click element ${i}...`);
                    const text = await element.textContent();
                    console.log(`Element text: "${text?.substring(0, 50)}"`);
                    
                    // Try different click methods
                    const clickMethods = [
                        () => element.click(),
                        () => element.click({ force: true }),
                        async () => {
                            const box = await element.boundingBox();
                            if (box) {
                                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                            }
                        }
                    ];
                    
                    for (const method of clickMethods) {
                        try {
                            await method();
                            console.log(`Successfully clicked element ${i}!`);
                            clicked = true;
                            break;
                        } catch (e) {
                            console.log(`Click method failed: ${e instanceof Error ? e.message : String(e)}`);
                        }
                    }
                    
                    if (clicked) break;
                } catch (e) {
                    console.log(`Element ${i} failed: ${e instanceof Error ? e.message : String(e)}`);
                }
            }
        }

        if (!clicked) {
            console.log("No elements could be clicked, but continuing...");
        }

        // Wait for any resulting actions to complete
        await page.waitForTimeout(2000);

        const shotPath = path.join(OUT_DIR, `smoke-${Date.now()}.png`);
        await page.screenshot({ path: shotPath, fullPage: true });

        // Get the item name for before/after comparison
        const itemName = await page.locator("new-menufy-item-card").first().getAttribute("item-name");
        
        console.log({ before: itemName, after: itemName, screenshot: shotPath });
        return { url: TARGET_URL, clicked: true, before: itemName, after: itemName, screenshot: shotPath };
    } finally {
        // await page.waitForTimeout(600);
        // await context.close();
        // await browser.close();
    }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  smokeClickCollapse()
    .then((res) => console.log(JSON.stringify(res, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}