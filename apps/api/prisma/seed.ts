/**
 * RealRiches Database Seed
 * Seeds all feature flags, markets, integrations, and admin user
 * Run with: npx prisma db seed
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ====================
// FEATURE FLAGS
// ====================

const FEATURE_FLAGS = [
  // Core Features
  {
    key: 'core.listings',
    name: 'Listings',
    description: 'Property listing management',
    category: 'core',
    enabled: true,
    dependencies: [],
    markets: [],
  },
  {
    key: 'core.applications',
    name: 'Applications',
    description: 'Rental application processing',
    category: 'core',
    enabled: true,
    dependencies: ['core.listings'],
    markets: [],
  },
  {
    key: 'core.leases',
    name: 'Leases',
    description: 'Lease management and renewals',
    category: 'core',
    enabled: true,
    dependencies: ['core.applications'],
    markets: [],
  },
  {
    key: 'core.payments',
    name: 'Payments',
    description: 'Payment tracking and processing',
    category: 'core',
    enabled: true,
    dependencies: ['core.leases'],
    markets: [],
  },
  {
    key: 'core.leads',
    name: 'Leads & Tours',
    description: 'Lead management and tour scheduling',
    category: 'core',
    enabled: true,
    dependencies: ['core.listings'],
    markets: [],
  },

  // Compliance Features
  {
    key: 'compliance.fare-act',
    name: 'FARE Act Compliance',
    description: 'NYC FARE Act fee disclosure and limits',
    category: 'compliance',
    enabled: true,
    dependencies: [],
    markets: ['nyc-manhattan', 'nyc-brooklyn', 'nyc-queens', 'nyc-bronx', 'nyc-staten-island'],
  },
  {
    key: 'compliance.fair-chance',
    name: 'Fair Chance Housing',
    description: 'NYC Fair Chance Housing Act workflow',
    category: 'compliance',
    enabled: true,
    dependencies: ['core.applications'],
    markets: ['nyc-manhattan', 'nyc-brooklyn', 'nyc-queens', 'nyc-bronx', 'nyc-staten-island'],
  },
  {
    key: 'compliance.source-of-income',
    name: 'Source of Income Protection',
    description: 'Prohibit discrimination based on lawful income source',
    category: 'compliance',
    enabled: true,
    dependencies: [],
    markets: [],
  },

  // Integration Features
  {
    key: 'integrations.email',
    name: 'Email Notifications',
    description: 'SendGrid email integration',
    category: 'integrations',
    enabled: true,
    requiresIntegration: 'sendgrid',
    dependencies: [],
    markets: [],
  },
  {
    key: 'integrations.sms',
    name: 'SMS Notifications',
    description: 'Twilio SMS integration',
    category: 'integrations',
    enabled: true,
    requiresIntegration: 'twilio',
    dependencies: [],
    markets: [],
  },
  {
    key: 'integrations.smart-locks',
    name: 'Smart Lock Access',
    description: 'Seam smart lock integration for tours',
    category: 'integrations',
    enabled: false,
    requiresIntegration: 'seam',
    dependencies: ['core.leads'],
    markets: [],
  },
  {
    key: 'integrations.guarantors',
    name: 'Lease Guarantees',
    description: 'TheGuarantors rent guarantee integration',
    category: 'integrations',
    enabled: false,
    requiresIntegration: 'the-guarantors',
    dependencies: ['core.applications'],
    markets: [],
  },
  {
    key: 'integrations.phone-verify',
    name: 'Phone Verification',
    description: 'Twilio Verify phone verification',
    category: 'integrations',
    enabled: true,
    requiresIntegration: 'twilio-verify',
    dependencies: [],
    markets: [],
  },

  // AI Features
  {
    key: 'ai.listing-descriptions',
    name: 'AI Listing Descriptions',
    description: 'Generate listing descriptions with AI',
    category: 'ai',
    enabled: false,
    requiresIntegration: 'anthropic',
    dependencies: ['core.listings'],
    markets: [],
  },
  {
    key: 'ai.lead-followup',
    name: 'AI Lead Follow-up',
    description: 'Automated lead nurturing with AI',
    category: 'ai',
    enabled: false,
    requiresIntegration: 'anthropic',
    dependencies: ['core.leads'],
    markets: [],
  },
  {
    key: 'ai.chat-assistant',
    name: 'Agent AI Assistant',
    description: 'AI chat assistant for agents',
    category: 'ai',
    enabled: false,
    requiresIntegration: 'anthropic',
    dependencies: [],
    markets: [],
  },

  // Marketing Features
  {
    key: 'marketing.virtual-tours',
    name: 'Virtual Tours',
    description: '360° virtual tour support',
    category: 'marketing',
    enabled: true,
    dependencies: ['core.listings'],
    markets: [],
  },
  {
    key: 'marketing.3d-splats',
    name: '3D Gaussian Splats',
    description: '3D Gaussian Splatting digital twins',
    category: 'experimental',
    enabled: false,
    dependencies: ['core.listings'],
    markets: [],
  },

  // Experimental
  {
    key: 'experimental.imessage',
    name: 'iMessage Integration',
    description: 'Sendblue iMessage for lead communication',
    category: 'experimental',
    enabled: false,
    requiresIntegration: 'sendblue',
    dependencies: ['core.leads'],
    markets: [],
  },
];

// ====================
// MARKETS
// ====================

const MARKETS = [
  {
    key: 'nyc-manhattan',
    name: 'Manhattan',
    state: 'NY',
    region: 'nyc',
    zipCodePrefixes: ['100', '101', '102'],
    enabled: true,
    fareActRequired: true,
    fairChanceRequired: true,
    sourceOfIncomeProtection: true,
    securityDepositLimit: 1,
    applicationFeeCap: 20,
    brokerFeeRules: 'tenant-optional',
    rentStabilization: true,
    defaultApplicationFee: 20,
    defaultSecurityDeposit: 1,
    typicalBrokerFeePercent: 15,
  },
  {
    key: 'nyc-brooklyn',
    name: 'Brooklyn',
    state: 'NY',
    region: 'nyc',
    zipCodePrefixes: ['112'],
    enabled: true,
    fareActRequired: true,
    fairChanceRequired: true,
    sourceOfIncomeProtection: true,
    securityDepositLimit: 1,
    applicationFeeCap: 20,
    brokerFeeRules: 'tenant-optional',
    rentStabilization: true,
    defaultApplicationFee: 20,
    defaultSecurityDeposit: 1,
    typicalBrokerFeePercent: 15,
  },
  {
    key: 'nyc-queens',
    name: 'Queens',
    state: 'NY',
    region: 'nyc',
    zipCodePrefixes: ['110', '111', '113', '114', '116'],
    enabled: true,
    fareActRequired: true,
    fairChanceRequired: true,
    sourceOfIncomeProtection: true,
    securityDepositLimit: 1,
    applicationFeeCap: 20,
    brokerFeeRules: 'tenant-optional',
    rentStabilization: true,
    defaultApplicationFee: 20,
    defaultSecurityDeposit: 1,
    typicalBrokerFeePercent: 15,
  },
  {
    key: 'nyc-bronx',
    name: 'Bronx',
    state: 'NY',
    region: 'nyc',
    zipCodePrefixes: ['104'],
    enabled: true,
    fareActRequired: true,
    fairChanceRequired: true,
    sourceOfIncomeProtection: true,
    securityDepositLimit: 1,
    applicationFeeCap: 20,
    brokerFeeRules: 'tenant-optional',
    rentStabilization: true,
    defaultApplicationFee: 20,
    defaultSecurityDeposit: 1,
    typicalBrokerFeePercent: 12,
  },
  {
    key: 'nyc-staten-island',
    name: 'Staten Island',
    state: 'NY',
    region: 'nyc',
    zipCodePrefixes: ['103'],
    enabled: true,
    fareActRequired: true,
    fairChanceRequired: true,
    sourceOfIncomeProtection: true,
    securityDepositLimit: 1,
    applicationFeeCap: 20,
    brokerFeeRules: 'tenant-optional',
    rentStabilization: true,
    defaultApplicationFee: 20,
    defaultSecurityDeposit: 1,
    typicalBrokerFeePercent: 12,
  },
  {
    key: 'li-nassau',
    name: 'Nassau County',
    state: 'NY',
    region: 'long-island',
    zipCodePrefixes: ['110', '115', '116'],
    enabled: true,
    fareActRequired: false,
    fairChanceRequired: false,
    sourceOfIncomeProtection: true,
    securityDepositLimit: 1,
    applicationFeeCap: 50,
    brokerFeeRules: 'negotiable',
    rentStabilization: false,
    defaultApplicationFee: 50,
    defaultSecurityDeposit: 1,
    typicalBrokerFeePercent: 15,
  },
  {
    key: 'li-suffolk',
    name: 'Suffolk County',
    state: 'NY',
    region: 'long-island',
    zipCodePrefixes: ['117', '118', '119'],
    enabled: true,
    fareActRequired: false,
    fairChanceRequired: false,
    sourceOfIncomeProtection: true,
    securityDepositLimit: 1,
    applicationFeeCap: 50,
    brokerFeeRules: 'negotiable',
    rentStabilization: false,
    defaultApplicationFee: 50,
    defaultSecurityDeposit: 1,
    typicalBrokerFeePercent: 15,
  },
  {
    key: 'westchester',
    name: 'Westchester County',
    state: 'NY',
    region: 'westchester',
    zipCodePrefixes: ['105', '106', '107', '108', '109'],
    enabled: true,
    fareActRequired: false,
    fairChanceRequired: false,
    sourceOfIncomeProtection: true,
    securityDepositLimit: 1,
    applicationFeeCap: 50,
    brokerFeeRules: 'negotiable',
    rentStabilization: false,
    defaultApplicationFee: 50,
    defaultSecurityDeposit: 1,
    typicalBrokerFeePercent: 15,
  },
  {
    key: 'jersey-city',
    name: 'Jersey City',
    state: 'NJ',
    region: 'hudson-valley',
    zipCodePrefixes: ['073'],
    enabled: false,
    fareActRequired: false,
    fairChanceRequired: false,
    sourceOfIncomeProtection: true,
    securityDepositLimit: 1.5,
    applicationFeeCap: 50,
    brokerFeeRules: 'negotiable',
    rentStabilization: false,
    defaultApplicationFee: 50,
    defaultSecurityDeposit: 1.5,
    typicalBrokerFeePercent: 15,
  },
  {
    key: 'hoboken',
    name: 'Hoboken',
    state: 'NJ',
    region: 'hudson-valley',
    zipCodePrefixes: ['070'],
    enabled: false,
    fareActRequired: false,
    fairChanceRequired: false,
    sourceOfIncomeProtection: true,
    securityDepositLimit: 1.5,
    applicationFeeCap: 50,
    brokerFeeRules: 'negotiable',
    rentStabilization: false,
    defaultApplicationFee: 50,
    defaultSecurityDeposit: 1.5,
    typicalBrokerFeePercent: 15,
  },
  {
    key: 'newark',
    name: 'Newark',
    state: 'NJ',
    region: 'hudson-valley',
    zipCodePrefixes: ['071'],
    enabled: false,
    fareActRequired: false,
    fairChanceRequired: false,
    sourceOfIncomeProtection: true,
    securityDepositLimit: 1.5,
    applicationFeeCap: 50,
    brokerFeeRules: 'negotiable',
    rentStabilization: false,
    defaultApplicationFee: 50,
    defaultSecurityDeposit: 1.5,
    typicalBrokerFeePercent: 12,
  },
];

// ====================
// INTEGRATIONS
// ====================

const INTEGRATIONS = [
  {
    key: 'sendgrid',
    name: 'SendGrid',
    description: 'Transactional and marketing email delivery',
    category: 'email',
    provider: 'Twilio',
    docsUrl: 'https://docs.sendgrid.com',
    requiredEnvVars: ['SENDGRID_API_KEY'],
    optionalEnvVars: ['SENDGRID_FROM_EMAIL', 'SENDGRID_FROM_NAME'],
    healthCheckEndpoint: 'https://api.sendgrid.com/v3/scopes',
    features: ['integrations.email'],
  },
  {
    key: 'twilio',
    name: 'Twilio SMS',
    description: 'SMS and voice communications',
    category: 'sms',
    provider: 'Twilio',
    docsUrl: 'https://www.twilio.com/docs',
    requiredEnvVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'],
    optionalEnvVars: [],
    features: ['integrations.sms'],
  },
  {
    key: 'twilio-verify',
    name: 'Twilio Verify',
    description: 'Phone number verification',
    category: 'sms',
    provider: 'Twilio',
    docsUrl: 'https://www.twilio.com/docs/verify',
    requiredEnvVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SID'],
    optionalEnvVars: [],
    features: ['integrations.phone-verify'],
  },
  {
    key: 'seam',
    name: 'Seam',
    description: 'Smart lock and access control',
    category: 'access-control',
    provider: 'Seam',
    docsUrl: 'https://docs.seam.co',
    requiredEnvVars: ['SEAM_API_KEY'],
    optionalEnvVars: [],
    features: ['integrations.smart-locks'],
  },
  {
    key: 'the-guarantors',
    name: 'TheGuarantors',
    description: 'Lease guarantee and rent protection',
    category: 'financial',
    provider: 'TheGuarantors',
    docsUrl: 'https://www.theguarantors.com',
    requiredEnvVars: ['THE_GUARANTORS_API_KEY', 'THE_GUARANTORS_PARTNER_ID'],
    optionalEnvVars: ['THE_GUARANTORS_API_URL'],
    features: ['integrations.guarantors'],
  },
  {
    key: 'anthropic',
    name: 'Anthropic Claude',
    description: 'AI assistant and content generation',
    category: 'ai',
    provider: 'Anthropic',
    docsUrl: 'https://docs.anthropic.com',
    requiredEnvVars: ['ANTHROPIC_API_KEY'],
    optionalEnvVars: [],
    features: ['ai.listing-descriptions', 'ai.lead-followup', 'ai.chat-assistant'],
  },
  {
    key: 'sendblue',
    name: 'Sendblue',
    description: 'iMessage business messaging',
    category: 'messaging',
    provider: 'Sendblue',
    docsUrl: 'https://sendblue.co/docs',
    requiredEnvVars: ['SENDBLUE_API_KEY', 'SENDBLUE_API_SECRET'],
    optionalEnvVars: [],
    features: ['experimental.imessage'],
  },
  {
    key: 'jeeva',
    name: 'Jeeva.ai',
    description: 'AI-powered lead follow-up automation',
    category: 'ai',
    provider: 'Jeeva',
    docsUrl: 'https://jeeva.ai/docs',
    requiredEnvVars: ['JEEVA_API_KEY'],
    optionalEnvVars: [],
    features: ['ai.lead-followup'],
  },
];

// ====================
// SYSTEM SETTINGS
// ====================

const SYSTEM_SETTINGS = [
  {
    key: 'platform.name',
    value: 'RealRiches',
    description: 'Platform display name',
    category: 'branding',
  },
  {
    key: 'platform.supportEmail',
    value: 'support@realriches.com',
    description: 'Support email address',
    category: 'contact',
  },
  {
    key: 'platform.defaultMarket',
    value: 'nyc-manhattan',
    description: 'Default market for new users',
    category: 'general',
  },
  {
    key: 'security.sessionDuration',
    value: 604800000, // 7 days in ms
    description: 'Session duration in milliseconds',
    category: 'security',
  },
  {
    key: 'security.refreshTokenDuration',
    value: 2592000000, // 30 days in ms
    description: 'Refresh token duration in milliseconds',
    category: 'security',
  },
  {
    key: 'notifications.defaultChannels',
    value: ['email', 'in_app'],
    description: 'Default notification channels',
    category: 'notifications',
  },
  {
    key: 'leases.renewalNotificationDays',
    value: [90, 60, 30],
    description: 'Days before lease end to send renewal notifications',
    category: 'leases',
  },
  {
    key: 'compliance.fareActMaxApplicationFee',
    value: 20,
    description: 'Maximum application fee under FARE Act',
    category: 'compliance',
  },
  {
    key: 'compliance.fareActMaxSecurityDeposit',
    value: 1,
    description: 'Maximum security deposit months under FARE Act',
    category: 'compliance',
  },
];

// ====================
// SEED FUNCTION
// ====================

async function main() {
  console.log('🌱 Starting RealRiches database seed...\n');

  // Seed Feature Flags
  console.log('📋 Seeding feature flags...');
  for (const flag of FEATURE_FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      update: flag,
      create: flag,
    });
  }
  console.log(`   ✓ ${FEATURE_FLAGS.length} feature flags seeded\n`);

  // Seed Markets
  console.log('🗺️  Seeding markets...');
  for (const market of MARKETS) {
    await prisma.market.upsert({
      where: { key: market.key },
      update: market,
      create: market,
    });
  }
  console.log(`   ✓ ${MARKETS.length} markets seeded\n`);

  // Seed Integrations
  console.log('🔌 Seeding integrations...');
  for (const integration of INTEGRATIONS) {
    // Check which env vars are configured
    const configuredEnvVars = integration.requiredEnvVars.filter(
      (envVar) => process.env[envVar]
    );

    // Determine status based on configured env vars
    let status = 'not-configured';
    if (configuredEnvVars.length === integration.requiredEnvVars.length) {
      status = 'configured';
    } else if (configuredEnvVars.length > 0) {
      status = 'partial';
    }

    await prisma.integration.upsert({
      where: { key: integration.key },
      update: {
        ...integration,
        configuredEnvVars,
        status,
        lastCheckedAt: new Date(),
      },
      create: {
        ...integration,
        configuredEnvVars,
        status,
        lastCheckedAt: new Date(),
      },
    });
  }
  console.log(`   ✓ ${INTEGRATIONS.length} integrations seeded\n`);

  // Seed System Settings
  console.log('⚙️  Seeding system settings...');
  for (const setting of SYSTEM_SETTINGS) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: setting,
      create: setting,
    });
  }
  console.log(`   ✓ ${SYSTEM_SETTINGS.length} system settings seeded\n`);

  // Create Admin User
  console.log('👤 Creating admin user...');
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@realriches.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'RealRichesAdmin2024!';
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
    create: {
      email: adminEmail,
      passwordHash,
      firstName: 'System',
      lastName: 'Admin',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
      emailVerifiedAt: new Date(),
      subscriptionTier: 'ENTERPRISE',
    },
  });
  console.log(`   ✓ Admin user created: ${admin.email}\n`);

  // Create demo users for each role
  console.log('👥 Creating demo users...');
  const demoUsers = [
    {
      email: 'agent@realriches.com',
      firstName: 'Demo',
      lastName: 'Agent',
      role: 'AGENT' as const,
      licenseNumber: 'NY-10-1234567',
      licenseState: 'NY',
      brokerageName: 'RealRiches Realty',
    },
    {
      email: 'landlord@realriches.com',
      firstName: 'Demo',
      lastName: 'Landlord',
      role: 'LANDLORD' as const,
    },
    {
      email: 'tenant@realriches.com',
      firstName: 'Demo',
      lastName: 'Tenant',
      role: 'TENANT' as const,
    },
    {
      email: 'investor@realriches.com',
      firstName: 'Demo',
      lastName: 'Investor',
      role: 'INVESTOR' as const,
      accreditedInvestor: true,
    },
  ];

  for (const user of demoUsers) {
    const userPasswordHash = await bcrypt.hash('DemoPassword123!', 12);
    await prisma.user.upsert({
      where: { email: user.email },
      update: { ...user, passwordHash: userPasswordHash },
      create: {
        ...user,
        passwordHash: userPasswordHash,
        status: 'ACTIVE',
        emailVerified: true,
        emailVerifiedAt: new Date(),
        subscriptionTier: 'PROFESSIONAL',
      },
    });
  }
  console.log(`   ✓ ${demoUsers.length} demo users created\n`);

  // Print integration status summary
  console.log('📊 Integration Status Summary:');
  const integrations = await prisma.integration.findMany({
    orderBy: { category: 'asc' },
  });

  for (const integration of integrations) {
    const statusIcon =
      integration.status === 'configured' ? '✅' :
      integration.status === 'partial' ? '⚠️' : '❌';
    console.log(`   ${statusIcon} ${integration.name}: ${integration.status}`);
    if (integration.status !== 'configured') {
      const missing = integration.requiredEnvVars.filter(
        (v) => !integration.configuredEnvVars.includes(v)
      );
      if (missing.length > 0) {
        console.log(`      Missing: ${missing.join(', ')}`);
      }
    }
  }

  console.log('\n✨ Seed completed successfully!');
  console.log('\n📝 Next steps:');
  console.log('   1. Add missing API keys to your .env file');
  console.log('   2. Run seed again to update integration status');
  console.log('   3. Login with admin@realriches.com / RealRichesAdmin2024!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
