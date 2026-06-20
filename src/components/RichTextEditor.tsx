"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

type Cmd =
  | "bold" | "italic" | "underline" | "strikeThrough"
  | "insertUnorderedList" | "insertOrderedList"
  | "justifyLeft" | "justifyCenter" | "justifyRight"
  | "formatBlock" | "createLink" | "removeFormat";

const exec = (cmd: Cmd, value?: string) => {
  // execCommand is officially deprecated but still the lightest path to a
  // rich-text editor across every browser the platform targets — no extra
  // 70-200 KB editor dependency, no SSR pitfalls.
  document.execCommand(cmd, false, value);
};

const ToolbarBtn = ({
  onClick, title, children, active,
}: { onClick: () => void; title: string; children: React.ReactNode; active?: boolean }) => (
  <button
    type="button"
    title={title}
    onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    className={`h-8 min-w-8 px-2 text-sm rounded-md flex items-center justify-center transition-colors ${
      active ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"
    }`}
  >
    {children}
  </button>
);

const Divider = () => <div className="w-px h-5 bg-gray-200 mx-0.5" />;

/**
 * Lightweight rich-text editor with a Word-style toolbar.
 * Stores HTML on the parent via `onChange`. No external deps.
 */
const RichTextEditor = ({ value, onChange, placeholder, minHeight = 160 }: Props) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(!value);

  // Mirror parent value → DOM only when the editor isn't focused, so the
  // user's caret never jumps mid-typing.
  useEffect(() => {
    if (!ref.current) return;
    if (document.activeElement === ref.current) return;
    if (ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || "";
      setIsEmpty(!value);
    }
  }, [value]);

  const handleInput = () => {
    if (!ref.current) return;
    const html = ref.current.innerHTML;
    setIsEmpty(ref.current.textContent?.trim().length === 0);
    onChange(html);
  };

  const link = () => {
    const url = window.prompt("Enter URL");
    if (url) exec("createLink", url);
    handleInput();
  };

  const heading = (level: "H1" | "H2" | "H3" | "P") => {
    exec("formatBlock", level);
    handleInput();
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-white focus-within:ring-2 focus-within:ring-blue-200">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b bg-gray-50">
        <ToolbarBtn title="Heading 1" onClick={() => heading("H1")}><span className="font-bold">H1</span></ToolbarBtn>
        <ToolbarBtn title="Heading 2" onClick={() => heading("H2")}><span className="font-bold text-xs">H2</span></ToolbarBtn>
        <ToolbarBtn title="Paragraph" onClick={() => heading("P")}>¶</ToolbarBtn>
        <Divider />
        <ToolbarBtn title="Bold" onClick={() => { exec("bold"); handleInput(); }}><b>B</b></ToolbarBtn>
        <ToolbarBtn title="Italic" onClick={() => { exec("italic"); handleInput(); }}><i>I</i></ToolbarBtn>
        <ToolbarBtn title="Underline" onClick={() => { exec("underline"); handleInput(); }}><u>U</u></ToolbarBtn>
        <ToolbarBtn title="Strikethrough" onClick={() => { exec("strikeThrough"); handleInput(); }}><s>S</s></ToolbarBtn>
        <Divider />
        <ToolbarBtn title="Bullet list" onClick={() => { exec("insertUnorderedList"); handleInput(); }}>•≡</ToolbarBtn>
        <ToolbarBtn title="Numbered list" onClick={() => { exec("insertOrderedList"); handleInput(); }}>1.</ToolbarBtn>
        <Divider />
        <ToolbarBtn title="Align left" onClick={() => { exec("justifyLeft"); handleInput(); }}>⯇</ToolbarBtn>
        <ToolbarBtn title="Align center" onClick={() => { exec("justifyCenter"); handleInput(); }}>≡</ToolbarBtn>
        <ToolbarBtn title="Align right" onClick={() => { exec("justifyRight"); handleInput(); }}>⯈</ToolbarBtn>
        <Divider />
        <ToolbarBtn title="Insert link" onClick={link}>🔗</ToolbarBtn>
        <ToolbarBtn title="Clear formatting" onClick={() => { exec("removeFormat"); handleInput(); }}>✕</ToolbarBtn>
      </div>

      {/* Editable surface */}
      <div className="relative">
        {isEmpty && placeholder && (
          <div
            className="absolute top-3 left-3 text-sm text-gray-400 pointer-events-none"
          >
            {placeholder}
          </div>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onBlur={handleInput}
          className="rte-surface p-3 text-sm text-gray-800 outline-none max-w-none"
          style={{ minHeight }}
        />
      </div>
    </div>
  );
};

export default RichTextEditor;
