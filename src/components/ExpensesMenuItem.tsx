"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  EXPENSE_CATEGORIES,
  PAYROLL_MENU_ITEMS,
} from "@/lib/expenseCategories";

interface ExpensesMenuItemProps {
  icon: string;
  label: string;
  pathname: string;
}

interface FlyoutPos {
  /** Distance from the viewport bottom (so the flyout grows upward). */
  bottom: number;
  left: number;
}

/** Sidebar entry for the Expenses bucket. Styled like the other top-level
 *  nav items (no chevron, no button look). Clicking opens a fixed-position
 *  flyout to the right of the sidebar with Payroll + 15 expense categories.
 *  The flyout is bottom-anchored to the button so it opens UPWARD — the
 *  Expenses tab sits near the bottom of the sidebar, and the previous
 *  downward-opening behaviour clipped half the categories off-screen.
 *  Hovering / clicking a category opens a second cascading flyout with the
 *  specific line items, each linking to the relevant ledger page with a
 *  `?item=` query param so the Add form opens pre-filled. */
const ExpensesMenuItem = ({ icon, label, pathname }: ExpensesMenuItemProps) => {
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [pos, setPos] = useState<FlyoutPos | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);

  const onAnExpenseRoute =
    pathname === "/list/payroll" || pathname.startsWith("/list/expenses");
  const highlighted = open || onAnExpenseRoute;

  const toggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPos({
        // Anchor the flyout's bottom to the button's bottom so it grows
        // upward, keeping every category on screen even when the Expenses
        // tab sits near the bottom of the sidebar.
        bottom: window.innerHeight - rect.bottom,
        left: rect.right + 6,
      });
    }
    setOpen((v) => !v);
    setActiveKey(null);
  };

  // Outside click closes the flyout.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (flyoutRef.current?.contains(target)) return;
      setOpen(false);
      setActiveKey(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close the flyout on route change so the user never sees stale state.
  useEffect(() => {
    setOpen(false);
    setActiveKey(null);
  }, [pathname]);

  const itemLink = (catKey: string, item: string) =>
    catKey === "payroll"
      ? "/list/payroll"
      : `/list/expenses/${catKey}?item=${encodeURIComponent(item)}`;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center justify-center lg:justify-start gap-4 py-2 md:px-2 rounded-md transition-colors text-left ${
          highlighted
            ? "bg-gradient-to-b from-[#4a7eb0] to-[#3a6d9a] text-white font-medium shadow-sm"
            : "text-gray-500 hover:bg-lamaSkyLight"
        }`}
      >
        <Image src={icon} alt="" width={20} height={20} />
        <span className="hidden lg:block">{label}</span>
      </button>

      {open && pos && (
        <div
          ref={flyoutRef}
          style={{
            position: "fixed",
            bottom: pos.bottom,
            left: pos.left,
            maxHeight: "85vh",
          }}
          className="bg-white rounded-md shadow-xl border border-gray-200 py-1 min-w-[230px] z-50 overflow-y-auto"
          role="menu"
        >
          {/* ── Payroll node (special-cased, links to /list/payroll) ─── */}
          <FlyoutRow
            label="Payroll"
            isActive={activeKey === "payroll" || pathname === "/list/payroll"}
            highlighted={activeKey === "payroll"}
            onMouseEnter={() => setActiveKey("payroll")}
            onClick={() => setActiveKey(activeKey === "payroll" ? null : "payroll")}
            subItems={
              activeKey === "payroll"
                ? PAYROLL_MENU_ITEMS.map((label) => ({ label, href: itemLink("payroll", label) }))
                : null
            }
            onSubItemClick={() => { setOpen(false); setActiveKey(null); }}
          />

          <div className="border-t border-gray-100 my-1" />

          {/* ── 15 operating-expense categories ─────────────────────── */}
          {EXPENSE_CATEGORIES.map((cat) => {
            const onThisCat = pathname === `/list/expenses/${cat.key}`;
            return (
              <FlyoutRow
                key={cat.key}
                label={cat.label}
                isActive={activeKey === cat.key || onThisCat}
                highlighted={activeKey === cat.key}
                onMouseEnter={() => setActiveKey(cat.key)}
                onClick={() => setActiveKey(activeKey === cat.key ? null : cat.key)}
                subItems={
                  activeKey === cat.key
                    ? cat.items.map((label) => ({ label, href: itemLink(cat.key, label) }))
                    : null
                }
                onSubItemClick={() => { setOpen(false); setActiveKey(null); }}
              />
            );
          })}
        </div>
      )}
    </>
  );
};

/* ── Sub-components ─────────────────────────────────────────────────── */

/** Row in the main category flyout. When `subItems` is non-null this row's
 *  cascading sub-flyout is open; the sub-flyout's vertical anchor (top vs.
 *  bottom of the row) is picked based on the row's position in the viewport
 *  so the line items list never gets clipped. */
const FlyoutRow = ({
  label, isActive, highlighted, onMouseEnter, onClick,
  subItems, onSubItemClick,
}: {
  label: string;
  isActive: boolean;
  highlighted: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
  subItems: { label: string; href: string }[] | null;
  onSubItemClick: () => void;
}) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const [subAnchor, setSubAnchor] = useState<"top" | "bottom">("top");

  useEffect(() => {
    if (!subItems || !rowRef.current) return;
    const rect = rowRef.current.getBoundingClientRect();
    // Worst-case sub-flyout height: ~28px per row + chrome, capped at 70vh.
    const est = Math.min(subItems.length * 28 + 16, window.innerHeight * 0.7);
    const spaceBelow = window.innerHeight - rect.top;
    setSubAnchor(spaceBelow >= est ? "top" : "bottom");
  }, [subItems]);

  return (
    <div ref={rowRef} className="relative" onMouseEnter={onMouseEnter}>
      <button
        onClick={onClick}
        className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition-colors ${
          highlighted ? "bg-[#eef3f9] text-[#1f3a5f] font-semibold"
          : isActive ? "text-[#1f3a5f] font-medium"
          : "text-gray-700 hover:bg-gray-50"
        }`}
        role="menuitem"
      >
        <span>{label}</span>
        <span className="text-[9px] text-gray-400 ml-2">▶</span>
      </button>
      {subItems && (
        <div
          style={{
            maxHeight: "70vh",
            ...(subAnchor === "top" ? { top: 0 } : { bottom: 0 }),
          }}
          className="absolute left-full ml-1 bg-white rounded-md shadow-xl border border-gray-200 py-1 min-w-[260px] z-50 overflow-y-auto"
          role="menu"
        >
          {subItems.map((it) => (
            <Link
              key={it.label}
              href={it.href}
              onClick={onSubItemClick}
              className="block px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              role="menuitem"
            >
              {it.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default ExpensesMenuItem;
