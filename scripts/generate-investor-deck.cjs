const fs = require("fs");
const path = require("path");
const PptxGenJS = require("pptxgenjs");
const PDFDocument = require("pdfkit");

const OUT_DIR = path.join(process.cwd(), "docs");
const PPTX_PATH = path.join(OUT_DIR, "tapxora-lims-investor-pitch.pptx");
const PDF_PATH = path.join(OUT_DIR, "tapxora-lims-investor-pitch.pdf");

const BRAND = {
  blue: "0F4C81",
  sky: "EAF5FF",
  navy: "0F172A",
  slate: "475569",
  muted: "64748B",
  line: "D7E7F7",
  green: "0F766E",
  amber: "B45309",
  red: "B91C1C",
  white: "FFFFFF"
};

const deck = [
  {
    title: "TAPXORA LIMS APP",
    eyebrow: "Investor pitch deck",
    subtitle: "Offline-first Laboratory Information Management System for Nigerian diagnostic laboratories",
    bullets: [
      "Website: lims.tapxora.com",
      "Built for patient registration, sample tracking, results, reporting, billing, inventory, accounting, and offline operations.",
      "Contact: 07067038882"
    ],
    visual: "hero"
  },
  {
    title: "Executive Snapshot",
    eyebrow: "What investors should understand first",
    bullets: [
      "Tapxora LIMS is a web-based, offline-first operating system for small and mid-sized laboratories.",
      "The app is designed around Nigerian field realities: unstable internet, paper-heavy workflows, fragmented billing, and limited operational reporting.",
      "It brings clinical workflow and business workflow into one system: samples, results, reports, inventory, payments, expenses, and revenue analysis.",
      "Current investor-sensitive data to insert: live customer count, monthly revenue, pipeline value, deployment cost, and churn."
    ],
    callout: "Positioning: practical lab infrastructure for markets where connectivity cannot be assumed."
  },
  {
    title: "Problem",
    eyebrow: "Pain points in Nigerian labs",
    bullets: [
      "Internet instability can interrupt patient registration, result entry, reporting, billing, and end-of-day reconciliation.",
      "Many labs still depend on notebooks, spreadsheets, paper receipts, manual result templates, and disconnected inventory records.",
      "Sample traceability is weak when sample IDs, patient IDs, collection status, and result status are not tied into one workflow.",
      "Financial visibility is often delayed: owners may not know daily revenue, unpaid invoices, test-by-test income, expenses, and inventory-driven costs in one place.",
      "Manual workflows increase rework, misplaced results, delayed verification, billing leakage, and inconsistent patient experience."
    ],
    visual: "pain"
  },
  {
    title: "Solution",
    eyebrow: "Tapxora LIMS",
    bullets: [
      "A secure, browser-based LIMS built with Next.js, Supabase, IndexedDB offline storage, and role-based workflows.",
      "Supports the lab journey from patient registration to sample collection, result entry, verification, reporting, billing, accounting, and inventory.",
      "Offline-first design lets staff keep working even when internet drops, then sync changes when the connection returns.",
      "Professional PDF reports and thermal-printer receipt support help labs look more credible while improving internal controls.",
      "Role-based access supports Admin, Receptionist, Lab Scientist, Verifier, and Accountant workflows."
    ],
    visual: "solution"
  },
  {
    title: "Key Features",
    eyebrow: "Screenshot-style workflow overview",
    bullets: [
      "Patient directory with search, age display, patient history, and admin edit/delete controls.",
      "Test catalogue with category-based selection for Haematology, Blood Group Serology, Microbiology, Chemical Pathology, and Histopathology.",
      "Sample IDs use a date-coded 7-digit format, making collection dates traceable from the sample code.",
      "Results entry supports numeric, text, dropdown, and positive/negative test types.",
      "Verification and reporting are separated so technicians enter results and verifiers approve them."
    ],
    visual: "screens"
  },
  {
    title: "Sample Tracking And Reports",
    eyebrow: "Clinical workflow",
    bullets: [
      "Workflow: Registered -> Collected -> In Progress -> Results Entered -> Verified -> Reported.",
      "Each sample carries a barcode/QR-ready sample ID and custody events for chain-of-custody visibility.",
      "Results are grouped by date and Sample ID for traceability, printing, and download.",
      "Out-of-range numeric results are shown clinically with H for high and L for low, using red for visibility.",
      "A patient with multiple tests can receive a consolidated report grouped by sample rather than scattered paper sheets."
    ],
    visual: "workflow"
  },
  {
    title: "Offline-First Advantage",
    eyebrow: "Why this matters in Nigeria",
    bullets: [
      "Labs can continue core operations during poor connectivity instead of stopping registration, sample capture, result entry, or billing.",
      "IndexedDB local storage mirrors core Supabase tables so the app remains usable in the browser.",
      "Queued mutations sync in the background when the connection returns.",
      "Conflict review tools let admins inspect, edit, retry, dismiss, or keep the remote copy when remote data has changed.",
      "This is a practical reliability advantage for regions where power and internet quality vary by location and time."
    ],
    visual: "offline"
  },
  {
    title: "Accounting & Financial Reports",
    eyebrow: "Owner visibility",
    bullets: [
      "Automatic invoices are created from selected tests and catalogue prices.",
      "Payment status supports Paid, Partial, and Unpaid tracking.",
      "Thermal receipt printing supports everyday front-desk payment operations.",
      "Account dashboard shows money received, tests billed, totals, and test category income analysis.",
      "Expense and inventory-cost tracking help owners understand monthly costs and operational margins."
    ],
    visual: "finance"
  },
  {
    title: "Market Opportunity In Nigeria",
    eyebrow: "Fill verified market numbers before fundraising",
    bullets: [
      "Primary customers: private diagnostic laboratories, hospital labs, clinic labs, specialist labs, and growing lab chains.",
      "Buyer profiles: lab owners, medical directors, operations managers, and finance/admin leads.",
      "Adoption pressure: professional reporting, auditability, revenue control, faster turnaround time, and operational visibility.",
      "Market size to insert: number of target labs in Nigeria: __________.",
      "Pricing benchmark to insert: current monthly spend on software, paper, admin labor, and lost billing leakage: __________."
    ],
    callout: "No fabricated TAM/SAM/SOM included. Add verified market data before investor distribution."
  },
  {
    title: "Business Model",
    eyebrow: "Revenue paths",
    bullets: [
      "Subscription SaaS by facility or branch.",
      "Tiered plans based on lab size, number of users, number of monthly tests, and advanced finance/reporting needs.",
      "Implementation and onboarding fee for setup, staff training, data migration, and report customization.",
      "Optional add-ons: WhatsApp/SMS delivery, custom report templates, multi-branch analytics, and advanced accounting exports.",
      "Potential enterprise plan for lab chains, hospitals, and multi-location diagnostic groups."
    ],
    visual: "pricing"
  },
  {
    title: "Competitive Advantage",
    eyebrow: "Why Tapxora can win",
    bullets: [
      "Offline-first workflow is central, not an afterthought.",
      "Designed around Nigerian laboratory and owner needs, including billing, receipts, expenses, and inventory.",
      "Traceable samples, verification, audit logs, and grouped reports improve clinical quality control.",
      "Role-based access helps owners separate receptionist, scientist, verifier, accountant, and admin responsibilities.",
      "Modern web deployment reduces installation friction while still supporting local offline continuity."
    ],
    visual: "moat"
  },
  {
    title: "Traction / Roadmap",
    eyebrow: "Current product and next milestones",
    bullets: [
      "Current product: authentication, role management, patients, test catalogue, sample tracking, result entry, verification, reporting, billing, inventory, accounting, dashboards, audit logs, and offline sync.",
      "Current traction to insert: pilots, active labs, monthly active users, tests processed, revenue, or signed LOIs: __________.",
      "Next milestones: user acceptance testing, live deployment hardening, training materials, SMS/WhatsApp delivery, multi-branch administration, and deeper financial exports.",
      "Roadmap metric to insert: target number of pilot laboratories in next 3 to 6 months: __________.",
      "Roadmap metric to insert: target paid deployments in next 12 months: __________."
    ],
    visual: "roadmap"
  },
  {
    title: "Implementation, Security & Compliance",
    eyebrow: "Operational confidence",
    bullets: [
      "Supabase authentication and PostgreSQL Row Level Security protect facility data boundaries.",
      "Role-based UI and route protection reduce accidental exposure of sensitive workflows.",
      "Audit logs record important actions across clinical and admin workflows.",
      "NDPR consent capture is included in patient registration.",
      "Security items to confirm before enterprise sale: penetration test, backup policy, incident response plan, support SLA, and formal NDPR review."
    ],
    visual: "security"
  },
  {
    title: "Team",
    eyebrow: "Placeholder",
    bullets: [
      "Founder / CEO: ______________________________",
      "Technical Lead: ______________________________",
      "Clinical Advisor / Laboratory Scientist: ______________________________",
      "Operations / Customer Success: ______________________________",
      "Finance / Partnerships: ______________________________"
    ],
    callout: "Add short founder bios, healthcare/lab experience, software experience, and advisory support."
  },
  {
    title: "Financial Projections",
    eyebrow: "Placeholder model for investor discussion",
    bullets: [
      "Year 1 revenue: NGN __________",
      "Year 2 revenue: NGN __________",
      "Year 3 revenue: NGN __________",
      "Gross margin assumption: __________%",
      "Key assumptions to insert: number of paying labs, monthly subscription price, implementation fee, support cost, cloud cost, churn, and CAC."
    ],
    visual: "financials"
  },
  {
    title: "Ask / Call To Action",
    eyebrow: "Investment conversation",
    bullets: [
      "Funding ask: NGN __________ or USD __________.",
      "Use of funds: product hardening, customer onboarding, sales, support, compliance, cloud infrastructure, and training materials.",
      "Target milestones after funding: __________ paying labs, __________ monthly tests processed, __________ monthly recurring revenue.",
      "Investor role: capital, healthcare distribution relationships, enterprise sales support, and governance."
    ],
    callout: "Call to action: fund pilot-to-scale execution for Nigerian labs that need resilient digital infrastructure."
  },
  {
    title: "Contact",
    eyebrow: "Tapxora LIMS",
    bullets: [
      "Website: lims.tapxora.com",
      "Phone: 07067038882",
      "Email: ______________________________",
      "Location: ______________________________",
      "Demo link / login access: ______________________________"
    ],
    visual: "contact"
  }
];

function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function addPptText(slide, text, x, y, w, h, opts = {}) {
  slide.addText(text, {
    x,
    y,
    w,
    h,
    fontFace: "Aptos",
    margin: 0,
    breakLine: false,
    fit: "shrink",
    ...opts
  });
}

function addPptFrame(slide, x, y, w, h, title, items, accent = BRAND.blue) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.08,
    fill: { color: BRAND.white },
    line: { color: BRAND.line, width: 1 }
  });
  slide.addShape(pptx.ShapeType.rect, {
    x,
    y,
    w,
    h: 0.32,
    fill: { color: accent },
    line: { color: accent }
  });
  addPptText(slide, title, x + 0.15, y + 0.08, w - 0.3, 0.18, {
    color: BRAND.white,
    fontSize: 8.5,
    bold: true
  });
  items.forEach((item, index) => {
    addPptText(slide, item, x + 0.18, y + 0.48 + index * 0.34, w - 0.36, 0.22, {
      color: BRAND.navy,
      fontSize: 7.5
    });
  });
}

function addPptVisual(slide, type, x, y, w, h) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.08,
    fill: { color: BRAND.sky },
    line: { color: BRAND.line, width: 1 }
  });

  if (type === "hero") {
    addPptText(slide, "Offline-first LIMS", x + 0.35, y + 0.35, w - 0.7, 0.4, {
      bold: true,
      color: BRAND.blue,
      fontSize: 22
    });
    addPptText(slide, "Patients -> Samples -> Results -> Billing -> Finance", x + 0.35, y + 0.9, w - 0.7, 0.3, {
      color: BRAND.slate,
      fontSize: 10
    });
    ["Patient", "Sample", "Verify", "Report"].forEach((label, index) => {
      const bx = x + 0.35 + index * 1.2;
      slide.addShape(pptx.ShapeType.roundRect, {
        x: bx,
        y: y + 1.55,
        w: 0.92,
        h: 0.62,
        rectRadius: 0.04,
        fill: { color: BRAND.white },
        line: { color: BRAND.line }
      });
      addPptText(slide, label, bx + 0.1, y + 1.78, 0.72, 0.16, {
        color: BRAND.navy,
        fontSize: 8.5,
        bold: true,
        align: "center"
      });
    });
    return;
  }

  if (type === "screens") {
    addPptFrame(slide, x + 0.25, y + 0.25, w - 0.5, 1.35, "Dashboard", [
      "Samples collected today",
      "Tests verified today",
      "Tests reported today"
    ]);
    addPptFrame(slide, x + 0.25, y + 1.85, (w - 0.65) / 2, 1.55, "Test request", [
      "Category dropdown",
      "Test dropdown",
      "7-digit Sample ID"
    ], BRAND.green);
    addPptFrame(slide, x + 0.4 + (w - 0.65) / 2, y + 1.85, (w - 0.65) / 2, 1.55, "Report", [
      "Grouped by date",
      "Grouped by Sample ID",
      "H/L result flags"
    ], BRAND.amber);
    return;
  }

  if (type === "workflow") {
    const steps = ["Registered", "Collected", "In Progress", "Entered", "Verified", "Reported"];
    steps.forEach((step, index) => {
      const sx = x + 0.25 + (index % 3) * 1.55;
      const sy = y + 0.35 + Math.floor(index / 3) * 1.05;
      slide.addShape(pptx.ShapeType.roundRect, {
        x: sx,
        y: sy,
        w: 1.22,
        h: 0.58,
        rectRadius: 0.04,
        fill: { color: BRAND.white },
        line: { color: BRAND.blue }
      });
      addPptText(slide, step, sx + 0.08, sy + 0.2, 1.06, 0.16, {
        color: BRAND.blue,
        fontSize: 8,
        bold: true,
        align: "center"
      });
    });
    addPptText(slide, "Sample ID: MMDD###", x + 0.35, y + 2.75, w - 0.7, 0.35, {
      color: BRAND.red,
      fontSize: 13,
      bold: true,
      align: "center"
    });
    return;
  }

  const labelsByType = {
    pain: ["Connectivity interruptions", "Paper records", "Billing leakage", "Weak traceability"],
    solution: ["Single workflow", "Role based access", "PDF reports", "Financial visibility"],
    offline: ["IndexedDB cache", "Mutation queue", "Background sync", "Conflict review"],
    finance: ["Invoices", "Receipts", "Revenue", "Expenses"],
    pricing: ["Subscription", "Setup fee", "Add-ons", "Enterprise"],
    moat: ["Offline-first", "Nigeria-focused", "Finance + clinical", "Audit ready"],
    roadmap: ["Pilot", "Harden", "Deploy", "Scale"],
    security: ["Auth", "RLS", "Audit logs", "NDPR consent"],
    financials: ["Labs", "MRR", "Gross margin", "CAC"],
    contact: ["lims.tapxora.com", "07067038882", "Demo access", "Investor follow-up"]
  };
  const labels = labelsByType[type] || ["Tapxora", "LIMS", "Offline", "Reports"];
  labels.forEach((label, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;
    const bx = x + 0.28 + col * ((w - 0.76) / 2 + 0.2);
    const by = y + 0.4 + row * 1.05;
    const bw = (w - 0.76) / 2;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: bx,
      y: by,
      w: bw,
      h: 0.7,
      rectRadius: 0.05,
      fill: { color: BRAND.white },
      line: { color: BRAND.line }
    });
    addPptText(slide, label, bx + 0.12, by + 0.25, bw - 0.24, 0.18, {
      color: BRAND.navy,
      fontSize: 8.5,
      bold: true,
      align: "center"
    });
  });
}

let pptx;

async function buildPptx() {
  pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Tapxora";
  pptx.subject = "Tapxora LIMS investor pitch";
  pptx.title = "Tapxora LIMS App Investor Pitch";
  pptx.company = "Tapxora";
  pptx.lang = "en-NG";
  pptx.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos",
    lang: "en-US"
  };

  deck.forEach((section, index) => {
    const slide = pptx.addSlide();
    slide.background = { color: "F8FBFF" };
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 13.333,
      h: 0.14,
      fill: { color: BRAND.blue },
      line: { color: BRAND.blue }
    });
    addPptText(slide, section.eyebrow.toUpperCase(), 0.62, 0.42, 5.2, 0.24, {
      color: BRAND.blue,
      fontSize: 8.5,
      bold: true,
      charSpace: 1
    });
    addPptText(slide, section.title, 0.62, 0.72, 5.9, 0.6, {
      color: BRAND.navy,
      fontSize: section.title.length > 22 ? 25 : 31,
      bold: true
    });
    if (section.subtitle) {
      addPptText(slide, section.subtitle, 0.64, 1.45, 5.7, 0.54, {
        color: BRAND.slate,
        fontSize: 13,
        breakLine: false
      });
    }

    const bulletStartY = section.subtitle ? 2.25 : 1.55;
    section.bullets.forEach((bullet, bulletIndex) => {
      const y = bulletStartY + bulletIndex * 0.52;
      slide.addShape(pptx.ShapeType.ellipse, {
        x: 0.64,
        y: y + 0.08,
        w: 0.08,
        h: 0.08,
        fill: { color: BRAND.blue },
        line: { color: BRAND.blue }
      });
      addPptText(slide, bullet, 0.82, y, 5.55, 0.42, {
        color: BRAND.navy,
        fontSize: 10.8,
        breakLine: false,
        fit: "shrink"
      });
    });

    if (section.callout) {
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 0.62,
        y: 6.02,
        w: 5.95,
        h: 0.72,
        rectRadius: 0.04,
        fill: { color: "EEF8F7" },
        line: { color: "BEE3DF" }
      });
      addPptText(slide, section.callout, 0.82, 6.22, 5.55, 0.26, {
        color: BRAND.green,
        fontSize: 10.5,
        bold: true
      });
    }

    addPptVisual(slide, section.visual || "solution", 7.05, 1.05, 5.55, 4.75);
    addPptText(slide, `Tapxora LIMS | lims.tapxora.com | ${String(index + 1).padStart(2, "0")}`, 0.62, 7.05, 12, 0.2, {
      color: BRAND.muted,
      fontSize: 8
    });
  });

  await pptx.writeFile({ fileName: PPTX_PATH });
}

function drawPdfText(doc, text, x, y, options = {}) {
  doc
    .font(options.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(options.size || 10)
    .fillColor(options.color || `#${BRAND.navy}`)
    .text(text, x, y, {
      width: options.width,
      height: options.height,
      align: options.align || "left",
      lineGap: options.lineGap ?? 2
    });
}

function drawPdfVisual(doc, type, x, y, w, h) {
  doc.roundedRect(x, y, w, h, 7).fillAndStroke(`#${BRAND.sky}`, `#${BRAND.line}`);
  const labels = {
    hero: ["Offline-first LIMS", "Patients", "Samples", "Results", "Finance"],
    screens: ["Dashboard", "Test request", "Report preview", "Accounting"],
    workflow: ["Registered", "Collected", "In Progress", "Entered", "Verified", "Reported"],
    offline: ["Local cache", "Queue", "Sync", "Conflict review"],
    finance: ["Invoices", "Receipts", "Revenue", "Expenses"],
    financials: ["Labs", "MRR", "Margin", "CAC"]
  }[type] || ["Workflow", "Roles", "Reports", "Analytics"];

  labels.forEach((label, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const bx = x + 18 + col * ((w - 48) / 2 + 12);
    const by = y + 18 + row * 42;
    const bw = (w - 48) / 2;
    doc.roundedRect(bx, by, bw, 28, 5).fillAndStroke("#FFFFFF", `#${BRAND.line}`);
    drawPdfText(doc, label, bx + 8, by + 9, {
      width: bw - 16,
      size: 8.5,
      bold: true,
      color: `#${index === 0 ? BRAND.blue : BRAND.navy}`,
      align: "center"
    });
  });
}

function buildPdf() {
  const doc = new PDFDocument({
    autoFirstPage: false,
    margin: 36,
    size: "A4",
    layout: "landscape",
    info: {
      Title: "Tapxora LIMS App Investor Pitch",
      Author: "Tapxora",
      Subject: "Investor pitch deck"
    }
  });
  doc.pipe(fs.createWriteStream(PDF_PATH));

  deck.forEach((section, index) => {
    doc.addPage();
    const pageW = doc.page.width;
    const pageH = doc.page.height;

    doc.rect(0, 0, pageW, pageH).fill("#F8FBFF");
    doc.rect(0, 0, pageW, 8).fill(`#${BRAND.blue}`);
    drawPdfText(doc, section.eyebrow.toUpperCase(), 46, 34, {
      size: 7.5,
      bold: true,
      color: `#${BRAND.blue}`
    });
    drawPdfText(doc, section.title, 46, 56, {
      size: section.title.length > 24 ? 22 : 27,
      bold: true,
      color: `#${BRAND.navy}`,
      width: 350
    });
    if (section.subtitle) {
      drawPdfText(doc, section.subtitle, 46, 100, {
        size: 11,
        color: `#${BRAND.slate}`,
        width: 360
      });
    }

    let y = section.subtitle ? 155 : 115;
    section.bullets.forEach((bullet) => {
      doc.circle(53, y + 5, 2.2).fill(`#${BRAND.blue}`);
      drawPdfText(doc, bullet, 66, y, {
        size: 9.1,
        width: 385,
        lineGap: 2
      });
      y += Math.max(26, doc.heightOfString(bullet, { width: 385 }) + 12);
    });

    if (section.callout) {
      doc.roundedRect(46, 477, 385, 42, 7).fillAndStroke("#EEF8F7", "#BEE3DF");
      drawPdfText(doc, section.callout, 62, 491, {
        size: 8.8,
        bold: true,
        color: `#${BRAND.green}`,
        width: 352
      });
    }

    drawPdfVisual(doc, section.visual || "solution", 475, 76, 300, 330);
    drawPdfText(doc, `Tapxora LIMS | lims.tapxora.com | ${String(index + 1).padStart(2, "0")}`, 46, 560, {
      size: 7.5,
      color: `#${BRAND.muted}`,
      width: 500
    });
  });

  doc.end();
}

async function main() {
  ensureOutDir();
  await buildPptx();
  buildPdf();
  console.log(`Created ${PPTX_PATH}`);
  console.log(`Created ${PDF_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
