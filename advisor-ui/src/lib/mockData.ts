import { Product, CritiqueReport } from "@/types";

export const MOCK_PRODUCTS: Product[] = [
  {
    id: "prod-1",
    name: "MacBook Pro 14 M3",
    brand: "Apple",
    price: 1599,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=200&q=80",
    category: "Laptops",
    confidenceScore: 94,
    specs: {
      Processor: "Apple M3 Chip (8-core CPU)",
      Memory: "16GB Unified Memory",
      Storage: "512GB SSD",
      Display: "14.2-inch Liquid Retina XDR (120Hz)",
      "Battery Life": "Up to 22 hours",
      Weight: "3.4 lbs",
    },
    prosHighlights: [
      "Incredible battery life (longest in class)",
      "Silent fanless design for light loads",
      "Stunning 120Hz Liquid Retina XDR screen",
      "Industry-leading build quality and trackpad",
    ],
    consHighlights: [
      "Cannot upgrade RAM or SSD after purchase",
      "Limited port selection (no USB-A)",
      "Extremely expensive RAM upgrade pricing",
    ],
    dataSource: "vault_cache",
    reviewCount: 1450,
    rating: 4.8,
    affiliateUrl: "https://amazon.com/dp/B0CM5L9L8P",
  },
  {
    id: "prod-2",
    name: "ROG Zephyrus G14",
    brand: "ASUS",
    price: 1499,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=200&q=80",
    category: "Laptops",
    confidenceScore: 89,
    specs: {
      Processor: "AMD Ryzen 9 8945HS (8-core)",
      Memory: "16GB LPDDR5X",
      Storage: "1TB PCIe Gen4 SSD",
      GPU: "NVIDIA RTX 4060 (8GB)",
      Display: "14.0-inch 3K OLED (120Hz)",
      Weight: "3.3 lbs",
    },
    prosHighlights: [
      "Stunning 3K OLED panel with 120Hz refresh rate",
      "Excellent gaming and GPU computing speed",
      "Lightweight compact chassis for a gaming laptop",
      "Solid speaker quality and keyboard layout",
    ],
    consHighlights: [
      "Gets very hot under load (keyboard deck feels warm)",
      "Shorter battery life than MacBook Pro under load",
      "Soldered RAM limits upgrade paths",
    ],
    dataSource: "live_scrape",
    reviewCount: 890,
    rating: 4.5,
    affiliateUrl: "https://bestbuy.com/site/asus-rog-g14",
  },
  {
    id: "prod-3",
    name: "Dell XPS 14",
    brand: "Dell",
    price: 1699,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=200&q=80",
    category: "Laptops",
    confidenceScore: 78,
    specs: {
      Processor: "Intel Core Ultra 7 155H",
      Memory: "16GB LPDDR5X",
      Storage: "512GB SSD",
      GPU: "Intel Arc Graphics",
      Display: "14.5-inch FHD+ InfinityEdge",
      Weight: "3.7 lbs",
    },
    prosHighlights: [
      "Minimalist, futuristic glass-focused aesthetic",
      "Seamless glass haptic trackpad looks premium",
      "Comfortable edge-to-edge keyboard design",
    ],
    consHighlights: [
      "Priced higher than spec equivalents",
      "Row of touch-sensitive function keys lacks physical feedback",
      "Heavier than competitor 14-inch laptops",
    ],
    dataSource: "google_shopping",
    reviewCount: 320,
    rating: 4.2,
    affiliateUrl: "https://dell.com/xps14",
  },
  {
    id: "prod-4",
    name: "Legion Slim 5 14.5\"",
    brand: "Lenovo",
    price: 1149,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=200&q=80",
    category: "Laptops",
    confidenceScore: 84,
    specs: {
      Processor: "AMD Ryzen 7 7840HS",
      Memory: "16GB LPDDR5X",
      Storage: "1TB SSD",
      GPU: "NVIDIA RTX 4060 (8GB)",
      Display: "14.5-inch 2.8K OLED (120Hz)",
      Weight: "3.8 lbs",
    },
    prosHighlights: [
      "Outstanding value for an OLED gaming laptop",
      "Excellent keyboard with tactile travel",
      "Strong thermal cooling system keeps chassis cool",
    ],
    consHighlights: [
      "Plastic top case feels slightly budget-oriented",
      "Thicker design than ROG Zephyrus G14",
      "Battery life averages just 6 hours of web browsing",
    ],
    dataSource: "vault_cache",
    reviewCount: 650,
    rating: 4.6,
    affiliateUrl: "https://lenovo.com/legionslim5",
  },
  {
    id: "prod-5",
    name: "MSI Prestige 16 AI Evo",
    brand: "MSI",
    price: 1399,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1496181130204-755241544e3f?w=200&q=80",
    category: "Laptops",
    confidenceScore: 72,
    specs: {
      Processor: "Intel Core Ultra 7 155H",
      Memory: "32GB LPDDR5",
      Storage: "1TB SSD",
      Display: "16.0-inch QHD+ IPS (140Hz)",
      "Battery Life": "Up to 15 hours",
      Weight: "4.1 lbs",
    },
    prosHighlights: [
      "Comes with 32GB RAM at a very reasonable price",
      "Extremely light for a 16-inch system",
      "Excellent array of standard ports",
    ],
    consHighlights: [
      "IPS screen is good, but lacks OLED's contrast",
      "Chassis has flex when pressed hard",
      "Webcam quality is below average",
    ],
    dataSource: "google_shopping",
    reviewCount: 120,
    rating: 4.1,
    affiliateUrl: "https://msi.com/prestige16",
  },
];

export const MOCK_CRITIQUES: Record<string, CritiqueReport> = {
  "prod-1": {
    productId: "prod-1",
    overallVerdict: "The M3 MacBook Pro is a marvel of efficiency, but Apple's design decisions are heavily skewed towards upselling extra RAM and storage. Consider alternatives if you need high memory tasks.",
    communityReportCount: 42,
    issues: [
      {
        title: "Base 8GB RAM memory bottleneck under basic multitasking",
        description: "Multiple user reports indicate the base model swap memory usage climbs significantly, causing SSD lifespan concerns and browser tab reloads with standard developer tasks.",
        severityScore: 4,
        reportCount: 18,
        category: "hardware",
      },
      {
        title: "SSD performance degradation in base 512GB models",
        description: "Compared to dual-chip SSD configurations in previous iterations, tests show slow read/write limits on single-nand base storage.",
        severityScore: 3,
        reportCount: 12,
        category: "value",
      },
    ],
    recommendedAlternative: "ROG Zephyrus G14"
  },
  "prod-2": {
    productId: "prod-2",
    overallVerdict: "The ASUS ROG Zephyrus G14 is an excellent gaming machine, but thermals are a major engineering challenge for a laptop of this size. Heavy gaming degrades hardware lifespan.",
    communityReportCount: 65,
    issues: [
      {
        title: "Severe Thermal Throttling & Hot Keyboard Deck",
        description: "Under sustained GPU loads, keyboard temps reach 48°C, making it uncomfortable to type. Core temperatures spike to 95°C frequently, forcing the CPU to scale back performance.",
        severityScore: 5,
        reportCount: 32,
        category: "hardware",
      },
      {
        title: "ASUS Armoury Crate Software Bugs & Power Drain",
        description: "Users highlight erratic power states where the dGPU is kept active in idle, draining battery life down to 2.5 hours unless forced off using 3rd-party community software (G-Helper).",
        severityScore: 4,
        reportCount: 22,
        category: "software",
      },
      {
        title: "OLED Burn-in risks in static coding setups",
        description: "Forum discussions raise warnings for developers using static code editors and navigation taskbars for 10+ hours a day on this OLED panel.",
        severityScore: 3,
        reportCount: 11,
        category: "support",
      },
    ],
    recommendedAlternative: "Legion Slim 5 14.5\""
  },
  "prod-3": {
    productId: "prod-3",
    overallVerdict: "The Dell XPS 14 sacrifices thermal dynamics and physical functionality for visual futurism. It is a laptop built for appearance, not performance.",
    communityReportCount: 29,
    issues: [
      {
        title: "Touch Function Row lacks haptic feedback and fails frequently",
        description: "Users report accidental presses and unresponsiveness of the touch row keys. Since there is no tactile click, adjustment changes require looking away from the screen.",
        severityScore: 5,
        reportCount: 14,
        category: "build_quality",
      },
      {
        title: "Severe performance throttling due to slim chassis limitations",
        description: "The chassis cannot dissipate heat from the Core Ultra chip, leading to aggressive frequency drop-downs within 5 minutes of intensive processing.",
        severityScore: 4,
        reportCount: 9,
        category: "hardware",
      },
    ],
    recommendedAlternative: "MacBook Pro 14 M3"
  },
  "prod-4": {
    productId: "prod-4",
    overallVerdict: "The Lenovo Legion Slim 5 14.5\" is a great value option, but is heavier than advertised and users report minor assembly defects.",
    communityReportCount: 19,
    issues: [
      {
        title: "Plastic base chassis squeaking and flexing",
        description: "A portion of users report standard creaking noises when lifting the laptop from the front corners due to lower rigidity plastic materials.",
        severityScore: 3,
        reportCount: 8,
        category: "build_quality",
      },
      {
        title: "Battery life fails to meet advertised specifications",
        description: "Averages 5.5 hours under light browsing tasks, making a power brick essential for library work.",
        severityScore: 3,
        reportCount: 7,
        category: "value",
      },
    ],
    recommendedAlternative: "ROG Zephyrus G14"
  },
  "prod-5": {
    productId: "prod-5",
    overallVerdict: "The MSI Prestige 16 AI Evo offers a large screen but suffers from sub-par chassis stiffness and audio speaker engineering.",
    communityReportCount: 14,
    issues: [
      {
        title: "Tinny speakers with near-zero bass frequencies",
        description: "Multiple reviews compare the speaker arrays to cheap phone outputs, completely lacking depth for movies or media presentation.",
        severityScore: 4,
        reportCount: 6,
        category: "build_quality",
      },
      {
        title: "Keyboard flex during active typing",
        description: "The middle keys sag slightly when applying medium typing force, indicating weak frame supports under the deck.",
        severityScore: 3,
        reportCount: 5,
        category: "hardware",
      },
    ],
    recommendedAlternative: "Dell XPS 14"
  }
};

export const MOCK_INTERVIEW_QUESTIONS = [
  "Hi! I got your request. Let me understand what you need before I search. What is your primary use case (e.g. coding, gaming, video editing, daily use)?",
  "Great! What is your maximum budget, and does that include tax and accessories?",
  "Understood. Do you have a preferred display size or weight constraint (e.g., 14-inch portable, 16-inch large)?",
  "Got it! Finally, are you locked into a specific ecosystem like macOS, or are you open to Windows as well?",
];

export const MOCK_RAG_ANSWERS: Record<string, string> = {
  default: "Based on the products inside your Intelligence Vault, the **MacBook Pro 14 M3** and the **ASUS ROG Zephyrus G14** are the strongest contenders. If battery life and display efficiency are your priorities, the MacBook is unmatched (yielding up to 22 hours). However, if you plan to play games or run local AI CUDA models, the RTX 4060 in the ASUS G14 provides raw graphics processing that the base M3 chip cannot deliver.\n\nHere is a comparison of their hardware specifications:\n\n| Specification | Apple MacBook Pro 14 M3 | ASUS ROG Zephyrus G14 | Lenovo Legion Slim 5 14.5\" |\n|---|---|---|---|\n| **Processor** | Apple M3 Chip (8-core CPU) | AMD Ryzen 9 8945HS (8-core) | AMD Ryzen 7 7840HS |\n| **Memory** | 16GB Unified Memory | 16GB LPDDR5X | 16GB LPDDR5X |\n| **GPU** | Apple M3 Integrated | NVIDIA RTX 4060 (8GB) | NVIDIA RTX 4060 (8GB) |\n| **Display** | 14.2\" XDR 120Hz | 14.0\" 3K OLED 120Hz | 14.5\" 2.8K OLED 120Hz |\n| **Battery Life** | Up to 22 hours | Up to 8 hours | Up to 6 hours |\n| **Weight** | 3.4 lbs | 3.3 lbs | 3.8 lbs |\n| **Price** | $1,599 | $1,499 | $1,149 |",
  gpu: "The **ASUS ROG Zephyrus G14** and **Lenovo Legion Slim 5 14.5\"** both pack the NVIDIA RTX 4060 laptop GPU, which features 8GB of GDDR6 VRAM. This is a massive advantage over the **MacBook Pro M3** (integrated) or **Dell XPS 14** (Intel Arc) for GPU-intensive workflows like gaming, Blender 3D modeling, or local PyTorch/TensorFlow deep learning development.",
  battery: "The **MacBook Pro 14 M3** is the undisputed champion of battery life. Testing confirms it can achieve up to **22 hours** of video playback or 15 hours of heavy web browsing. In comparison, Windows alternatives struggle due to x86 power states:\n\n- **MSI Prestige 16 AI Evo**: Up to 15 hours (Intel Ultra 7)\n- **ASUS ROG Zephyrus G14**: Up to 8 hours (Ryzen 9 + RTX 4060)\n- **Lenovo Legion Slim 5**: Up to 6 hours",
  cheapest: "The most cost-effective recommendation in your vault is the **Lenovo Legion Slim 5 14.5\"** at **$1,149 USD**. Despite being the cheapest, it doesn't compromise heavily on specs, offering a 14.5-inch 120Hz OLED screen and an RTX 4060 discrete GPU. Its main drawback is portability (3.8 lbs) and battery longevity.",
};

export async function* streamMockResponse(text: string) {
  const words = text.split(" ");
  for (const word of words) {
    yield word + " ";
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 30));
  }
}
