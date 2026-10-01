// Inline stroke icons so the app has no icon-font dependency.
const PATHS = {
  inbox: 'M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6z',
  users: 'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  calendar: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4',
  video: 'M3 6h12v12H3zM15 10l6-3v10l-6-3',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  chart: 'M3 3v18h18M7 15l4-4 3 3 6-6',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z',
  user: 'M20 21v-1a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  plus: 'M12 5v14M5 12h14',
  back: 'M15 18l-6-6 6-6',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  up: 'M18 15l-6-6-6 6',
  down: 'M6 9l6 6 6-6',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  flag: 'M4 22V4M4 4h13l-2 4 2 4H4',
  check: 'M5 12l5 5L20 7',
  camera: 'M3 7h4l2-3h6l2 3h4v13H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  play: 'M7 4v16l13-8z',
  apple: 'M12 7c-1.5-1.3-4-1.6-5.6 0C4.5 8.8 4.8 13 6.6 16.4 8 19 9.6 21 12 20c2.4 1 4-1 5.4-3.6 1.8-3.4 2.1-7.6.2-9.4-1.6-1.6-4.1-1.3-5.6 0zM12 7c0-2 1-3.5 3-4',
  heart: 'M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 22l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4',
  clipboard: 'M9 4h6v3H9zM9 5H6v16h12V5h-3M9 12h6M9 16h4',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  ball: 'M5.5 18.5c-2.6-2.6-1.4-8.1 2.6-12.1s9.5-5.2 12.1-2.6 1.4 8.1-2.6 12.1-9.5 5.2-12.1 2.6zM8.5 15.5l7-7M10.5 11.5l2 2M12.5 9.5l2 2',
  scale: 'M4 7h16l-2 13H6zM9 7a3 3 0 0 1 6 0M12 12v3',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
};

export default function Icon({ name, size = 20 }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] || ''} />
    </svg>
  );
}
