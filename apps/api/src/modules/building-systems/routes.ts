import {
  prisma,
  type BuildingSystemType,
  type BuildingSystemStatus,
  type SensorType,
  type SensorStatus,
  type SystemAlertSeverity,
  type SystemAlertStatus,
  type SystemMaintenanceType,
  type SystemMaintenanceStatus,
  type UtilityType,
  type EnergyPeriod,
  type DowntimeReason,
  type DowntimeImpact,
  type RuleOperator,
  type ReadingQuality,
} from '@realriches/database';
import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';

// ============================================================================
// EXPORTED TYPES FOR TESTING
// ============================================================================

export interface BuildingSystem {
  id: string;
  propertyId: string;
  name: string;
  type: BuildingSystemType;
  status: BuildingSystemStatus;
  nextServiceDate?: Date | null;
}

export interface SystemSensor {
  id: string;
  systemId: string;
  name: string;
  type: SensorType;
  status: SensorStatus;
  unit: string;
  minThreshold?: number | null;
  maxThreshold?: number | null;
  currentValue?: number;
}

export interface SystemAlert {
  id: string;
  systemId: string;
  severity: SystemAlertSeverity;
  status: SystemAlertStatus;
  message: string;
  createdAt: Date;
}

export interface MaintenanceSchedule {
  id: string;
  systemId: string;
  type: SystemMaintenanceType;
  status: SystemMaintenanceStatus;
  scheduledDate: Date;
  description?: string;
}

export interface AlertRule {
  id: string;
  propertyId: string;
  name: string;
  isActive: boolean;
  condition: {
    metric: string;
    operator: RuleOperator;
    value: number;
    value2?: number | null;
  };
  severity: SystemAlertSeverity;
  notifications?: {
    channels: string[];
    recipients: string[];
  };
  cooldownMinutes?: number;
  triggerCount?: number;
  createdAt?: string;
  updatedAt?: string;
  // Legacy fields for backwards compatibility
  sensorId?: string;
  operator?: RuleOperator;
  value?: number;
  value2?: number | null;
  message?: string;
}

// Exported Maps for testing
export const buildingSystems = new Map<string, BuildingSystem>();
export const systemSensors = new Map<string, SystemSensor>();
export const systemAlerts = new Map<string, SystemAlert>();
export const maintenanceSchedules = new Map<string, MaintenanceSchedule>();
export const alertRules = new Map<string, AlertRule>();
export const systemDowntimes = new Map<string, { systemId: string; startTime: Date; endTime?: Date; duration?: number }>();

// Sync versions of functions for testing
export function calculateSystemHealthSync(systemId: string): {
  score: number;
  status: 'healthy' | 'degraded' | 'critical';
  factors: string[];
} {
  const system = buildingSystems.get(systemId);

  if (!system) {
    return { score: 0, status: 'critical', factors: ['System not found'] };
  }

  let score = 100;
  const factors: string[] = [];

  if (system.status === 'offline') {
    score -= 50;
    factors.push('System offline');
  } else if (system.status === 'degraded') {
    score -= 20;
    factors.push('System in warning state');
  } else if (system.status === 'critical') {
    score -= 40;
    factors.push('System in critical state');
  }

  if (system.nextServiceDate) {
    const nextMaint = new Date(system.nextServiceDate);
    const now = new Date();
    const daysUntil = Math.floor((nextMaint.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) {
      score -= 20;
      factors.push('Maintenance overdue');
    } else if (daysUntil < 7) {
      score -= 10;
      factors.push('Maintenance due soon');
    }
  }

  const status = score >= 80 ? 'healthy' : score >= 50 ? 'degraded' : 'critical';
  return { score, status, factors };
}

export function getSystemUptimeSync(systemId: string, days: number = 30): {
  uptimePercentage: number;
  totalDowntimeMinutes: number;
  incidents: number;
  mtbf: number;
  mttr: number;
} {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const downtimes = Array.from(systemDowntimes.values()).filter(
    d => d.systemId === systemId && new Date(d.startTime) >= cutoffDate
  );

  const totalMinutes = days * 24 * 60;
  let totalDowntimeMinutes = 0;
  const completedDowntimes: { duration: number }[] = [];

  downtimes.forEach((d) => {
    if (d.duration) {
      totalDowntimeMinutes += d.duration;
      completedDowntimes.push({ duration: d.duration });
    } else if (d.endTime) {
      const duration = Math.floor(
        (new Date(d.endTime).getTime() - new Date(d.startTime).getTime()) / (1000 * 60)
      );
      totalDowntimeMinutes += duration;
      completedDowntimes.push({ duration });
    }
  });

  const uptimeMinutes = totalMinutes - totalDowntimeMinutes;
  const uptimePercentage = Math.round((uptimeMinutes / totalMinutes) * 100 * 100) / 100;

  const incidents = downtimes.length;
  const mtbf = incidents > 0 ? Math.round((uptimeMinutes / 60) / incidents) : totalMinutes / 60;
  const mttr = completedDowntimes.length > 0
    ? Math.round(completedDowntimes.reduce((sum, d) => sum + d.duration, 0) / completedDowntimes.length)
    : 0;

  return { uptimePercentage, totalDowntimeMinutes, incidents, mtbf, mttr };
}

// Export sync versions as main exports
export { calculateSystemHealthSync as calculateSystemHealth };
export { getSystemUptimeSync as getSystemUptime };

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

interface SensorData {
  minThreshold: number | null;
  maxThreshold: number | null;
  name: string;
  unit: string;
  type: SensorType;
}

export function checkThresholds(
  sensor: SensorData,
  value: number
): { isAnomaly: boolean; severity?: SystemAlertSeverity; message?: string } {
  if (sensor.minThreshold !== null && value < sensor.minThreshold) {
    const severity: SystemAlertSeverity = value < sensor.minThreshold * 0.8 ? 'critical' : 'warning';
    return {
      isAnomaly: true,
      severity,
      message: `${sensor.name} below minimum threshold: ${value} ${sensor.unit} (min: ${sensor.minThreshold})`,
    };
  }

  if (sensor.maxThreshold !== null && value > sensor.maxThreshold) {
    const severity: SystemAlertSeverity = value > sensor.maxThreshold * 1.2 ? 'critical' : 'warning';
    return {
      isAnomaly: true,
      severity,
      message: `${sensor.name} above maximum threshold: ${value} ${sensor.unit} (max: ${sensor.maxThreshold})`,
    };
  }

  return { isAnomaly: false };
}

async function calculateSystemHealthAsync(systemId: string): Promise<{
  score: number;
  status: 'healthy' | 'degraded' | 'critical';
  factors: string[];
}> {
  const system = await prisma.buildingSystem.findUnique({
    where: { id: systemId },
  });

  if (!system) {
    return { score: 0, status: 'critical', factors: ['System not found'] };
  }

  let score = 100;
  const factors: string[] = [];

  // Check system status
  if (system.status === 'offline') {
    score -= 50;
    factors.push('System offline');
  } else if (system.status === 'degraded') {
    score -= 20;
    factors.push('System in warning state');
  } else if (system.status === 'critical') {
    score -= 40;
    factors.push('System in critical state');
  }

  // Check maintenance
  if (system.nextServiceDate) {
    const nextMaint = new Date(system.nextServiceDate);
    const now = new Date();
    const daysUntil = Math.floor((nextMaint.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) {
      score -= 20;
      factors.push('Maintenance overdue');
    } else if (daysUntil < 7) {
      score -= 10;
      factors.push('Maintenance due soon');
    }
  }

  // Check warranty
  if (system.warrantyExpiry) {
    const warranty = new Date(system.warrantyExpiry);
    if (warranty < new Date()) {
      score -= 5;
      factors.push('Warranty expired');
    }
  }

  // Check recent alerts
  const activeAlerts = await prisma.systemAlert.findMany({
    where: {
      systemId,
      status: 'active',
    },
  });

  if (activeAlerts.length > 0) {
    const criticalAlerts = activeAlerts.filter((a) => a.severity === 'critical' || a.severity === 'emergency');
    if (criticalAlerts.length > 0) {
      score -= 30;
      factors.push(`${criticalAlerts.length} critical alerts active`);
    } else {
      score -= 10;
      factors.push(`${activeAlerts.length} alerts active`);
    }
  }

  // Check sensors
  const errorSensors = await prisma.systemSensor.count({
    where: {
      systemId,
      status: 'error',
    },
  });

  if (errorSensors > 0) {
    score -= 15;
    factors.push(`${errorSensors} sensors in error state`);
  }

  score = Math.max(0, score);

  let status: 'healthy' | 'degraded' | 'critical';
  if (score >= 80) {
    status = 'healthy';
  } else if (score >= 50) {
    status = 'degraded';
  } else {
    status = 'critical';
  }

  return { score, status, factors };
}

export async function getMaintenanceSummary(propertyId: string): Promise<{
  scheduled: number;
  inProgress: number;
  overdue: number;
  completedThisMonth: number;
  upcomingThisWeek: Awaited<ReturnType<typeof prisma.systemMaintenanceSchedule.findMany>>;
  costThisMonth: number;
}> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [scheduled, inProgress, overdue, completedThisMonth, upcomingThisWeek, completedMaintenance] = await Promise.all([
    prisma.systemMaintenanceSchedule.count({
      where: {
        propertyId,
        status: 'scheduled',
      },
    }),
    prisma.systemMaintenanceSchedule.count({
      where: {
        propertyId,
        status: 'in_progress',
      },
    }),
    prisma.systemMaintenanceSchedule.count({
      where: {
        propertyId,
        status: 'overdue',
      },
    }),
    prisma.systemMaintenanceSchedule.count({
      where: {
        propertyId,
        status: 'completed',
        completedDate: {
          gte: startOfMonth,
        },
      },
    }),
    prisma.systemMaintenanceSchedule.findMany({
      where: {
        propertyId,
        status: 'scheduled',
        scheduledDate: {
          gte: now,
          lte: oneWeekFromNow,
        },
      },
    }),
    prisma.systemMaintenanceSchedule.findMany({
      where: {
        propertyId,
        completedDate: {
          gte: startOfMonth,
        },
        cost: {
          not: null,
        },
      },
      select: {
        cost: true,
      },
    }),
  ]);

  const costThisMonth = completedMaintenance.reduce((sum, m) => sum + (m.cost?.toNumber() || 0), 0);

  return {
    scheduled,
    inProgress,
    overdue,
    completedThisMonth,
    upcomingThisWeek,
    costThisMonth,
  };
}

export async function calculateEnergyStats(
  propertyId: string,
  startDate?: string,
  endDate?: string
): Promise<{
  totalConsumption: Record<string, number>;
  totalCost: number;
  averageDaily: Record<string, number>;
  peakUsage: { date: string; value: number; type: string } | null;
  comparedToPrevious: Record<string, number>;
}> {
  const where: Parameters<typeof prisma.energyUsage.findMany>[0]['where'] = {
    propertyId,
  };

  if (startDate) {
    where.startTime = { gte: new Date(startDate) };
  }
  if (endDate) {
    where.endTime = { lte: new Date(endDate) };
  }

  const usage = await prisma.energyUsage.findMany({ where });

  const totalConsumption: Record<string, number> = {};
  let totalCost = 0;
  let peakUsage: { date: string; value: number; type: string } | null = null;

  usage.forEach((u) => {
    totalConsumption[u.utilityType] = (totalConsumption[u.utilityType] || 0) + u.consumption;
    totalCost += u.cost?.toNumber() || 0;

    if (!peakUsage || u.consumption > peakUsage.value) {
      peakUsage = { date: u.startTime.toISOString(), value: u.consumption, type: u.utilityType };
    }
  });

  // Calculate average daily (simplified)
  const days = usage.length > 0 ? Math.max(1, new Set(usage.map((u) => u.startTime.toISOString().split('T')[0])).size) : 1;
  const averageDaily: Record<string, number> = {};
  Object.entries(totalConsumption).forEach(([type, total]) => {
    averageDaily[type] = Math.round(total / days);
  });

  // Compared to previous (simplified - just return 0 for now)
  const comparedToPrevious: Record<string, number> = {};
  Object.keys(totalConsumption).forEach((type) => {
    comparedToPrevious[type] = 0;
  });

  return {
    totalConsumption,
    totalCost,
    averageDaily,
    peakUsage,
    comparedToPrevious,
  };
}

async function getSystemUptimeAsync(systemId: string, days: number = 30): Promise<{
  uptimePercentage: number;
  totalDowntimeMinutes: number;
  incidents: number;
  mtbf: number; // Mean time between failures (hours)
  mttr: number; // Mean time to repair (minutes)
}> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const downtimes = await prisma.systemDowntime.findMany({
    where: {
      systemId,
      startTime: {
        gte: cutoffDate,
      },
    },
  });

  const totalMinutes = days * 24 * 60;
  let totalDowntimeMinutes = 0;
  const completedDowntimes: { duration: number }[] = [];

  downtimes.forEach((d) => {
    if (d.duration) {
      totalDowntimeMinutes += d.duration;
      completedDowntimes.push({ duration: d.duration });
    } else if (d.endTime) {
      const duration = Math.floor(
        (new Date(d.endTime).getTime() - new Date(d.startTime).getTime()) / (1000 * 60)
      );
      totalDowntimeMinutes += duration;
      completedDowntimes.push({ duration });
    }
  });

  const uptimeMinutes = totalMinutes - totalDowntimeMinutes;
  const uptimePercentage = Math.round((uptimeMinutes / totalMinutes) * 100 * 100) / 100;

  const incidents = downtimes.length;
  const mtbf = incidents > 0 ? Math.round((uptimeMinutes / 60) / incidents) : totalMinutes / 60;
  const mttr = completedDowntimes.length > 0
    ? Math.round(completedDowntimes.reduce((sum, d) => sum + d.duration, 0) / completedDowntimes.length)
    : 0;

  return {
    uptimePercentage,
    totalDowntimeMinutes,
    incidents,
    mtbf,
    mttr,
  };
}

export function evaluateAlertRule(
  ruleOrCondition: AlertRule | { operator: RuleOperator; value: number; value2?: number | null },
  sensorIdOrValue: string | number,
  valueArg?: number
): boolean {
  // Handle both signatures: (rule, sensorId, value) and (condition, value)
  let condition: { operator: RuleOperator; value: number; value2?: number | null };
  let value: number;

  if (typeof sensorIdOrValue === 'number') {
    // Old signature: (condition, value)
    condition = ruleOrCondition as { operator: RuleOperator; value: number; value2?: number | null };
    value = sensorIdOrValue;
  } else {
    // New signature: (rule, sensorId, value)
    const rule = ruleOrCondition as AlertRule;
    condition = rule.condition;
    value = valueArg!;
  }

  switch (condition.operator) {
    case 'gt':
      return value > condition.value;
    case 'lt':
      return value < condition.value;
    case 'eq':
      return value === condition.value;
    case 'gte':
      return value >= condition.value;
    case 'lte':
      return value <= condition.value;
    case 'between':
      return condition.value2 !== null && condition.value2 !== undefined && value >= condition.value && value <= condition.value2;
    case 'outside':
      return condition.value2 !== null && condition.value2 !== undefined && (value < condition.value || value > condition.value2);
    default:
      return false;
  }
}

// ============================================================================
// SCHEMAS
// ============================================================================

const SystemSchema = z.object({
  propertyId: z.string().uuid(),
  name: z.string(),
  type: z.enum(['hvac', 'electrical', 'plumbing', 'elevator', 'fire_safety', 'security', 'lighting', 'water_heater', 'boiler', 'generator', 'solar', 'irrigation', 'chiller', 'other']),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  installDate: z.string().optional(),
  warrantyExpiry: z.string().optional(),
  location: z.string().optional(),
  floor: z.number().int().optional(),
  maintenanceIntervalDays: z.number().int().positive().optional(),
  specifications: z.record(z.unknown()).optional(),
  isAutomated: z.boolean().default(false),
  automationSchedule: z.object({
    dayOfWeek: z.array(z.number().int().min(0).max(6)),
    onTime: z.string(),
    offTime: z.string(),
  }).optional(),
});

const SensorSchema = z.object({
  systemId: z.string().uuid(),
  propertyId: z.string().uuid(),
  name: z.string(),
  type: z.enum(['temperature', 'humidity', 'pressure', 'flow', 'power', 'occupancy', 'smoke', 'co2', 'water_leak', 'motion', 'door_contact', 'vibration']),
  unit: z.string(),
  location: z.string(),
  minThreshold: z.number().optional(),
  maxThreshold: z.number().optional(),
  isWireless: z.boolean().default(false),
  hardwareId: z.string().optional(),
});

const ReadingSchema = z.object({
  sensorId: z.string().uuid(),
  value: z.number(),
  quality: z.enum(['good', 'fair', 'poor', 'invalid']).default('good'),
});

const AlertSchema = z.object({
  propertyId: z.string().uuid(),
  systemId: z.string().uuid().optional(),
  sensorId: z.string().uuid().optional(),
  severity: z.enum(['info', 'warning', 'critical', 'emergency']),
  title: z.string(),
  description: z.string(),
  source: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

const MaintenanceSchema = z.object({
  propertyId: z.string().uuid(),
  systemId: z.string().uuid(),
  type: z.enum(['preventive', 'corrective', 'emergency', 'inspection']),
  title: z.string(),
  description: z.string().optional(),
  scheduledDate: z.string(),
  assignedTo: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  estimatedDuration: z.number().int().positive(),
  parts: z.array(z.object({
    name: z.string(),
    quantity: z.number().int().positive(),
    cost: z.number().nonnegative(),
  })).optional(),
  checklist: z.array(z.object({
    item: z.string(),
    completed: z.boolean(),
  })).optional(),
  recurrence: z.object({
    frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual']),
    interval: z.number().int().positive(),
    endDate: z.string().optional(),
  }).optional(),
});

const EnergyUsageSchema = z.object({
  propertyId: z.string().uuid(),
  systemId: z.string().uuid().optional(),
  utilityType: z.enum(['electricity', 'gas', 'water', 'solar_generation']),
  period: z.enum(['hourly', 'daily', 'monthly']),
  startTime: z.string(),
  endTime: z.string(),
  consumption: z.number().nonnegative(),
  unit: z.string(),
  cost: z.number().nonnegative().optional(),
  peakDemand: z.number().nonnegative().optional(),
  averageLoad: z.number().nonnegative().optional(),
});

const DowntimeSchema = z.object({
  systemId: z.string().uuid(),
  reason: z.enum(['maintenance', 'failure', 'upgrade', 'external', 'unknown']),
  startTime: z.string(),
  impact: z.enum(['none', 'minimal', 'moderate', 'severe', 'critical']),
  affectedUnits: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const AlertRuleSchema = z.object({
  propertyId: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  systemType: z.enum(['hvac', 'electrical', 'plumbing', 'elevator', 'fire_safety', 'security', 'lighting', 'water_heater', 'boiler', 'generator', 'solar', 'irrigation', 'chiller', 'other']).optional(),
  sensorType: z.enum(['temperature', 'humidity', 'pressure', 'flow', 'power', 'occupancy', 'smoke', 'co2', 'water_leak', 'motion', 'door_contact', 'vibration']).optional(),
  condition: z.object({
    metric: z.string(),
    operator: z.enum(['gt', 'lt', 'eq', 'gte', 'lte', 'between', 'outside']),
    value: z.number(),
    value2: z.number().optional(),
    duration: z.number().int().positive().optional(),
  }),
  severity: z.enum(['info', 'warning', 'critical', 'emergency']),
  notifications: z.object({
    channels: z.array(z.enum(['email', 'sms', 'push', 'webhook'])),
    recipients: z.array(z.string()),
    escalationMinutes: z.number().int().positive().optional(),
  }),
  cooldownMinutes: z.number().int().positive().default(15),
});

// ============================================================================
// ROUTES
// ============================================================================

export const buildingSystemRoutes: FastifyPluginAsync = async (app) => {
  // ─────────────────────────────────────────────────────────────────────────
  // SYSTEMS
  // ─────────────────────────────────────────────────────────────────────────

  // Create system
  app.post(
    '/systems',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof SystemSchema> }>,
      reply
    ) => {
      const data = SystemSchema.parse(request.body);

      // Calculate next maintenance date if interval provided
      let nextServiceDate: Date | undefined;
      if (data.maintenanceIntervalDays) {
        const nextMaint = new Date();
        nextMaint.setDate(nextMaint.getDate() + data.maintenanceIntervalDays);
        nextServiceDate = nextMaint;
      }

      const system = await prisma.buildingSystem.create({
        data: {
          propertyId: data.propertyId,
          name: data.name,
          type: data.type as BuildingSystemType,
          status: 'operational',
          manufacturer: data.manufacturer,
          model: data.model,
          serialNumber: data.serialNumber,
          installDate: data.installDate ? new Date(data.installDate) : null,
          warrantyExpiry: data.warrantyExpiry ? new Date(data.warrantyExpiry) : null,
          location: data.location,
          floor: data.floor,
          maintenanceIntervalDays: data.maintenanceIntervalDays,
          operatingHours: 0,
          specifications: data.specifications as object | undefined,
          isAutomated: data.isAutomated,
          automationSchedule: data.automationSchedule as object | undefined,
          nextServiceDate,
        },
      });

      return reply.status(201).send(system);
    }
  );

  // List systems
  app.get(
    '/systems',
    async (
      request: FastifyRequest<{
        Querystring: { propertyId?: string; type?: BuildingSystemType; status?: BuildingSystemStatus };
      }>,
      reply
    ) => {
      const where: Parameters<typeof prisma.buildingSystem.findMany>[0]['where'] = {};

      if (request.query.propertyId) {
        where.propertyId = request.query.propertyId;
      }
      if (request.query.type) {
        where.type = request.query.type;
      }
      if (request.query.status) {
        where.status = request.query.status;
      }

      const systems = await prisma.buildingSystem.findMany({ where });
      return reply.send(systems);
    }
  );

  // Get system by ID
  app.get(
    '/systems/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const system = await prisma.buildingSystem.findUnique({
        where: { id: request.params.id },
      });

      if (!system) {
        return reply.status(404).send({ error: 'System not found' });
      }
      return reply.send(system);
    }
  );

  // Update system status
  app.patch(
    '/systems/:id/status',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { status: BuildingSystemStatus };
      }>,
      reply
    ) => {
      const system = await prisma.buildingSystem.findUnique({
        where: { id: request.params.id },
      });

      if (!system) {
        return reply.status(404).send({ error: 'System not found' });
      }

      const updated = await prisma.buildingSystem.update({
        where: { id: request.params.id },
        data: { status: request.body.status },
      });

      return reply.send(updated);
    }
  );

  // Get system health
  app.get(
    '/systems/:id/health',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const health = await calculateSystemHealthAsync(request.params.id);
      return reply.send(health);
    }
  );

  // Get system uptime
  app.get(
    '/systems/:id/uptime',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { days?: string };
      }>,
      reply
    ) => {
      const days = request.query.days ? parseInt(request.query.days) : 30;
      const uptime = await getSystemUptimeAsync(request.params.id, days);
      return reply.send(uptime);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SENSORS
  // ─────────────────────────────────────────────────────────────────────────

  // Create sensor
  app.post(
    '/sensors',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof SensorSchema> }>,
      reply
    ) => {
      const data = SensorSchema.parse(request.body);

      const sensor = await prisma.systemSensor.create({
        data: {
          systemId: data.systemId,
          propertyId: data.propertyId,
          name: data.name,
          type: data.type as SensorType,
          unit: data.unit,
          location: data.location,
          minThreshold: data.minThreshold,
          maxThreshold: data.maxThreshold,
          status: 'active',
          isWireless: data.isWireless,
          hardwareId: data.hardwareId,
        },
      });

      return reply.status(201).send(sensor);
    }
  );

  // List sensors
  app.get(
    '/sensors',
    async (
      request: FastifyRequest<{
        Querystring: { propertyId?: string; systemId?: string; type?: SensorType; status?: string };
      }>,
      reply
    ) => {
      const where: Parameters<typeof prisma.systemSensor.findMany>[0]['where'] = {};

      if (request.query.propertyId) {
        where.propertyId = request.query.propertyId;
      }
      if (request.query.systemId) {
        where.systemId = request.query.systemId;
      }
      if (request.query.type) {
        where.type = request.query.type;
      }
      if (request.query.status) {
        where.status = request.query.status as SensorStatus;
      }

      const sensors = await prisma.systemSensor.findMany({ where });
      return reply.send(sensors);
    }
  );

  // Record sensor reading
  app.post(
    '/sensors/readings',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof ReadingSchema> }>,
      reply
    ) => {
      const data = ReadingSchema.parse(request.body);
      const now = new Date();

      const sensor = await prisma.systemSensor.findUnique({
        where: { id: data.sensorId },
      });

      if (!sensor) {
        return reply.status(404).send({ error: 'Sensor not found' });
      }

      // Check thresholds
      const thresholdCheck = checkThresholds(sensor, data.value);

      // Create reading
      const reading = await prisma.systemReading.create({
        data: {
          systemId: sensor.systemId,
          sensorId: sensor.id,
          propertyId: sensor.propertyId,
          metricType: sensor.type,
          value: data.value,
          unit: sensor.unit,
          quality: data.quality as ReadingQuality,
          isAnomaly: thresholdCheck.isAnomaly,
          recordedAt: now,
        },
      });

      // Update sensor
      await prisma.systemSensor.update({
        where: { id: sensor.id },
        data: {
          currentValue: data.value,
          lastReading: now,
        },
      });

      // Create alert if anomaly detected
      if (thresholdCheck.isAnomaly && thresholdCheck.severity) {
        await prisma.systemAlert.create({
          data: {
            propertyId: sensor.propertyId,
            systemId: sensor.systemId,
            sensorId: sensor.id,
            severity: thresholdCheck.severity,
            status: 'active',
            alertType: 'threshold',
            title: `${sensor.type} threshold exceeded`,
            message: thresholdCheck.message || 'Threshold exceeded',
            source: 'sensor',
            triggeredAt: now,
            autoResolved: false,
            notificationsSent: [],
          },
        });
      }

      return reply.status(201).send(reading);
    }
  );

  // Get sensor readings
  app.get(
    '/sensors/:id/readings',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { startDate?: string; endDate?: string; limit?: string };
      }>,
      reply
    ) => {
      const where: Parameters<typeof prisma.systemReading.findMany>[0]['where'] = {
        sensorId: request.params.id,
      };

      if (request.query.startDate || request.query.endDate) {
        where.recordedAt = {
          ...(request.query.startDate && { gte: new Date(request.query.startDate) }),
          ...(request.query.endDate && { lte: new Date(request.query.endDate) }),
        };
      }

      const readings = await prisma.systemReading.findMany({
        where,
        orderBy: { recordedAt: 'desc' },
        take: request.query.limit ? parseInt(request.query.limit) : undefined,
      });

      return reply.send(readings);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // ALERTS
  // ─────────────────────────────────────────────────────────────────────────

  // Create alert
  app.post(
    '/alerts',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof AlertSchema> }>,
      reply
    ) => {
      const data = AlertSchema.parse(request.body);
      const now = new Date();

      const alert = await prisma.systemAlert.create({
        data: {
          propertyId: data.propertyId,
          systemId: data.systemId,
          sensorId: data.sensorId,
          severity: data.severity as SystemAlertSeverity,
          status: 'active',
          alertType: 'manual',
          title: data.title,
          message: data.description,
          source: data.source,
          triggeredAt: now,
          autoResolved: false,
          notificationsSent: [],
          metadata: data.metadata as object | undefined,
        },
      });

      return reply.status(201).send(alert);
    }
  );

  // List alerts
  app.get(
    '/alerts',
    async (
      request: FastifyRequest<{
        Querystring: {
          propertyId?: string;
          systemId?: string;
          severity?: SystemAlertSeverity;
          status?: SystemAlertStatus;
          startDate?: string;
          endDate?: string;
        };
      }>,
      reply
    ) => {
      const where: Parameters<typeof prisma.systemAlert.findMany>[0]['where'] = {};

      if (request.query.propertyId) {
        where.propertyId = request.query.propertyId;
      }
      if (request.query.systemId) {
        where.systemId = request.query.systemId;
      }
      if (request.query.severity) {
        where.severity = request.query.severity;
      }
      if (request.query.status) {
        where.status = request.query.status;
      }
      if (request.query.startDate || request.query.endDate) {
        where.triggeredAt = {
          ...(request.query.startDate && { gte: new Date(request.query.startDate) }),
          ...(request.query.endDate && { lte: new Date(request.query.endDate) }),
        };
      }

      const alerts = await prisma.systemAlert.findMany({
        where,
        orderBy: { triggeredAt: 'desc' },
      });

      return reply.send(alerts);
    }
  );

  // Acknowledge alert
  app.post(
    '/alerts/:id/acknowledge',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { acknowledgedBy: string };
      }>,
      reply
    ) => {
      const alert = await prisma.systemAlert.findUnique({
        where: { id: request.params.id },
      });

      if (!alert) {
        return reply.status(404).send({ error: 'Alert not found' });
      }

      const updated = await prisma.systemAlert.update({
        where: { id: request.params.id },
        data: {
          status: 'acknowledged',
          acknowledgedAt: new Date(),
          acknowledgedBy: request.body.acknowledgedBy,
        },
      });

      return reply.send(updated);
    }
  );

  // Resolve alert
  app.post(
    '/alerts/:id/resolve',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { resolvedBy: string; resolution: string };
      }>,
      reply
    ) => {
      const alert = await prisma.systemAlert.findUnique({
        where: { id: request.params.id },
      });

      if (!alert) {
        return reply.status(404).send({ error: 'Alert not found' });
      }

      const updated = await prisma.systemAlert.update({
        where: { id: request.params.id },
        data: {
          status: 'resolved',
          resolvedAt: new Date(),
          resolvedBy: request.body.resolvedBy,
          resolution: request.body.resolution,
        },
      });

      return reply.send(updated);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // MAINTENANCE
  // ─────────────────────────────────────────────────────────────────────────

  // Create maintenance
  app.post(
    '/maintenance',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof MaintenanceSchema> }>,
      reply
    ) => {
      const data = MaintenanceSchema.parse(request.body);

      const maintenance = await prisma.systemMaintenanceSchedule.create({
        data: {
          propertyId: data.propertyId,
          systemId: data.systemId,
          type: data.type as SystemMaintenanceType,
          status: 'scheduled',
          title: data.title,
          description: data.description,
          scheduledDate: new Date(data.scheduledDate),
          assignedTo: data.assignedTo,
          vendorId: data.vendorId,
          estimatedDuration: data.estimatedDuration,
          parts: data.parts,
          checklist: data.checklist,
          recurrence: data.recurrence,
        },
      });

      return reply.status(201).send(maintenance);
    }
  );

  // List maintenance
  app.get(
    '/maintenance',
    async (
      request: FastifyRequest<{
        Querystring: {
          propertyId?: string;
          systemId?: string;
          type?: SystemMaintenanceType;
          status?: SystemMaintenanceStatus;
          startDate?: string;
          endDate?: string;
        };
      }>,
      reply
    ) => {
      const where: Parameters<typeof prisma.systemMaintenanceSchedule.findMany>[0]['where'] = {};

      if (request.query.propertyId) {
        where.propertyId = request.query.propertyId;
      }
      if (request.query.systemId) {
        where.systemId = request.query.systemId;
      }
      if (request.query.type) {
        where.type = request.query.type;
      }
      if (request.query.status) {
        where.status = request.query.status;
      }
      if (request.query.startDate || request.query.endDate) {
        where.scheduledDate = {
          ...(request.query.startDate && { gte: new Date(request.query.startDate) }),
          ...(request.query.endDate && { lte: new Date(request.query.endDate) }),
        };
      }

      const maintenance = await prisma.systemMaintenanceSchedule.findMany({ where });
      return reply.send(maintenance);
    }
  );

  // Get maintenance summary
  app.get(
    '/maintenance/summary',
    async (
      request: FastifyRequest<{ Querystring: { propertyId: string } }>,
      reply
    ) => {
      const summary = await getMaintenanceSummary(request.query.propertyId);
      return reply.send(summary);
    }
  );

  // Start maintenance
  app.post(
    '/maintenance/:id/start',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const maintenance = await prisma.systemMaintenanceSchedule.findUnique({
        where: { id: request.params.id },
      });

      if (!maintenance) {
        return reply.status(404).send({ error: 'Maintenance not found' });
      }

      // Update maintenance status
      const updated = await prisma.systemMaintenanceSchedule.update({
        where: { id: request.params.id },
        data: { status: 'in_progress' },
      });

      // Update system status
      await prisma.buildingSystem.update({
        where: { id: maintenance.systemId },
        data: { status: 'maintenance' },
      });

      return reply.send(updated);
    }
  );

  // Complete maintenance
  app.post(
    '/maintenance/:id/complete',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { actualDuration?: number; cost?: number; notes?: string };
      }>,
      reply
    ) => {
      const maintenance = await prisma.systemMaintenanceSchedule.findUnique({
        where: { id: request.params.id },
      });

      if (!maintenance) {
        return reply.status(404).send({ error: 'Maintenance not found' });
      }

      const now = new Date();

      // Update maintenance
      const updated = await prisma.systemMaintenanceSchedule.update({
        where: { id: request.params.id },
        data: {
          status: 'completed',
          completedDate: now,
          actualDuration: request.body.actualDuration,
          cost: request.body.cost,
          notes: request.body.notes,
        },
      });

      // Update system
      const system = await prisma.buildingSystem.findUnique({
        where: { id: maintenance.systemId },
      });

      if (system) {
        let nextServiceDate: Date | undefined;
        if (system.maintenanceIntervalDays) {
          const nextMaint = new Date();
          nextMaint.setDate(nextMaint.getDate() + system.maintenanceIntervalDays);
          nextServiceDate = nextMaint;
        }

        await prisma.buildingSystem.update({
          where: { id: maintenance.systemId },
          data: {
            status: 'operational',
            lastServiceDate: now,
            nextServiceDate,
          },
        });
      }

      return reply.send(updated);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // ENERGY USAGE
  // ─────────────────────────────────────────────────────────────────────────

  // Record energy usage
  app.post(
    '/energy',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof EnergyUsageSchema> }>,
      reply
    ) => {
      const data = EnergyUsageSchema.parse(request.body);

      const usage = await prisma.energyUsage.create({
        data: {
          propertyId: data.propertyId,
          systemId: data.systemId,
          utilityType: data.utilityType as UtilityType,
          period: data.period as EnergyPeriod,
          startTime: new Date(data.startTime),
          endTime: new Date(data.endTime),
          consumption: data.consumption,
          unit: data.unit,
          cost: data.cost,
          peakDemand: data.peakDemand,
          averageLoad: data.averageLoad,
        },
      });

      return reply.status(201).send(usage);
    }
  );

  // Get energy stats
  app.get(
    '/energy/stats',
    async (
      request: FastifyRequest<{
        Querystring: { propertyId: string; startDate?: string; endDate?: string };
      }>,
      reply
    ) => {
      const stats = await calculateEnergyStats(
        request.query.propertyId,
        request.query.startDate,
        request.query.endDate
      );
      return reply.send(stats);
    }
  );

  // List energy usage
  app.get(
    '/energy',
    async (
      request: FastifyRequest<{
        Querystring: {
          propertyId?: string;
          systemId?: string;
          utilityType?: UtilityType;
          period?: EnergyPeriod;
          startDate?: string;
          endDate?: string;
        };
      }>,
      reply
    ) => {
      const where: Parameters<typeof prisma.energyUsage.findMany>[0]['where'] = {};

      if (request.query.propertyId) {
        where.propertyId = request.query.propertyId;
      }
      if (request.query.systemId) {
        where.systemId = request.query.systemId;
      }
      if (request.query.utilityType) {
        where.utilityType = request.query.utilityType;
      }
      if (request.query.period) {
        where.period = request.query.period;
      }
      if (request.query.startDate) {
        where.startTime = { gte: new Date(request.query.startDate) };
      }
      if (request.query.endDate) {
        where.endTime = { lte: new Date(request.query.endDate) };
      }

      const usage = await prisma.energyUsage.findMany({ where });
      return reply.send(usage);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // DOWNTIME
  // ─────────────────────────────────────────────────────────────────────────

  // Record downtime start
  app.post(
    '/downtime',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof DowntimeSchema> }>,
      reply
    ) => {
      const data = DowntimeSchema.parse(request.body);

      const system = await prisma.buildingSystem.findUnique({
        where: { id: data.systemId },
      });

      if (!system) {
        return reply.status(404).send({ error: 'System not found' });
      }

      const downtime = await prisma.systemDowntime.create({
        data: {
          systemId: data.systemId,
          propertyId: system.propertyId,
          reason: data.reason as DowntimeReason,
          startTime: new Date(data.startTime),
          impact: data.impact as DowntimeImpact,
          affectedUnits: data.affectedUnits || [],
          notes: data.notes,
        },
      });

      // Update system status
      await prisma.buildingSystem.update({
        where: { id: data.systemId },
        data: { status: 'offline' },
      });

      return reply.status(201).send(downtime);
    }
  );

  // End downtime
  app.post(
    '/downtime/:id/end',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { notes?: string };
      }>,
      reply
    ) => {
      const downtime = await prisma.systemDowntime.findUnique({
        where: { id: request.params.id },
      });

      if (!downtime) {
        return reply.status(404).send({ error: 'Downtime record not found' });
      }

      const now = new Date();
      const duration = Math.floor(
        (now.getTime() - new Date(downtime.startTime).getTime()) / (1000 * 60)
      );

      const updated = await prisma.systemDowntime.update({
        where: { id: request.params.id },
        data: {
          endTime: now,
          duration,
          notes: request.body.notes || downtime.notes,
        },
      });

      // Restore system status
      await prisma.buildingSystem.update({
        where: { id: downtime.systemId },
        data: { status: 'operational' },
      });

      return reply.send(updated);
    }
  );

  // List downtime
  app.get(
    '/downtime',
    async (
      request: FastifyRequest<{
        Querystring: { systemId?: string; propertyId?: string; reason?: DowntimeReason; startDate?: string; endDate?: string };
      }>,
      reply
    ) => {
      const where: Parameters<typeof prisma.systemDowntime.findMany>[0]['where'] = {};

      if (request.query.systemId) {
        where.systemId = request.query.systemId;
      }
      if (request.query.propertyId) {
        where.propertyId = request.query.propertyId;
      }
      if (request.query.reason) {
        where.reason = request.query.reason;
      }
      if (request.query.startDate || request.query.endDate) {
        where.startTime = {
          ...(request.query.startDate && { gte: new Date(request.query.startDate) }),
          ...(request.query.endDate && { lte: new Date(request.query.endDate) }),
        };
      }

      const downtimes = await prisma.systemDowntime.findMany({ where });
      return reply.send(downtimes);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // ALERT RULES
  // ─────────────────────────────────────────────────────────────────────────

  // Create alert rule
  app.post(
    '/alert-rules',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof AlertRuleSchema> }>,
      reply
    ) => {
      const data = AlertRuleSchema.parse(request.body);

      const rule = await prisma.alertRule.create({
        data: {
          propertyId: data.propertyId,
          name: data.name,
          description: data.description,
          isActive: true,
          systemType: data.systemType as BuildingSystemType | undefined,
          sensorType: data.sensorType as SensorType | undefined,
          conditionMetric: data.condition.metric,
          conditionOperator: data.condition.operator as RuleOperator,
          conditionValue: data.condition.value,
          conditionValue2: data.condition.value2,
          conditionDuration: data.condition.duration,
          severity: data.severity as SystemAlertSeverity,
          notifyChannels: data.notifications.channels,
          notifyRecipients: data.notifications.recipients,
          escalationMinutes: data.notifications.escalationMinutes,
          cooldownMinutes: data.cooldownMinutes,
          triggerCount: 0,
        },
      });

      return reply.status(201).send(rule);
    }
  );

  // List alert rules
  app.get(
    '/alert-rules',
    async (
      request: FastifyRequest<{
        Querystring: { propertyId?: string; isActive?: string };
      }>,
      reply
    ) => {
      const where: Parameters<typeof prisma.alertRule.findMany>[0]['where'] = {};

      if (request.query.propertyId) {
        where.propertyId = request.query.propertyId;
      }
      if (request.query.isActive !== undefined) {
        where.isActive = request.query.isActive === 'true';
      }

      const rules = await prisma.alertRule.findMany({ where });
      return reply.send(rules);
    }
  );

  // Toggle alert rule
  app.post(
    '/alert-rules/:id/toggle',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const rule = await prisma.alertRule.findUnique({
        where: { id: request.params.id },
      });

      if (!rule) {
        return reply.status(404).send({ error: 'Alert rule not found' });
      }

      const updated = await prisma.alertRule.update({
        where: { id: request.params.id },
        data: { isActive: !rule.isActive },
      });

      return reply.send(updated);
    }
  );

  // Delete alert rule
  app.delete(
    '/alert-rules/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const rule = await prisma.alertRule.findUnique({
        where: { id: request.params.id },
      });

      if (!rule) {
        return reply.status(404).send({ error: 'Alert rule not found' });
      }

      await prisma.alertRule.delete({
        where: { id: request.params.id },
      });

      return reply.send({ message: 'Alert rule deleted' });
    }
  );
};
