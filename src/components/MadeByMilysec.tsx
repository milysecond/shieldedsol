type Props = {
  /** white for dark chrome (default), black for light */
  variant?: 'white' | 'black';
  height?: number;
  className?: string;
};

export default function MadeByMilysec({
  variant = 'white',
  height = 28,
  className = '',
}: Props) {
  const src =
    variant === 'black'
      ? '/images/badges/made-by-milysec-black.svg'
      : '/images/badges/made-by-milysec-white.svg';

  return (
    <a
      href="https://milysec.com"
      target="_blank"
      rel="noopener noreferrer"
      className={`made-by-milysec${className ? ` ${className}` : ''}`}
      aria-label="Made by Milysec.com"
      title="Made by Milysec"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Made by Milysec"
        height={height}
        style={{ height, width: 'auto', display: 'block' }}
      />
    </a>
  );
}
