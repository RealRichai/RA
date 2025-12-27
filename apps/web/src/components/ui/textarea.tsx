import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const textareaVariants = cva(
  'flex w-full rounded-xl border bg-white px-4 py-3 text-base transition-all duration-200 placeholder:text-surface-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 resize-y min-h-[100px]',
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
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof textareaVariants> {
  error?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, variant, error, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          textareaVariants({ variant: error ? 'error' : variant }),
          className
        )}
        ref={ref}
        aria-invalid={!!error}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';

export { Textarea, textareaVariants };
