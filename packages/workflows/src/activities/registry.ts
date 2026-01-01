/**
 * Activity Registry
 *
 * Central registry for activity definitions.
 * Activities must be registered before they can be executed.
 */

import type { ActivityDefinition } from '../types';
import type { RegisteredActivity } from './types';

/**
 * Global activity registry.
 * Maps activity names to their definitions.
 */
const activityRegistry = new Map<string, RegisteredActivity>();

/**
 * Register an activity definition.
 * @param activity The activity to register
 * @throws Error if an activity with the same name is already registered
 */
export function registerActivity<TInput, TOutput>(
  activity: ActivityDefinition<TInput, TOutput>
): void {
  if (activityRegistry.has(activity.name)) {
    throw new Error(`Activity '${activity.name}' is already registered`);
  }

  activityRegistry.set(activity.name, {
    definition: activity as ActivityDefinition<unknown, unknown>,
    registeredAt: new Date(),
  });
}

/**
 * Get a registered activity by name.
 * @param name The activity name
 * @returns The activity definition or undefined
 */
export function getActivity(name: string): ActivityDefinition<unknown, unknown> | undefined {
  return activityRegistry.get(name)?.definition;
}

/**
 * Check if an activity is registered.
 * @param name The activity name
 */
export function hasActivity(name: string): boolean {
  return activityRegistry.has(name);
}

/**
 * Get all registered activity names.
 */
export function getActivityNames(): string[] {
  return Array.from(activityRegistry.keys());
}

/**
 * Get all registered activities.
 */
export function getAllActivities(): Map<string, RegisteredActivity> {
  return new Map(activityRegistry);
}

/**
 * Unregister an activity.
 * Primarily used for testing.
 * @param name The activity name
 */
export function unregisterActivity(name: string): boolean {
  return activityRegistry.delete(name);
}

/**
 * Clear all registered activities.
 * Primarily used for testing.
 */
export function clearRegistry(): void {
  activityRegistry.clear();
}

/**
 * Get registry statistics.
 */
export function getRegistryStats(): {
  totalActivities: number;
  activityNames: string[];
} {
  return {
    totalActivities: activityRegistry.size,
    activityNames: getActivityNames(),
  };
}
