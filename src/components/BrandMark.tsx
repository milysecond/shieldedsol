type Props = {
  /** Link target — default home */
  href?: string;
  /** Show wordmark next to shield */
  withWordmark?: boolean;
  /** Icon height in px */
  size?: number;
  /** header | footer | page */
  variant?: 'header' | 'footer' | 'page';
  className?: string;
  /** If true, render as span (no navigation) */
  static?: boolean;
  title?: string;
  onClick?: () => void;
};

/**
 * Official Shielded Sol mark — bare shield + optional wordmark.
 * Logo is bare shield + glow only (no box).
 */
export default function BrandMark({
  href = '/',
  withWordmark = true,
  size = 28,
  variant = 'header',
  className = '',
  static: isStatic = false,
  title,
  onClick,
}: Props) {
  const cls = `brand-mark brand-mark--${variant}${className ? ` ${className}` : ''}`;
  const inner = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.svg"
        alt=""
        width={size}
        height={size}
        className="brand-mark-logo"
        style={{ width: size, height: size }}
        aria-hidden
      />
      {withWordmark ? (
        <span className="brand-mark-text">
          <span className="brand-mark-name">Shielded Sol</span>
          {variant === 'header' ? (
            <span className="brand-mark-domain">shieldedsol.com</span>
          ) : null}
        </span>
      ) : (
        <span className="sr-only">Shielded Sol</span>
      )}
    </>
  );

  if (isStatic) {
    return (
      <span className={cls} title={title}>
        {inner}
      </span>
    );
  }

  if (onClick && href === '#') {
    return (
      <button type="button" className={cls} title={title} onClick={onClick}>
        {inner}
      </button>
    );
  }

  return (
    <a
      href={href}
      className={cls}
      title={title || 'Shielded Sol home'}
      aria-label="Shielded Sol"
    >
      {inner}
    </a>
  );
}
