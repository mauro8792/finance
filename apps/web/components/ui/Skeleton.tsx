import styles from "./Skeleton.module.css";

type SkeletonProps = {
  count?: number;
  height?: string;
  label?: string;
  className?: string;
};

export function Skeleton({
  count = 1,
  height,
  label = "Cargando",
  className,
}: SkeletonProps) {
  const blocks = Array.from({ length: Math.max(1, count) }, (_, index) => index);
  return (
    <div
      className={`${styles.stack} ${className ?? ""}`.trim()}
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      {blocks.map((index) => (
        <span key={index} className={styles.block} style={height ? { height } : undefined} />
      ))}
    </div>
  );
}
