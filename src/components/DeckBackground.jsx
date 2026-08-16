import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const BackgroundWrapper = ({ children }) => (
  <div style={{
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: 0,
    pointerEvents: 'none',
    overflow: 'hidden',
    borderRadius: 'inherit'
  }}>
    {children}
  </div>
);

// 1. Waves for warm_ivory
const WavesBackground = () => (
  <svg width="100%" height="100%" viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="waveGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fdfbf7" />
        <stop offset="100%" stopColor="#fef3c7" />
      </linearGradient>
      <linearGradient id="waveGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#fde68a" stopOpacity="0.7" />
        <stop offset="100%" stopColor="#fcd34d" stopOpacity="0.3" />
      </linearGradient>
      <linearGradient id="waveGrad3" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.5" />
        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.1" />
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#waveGrad1)" />
    {/* Background vertical subtle grid lines like the reference image */}
    <g stroke="rgba(245, 158, 11, 0.04)" strokeWidth="1">
      {[...Array(11)].map((_, i) => (
        <line key={i} x1={`${i * 10}%`} y1="0" x2={`${i * 10}%`} y2="100%" />
      ))}
    </g>
    <path fill="url(#waveGrad2)" d="M0,800 C320,650 480,450 720,500 C960,550 1120,350 1440,250 L1440,800 Z" />
    <path fill="url(#waveGrad3)" d="M0,800 C400,550 600,700 900,550 C1200,400 1350,600 1440,500 L1440,800 L0,800 Z" />
    <path fill="rgba(251, 191, 36, 0.2)" d="M0,800 C200,600 350,800 700,700 C1050,600 1250,850 1440,650 L1440,800 L0,800 Z" />
  </svg>
);

// 2. Polygons for modern_purple
const PolygonsBackground = () => (
  <svg width="100%" height="100%" viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="polyGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#faf5ff" />
        <stop offset="100%" stopColor="#f3e8ff" />
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#polyGrad1)" />
    <g opacity="0.65">
      <polygon fill="#e9d5ff" points="0,0 500,0 250,350" />
      <polygon fill="#d8b4fe" points="500,0 1000,150 600,500" />
      <polygon fill="#c084fc" points="1000,150 1440,0 1300,400" />
      <polygon fill="#a855f7" opacity="0.25" points="250,350 600,500 150,750" />
      <polygon fill="#d8b4fe" opacity="0.45" points="600,500 1000,650 1300,400" />
      <polygon fill="#e9d5ff" opacity="0.35" points="1300,400 1440,0 1440,650" />
      <polygon fill="#c084fc" opacity="0.2" points="150,750 600,500 800,800 0,800" />
      <polygon fill="#a855f7" opacity="0.15" points="800,800 1000,650 1440,800" />
      <polygon fill="#d8b4fe" opacity="0.25" points="1000,650 1440,650 1440,800" />
    </g>
  </svg>
);

// 3. Nature Elements for clean_slate
const NatureBackground = () => (
  <svg width="100%" height="100%" viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="natureGrad1" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#f8fafc" />
        <stop offset="100%" stopColor="#f1f5f9" />
      </linearGradient>
      <filter id="blurFilter">
        <feGaussianBlur stdDeviation="30" />
      </filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#natureGrad1)" />
    <g opacity="0.5" filter="url(#blurFilter)">
      <circle cx="150" cy="150" r="350" fill="#e2e8f0" />
      <circle cx="1300" cy="650" r="450" fill="#cbd5e1" opacity="0.6" />
      <circle cx="900" cy="150" r="300" fill="#dcfce7" opacity="0.3" />
      <circle cx="400" cy="750" r="250" fill="#e0f2fe" opacity="0.4" />
    </g>
    <path fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="10 20" d="M -100,350 Q 350,150 750,450 T 1500,250" opacity="0.35" />
    <path fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 15" d="M 0,650 Q 450,850 850,450 T 1440,650" opacity="0.25" />
  </svg>
);

// 4. Cyber Elements for executive_dark
const CyberBackground = () => (
  <svg width="100%" height="100%" viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="cyberGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#0f172a" />
        <stop offset="100%" stopColor="#020617" />
      </radialGradient>
      <pattern id="cyberGrid" width="60" height="60" patternUnits="userSpaceOnUse">
        <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#1e293b" strokeWidth="1" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#cyberGlow)" />
    <rect width="100%" height="100%" fill="url(#cyberGrid)" />
    <g stroke="#38bdf8" strokeWidth="1.5" fill="none" opacity="0.4">
      <path d="M 0,240 L 360,240 L 480,360 L 840,360 L 960,240 L 1440,240" />
      <path d="M 240,800 L 240,660 L 360,540 L 720,540 L 840,660 L 840,800" stroke="#0ea5e9" opacity="0.6" />
      <path d="M 1260,0 L 1260,300 L 1140,420 L 1140,800" />
    </g>
    <g fill="#38bdf8" opacity="0.8">
      <circle cx="360" cy="240" r="4" />
      <circle cx="480" cy="360" r="4" />
      <circle cx="840" cy="360" r="4" />
      <circle cx="960" cy="240" r="4" />
      <circle cx="240" cy="660" r="4" />
      <circle cx="360" cy="540" r="4" />
      <circle cx="720" cy="540" r="4" />
      <circle cx="840" cy="660" r="4" />
      <circle cx="1260" cy="300" r="4" />
      <circle cx="1140" cy="420" r="4" />
    </g>
  </svg>
);

export const getThemeSvgString = (themeId) => {
  let SvgComp = NatureBackground;
  switch (themeId) {
    case 'warm_ivory': SvgComp = WavesBackground; break;
    case 'modern_purple': SvgComp = PolygonsBackground; break;
    case 'clean_slate': SvgComp = NatureBackground; break;
    case 'executive_dark': SvgComp = CyberBackground; break;
  }
  return renderToStaticMarkup(<SvgComp />);
};

export default function DeckBackground({ themeId }) {
  let content = null;
  switch (themeId) {
    case 'warm_ivory':
      content = <WavesBackground />;
      break;
    case 'modern_purple':
      content = <PolygonsBackground />;
      break;
    case 'clean_slate':
      content = <NatureBackground />;
      break;
    case 'executive_dark':
      content = <CyberBackground />;
      break;
    default:
      content = <NatureBackground />;
  }

  return <BackgroundWrapper>{content}</BackgroundWrapper>;
}
