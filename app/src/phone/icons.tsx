import type { SVGProps } from "react";

/**
 * The phone's own icon set, drawn as design/mobile-direction.html draws it: 24-unit paths, a 1.75 stroke, round caps.
 * The desktop keeps lucide; the phone uses these so it matches the mockup line for line.
 */
const PATHS = {
  trace: (
    <>
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="5" r="2" />
      <path d="M6 17V12a4 4 0 0 1 4-4h4a4 4 0 0 0 4-4" />
    </>
  ),
  board: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <path d="M10 6.5h4a2.5 2.5 0 0 1 2.5 2.5v5" />
    </>
  ),
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  undo: (
    <>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </>
  ),
  scan: (
    <>
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  expand: <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />,
  x: <path d="M18 6L6 18M6 6l12 12" />,
  right: <path d="M9 18l6-6-6-6" />,
  file: <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6" />,
  send: <path d="M12 19V5M5 12l7-7 7 7" />,
  pointer: <path d="M4 4l7 17 2.5-7.5L21 11z" />,
  pen: <path d="M17 3l4 4L8 20H4v-4z" />,
  highlighter: <path d="M9 11l-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />,
  eraser: <path d="M7 21L3 17a2 2 0 0 1 0-2.8L13.2 4a2 2 0 0 1 2.8 0L21 9a2 2 0 0 1 0 2.8L11 21zM22 21H7M5 11l9 9" />,
  sticky: <path d="M15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10l6-6V5a2 2 0 0 0-2-2zM15 3v4a2 2 0 0 0 2 2h4" />,
  comment: <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22zM8 12h8M12 8v8" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  text: <path d="M5 6V4h14v2M12 4v16M9 20h6" />,
} as const;

export type PhoneIconName = keyof typeof PATHS;

export function PhoneIcon({
  name,
  size = 18,
  ...rest
}: { name: PhoneIconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="flex-none"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
