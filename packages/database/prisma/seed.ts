import { PrismaClient, Role, PropertyType, PropertyStatus, UnitStatus } from '@prisma/client';
import { hash } from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create admin user
  const adminPassword = await hash('Admin123!@#', {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@realriches.com' },
    update: {},
    create: {
      email: 'admin@realriches.com',
      passwordHash: adminPassword,
      firstName: 'System',
      lastName: 'Admin',
      role: Role.super_admin,
      status: 'active',
      emailVerified: true,
    },
  });
  console.log('✅ Created admin user:', admin.email);

  // Create demo landlord
  const landlordPassword = await hash('Landlord123!@#', {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const landlord = await prisma.user.upsert({
    where: { email: 'landlord@demo.com' },
    update: {},
    create: {
      email: 'landlord@demo.com',
      passwordHash: landlordPassword,
      firstName: 'Demo',
      lastName: 'Landlord',
      role: Role.landlord,
      status: 'active',
      emailVerified: true,
      landlordProfile: {
        create: {
          companyName: 'Demo Properties LLC',
          verificationStatus: 'verified',
          notificationPreferences: {
            email: true,
            sms: true,
            push: true,
            maintenanceAlerts: true,
            paymentAlerts: true,
            leaseAlerts: true,
            complianceAlerts: true,
          },
        },
      },
    },
  });
  console.log('✅ Created demo landlord:', landlord.email);

  // Create demo tenant
  const tenantPassword = await hash('Tenant123!@#', {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const tenant = await prisma.user.upsert({
    where: { email: 'tenant@demo.com' },
    update: {},
    create: {
      email: 'tenant@demo.com',
      passwordHash: tenantPassword,
      firstName: 'Demo',
      lastName: 'Tenant',
      role: Role.tenant,
      status: 'active',
      emailVerified: true,
      tenantProfile: {
        create: {
          employmentStatus: 'employed_full_time',
          applicationStatus: 'approved',
        },
      },
    },
  });
  console.log('✅ Created demo tenant:', tenant.email);

  // Create demo property
  const property = await prisma.property.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      ownerId: landlord.id,
      name: 'Sunset Heights Apartments',
      street1: '123 Main Street',
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
      country: 'US',
      latitude: 40.7484,
      longitude: -73.9857,
      type: PropertyType.multi_family,
      status: PropertyStatus.active,
      yearBuilt: 2015,
      totalUnits: 12,
      totalSquareFeet: 15000,
      stories: 4,
      parkingSpaces: 20,
      amenities: [
        'doorman',
        'elevator',
        'gym',
        'laundry_in_building',
        'roof_deck',
        'package_room',
      ],
      description: 'Luxury multi-family building in prime Manhattan location.',
      marketId: 'NYC',
      complianceStatus: 'compliant',
    },
  });
  console.log('✅ Created demo property:', property.name);

  // Create units for the property
  const unitConfigs = [
    { number: '1A', floor: 1, type: 'studio', beds: 0, baths: 1, sqft: 450, rent: 250000 },
    { number: '1B', floor: 1, type: '1br', beds: 1, baths: 1, sqft: 650, rent: 325000 },
    { number: '2A', floor: 2, type: '1br', beds: 1, baths: 1, sqft: 700, rent: 350000 },
    { number: '2B', floor: 2, type: '2br', beds: 2, baths: 1, sqft: 900, rent: 450000 },
    { number: '3A', floor: 3, type: '2br', beds: 2, baths: 2, sqft: 1000, rent: 500000 },
    { number: '3B', floor: 3, type: '3br', beds: 3, baths: 2, sqft: 1200, rent: 600000 },
  ];

  for (const config of unitConfigs) {
    await prisma.unit.upsert({
      where: {
        propertyId_unitNumber: {
          propertyId: property.id,
          unitNumber: config.number,
        },
      },
      update: {},
      create: {
        propertyId: property.id,
        unitNumber: config.number,
        floor: config.floor,
        type: config.type,
        bedrooms: config.beds,
        bathrooms: config.baths,
        squareFeet: config.sqft,
        marketRentAmount: config.rent,
        status: config.number === '2A' ? UnitStatus.occupied : UnitStatus.vacant,
        amenities: ['hardwood_floors', 'dishwasher', 'central_ac'],
        moveInReady: true,
      },
    });
  }
  console.log('✅ Created units for property');

  // Create feature flags
  const featureFlags = [
    { key: 'ai_leasing_concierge', name: 'AI Leasing Concierge', enabled: true },
    { key: 'ai_voice_assistant', name: 'AI Voice Assistant', enabled: true },
    { key: 'ai_maintenance_triage', name: 'AI Maintenance Triage', enabled: true },
    { key: 'compliance_autopilot', name: 'Compliance Autopilot', enabled: true },
    { key: 'fare_act_enforcement', name: 'FARE Act Enforcement', enabled: true },
    { key: 'good_cause_enforcement', name: 'Good Cause Eviction', enabled: true },
    { key: 'leaselock_integration', name: 'LeaseLock Integration', enabled: true },
    { key: 'rhino_integration', name: 'Rhino Integration', enabled: true },
    { key: 'rebny_lease_templates', name: 'REBNY Lease Templates', enabled: true },
    { key: 'digital_vault', name: 'Digital Vault', enabled: true },
    { key: 'flyer_generator', name: 'Flyer Generator', enabled: true },
    { key: 'video_tours', name: 'Video Tours', enabled: true },
    { key: '3dgs_vr_tours', name: '3DGS/VR Tours', enabled: false },
    { key: 'commercial_module', name: 'Commercial Module', enabled: false },
    { key: 'underwriting_tools', name: 'Underwriting Tools', enabled: false },
    { key: 'fractional_ownership', name: 'Fractional Ownership', enabled: false },
    { key: 'god_view_dashboard', name: 'God View Dashboard', enabled: true },
  ];

  for (const flag of featureFlags) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      update: {},
      create: {
        key: flag.key,
        name: flag.name,
        enabled: flag.enabled,
        defaultValue: flag.enabled,
        type: 'boolean',
      },
    });
  }
  console.log('✅ Created feature flags');

  // Create market configurations
  const markets = [
    {
      marketId: 'NYC',
      name: 'New York City',
      state: 'NY',
      city: 'New York',
      timezone: 'America/New_York',
      compliance: {
        fareActEnabled: true,
        fchaEnabled: true,
        goodCauseEnabled: true,
        rentStabilizationEnabled: true,
        sourceOfIncomeProtection: true,
        brokerFeeRegulations: true,
      },
      features: {
        rebnyLeases: true,
        digitalVault: true,
        aiConcierge: true,
        complianceAutopilot: true,
      },
    },
    {
      marketId: 'LA',
      name: 'Los Angeles',
      state: 'CA',
      city: 'Los Angeles',
      timezone: 'America/Los_Angeles',
      compliance: {
        fareActEnabled: false,
        fchaEnabled: true,
        goodCauseEnabled: false,
        rentStabilizationEnabled: true,
        sourceOfIncomeProtection: true,
      },
      features: {
        rebnyLeases: false,
        digitalVault: true,
        aiConcierge: true,
        complianceAutopilot: true,
      },
    },
    {
      marketId: 'SF',
      name: 'San Francisco',
      state: 'CA',
      city: 'San Francisco',
      timezone: 'America/Los_Angeles',
      compliance: {
        fareActEnabled: false,
        fchaEnabled: true,
        goodCauseEnabled: false,
        rentStabilizationEnabled: true,
        sourceOfIncomeProtection: true,
      },
      features: {
        rebnyLeases: false,
        digitalVault: true,
        aiConcierge: true,
        complianceAutopilot: true,
      },
    },
  ];

  for (const market of markets) {
    await prisma.marketConfig.upsert({
      where: { marketId: market.marketId },
      update: {},
      create: market,
    });
  }
  console.log('✅ Created market configurations');

  // Create disclosure templates
  const disclosures = [
    {
      type: 'lead_paint',
      name: 'Lead-Based Paint Disclosure',
      description: 'Required disclosure for properties built before 1978',
      marketId: 'NYC',
      requiredFor: ['lease', 'application'],
      signatureRequired: true,
      content: 'This disclosure is required under federal law for housing built before 1978...',
      legalCitation: '42 U.S.C. 4852d',
      effectiveDate: new Date('1996-03-06'),
    },
    {
      type: 'bedbug',
      name: 'Bedbug Infestation History',
      description: 'Required disclosure of bedbug history in NYC',
      marketId: 'NYC',
      requiredFor: ['lease'],
      signatureRequired: true,
      content: 'The landlord must disclose any known bedbug infestation history...',
      legalCitation: 'NYC Admin Code § 27-2018.1',
      effectiveDate: new Date('2017-08-01'),
    },
    {
      type: 'fare_act',
      name: 'FARE Act Tenant Screening Notice',
      description: 'Required notice under NYC FARE Act',
      marketId: 'NYC',
      requiredFor: ['application'],
      signatureRequired: true,
      content: 'Under the FARE Act, landlords must follow specific screening criteria...',
      legalCitation: 'NYC Local Law 60',
      effectiveDate: new Date('2024-01-01'),
    },
  ];

  // Use createMany to avoid UUID issues with upsert
  await prisma.disclosure.createMany({
    data: disclosures,
    skipDuplicates: true,
  });
  console.log('✅ Created disclosure templates');

  console.log('');
  console.log('🎉 Database seeding completed!');
  console.log('');
  console.log('Demo accounts:');
  console.log('  Admin: admin@realriches.com / Admin123!@#');
  console.log('  Landlord: landlord@demo.com / Landlord123!@#');
  console.log('  Tenant: tenant@demo.com / Tenant123!@#');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
