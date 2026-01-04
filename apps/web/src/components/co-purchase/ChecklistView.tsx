'use client';

import { Check, Circle, Clock, Lock, Plus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ChecklistItem {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  assignedMember?: {
    firstName: string;
    lastName: string;
  } | null;
  dueDate?: string | null;
}

interface ChecklistViewProps {
  items: ChecklistItem[];
  canEdit?: boolean;
  onAddItem?: (title: string, category: string) => void;
  onUpdateStatus?: (itemId: string, status: ChecklistItem['status']) => void;
  className?: string;
}

const statusConfig = {
  pending: {
    icon: Circle,
    color: 'text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
  },
  in_progress: {
    icon: Clock,
    color: 'text-blue-500',
    bgColor: 'bg-blue-100 dark:bg-blue-950',
  },
  completed: {
    icon: Check,
    color: 'text-green-500',
    bgColor: 'bg-green-100 dark:bg-green-950',
  },
  blocked: {
    icon: Lock,
    color: 'text-red-500',
    bgColor: 'bg-red-100 dark:bg-red-950',
  },
};

const defaultCategories = [
  'Pre-Approval',
  'Property Search',
  'Due Diligence',
  'Legal',
  'Financing',
  'Closing',
];

export function ChecklistView({
  items,
  canEdit = false,
  onAddItem,
  onUpdateStatus,
  className,
}: ChecklistViewProps) {
  const [newItemTitle, setNewItemTitle] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(defaultCategories[0] ?? 'Other');

  const groupedItems = items.reduce<Record<string, ChecklistItem[]>>(
    (acc, item) => {
      const category = item.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(item);
      return acc;
    },
    {}
  );

  const completedCount = items.filter((item) => item.status === 'completed').length;
  const progressPercent = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

  const handleAddItem = () => {
    if (newItemTitle.trim() && onAddItem) {
      onAddItem(newItemTitle.trim(), selectedCategory);
      setNewItemTitle('');
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Shared Checklist</CardTitle>
            <CardDescription>
              {completedCount} of {items.length} tasks completed
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{progressPercent}%</div>
            <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {canEdit && onAddItem && (
          <div className="flex gap-2">
            <Input
              placeholder="Add a new task..."
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
              className="flex-1"
            />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 border rounded-md bg-background text-sm"
            >
              {defaultCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <Button onClick={handleAddItem} size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}

        {Object.entries(groupedItems).map(([category, categoryItems]) => (
          <div key={category}>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">{category}</h4>
            <div className="space-y-2">
              {categoryItems.map((item) => {
                const config = statusConfig[item.status];

                return (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg transition-colors',
                      config.bgColor
                    )}
                  >
                    <button
                      onClick={() => {
                        if (canEdit && onUpdateStatus) {
                          const nextStatus =
                            item.status === 'pending'
                              ? 'in_progress'
                              : item.status === 'in_progress'
                                ? 'completed'
                                : 'pending';
                          onUpdateStatus(item.id, nextStatus);
                        }
                      }}
                      disabled={!canEdit || item.status === 'blocked'}
                      className={cn(
                        'flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center',
                        item.status === 'completed'
                          ? 'bg-green-500 border-green-500'
                          : 'border-current',
                        config.color,
                        canEdit && item.status !== 'blocked' && 'hover:opacity-70 cursor-pointer'
                      )}
                    >
                      {item.status === 'completed' && <Check className="h-4 w-4 text-white" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          'font-medium',
                          item.status === 'completed' && 'line-through text-muted-foreground'
                        )}
                      >
                        {item.title}
                      </p>
                      {item.description && (
                        <p className="text-sm text-muted-foreground truncate">{item.description}</p>
                      )}
                    </div>
                    {item.assignedMember && (
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs">
                        {item.assignedMember.firstName[0]}
                        {item.assignedMember.lastName[0]}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>No tasks yet. Add your first task to get started.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
