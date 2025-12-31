import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  prisma,
  type PetType,
  type PetStatus,
  type VaccinationType,
  type PetIncidentType,
  type PetIncidentSeverity,
  type PetFeeType,
  type PetFeeStatus,
  type PetScreeningRiskLevel,
} from '@realriches/database';

// ============================================================================
// Exported Maps for testing
// ============================================================================
export interface BreedRestriction {
  id: string;
  propertyId: string;
  petType: string;
  breed: string;
  reason: string;
  createdAt: string;
}

export interface Pet {
  id: string;
  tenantId: string;
  propertyId: string;
  unitId?: string;
  name: string;
  type: PetType;
  breed?: string;
  weight?: number;
  age?: number;
  isServiceAnimal?: boolean;
  isEmotionalSupport?: boolean;
  status?: string;
}

export interface PetPolicy {
  id: string;
  propertyId: string;
  allowedTypes: PetType[];
  maxWeight: number;
  restrictedBreeds: string[];
  serviceAnimalExempt: boolean;
  emotionalSupportExempt: boolean;
  petDeposit: number;
  monthlyPetRent: number;
  oneTimePetFee: number;
  maxPets: number;
}

export interface VaccinationRecord {
  id: string;
  petId: string;
  type: VaccinationType;
  administeredDate: Date | string;
  expirationDate: Date | string;
  veterinarianName?: string;
  isRequired: boolean;
}

export interface PetIncident {
  id: string;
  petId: string;
  type?: PetIncidentType | string;
  incidentType?: PetIncidentType | string;
  severity: PetIncidentSeverity | string;
  date?: Date | string;
  incidentDate?: Date | string;
  description: string;
  fineAmount?: number;
  finePaid?: boolean;
  createdAt: Date | string;
}

// Exported Maps for test compatibility
export const petBreedRestrictions = new Map<string, BreedRestriction>();
export const petStore = new Map<string, Pet>();
export const petPolicyStore = new Map<string, PetPolicy>();
export const petVaccinationRecords = new Map<string, VaccinationRecord>();
export const petIncidentStore = new Map<string, PetIncident>();

// ============================================================================
// Helper Functions
// ============================================================================

// Synchronous version for testing (uses Maps)
export function checkBreedRestriction(
  propertyId: string,
  petType: PetType | string,
  breed: string
): { restricted: boolean; reason?: string } {
  const restrictions = Array.from(petBreedRestrictions.values()).filter(
    (r) => r.propertyId === propertyId && r.petType === petType
  );

  const normalizedBreed = breed.toLowerCase();
  const matchingRestriction = restrictions.find(
    (r) =>
      normalizedBreed.includes(r.breed.toLowerCase()) || r.breed.toLowerCase().includes(normalizedBreed)
  );

  if (matchingRestriction) {
    return { restricted: true, reason: matchingRestriction.reason };
  }

  return { restricted: false };
}

// Async version for production (uses Prisma)
export async function checkBreedRestrictionAsync(
  propertyId: string,
  petType: PetType,
  breed: string
): Promise<{ restricted: boolean; reason?: string }> {
  const restrictions = await prisma.breedRestriction.findMany({
    where: { propertyId, petType },
  });

  const normalizedBreed = breed.toLowerCase();
  const matchingRestriction = restrictions.find(
    (r) =>
      normalizedBreed.includes(r.breed.toLowerCase()) || r.breed.toLowerCase().includes(normalizedBreed)
  );

  if (matchingRestriction) {
    return { restricted: true, reason: matchingRestriction.reason };
  }

  return { restricted: false };
}

interface PetPolicyData {
  allowedTypes: PetType[];
  maxWeight: number;
  restrictedBreeds: string[];
  serviceAnimalExempt: boolean;
  emotionalSupportExempt: boolean;
  petDeposit: number;
  monthlyPetRent: number;
  oneTimePetFee: number;
  maxPets: number;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value) || 0;
}

interface PrismaPetPolicy {
  allowedTypes: PetType[];
  maxWeight: number;
  restrictedBreeds: string[];
  serviceAnimalExempt: boolean;
  emotionalSupportExempt: boolean;
  petDeposit: unknown;
  monthlyPetRent: unknown;
  oneTimePetFee: unknown;
  maxPets: number;
}

function toPetPolicyData(policy: PrismaPetPolicy): PetPolicyData {
  return {
    allowedTypes: policy.allowedTypes,
    maxWeight: policy.maxWeight,
    restrictedBreeds: policy.restrictedBreeds,
    serviceAnimalExempt: policy.serviceAnimalExempt,
    emotionalSupportExempt: policy.emotionalSupportExempt,
    petDeposit: toNumber(policy.petDeposit),
    monthlyPetRent: toNumber(policy.monthlyPetRent),
    oneTimePetFee: toNumber(policy.oneTimePetFee),
    maxPets: policy.maxPets,
  };
}

export function validatePetAgainstPolicy(
  pet: { type?: PetType; weight?: number; breed?: string; isServiceAnimal?: boolean; isEmotionalSupport?: boolean },
  policy: PetPolicyData
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  // Check pet type
  if (pet.type && !policy.allowedTypes.includes(pet.type)) {
    violations.push(`Pet type '${pet.type}' is not allowed`);
  }

  // Check weight
  if (pet.weight && pet.weight > policy.maxWeight) {
    violations.push(`Pet weight ${pet.weight}lbs exceeds maximum ${policy.maxWeight}lbs`);
  }

  // Check breed restrictions
  if (pet.breed && pet.type) {
    const normalizedBreed = pet.breed.toLowerCase();
    const isRestricted = policy.restrictedBreeds.some(
      (restricted) =>
        normalizedBreed.includes(restricted.toLowerCase()) ||
        restricted.toLowerCase().includes(normalizedBreed)
    );
    if (isRestricted) {
      violations.push(`Breed '${pet.breed}' is restricted at this property`);
    }
  }

  // Service/ESA animals are exempt if policy says so
  if (pet.isServiceAnimal && policy.serviceAnimalExempt) {
    return { valid: true, violations: [] };
  }
  if (pet.isEmotionalSupport && policy.emotionalSupportExempt) {
    return { valid: true, violations: [] };
  }

  return { valid: violations.length === 0, violations };
}

export function calculatePetFees(
  policy: PetPolicyData,
  isServiceAnimal: boolean,
  isEmotionalSupport: boolean
): { deposit: number; monthlyRent: number; oneTimeFee: number } {
  // Service animals and ESAs are typically exempt from pet fees
  if (isServiceAnimal && policy.serviceAnimalExempt) {
    return { deposit: 0, monthlyRent: 0, oneTimeFee: 0 };
  }
  if (isEmotionalSupport && policy.emotionalSupportExempt) {
    return { deposit: 0, monthlyRent: 0, oneTimeFee: 0 };
  }

  return {
    deposit: policy.petDeposit,
    monthlyRent: policy.monthlyPetRent,
    oneTimeFee: policy.oneTimePetFee,
  };
}

// Synchronous version for testing (uses Maps)
export function getVaccinationStatus(petId: string): {
  upToDate: boolean;
  expired: { id: string; type: VaccinationType; expirationDate: Date }[];
  expiringSoon: { id: string; type: VaccinationType; expirationDate: Date }[];
  missing: VaccinationType[];
} {
  const records = Array.from(petVaccinationRecords.values()).filter(r => r.petId === petId);
  const today = new Date();
  const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

  const expired: { id: string; type: VaccinationType; expirationDate: Date }[] = [];
  const expiringSoon: { id: string; type: VaccinationType; expirationDate: Date }[] = [];
  const vaccineTypes = new Set<VaccinationType>();

  for (const record of records) {
    vaccineTypes.add(record.type);
    const expDate = typeof record.expirationDate === 'string' ? new Date(record.expirationDate) : record.expirationDate;

    if (expDate < today) {
      expired.push({ id: record.id, type: record.type, expirationDate: expDate });
    } else if (expDate < thirtyDaysFromNow) {
      expiringSoon.push({ id: record.id, type: record.type, expirationDate: expDate });
    }
  }

  const requiredVaccinations: VaccinationType[] = ['rabies'];
  const missing = requiredVaccinations.filter((v) => !vaccineTypes.has(v));

  return {
    upToDate: expired.length === 0 && missing.length === 0,
    expired,
    expiringSoon,
    missing,
  };
}

// Synchronous version for testing (uses Maps)
export function getIncidentHistory(petId: string): {
  totalIncidents: number;
  byType: Record<string, number>;
  totalFines: number;
  unpaidFines: number;
} {
  const incidents = Array.from(petIncidentStore.values()).filter(i => i.petId === petId);

  const byType: Record<string, number> = {
    noise: 0,
    aggression: 0,
    property_damage: 0,
    waste: 0,
    off_leash: 0,
    other: 0,
  };

  let totalFines = 0;
  let unpaidFines = 0;

  for (const incident of incidents) {
    // Support both 'type' and 'incidentType' field names
    const incType = (incident.type || incident.incidentType || 'other') as string;
    byType[incType] = (byType[incType] || 0) + 1;
    if (incident.fineAmount) {
      totalFines += incident.fineAmount;
      if (!incident.finePaid) {
        unpaidFines += incident.fineAmount;
      }
    }
  }

  return {
    totalIncidents: incidents.length,
    byType,
    totalFines,
    unpaidFines,
  };
}

// Synchronous version for testing (uses Maps)
export function calculateRiskScore(petId: string): { score: number; factors: string[] } {
  const pet = petStore.get(petId);
  if (!pet) {
    return { score: 0, factors: ['Pet not found'] };
  }

  let score = 100;
  const factors: string[] = [];

  const vaccStatus = getVaccinationStatus(petId);
  if (!vaccStatus.upToDate) {
    score -= 20;
    factors.push('Vaccinations not up to date');
  }
  if (vaccStatus.expiringSoon.length > 0) {
    score -= 5;
    factors.push(`${vaccStatus.expiringSoon.length} vaccination(s) expiring soon`);
  }

  const incidents = getIncidentHistory(petId);
  if (incidents.totalIncidents > 0) {
    score -= incidents.totalIncidents * 10;
    factors.push(`${incidents.totalIncidents} incident(s) on record`);
  }
  if (incidents.unpaidFines > 0) {
    score -= 15;
    factors.push(`$${incidents.unpaidFines} in unpaid fines`);
  }

  if (incidents.byType.aggression > 0) {
    score -= incidents.byType.aggression * 15;
    factors.push(`${incidents.byType.aggression} aggression incident(s)`);
  }

  score = Math.max(0, score);

  return { score, factors };
}

// Synchronous version for testing (uses Maps)
export function getPropertyPetCensus(propertyId: string): {
  totalPets: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  serviceAnimals: number;
  emotionalSupport: number;
} {
  const propertyPets = Array.from(petStore.values()).filter(p => p.propertyId === propertyId);

  const byType: Record<string, number> = {
    dog: 0,
    cat: 0,
    bird: 0,
    fish: 0,
    reptile: 0,
    small_mammal: 0,
    other: 0,
  };

  const byStatus: Record<string, number> = {
    pending_approval: 0,
    approved: 0,
    denied: 0,
    removed: 0,
  };

  let serviceAnimals = 0;
  let emotionalSupport = 0;

  for (const pet of propertyPets) {
    byType[pet.type] = (byType[pet.type] || 0) + 1;
    if (pet.status) {
      byStatus[pet.status] = (byStatus[pet.status] || 0) + 1;
    }
    if (pet.isServiceAnimal) serviceAnimals++;
    if (pet.isEmotionalSupport) emotionalSupport++;
  }

  return {
    totalPets: propertyPets.length,
    byType,
    byStatus,
    serviceAnimals,
    emotionalSupport,
  };
}

// Async version for production (uses Prisma)
async function getVaccinationStatusAsync(petId: string): Promise<{
  upToDate: boolean;
  expired: { id: string; type: VaccinationType; expirationDate: Date }[];
  expiringSoon: { id: string; type: VaccinationType; expirationDate: Date }[];
  missing: VaccinationType[];
}> {
  const records = await prisma.vaccinationRecord.findMany({
    where: { petId },
  });

  const today = new Date();
  const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

  const expired: { id: string; type: VaccinationType; expirationDate: Date }[] = [];
  const expiringSoon: { id: string; type: VaccinationType; expirationDate: Date }[] = [];
  const vaccineTypes = new Set<VaccinationType>();

  for (const record of records) {
    vaccineTypes.add(record.type);
    const expDate = record.expirationDate;

    if (expDate < today) {
      expired.push({ id: record.id, type: record.type, expirationDate: expDate });
    } else if (expDate < thirtyDaysFromNow) {
      expiringSoon.push({ id: record.id, type: record.type, expirationDate: expDate });
    }
  }

  // Check for required vaccinations (rabies is always required for dogs/cats)
  const requiredVaccinations: VaccinationType[] = ['rabies'];
  const missing = requiredVaccinations.filter((v) => !vaccineTypes.has(v));

  return {
    upToDate: expired.length === 0 && missing.length === 0,
    expired,
    expiringSoon,
    missing,
  };
}

async function getIncidentHistoryAsync(petId: string): Promise<{
  totalIncidents: number;
  byType: Record<PetIncidentType, number>;
  totalFines: number;
  unpaidFines: number;
}> {
  const incidents = await prisma.petIncident.findMany({
    where: { petId },
  });

  const byType: Record<PetIncidentType, number> = {
    noise: 0,
    aggression: 0,
    property_damage: 0,
    waste: 0,
    off_leash: 0,
    other: 0,
  };

  let totalFines = 0;
  let unpaidFines = 0;

  for (const incident of incidents) {
    byType[incident.incidentType]++;
    if (incident.fineAmount) {
      const fineNum = toNumber(incident.fineAmount);
      totalFines += fineNum;
      if (!incident.finePaid) {
        unpaidFines += fineNum;
      }
    }
  }

  return {
    totalIncidents: incidents.length,
    byType,
    totalFines,
    unpaidFines,
  };
}

async function calculateRiskScoreAsync(petId: string): Promise<{ score: number; factors: string[] }> {
  const pet = await prisma.pet.findUnique({ where: { id: petId } });
  if (!pet) {
    return { score: 0, factors: ['Pet not found'] };
  }

  let score = 100; // Start with perfect score
  const factors: string[] = [];

  // Check vaccination status
  const vaccStatus = await getVaccinationStatusAsync(petId);
  if (!vaccStatus.upToDate) {
    score -= 20;
    factors.push('Vaccinations not up to date');
  }
  if (vaccStatus.expiringSoon.length > 0) {
    score -= 5;
    factors.push(`${vaccStatus.expiringSoon.length} vaccination(s) expiring soon`);
  }

  // Check incident history
  const incidents = await getIncidentHistoryAsync(petId);
  if (incidents.totalIncidents > 0) {
    score -= incidents.totalIncidents * 10;
    factors.push(`${incidents.totalIncidents} incident(s) on record`);
  }
  if (incidents.unpaidFines > 0) {
    score -= 15;
    factors.push(`$${incidents.unpaidFines} in unpaid fines`);
  }

  // Check for aggression incidents (more severe)
  if (incidents.byType.aggression > 0) {
    score -= incidents.byType.aggression * 15;
    factors.push(`${incidents.byType.aggression} aggression incident(s)`);
  }

  // Ensure score doesn't go below 0
  score = Math.max(0, score);

  return { score, factors };
}

async function getPropertyPetCensusAsync(propertyId: string): Promise<{
  totalPets: number;
  byType: Record<PetType, number>;
  byStatus: Record<PetStatus, number>;
  serviceAnimals: number;
  emotionalSupport: number;
}> {
  const propertyPets = await prisma.pet.findMany({
    where: { propertyId },
  });

  const byType: Record<PetType, number> = {
    dog: 0,
    cat: 0,
    bird: 0,
    fish: 0,
    reptile: 0,
    small_mammal: 0,
    other: 0,
  };

  const byStatus: Record<PetStatus, number> = {
    pending_approval: 0,
    approved: 0,
    denied: 0,
    removed: 0,
  };

  let serviceAnimals = 0;
  let emotionalSupport = 0;

  for (const pet of propertyPets) {
    byType[pet.type]++;
    byStatus[pet.status]++;
    if (pet.isServiceAnimal) serviceAnimals++;
    if (pet.isEmotionalSupport) emotionalSupport++;
  }

  return {
    totalPets: propertyPets.length,
    byType,
    byStatus,
    serviceAnimals,
    emotionalSupport,
  };
}

// ============================================================================
// Routes
// ============================================================================

export async function petRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // Pet Policy Management
  // -------------------------------------------------------------------------

  // Create/Update pet policy for property
  app.post('/policies', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      propertyId: z.string(),
      maxPets: z.number().min(0).default(2),
      allowedTypes: z.array(z.enum(['dog', 'cat', 'bird', 'fish', 'reptile', 'small_mammal', 'other'])),
      maxWeight: z.number().min(0).default(100),
      petDeposit: z.number().min(0).default(0),
      monthlyPetRent: z.number().min(0).default(0),
      oneTimePetFee: z.number().min(0).default(0),
      serviceAnimalExempt: z.boolean().default(true),
      emotionalSupportExempt: z.boolean().default(true),
      requiresVaccinations: z.boolean().default(true),
      requiresLicense: z.boolean().default(false),
      requiresInsurance: z.boolean().default(false),
      insuranceMinCoverage: z.number().min(0).default(100000),
      restrictedBreeds: z.array(z.string()).default([]),
      additionalRules: z.string().optional(),
    });

    const body = schema.parse(request.body);

    const policy = await prisma.petPolicy.upsert({
      where: { propertyId: body.propertyId },
      update: {
        maxPets: body.maxPets,
        allowedTypes: body.allowedTypes,
        maxWeight: body.maxWeight,
        petDeposit: body.petDeposit,
        monthlyPetRent: body.monthlyPetRent,
        oneTimePetFee: body.oneTimePetFee,
        serviceAnimalExempt: body.serviceAnimalExempt,
        emotionalSupportExempt: body.emotionalSupportExempt,
        requiresVaccinations: body.requiresVaccinations,
        requiresLicense: body.requiresLicense,
        requiresInsurance: body.requiresInsurance,
        insuranceMinCoverage: body.insuranceMinCoverage,
        restrictedBreeds: body.restrictedBreeds,
        additionalRules: body.additionalRules,
      },
      create: {
        propertyId: body.propertyId,
        maxPets: body.maxPets,
        allowedTypes: body.allowedTypes,
        maxWeight: body.maxWeight,
        petDeposit: body.petDeposit,
        monthlyPetRent: body.monthlyPetRent,
        oneTimePetFee: body.oneTimePetFee,
        serviceAnimalExempt: body.serviceAnimalExempt,
        emotionalSupportExempt: body.emotionalSupportExempt,
        requiresVaccinations: body.requiresVaccinations,
        requiresLicense: body.requiresLicense,
        requiresInsurance: body.requiresInsurance,
        insuranceMinCoverage: body.insuranceMinCoverage,
        restrictedBreeds: body.restrictedBreeds,
        additionalRules: body.additionalRules,
      },
    });

    return reply.status(201).send(policy);
  });

  // Get pet policy for property
  app.get('/policies/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const policy = await prisma.petPolicy.findUnique({
      where: { propertyId },
    });

    if (!policy) {
      return reply.status(404).send({ error: 'Pet policy not found for this property' });
    }

    return reply.send(policy);
  });

  // -------------------------------------------------------------------------
  // Breed Restrictions
  // -------------------------------------------------------------------------

  // Add breed restriction
  app.post('/restrictions', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      propertyId: z.string(),
      petType: z.enum(['dog', 'cat', 'bird', 'fish', 'reptile', 'small_mammal', 'other']),
      breed: z.string(),
      reason: z.string(),
    });

    const body = schema.parse(request.body);

    const restriction = await prisma.breedRestriction.create({
      data: {
        propertyId: body.propertyId,
        petType: body.petType,
        breed: body.breed,
        reason: body.reason,
      },
    });

    return reply.status(201).send(restriction);
  });

  // List breed restrictions for property
  app.get('/restrictions/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const restrictions = await prisma.breedRestriction.findMany({
      where: { propertyId },
    });
    return reply.send({ restrictions });
  });

  // Remove breed restriction
  app.delete('/restrictions/:restrictionId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { restrictionId } = request.params as { restrictionId: string };

    try {
      await prisma.breedRestriction.delete({
        where: { id: restrictionId },
      });
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ error: 'Restriction not found' });
    }
  });

  // -------------------------------------------------------------------------
  // Pet Registration
  // -------------------------------------------------------------------------

  // Register a pet
  app.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      leaseId: z.string(),
      propertyId: z.string(),
      tenantId: z.string(),
      name: z.string(),
      type: z.enum(['dog', 'cat', 'bird', 'fish', 'reptile', 'small_mammal', 'other']),
      breed: z.string(),
      weight: z.number().min(0),
      age: z.number().min(0),
      color: z.string(),
      isServiceAnimal: z.boolean().default(false),
      isEmotionalSupport: z.boolean().default(false),
      microchipNumber: z.string().optional(),
      licenseNumber: z.string().optional(),
      veterinarian: z
        .object({
          name: z.string(),
          phone: z.string(),
          address: z.string(),
        })
        .optional(),
      photoUrl: z.string().optional(),
      notes: z.string().optional(),
    });

    const body = schema.parse(request.body);
    const now = new Date();

    // Check breed restriction
    const breedCheck = await checkBreedRestriction(body.propertyId, body.type, body.breed);
    if (breedCheck.restricted && !body.isServiceAnimal && !body.isEmotionalSupport) {
      return reply.status(400).send({
        error: 'Breed restricted',
        reason: breedCheck.reason,
      });
    }

    // Validate against policy if exists
    const policy = await prisma.petPolicy.findUnique({
      where: { propertyId: body.propertyId },
    });

    let policyData: PetPolicyData | null = null;
    if (policy) {
      policyData = toPetPolicyData(policy);
      const validation = validatePetAgainstPolicy(body, policyData);
      if (!validation.valid) {
        return reply.status(400).send({
          error: 'Pet does not meet property policy',
          violations: validation.violations,
        });
      }

      // Check max pets for tenant
      const tenantPetCount = await prisma.pet.count({
        where: {
          tenantId: body.tenantId,
          leaseId: body.leaseId,
          status: 'approved',
        },
      });
      if (tenantPetCount >= policy.maxPets && !body.isServiceAnimal && !body.isEmotionalSupport) {
        return reply.status(400).send({
          error: 'Maximum pet limit reached',
          maxPets: policy.maxPets,
          currentPets: tenantPetCount,
        });
      }
    }

    // Auto-approve service animals and ESAs
    const status: PetStatus =
      body.isServiceAnimal || body.isEmotionalSupport ? 'approved' : 'pending_approval';

    const pet = await prisma.pet.create({
      data: {
        leaseId: body.leaseId,
        propertyId: body.propertyId,
        tenantId: body.tenantId,
        name: body.name,
        type: body.type,
        breed: body.breed,
        weight: body.weight,
        age: body.age,
        color: body.color,
        isServiceAnimal: body.isServiceAnimal,
        isEmotionalSupport: body.isEmotionalSupport,
        microchipNumber: body.microchipNumber,
        licenseNumber: body.licenseNumber,
        vetName: body.veterinarian?.name,
        vetPhone: body.veterinarian?.phone,
        vetAddress: body.veterinarian?.address,
        photoUrl: body.photoUrl,
        status,
        registrationDate: now,
        approvalDate: status === 'approved' ? now : undefined,
        notes: body.notes,
      },
    });

    // Create pet fees if applicable
    if (policyData && status === 'approved') {
      const fees = calculatePetFees(policyData, body.isServiceAnimal, body.isEmotionalSupport);

      if (fees.deposit > 0) {
        await prisma.petFee.create({
          data: {
            petId: pet.id,
            leaseId: body.leaseId,
            feeType: 'deposit',
            amount: fees.deposit,
            dueDate: now,
            status: 'pending',
          },
        });
      }

      if (fees.oneTimeFee > 0) {
        await prisma.petFee.create({
          data: {
            petId: pet.id,
            leaseId: body.leaseId,
            feeType: 'one_time',
            amount: fees.oneTimeFee,
            dueDate: now,
            status: 'pending',
          },
        });
      }
    }

    return reply.status(201).send(pet);
  });

  // Get pet by ID
  app.get('/:petId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { petId } = request.params as { petId: string };
    const pet = await prisma.pet.findUnique({
      where: { id: petId },
    });

    if (!pet) {
      return reply.status(404).send({ error: 'Pet not found' });
    }

    // Include additional details
    const vaccStatus = await getVaccinationStatus(petId);
    const incidentHistory = await getIncidentHistory(petId);
    const riskScore = await calculateRiskScore(petId);

    return reply.send({
      ...pet,
      vaccinationStatus: vaccStatus,
      incidentHistory,
      riskScore,
    });
  });

  // List pets with filters
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      propertyId: z.string().optional(),
      tenantId: z.string().optional(),
      leaseId: z.string().optional(),
      type: z.enum(['dog', 'cat', 'bird', 'fish', 'reptile', 'small_mammal', 'other']).optional(),
      status: z.enum(['pending_approval', 'approved', 'denied', 'removed']).optional(),
    });

    const query = schema.parse(request.query);

    const pets = await prisma.pet.findMany({
      where: {
        ...(query.propertyId && { propertyId: query.propertyId }),
        ...(query.tenantId && { tenantId: query.tenantId }),
        ...(query.leaseId && { leaseId: query.leaseId }),
        ...(query.type && { type: query.type }),
        ...(query.status && { status: query.status }),
      },
    });

    return reply.send({ pets, total: pets.length });
  });

  // Approve pet registration
  app.post('/:petId/approve', async (request: FastifyRequest, reply: FastifyReply) => {
    const { petId } = request.params as { petId: string };
    const pet = await prisma.pet.findUnique({
      where: { id: petId },
    });

    if (!pet) {
      return reply.status(404).send({ error: 'Pet not found' });
    }

    if (pet.status !== 'pending_approval') {
      return reply.status(400).send({ error: 'Pet is not pending approval' });
    }

    const now = new Date();
    const updated = await prisma.pet.update({
      where: { id: petId },
      data: {
        status: 'approved',
        approvalDate: now,
      },
    });

    // Create pet fees
    const policy = await prisma.petPolicy.findUnique({
      where: { propertyId: pet.propertyId },
    });

    if (policy) {
      const policyData = toPetPolicyData(policy);
      const fees = calculatePetFees(policyData, pet.isServiceAnimal, pet.isEmotionalSupport);

      if (fees.deposit > 0) {
        await prisma.petFee.create({
          data: {
            petId: pet.id,
            leaseId: pet.leaseId,
            feeType: 'deposit',
            amount: fees.deposit,
            dueDate: now,
            status: 'pending',
          },
        });
      }
    }

    return reply.send(updated);
  });

  // Deny pet registration
  app.post('/:petId/deny', async (request: FastifyRequest, reply: FastifyReply) => {
    const { petId } = request.params as { petId: string };
    const schema = z.object({
      reason: z.string(),
    });

    const body = schema.parse(request.body);
    const pet = await prisma.pet.findUnique({
      where: { id: petId },
    });

    if (!pet) {
      return reply.status(404).send({ error: 'Pet not found' });
    }

    if (pet.status !== 'pending_approval') {
      return reply.status(400).send({ error: 'Pet is not pending approval' });
    }

    const updated = await prisma.pet.update({
      where: { id: petId },
      data: {
        status: 'denied',
        denialReason: body.reason,
      },
    });

    return reply.send(updated);
  });

  // Remove pet (move-out, rehoming, death, etc.)
  app.post('/:petId/remove', async (request: FastifyRequest, reply: FastifyReply) => {
    const { petId } = request.params as { petId: string };
    const schema = z.object({
      reason: z.string(),
    });

    const body = schema.parse(request.body);
    const pet = await prisma.pet.findUnique({
      where: { id: petId },
    });

    if (!pet) {
      return reply.status(404).send({ error: 'Pet not found' });
    }

    const updated = await prisma.pet.update({
      where: { id: petId },
      data: {
        status: 'removed',
        removalDate: new Date(),
        removalReason: body.reason,
      },
    });

    return reply.send(updated);
  });

  // -------------------------------------------------------------------------
  // Vaccination Records
  // -------------------------------------------------------------------------

  // Add vaccination record
  app.post('/:petId/vaccinations', async (request: FastifyRequest, reply: FastifyReply) => {
    const { petId } = request.params as { petId: string };
    const schema = z.object({
      type: z.enum(['rabies', 'distemper', 'parvo', 'bordetella', 'feline_leukemia', 'other']),
      vaccineName: z.string(),
      administeredDate: z.string(),
      expirationDate: z.string(),
      veterinarianName: z.string(),
      documentUrl: z.string().optional(),
    });

    const body = schema.parse(request.body);

    const pet = await prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) {
      return reply.status(404).send({ error: 'Pet not found' });
    }

    const record = await prisma.vaccinationRecord.create({
      data: {
        petId,
        type: body.type,
        vaccineName: body.vaccineName,
        administeredDate: new Date(body.administeredDate),
        expirationDate: new Date(body.expirationDate),
        veterinarianName: body.veterinarianName,
        documentUrl: body.documentUrl,
        verified: false,
      },
    });

    return reply.status(201).send(record);
  });

  // Get vaccination records for pet
  app.get('/:petId/vaccinations', async (request: FastifyRequest, reply: FastifyReply) => {
    const { petId } = request.params as { petId: string };

    const pet = await prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) {
      return reply.status(404).send({ error: 'Pet not found' });
    }

    const records = await prisma.vaccinationRecord.findMany({
      where: { petId },
    });
    const status = await getVaccinationStatus(petId);

    return reply.send({ records, status });
  });

  // Verify vaccination
  app.post('/vaccinations/:vaccinationId/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const { vaccinationId } = request.params as { vaccinationId: string };
    const schema = z.object({
      verifiedBy: z.string(),
    });

    const body = schema.parse(request.body);

    try {
      const updated = await prisma.vaccinationRecord.update({
        where: { id: vaccinationId },
        data: {
          verified: true,
          verifiedBy: body.verifiedBy,
          verifiedAt: new Date(),
        },
      });
      return reply.send(updated);
    } catch {
      return reply.status(404).send({ error: 'Vaccination record not found' });
    }
  });

  // -------------------------------------------------------------------------
  // Pet Incidents
  // -------------------------------------------------------------------------

  // Report incident
  app.post('/:petId/incidents', async (request: FastifyRequest, reply: FastifyReply) => {
    const { petId } = request.params as { petId: string };
    const schema = z.object({
      reportedBy: z.string(),
      incidentType: z.enum(['noise', 'aggression', 'property_damage', 'waste', 'off_leash', 'other']),
      severity: z.enum(['minor', 'moderate', 'severe']),
      description: z.string(),
      incidentDate: z.string(),
      location: z.string(),
      witnesses: z.array(z.string()).optional(),
      fineAmount: z.number().optional(),
    });

    const body = schema.parse(request.body);
    const pet = await prisma.pet.findUnique({
      where: { id: petId },
    });

    if (!pet) {
      return reply.status(404).send({ error: 'Pet not found' });
    }

    const incident = await prisma.petIncident.create({
      data: {
        petId,
        propertyId: pet.propertyId,
        reportedBy: body.reportedBy,
        incidentType: body.incidentType,
        severity: body.severity,
        description: body.description,
        incidentDate: new Date(body.incidentDate),
        location: body.location,
        witnesses: body.witnesses || [],
        fineAmount: body.fineAmount,
        finePaid: false,
        resolved: false,
      },
    });

    // Create violation fine fee if applicable
    if (body.fineAmount && body.fineAmount > 0) {
      await prisma.petFee.create({
        data: {
          petId,
          leaseId: pet.leaseId,
          feeType: 'violation_fine',
          amount: body.fineAmount,
          dueDate: new Date(),
          status: 'pending',
          notes: `Fine for ${body.incidentType} incident`,
        },
      });
    }

    return reply.status(201).send(incident);
  });

  // Get incidents for pet
  app.get('/:petId/incidents', async (request: FastifyRequest, reply: FastifyReply) => {
    const { petId } = request.params as { petId: string };

    const pet = await prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) {
      return reply.status(404).send({ error: 'Pet not found' });
    }

    const incidents = await prisma.petIncident.findMany({
      where: { petId },
    });
    const history = await getIncidentHistory(petId);

    return reply.send({ incidents, summary: history });
  });

  // Resolve incident
  app.post('/incidents/:incidentId/resolve', async (request: FastifyRequest, reply: FastifyReply) => {
    const { incidentId } = request.params as { incidentId: string };
    const schema = z.object({
      resolutionNotes: z.string(),
      actionTaken: z.string().optional(),
    });

    const body = schema.parse(request.body);

    try {
      const updated = await prisma.petIncident.update({
        where: { id: incidentId },
        data: {
          resolved: true,
          resolutionNotes: body.resolutionNotes,
          actionTaken: body.actionTaken,
          resolvedAt: new Date(),
        },
      });
      return reply.send(updated);
    } catch {
      return reply.status(404).send({ error: 'Incident not found' });
    }
  });

  // -------------------------------------------------------------------------
  // Pet Screening
  // -------------------------------------------------------------------------

  // Submit screening result
  app.post('/:petId/screening', async (request: FastifyRequest, reply: FastifyReply) => {
    const { petId } = request.params as { petId: string };
    const schema = z.object({
      provider: z.string(),
      score: z.number().min(0).max(100),
      riskLevel: z.enum(['low', 'medium', 'high']),
      breedVerified: z.boolean(),
      vaccinationsVerified: z.boolean(),
      behaviorAssessment: z.string(),
      recommendations: z.array(z.string()),
      documentUrl: z.string().optional(),
    });

    const body = schema.parse(request.body);

    const pet = await prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) {
      return reply.status(404).send({ error: 'Pet not found' });
    }

    const screening = await prisma.petScreening.create({
      data: {
        petId,
        screeningDate: new Date(),
        provider: body.provider,
        score: body.score,
        riskLevel: body.riskLevel,
        breedVerified: body.breedVerified,
        vaccinationsVerified: body.vaccinationsVerified,
        behaviorAssessment: body.behaviorAssessment,
        recommendations: body.recommendations,
        documentUrl: body.documentUrl,
      },
    });

    return reply.status(201).send(screening);
  });

  // Get screening history
  app.get('/:petId/screening', async (request: FastifyRequest, reply: FastifyReply) => {
    const { petId } = request.params as { petId: string };

    const pet = await prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) {
      return reply.status(404).send({ error: 'Pet not found' });
    }

    const screenings = await prisma.petScreening.findMany({
      where: { petId },
      orderBy: { screeningDate: 'desc' },
    });

    return reply.send({ screenings, latest: screenings[0] || null });
  });

  // -------------------------------------------------------------------------
  // Pet Fees
  // -------------------------------------------------------------------------

  // Get fees for pet
  app.get('/:petId/fees', async (request: FastifyRequest, reply: FastifyReply) => {
    const { petId } = request.params as { petId: string };

    const pet = await prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) {
      return reply.status(404).send({ error: 'Pet not found' });
    }

    const fees = await prisma.petFee.findMany({
      where: { petId },
    });

    const totalOwed = fees.filter((f) => f.status === 'pending').reduce((sum, f) => sum + toNumber(f.amount), 0);
    const totalPaid = fees.filter((f) => f.status === 'paid').reduce((sum, f) => sum + toNumber(f.amount), 0);

    return reply.send({ fees, totalOwed, totalPaid });
  });

  // Pay fee
  app.post('/fees/:feeId/pay', async (request: FastifyRequest, reply: FastifyReply) => {
    const { feeId } = request.params as { feeId: string };

    const fee = await prisma.petFee.findUnique({ where: { id: feeId } });
    if (!fee) {
      return reply.status(404).send({ error: 'Fee not found' });
    }

    if (fee.status !== 'pending') {
      return reply.status(400).send({ error: 'Fee is not pending' });
    }

    const updated = await prisma.petFee.update({
      where: { id: feeId },
      data: {
        status: 'paid',
        paidDate: new Date(),
      },
    });

    // If this is a violation fine, mark incident as fine paid
    if (fee.feeType === 'violation_fine') {
      const incident = await prisma.petIncident.findFirst({
        where: {
          petId: fee.petId,
          fineAmount: fee.amount,
          finePaid: false,
        },
      });
      if (incident) {
        await prisma.petIncident.update({
          where: { id: incident.id },
          data: { finePaid: true },
        });
      }
    }

    return reply.send(updated);
  });

  // Waive fee
  app.post('/fees/:feeId/waive', async (request: FastifyRequest, reply: FastifyReply) => {
    const { feeId } = request.params as { feeId: string };
    const schema = z.object({
      reason: z.string(),
    });

    const body = schema.parse(request.body);

    try {
      const updated = await prisma.petFee.update({
        where: { id: feeId },
        data: {
          status: 'waived',
          waivedReason: body.reason,
        },
      });
      return reply.send(updated);
    } catch {
      return reply.status(404).send({ error: 'Fee not found' });
    }
  });

  // -------------------------------------------------------------------------
  // Property Reports
  // -------------------------------------------------------------------------

  // Get property pet census
  app.get('/census/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const census = await getPropertyPetCensus(propertyId);
    return reply.send(census);
  });

  // Get property incidents
  app.get('/incidents/property/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const schema = z.object({
      resolved: z
        .string()
        .transform((v) => v === 'true')
        .optional(),
      severity: z.enum(['minor', 'moderate', 'severe']).optional(),
    });

    const query = schema.parse(request.query);

    const incidents = await prisma.petIncident.findMany({
      where: {
        propertyId,
        ...(query.resolved !== undefined && { resolved: query.resolved }),
        ...(query.severity && { severity: query.severity }),
      },
    });

    return reply.send({ incidents, total: incidents.length });
  });

  // Risk assessment for all pets at property
  app.get('/risk-assessment/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };

    const propertyPets = await prisma.pet.findMany({
      where: {
        propertyId,
        status: 'approved',
      },
    });

    const assessments = await Promise.all(
      propertyPets.map(async (pet) => ({
        petId: pet.id,
        petName: pet.name,
        type: pet.type,
        breed: pet.breed,
        ...(await calculateRiskScore(pet.id)),
      }))
    );

    const highRisk = assessments.filter((a) => a.score < 50);
    const mediumRisk = assessments.filter((a) => a.score >= 50 && a.score < 75);
    const lowRisk = assessments.filter((a) => a.score >= 75);

    return reply.send({
      totalPets: assessments.length,
      assessments,
      summary: {
        highRisk: highRisk.length,
        mediumRisk: mediumRisk.length,
        lowRisk: lowRisk.length,
      },
    });
  });
}
