import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

export type PetType = 'dog' | 'cat' | 'bird' | 'fish' | 'reptile' | 'small_mammal' | 'other';
export type PetStatus = 'pending_approval' | 'approved' | 'denied' | 'removed';
export type VaccinationType = 'rabies' | 'distemper' | 'parvo' | 'bordetella' | 'feline_leukemia' | 'other';
export type IncidentSeverity = 'minor' | 'moderate' | 'severe';
export type IncidentType = 'noise' | 'aggression' | 'property_damage' | 'waste' | 'off_leash' | 'other';

export interface Pet {
  id: string;
  leaseId: string;
  propertyId: string;
  tenantId: string;
  name: string;
  type: PetType;
  breed: string;
  weight: number; // in pounds
  age: number; // in years
  color: string;
  isServiceAnimal: boolean;
  isEmotionalSupport: boolean;
  microchipNumber?: string;
  licenseNumber?: string;
  veterinarian?: {
    name: string;
    phone: string;
    address: string;
  };
  photoUrl?: string;
  status: PetStatus;
  denialReason?: string;
  registrationDate: string;
  approvalDate?: string;
  removalDate?: string;
  removalReason?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BreedRestriction {
  id: string;
  propertyId: string;
  petType: PetType;
  breed: string;
  reason: string;
  createdAt: string;
}

export interface PetPolicy {
  id: string;
  propertyId: string;
  maxPets: number;
  allowedTypes: PetType[];
  maxWeight: number; // in pounds
  petDeposit: number;
  monthlyPetRent: number;
  oneTimePetFee: number;
  serviceAnimalExempt: boolean;
  emotionalSupportExempt: boolean;
  requiresVaccinations: boolean;
  requiresLicense: boolean;
  requiresInsurance: boolean;
  insuranceMinCoverage: number;
  restrictedBreeds: string[];
  additionalRules?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaccinationRecord {
  id: string;
  petId: string;
  type: VaccinationType;
  vaccineName: string;
  administeredDate: string;
  expirationDate: string;
  veterinarianName: string;
  verified: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
  documentUrl?: string;
  createdAt: string;
}

export interface PetIncident {
  id: string;
  petId: string;
  propertyId: string;
  reportedBy: string;
  incidentType: IncidentType;
  severity: IncidentSeverity;
  description: string;
  incidentDate: string;
  location: string;
  witnesses?: string[];
  actionTaken?: string;
  fineAmount?: number;
  finePaid: boolean;
  resolved: boolean;
  resolutionNotes?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface PetScreening {
  id: string;
  petId: string;
  screeningDate: string;
  provider: string;
  score: number; // 0-100 FIDO score style
  riskLevel: 'low' | 'medium' | 'high';
  breedVerified: boolean;
  vaccinationsVerified: boolean;
  behaviorAssessment: string;
  recommendations: string[];
  documentUrl?: string;
  createdAt: string;
}

export interface PetFee {
  id: string;
  petId: string;
  leaseId: string;
  feeType: 'deposit' | 'monthly_rent' | 'one_time' | 'violation_fine';
  amount: number;
  dueDate: string;
  paidDate?: string;
  status: 'pending' | 'paid' | 'waived' | 'refunded';
  waivedReason?: string;
  notes?: string;
  createdAt: string;
}

// ============================================================================
// In-Memory Storage (placeholder for Prisma)
// ============================================================================

export const pets = new Map<string, Pet>();
export const breedRestrictions = new Map<string, BreedRestriction>();
export const petPolicies = new Map<string, PetPolicy>();
export const vaccinationRecords = new Map<string, VaccinationRecord>();
export const petIncidents = new Map<string, PetIncident>();
export const petScreenings = new Map<string, PetScreening>();
export const petFees = new Map<string, PetFee>();

// ============================================================================
// Helper Functions
// ============================================================================

export function checkBreedRestriction(
  propertyId: string,
  petType: PetType,
  breed: string
): { restricted: boolean; reason?: string } {
  const restrictions = Array.from(breedRestrictions.values()).filter(
    (r) => r.propertyId === propertyId && r.petType === petType
  );

  const normalizedBreed = breed.toLowerCase();
  const matchingRestriction = restrictions.find((r) =>
    normalizedBreed.includes(r.breed.toLowerCase()) || r.breed.toLowerCase().includes(normalizedBreed)
  );

  if (matchingRestriction) {
    return { restricted: true, reason: matchingRestriction.reason };
  }

  return { restricted: false };
}

export function validatePetAgainstPolicy(
  pet: Partial<Pet>,
  policy: PetPolicy
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
  policy: PetPolicy,
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

export function getVaccinationStatus(petId: string): {
  upToDate: boolean;
  expired: VaccinationRecord[];
  expiringSoon: VaccinationRecord[];
  missing: VaccinationType[];
} {
  const records = Array.from(vaccinationRecords.values()).filter((r) => r.petId === petId);
  const today = new Date();
  const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

  const expired: VaccinationRecord[] = [];
  const expiringSoon: VaccinationRecord[] = [];
  const vaccineTypes = new Set<VaccinationType>();

  for (const record of records) {
    vaccineTypes.add(record.type);
    const expDate = new Date(record.expirationDate);

    if (expDate < today) {
      expired.push(record);
    } else if (expDate < thirtyDaysFromNow) {
      expiringSoon.push(record);
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

export function getIncidentHistory(
  petId: string
): { totalIncidents: number; byType: Record<IncidentType, number>; totalFines: number; unpaidFines: number } {
  const incidents = Array.from(petIncidents.values()).filter((i) => i.petId === petId);

  const byType: Record<IncidentType, number> = {
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

export function calculateRiskScore(petId: string): { score: number; factors: string[] } {
  const pet = pets.get(petId);
  if (!pet) {
    return { score: 0, factors: ['Pet not found'] };
  }

  let score = 100; // Start with perfect score
  const factors: string[] = [];

  // Check vaccination status
  const vaccStatus = getVaccinationStatus(petId);
  if (!vaccStatus.upToDate) {
    score -= 20;
    factors.push('Vaccinations not up to date');
  }
  if (vaccStatus.expiringSoon.length > 0) {
    score -= 5;
    factors.push(`${vaccStatus.expiringSoon.length} vaccination(s) expiring soon`);
  }

  // Check incident history
  const incidents = getIncidentHistory(petId);
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

export function getPropertyPetCensus(propertyId: string): {
  totalPets: number;
  byType: Record<PetType, number>;
  byStatus: Record<PetStatus, number>;
  serviceAnimals: number;
  emotionalSupport: number;
} {
  const propertyPets = Array.from(pets.values()).filter((p) => p.propertyId === propertyId);

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
    const now = new Date().toISOString();

    // Check if policy exists for property
    const existingPolicy = Array.from(petPolicies.values()).find((p) => p.propertyId === body.propertyId);

    if (existingPolicy) {
      // Update existing
      const updated: PetPolicy = {
        ...existingPolicy,
        ...body,
        updatedAt: now,
      };
      petPolicies.set(updated.id, updated);
      return reply.status(200).send(updated);
    }

    // Create new
    const policy: PetPolicy = {
      id: `policy_${Date.now()}`,
      ...body,
      createdAt: now,
      updatedAt: now,
    };

    petPolicies.set(policy.id, policy);
    return reply.status(201).send(policy);
  });

  // Get pet policy for property
  app.get('/policies/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const policy = Array.from(petPolicies.values()).find((p) => p.propertyId === propertyId);

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

    const restriction: BreedRestriction = {
      id: `restriction_${Date.now()}`,
      ...body,
      createdAt: new Date().toISOString(),
    };

    breedRestrictions.set(restriction.id, restriction);
    return reply.status(201).send(restriction);
  });

  // List breed restrictions for property
  app.get('/restrictions/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const restrictions = Array.from(breedRestrictions.values()).filter((r) => r.propertyId === propertyId);
    return reply.send({ restrictions });
  });

  // Remove breed restriction
  app.delete('/restrictions/:restrictionId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { restrictionId } = request.params as { restrictionId: string };

    if (!breedRestrictions.has(restrictionId)) {
      return reply.status(404).send({ error: 'Restriction not found' });
    }

    breedRestrictions.delete(restrictionId);
    return reply.status(204).send();
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
    const now = new Date().toISOString();

    // Check breed restriction
    const breedCheck = checkBreedRestriction(body.propertyId, body.type, body.breed);
    if (breedCheck.restricted && !body.isServiceAnimal && !body.isEmotionalSupport) {
      return reply.status(400).send({
        error: 'Breed restricted',
        reason: breedCheck.reason,
      });
    }

    // Validate against policy if exists
    const policy = Array.from(petPolicies.values()).find((p) => p.propertyId === body.propertyId);
    if (policy) {
      const validation = validatePetAgainstPolicy(body, policy);
      if (!validation.valid) {
        return reply.status(400).send({
          error: 'Pet does not meet property policy',
          violations: validation.violations,
        });
      }

      // Check max pets for tenant
      const tenantPets = Array.from(pets.values()).filter(
        (p) => p.tenantId === body.tenantId && p.leaseId === body.leaseId && p.status === 'approved'
      );
      if (tenantPets.length >= policy.maxPets && !body.isServiceAnimal && !body.isEmotionalSupport) {
        return reply.status(400).send({
          error: 'Maximum pet limit reached',
          maxPets: policy.maxPets,
          currentPets: tenantPets.length,
        });
      }
    }

    // Auto-approve service animals and ESAs
    const status: PetStatus =
      body.isServiceAnimal || body.isEmotionalSupport ? 'approved' : 'pending_approval';

    const pet: Pet = {
      id: `pet_${Date.now()}`,
      ...body,
      status,
      registrationDate: now,
      approvalDate: status === 'approved' ? now : undefined,
      createdAt: now,
      updatedAt: now,
    };

    pets.set(pet.id, pet);

    // Create pet fees if applicable
    if (policy && status === 'approved') {
      const fees = calculatePetFees(policy, body.isServiceAnimal, body.isEmotionalSupport);

      if (fees.deposit > 0) {
        const depositFee: PetFee = {
          id: `petfee_${Date.now()}_deposit`,
          petId: pet.id,
          leaseId: body.leaseId,
          feeType: 'deposit',
          amount: fees.deposit,
          dueDate: now,
          status: 'pending',
          createdAt: now,
        };
        petFees.set(depositFee.id, depositFee);
      }

      if (fees.oneTimeFee > 0) {
        const oneTimeFee: PetFee = {
          id: `petfee_${Date.now()}_onetime`,
          petId: pet.id,
          leaseId: body.leaseId,
          feeType: 'one_time',
          amount: fees.oneTimeFee,
          dueDate: now,
          status: 'pending',
          createdAt: now,
        };
        petFees.set(oneTimeFee.id, oneTimeFee);
      }
    }

    return reply.status(201).send(pet);
  });

  // Get pet by ID
  app.get('/:petId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { petId } = request.params as { petId: string };
    const pet = pets.get(petId);

    if (!pet) {
      return reply.status(404).send({ error: 'Pet not found' });
    }

    // Include additional details
    const vaccStatus = getVaccinationStatus(petId);
    const incidentHistory = getIncidentHistory(petId);
    const riskScore = calculateRiskScore(petId);

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
    let result = Array.from(pets.values());

    if (query.propertyId) {
      result = result.filter((p) => p.propertyId === query.propertyId);
    }
    if (query.tenantId) {
      result = result.filter((p) => p.tenantId === query.tenantId);
    }
    if (query.leaseId) {
      result = result.filter((p) => p.leaseId === query.leaseId);
    }
    if (query.type) {
      result = result.filter((p) => p.type === query.type);
    }
    if (query.status) {
      result = result.filter((p) => p.status === query.status);
    }

    return reply.send({ pets: result, total: result.length });
  });

  // Approve pet registration
  app.post('/:petId/approve', async (request: FastifyRequest, reply: FastifyReply) => {
    const { petId } = request.params as { petId: string };
    const pet = pets.get(petId);

    if (!pet) {
      return reply.status(404).send({ error: 'Pet not found' });
    }

    if (pet.status !== 'pending_approval') {
      return reply.status(400).send({ error: 'Pet is not pending approval' });
    }

    const now = new Date().toISOString();
    const updated: Pet = {
      ...pet,
      status: 'approved',
      approvalDate: now,
      updatedAt: now,
    };

    pets.set(petId, updated);

    // Create pet fees
    const policy = Array.from(petPolicies.values()).find((p) => p.propertyId === pet.propertyId);
    if (policy) {
      const fees = calculatePetFees(policy, pet.isServiceAnimal, pet.isEmotionalSupport);

      if (fees.deposit > 0) {
        const depositFee: PetFee = {
          id: `petfee_${Date.now()}_deposit`,
          petId: pet.id,
          leaseId: pet.leaseId,
          feeType: 'deposit',
          amount: fees.deposit,
          dueDate: now,
          status: 'pending',
          createdAt: now,
        };
        petFees.set(depositFee.id, depositFee);
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
    const pet = pets.get(petId);

    if (!pet) {
      return reply.status(404).send({ error: 'Pet not found' });
    }

    if (pet.status !== 'pending_approval') {
      return reply.status(400).send({ error: 'Pet is not pending approval' });
    }

    const updated: Pet = {
      ...pet,
      status: 'denied',
      denialReason: body.reason,
      updatedAt: new Date().toISOString(),
    };

    pets.set(petId, updated);
    return reply.send(updated);
  });

  // Remove pet (move-out, rehoming, death, etc.)
  app.post('/:petId/remove', async (request: FastifyRequest, reply: FastifyReply) => {
    const { petId } = request.params as { petId: string };
    const schema = z.object({
      reason: z.string(),
    });

    const body = schema.parse(request.body);
    const pet = pets.get(petId);

    if (!pet) {
      return reply.status(404).send({ error: 'Pet not found' });
    }

    const now = new Date().toISOString();
    const updated: Pet = {
      ...pet,
      status: 'removed',
      removalDate: now,
      removalReason: body.reason,
      updatedAt: now,
    };

    pets.set(petId, updated);
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

    if (!pets.has(petId)) {
      return reply.status(404).send({ error: 'Pet not found' });
    }

    const record: VaccinationRecord = {
      id: `vacc_${Date.now()}`,
      petId,
      ...body,
      verified: false,
      createdAt: new Date().toISOString(),
    };

    vaccinationRecords.set(record.id, record);
    return reply.status(201).send(record);
  });

  // Get vaccination records for pet
  app.get('/:petId/vaccinations', async (request: FastifyRequest, reply: FastifyReply) => {
    const { petId } = request.params as { petId: string };

    if (!pets.has(petId)) {
      return reply.status(404).send({ error: 'Pet not found' });
    }

    const records = Array.from(vaccinationRecords.values()).filter((r) => r.petId === petId);
    const status = getVaccinationStatus(petId);

    return reply.send({ records, status });
  });

  // Verify vaccination
  app.post('/vaccinations/:vaccinationId/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const { vaccinationId } = request.params as { vaccinationId: string };
    const schema = z.object({
      verifiedBy: z.string(),
    });

    const body = schema.parse(request.body);
    const record = vaccinationRecords.get(vaccinationId);

    if (!record) {
      return reply.status(404).send({ error: 'Vaccination record not found' });
    }

    const updated: VaccinationRecord = {
      ...record,
      verified: true,
      verifiedBy: body.verifiedBy,
      verifiedAt: new Date().toISOString(),
    };

    vaccinationRecords.set(vaccinationId, updated);
    return reply.send(updated);
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
    const pet = pets.get(petId);

    if (!pet) {
      return reply.status(404).send({ error: 'Pet not found' });
    }

    const incident: PetIncident = {
      id: `incident_${Date.now()}`,
      petId,
      propertyId: pet.propertyId,
      ...body,
      finePaid: false,
      resolved: false,
      createdAt: new Date().toISOString(),
    };

    petIncidents.set(incident.id, incident);

    // Create violation fine fee if applicable
    if (body.fineAmount && body.fineAmount > 0) {
      const fine: PetFee = {
        id: `petfee_${Date.now()}_fine`,
        petId,
        leaseId: pet.leaseId,
        feeType: 'violation_fine',
        amount: body.fineAmount,
        dueDate: new Date().toISOString(),
        status: 'pending',
        notes: `Fine for ${body.incidentType} incident`,
        createdAt: new Date().toISOString(),
      };
      petFees.set(fine.id, fine);
    }

    return reply.status(201).send(incident);
  });

  // Get incidents for pet
  app.get('/:petId/incidents', async (request: FastifyRequest, reply: FastifyReply) => {
    const { petId } = request.params as { petId: string };

    if (!pets.has(petId)) {
      return reply.status(404).send({ error: 'Pet not found' });
    }

    const incidents = Array.from(petIncidents.values()).filter((i) => i.petId === petId);
    const history = getIncidentHistory(petId);

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
    const incident = petIncidents.get(incidentId);

    if (!incident) {
      return reply.status(404).send({ error: 'Incident not found' });
    }

    const updated: PetIncident = {
      ...incident,
      resolved: true,
      resolutionNotes: body.resolutionNotes,
      actionTaken: body.actionTaken,
      resolvedAt: new Date().toISOString(),
    };

    petIncidents.set(incidentId, updated);
    return reply.send(updated);
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

    if (!pets.has(petId)) {
      return reply.status(404).send({ error: 'Pet not found' });
    }

    const screening: PetScreening = {
      id: `screening_${Date.now()}`,
      petId,
      screeningDate: new Date().toISOString(),
      ...body,
      createdAt: new Date().toISOString(),
    };

    petScreenings.set(screening.id, screening);
    return reply.status(201).send(screening);
  });

  // Get screening history
  app.get('/:petId/screening', async (request: FastifyRequest, reply: FastifyReply) => {
    const { petId } = request.params as { petId: string };

    if (!pets.has(petId)) {
      return reply.status(404).send({ error: 'Pet not found' });
    }

    const screenings = Array.from(petScreenings.values())
      .filter((s) => s.petId === petId)
      .sort((a, b) => new Date(b.screeningDate).getTime() - new Date(a.screeningDate).getTime());

    return reply.send({ screenings, latest: screenings[0] || null });
  });

  // -------------------------------------------------------------------------
  // Pet Fees
  // -------------------------------------------------------------------------

  // Get fees for pet
  app.get('/:petId/fees', async (request: FastifyRequest, reply: FastifyReply) => {
    const { petId } = request.params as { petId: string };

    if (!pets.has(petId)) {
      return reply.status(404).send({ error: 'Pet not found' });
    }

    const fees = Array.from(petFees.values()).filter((f) => f.petId === petId);
    const totalOwed = fees.filter((f) => f.status === 'pending').reduce((sum, f) => sum + f.amount, 0);
    const totalPaid = fees.filter((f) => f.status === 'paid').reduce((sum, f) => sum + f.amount, 0);

    return reply.send({ fees, totalOwed, totalPaid });
  });

  // Pay fee
  app.post('/fees/:feeId/pay', async (request: FastifyRequest, reply: FastifyReply) => {
    const { feeId } = request.params as { feeId: string };
    const fee = petFees.get(feeId);

    if (!fee) {
      return reply.status(404).send({ error: 'Fee not found' });
    }

    if (fee.status !== 'pending') {
      return reply.status(400).send({ error: 'Fee is not pending' });
    }

    const updated: PetFee = {
      ...fee,
      status: 'paid',
      paidDate: new Date().toISOString(),
    };

    petFees.set(feeId, updated);

    // If this is a violation fine, mark incident as fine paid
    if (fee.feeType === 'violation_fine') {
      const incident = Array.from(petIncidents.values()).find(
        (i) => i.petId === fee.petId && i.fineAmount === fee.amount && !i.finePaid
      );
      if (incident) {
        petIncidents.set(incident.id, { ...incident, finePaid: true });
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
    const fee = petFees.get(feeId);

    if (!fee) {
      return reply.status(404).send({ error: 'Fee not found' });
    }

    const updated: PetFee = {
      ...fee,
      status: 'waived',
      waivedReason: body.reason,
    };

    petFees.set(feeId, updated);
    return reply.send(updated);
  });

  // -------------------------------------------------------------------------
  // Property Reports
  // -------------------------------------------------------------------------

  // Get property pet census
  app.get('/census/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const census = getPropertyPetCensus(propertyId);
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
    let incidents = Array.from(petIncidents.values()).filter((i) => i.propertyId === propertyId);

    if (query.resolved !== undefined) {
      incidents = incidents.filter((i) => i.resolved === query.resolved);
    }
    if (query.severity) {
      incidents = incidents.filter((i) => i.severity === query.severity);
    }

    return reply.send({ incidents, total: incidents.length });
  });

  // Risk assessment for all pets at property
  app.get('/risk-assessment/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const propertyPets = Array.from(pets.values()).filter(
      (p) => p.propertyId === propertyId && p.status === 'approved'
    );

    const assessments = propertyPets.map((pet) => ({
      petId: pet.id,
      petName: pet.name,
      type: pet.type,
      breed: pet.breed,
      ...calculateRiskScore(pet.id),
    }));

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
