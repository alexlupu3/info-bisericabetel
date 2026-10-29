interface Props {
  src: string
  alt: string
  /** Intrinsic size hint: reserves the box before the image loads (CLS, FR-072). */
  width: number
  height: number
  /** The first image of the page loads eagerly with high priority (LCP); the rest lazily. */
  eager?: boolean
  className?: string
}

export default function FeedImage({ src, alt, width, height, eager = false, className }: Props) {
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={eager ? undefined : 'lazy'}
      // React 18 does not know the camelCase prop; the lowercase attribute is passed through.
      {...(eager ? { fetchpriority: 'high' } : {})}
      decoding="async"
      className={className}
    />
  )
}
