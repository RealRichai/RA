'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Circle,
  ArrowRight,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import { useState, useCallback } from 'react';

import { MissingDocAlert } from './MissingDocAlert';
import type { OnboardingStep, VaultOnboardingState, DocumentCategory } from './types';
import { CATEGORY_LABELS } from './types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';

interface VaultOnboardingWizardProps {
  state: VaultOnboardingState;
  onComplete?: () => void;
}

export function VaultOnboardingWizard({
  state,
  onComplete,
}: VaultOnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(state.currentStep);
  const queryClient = useQueryClient();

  const completeMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/properties/${state.propertyId}/vault/complete`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['vault-status', state.propertyId],
      });
      onComplete?.();
    },
  });

  const handleNextStep = useCallback(() => {
    if (currentStep < state.steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeMutation.mutate();
    }
  }, [currentStep, state.steps.length, completeMutation]);

  const handlePrevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep]);

  const currentStepData = state.steps[currentStep];
  const isLastStep = currentStep === state.steps.length - 1;
  const allStepsComplete = state.steps.every((step) => step.completed);

  const getMissingDocsForStep = (step: OnboardingStep): DocumentCategory[] => {
    return step.categories.filter(
      (cat) =>
        state.missingDocs.includes(cat as DocumentCategory) &&
        !state.uploadedDocs.includes(cat as DocumentCategory)
    ) as DocumentCategory[];
  };

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-between">
        {state.steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <button
              onClick={() => setCurrentStep(index)}
              className={`flex items-center gap-2 ${
                index <= currentStep
                  ? 'text-primary'
                  : 'text-muted-foreground'
              }`}
            >
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                  step.completed
                    ? 'bg-green-500 border-green-500 text-white'
                    : index === currentStep
                      ? 'border-primary text-primary'
                      : 'border-muted-foreground'
                }`}
              >
                {step.completed ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <span className="text-sm font-medium">{index + 1}</span>
                )}
              </div>
              <span className="hidden sm:inline text-sm font-medium">
                {step.name}
              </span>
            </button>
            {index < state.steps.length - 1 && (
              <ArrowRight className="h-4 w-4 mx-2 text-muted-foreground" />
            )}
          </div>
        ))}
      </div>

      {/* Current Step Content */}
      {currentStepData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {currentStepData.completed ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground" />
              )}
              {currentStepData.name}
            </CardTitle>
            <CardDescription>{currentStepData.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Required Documents for this step */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Documents in this step:</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {currentStepData.categories.map((category) => {
                    const isUploaded = state.uploadedDocs.includes(
                      category as DocumentCategory
                    );
                    const isRequired = state.missingDocs.includes(
                      category as DocumentCategory
                    );

                    return (
                      <div
                        key={category}
                        className={`flex items-center gap-2 p-2 rounded-lg ${
                          isUploaded
                            ? 'bg-green-50 dark:bg-green-950/30'
                            : isRequired
                              ? 'bg-amber-50 dark:bg-amber-950/30'
                              : 'bg-muted/30'
                        }`}
                      >
                        {isUploaded ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-sm">
                          {CATEGORY_LABELS[category as DocumentCategory] ||
                            category}
                        </span>
                        {!isUploaded && isRequired && (
                          <span className="text-xs text-amber-600 dark:text-amber-400 ml-auto">
                            Required
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Missing Docs Alert */}
              <MissingDocAlert
                propertyId={state.propertyId}
                missingDocs={getMissingDocsForStep(currentStepData)}
              />

              {/* Navigation */}
              <div className="flex justify-between pt-4">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  disabled={currentStep === 0}
                >
                  Previous
                </Button>
                {isLastStep && allStepsComplete ? (
                  <Button
                    onClick={() => completeMutation.mutate()}
                    disabled={completeMutation.isPending}
                  >
                    Complete Setup
                  </Button>
                ) : (
                  <Button onClick={handleNextStep}>
                    {isLastStep ? 'Finish' : 'Next'}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
