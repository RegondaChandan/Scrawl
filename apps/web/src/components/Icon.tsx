export type IconName =
  | 'arrow'
  | 'copy'
  | 'diamond'
  | 'download'
  | 'ellipse'
  | 'eraser'
  | 'hand'
  | 'line'
  | 'moon'
  | 'mouse'
  | 'note'
  | 'pen'
  | 'plus'
  | 'rectangle'
  | 'redo'
  | 'search'
  | 'shapes'
  | 'sun'
  | 'template'
  | 'text'
  | 'x'
  | 'undo';

const paths: Record<IconName, React.ReactNode> = {
  arrow: <path d="M5 19 19 5m-7 0h7v7" />,
  copy: <path d="M8 8h11v11H8V8Zm-3 8H4V4h12v1" />,
  diamond: <path d="m12 3 9 9-9 9-9-9 9-9Z" />,
  download: <path d="M12 3v12m-5-5 5 5 5-5M4 21h16" />,
  ellipse: <ellipse cx="12" cy="12" rx="9" ry="7" />,
  eraser: <path d="m7 19-4-4L14 4l6 6-9 9H7Zm4 0h10" />,
  hand: (
    <path d="M7 11V7a1.5 1.5 0 0 1 3 0v3-5a1.5 1.5 0 0 1 3 0v5-4a1.5 1.5 0 0 1 3 0v5-2a1.5 1.5 0 0 1 3 0v5c0 5-3 7-7 7-3 0-5-2-6-4l-2-4a1.5 1.5 0 0 1 3-2Z" />
  ),
  line: <path d="m5 19 14-14" />,
  moon: <path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />,
  mouse: <path d="m4 3 8 18 2-7 7-2L4 3Z" />,
  note: <path d="M5 3h14v18H5V3Zm3 5h8M8 12h6" />,
  pen: <path d="M4 20c4-1 7-4 8-8l6-6M14 4l6 6M4 20c2-3 2-5 0-7-2 3-2 5 0 7Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  rectangle: <rect x="3" y="5" width="18" height="14" rx="2" />,
  redo: <path d="M20 7v5h-5M20 12a8 8 0 0 0-14-4M4 17v-5h5M4 12a8 8 0 0 0 14 4" />,
  search: <path d="m20 20-4.5-4.5M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />,
  shapes: <path d="M4 4h7v7H4V4Zm9 9h7v7h-7v-7Zm3.5-9 3.5 6h-7l3.5-6ZM4 20l3.5-7 3.5 7H4Z" />,
  sun: (
    <path d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m11.4 0 1.4 1.4M4.9 4.9l1.4 1.4M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z" />
  ),
  text: <path d="M5 5h14M12 5v14M8 19h8" />,
  template: <path d="M4 3h16v18H4V3Zm0 6h16M10 9v12" />,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  undo: <path d="M4 7v5h5M4 12a8 8 0 0 1 14-4M20 17v-5h-5M20 12a8 8 0 0 1-14 4" />,
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
        {paths[name]}
      </g>
    </svg>
  );
}
