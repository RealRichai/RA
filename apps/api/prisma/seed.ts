/**
 * Database Seed Script
 * Creates sample data for development and testing
 */

import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
};

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

async function main() {
  console.log('🌱 Starting database seed...');

  // Clear existing data
  console.log('Clearing existing data...');
  await prisma.agentFeedback.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.tour.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.lease.deleteMany();
  await prisma.application.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.auditLog.deleteMany();

  // Create users
  console.log('Creating users...');
  const defaultPassword = await hashPassword('Password123!');

  const admin = await prisma.user.create({
    data: {
      email: 'admin@realriches.com',
      passwordHash: defaultPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  const landlord = await prisma.user.create({
    data: {
      email: 'landlord@example.com',
      passwordHash: defaultPassword,
      firstName: 'John',
      lastName: 'Landlord',
      role: 'LANDLORD',
      status: 'ACTIVE',
      emailVerified: true,
      emailVerifiedAt: new Date(),
      phone: '+12125551001',
      phoneVerified: true,
    },
  });

  const agent = await prisma.user.create({
    data: {
      email: 'agent@realty.com',
      passwordHash: defaultPassword,
      firstName: 'Sarah',
      lastName: 'Agent',
      role: 'AGENT',
      status: 'ACTIVE',
      emailVerified: true,
      emailVerifiedAt: new Date(),
      phone: '+12125551002',
      phoneVerified: true,
      licenseNumber: 'NY-12345678',
      licenseState: 'NY',
      licenseExpiry: new Date('2026-12-31'),
      brokerageName: 'NYC Premier Realty',
      brokerageAddress: '123 Broadway, New York, NY 10001',
    },
  });

  const tenant1 = await prisma.user.create({
    data: {
      email: 'tenant@gmail.com',
      passwordHash: defaultPassword,
      firstName: 'Alice',
      lastName: 'Tenant',
      role: 'TENANT',
      status: 'ACTIVE',
      emailVerified: true,
      emailVerifiedAt: new Date(),
      phone: '+12125551003',
    },
  });

  const tenant2 = await prisma.user.create({
    data: {
      email: 'bob.renter@gmail.com',
      passwordHash: defaultPassword,
      firstName: 'Bob',
      lastName: 'Renter',
      role: 'TENANT',
      status: 'ACTIVE',
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  const investor = await prisma.user.create({
    data: {
      email: 'investor@capital.com',
      passwordHash: defaultPassword,
      firstName: 'Carol',
      lastName: 'Investor',
      role: 'INVESTOR',
      status: 'ACTIVE',
      emailVerified: true,
      emailVerifiedAt: new Date(),
      accreditedInvestor: true,
      investmentPreferences: {
        preferredBoroughs: ['Manhattan', 'Brooklyn'],
        minCapRate: 5,
        maxPrice: 5000000,
      },
    },
  });

  console.log(`Created ${6} users`);

  // Create listings
  console.log('Creating listings...');

  const listing1 = await prisma.listing.create({
    data: {
      ownerId: landlord.id,
      agentId: agent.id,
      type: 'RENTAL',
      status: 'ACTIVE',
      propertyType: 'ONE_BEDROOM',
      title: 'Stunning 1BR in Chelsea with City Views',
      description: 'Beautiful renovated 1-bedroom apartment in the heart of Chelsea. Features exposed brick, hardwood floors throughout, stainless steel appliances, and amazing city views from the 12th floor. Close to the High Line, Hudson Yards, and multiple subway lines.',
      address: '245 W 23rd St',
      unit: '12B',
      city: 'New York',
      state: 'NY',
      zipCode: '10011',
      neighborhood: 'Chelsea',
      borough: 'Manhattan',
      latitude: 40.7444,
      longitude: -73.9986,
      bedrooms: 1,
      bathrooms: 1,
      squareFeet: 650,
      floor: 12,
      totalFloors: 20,
      yearBuilt: 1998,
      rentPrice: 3500,
      securityDeposit: 3500,
      brokerFee: 0,
      applicationFee: 20,
      fareActCompliant: true,
      fareActDisclosures: {
        noBrokerFee: true,
        landlordPays: true,
      },
      availableDate: new Date('2025-02-01'),
      leaseTermMonths: 12,
      amenities: ['Doorman', 'Elevator', 'Gym', 'Rooftop', 'Laundry in Building', 'Central AC'],
      utilitiesIncluded: ['Water', 'Trash'],
      petPolicy: 'Dogs and cats allowed with $500 deposit',
      photos: [
        { url: 'https://example.com/photos/1.jpg', caption: 'Living Room' },
        { url: 'https://example.com/photos/2.jpg', caption: 'Kitchen' },
        { url: 'https://example.com/photos/3.jpg', caption: 'Bedroom' },
      ],
      aiDescription: 'This light-filled Chelsea apartment offers the perfect blend of classic NYC charm and modern amenities.',
      aiHighlights: ['Walk to High Line', 'Renovated kitchen', 'Pet-friendly'],
      hiddenGemScore: 85,
      viewCount: 142,
      inquiryCount: 12,
      publishedAt: new Date(),
    },
  });

  const listing2 = await prisma.listing.create({
    data: {
      ownerId: landlord.id,
      agentId: agent.id,
      type: 'RENTAL',
      status: 'ACTIVE',
      propertyType: 'TWO_BEDROOM',
      title: 'Spacious 2BR Brownstone in Park Slope',
      description: 'Charming 2-bedroom apartment in a classic Park Slope brownstone. Features original details including crown moldings, decorative fireplace, and bay windows. Modern updates include a renovated kitchen with dishwasher and in-unit washer/dryer.',
      address: '312 7th Ave',
      unit: '2',
      city: 'Brooklyn',
      state: 'NY',
      zipCode: '11215',
      neighborhood: 'Park Slope',
      borough: 'Brooklyn',
      latitude: 40.6681,
      longitude: -73.9822,
      bedrooms: 2,
      bathrooms: 1,
      squareFeet: 950,
      floor: 2,
      totalFloors: 4,
      yearBuilt: 1910,
      rentPrice: 4200,
      securityDeposit: 4200,
      brokerFee: 0,
      applicationFee: 20,
      fareActCompliant: true,
      availableDate: new Date('2025-01-15'),
      leaseTermMonths: 12,
      amenities: ['In-Unit Washer/Dryer', 'Dishwasher', 'Backyard Access', 'Storage'],
      utilitiesIncluded: ['Water'],
      petPolicy: 'Cats only',
      photos: [
        { url: 'https://example.com/photos/4.jpg', caption: 'Living Room' },
        { url: 'https://example.com/photos/5.jpg', caption: 'Kitchen' },
      ],
      aiHighlights: ['Washer/dryer in unit', 'Brownstone charm', 'Near Prospect Park'],
      hiddenGemScore: 78,
      viewCount: 89,
      inquiryCount: 8,
      publishedAt: new Date(),
    },
  });

  const listing3 = await prisma.listing.create({
    data: {
      ownerId: landlord.id,
      type: 'RENTAL',
      status: 'ACTIVE',
      propertyType: 'STUDIO',
      title: 'Cozy Studio in East Village - No Fee',
      description: 'Efficient studio apartment in prime East Village location. Recently updated with new flooring and appliances. Perfect for a single professional. Steps from great restaurants, bars, and Tompkins Square Park.',
      address: '85 E 7th St',
      unit: '4R',
      city: 'New York',
      state: 'NY',
      zipCode: '10003',
      neighborhood: 'East Village',
      borough: 'Manhattan',
      latitude: 40.7264,
      longitude: -73.9838,
      bedrooms: 0,
      bathrooms: 1,
      squareFeet: 350,
      floor: 4,
      totalFloors: 5,
      yearBuilt: 1920,
      rentPrice: 2200,
      securityDeposit: 2200,
      brokerFee: 0,
      applicationFee: 20,
      fareActCompliant: true,
      availableDate: new Date('2025-01-01'),
      leaseTermMonths: 12,
      amenities: ['Laundry in Building'],
      utilitiesIncluded: ['Heat', 'Hot Water'],
      petPolicy: 'No pets allowed',
      photos: [],
      hiddenGemScore: 65,
      viewCount: 203,
      inquiryCount: 24,
      publishedAt: new Date(),
    },
  });

  const listing4 = await prisma.listing.create({
    data: {
      ownerId: landlord.id,
      agentId: agent.id,
      type: 'SALE',
      status: 'ACTIVE',
      propertyType: 'TWO_BEDROOM',
      title: 'Luxury 2BR Condo in Williamsburg',
      description: 'Brand new luxury condo with stunning Manhattan skyline views. Open concept living with floor-to-ceiling windows, chef\'s kitchen with Miele appliances, and spa-like bathroom. Building features 24-hour doorman, gym, and rooftop terrace.',
      address: '100 N 3rd St',
      unit: '18A',
      city: 'Brooklyn',
      state: 'NY',
      zipCode: '11249',
      neighborhood: 'Williamsburg',
      borough: 'Brooklyn',
      latitude: 40.7166,
      longitude: -73.9612,
      bedrooms: 2,
      bathrooms: 2,
      squareFeet: 1100,
      floor: 18,
      totalFloors: 25,
      yearBuilt: 2023,
      salePrice: 1650000,
      amenities: ['Doorman 24/7', 'Gym', 'Rooftop', 'Concierge', 'Bike Room', 'Package Room'],
      photos: [],
      aiHighlights: ['New construction', 'Skyline views', 'High-end finishes'],
      hiddenGemScore: 72,
      viewCount: 567,
      inquiryCount: 45,
      publishedAt: new Date(),
    },
  });

  console.log(`Created ${4} listings`);

  // Create applications
  console.log('Creating applications...');

  const application1 = await prisma.application.create({
    data: {
      applicantId: tenant1.id,
      listingId: listing1.id,
      status: 'UNDER_REVIEW',
      employmentStatus: 'Full-Time',
      employerName: 'Tech Startup Inc',
      jobTitle: 'Software Engineer',
      monthlyIncome: 12000,
      employmentStartDate: new Date('2022-03-15'),
      creditScore: 750,
      hasBankruptcy: false,
      hasEvictions: false,
      currentAddress: '456 Atlantic Ave, Brooklyn, NY 11217',
      currentRent: 2800,
      numberOfOccupants: 1,
      hasPets: true,
      petDetails: 'One small dog, 15 lbs',
      applicationFee: 20,
      applicationFeePaidAt: new Date(),
    },
  });

  const application2 = await prisma.application.create({
    data: {
      applicantId: tenant2.id,
      listingId: listing2.id,
      status: 'SUBMITTED',
      employmentStatus: 'Full-Time',
      employerName: 'Finance Corp',
      jobTitle: 'Analyst',
      monthlyIncome: 8500,
      creditScore: 680,
      hasBankruptcy: false,
      hasEvictions: false,
      numberOfOccupants: 2,
      hasPets: false,
      applicationFee: 20,
      applicationFeePaidAt: new Date(),
    },
  });

  console.log(`Created ${2} applications`);

  // Create leads
  console.log('Creating leads...');

  await prisma.lead.create({
    data: {
      listingId: listing1.id,
      agentId: agent.id,
      status: 'QUALIFIED',
      source: 'Website',
      firstName: 'David',
      lastName: 'Prospect',
      email: 'david.prospect@email.com',
      phone: '+12125559999',
      preferredContactMethod: 'email',
      propertyPreferences: {
        bedrooms: 1,
        maxRent: 4000,
        neighborhoods: ['Chelsea', 'West Village'],
      },
      budget: 3800,
      moveInTimeline: 'Within 30 days',
      notes: 'Very interested, requested virtual tour',
      lastContactedAt: new Date(),
      nextFollowUpAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.lead.create({
    data: {
      agentId: agent.id,
      status: 'NEW',
      source: 'Referral',
      firstName: 'Emily',
      lastName: 'NewClient',
      email: 'emily.new@email.com',
      phone: '+12125558888',
      preferredContactMethod: 'phone',
      budget: 5000,
      moveInTimeline: 'Within 60 days',
    },
  });

  console.log(`Created ${2} leads`);

  // Create audit log entry
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'SEED_DATABASE',
      entityType: 'System',
      metadata: {
        seededAt: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
      },
    },
  });

  console.log('✅ Database seeded successfully!');
  console.log('\n📋 Test Credentials:');
  console.log('   Admin:    admin@realriches.com / Password123!');
  console.log('   Landlord: landlord@example.com / Password123!');
  console.log('   Agent:    agent@realty.com / Password123!');
  console.log('   Tenant:   tenant@gmail.com / Password123!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
