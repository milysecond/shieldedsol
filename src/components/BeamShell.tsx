'use client';

import { BorderBeam } from 'border-beam';
import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** sm = compact, line = bottom travel, pulse-inner = breathe */
  size?: 'sm' | 'md' | 'line' | 'pulse-inner' | 'pulse-outside';
  colorVariant?: 'colorful' | 'mono' | 'ocean' | 'sunset';
  theme?: 'dark' | 'light' | 'auto';
  duration?: number;
  active?: boolean;
  borderRadius?: number;
  className?: string;
  strength?: number;
};

/**
 * Thin wrapper around jakubantalik border-beam with Shielded Sol defaults
 * (ocean/purple on dark).
 */
export default function BeamShell({
  children,
  size = 'sm',
  colorVariant = 'ocean',
  theme = 'dark',
  duration = 2.8,
  active = true,
  borderRadius,
  className,
  strength = 1.1,
}: Props) {
  return (
    <BorderBeam
      size={size}
      colorVariant={colorVariant}
      theme={theme}
      duration={duration}
      active={active}
      borderRadius={borderRadius}
      className={className}
      strength={strength}
    >
      {children}
    </BorderBeam>
  );
}
