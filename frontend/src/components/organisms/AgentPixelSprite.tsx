"use client";

interface AgentPixelSpriteProps {
  role: string;
  skillTags: string[];
  state: "idle" | "working" | "offline";
  size?: number;
}

const SKIN = "#f0c49e";
const EYES = "#2c1810";
const LEGS = "#374151";
const SHOES = "#111827";

const ROLE_COLORS: Record<string, { hair: string; body: string }> = {
  manager:    { hair: "#92400e", body: "#f59e0b" },
  specialist: { hair: "#1e3a5f", body: "#3b82f6" },
};

const SKILL_TINTS: Record<string, { hair: string; body: string }> = {
  cybersecurity: { hair: "#7f1d1d", body: "#ef4444" },
  data:          { hair: "#14532d", body: "#22c55e" },
  frontend:      { hair: "#312e81", body: "#818cf8" },
  devops:        { hair: "#78350f", body: "#f97316" },
  research:      { hair: "#4a044e", body: "#d946ef" },
};

export function AgentPixelSprite({ role, skillTags, state, size = 52 }: AgentPixelSpriteProps) {
  const baseColors = ROLE_COLORS[role] ?? ROLE_COLORS.specialist;
  const skillTint = skillTags[0] ? SKILL_TINTS[skillTags[0]] : undefined;
  const { hair: hairColor, body: bodyColor } =
    role === "manager" ? baseColors : (skillTint ?? baseColors);

  // Working state shifts the character up 1px
  const yOff = state === "working" ? -1 : 0;

  const charRects = (
    <g transform={`translate(0, ${yOff})`}>
      {/* Hair */}
      <rect x="6" y="0" width="4" height="2" fill={hairColor} />
      {/* Face (skin overlaps bottom of hair) */}
      <rect x="6" y="1" width="4" height="4" fill={SKIN} />
      {/* Eyes */}
      <rect x="7" y="3" width="1" height="1" fill={EYES} />
      <rect x="9" y="3" width="1" height="1" fill={EYES} />
      {/* Body / shirt */}
      <rect x="5" y="5" width="6" height="5" fill={bodyColor} />
      {/* Arms */}
      <rect x="4" y="6" width="1" height="3" fill={bodyColor} />
      <rect x="11" y="6" width="1" height="3" fill={bodyColor} />
      {/* Legs */}
      <rect x="6" y="10" width="2" height="3" fill={LEGS} />
      <rect x="9" y="10" width="2" height="3" fill={LEGS} />
      {/* Shoes */}
      <rect x="5" y="13" width="2" height="1" fill={SHOES} />
      <rect x="9" y="13" width="2" height="1" fill={SHOES} />
    </g>
  );

  return (
    <div style={{ opacity: state === "offline" ? 0.35 : 1 }}>
      <svg
        viewBox="0 0 16 16"
        width={size}
        height={size}
        style={{ imageRendering: "pixelated" }}
      >
        {state === "working" ? (
          <g className="animate-pixel-work">{charRects}</g>
        ) : (
          charRects
        )}
      </svg>
    </div>
  );
}
