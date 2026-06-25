import Image from "next/image";

interface Props {
  /** Drives the icon size + a proportional wordmark size. The whole logo
   *  scales from this single number. Defaults to 56 px (compact corner mark). */
  size?: number;
  /** Show the tagline below the wordmark. Hidden by default for the compact
   *  corner mark; turn on for a hero-sized lockup. */
  showTagline?: boolean;
  tagline?: string;
  className?: string;
}

/**
 * The Link Scholaire wordmark composed exactly as in the brand design file:
 * the chain icon (`/ls-icon.png`) followed by "Link Scho" + a pencil image
 * replacing the "l" + "aire", set in Poppins 700.
 *
 * Renders as live HTML+SVG so it stays crisp at any size, supports a11y, and
 * keeps the type colour separate from the icon palette (use on dark surfaces).
 */
const LinkScholaireLogo = ({
  size = 56,
  showTagline = false,
  tagline = "Optimisez la réussite scolaire avec une gestion intelligente",
  className = "",
}: Props) => {
  const iconH = size;
  const wordSize = Math.round(size * 0.77);     // wordmark height ≈ icon height × 0.77
  const pencilH = Math.round(size * 0.81);      // pencil slightly shorter than caps
  const gap = Math.max(8, Math.round(size * 0.22));
  const taglineSize = Math.max(10, Math.round(size * 0.16));

  return (
    <div
      className={`flex items-center ${className}`}
      style={{ gap, fontFamily: "var(--font-poppins), Poppins, system-ui, sans-serif" }}
      aria-label="Link Scholaire"
    >
      <Image
        src="/ls-icon.png"
        alt=""
        width={148}
        height={74}
        priority
        style={{ height: iconH, width: "auto", display: "block" }}
      />
      <div className="flex flex-col" style={{ gap: 4 }}>
        <div
          className="flex items-center text-white"
          style={{
            fontWeight: 700,
            fontSize: wordSize,
            lineHeight: 1,
            letterSpacing: "-0.5px",
            whiteSpace: "nowrap",
          }}
        >
          <span>Link&nbsp;Scho</span>
          <Image
            src="/ls-pencil.png"
            alt=""
            width={13}
            height={60}
            priority
            style={{
              height: pencilH,
              width: "auto",
              display: "block",
              margin: "0 1px",
              transform: "translateY(-3px)",
            }}
          />
          <span>aire</span>
        </div>
        {showTagline && (
          <div
            style={{
              fontWeight: 400,
              fontSize: taglineSize,
              letterSpacing: "1.2px",
              color: "rgba(255, 255, 255, 0.62)",
              paddingLeft: 2,
            }}
          >
            {tagline}
          </div>
        )}
      </div>
    </div>
  );
};

export default LinkScholaireLogo;
