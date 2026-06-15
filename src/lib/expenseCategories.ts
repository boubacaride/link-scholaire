/** Operating-expense categories displayed under the sidebar's Expenses
 *  flyout. `key` is what's stored in expenses.category (matches the
 *  CHECK constraint in migrations 022 + 023) and what's used as the URL
 *  slug on the /list/expenses/[category] page.
 *  `items` lists the line items shown in the cascading second-level
 *  flyout; clicking one navigates to the category page with a `?item=`
 *  query param so the Add form opens pre-filled with that title. */
export const EXPENSE_CATEGORIES = [
  {
    key: "facilities",
    label: "Building / Facility",
    items: [
      "Rent or mortgage", "Property taxes", "Building insurance",
      "Repairs and maintenance", "Painting", "Plumbing repairs",
      "Electrical repairs", "Roofing repairs", "Classroom renovation",
      "Playground maintenance", "Landscaping / grass cutting",
      "Pest control", "Waste disposal", "Cleaning supplies",
      "Janitorial equipment",
    ],
  },
  {
    key: "utilities",
    label: "Utilities",
    items: [
      "Electricity", "Water", "Gas / heating", "Internet", "Telephone",
      "Waste collection", "Generator fuel", "Solar system maintenance",
    ],
  },
  {
    key: "academic_materials",
    label: "Academic / Classroom",
    items: [
      "Textbooks", "Workbooks", "Exercise books", "Printing paper",
      "Pens, pencils, markers", "Whiteboards", "Chalk / dry erase markers",
      "Classroom charts and posters", "Teaching aids",
      "Science lab materials", "Art supplies", "Music supplies",
      "Library books", "Exam papers", "Report cards", "Student ID cards",
    ],
  },
  {
    key: "technology",
    label: "Technology",
    items: [
      "Computers", "Tablets", "Projectors", "Printers", "Photocopiers",
      "Software subscriptions", "School management system",
      "Website hosting", "Email services", "Internet equipment",
      "CCTV system", "IT support", "Computer repairs",
      "Data backup / cloud storage",
    ],
  },
  {
    key: "transportation",
    label: "Transportation",
    items: [
      "School buses or vans", "Vehicle fuel", "Vehicle insurance",
      "Vehicle maintenance", "Tires", "Oil changes", "Driver wages",
      "Bus registration", "Parking fees", "Transportation permits",
    ],
  },
  {
    key: "food_services",
    label: "Food / Cafeteria",
    items: [
      "Food purchases", "Drinking water", "Cooking gas", "Kitchen equipment",
      "Utensils", "Plates and cups", "Cafeteria staff wages",
      "Food storage", "Cleaning supplies for kitchen", "Health inspection fees",
    ],
  },
  {
    key: "student_support",
    label: "Student Support",
    items: [
      "Nurse supplies", "First aid kits", "Counseling materials",
      "Special education materials", "Student welfare assistance",
      "Scholarships", "Financial aid", "Student uniforms assistance",
      "Hygiene supplies", "Emergency student support",
    ],
  },
  {
    key: "security",
    label: "Safety and Security",
    items: [
      "Security guards", "CCTV cameras", "Fire extinguishers",
      "Fire alarm system", "First aid equipment", "Emergency lights",
      "Safety signs", "Access control system", "Visitor badges",
      "School safety training", "Police / security permits",
    ],
  },
  {
    key: "administration",
    label: "Administrative",
    items: [
      "Office supplies", "Printing and photocopying", "Filing cabinets",
      "Envelopes", "Postage", "Bank fees", "Accounting software",
      "Legal fees", "Audit fees", "Licenses and permits",
      "Accreditation fees", "Registration fees", "Stationery",
      "Meeting expenses",
    ],
  },
  {
    key: "marketing",
    label: "Marketing / Admissions",
    items: [
      "Flyers", "Posters", "Banners", "Social media ads",
      "Website design", "Photography / videography", "Open house events",
      "School brochures", "Admission forms", "Community outreach",
      "Radio or TV advertisements",
    ],
  },
  {
    key: "events",
    label: "Events and Activities",
    items: [
      "Graduation ceremony", "Award ceremony", "Sports day",
      "Field trips", "Cultural events", "Parent meetings",
      "Staff appreciation events", "School competitions", "Club activities",
      "Religious programs", "Guest speakers",
    ],
  },
  {
    key: "sports_extracurricular",
    label: "Sports / Extracurricular",
    items: [
      "Sports equipment", "Jerseys / uniforms", "Balls", "Nets",
      "Training cones", "Coaching fees", "Competition fees",
      "Transportation for games", "Drama club materials",
      "Debate club materials", "Music instruments",
    ],
  },
  {
    key: "insurance",
    label: "Insurance",
    items: [
      "Property insurance", "Liability insurance", "Vehicle insurance",
      "Student accident insurance", "Staff health insurance",
      "Workers' compensation insurance",
    ],
  },
  {
    key: "capital_expenses",
    label: "Capital Expenses",
    items: [
      "Land purchase", "Building construction", "Classroom furniture",
      "School buses", "Computers and servers", "Playground equipment",
      "Science lab equipment", "Library setup", "Generator",
      "Solar power system", "Security system", "Major renovations",
    ],
  },
  {
    key: "miscellaneous",
    label: "Miscellaneous",
    items: [
      "Emergency repairs", "Donations", "Bank charges",
      "Penalties or fines", "Staff travel", "Fuel reimbursement",
      "Hospitality", "Miscellaneous purchases",
    ],
  },
] as const;

export type ExpenseCategoryKey = (typeof EXPENSE_CATEGORIES)[number]["key"];

export const EXPENSE_CATEGORY_KEYS: ExpenseCategoryKey[] =
  EXPENSE_CATEGORIES.map((c) => c.key);

export const isExpenseCategory = (s: string): s is ExpenseCategoryKey =>
  (EXPENSE_CATEGORY_KEYS as string[]).includes(s);

export const labelForCategory = (key: string): string =>
  EXPENSE_CATEGORIES.find((c) => c.key === key)?.label ?? key;

/** Line items shown under the Payroll node in the sidebar flyout. They
 *  all navigate to /list/payroll — the payroll page tracks individual
 *  employee records, not buckets, so these serve as a visual index of
 *  what falls under payroll. */
export const PAYROLL_MENU_ITEMS = [
  "Teacher salaries", "Principal / administrator salaries",
  "Office staff salaries", "Accountant / finance staff salaries",
  "Security staff wages", "Cleaning staff wages", "Bus driver salaries",
  "Cafeteria staff salaries", "Substitute teacher payments",
  "Overtime payments", "Staff bonuses", "Payroll taxes",
  "Pension / retirement contributions", "Health insurance benefits",
  "Staff training and professional development",
] as const;
