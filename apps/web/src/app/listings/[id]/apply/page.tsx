'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Upload,
  CheckCircle,
  FileText,
  User,
  Briefcase,
  Home,
  Shield,
  CreditCard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Header } from '@/components/layout/header';
import { cn, formatCurrency } from '@/lib/utils';
import { useListing, useCreateApplication, useRequireAuth } from '@/hooks';
import { toast } from '@/components/ui/toaster';

const steps = [
  { id: 1, title: 'Personal Info', icon: User },
  { id: 2, title: 'Employment', icon: Briefcase },
  { id: 3, title: 'Rental History', icon: Home },
  { id: 4, title: 'Documents', icon: FileText },
  { id: 5, title: 'Review & Pay', icon: CreditCard },
];

const mockListing = {
  id: '1',
  title: 'Stunning 2BR with Manhattan Skyline Views',
  address: { street: '123 Bedford Ave', unit: '4B', city: 'Brooklyn', state: 'NY', zipCode: '11211' },
  neighborhood: 'Williamsburg',
  price: 3500,
  applicationFee: 20,
  securityDeposit: 3500,
  moveInCosts: { firstMonth: 3500, securityDeposit: 3500, brokerFee: 0, applicationFee: 20, total: 7020 },
};

export default function ApplyPage() {
  const params = useParams();
  const router = useRouter();
  const listingId = params.id as string;
  const { isAuthenticated, isLoading: authLoading } = useRequireAuth(`/listings/${listingId}/apply`);
  
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    // Personal
    phone: '',
    dateOfBirth: '',
    ssn: '',
    // Employment
    employer: '',
    position: '',
    annualIncome: '',
    employmentLength: '',
    employerPhone: '',
    // Rental History
    currentAddress: '',
    currentLandlord: '',
    landlordPhone: '',
    monthlyRent: '',
    reasonForLeaving: '',
    // Additional
    moveInDate: '',
    additionalOccupants: '0',
    hasPets: 'no',
    petDetails: '',
    emergencyName: '',
    emergencyPhone: '',
    emergencyRelation: '',
  });

  const [documents, setDocuments] = useState<{ [key: string]: File | null }>({
    photoId: null,
    proofOfIncome: null,
    bankStatements: null,
    employmentLetter: null,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const listing = mockListing;

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleFileChange = (docType: string, file: File | null) => {
    setDocuments(prev => ({ ...prev, [docType]: file }));
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (step === 1) {
      if (!formData.phone) newErrors.phone = 'Phone number is required';
      if (!formData.dateOfBirth) newErrors.dateOfBirth = 'Date of birth is required';
    }

    if (step === 2) {
      if (!formData.employer) newErrors.employer = 'Employer name is required';
      if (!formData.position) newErrors.position = 'Position is required';
      if (!formData.annualIncome) newErrors.annualIncome = 'Annual income is required';
      if (!formData.employmentLength) newErrors.employmentLength = 'Employment length is required';
    }

    if (step === 3) {
      if (!formData.currentAddress) newErrors.currentAddress = 'Current address is required';
    }

    if (step === 4) {
      if (!documents.photoId) newErrors.photoId = 'Photo ID is required';
      if (!documents.proofOfIncome) newErrors.proofOfIncome = 'Proof of income is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, steps.length));
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return;

    setIsSubmitting(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      toast({ title: 'Application submitted!', description: 'We\'ll notify you of any updates.', variant: 'success' });
      router.push('/dashboard/applications');
    } catch (error) {
      toast({ title: 'Submission failed', description: 'Please try again.', variant: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-surface-50">
        <Header />
        <main className="container-wide py-8">
          <div className="max-w-3xl mx-auto animate-pulse space-y-6">
            <div className="h-8 w-48 bg-surface-200 rounded" />
            <div className="h-64 bg-surface-200 rounded-2xl" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />
      <main className="container-wide py-8">
        <div className="max-w-3xl mx-auto">
          <Link href={`/listings/${listingId}`} className="flex items-center gap-2 text-surface-600 hover:text-surface-900 mb-6 transition-colors">
            <ArrowLeft className="h-4 w-4" />Back to listing
          </Link>

          {/* Listing Summary */}
          <Card className="mb-8">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-xl font-display font-bold text-surface-900 mb-1">{listing.title}</h1>
                  <p className="text-surface-500">{listing.address.street}, {listing.address.unit}, {listing.neighborhood}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-display font-bold text-surface-900">{formatCurrency(listing.price)}</p>
                  <p className="text-sm text-surface-500">/month</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Progress Steps */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  <div className={cn(
                    'flex items-center justify-center h-10 w-10 rounded-full border-2 transition-colors',
                    currentStep > step.id ? 'bg-emerald-500 border-emerald-500 text-white' :
                    currentStep === step.id ? 'bg-luxury-bronze border-luxury-bronze text-white' :
                    'border-surface-300 text-surface-400'
                  )}>
                    {currentStep > step.id ? <CheckCircle className="h-5 w-5" /> : <step.icon className="h-5 w-5" />}
                  </div>
                  {index < steps.length - 1 && (
                    <div className={cn(
                      'hidden sm:block w-16 h-0.5 mx-2',
                      currentStep > step.id ? 'bg-emerald-500' : 'bg-surface-200'
                    )} />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2">
              {steps.map(step => (
                <span key={step.id} className={cn(
                  'text-xs font-medium',
                  currentStep >= step.id ? 'text-surface-900' : 'text-surface-400'
                )}>{step.title}</span>
              ))}
            </div>
          </div>

          {/* Form Steps */}
          <Card>
            <CardHeader>
              <CardTitle>{steps[currentStep - 1].title}</CardTitle>
              <CardDescription>
                {currentStep === 1 && 'Tell us about yourself'}
                {currentStep === 2 && 'Your employment information'}
                {currentStep === 3 && 'Your current living situation'}
                {currentStep === 4 && 'Upload required documents'}
                {currentStep === 5 && 'Review your application and pay the application fee'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Step 1: Personal Info */}
              {currentStep === 1 && (
                <>
                  <FormField label="Phone Number" error={errors.phone} required>
                    <Input type="tel" placeholder="(212) 555-1234" value={formData.phone} onChange={(e) => updateField('phone', e.target.value)} error={errors.phone} />
                  </FormField>
                  <FormField label="Date of Birth" error={errors.dateOfBirth} required>
                    <Input type="date" value={formData.dateOfBirth} onChange={(e) => updateField('dateOfBirth', e.target.value)} error={errors.dateOfBirth} />
                  </FormField>
                  <FormField label="Social Security Number" error={errors.ssn} hint="Required for credit and background check">
                    <Input type="password" placeholder="XXX-XX-XXXX" value={formData.ssn} onChange={(e) => updateField('ssn', e.target.value)} />
                  </FormField>
                  <FormField label="Desired Move-in Date">
                    <Input type="date" value={formData.moveInDate} onChange={(e) => updateField('moveInDate', e.target.value)} />
                  </FormField>
                  <FormField label="Additional Occupants">
                    <Select value={formData.additionalOccupants} onValueChange={(v) => updateField('additionalOccupants', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Just me</SelectItem>
                        <SelectItem value="1">1 additional person</SelectItem>
                        <SelectItem value="2">2 additional people</SelectItem>
                        <SelectItem value="3">3+ additional people</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                </>
              )}

              {/* Step 2: Employment */}
              {currentStep === 2 && (
                <>
                  <FormField label="Current Employer" error={errors.employer} required>
                    <Input placeholder="Company Name" value={formData.employer} onChange={(e) => updateField('employer', e.target.value)} error={errors.employer} />
                  </FormField>
                  <FormField label="Position/Title" error={errors.position} required>
                    <Input placeholder="Your job title" value={formData.position} onChange={(e) => updateField('position', e.target.value)} error={errors.position} />
                  </FormField>
                  <FormField label="Annual Income" error={errors.annualIncome} required>
                    <Input type="number" placeholder="75000" value={formData.annualIncome} onChange={(e) => updateField('annualIncome', e.target.value)} error={errors.annualIncome} />
                  </FormField>
                  <FormField label="Length of Employment" error={errors.employmentLength} required>
                    <Select value={formData.employmentLength} onValueChange={(v) => updateField('employmentLength', v)}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="less_than_1">Less than 1 year</SelectItem>
                        <SelectItem value="1_to_2">1-2 years</SelectItem>
                        <SelectItem value="2_to_5">2-5 years</SelectItem>
                        <SelectItem value="more_than_5">5+ years</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Employer Phone">
                    <Input type="tel" placeholder="(212) 555-1234" value={formData.employerPhone} onChange={(e) => updateField('employerPhone', e.target.value)} />
                  </FormField>
                </>
              )}

              {/* Step 3: Rental History */}
              {currentStep === 3 && (
                <>
                  <FormField label="Current Address" error={errors.currentAddress} required>
                    <Input placeholder="123 Main St, Apt 4B, New York, NY 10001" value={formData.currentAddress} onChange={(e) => updateField('currentAddress', e.target.value)} error={errors.currentAddress} />
                  </FormField>
                  <FormField label="Current Landlord/Management Company">
                    <Input placeholder="Name or company" value={formData.currentLandlord} onChange={(e) => updateField('currentLandlord', e.target.value)} />
                  </FormField>
                  <FormField label="Landlord Phone">
                    <Input type="tel" placeholder="(212) 555-1234" value={formData.landlordPhone} onChange={(e) => updateField('landlordPhone', e.target.value)} />
                  </FormField>
                  <FormField label="Current Monthly Rent">
                    <Input type="number" placeholder="2500" value={formData.monthlyRent} onChange={(e) => updateField('monthlyRent', e.target.value)} />
                  </FormField>
                  <FormField label="Reason for Leaving">
                    <Input placeholder="e.g., Relocating for work" value={formData.reasonForLeaving} onChange={(e) => updateField('reasonForLeaving', e.target.value)} />
                  </FormField>
                </>
              )}

              {/* Step 4: Documents */}
              {currentStep === 4 && (
                <>
                  <div className="p-4 bg-blue-50 rounded-xl mb-6">
                    <div className="flex items-start gap-3">
                      <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-blue-800">Your documents are secure</p>
                        <p className="text-sm text-blue-700">All files are encrypted and only shared with the landlord for application review.</p>
                      </div>
                    </div>
                  </div>

                  {[
                    { key: 'photoId', label: 'Government-issued Photo ID', required: true, hint: 'Driver\'s license or passport' },
                    { key: 'proofOfIncome', label: 'Proof of Income', required: true, hint: 'Recent pay stubs (last 2-3)' },
                    { key: 'bankStatements', label: 'Bank Statements', required: false, hint: 'Last 2-3 months' },
                    { key: 'employmentLetter', label: 'Employment Verification Letter', required: false, hint: 'Optional but recommended' },
                  ].map(doc => (
                    <FormField key={doc.key} label={doc.label} error={errors[doc.key]} hint={doc.hint} required={doc.required}>
                      <div className={cn(
                        'border-2 border-dashed rounded-xl p-6 text-center transition-colors',
                        documents[doc.key] ? 'border-emerald-300 bg-emerald-50' : 'border-surface-200 hover:border-surface-300'
                      )}>
                        {documents[doc.key] ? (
                          <div className="flex items-center justify-center gap-2">
                            <CheckCircle className="h-5 w-5 text-emerald-600" />
                            <span className="font-medium text-emerald-800">{documents[doc.key]!.name}</span>
                            <button onClick={() => handleFileChange(doc.key, null)} className="text-surface-500 hover:text-surface-700 ml-2">Remove</button>
                          </div>
                        ) : (
                          <label className="cursor-pointer">
                            <Upload className="h-8 w-8 text-surface-400 mx-auto mb-2" />
                            <p className="text-sm text-surface-600">Click to upload or drag and drop</p>
                            <p className="text-xs text-surface-400 mt-1">PDF, JPG, or PNG up to 10MB</p>
                            <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => handleFileChange(doc.key, e.target.files?.[0] || null)} />
                          </label>
                        )}
                      </div>
                    </FormField>
                  ))}
                </>
              )}

              {/* Step 5: Review & Pay */}
              {currentStep === 5 && (
                <>
                  <div className="space-y-6">
                    <div className="p-4 bg-surface-50 rounded-xl">
                      <h3 className="font-medium text-surface-900 mb-3">Personal Information</h3>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <span className="text-surface-500">Phone:</span>
                        <span>{formData.phone || '—'}</span>
                        <span className="text-surface-500">Date of Birth:</span>
                        <span>{formData.dateOfBirth || '—'}</span>
                      </div>
                    </div>

                    <div className="p-4 bg-surface-50 rounded-xl">
                      <h3 className="font-medium text-surface-900 mb-3">Employment</h3>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <span className="text-surface-500">Employer:</span>
                        <span>{formData.employer || '—'}</span>
                        <span className="text-surface-500">Position:</span>
                        <span>{formData.position || '—'}</span>
                        <span className="text-surface-500">Annual Income:</span>
                        <span>{formData.annualIncome ? formatCurrency(parseInt(formData.annualIncome)) : '—'}</span>
                      </div>
                    </div>

                    <div className="p-4 bg-surface-50 rounded-xl">
                      <h3 className="font-medium text-surface-900 mb-3">Documents Uploaded</h3>
                      <div className="space-y-2">
                        {Object.entries(documents).map(([key, file]) => (
                          <div key={key} className="flex items-center gap-2 text-sm">
                            {file ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : <div className="h-4 w-4 rounded-full border-2 border-surface-300" />}
                            <span className={file ? 'text-surface-900' : 'text-surface-400'}>{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                      <h3 className="font-medium text-emerald-800 mb-3">Application Fee</h3>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-emerald-700">Non-refundable application fee</p>
                          <p className="text-xs text-emerald-600">Capped at $20 per NYC FARE Act</p>
                        </div>
                        <span className="text-2xl font-bold text-emerald-900">{formatCurrency(listing.applicationFee)}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Navigation */}
              <div className="flex justify-between pt-6 border-t border-surface-100">
                {currentStep > 1 ? (
                  <Button variant="outline" onClick={prevStep}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
                ) : (
                  <div />
                )}
                {currentStep < steps.length ? (
                  <Button onClick={nextStep}>Continue<ArrowRight className="h-4 w-4 ml-2" /></Button>
                ) : (
                  <Button onClick={handleSubmit} loading={isSubmitting}>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Pay {formatCurrency(listing.applicationFee)} & Submit
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
