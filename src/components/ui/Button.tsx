import { type ButtonHTMLAttributes } from 'react';
import { motion } from 'framer-motion';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center font-medium rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100';

  const variants: Record<string, string> = {
    primary: 'bg-primary text-white hover:bg-primary-light',
    secondary: 'bg-surface-lighter text-text hover:bg-surface-lighter/80',
    danger: 'bg-danger/20 text-danger hover:bg-danger/30',
    ghost: 'bg-transparent text-text-muted hover:text-text hover:bg-surface-light',
  };

  const sizes: Record<string, string> = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-5 py-2.5 text-base',
    lg: 'px-6 py-3.5 text-lg',
  };

  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.95 }}
      className={`${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled}
      {...(props as object)}
    >
      {children}
    </motion.button>
  );
}
