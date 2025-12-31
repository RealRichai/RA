import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';

// ============================================================================
// TYPES
// ============================================================================

type SystemType = 'hvac' | 'electrical' | 'plumbing' | 'elevator' | 'fire_safety' | 'security' | 'lighting' | 'water_heater' | 'boiler' | 'generator' | 'solar' | 'irrigation';
type SystemStatus = 'online' | 'offline' | 'warning' | 'critical' | 'maintenance';
type AlertSeverity = 'info' | 'warning' | 'critical' | 'emergency';
type AlertStatus = 'active' | 'acknowledged' | 'resolved' | 'escalated';
type MaintenanceType = 'preventive' | 'corrective' | 'emergency' | 'inspection';
type MaintenanceStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'overdue';
type SensorType = 'temperature' | 'humidity' | 'pressure' | 'flow' | 'power' | 'occupancy' | 'smoke' | 'co2' | 'water_leak' | 'motion' | 'door_contact' | 'vibration';

export interface BuildingSystem {
  id: string;
  propertyId: string;
  name: string;
  type: SystemType;
  status: SystemStatus;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  installDate?: string;
  warrantyExpiry?: string;
  location: string;
  floor?: number;
  lastMaintenanceDate?: string;
  nextMaintenanceDate?: string;
  maintenanceIntervalDays?: number;
  operatingHours: number;
  specifications?: Record<string, unknown>;
  isAutomated: boolean;
  automationSchedule?: {
    dayOfWeek: number[];
    onTime: string;
    offTime: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface SystemSensor {
  id: string;
  systemId: string;
  propertyId: string;
  name: string;
  type: SensorType;
  unit: string;
  location: string;
  minThreshold?: number;
  maxThreshold?: number;
  currentValue?: number;
  lastReading?: string;
  status: 'active' | 'inactive' | 'error' | 'calibrating';
  batteryLevel?: number;
  isWireless: boolean;
  hardwareId?: string;
  calibrationDate?: string;
  nextCalibrationDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SensorReading {
  id: string;
  sensorId: string;
  value: number;
  unit: string;
  quality: 'good' | 'fair' | 'poor' | 'invalid';
  isAnomaly: boolean;
  recordedAt: string;
}

export interface SystemAlert {
  id: string;
  propertyId: string;
  systemId?: string;
  sensorId?: string;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  description: string;
  source: string;
  triggeredAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
  escalatedAt?: string;
  escalatedTo?: string;
  autoResolved: boolean;
  notificationsSent: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceSchedule {
  id: string;
  propertyId: string;
  systemId: string;
  type: MaintenanceType;
  status: MaintenanceStatus;
  title: string;
  description?: string;
  scheduledDate: string;
  completedDate?: string;
  assignedTo?: string;
  vendorId?: string;
  estimatedDuration: number; // minutes
  actualDuration?: number;
  cost?: number;
  parts?: { name: string; quantity: number; cost: number }[];
  checklist?: { item: string; completed: boolean }[];
  notes?: string;
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
    interval: number;
    endDate?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface EnergyUsage {
  id: string;
  propertyId: string;
  systemId?: string;
  utilityType: 'electricity' | 'gas' | 'water' | 'solar_generation';
  period: 'hourly' | 'daily' | 'monthly';
  startTime: string;
  endTime: string;
  consumption: number;
  unit: string;
  cost?: number;
  peakDemand?: number;
  averageLoad?: number;
  createdAt: string;
}

export interface SystemDowntime {
  id: string;
  systemId: string;
  propertyId: string;
  reason: 'maintenance' | 'failure' | 'upgrade' | 'external' | 'unknown';
  startTime: string;
  endTime?: string;
  duration?: number; // minutes
  impact: 'none' | 'minimal' | 'moderate' | 'severe' | 'critical';
  affectedUnits?: string[];
  notes?: string;
  createdAt: string;
}

export interface AlertRule {
  id: string;
  propertyId: string;
  name: string;
  description?: string;
  isActive: boolean;
  systemType?: SystemType;
  sensorType?: SensorType;
  condition: {
    metric: string;
    operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'between' | 'outside';
    value: number;
    value2?: number; // For between/outside
    duration?: number; // seconds
  };
  severity: AlertSeverity;
  notifications: {
    channels: ('email' | 'sms' | 'push' | 'webhook')[];
    recipients: string[];
    escalationMinutes?: number;
  };
  cooldownMinutes: number;
  lastTriggeredAt?: string;
  triggerCount: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// IN-MEMORY STORES
// ============================================================================

export const buildingSystems = new Map<string, BuildingSystem>();
export const systemSensors = new Map<string, SystemSensor>();
export const sensorReadings = new Map<string, SensorReading>();
export const systemAlerts = new Map<string, SystemAlert>();
export const maintenanceSchedules = new Map<string, MaintenanceSchedule>();
export const energyUsages = new Map<string, EnergyUsage>();
export const systemDowntimes = new Map<string, SystemDowntime>();
export const alertRules = new Map<string, AlertRule>();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function checkThresholds(
  sensor: SystemSensor,
  value: number
): { isAnomaly: boolean; severity?: AlertSeverity; message?: string } {
  if (sensor.minThreshold !== undefined && value < sensor.minThreshold) {
    const severity = value < sensor.minThreshold * 0.8 ? 'critical' : 'warning';
    return {
      isAnomaly: true,
      severity,
      message: `${sensor.name} below minimum threshold: ${value} ${sensor.unit} (min: ${sensor.minThreshold})`,
    };
  }

  if (sensor.maxThreshold !== undefined && value > sensor.maxThreshold) {
    const severity = value > sensor.maxThreshold * 1.2 ? 'critical' : 'warning';
    return {
      isAnomaly: true,
      severity,
      message: `${sensor.name} above maximum threshold: ${value} ${sensor.unit} (max: ${sensor.maxThreshold})`,
    };
  }

  return { isAnomaly: false };
}

export function calculateSystemHealth(systemId: string): {
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

  // Check system status
  if (system.status === 'offline') {
    score -= 50;
    factors.push('System offline');
  } else if (system.status === 'warning') {
    score -= 20;
    factors.push('System in warning state');
  } else if (system.status === 'critical') {
    score -= 40;
    factors.push('System in critical state');
  }

  // Check maintenance
  if (system.nextMaintenanceDate) {
    const nextMaint = new Date(system.nextMaintenanceDate);
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
  const recentAlerts = Array.from(systemAlerts.values()).filter(
    (a) => a.systemId === systemId && a.status === 'active'
  );

  if (recentAlerts.length > 0) {
    const criticalAlerts = recentAlerts.filter((a) => a.severity === 'critical' || a.severity === 'emergency');
    if (criticalAlerts.length > 0) {
      score -= 30;
      factors.push(`${criticalAlerts.length} critical alerts active`);
    } else {
      score -= 10;
      factors.push(`${recentAlerts.length} alerts active`);
    }
  }

  // Check sensors
  const sensors = Array.from(systemSensors.values()).filter((s) => s.systemId === systemId);
  const errorSensors = sensors.filter((s) => s.status === 'error');
  if (errorSensors.length > 0) {
    score -= 15;
    factors.push(`${errorSensors.length} sensors in error state`);
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

export function getMaintenanceSummary(propertyId: string): {
  scheduled: number;
  inProgress: number;
  overdue: number;
  completedThisMonth: number;
  upcomingThisWeek: MaintenanceSchedule[];
  costThisMonth: number;
} {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const maintenance = Array.from(maintenanceSchedules.values()).filter(
    (m) => {
      const system = buildingSystems.get(m.systemId);
      return system?.propertyId === propertyId;
    }
  );

  const scheduled = maintenance.filter((m) => m.status === 'scheduled').length;
  const inProgress = maintenance.filter((m) => m.status === 'in_progress').length;
  const overdue = maintenance.filter((m) => m.status === 'overdue').length;

  const completedThisMonth = maintenance.filter(
    (m) => m.status === 'completed' && m.completedDate && m.completedDate >= startOfMonth.toISOString()
  ).length;

  const upcomingThisWeek = maintenance.filter(
    (m) => m.status === 'scheduled' && m.scheduledDate >= now.toISOString() && m.scheduledDate <= oneWeekFromNow.toISOString()
  );

  const costThisMonth = maintenance
    .filter((m) => m.completedDate && m.completedDate >= startOfMonth.toISOString() && m.cost)
    .reduce((sum, m) => sum + (m.cost || 0), 0);

  return {
    scheduled,
    inProgress,
    overdue,
    completedThisMonth,
    upcomingThisWeek,
    costThisMonth,
  };
}

export function calculateEnergyStats(
  propertyId: string,
  startDate?: string,
  endDate?: string
): {
  totalConsumption: Record<string, number>;
  totalCost: number;
  averageDaily: Record<string, number>;
  peakUsage: { date: string; value: number; type: string } | null;
  comparedToPrevious: Record<string, number>;
} {
  let usage = Array.from(energyUsages.values()).filter(
    (u) => u.propertyId === propertyId
  );

  if (startDate) {
    usage = usage.filter((u) => u.startTime >= startDate);
  }
  if (endDate) {
    usage = usage.filter((u) => u.endTime <= endDate);
  }

  const totalConsumption: Record<string, number> = {};
  let totalCost = 0;
  let peakUsage: { date: string; value: number; type: string } | null = null;

  usage.forEach((u) => {
    totalConsumption[u.utilityType] = (totalConsumption[u.utilityType] || 0) + u.consumption;
    totalCost += u.cost || 0;

    if (!peakUsage || u.consumption > peakUsage.value) {
      peakUsage = { date: u.startTime, value: u.consumption, type: u.utilityType };
    }
  });

  // Calculate average daily (simplified)
  const days = usage.length > 0 ? Math.max(1, new Set(usage.map((u) => u.startTime.split('T')[0])).size) : 1;
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

export function getSystemUptime(systemId: string, days: number = 30): {
  uptimePercentage: number;
  totalDowntimeMinutes: number;
  incidents: number;
  mtbf: number; // Mean time between failures (hours)
  mttr: number; // Mean time to repair (minutes)
} {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const downtimes = Array.from(systemDowntimes.values()).filter(
    (d) => d.systemId === systemId && d.startTime >= cutoffDate.toISOString()
  );

  const totalMinutes = days * 24 * 60;
  let totalDowntimeMinutes = 0;
  const completedDowntimes: SystemDowntime[] = [];

  downtimes.forEach((d) => {
    if (d.duration) {
      totalDowntimeMinutes += d.duration;
      completedDowntimes.push(d);
    } else if (d.endTime) {
      const duration = Math.floor(
        (new Date(d.endTime).getTime() - new Date(d.startTime).getTime()) / (1000 * 60)
      );
      totalDowntimeMinutes += duration;
      completedDowntimes.push({ ...d, duration });
    }
  });

  const uptimeMinutes = totalMinutes - totalDowntimeMinutes;
  const uptimePercentage = Math.round((uptimeMinutes / totalMinutes) * 100 * 100) / 100;

  const incidents = downtimes.length;
  const mtbf = incidents > 0 ? Math.round((uptimeMinutes / 60) / incidents) : totalMinutes / 60;
  const mttr = completedDowntimes.length > 0
    ? Math.round(completedDowntimes.reduce((sum, d) => sum + (d.duration || 0), 0) / completedDowntimes.length)
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
  rule: AlertRule,
  sensorId: string,
  value: number
): boolean {
  const { condition } = rule;

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
      return condition.value2 !== undefined && value >= condition.value && value <= condition.value2;
    case 'outside':
      return condition.value2 !== undefined && (value < condition.value || value > condition.value2);
    default:
      return false;
  }
}

// ============================================================================
// SCHEMAS
// ============================================================================

const SystemSchema = z.object({
  propertyId: z.string(),
  name: z.string(),
  type: z.enum(['hvac', 'electrical', 'plumbing', 'elevator', 'fire_safety', 'security', 'lighting', 'water_heater', 'boiler', 'generator', 'solar', 'irrigation']),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  installDate: z.string().optional(),
  warrantyExpiry: z.string().optional(),
  location: z.string(),
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
  systemId: z.string(),
  propertyId: z.string(),
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
  sensorId: z.string(),
  value: z.number(),
  quality: z.enum(['good', 'fair', 'poor', 'invalid']).default('good'),
});

const AlertSchema = z.object({
  propertyId: z.string(),
  systemId: z.string().optional(),
  sensorId: z.string().optional(),
  severity: z.enum(['info', 'warning', 'critical', 'emergency']),
  title: z.string(),
  description: z.string(),
  source: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

const MaintenanceSchema = z.object({
  propertyId: z.string(),
  systemId: z.string(),
  type: z.enum(['preventive', 'corrective', 'emergency', 'inspection']),
  title: z.string(),
  description: z.string().optional(),
  scheduledDate: z.string(),
  assignedTo: z.string().optional(),
  vendorId: z.string().optional(),
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
  propertyId: z.string(),
  systemId: z.string().optional(),
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
  systemId: z.string(),
  reason: z.enum(['maintenance', 'failure', 'upgrade', 'external', 'unknown']),
  startTime: z.string(),
  impact: z.enum(['none', 'minimal', 'moderate', 'severe', 'critical']),
  affectedUnits: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const AlertRuleSchema = z.object({
  propertyId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  systemType: z.enum(['hvac', 'electrical', 'plumbing', 'elevator', 'fire_safety', 'security', 'lighting', 'water_heater', 'boiler', 'generator', 'solar', 'irrigation']).optional(),
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
      const now = new Date().toISOString();

      const system: BuildingSystem = {
        id: `sys_${Date.now()}`,
        ...data,
        status: 'online',
        operatingHours: 0,
        createdAt: now,
        updatedAt: now,
      };

      // Calculate next maintenance date if interval provided
      if (data.maintenanceIntervalDays) {
        const nextMaint = new Date();
        nextMaint.setDate(nextMaint.getDate() + data.maintenanceIntervalDays);
        system.nextMaintenanceDate = nextMaint.toISOString().split('T')[0];
      }

      buildingSystems.set(system.id, system);
      return reply.status(201).send(system);
    }
  );

  // List systems
  app.get(
    '/systems',
    async (
      request: FastifyRequest<{
        Querystring: { propertyId?: string; type?: SystemType; status?: SystemStatus };
      }>,
      reply
    ) => {
      let systems = Array.from(buildingSystems.values());

      if (request.query.propertyId) {
        systems = systems.filter((s) => s.propertyId === request.query.propertyId);
      }
      if (request.query.type) {
        systems = systems.filter((s) => s.type === request.query.type);
      }
      if (request.query.status) {
        systems = systems.filter((s) => s.status === request.query.status);
      }

      return reply.send(systems);
    }
  );

  // Get system by ID
  app.get(
    '/systems/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const system = buildingSystems.get(request.params.id);
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
        Body: { status: SystemStatus };
      }>,
      reply
    ) => {
      const system = buildingSystems.get(request.params.id);
      if (!system) {
        return reply.status(404).send({ error: 'System not found' });
      }

      system.status = request.body.status;
      system.updatedAt = new Date().toISOString();

      buildingSystems.set(system.id, system);
      return reply.send(system);
    }
  );

  // Get system health
  app.get(
    '/systems/:id/health',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const health = calculateSystemHealth(request.params.id);
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
      const uptime = getSystemUptime(request.params.id, days);
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
      const now = new Date().toISOString();

      const sensor: SystemSensor = {
        id: `sen_${Date.now()}`,
        ...data,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };

      systemSensors.set(sensor.id, sensor);
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
      let sensors = Array.from(systemSensors.values());

      if (request.query.propertyId) {
        sensors = sensors.filter((s) => s.propertyId === request.query.propertyId);
      }
      if (request.query.systemId) {
        sensors = sensors.filter((s) => s.systemId === request.query.systemId);
      }
      if (request.query.type) {
        sensors = sensors.filter((s) => s.type === request.query.type);
      }
      if (request.query.status) {
        sensors = sensors.filter((s) => s.status === request.query.status);
      }

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
      const now = new Date().toISOString();

      const sensor = systemSensors.get(data.sensorId);
      if (!sensor) {
        return reply.status(404).send({ error: 'Sensor not found' });
      }

      // Check thresholds
      const thresholdCheck = checkThresholds(sensor, data.value);

      const reading: SensorReading = {
        id: `srd_${Date.now()}`,
        sensorId: data.sensorId,
        value: data.value,
        unit: sensor.unit,
        quality: data.quality,
        isAnomaly: thresholdCheck.isAnomaly,
        recordedAt: now,
      };

      // Update sensor
      sensor.currentValue = data.value;
      sensor.lastReading = now;
      sensor.updatedAt = now;
      systemSensors.set(sensor.id, sensor);

      sensorReadings.set(reading.id, reading);

      // Create alert if anomaly detected
      if (thresholdCheck.isAnomaly && thresholdCheck.severity) {
        const alert: SystemAlert = {
          id: `alt_${Date.now()}`,
          propertyId: sensor.propertyId,
          systemId: sensor.systemId,
          sensorId: sensor.id,
          severity: thresholdCheck.severity,
          status: 'active',
          title: `${sensor.type} threshold exceeded`,
          description: thresholdCheck.message || 'Threshold exceeded',
          source: 'sensor',
          triggeredAt: now,
          autoResolved: false,
          notificationsSent: [],
          createdAt: now,
          updatedAt: now,
        };

        systemAlerts.set(alert.id, alert);
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
      let readings = Array.from(sensorReadings.values()).filter(
        (r) => r.sensorId === request.params.id
      );

      if (request.query.startDate) {
        readings = readings.filter((r) => r.recordedAt >= request.query.startDate!);
      }
      if (request.query.endDate) {
        readings = readings.filter((r) => r.recordedAt <= request.query.endDate!);
      }

      readings = readings.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));

      if (request.query.limit) {
        readings = readings.slice(0, parseInt(request.query.limit));
      }

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
      const now = new Date().toISOString();

      const alert: SystemAlert = {
        id: `alt_${Date.now()}`,
        ...data,
        status: 'active',
        triggeredAt: now,
        autoResolved: false,
        notificationsSent: [],
        createdAt: now,
        updatedAt: now,
      };

      systemAlerts.set(alert.id, alert);
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
          severity?: AlertSeverity;
          status?: AlertStatus;
          startDate?: string;
          endDate?: string;
        };
      }>,
      reply
    ) => {
      let alerts = Array.from(systemAlerts.values());

      if (request.query.propertyId) {
        alerts = alerts.filter((a) => a.propertyId === request.query.propertyId);
      }
      if (request.query.systemId) {
        alerts = alerts.filter((a) => a.systemId === request.query.systemId);
      }
      if (request.query.severity) {
        alerts = alerts.filter((a) => a.severity === request.query.severity);
      }
      if (request.query.status) {
        alerts = alerts.filter((a) => a.status === request.query.status);
      }
      if (request.query.startDate) {
        alerts = alerts.filter((a) => a.triggeredAt >= request.query.startDate!);
      }
      if (request.query.endDate) {
        alerts = alerts.filter((a) => a.triggeredAt <= request.query.endDate!);
      }

      return reply.send(alerts.sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt)));
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
      const alert = systemAlerts.get(request.params.id);
      if (!alert) {
        return reply.status(404).send({ error: 'Alert not found' });
      }

      const now = new Date().toISOString();

      alert.status = 'acknowledged';
      alert.acknowledgedAt = now;
      alert.acknowledgedBy = request.body.acknowledgedBy;
      alert.updatedAt = now;

      systemAlerts.set(alert.id, alert);
      return reply.send(alert);
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
      const alert = systemAlerts.get(request.params.id);
      if (!alert) {
        return reply.status(404).send({ error: 'Alert not found' });
      }

      const now = new Date().toISOString();

      alert.status = 'resolved';
      alert.resolvedAt = now;
      alert.resolvedBy = request.body.resolvedBy;
      alert.resolution = request.body.resolution;
      alert.updatedAt = now;

      systemAlerts.set(alert.id, alert);
      return reply.send(alert);
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
      const now = new Date().toISOString();

      const maintenance: MaintenanceSchedule = {
        id: `mnt_${Date.now()}`,
        ...data,
        status: 'scheduled',
        createdAt: now,
        updatedAt: now,
      };

      maintenanceSchedules.set(maintenance.id, maintenance);
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
          type?: MaintenanceType;
          status?: MaintenanceStatus;
          startDate?: string;
          endDate?: string;
        };
      }>,
      reply
    ) => {
      let maintenance = Array.from(maintenanceSchedules.values());

      if (request.query.propertyId) {
        maintenance = maintenance.filter((m) => m.propertyId === request.query.propertyId);
      }
      if (request.query.systemId) {
        maintenance = maintenance.filter((m) => m.systemId === request.query.systemId);
      }
      if (request.query.type) {
        maintenance = maintenance.filter((m) => m.type === request.query.type);
      }
      if (request.query.status) {
        maintenance = maintenance.filter((m) => m.status === request.query.status);
      }
      if (request.query.startDate) {
        maintenance = maintenance.filter((m) => m.scheduledDate >= request.query.startDate!);
      }
      if (request.query.endDate) {
        maintenance = maintenance.filter((m) => m.scheduledDate <= request.query.endDate!);
      }

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
      const summary = getMaintenanceSummary(request.query.propertyId);
      return reply.send(summary);
    }
  );

  // Start maintenance
  app.post(
    '/maintenance/:id/start',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const maintenance = maintenanceSchedules.get(request.params.id);
      if (!maintenance) {
        return reply.status(404).send({ error: 'Maintenance not found' });
      }

      const now = new Date().toISOString();

      maintenance.status = 'in_progress';
      maintenance.updatedAt = now;

      // Update system status
      const system = buildingSystems.get(maintenance.systemId);
      if (system) {
        system.status = 'maintenance';
        system.updatedAt = now;
        buildingSystems.set(system.id, system);
      }

      maintenanceSchedules.set(maintenance.id, maintenance);
      return reply.send(maintenance);
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
      const maintenance = maintenanceSchedules.get(request.params.id);
      if (!maintenance) {
        return reply.status(404).send({ error: 'Maintenance not found' });
      }

      const now = new Date().toISOString();

      maintenance.status = 'completed';
      maintenance.completedDate = now;
      maintenance.actualDuration = request.body.actualDuration;
      maintenance.cost = request.body.cost;
      if (request.body.notes) {
        maintenance.notes = request.body.notes;
      }
      maintenance.updatedAt = now;

      // Update system
      const system = buildingSystems.get(maintenance.systemId);
      if (system) {
        system.status = 'online';
        system.lastMaintenanceDate = now.split('T')[0];

        // Calculate next maintenance date
        if (system.maintenanceIntervalDays) {
          const nextMaint = new Date();
          nextMaint.setDate(nextMaint.getDate() + system.maintenanceIntervalDays);
          system.nextMaintenanceDate = nextMaint.toISOString().split('T')[0];
        }

        system.updatedAt = now;
        buildingSystems.set(system.id, system);
      }

      maintenanceSchedules.set(maintenance.id, maintenance);
      return reply.send(maintenance);
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
      const now = new Date().toISOString();

      const usage: EnergyUsage = {
        id: `eng_${Date.now()}`,
        ...data,
        createdAt: now,
      };

      energyUsages.set(usage.id, usage);
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
      const stats = calculateEnergyStats(
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
          utilityType?: string;
          period?: string;
          startDate?: string;
          endDate?: string;
        };
      }>,
      reply
    ) => {
      let usage = Array.from(energyUsages.values());

      if (request.query.propertyId) {
        usage = usage.filter((u) => u.propertyId === request.query.propertyId);
      }
      if (request.query.systemId) {
        usage = usage.filter((u) => u.systemId === request.query.systemId);
      }
      if (request.query.utilityType) {
        usage = usage.filter((u) => u.utilityType === request.query.utilityType);
      }
      if (request.query.period) {
        usage = usage.filter((u) => u.period === request.query.period);
      }
      if (request.query.startDate) {
        usage = usage.filter((u) => u.startTime >= request.query.startDate!);
      }
      if (request.query.endDate) {
        usage = usage.filter((u) => u.endTime <= request.query.endDate!);
      }

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
      const now = new Date().toISOString();

      const system = buildingSystems.get(data.systemId);
      if (!system) {
        return reply.status(404).send({ error: 'System not found' });
      }

      const downtime: SystemDowntime = {
        id: `dwn_${Date.now()}`,
        ...data,
        propertyId: system.propertyId,
        createdAt: now,
      };

      // Update system status
      system.status = 'offline';
      system.updatedAt = now;
      buildingSystems.set(system.id, system);

      systemDowntimes.set(downtime.id, downtime);
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
      const downtime = systemDowntimes.get(request.params.id);
      if (!downtime) {
        return reply.status(404).send({ error: 'Downtime record not found' });
      }

      const now = new Date();

      downtime.endTime = now.toISOString();
      downtime.duration = Math.floor(
        (now.getTime() - new Date(downtime.startTime).getTime()) / (1000 * 60)
      );
      if (request.body.notes) {
        downtime.notes = request.body.notes;
      }

      // Restore system status
      const system = buildingSystems.get(downtime.systemId);
      if (system) {
        system.status = 'online';
        system.updatedAt = now.toISOString();
        buildingSystems.set(system.id, system);
      }

      systemDowntimes.set(downtime.id, downtime);
      return reply.send(downtime);
    }
  );

  // List downtime
  app.get(
    '/downtime',
    async (
      request: FastifyRequest<{
        Querystring: { systemId?: string; propertyId?: string; reason?: string; startDate?: string; endDate?: string };
      }>,
      reply
    ) => {
      let downtimes = Array.from(systemDowntimes.values());

      if (request.query.systemId) {
        downtimes = downtimes.filter((d) => d.systemId === request.query.systemId);
      }
      if (request.query.propertyId) {
        downtimes = downtimes.filter((d) => d.propertyId === request.query.propertyId);
      }
      if (request.query.reason) {
        downtimes = downtimes.filter((d) => d.reason === request.query.reason);
      }
      if (request.query.startDate) {
        downtimes = downtimes.filter((d) => d.startTime >= request.query.startDate!);
      }
      if (request.query.endDate) {
        downtimes = downtimes.filter((d) => d.startTime <= request.query.endDate!);
      }

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
      const now = new Date().toISOString();

      const rule: AlertRule = {
        id: `arl_${Date.now()}`,
        ...data,
        isActive: true,
        triggerCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      alertRules.set(rule.id, rule);
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
      let rules = Array.from(alertRules.values());

      if (request.query.propertyId) {
        rules = rules.filter((r) => r.propertyId === request.query.propertyId);
      }
      if (request.query.isActive !== undefined) {
        const active = request.query.isActive === 'true';
        rules = rules.filter((r) => r.isActive === active);
      }

      return reply.send(rules);
    }
  );

  // Toggle alert rule
  app.post(
    '/alert-rules/:id/toggle',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const rule = alertRules.get(request.params.id);
      if (!rule) {
        return reply.status(404).send({ error: 'Alert rule not found' });
      }

      rule.isActive = !rule.isActive;
      rule.updatedAt = new Date().toISOString();

      alertRules.set(rule.id, rule);
      return reply.send(rule);
    }
  );

  // Delete alert rule
  app.delete(
    '/alert-rules/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      if (!alertRules.has(request.params.id)) {
        return reply.status(404).send({ error: 'Alert rule not found' });
      }

      alertRules.delete(request.params.id);
      return reply.send({ message: 'Alert rule deleted' });
    }
  );
};
