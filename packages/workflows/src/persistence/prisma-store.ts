/**
 * Prisma-backed Workflow and Activity Stores
 *
 * Persists workflow and activity executions to the database.
 */

// Using a generic type for PrismaClient to allow workflow models
// The actual type comes from @realriches/database after prisma generate
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaClient = any;
import { v4 as uuidv4 } from 'uuid';
import type {
  WorkflowExecution,
  ActivityExecution,
  WorkflowStatus,
  ActivityStatus,
  WorkflowStateEntry,
} from '../types';
import type {
  WorkflowStore,
  ActivityStore,
  CreateWorkflowOptions,
  UpdateWorkflowOptions,
  QueryWorkflowsOptions,
  CreateActivityOptions,
} from './types';

/**
 * Prisma-backed workflow store.
 */
export class PrismaWorkflowStore implements WorkflowStore {
  constructor(private prisma: PrismaClient) {}

  async create(options: CreateWorkflowOptions): Promise<WorkflowExecution> {
    const initialEntry: WorkflowStateEntry = {
      step: 'started',
      timestamp: new Date(),
      data: { input: options.input },
    };

    const record = await this.prisma.workflowExecution.create({
      data: {
        id: uuidv4(),
        workflowId: options.workflowId,
        runId: options.runId,
        workflowName: options.workflowName,
        workflowVersion: options.workflowVersion,
        status: 'pending',
        input: options.input as Record<string, unknown>,
        stateHistory: [initialEntry],
        actorId: options.actorId,
        organizationId: options.organizationId,
        startedAt: new Date(),
      },
    });

    return this.toWorkflowExecution(record);
  }

  async get(workflowId: string): Promise<WorkflowExecution | null> {
    const record = await this.prisma.workflowExecution.findUnique({
      where: { workflowId },
    });

    return record ? this.toWorkflowExecution(record) : null;
  }

  async update(workflowId: string, options: UpdateWorkflowOptions): Promise<WorkflowExecution> {
    const updates: Record<string, unknown> = {};

    if (options.status) updates.status = options.status;
    if (options.currentStep) updates.currentStep = options.currentStep;
    if (options.output !== undefined) updates.output = options.output;
    if (options.error) updates.error = options.error;

    if (options.status === 'completed' || options.status === 'failed' || options.status === 'cancelled') {
      updates.completedAt = new Date();
    }

    const record = await this.prisma.workflowExecution.update({
      where: { workflowId },
      data: updates,
    });

    return this.toWorkflowExecution(record);
  }

  async updateStatus(workflowId: string, status: WorkflowStatus): Promise<WorkflowExecution> {
    return this.update(workflowId, { status });
  }

  async complete(workflowId: string, output: unknown): Promise<WorkflowExecution> {
    const entry: WorkflowStateEntry = {
      step: 'completed',
      timestamp: new Date(),
      data: { output },
    };

    const existing = await this.get(workflowId);
    const stateHistory = [...(existing?.stateHistory ?? []), entry];

    const record = await this.prisma.workflowExecution.update({
      where: { workflowId },
      data: {
        status: 'completed',
        output: output as Record<string, unknown>,
        completedAt: new Date(),
        stateHistory,
      },
    });

    return this.toWorkflowExecution(record);
  }

  async fail(workflowId: string, error: Error): Promise<WorkflowExecution> {
    const entry: WorkflowStateEntry = {
      step: 'failed',
      timestamp: new Date(),
      data: { error: error.message, name: error.name },
    };

    const existing = await this.get(workflowId);
    const stateHistory = [...(existing?.stateHistory ?? []), entry];

    const record = await this.prisma.workflowExecution.update({
      where: { workflowId },
      data: {
        status: 'failed',
        error: error.message,
        completedAt: new Date(),
        stateHistory,
      },
    });

    return this.toWorkflowExecution(record);
  }

  async cancel(workflowId: string, reason?: string): Promise<WorkflowExecution> {
    const entry: WorkflowStateEntry = {
      step: 'cancelled',
      timestamp: new Date(),
      data: { reason },
    };

    const existing = await this.get(workflowId);
    const stateHistory = [...(existing?.stateHistory ?? []), entry];

    const record = await this.prisma.workflowExecution.update({
      where: { workflowId },
      data: {
        status: 'cancelled',
        error: reason ?? 'Cancelled by user',
        completedAt: new Date(),
        stateHistory,
      },
    });

    return this.toWorkflowExecution(record);
  }

  async addStateEntry(workflowId: string, entry: WorkflowStateEntry): Promise<WorkflowExecution> {
    const existing = await this.get(workflowId);
    const stateHistory = [...(existing?.stateHistory ?? []), entry];

    const record = await this.prisma.workflowExecution.update({
      where: { workflowId },
      data: {
        currentStep: entry.step,
        stateHistory,
      },
    });

    return this.toWorkflowExecution(record);
  }

  async query(options: QueryWorkflowsOptions): Promise<WorkflowExecution[]> {
    const where: Record<string, unknown> = {};

    if (options.workflowName) where.workflowName = options.workflowName;
    if (options.status) where.status = options.status;
    if (options.organizationId) where.organizationId = options.organizationId;
    if (options.actorId) where.actorId = options.actorId;

    if (options.startedAfter || options.startedBefore) {
      where.startedAt = {};
      if (options.startedAfter) (where.startedAt as Record<string, unknown>).gte = options.startedAfter;
      if (options.startedBefore) (where.startedAt as Record<string, unknown>).lte = options.startedBefore;
    }

    const records = await this.prisma.workflowExecution.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: options.limit ?? 100,
      skip: options.offset ?? 0,
    });

    return records.map((r: Parameters<typeof this.toWorkflowExecution>[0]) => this.toWorkflowExecution(r));
  }

  async count(options: QueryWorkflowsOptions): Promise<number> {
    const where: Record<string, unknown> = {};

    if (options.workflowName) where.workflowName = options.workflowName;
    if (options.status) where.status = options.status;
    if (options.organizationId) where.organizationId = options.organizationId;
    if (options.actorId) where.actorId = options.actorId;

    return this.prisma.workflowExecution.count({ where });
  }

  private toWorkflowExecution(record: {
    id: string;
    workflowId: string;
    runId: string;
    workflowName: string;
    workflowVersion: string;
    status: string;
    input: unknown;
    output: unknown;
    error: string | null;
    currentStep: string | null;
    stateHistory: unknown;
    actorId: string | null;
    organizationId: string | null;
    startedAt: Date;
    completedAt: Date | null;
  }): WorkflowExecution {
    return {
      id: record.id,
      workflowId: record.workflowId,
      runId: record.runId,
      workflowName: record.workflowName,
      workflowVersion: record.workflowVersion,
      status: record.status as WorkflowStatus,
      input: record.input,
      output: record.output ?? undefined,
      error: record.error ?? undefined,
      currentStep: record.currentStep ?? undefined,
      stateHistory: (record.stateHistory as WorkflowStateEntry[]) ?? [],
      actorId: record.actorId ?? undefined,
      organizationId: record.organizationId ?? undefined,
      startedAt: record.startedAt,
      completedAt: record.completedAt ?? undefined,
    };
  }
}

/**
 * Prisma-backed activity store.
 */
export class PrismaActivityStore implements ActivityStore {
  constructor(private prisma: PrismaClient) {}

  async create(options: CreateActivityOptions): Promise<ActivityExecution> {
    const record = await this.prisma.activityExecution.create({
      data: {
        id: uuidv4(),
        workflowId: options.workflowId,
        activityName: options.activityName,
        idempotencyKey: options.idempotencyKey,
        status: 'pending',
        input: options.input as Record<string, unknown>,
        attempt: 1,
        startedAt: new Date(),
      },
    });

    return this.toActivityExecution(record);
  }

  async getByKey(idempotencyKey: string): Promise<ActivityExecution | null> {
    const record = await this.prisma.activityExecution.findUnique({
      where: { idempotencyKey },
    });

    return record ? this.toActivityExecution(record) : null;
  }

  async getByWorkflow(workflowId: string): Promise<ActivityExecution[]> {
    const records = await this.prisma.activityExecution.findMany({
      where: { workflowId },
      orderBy: { startedAt: 'asc' },
    });

    return records.map((r: Parameters<typeof this.toActivityExecution>[0]) => this.toActivityExecution(r));
  }

  async updateStatus(id: string, status: ActivityStatus): Promise<ActivityExecution> {
    const record = await this.prisma.activityExecution.update({
      where: { id },
      data: { status },
    });

    return this.toActivityExecution(record);
  }

  async complete(id: string, output: unknown): Promise<ActivityExecution> {
    const record = await this.prisma.activityExecution.update({
      where: { id },
      data: {
        status: 'completed',
        output: output as Record<string, unknown>,
        completedAt: new Date(),
      },
    });

    return this.toActivityExecution(record);
  }

  async fail(id: string, error: Error): Promise<ActivityExecution> {
    const record = await this.prisma.activityExecution.update({
      where: { id },
      data: {
        status: 'failed',
        error: error.message,
        completedAt: new Date(),
      },
    });

    return this.toActivityExecution(record);
  }

  async incrementAttempt(id: string): Promise<ActivityExecution> {
    const record = await this.prisma.activityExecution.update({
      where: { id },
      data: {
        attempt: { increment: 1 },
        status: 'retrying',
      },
    });

    return this.toActivityExecution(record);
  }

  private toActivityExecution(record: {
    id: string;
    workflowId: string;
    activityName: string;
    idempotencyKey: string;
    status: string;
    input: unknown;
    output: unknown;
    error: string | null;
    attempt: number;
    startedAt: Date;
    completedAt: Date | null;
  }): ActivityExecution {
    return {
      id: record.id,
      workflowId: record.workflowId,
      activityName: record.activityName,
      idempotencyKey: record.idempotencyKey,
      status: record.status as ActivityStatus,
      input: record.input,
      output: record.output ?? undefined,
      error: record.error ?? undefined,
      attempt: record.attempt,
      startedAt: record.startedAt,
      completedAt: record.completedAt ?? undefined,
    };
  }
}
