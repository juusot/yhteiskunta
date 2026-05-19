import React from "react";

export const BrutalButton: React.FC<{
  onClick?: () => void;
  variant?: "primary" | "secondary" | "error" | "surface" | "ghost";
  className?: string;
  children: React.ReactNode;
  active?: boolean;
}> = ({ onClick, variant = "surface", className = "", children, active }) => {
  const baseClasses =
    "px-4 py-1 font-mono text-[12px] font-bold uppercase transition-colors duration-100 border-2 border-on-surface flex items-center justify-center gap-2";

  const variants = {
    primary:
      "bg-primary-container text-on-primary-container shadow-brutal-sm hover:bg-on-surface hover:text-primary-container",
    secondary:
      "bg-secondary-container text-on-secondary-container shadow-brutal-sm hover:bg-on-surface hover:text-secondary-container",
    error: "bg-error text-on-error hover:bg-on-error-container",
    surface:
      "bg-surface text-on-surface shadow-brutal-sm hover:bg-on-surface hover:text-surface",
    ghost:
      "bg-transparent text-on-surface border-transparent hover:bg-on-surface/10 shadow-none",
  };

  // Active state uses Yellow background (primary-container) for maximum visibility
  // It completely replaces the variant classes to avoid background conflicts
  const activeClasses =
    "bg-primary-container text-on-primary-container shadow-none translate-x-[1px] translate-y-[1px] border-3";

  return (
    <button
      onClick={onClick}
      className={`${baseClasses} ${active ? activeClasses : variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

export const BrutalWindow: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  tabs?: React.ReactNode;
  className?: string;
}> = ({ title, onClose, children, footer, tabs, className = "" }) => {
  return (
    <div
      onWheel={(e) => e.stopPropagation()}
      className={`bg-surface border-4 border-on-surface shadow-brutal w-full max-w-5xl h-[80vh] flex flex-col pointer-events-auto ${className}`}
    >
      {/* Window Header */}
      <div className="flex border-b-2 border-on-surface bg-surface-container-highest shrink-0">
        {tabs ? (
          tabs
        ) : (
          <div className="px-6 py-2 font-headline text-[18px] font-bold uppercase flex items-center">
            {title}
          </div>
        )}
        <div className="flex-1"></div>
        <button
          onClick={onClose}
          className="bg-error text-on-error w-10 flex items-center justify-center border-l-2 border-on-surface hover:bg-on-error-container transition-colors"
        >
          <span className="material-symbols-outlined font-bold">close</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">{children}</div>

      {/* Window Footer */}
      {footer && (
        <div className="bg-surface-container px-4 py-1 border-t-2 border-on-surface flex justify-between items-center text-mono text-[11px] font-medium text-on-surface-variant">
          {footer}
        </div>
      )}
    </div>
  );
};

export const BrutalTab: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-2 border-r-2 border-on-surface font-mono text-[12px] font-bold uppercase transition-colors ${
        active
          ? "bg-on-surface text-surface"
          : "bg-surface text-on-surface hover:bg-primary-container"
      }`}
    >
      {children}
    </button>
  );
};

export const BrutalTable: React.FC<{
  headers: string[];
  rows: (string | number | React.ReactNode)[][];
}> = ({ headers, rows }) => {
  return (
    <div className="w-full overflow-x-auto border-2 border-on-surface bg-surface-container-lowest">
      <table className="w-full text-left font-mono text-[13px]">
        <thead className="bg-surface-container-high border-b border-on-surface">
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="p-2 border-r border-surface-variant font-bold uppercase"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-surface-variant last:border-0 hover:bg-surface-container"
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="p-2 border-r border-surface-variant last:border-0"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
