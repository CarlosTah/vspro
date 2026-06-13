'use client';

interface VsproLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSlogan?: boolean;
  className?: string;
}

export function VsproLogo({ size = 'md', showSlogan = true, className = '' }: VsproLogoProps) {
  const sizes = {
    sm: { logo: 'h-10', text: 'text-xl', slogan: 'text-xs' },
    md: { logo: 'h-14', text: 'text-3xl', slogan: 'text-sm' },
    lg: { logo: 'h-20', text: 'text-4xl', slogan: 'text-base' },
  };

  const s = sizes[size];

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      {/* Logo mark + wordmark */}
      <div className="flex items-center gap-3">
        {/* V icon with arrows - SVG representation */}
        <div className={`relative ${s.logo} aspect-square`}>
          <svg
            viewBox="0 0 80 80"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full drop-shadow-[0_0_20px_rgba(139,92,246,0.5)]"
          >
            {/* Outer V shape */}
            <path
              d="M20 20 L40 65 L60 20"
              stroke="url(#vGradient)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            {/* Inner V detail */}
            <path
              d="M28 25 L40 55 L52 25"
              stroke="url(#vGradient)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            {/* Arrow up-right */}
            <path
              d="M50 15 L60 5 L60 12 M60 5 L53 5"
              stroke="url(#arrowGradient)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Arrow up */}
            <path
              d="M40 18 L40 5 L35 10 M40 5 L45 10"
              stroke="url(#arrowGradient)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <defs>
              <linearGradient id="vGradient" x1="20" y1="20" x2="60" y2="65" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#818cf8" />
                <stop offset="50%" stopColor="#a78bfa" />
                <stop offset="100%" stopColor="#7c3aed" />
              </linearGradient>
              <linearGradient id="arrowGradient" x1="40" y1="5" x2="60" y2="18" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#c084fc" />
                <stop offset="100%" stopColor="#a855f7" />
              </linearGradient>
            </defs>
          </svg>
          {/* Glow effect */}
          <div className="absolute inset-0 rounded-full bg-purple-500/20 blur-xl -z-10" />
        </div>

        {/* Wordmark */}
        <span className={`${s.text} font-heading font-bold tracking-tight`}>
          <span className="text-white">VS</span>
          <span className="text-white font-extrabold">PRO</span>
        </span>
      </div>

      {/* Slogan */}
      {showSlogan && (
        <p className={`${s.slogan} text-gray-400 font-light tracking-wide`}>
          Inteligencia en movimiento. Escala sin límites.
        </p>
      )}
    </div>
  );
}
