interface CardProps {
  children: React.ReactNode;
  title?: string;
  hover?: boolean;
  className?: string;
  onClick?: () => void;
}

export default function Card({
  children,
  title,
  hover = false,
  className = "",
  onClick,
}: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-border bg-bg-card p-5 transition-all duration-200 ${
        hover
          ? "cursor-pointer hover:border-border-light hover:bg-bg-card-hover hover:shadow-[0_0_20px_rgba(42,42,69,0.3)]"
          : ""
      } ${onClick ? "cursor-pointer" : ""} ${className}`}
    >
      {title && (
        <h3 className="mb-3 text-sm font-semibold tracking-wide text-text-secondary uppercase">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}
