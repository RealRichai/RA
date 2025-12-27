import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

const fastify = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
      },
    },
  },
});

await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
});

await fastify.register(helmet);

const healthResponse = { ok: true, service: 'api', version: '2.0.0' };

fastify.get('/health', async () => healthResponse);
fastify.get('/api/v1/health', async () => healthResponse);

// Sample applications data for tenant view (my applications)
const myApplications = [
  {
    id: 'app-001',
    status: 'UNDER_REVIEW',
    createdAt: '2024-12-20T10:00:00Z',
    listingId: 'listing-101',
    listingTitle: 'Stunning 2BR with Manhattan Skyline Views',
    applicantName: 'Current User',
    applicantEmail: 'user@example.com',
    monthlyIncome: 8500,
    notes: 'Submitted all required documents',
  },
  {
    id: 'app-002',
    status: 'APPROVED',
    createdAt: '2024-12-15T14:30:00Z',
    listingId: 'listing-102',
    listingTitle: 'Cozy Studio in Chelsea',
    applicantName: 'Current User',
    applicantEmail: 'user@example.com',
    monthlyIncome: 8500,
    notes: 'Background check passed',
  },
  {
    id: 'app-003',
    status: 'SUBMITTED',
    createdAt: '2024-12-22T09:15:00Z',
    listingId: 'listing-103',
    listingTitle: 'Modern Loft in DUMBO',
    applicantName: 'Current User',
    applicantEmail: 'user@example.com',
    monthlyIncome: 8500,
    notes: 'Awaiting review',
  },
];

// Sample applications data for landlord view (received applications)
const receivedApplications = [
  {
    id: 'app-101',
    status: 'SUBMITTED',
    createdAt: '2024-12-23T11:00:00Z',
    listingId: 'listing-201',
    listingTitle: '123 Bedford Ave, #4B',
    applicantName: 'Sarah Johnson',
    applicantEmail: 'sarah.johnson@email.com',
    monthlyIncome: 9200,
    notes: 'Excellent credit score',
  },
  {
    id: 'app-102',
    status: 'SCREENING',
    createdAt: '2024-12-21T16:45:00Z',
    listingId: 'listing-201',
    listingTitle: '123 Bedford Ave, #4B',
    applicantName: 'Michael Chen',
    applicantEmail: 'mchen@techcorp.com',
    monthlyIncome: 12000,
    notes: 'Pending background check',
  },
  {
    id: 'app-103',
    status: 'UNDER_REVIEW',
    createdAt: '2024-12-19T08:30:00Z',
    listingId: 'listing-202',
    listingTitle: '456 Park Place',
    applicantName: 'Emily Davis',
    applicantEmail: 'emily.davis@gmail.com',
    monthlyIncome: 7800,
    notes: 'Requesting pet policy clarification',
  },
];

fastify.get('/api/v1/applications/me', async () => {
  return { data: myApplications };
});

fastify.get('/api/v1/applications/received', async () => {
  return { data: receivedApplications };
});

// Sample saved listings data
const savedListings = [
  {
    id: 'saved-1',
    title: 'Stunning 2BR with Manhattan Skyline Views',
    price: 4500,
    bedrooms: 2,
    bathrooms: 1,
    squareFeet: 950,
    address: { street: '123 Bedford Ave', unit: '4B', city: 'Brooklyn', state: 'NY', zipCode: '11211' },
    borough: 'Brooklyn',
    neighborhood: 'Williamsburg',
    photos: [],
    amenities: ['DISHWASHER', 'IN_UNIT_LAUNDRY', 'ROOFTOP_ACCESS'],
    status: 'ACTIVE',
    availableDate: '2025-01-15',
    fareActCompliant: true,
    moveInCosts: { total: 9000 },
    createdAt: '2024-12-20',
  },
  {
    id: 'saved-2',
    title: 'Spacious Studio in Historic Brownstone',
    price: 2800,
    bedrooms: 0,
    bathrooms: 1,
    squareFeet: 550,
    address: { street: '456 Park Place', unit: '', city: 'Brooklyn', state: 'NY', zipCode: '11238' },
    borough: 'Brooklyn',
    neighborhood: 'Prospect Heights',
    photos: [],
    amenities: ['GARDEN_ACCESS', 'PET_FRIENDLY'],
    status: 'ACTIVE',
    availableDate: '2025-02-01',
    fareActCompliant: true,
    moveInCosts: { total: 5600 },
    createdAt: '2024-12-18',
  },
  {
    id: 'saved-3',
    title: 'Modern 1BR in Astoria',
    price: 2400,
    bedrooms: 1,
    bathrooms: 1,
    squareFeet: 680,
    address: { street: '30-15 Steinway St', unit: '3F', city: 'Astoria', state: 'NY', zipCode: '11103' },
    borough: 'Queens',
    neighborhood: 'Astoria',
    photos: [],
    amenities: ['DOORMAN', 'GYM', 'ELEVATOR'],
    status: 'ACTIVE',
    availableDate: '2025-01-01',
    fareActCompliant: false,
    moveInCosts: { total: 4800 },
    createdAt: '2024-12-15',
  },
  {
    id: 'saved-4',
    title: 'Luxury 3BR Penthouse with Terrace',
    price: 8500,
    bedrooms: 3,
    bathrooms: 2,
    squareFeet: 1800,
    address: { street: '245 East 72nd St', unit: 'PH', city: 'New York', state: 'NY', zipCode: '10021' },
    borough: 'Manhattan',
    neighborhood: 'Upper East Side',
    photos: [],
    amenities: ['PRIVATE_TERRACE', 'DOORMAN', 'CONCIERGE', 'GYM'],
    status: 'ACTIVE',
    availableDate: '2025-01-20',
    fareActCompliant: true,
    moveInCosts: { total: 17000 },
    createdAt: '2024-12-10',
  },
];

fastify.get('/api/v1/user/saved-listings', async () => {
  return { data: savedListings };
});

// Sample leads data
const leads = [
  {
    id: 'lead-1',
    name: 'Sarah Johnson',
    email: 'sarah.johnson@email.com',
    phone: '(917) 555-0123',
    status: 'HOT',
    source: 'Website Inquiry',
    interestedIn: ['123 Bedford Ave, #4B', '456 Park Place'],
    lastContact: '2024-12-24T14:30:00Z',
    createdAt: '2024-12-20T10:00:00Z',
    notes: 'Looking for 2BR in Brooklyn, budget $4-5k',
  },
  {
    id: 'lead-2',
    name: 'Michael Chen',
    email: 'mchen@techcorp.com',
    phone: '(646) 555-0456',
    status: 'WARM',
    source: 'Referral',
    interestedIn: ['89 Greenwich St, 12F'],
    lastContact: '2024-12-22T11:00:00Z',
    createdAt: '2024-12-15T09:00:00Z',
    notes: 'Relocating from SF, needs move-in by Feb 1',
  },
  {
    id: 'lead-3',
    name: 'Emily Davis',
    email: 'emily.davis@gmail.com',
    phone: '(212) 555-0789',
    status: 'NEW',
    source: 'Open House',
    interestedIn: ['245 East 72nd St'],
    lastContact: '2024-12-25T16:00:00Z',
    createdAt: '2024-12-25T16:00:00Z',
    notes: 'First-time renter, needs guidance on FARE Act',
  },
];

fastify.get('/api/v1/leads', async () => {
  return { data: { leads } };
});

// Sample listings data for landlord/agent view
const myListings = [
  {
    id: 'listing-1',
    title: '123 Bedford Ave, #4B',
    price: 4500,
    bedrooms: 2,
    bathrooms: 1,
    status: 'ACTIVE',
    views: 856,
    inquiries: 42,
    daysOnMarket: 12,
    createdAt: '2024-12-14T10:00:00Z',
  },
  {
    id: 'listing-2',
    title: '456 Park Place',
    price: 2800,
    bedrooms: 0,
    bathrooms: 1,
    status: 'ACTIVE',
    views: 623,
    inquiries: 28,
    daysOnMarket: 18,
    createdAt: '2024-12-08T14:00:00Z',
  },
  {
    id: 'listing-3',
    title: '89 Greenwich St, 12F',
    price: 6200,
    bedrooms: 2,
    bathrooms: 2,
    status: 'PENDING',
    views: 412,
    inquiries: 15,
    daysOnMarket: 25,
    createdAt: '2024-12-01T09:00:00Z',
  },
];

fastify.get('/api/v1/listings/me', async () => {
  return { data: myListings };
});

// =============================================================================
// PASS 17c: FEDERATED SCORING API
// =============================================================================

// In-memory stores for scoring
const scoreCache = new Map<string, { score: number; tier: string; reasons: string[]; tags: string[]; confidence: number; timestamp: number }>();
const scoringJobs = new Map<string, { status: string; result?: any; createdAt: number }>();
const scoringAuditLog: { timestamp: string; input: any; output: any }[] = [];
const usageCounters = { scoringCalls: 0, asyncJobs: 0, exports: 0, alertsCreated: 0 };
const errorLog: { timestamp: string; endpoint: string; error: string; details?: any }[] = [];
const alertsStore: { id: string; type: string; message: string; createdAt: string; read: boolean }[] = [
  { id: 'alert-1', type: 'lead_tier_change', message: 'Sarah Johnson moved from WARM to HOT', createdAt: '2024-12-25T10:00:00Z', read: false },
  { id: 'alert-2', type: 'new_application', message: 'New application received for 123 Bedford Ave', createdAt: '2024-12-24T15:30:00Z', read: false },
  { id: 'alert-3', type: 'listing_status', message: 'Listing "456 Park Place" status changed to PENDING', createdAt: '2024-12-23T09:00:00Z', read: true },
];

// Scoring health check
fastify.get('/api/v1/score/health', async () => {
  return { ok: true, module: 'scoring' };
});

// Lead scoring function
function scoreLead(lead: any): { score: number; tier: 'HOT' | 'WARM' | 'COLD'; reasons: string[]; tags: string[]; confidence: number } {
  let score = 50; // Base score
  const reasons: string[] = [];
  const tags: string[] = [];

  // Score based on budget
  if (lead.budget) {
    if (lead.budget >= 5000) {
      score += 20;
      reasons.push('High budget indicates serious buyer');
      tags.push('high-budget');
    } else if (lead.budget >= 3000) {
      score += 10;
      reasons.push('Medium budget shows market-ready');
      tags.push('mid-budget');
    }
  }

  // Score based on source
  if (lead.source) {
    const source = lead.source.toLowerCase();
    if (source.includes('referral')) {
      score += 15;
      reasons.push('Referral leads convert 3x better');
      tags.push('referral');
    } else if (source.includes('website')) {
      score += 10;
      reasons.push('Direct website inquiry shows intent');
      tags.push('direct-inquiry');
    } else if (source.includes('open house')) {
      score += 12;
      reasons.push('Open house visitor has seen property');
      tags.push('open-house');
    }
  }

  // Score based on contact info completeness
  if (lead.email && lead.phone) {
    score += 10;
    reasons.push('Complete contact info provided');
    tags.push('verified-contact');
  }

  // Score based on timeline urgency
  if (lead.moveInDate || lead.timeline) {
    score += 8;
    reasons.push('Has specific timeline');
    tags.push('urgent');
  }

  // Determine tier
  let tier: 'HOT' | 'WARM' | 'COLD';
  if (score >= 75) {
    tier = 'HOT';
  } else if (score >= 50) {
    tier = 'WARM';
  } else {
    tier = 'COLD';
  }

  // Calculate confidence (based on data completeness)
  let dataPoints = 0;
  if (lead.name) dataPoints++;
  if (lead.email) dataPoints++;
  if (lead.phone) dataPoints++;
  if (lead.budget) dataPoints++;
  if (lead.source) dataPoints++;
  const confidence = Math.min(0.95, 0.5 + (dataPoints * 0.1));

  return { score: Math.min(100, score), tier, reasons, tags, confidence };
}

// Sync lead scoring
fastify.post('/api/v1/score/lead', async (request) => {
  const lead = request.body as any;

  // Check cache first
  const cacheKey = JSON.stringify(lead);
  const cached = scoreCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 300000) { // 5 min cache
    return { data: cached, cached: true };
  }

  const result = scoreLead(lead);

  // Cache result
  scoreCache.set(cacheKey, { ...result, timestamp: Date.now() });

  // Audit log
  scoringAuditLog.push({
    timestamp: new Date().toISOString(),
    input: { name: lead.name, email: lead.email ? '***' : undefined },
    output: { score: result.score, tier: result.tier }
  });

  usageCounters.scoringCalls++;

  return { data: result };
});

// =============================================================================
// PASS 17d: ASYNC SCORING + JOBS
// =============================================================================

fastify.post('/api/v1/score/lead/async', async (request) => {
  const lead = request.body as any;
  const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Create job
  scoringJobs.set(jobId, { status: 'queued', createdAt: Date.now() });
  usageCounters.asyncJobs++;

  // Simulate async processing
  setTimeout(() => {
    scoringJobs.set(jobId, { status: 'running', createdAt: Date.now() });

    setTimeout(() => {
      const result = scoreLead(lead);
      scoringJobs.set(jobId, { status: 'done', result, createdAt: Date.now() });

      // Audit log
      scoringAuditLog.push({
        timestamp: new Date().toISOString(),
        input: { name: lead.name, jobId },
        output: { score: result.score, tier: result.tier }
      });
    }, 1000);
  }, 500);

  return { data: { jobId } };
});

fastify.get('/api/v1/score/jobs/:id', async (request) => {
  const { id } = request.params as { id: string };
  const job = scoringJobs.get(id);

  if (!job) {
    return { error: { code: 'NOT_FOUND', message: 'Job not found' } };
  }

  return { data: job };
});

// =============================================================================
// PASS 18: LEADS EXPORT (CRM formats)
// =============================================================================

fastify.get('/api/v1/leads/export', async (request) => {
  const { format } = request.query as { format?: string };

  usageCounters.exports++;

  // Score all leads first
  const scoredLeads = leads.map(lead => {
    const scoreResult = scoreLead(lead);
    return {
      ...lead,
      score: scoreResult.score,
      tier: scoreResult.tier,
      confidence: scoreResult.confidence,
      sourceFingerprint: `src_${lead.source?.toLowerCase().replace(/\s+/g, '_') || 'unknown'}`,
      contactChannelConfidence: {
        email: lead.email ? 0.95 : 0,
        phone: lead.phone ? 0.85 : 0,
      }
    };
  });

  // CSV header based on format
  let csv = '';

  if (format === 'hubspot') {
    csv = 'First Name,Last Name,Email,Phone,Lead Score,Lead Status,Source,Notes\n';
    scoredLeads.forEach(l => {
      const [firstName, ...lastParts] = l.name.split(' ');
      const lastName = lastParts.join(' ');
      csv += `"${firstName}","${lastName}","${l.email}","${l.phone}",${l.score},"${l.tier}","${l.source}","${l.notes}"\n`;
    });
  } else if (format === 'salesforce') {
    csv = 'Name,Email,Phone,Score__c,Tier__c,Confidence__c,Source__c,Source_Fingerprint__c\n';
    scoredLeads.forEach(l => {
      csv += `"${l.name}","${l.email}","${l.phone}",${l.score},"${l.tier}",${l.confidence},"${l.source}","${l.sourceFingerprint}"\n`;
    });
  } else if (format === 'fub') {
    csv = 'contact_name,contact_email,contact_phone,lead_score,lead_tier,lead_source,email_confidence,phone_confidence\n';
    scoredLeads.forEach(l => {
      csv += `"${l.name}","${l.email}","${l.phone}",${l.score},"${l.tier}","${l.source}",${l.contactChannelConfidence.email},${l.contactChannelConfidence.phone}\n`;
    });
  } else {
    csv = 'id,name,email,phone,score,tier,confidence,source,sourceFingerprint,notes\n';
    scoredLeads.forEach(l => {
      csv += `"${l.id}","${l.name}","${l.email}","${l.phone}",${l.score},"${l.tier}",${l.confidence},"${l.source}","${l.sourceFingerprint}","${l.notes}"\n`;
    });
  }

  return { data: csv, format: format || 'default' };
});

// =============================================================================
// PASS 21: COMMERCIAL LISTINGS
// =============================================================================

const commercialListings = [
  {
    id: 'comm-1',
    title: 'Prime Retail Space - SoHo',
    address: '123 Broadway, Ground Floor',
    borough: 'Manhattan',
    neighborhood: 'SoHo',
    type: 'RETAIL',
    size: 2500,
    price: 15000,
    pricePerSqFt: 6,
    availableDate: '2025-02-01',
    features: ['Street Level', 'High Foot Traffic', 'Corner Location'],
    photos: [],
    status: 'ACTIVE',
  },
  {
    id: 'comm-2',
    title: 'Modern Office Space - Midtown',
    address: '450 Park Ave, 15th Floor',
    borough: 'Manhattan',
    neighborhood: 'Midtown',
    type: 'OFFICE',
    size: 5000,
    price: 25000,
    pricePerSqFt: 5,
    availableDate: '2025-01-15',
    features: ['Class A Building', 'Conference Rooms', 'City Views'],
    photos: [],
    status: 'ACTIVE',
  },
  {
    id: 'comm-3',
    title: 'Warehouse Space - Red Hook',
    address: '55 Van Brunt St',
    borough: 'Brooklyn',
    neighborhood: 'Red Hook',
    type: 'WAREHOUSE',
    size: 12000,
    price: 18000,
    pricePerSqFt: 1.5,
    availableDate: '2025-03-01',
    features: ['Loading Dock', 'High Ceilings', 'Parking'],
    photos: [],
    status: 'ACTIVE',
  },
  {
    id: 'comm-4',
    title: 'Restaurant Space - Williamsburg',
    address: '287 Bedford Ave',
    borough: 'Brooklyn',
    neighborhood: 'Williamsburg',
    type: 'RESTAURANT',
    size: 1800,
    price: 12000,
    pricePerSqFt: 6.67,
    availableDate: '2025-01-20',
    features: ['Vented Kitchen', 'Outdoor Seating', 'Liquor License Eligible'],
    photos: [],
    status: 'ACTIVE',
  },
  {
    id: 'comm-5',
    title: 'Medical Office - Upper East Side',
    address: '1120 Park Ave, Suite 2B',
    borough: 'Manhattan',
    neighborhood: 'Upper East Side',
    type: 'MEDICAL',
    size: 3200,
    price: 22000,
    pricePerSqFt: 6.88,
    availableDate: '2025-02-15',
    features: ['ADA Compliant', 'Exam Rooms', 'Waiting Area'],
    photos: [],
    status: 'ACTIVE',
  },
];

fastify.get('/api/v1/commercial/listings', async (request) => {
  const { borough, type, minPrice, maxPrice, minSize, maxSize } = request.query as any;

  let filtered = [...commercialListings];

  if (borough && borough !== 'all') {
    filtered = filtered.filter(l => l.borough === borough);
  }
  if (type && type !== 'all') {
    filtered = filtered.filter(l => l.type === type);
  }
  if (minPrice) {
    filtered = filtered.filter(l => l.price >= parseInt(minPrice));
  }
  if (maxPrice) {
    filtered = filtered.filter(l => l.price <= parseInt(maxPrice));
  }
  if (minSize) {
    filtered = filtered.filter(l => l.size >= parseInt(minSize));
  }
  if (maxSize) {
    filtered = filtered.filter(l => l.size <= parseInt(maxSize));
  }

  return { data: filtered };
});

fastify.get('/api/v1/commercial/listings/:id', async (request) => {
  const { id } = request.params as { id: string };
  const listing = commercialListings.find(l => l.id === id);

  if (!listing) {
    return { error: { code: 'NOT_FOUND', message: 'Listing not found' } };
  }

  return { data: listing };
});

// =============================================================================
// PASS 23: ALERTS MODULE
// =============================================================================

fastify.get('/api/v1/alerts', async () => {
  return { data: alertsStore };
});

fastify.post('/api/v1/alerts/subscribe', async (request) => {
  const { type, leadId, listingId } = request.body as any;

  const alertId = `alert-${Date.now()}`;
  const newAlert = {
    id: alertId,
    type: type || 'general',
    message: `Subscribed to ${type} alerts`,
    createdAt: new Date().toISOString(),
    read: false,
  };

  alertsStore.unshift(newAlert);
  usageCounters.alertsCreated++;

  return { data: { subscriptionId: alertId, type } };
});

fastify.post('/api/v1/alerts/:id/read', async (request) => {
  const { id } = request.params as { id: string };
  const alert = alertsStore.find(a => a.id === id);

  if (alert) {
    alert.read = true;
  }

  return { data: { success: true } };
});

// =============================================================================
// PASS 24: NURTURE PLANS
// =============================================================================

const nurturePlans: Record<string, any> = {
  'lead-1': {
    leadId: 'lead-1',
    status: 'active',
    currentStep: 2,
    steps: [
      { day: 0, action: 'Initial contact email', status: 'completed', completedAt: '2024-12-20T10:30:00Z' },
      { day: 1, action: 'Follow-up call', status: 'completed', completedAt: '2024-12-21T14:00:00Z' },
      { day: 3, action: 'Send property matches', status: 'pending', scheduledFor: '2024-12-28T09:00:00Z' },
      { day: 7, action: 'Schedule tour', status: 'pending', scheduledFor: '2025-01-01T10:00:00Z' },
      { day: 14, action: 'Check-in call', status: 'pending', scheduledFor: '2025-01-08T11:00:00Z' },
    ],
    notes: 'High-priority lead, very responsive. Prefers Brooklyn locations.',
  },
  'lead-2': {
    leadId: 'lead-2',
    status: 'active',
    currentStep: 1,
    steps: [
      { day: 0, action: 'Welcome email', status: 'completed', completedAt: '2024-12-15T09:30:00Z' },
      { day: 2, action: 'Market overview call', status: 'pending', scheduledFor: '2024-12-27T15:00:00Z' },
      { day: 5, action: 'Send FiDi listings', status: 'pending', scheduledFor: '2024-12-30T10:00:00Z' },
      { day: 10, action: 'Tour scheduling', status: 'pending', scheduledFor: '2025-01-04T14:00:00Z' },
    ],
    notes: 'Relocating from SF, corporate housing budget.',
  },
  'lead-3': {
    leadId: 'lead-3',
    status: 'new',
    currentStep: 0,
    steps: [
      { day: 0, action: 'Welcome email + FARE Act guide', status: 'pending', scheduledFor: '2024-12-26T09:00:00Z' },
      { day: 1, action: 'Introduction call', status: 'pending', scheduledFor: '2024-12-27T10:00:00Z' },
      { day: 3, action: 'First-time renter resources', status: 'pending', scheduledFor: '2024-12-29T09:00:00Z' },
      { day: 7, action: 'Property tour', status: 'pending', scheduledFor: '2025-01-02T11:00:00Z' },
    ],
    notes: 'First-time renter, needs extra guidance.',
  },
};

fastify.get('/api/v1/leads/:id', async (request) => {
  const { id } = request.params as { id: string };
  const lead = leads.find(l => l.id === id);

  if (!lead) {
    return { error: { code: 'NOT_FOUND', message: 'Lead not found' } };
  }

  const scoreResult = scoreLead(lead);

  return {
    data: {
      ...lead,
      score: scoreResult.score,
      tier: scoreResult.tier,
      confidence: scoreResult.confidence,
      reasons: scoreResult.reasons,
      tags: scoreResult.tags,
    }
  };
});

fastify.get('/api/v1/leads/:id/nurture-plan', async (request) => {
  const { id } = request.params as { id: string };
  const plan = nurturePlans[id];

  if (!plan) {
    // Return default plan
    return {
      data: {
        leadId: id,
        status: 'not_started',
        currentStep: 0,
        steps: [
          { day: 0, action: 'Initial outreach', status: 'pending' },
          { day: 2, action: 'Follow-up', status: 'pending' },
          { day: 5, action: 'Property matches', status: 'pending' },
          { day: 10, action: 'Tour scheduling', status: 'pending' },
        ],
        notes: '',
      }
    };
  }

  return { data: plan };
});

fastify.put('/api/v1/leads/:id/notes', async (request) => {
  const { id } = request.params as { id: string };
  const { notes } = request.body as { notes: string };

  if (nurturePlans[id]) {
    nurturePlans[id].notes = notes;
  }

  return { data: { success: true } };
});

// =============================================================================
// PASS 25: USAGE TRACKING + BILLING
// =============================================================================

fastify.get('/api/v1/usage/me', async () => {
  return {
    data: {
      ...usageCounters,
      period: 'current_month',
      plan: 'demo',
      limits: {
        scoringCalls: 1000,
        exports: 100,
        asyncJobs: 500,
        alertsCreated: 50,
      }
    }
  };
});

// =============================================================================
// PASS 26: OBSERVABILITY
// =============================================================================

fastify.get('/api/v1/admin/errors', async () => {
  // Return last 50 errors (demo data if empty)
  if (errorLog.length === 0) {
    return {
      data: [
        { timestamp: '2024-12-25T08:30:00Z', endpoint: '/api/v1/score/lead', error: 'Invalid lead data', details: { field: 'email' } },
        { timestamp: '2024-12-24T14:20:00Z', endpoint: '/api/v1/leads/export', error: 'Export timeout', details: { format: 'hubspot' } },
        { timestamp: '2024-12-23T10:15:00Z', endpoint: '/api/v1/commercial/listings', error: 'Filter parse error', details: { filter: 'minPrice' } },
      ]
    };
  }

  return { data: errorLog.slice(-50) };
});

fastify.get('/api/v1/admin/audit-log', async () => {
  return { data: scoringAuditLog.slice(-100) };
});

// =============================================================================

fastify.get('/', async () => {
  return { name: 'RealRiches API', version: '2.0.0' };
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '4000', 10);
    const host = process.env.HOST || '0.0.0.0';
    await fastify.listen({ port, host });
    console.log(`API server running at http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
