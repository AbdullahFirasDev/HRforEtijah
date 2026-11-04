// Small hand-rolled stroke icon set (feather-style) so the app has no external icon dependency.
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const Svg = ({ children, size = 18, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} {...rest}>
    {children}
  </svg>
);

export const IconDashboard = (p) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </Svg>
);

export const IconClock = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </Svg>
);

export const IconCalendar = (p) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="16" rx="2" />
    <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
  </Svg>
);

export const IconClockPlus = (p) => (
  <Svg {...p}>
    <circle cx="10.5" cy="13.5" r="7.5" />
    <path d="M10.5 9.5v4l2.7 1.6M18 3v5M15.5 5.5h5" />
  </Svg>
);

export const IconChart = (p) => (
  <Svg {...p}>
    <path d="M4 20V10M11 20V4M18 20v-7" />
    <path d="M2 20h20" />
  </Svg>
);

export const IconUsers = (p) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.3" />
    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    <path d="M16.2 3.4a3.3 3.3 0 010 6.4M20 20c0-3-1.9-5.2-4.6-5.8" />
  </Svg>
);

export const IconTimesheet = (p) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="17" rx="2" />
    <path d="M9 2.5h6v3H9z" />
    <path d="M8 10h8M8 14h8M8 18h5" />
  </Svg>
);

export const IconHourglass = (p) => (
  <Svg {...p}>
    <path d="M7 3h10M7 21h10" />
    <path d="M8 3c0 4 8 5 8 9s-8 5-8 9" />
    <path d="M16 3c0 4-8 5-8 9s8 5 8 9" />
  </Svg>
);

export const IconMapPin = (p) => (
  <Svg {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.4" />
  </Svg>
);

export const IconLogout = (p) => (
  <Svg {...p}>
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </Svg>
);

export const IconDownload = (p) => (
  <Svg {...p}>
    <path d="M12 3v12M7 10l5 5 5-5" />
    <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
  </Svg>
);

// iOS "Share" glyph: a box with an arrow pointing up
export const IconShare = (p) => (
  <Svg {...p}>
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M8 11H6a1 1 0 00-1 1v8a1 1 0 001 1h12a1 1 0 001-1v-8a1 1 0 00-1-1h-2" />
  </Svg>
);

export const IconKey = (p) => (
  <Svg {...p}>
    <circle cx="7.5" cy="14.5" r="4.5" />
    <path d="M10.8 11.2L20 2M16 6l3 3M13 9l2.5 2.5" />
  </Svg>
);

export const IconMenu = (p) => (
  <Svg {...p}>
    <path d="M3 6h18M3 12h18M3 18h18" />
  </Svg>
);

export const IconChevronDown = (p) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);

export const IconClose = (p) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const IconMail = (p) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3.5 7l8.5 6 8.5-6" />
  </Svg>
);

export const IconBell = (p) => (
  <Svg {...p}>
    <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 01-3.4 0" />
  </Svg>
);
