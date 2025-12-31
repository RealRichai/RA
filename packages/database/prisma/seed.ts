import { PrismaClient, Role, PropertyType, PropertyStatus, UnitStatus, LeaseStatus, PaymentType, PaymentStatus, WorkOrderStatus, WorkOrderPriority } from '@prisma/client';
import { hash } from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting comprehensive database seed...');

  const hashPassword = async (password: string) => hash(password, {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  // =============================================================================
  // Users - All Roles
  // =============================================================================
  console.log('\n📦 Creating users...');

  const admin = await prisma.user.upsert({
    where: { email: 'admin@realriches.com' },
    update: {},
    create: {
      email: 'admin@realriches.com',
      passwordHash: await hashPassword('Admin123!@#'),
      firstName: 'System',
      lastName: 'Admin',
      role: Role.super_admin,
      status: 'active',
      emailVerified: true,
    },
  });
  console.log('  ✓ Admin:', admin.email);

  const landlord = await prisma.user.upsert({
    where: { email: 'landlord@demo.com' },
    update: {},
    create: {
      email: 'landlord@demo.com',
      passwordHash: await hashPassword('Landlord123!@#'),
      firstName: 'Marcus',
      lastName: 'Chen',
      role: Role.landlord,
      status: 'active',
      emailVerified: true,
      phone: '+1-212-555-0100',
      landlordProfile: {
        create: {
          companyName: 'Chen Properties LLC',
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
  console.log('  ✓ Landlord:', landlord.email);

  const investor = await prisma.user.upsert({
    where: { email: 'investor@demo.com' },
    update: {},
    create: {
      email: 'investor@demo.com',
      passwordHash: await hashPassword('Investor123!@#'),
      firstName: 'Sarah',
      lastName: 'Williams',
      role: Role.investor,
      status: 'active',
      emailVerified: true,
      phone: '+1-212-555-0200',
    },
  });
  console.log('  ✓ Investor:', investor.email);

  const agent = await prisma.user.upsert({
    where: { email: 'agent@demo.com' },
    update: {},
    create: {
      email: 'agent@demo.com',
      passwordHash: await hashPassword('Agent123!@#'),
      firstName: 'Michael',
      lastName: 'Rodriguez',
      role: Role.agent,
      status: 'active',
      emailVerified: true,
      phone: '+1-212-555-0300',
      agentProfile: {
        create: {
          licenseNumber: 'NY-10029384',
          licenseState: 'NY',
          licenseExpiry: new Date('2026-12-31'),
          brokerage: 'RealRiches Realty',
          specializations: ['residential', 'luxury', 'investment'],
          serviceAreas: ['Manhattan', 'Brooklyn', 'Queens'],
          yearsExperience: 8,
          bio: 'Top-performing agent specializing in NYC investment properties.',
        },
      },
    },
  });
  console.log('  ✓ Agent:', agent.email);

  // Create multiple tenants
  const tenants = [];
  const tenantData = [
    { email: 'tenant1@demo.com', firstName: 'Emily', lastName: 'Johnson', phone: '+1-212-555-0401' },
    { email: 'tenant2@demo.com', firstName: 'David', lastName: 'Kim', phone: '+1-212-555-0402' },
    { email: 'tenant3@demo.com', firstName: 'Jessica', lastName: 'Martinez', phone: '+1-212-555-0403' },
    { email: 'tenant4@demo.com', firstName: 'James', lastName: 'Thompson', phone: '+1-212-555-0404' },
    { email: 'tenant5@demo.com', firstName: 'Amanda', lastName: 'Garcia', phone: '+1-212-555-0405' },
  ];

  for (const td of tenantData) {
    const tenant = await prisma.user.upsert({
      where: { email: td.email },
      update: {},
      create: {
        email: td.email,
        passwordHash: await hashPassword('Tenant123!@#'),
        firstName: td.firstName,
        lastName: td.lastName,
        role: Role.tenant,
        status: 'active',
        emailVerified: true,
        phone: td.phone,
        tenantProfile: {
          create: {
            employmentStatus: 'employed_full_time',
            applicationStatus: 'approved',
          },
        },
      },
    });
    tenants.push(tenant);
    console.log('  ✓ Tenant:', tenant.email);
  }

  // =============================================================================
  // Properties
  // =============================================================================
  console.log('\n🏢 Creating properties...');

  const propertyConfigs = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Sunset Heights Apartments',
      street1: '123 Main Street',
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
      type: PropertyType.multi_family,
      yearBuilt: 2015,
      totalUnits: 12,
      totalSquareFeet: 15000,
      stories: 4,
      parkingSpaces: 20,
      marketId: 'NYC',
      latitude: 40.7484,
      longitude: -73.9857,
      purchasePrice: 8500000,
      currentValue: 9200000,
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Brooklyn Heights Lofts',
      street1: '456 Atlantic Avenue',
      city: 'Brooklyn',
      state: 'NY',
      postalCode: '11217',
      type: PropertyType.multi_family,
      yearBuilt: 2018,
      totalUnits: 24,
      totalSquareFeet: 32000,
      stories: 6,
      parkingSpaces: 30,
      marketId: 'NYC',
      latitude: 40.6892,
      longitude: -73.9857,
      purchasePrice: 18000000,
      currentValue: 21000000,
    },
    {
      id: '00000000-0000-0000-0000-000000000003',
      name: 'Chelsea Townhouse',
      street1: '789 West 23rd Street',
      city: 'New York',
      state: 'NY',
      postalCode: '10011',
      type: PropertyType.single_family,
      yearBuilt: 1920,
      totalUnits: 1,
      totalSquareFeet: 4500,
      stories: 4,
      parkingSpaces: 1,
      marketId: 'NYC',
      latitude: 40.7465,
      longitude: -74.0014,
      purchasePrice: 5200000,
      currentValue: 5800000,
    },
  ];

  const properties = [];
  for (const config of propertyConfigs) {
    const property = await prisma.property.upsert({
      where: { id: config.id },
      update: {},
      create: {
        id: config.id,
        ownerId: landlord.id,
        name: config.name,
        street1: config.street1,
        city: config.city,
        state: config.state,
        postalCode: config.postalCode,
        country: 'US',
        latitude: config.latitude,
        longitude: config.longitude,
        type: config.type,
        status: PropertyStatus.active,
        yearBuilt: config.yearBuilt,
        totalUnits: config.totalUnits,
        totalSquareFeet: config.totalSquareFeet,
        stories: config.stories,
        parkingSpaces: config.parkingSpaces,
        amenities: ['doorman', 'elevator', 'gym', 'laundry_in_building', 'roof_deck', 'package_room'],
        description: `Premium ${config.type.replace('_', ' ')} in prime NYC location.`,
        marketId: config.marketId,
        complianceStatus: 'compliant',
      },
    });
    properties.push(property);
    console.log('  ✓ Property:', property.name);
  }

  // =============================================================================
  // Units
  // =============================================================================
  console.log('\n🚪 Creating units...');

  const unitConfigs = [
    // Sunset Heights units
    { propertyIndex: 0, number: '1A', floor: 1, type: 'studio', beds: 0, baths: 1, sqft: 450, rent: 250000 },
    { propertyIndex: 0, number: '1B', floor: 1, type: '1br', beds: 1, baths: 1, sqft: 650, rent: 325000 },
    { propertyIndex: 0, number: '2A', floor: 2, type: '1br', beds: 1, baths: 1, sqft: 700, rent: 350000 },
    { propertyIndex: 0, number: '2B', floor: 2, type: '2br', beds: 2, baths: 1, sqft: 900, rent: 450000 },
    { propertyIndex: 0, number: '3A', floor: 3, type: '2br', beds: 2, baths: 2, sqft: 1000, rent: 500000 },
    { propertyIndex: 0, number: '3B', floor: 3, type: '3br', beds: 3, baths: 2, sqft: 1200, rent: 600000 },
    // Brooklyn Heights units
    { propertyIndex: 1, number: '101', floor: 1, type: 'studio', beds: 0, baths: 1, sqft: 500, rent: 275000 },
    { propertyIndex: 1, number: '102', floor: 1, type: '1br', beds: 1, baths: 1, sqft: 700, rent: 375000 },
    { propertyIndex: 1, number: '201', floor: 2, type: '1br', beds: 1, baths: 1, sqft: 750, rent: 400000 },
    { propertyIndex: 1, number: '202', floor: 2, type: '2br', beds: 2, baths: 2, sqft: 1100, rent: 550000 },
    { propertyIndex: 1, number: '301', floor: 3, type: '2br', beds: 2, baths: 2, sqft: 1150, rent: 575000 },
    { propertyIndex: 1, number: '302', floor: 3, type: '3br', beds: 3, baths: 2, sqft: 1400, rent: 700000 },
  ];

  const units = [];
  for (const config of unitConfigs) {
    const property = properties[config.propertyIndex];
    const unit = await prisma.unit.upsert({
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
        rent: config.rent,
        status: UnitStatus.vacant,
        amenities: ['hardwood_floors', 'dishwasher', 'central_ac'],
        moveInReady: true,
      },
    });
    units.push(unit);
  }
  console.log(`  ✓ Created ${units.length} units`);

  // =============================================================================
  // Leases
  // =============================================================================
  console.log('\n📄 Creating leases...');

  const leaseStartDate = new Date();
  leaseStartDate.setMonth(leaseStartDate.getMonth() - 6);
  const leaseEndDate = new Date();
  leaseEndDate.setMonth(leaseEndDate.getMonth() + 6);

  const leases = [];
  for (let i = 0; i < Math.min(5, units.length, tenants.length); i++) {
    const unit = units[i];
    const tenant = tenants[i];

    // Update unit status to occupied
    await prisma.unit.update({
      where: { id: unit.id },
      data: { status: UnitStatus.occupied },
    });

    const lease = await prisma.lease.create({
      data: {
        unitId: unit.id,
        primaryTenantId: tenant.id,
        status: LeaseStatus.active,
        startDate: leaseStartDate,
        endDate: leaseEndDate,
        monthlyRent: unit.rent || 300000,
        securityDeposit: unit.rent || 300000,
        term: 12,
        type: 'fixed',
        signedAt: leaseStartDate,
      },
    });
    leases.push(lease);
    console.log(`  ✓ Lease for ${tenant.firstName} ${tenant.lastName} - Unit ${unit.unitNumber}`);
  }

  // =============================================================================
  // Payments
  // =============================================================================
  console.log('\n💵 Creating payment history...');

  const paymentTypes = [PaymentType.rent, PaymentType.rent, PaymentType.rent, PaymentType.late_fee, PaymentType.security_deposit];

  let paymentCount = 0;
  for (const lease of leases) {
    // Create 6 months of rent payments
    for (let monthOffset = -5; monthOffset <= 0; monthOffset++) {
      const scheduledDate = new Date();
      scheduledDate.setMonth(scheduledDate.getMonth() + monthOffset);
      scheduledDate.setDate(1);

      const paidDate = new Date(scheduledDate);
      paidDate.setDate(Math.random() > 0.1 ? 1 + Math.floor(Math.random() * 5) : 10 + Math.floor(Math.random() * 10)); // 90% on time

      await prisma.payment.create({
        data: {
          leaseId: lease.id,
          type: PaymentType.rent,
          amount: Number(lease.monthlyRent),
          status: PaymentStatus.completed,
          scheduledDate,
          paidAt: paidDate,
          paymentMethod: Math.random() > 0.3 ? 'ach' : 'card',
        },
      });
      paymentCount++;
    }
  }
  console.log(`  ✓ Created ${paymentCount} payments`);

  // =============================================================================
  // Work Orders
  // =============================================================================
  console.log('\n🔧 Creating work orders...');

  const workOrderCategories = ['plumbing', 'electrical', 'hvac', 'appliances', 'general'];
  const workOrderDescriptions = [
    'Leaky faucet in bathroom',
    'Light fixture not working',
    'AC not cooling properly',
    'Dishwasher making noise',
    'Door lock sticking',
    'Window won\'t close properly',
    'Garbage disposal jammed',
    'Thermostat not responding',
  ];

  let workOrderCount = 0;
  for (let i = 0; i < 15; i++) {
    const unit = units[Math.floor(Math.random() * units.length)];
    const category = workOrderCategories[Math.floor(Math.random() * workOrderCategories.length)];
    const description = workOrderDescriptions[Math.floor(Math.random() * workOrderDescriptions.length)];
    const priority = Math.random() > 0.7 ? WorkOrderPriority.high : Math.random() > 0.5 ? WorkOrderPriority.medium : WorkOrderPriority.low;
    const status = Math.random() > 0.3 ? WorkOrderStatus.completed : Math.random() > 0.5 ? WorkOrderStatus.in_progress : WorkOrderStatus.submitted;

    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - Math.floor(Math.random() * 60));

    await prisma.workOrder.create({
      data: {
        unitId: unit.id,
        category,
        description,
        priority,
        status,
        createdAt,
        completedAt: status === 'completed' ? new Date() : null,
        estimatedCost: Math.floor(Math.random() * 50000) + 5000, // $50-$550
        actualCost: status === 'completed' ? Math.floor(Math.random() * 50000) + 5000 : null,
      },
    });
    workOrderCount++;
  }
  console.log(`  ✓ Created ${workOrderCount} work orders`);

  // =============================================================================
  // Listings
  // =============================================================================
  console.log('\n📋 Creating listings...');

  const vacantUnits = units.filter((_, i) => i >= 5); // Units without leases
  for (const unit of vacantUnits.slice(0, 4)) {
    await prisma.listing.create({
      data: {
        unitId: unit.id,
        agentId: agent.id,
        title: `Beautiful ${unit.bedrooms}BR in ${unit.propertyId.includes('0001') ? 'Manhattan' : 'Brooklyn'}`,
        description: 'Stunning apartment with modern finishes. Featuring hardwood floors, stainless steel appliances, and amazing natural light.',
        rent: unit.rent || 400000,
        status: 'active',
        availableDate: new Date(),
        petPolicy: 'cats_allowed',
        laundry: 'in_building',
        photos: [],
        viewCount: Math.floor(Math.random() * 500) + 100,
        inquiryCount: Math.floor(Math.random() * 30) + 5,
      },
    });
  }
  console.log(`  ✓ Created ${Math.min(4, vacantUnits.length)} listings`);

  // =============================================================================
  // Vendors
  // =============================================================================
  console.log('\n🛠️ Creating vendors...');

  const vendorData = [
    { name: 'NYC Plumbing Pros', category: 'plumbing', email: 'info@nycplumbing.com', phone: '+1-212-555-1001' },
    { name: 'Empire Electric', category: 'electrical', email: 'contact@empireelectric.com', phone: '+1-212-555-1002' },
    { name: 'Metro HVAC Services', category: 'hvac', email: 'service@metrohvac.com', phone: '+1-212-555-1003' },
    { name: 'Urban Cleaning Co', category: 'cleaning', email: 'book@urbancleaning.com', phone: '+1-212-555-1004' },
    { name: 'Manhattan Locksmith', category: 'locksmith', email: 'help@manhattanlock.com', phone: '+1-212-555-1005' },
  ];

  for (const vd of vendorData) {
    await prisma.vendor.upsert({
      where: { email: vd.email },
      update: {},
      create: {
        name: vd.name,
        category: vd.category,
        email: vd.email,
        phone: vd.phone,
        status: 'active',
        rating: 4 + Math.random(),
        totalJobs: Math.floor(Math.random() * 50) + 10,
      },
    });
  }
  console.log(`  ✓ Created ${vendorData.length} vendors`);

  // =============================================================================
  // Feature Flags
  // =============================================================================
  console.log('\n🚩 Creating feature flags...');

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
    { key: '3dgs_vr_tours', name: '3DGS/VR Tours', enabled: true },
    { key: 'commercial_module', name: 'Commercial Module', enabled: true },
    { key: 'underwriting_tools', name: 'Underwriting Tools', enabled: true },
    { key: 'fractional_ownership', name: 'Fractional Ownership', enabled: false },
    { key: 'god_view_dashboard', name: 'God View Dashboard', enabled: true },
    { key: 'investor_portal', name: 'Investor Portal', enabled: true },
    { key: 'portfolio_analytics', name: 'Portfolio Analytics', enabled: true },
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
  console.log(`  ✓ Created ${featureFlags.length} feature flags`);

  // =============================================================================
  // Market Configurations
  // =============================================================================
  console.log('\n🌍 Creating market configurations...');

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
      marketId: 'MIA',
      name: 'Miami',
      state: 'FL',
      city: 'Miami',
      timezone: 'America/New_York',
      compliance: {
        fareActEnabled: false,
        fchaEnabled: true,
        goodCauseEnabled: false,
        rentStabilizationEnabled: false,
        sourceOfIncomeProtection: false,
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
  console.log(`  ✓ Created ${markets.length} market configurations`);

  // =============================================================================
  // Disclosures
  // =============================================================================
  console.log('\n📜 Creating disclosure templates...');

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

  await prisma.disclosure.createMany({
    data: disclosures,
    skipDuplicates: true,
  });
  console.log(`  ✓ Created ${disclosures.length} disclosure templates`);

  // =============================================================================
  // Summary
  // =============================================================================
  console.log('\n' + '='.repeat(60));
  console.log('🎉 Database seeding completed!');
  console.log('='.repeat(60));
  console.log('\n📊 Summary:');
  console.log(`  • Users: 1 admin, 1 landlord, 1 investor, 1 agent, ${tenants.length} tenants`);
  console.log(`  • Properties: ${properties.length}`);
  console.log(`  • Units: ${units.length}`);
  console.log(`  • Leases: ${leases.length}`);
  console.log(`  • Payments: ${paymentCount}`);
  console.log(`  • Work Orders: ${workOrderCount}`);
  console.log(`  • Vendors: ${vendorData.length}`);
  console.log(`  • Feature Flags: ${featureFlags.length}`);
  console.log(`  • Markets: ${markets.length}`);

  console.log('\n🔐 Demo Accounts:');
  console.log('  Admin:    admin@realriches.com / Admin123!@#');
  console.log('  Landlord: landlord@demo.com / Landlord123!@#');
  console.log('  Investor: investor@demo.com / Investor123!@#');
  console.log('  Agent:    agent@demo.com / Agent123!@#');
  console.log('  Tenant:   tenant1@demo.com / Tenant123!@#');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
