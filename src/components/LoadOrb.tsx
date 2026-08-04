'use client';

import { ThinkingOrb } from 'thinking-orbs';

export type OrbState =
  | 'working'
  | 'searching'
  | 'solving'
  | 'listening'
  | 'connecting'
  | 'weaving'
  | 'composing'
  | 'breathing'
  | 'shaping';

type Props = {
  state?: OrbState;
  size?: 20 | 64;
  theme?: 'auto' | 'dark' | 'light';
  className?: string;
  label?: string;
  speed?: number;
};

/** Canvas thinking-orb loader (client-only). */
export default function LoadOrb({
  state = 'searching',
  size = 64,
  theme = 'auto',
  className,
  label,
  speed,
}: Props) {
  return (
    <span className={`load-orb${className ? ` ${className}` : ''}`}>
      <ThinkingOrb
        state={state}
        size={size}
        theme={theme}
        speed={speed}
        aria-label={label || 'Loading'}
      />
    </span>
  );
}
