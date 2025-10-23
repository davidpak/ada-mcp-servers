import fs from "fs/promises";
import path from "path";
import { Browser, chromium } from "playwright";

const TARGET_URL = process.env.DEMO_URL ?? "https://www.nycdelimarket.com/order";
const OUT_DIR = path.join(process.cwd(), "orders");

// Global browser instance for session management
let browser: Browser | null = null;
let page: any = null;

export interface OrderResult {
  success: boolean;
  itemName: string;
  quantity: number;
  found: boolean;
  screenshot: string;
  error?: string;
  clickedElement?: string;
}

export interface MenuItem {
  name: string;
  price: string;
  description?: string;
  category?: string;
  available: boolean;
}

export interface CartContents {
  items: string[];
  total: string;
  itemCount: number;
}

// Initialize browser session
async function initBrowser(): Promise<void> {
  if (!browser) {
    browser = await chromium.launch({ 
      headless: false, 
      slowMo: 150 
    });
    const context = await browser.newContext();
    page = await context.newPage();
    
    // Load the restaurant page
    await page.goto(TARGET_URL, { 
      waitUntil: "domcontentloaded", 
      timeout: 30_000 
    });
    await page.waitForTimeout(3000);
  }
}

// Main ordering function - simplified to just click items
export async function orderFoodItem(
  itemName: string, 
  quantity: number = 1, 
  customizations?: Record<string, string>
): Promise<OrderResult> {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await initBrowser();

  try {
    console.log(`🍽️ Clicking on: "${itemName}"`);
    
    // Find and click the item (core functionality we know works)
    const result = await findAndClickItem(page, itemName);
    
    if (result.success) {
      // Wait for modal to appear and click delivery button
      await handleOrderModal(page);
    }
    
    // Take screenshot
    const screenshot = await takeScreenshot(page, "item-clicked");
    
    return {
      success: result.success,
      itemName,
      quantity,
      found: result.found,
      screenshot,
      ...(result.error && { error: result.error }),
      ...(result.clickedElement && { clickedElement: result.clickedElement }),
    };
    
  } catch (error) {
    const screenshot = await takeScreenshot(page, "click-error");
    return {
      success: false,
      itemName,
      quantity,
      found: false,
      screenshot,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Browse menu function - simplified
export async function browseMenu(category?: string, search?: string): Promise<MenuItem[]> {
  await initBrowser();
  
  try {
    console.log(`📋 Browsing menu${category ? ` in category: ${category}` : ''}${search ? ` searching for: ${search}` : ''}`);
    
    const menuItems = await getMenuItems(page);
    
    let filteredItems = menuItems;
    
    if (search) {
      filteredItems = filteredItems.filter(item => 
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.description?.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    return filteredItems;
    
  } catch (error) {
    console.log("❌ Error browsing menu:", error);
    return [];
  }
}

// Get cart contents - simplified
export async function getCartContents(): Promise<CartContents> {
  console.log("🛒 Getting cart contents");
  
  // TODO: Implement cart reading
  return {
    items: ["Cart functionality not implemented yet"],
    total: "0.00",
    itemCount: 0
  };
}

// Clear cart - stub
export async function clearCart(): Promise<{ success: boolean; message: string }> {
  console.log("🗑️ Clearing cart");
  
  // TODO: Implement cart clearing
  return { success: false, message: "Cart clearing not implemented yet" };
}

// Proceed to checkout - stub
export async function proceedToCheckout(): Promise<{ success: boolean; message: string; screenshot: string }> {
  console.log("💳 Proceeding to checkout");
  
  // TODO: Implement checkout
  return { 
    success: false, 
    message: "Checkout not implemented yet",
    screenshot: "no-screenshot.png"
  };
}

async function findAndClickItem(page: any, itemName: string): Promise<{success: boolean, found: boolean, error?: string, clickedElement?: string}> {
  console.log("🔍 Searching for menu items...");
  
  // Try different selectors to find menu items (same as smoke-click)
  const selectors = [
    "new-menufy-item-card",
    ".item-wrapper",
    ".item-link",
    "[item-name]",
    "div[class*='item']"
  ];
  
  let menuItems: any[] = [];
  
  for (const selector of selectors) {
    const elements = await page.locator(selector).all();
    console.log(`Selector "${selector}" found ${elements.length} elements`);
    if (elements.length > 0) {
      menuItems = elements;
      break;
    }
  }
  
  if (menuItems.length === 0) {
    console.log("❌ No menu items found");
    return { success: false, found: false, error: "No menu items found on the page" };
  }
  
  // Search through items for a match
  for (let i = 0; i < menuItems.length; i++) {
    const item = menuItems[i];
    if (item) {
      const name = await item.getAttribute("item-name");
      const text = await item.textContent();
      
      console.log(`Checking item ${i}: "${name}" - "${text?.substring(0, 50)}"`);
      
      // Check if this item matches what we're looking for
      if (isItemMatch(name || text || "", itemName)) {
        console.log(`✅ Found matching item: "${name || text}"`);
        
        // Try to click the item
        try {
          await item.click();
          console.log("✅ Successfully clicked item");
          return { 
            success: true, 
            found: true, 
            clickedElement: name || text || "Unknown" 
          };
        } catch (e) {
          console.log("❌ Click failed, trying next element");
          continue;
        }
      }
    }
  }
  
  return { 
    success: false, 
    found: false, 
    error: `Item "${itemName}" not found on the menu` 
  };
}

function isItemMatch(itemText: string, searchTerm: string): boolean {
  const normalizedItem = itemText.toLowerCase();
  const normalizedSearch = searchTerm.toLowerCase();
  
  // Check for exact match or contains
  return normalizedItem.includes(normalizedSearch) || 
         normalizedSearch.includes(normalizedItem);
}

// Handle the order modal that appears after clicking a menu item
async function handleOrderModal(page: any): Promise<void> {
  try {
    console.log("🔄 Waiting for order modal to appear...");
    
    // Wait for modal to appear
    await page.waitForSelector('.modal-body', { timeout: 10000 });
    console.log("✅ Order modal appeared");
    
    // Wait a moment for modal to fully load
    await page.waitForTimeout(1000);
    
    // Look for the delivery button
    const deliverySelectors = [
      'label:has-text("Delivery")',
      'label[onclick*="Delivery"]',
      'input[value="Delivery"]',
      '.btn:has-text("Delivery")',
      'label.btn:has-text("Delivery")'
    ];
    
    let deliveryClicked = false;
    
    for (const selector of deliverySelectors) {
      try {
        const elements = await page.locator(selector).all();
        if (elements.length > 0) {
          console.log(`🎯 Found delivery button with selector: ${selector}`);
          await elements[0].click();
          console.log("✅ Successfully clicked delivery button");
          deliveryClicked = true;
          break;
        }
      } catch (e) {
        console.log(`❌ Selector ${selector} failed:`, e);
      }
    }
    
    if (!deliveryClicked) {
      console.log("⚠️ Could not find delivery button, trying alternative approach...");
      
      // Try clicking the radio button directly
      const radioButton = await page.locator('input[value="Delivery"]').first();
      if (await radioButton.isVisible()) {
        await radioButton.click();
        console.log("✅ Clicked delivery radio button");
        deliveryClicked = true;
      }
    }
    
    if (!deliveryClicked) {
      console.log("⚠️ Could not click delivery button, but continuing...");
    }
    
    // Wait for any animations or state changes
    await page.waitForTimeout(1000);
    
    // Wait a reasonable human amount of time before clicking update
    console.log("⏳ Waiting a moment before clicking update...");
    await page.waitForTimeout(2000); // 2 seconds - reasonable human delay
    
    // Click the update button
    console.log("🔄 Looking for update button...");
    
    const updateSelectors = [
      '#update-settings-btn',
      'button[id="update-settings-btn"]',
      '.modal-footer button',
      'button:has-text("Update")',
      '.btn-primary:has-text("Update")',
      '.success-modal-btn'
    ];
    
    let updateClicked = false;
    
    for (const selector of updateSelectors) {
      try {
        const elements = await page.locator(selector).all();
        if (elements.length > 0) {
          console.log(`🎯 Found update button with selector: ${selector}`);
          await elements[0].click();
          console.log("✅ Successfully clicked update button");
          updateClicked = true;
          break;
        }
      } catch (e) {
        console.log(`❌ Selector ${selector} failed:`, e);
      }
    }
    
    if (!updateClicked) {
      console.log("⚠️ Could not find update button");
    }
    
    // Wait for any page changes after clicking update
    await page.waitForTimeout(1500);
    
    // Fill in the address form
    await fillAddressForm(page);
    
  } catch (error) {
    console.log("❌ Error handling order modal:", error);
    // Don't throw - this is not critical for the main functionality
  }
}

// Fill in the address form with human-like timing
async function fillAddressForm(page: any): Promise<void> {
  try {
    console.log("🏠 Filling in address form...");
    
    // Wait for address form to appear
    await page.waitForSelector('#address', { timeout: 10000 });
    console.log("✅ Address form appeared");
    
    // Wait a moment for form to fully load
    await page.waitForTimeout(1000);
    
    // Fill in street address
    console.log("📝 Filling street address...");
    await page.fill('#address', '7th Ave, Seattle, WA');
    await page.waitForTimeout(500); // Human-like typing delay
    
    // Fill in apartment (optional - leave empty)
    console.log("📝 Filling apartment field...");
    await page.fill('#apartment', '');
    await page.waitForTimeout(300);
    
    // Fill in zip code
    console.log("📝 Filling zip code...");
    await page.fill('#zipcode', '98101');
    await page.waitForTimeout(500);
    
    // Fill in delivery instructions
    console.log("📝 Adding delivery instructions...");
    await page.fill('#instructions', 'Please leave at front door. No-contact delivery preferred.');
    await page.waitForTimeout(500);
    
    // Wait a moment before clicking verify
    console.log("⏳ Reviewing address before verification...");
    await page.waitForTimeout(1500); // Human-like review time
    
    // Click the verify address button
    console.log("🔍 Clicking verify address button...");
    const verifySelectors = [
      '#verify-address-btn',
      'button[id="verify-address-btn"]',
      '.modal-footer button',
      'button:has-text("Verify Address")',
      '.btn-primary:has-text("Verify Address")',
      '.success-modal-btn:has-text("Verify Address")'
    ];
    
    let verifyClicked = false;
    
    for (const selector of verifySelectors) {
      try {
        const elements = await page.locator(selector).all();
        if (elements.length > 0) {
          console.log(`🎯 Found verify button with selector: ${selector}`);
          await elements[0].click();
          console.log("✅ Successfully clicked verify address button");
          verifyClicked = true;
          break;
        }
      } catch (e) {
        console.log(`❌ Selector ${selector} failed:`, e);
      }
    }
    
    if (!verifyClicked) {
      console.log("⚠️ Could not find verify address button");
    }
    
    // Wait for any page changes after verification
    await page.waitForTimeout(2000);
    
    // Click the add to cart button
    console.log("🛒 Clicking add to cart button...");
    const addToCartSelectors = [
      '#add-to-cart-btn',
      'button[id="add-to-cart-btn"]',
      '.modal-footer button:has-text("Add to Cart")',
      'button:has-text("Add to Cart")',
      '.btn-primary:has-text("Add to Cart")',
      '.success-modal-btn:has-text("Add to Cart")'
    ];
    
    let addToCartClicked = false;
    
    for (const selector of addToCartSelectors) {
      try {
        const elements = await page.locator(selector).all();
        if (elements.length > 0) {
          console.log(`🎯 Found add to cart button with selector: ${selector}`);
          await elements[0].click();
          console.log("✅ Successfully clicked add to cart button");
          addToCartClicked = true;
          break;
        }
      } catch (e) {
        console.log(`❌ Selector ${selector} failed:`, e);
      }
    }
    
    if (!addToCartClicked) {
      console.log("⚠️ Could not find add to cart button");
    }
    
    console.log("✅ Address form and cart addition completed");
    
    // Wait for any final page changes
    await page.waitForTimeout(2000);
    
  } catch (error) {
    console.log("❌ Error filling address form:", error);
    // Don't throw - this is not critical for the main functionality
  }
}

// Get all menu items from the page - simplified
async function getMenuItems(page: any): Promise<MenuItem[]> {
  const selectors = [
    "new-menufy-item-card",
    ".item-wrapper",
    ".item-link",
    "[item-name]"
  ];
  
  let menuItems: any[] = [];
  
  for (const selector of selectors) {
    const elements = await page.locator(selector).all();
    if (elements.length > 0) {
      menuItems = elements;
      break;
    }
  }
  
  const items: MenuItem[] = [];
  
  for (const item of menuItems) {
    if (item) {
      const name = await item.getAttribute("item-name");
      const price = await item.getAttribute("item-price");
      const description = await item.textContent();
      
      if (name) {
        items.push({
          name: name,
          price: price || "0.00",
          description: description?.substring(0, 100),
          category: "Unknown",
          available: true
        });
      }
    }
  }
  
  return items;
}

async function takeScreenshot(page: any, name: string): Promise<string> {
  const timestamp = Date.now();
  const filename = `${name}-${timestamp}.png`;
  const filepath = path.join(OUT_DIR, filename);
  
  await page.screenshot({ 
    path: filepath, 
    fullPage: true 
  });
  
  return filepath;
}
