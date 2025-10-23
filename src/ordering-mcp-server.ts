import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
    browseMenu,
    clearCart,
    getCartContents,
    orderFoodItem,
    proceedToCheckout
} from "./services/ordering-scraper.js";

const server = new McpServer({ name: "restaurant-ordering-mcp", version: "1.0.0" });

// Core ordering tool
const OrderFoodItem = z.object({
  itemName: z.string().describe("Name of the food item to order (e.g., 'bacon sandwich', 'coffee')"),
  quantity: z.number().optional().default(1).describe("Quantity to order (default: 1)"),
  customizations: z.record(z.string()).optional().describe("Item customizations (e.g., {'size': 'large', 'milk': 'oat'})"),
});

server.registerTool(
  "order_food_item",
  {
    title: "Order food item",
    description: "Add a food item to your order from the restaurant menu",
    inputSchema: (OrderFoodItem as any).shape,
  },
  async (args, _extra) => {
    const parsed = OrderFoodItem.parse(args);
    
    try {
      console.log(`🍽️ Ordering: ${parsed.quantity}x "${parsed.itemName}"`);
      const result = await orderFoodItem(parsed.itemName, parsed.quantity, parsed.customizations);
      
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) }
        ],
      };
    } catch (error) {
      console.log("❌ Error ordering food item:", error);
      return {
        content: [
          { type: "text", text: `Error ordering ${parsed.itemName}: ${error instanceof Error ? error.message : String(error)}` }
        ],
      };
    }
  }
);

// Browse menu tool
const BrowseMenu = z.object({
  category: z.string().optional().describe("Filter by category (e.g., 'breakfast', 'lunch', 'beverages')"),
  search: z.string().optional().describe("Search for specific items"),
});

server.registerTool(
  "browse_menu",
  {
    title: "Browse menu",
    description: "Browse the restaurant menu to see available items",
    inputSchema: (BrowseMenu as any).shape,
  },
  async (args, _extra) => {
    const parsed = BrowseMenu.parse(args);
    
    try {
      console.log(`📋 Browsing menu${parsed.category ? ` in category: ${parsed.category}` : ''}${parsed.search ? ` searching for: ${parsed.search}` : ''}`);
      const result = await browseMenu(parsed.category, parsed.search);
      
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) }
        ],
      };
    } catch (error) {
      console.log("❌ Error browsing menu:", error);
      return {
        content: [
          { type: "text", text: `Error browsing menu: ${error instanceof Error ? error.message : String(error)}` }
        ],
      };
    }
  }
);

// Cart management tools
server.registerTool(
  "get_cart",
  {
    title: "Get cart contents",
    description: "View current items in your cart",
    inputSchema: {},
  },
  async (_args, _extra) => {
    try {
      console.log("🛒 Getting cart contents");
      const result = await getCartContents();
      
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) }
        ],
      };
    } catch (error) {
      console.log("❌ Error getting cart:", error);
      return {
        content: [
          { type: "text", text: `Error getting cart: ${error instanceof Error ? error.message : String(error)}` }
        ],
      };
    }
  }
);

server.registerTool(
  "clear_cart",
  {
    title: "Clear cart",
    description: "Remove all items from your cart",
    inputSchema: {},
  },
  async (_args, _extra) => {
    try {
      console.log("🗑️ Clearing cart");
      const result = await clearCart();
      
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) }
        ],
      };
    } catch (error) {
      console.log("❌ Error clearing cart:", error);
      return {
        content: [
          { type: "text", text: `Error clearing cart: ${error instanceof Error ? error.message : String(error)}` }
        ],
      };
    }
  }
);

// Checkout tool
server.registerTool(
  "checkout",
  {
    title: "Proceed to checkout",
    description: "Complete your order and proceed to payment",
    inputSchema: {},
  },
  async (_args, _extra) => {
    try {
      console.log("💳 Proceeding to checkout");
      const result = await proceedToCheckout();
      
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) }
        ],
      };
    } catch (error) {
      console.log("❌ Error during checkout:", error);
      return {
        content: [
          { type: "text", text: `Error during checkout: ${error instanceof Error ? error.message : String(error)}` }
        ],
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
