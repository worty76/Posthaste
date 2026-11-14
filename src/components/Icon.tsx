const PATHS = {
  inbox:
    "M2.500 9.500 4.200 3.500h7.600l1.700 6M2.500 9.500v3h11v-3M2.500 9.500h3l.8 1.500h3.400l.8-1.500h3",
  sun: "M8 5.200a2.800 2.800 0 1 0 0 5.600 2.800 2.800 0 0 0 0-5.600ZM8 1.500v1.300M8 13.200v1.300M1.500 8h1.300M13.200 8h1.300M3.400 3.400l.9.900M11.700 11.700l.9.900M3.400 12.600l.9-.9M11.700 4.300l.9-.9",
  archive: "M2.500 3h11v3h-11zM3.500 6v7h9V6M6.500 8.800h3",
  settings: "M2.500 4.500h6M11.500 4.500h2M2.500 11.500h2M7.500 11.500h6M8.500 3v3M5.500 10v3",
  filter: "M2.500 3.500h11l-4.200 5v4l-2.600-1.200V8.500z",
  search: "M7 2.800a4.200 4.200 0 1 0 0 8.400 4.200 4.200 0 0 0 0-8.400ZM10.200 10.200l3.300 3.300",
  close: "M4 4l8 8M12 4l-8 8",
  check: "M3.500 8.300l3 3 6-6.600",
  edit: "M3 13l.6-3L10.800 2.800l2.400 2.400L6 12.400 3 13Z",
  copy: "M5.500 5.500h7v7h-7zM3.500 10.500v-7h7",
  trash: "M3 4.500h10M6.500 4.500V3h3v1.500M4.500 4.500l.6 8.500h5.800l.6-8.500",
  restore: "M3 8a5 5 0 1 0 1.600-3.700M3 3v2.800h2.800",
  plus: "M8 3v10M3 8h10",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
