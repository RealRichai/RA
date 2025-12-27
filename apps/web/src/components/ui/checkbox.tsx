'use client';

import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer h-5 w-5 shrink-0 rounded-md border-2 border-surface-300',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luxury-gold focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:bg-luxury-bronze data-[state=checked]:border-luxury-bronze data-[state=checked]:text-white',
      'transition-all duration-200',
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn('flex items-center justify-center text-current')}
    >
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

// Checkbox with label wrapper
interface CheckboxWithLabelProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  label: string;
  description?: string;
}

const CheckboxWithLabel = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxWithLabelProps
>(({ label, description, className, id, ...props }, ref) => {
  const generatedId = React.useId();
  const checkboxId = id || generatedId;

  return (
    <div className="flex items-start gap-3">
      <Checkbox ref={ref} id={checkboxId} className={className} {...props} />
      <div className="grid gap-1.5 leading-none">
        <label
          htmlFor={checkboxId}
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
        >
          {label}
        </label>
        {description && (
          <p className="text-sm text-surface-500">{description}</p>
        )}
      </div>
    </div>
  );
});
CheckboxWithLabel.displayName = 'CheckboxWithLabel';

export { Checkbox, CheckboxWithLabel };
