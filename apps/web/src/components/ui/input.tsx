import { forwardRef, type InputHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const inputVariants = cva(
  'flex w-full rounded-xl border bg-white px-4 py-3 text-base transition-all duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-surface-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'border-surface-200 focus-visible:ring-2 focus-visible:ring-luxury-gold focus-visible:border-transparent',
        error:
          'border-red-500 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:border-transparent',
        success:
          'border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-transparent',
      },
      inputSize: {
        sm: 'h-9 px-3 text-sm',
        default: 'h-11 px-4 text-base',
        lg: 'h-12 px-5 text-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      inputSize: 'default',
    },
  }
);

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant, inputSize, error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          inputVariants({ variant: error ? 'error' : variant, inputSize }),
          className
        )}
        ref={ref}
        aria-invalid={!!error}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export { Input, inputVariants };
