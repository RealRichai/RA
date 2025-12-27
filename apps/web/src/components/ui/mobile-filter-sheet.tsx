'use client';

import { useState, useEffect, useRef } from 'react';
import { X, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FilterOption {
  value: string;
  label: string;
}

interface FilterSection {
  id: string;
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
}

interface MobileFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  sections: FilterSection[];
  onApply: () => void;
  onClear: () => void;
  activeCount: number;
}

export function MobileFilterSheet({
  isOpen,
  onClose,
  sections,
  onApply,
  onClear,
  activeCount,
}: MobileFilterSheetProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number>(0);
  const currentY = useRef<number>(0);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle touch gestures for swipe-to-close
  const handleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    currentY.current = e.touches[0].clientY;
    const delta = currentY.current - startY.current;
    
    if (delta > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${delta}px)`;
    }
  };

  const handleTouchEnd = () => {
    const delta = currentY.current - startY.current;
    
    if (delta > 100) {
      onClose();
    }
    
    if (sheetRef.current) {
      sheetRef.current.style.transform = '';
    }
    
    startY.current = 0;
    currentY.current = 0;
  };

  const handleApply = () => {
    onApply();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-luxury max-h-[85vh] flex flex-col animate-slide-up"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-surface-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-full hover:bg-surface-100 active:bg-surface-200 transition-colors min-touch"
            aria-label="Close filters"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold text-surface-900">Filters</h2>
          <button
            onClick={onClear}
            className={cn(
              "text-sm font-medium transition-colors px-3 py-2 rounded-lg min-touch",
              activeCount > 0 
                ? "text-luxury-bronze hover:bg-luxury-champagne/50" 
                : "text-surface-400"
            )}
            disabled={activeCount === 0}
          >
            Clear
          </button>
        </div>

        {/* Filter Sections */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {sections.map((section) => (
            <div key={section.id} className="border-b border-surface-100">
              {/* Section Header */}
              <button
                onClick={() => setExpandedSection(
                  expandedSection === section.id ? null : section.id
                )}
                className="w-full flex items-center justify-between px-4 py-4 text-left min-h-[56px] active:bg-surface-50 transition-colors"
              >
                <div>
                  <span className="font-medium text-surface-900">{section.label}</span>
                  {section.value !== section.options[0].value && (
                    <span className="ml-2 text-sm text-luxury-bronze">
                      {section.options.find(o => o.value === section.value)?.label}
                    </span>
                  )}
                </div>
                <ChevronDown 
                  className={cn(
                    "h-5 w-5 text-surface-400 transition-transform",
                    expandedSection === section.id && "rotate-180"
                  )} 
                />
              </button>

              {/* Section Options */}
              {expandedSection === section.id && (
                <div className="pb-2 px-2">
                  {section.options.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => section.onChange(option.value)}
                      className={cn(
                        "w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-left transition-colors min-h-[48px]",
                        section.value === option.value
                          ? "bg-luxury-champagne/50 text-luxury-bronze"
                          : "text-surface-700 hover:bg-surface-50 active:bg-surface-100"
                      )}
                    >
                      <span className="font-medium">{option.label}</span>
                      {section.value === option.value && (
                        <Check className="h-5 w-5 text-luxury-bronze" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-surface-100 bg-white pb-safe-bottom">
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 h-12 text-base"
              onClick={onClear}
              disabled={activeCount === 0}
            >
              Clear All
            </Button>
            <Button
              className="flex-1 h-12 text-base"
              onClick={handleApply}
            >
              Show Results
              {activeCount > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-white/20 text-sm">
                  {activeCount}
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

// Simplified single-select component for mobile
interface MobileSelectProps {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}

export function MobileSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select...',
}: MobileSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedLabel = options.find(o => o.value === value)?.label || placeholder;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-white border border-surface-200 rounded-xl text-left min-h-[48px] active:bg-surface-50 transition-colors"
      >
        <div>
          <p className="text-xs text-surface-500 mb-0.5">{label}</p>
          <p className="font-medium text-surface-900">{selectedLabel}</p>
        </div>
        <ChevronDown className="h-5 w-5 text-surface-400" />
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-luxury max-h-[60vh] flex flex-col animate-slide-up">
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-12 h-1.5 bg-surface-300 rounded-full" />
            </div>
            <div className="px-4 py-3 border-b border-surface-100">
              <h3 className="text-lg font-semibold text-surface-900">{label}</h3>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain pb-safe-bottom">
              {options.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-4 text-left transition-colors min-h-[56px]",
                    value === option.value
                      ? "bg-luxury-champagne/30"
                      : "active:bg-surface-50"
                  )}
                >
                  <span className={cn(
                    "font-medium",
                    value === option.value ? "text-luxury-bronze" : "text-surface-700"
                  )}>
                    {option.label}
                  </span>
                  {value === option.value && (
                    <Check className="h-5 w-5 text-luxury-bronze" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
