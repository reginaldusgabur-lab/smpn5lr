import type { SVGProps } from 'react';

export function AppLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 7v5l2 2" />
      {/* <!-- QR code part --> */}
      <path d="M7 14h.01" />
      <path d="M10 14h.01" />
      <path d="M13 14h.01" />
      <path d="M16 14h.01" />
      <path d="M7 17h.01" />
      <path d="M10 17h.01" />
      <path d="M13 17h.01" />
      <path d="M16 17h.01" />
    </svg>
  );
}
