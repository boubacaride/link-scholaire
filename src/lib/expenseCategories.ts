/** Operating-expense categories displayed under the sidebar's Expenses
 *  dropdown. `key` is what's stored in expenses.category (matches the
 *  CHECK constraint in migration 022) and what's used as the URL slug
 *  on the /list/expenses/[category] page. */
export const EXPENSE_CATEGORIES = [
  { key: "facilities",          label: "Facilities" },
  { key: "utilities",           label: "Utilities" },
  { key: "academic_materials",  label: "Academic Materials" },
  { key: "technology",          label: "Technology" },
  { key: "transportation",      label: "Transportation" },
  { key: "food_services",       label: "Food Services" },
  { key: "security",            label: "Security" },
  { key: "administration",      label: "Administration" },
  { key: "marketing",           label: "Marketing" },
  { key: "events",              label: "Events" },
  { key: "insurance",           label: "Insurance" },
  { key: "capital_expenses",    label: "Capital Expenses" },
] as const;

export type ExpenseCategoryKey = (typeof EXPENSE_CATEGORIES)[number]["key"];

export const EXPENSE_CATEGORY_KEYS: ExpenseCategoryKey[] =
  EXPENSE_CATEGORIES.map((c) => c.key);

export const isExpenseCategory = (s: string): s is ExpenseCategoryKey =>
  (EXPENSE_CATEGORY_KEYS as string[]).includes(s);

export const labelForCategory = (key: string): string =>
  EXPENSE_CATEGORIES.find((c) => c.key === key)?.label ?? key;
