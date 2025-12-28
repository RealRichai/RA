import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/hooks/useAuth';

type Role = 'TENANT' | 'LANDLORD' | 'AGENT';

interface RoleOption {
  value: Role;
  label: string;
  description: string;
  icon: string;
}

const ROLES: RoleOption[] = [
  {
    value: 'TENANT',
    label: 'Tenant',
    description: 'Looking for a place to rent',
    icon: 'home-outline',
  },
  {
    value: 'LANDLORD',
    label: 'Landlord',
    description: 'I have properties to rent',
    icon: 'business-outline',
  },
  {
    value: 'AGENT',
    label: 'Agent',
    description: 'Licensed real estate agent',
    icon: 'briefcase-outline',
  },
];

export default function RegisterScreen() {
  const { register, isLoading } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleContinue = () => {
    if (!selectedRole) {
      setError('Please select a role');
      return;
    }
    setError('');
    setStep(2);
  };

  const handleRegister = async () => {
    if (!firstName.trim()) {
      setError('Please enter your first name');
      return;
    }
    if (!lastName.trim()) {
      setError('Please enter your last name');
      return;
    }
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setError('');
    try {
      await register({
        email,
        password,
        firstName,
        lastName,
        role: selectedRole!,
      });
      router.replace('/(tabs)');
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back Button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => (step === 2 ? setStep(1) : router.back())}
        >
          <Ionicons name="arrow-back" size={24} color="#0D1117" />
        </TouchableOpacity>

        {/* Progress */}
        <View style={styles.progress}>
          <View style={[styles.progressStep, styles.progressStepActive]} />
          <View style={[styles.progressStep, step === 2 && styles.progressStepActive]} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>
            {step === 1 ? 'Create Account' : 'Your Details'}
          </Text>
          <Text style={styles.subtitle}>
            {step === 1
              ? 'Select how you want to use RealRiches'
              : 'Tell us a bit about yourself'}
          </Text>
        </View>

        {error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Step 1: Role Selection */}
        {step === 1 && (
          <View style={styles.roleSelection}>
            {ROLES.map((role) => (
              <TouchableOpacity
                key={role.value}
                style={[
                  styles.roleCard,
                  selectedRole === role.value && styles.roleCardSelected,
                ]}
                onPress={() => setSelectedRole(role.value)}
              >
                <View style={styles.roleCardContent}>
                  <View
                    style={[
                      styles.roleIcon,
                      selectedRole === role.value && styles.roleIconSelected,
                    ]}
                  >
                    <Ionicons
                      name={role.icon as any}
                      size={24}
                      color={selectedRole === role.value ? '#FFFFFF' : '#0D9488'}
                    />
                  </View>
                  <View style={styles.roleInfo}>
                    <Text
                      style={[
                        styles.roleLabel,
                        selectedRole === role.value && styles.roleLabelSelected,
                      ]}
                    >
                      {role.label}
                    </Text>
                    <Text style={styles.roleDescription}>{role.description}</Text>
                  </View>
                </View>
                {selectedRole === role.value && (
                  <Ionicons name="checkmark-circle" size={24} color="#0D9488" />
                )}
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
              <Text style={styles.continueButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 2: Account Details */}
        {step === 2 && (
          <View style={styles.form}>
            <View style={styles.nameRow}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>First Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="John"
                  placeholderTextColor="#9CA3AF"
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginLeft: 12 }]}>
                <Text style={styles.label}>Last Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Doe"
                  placeholderTextColor="#9CA3AF"
                  value={lastName}
                  onChangeText={setLastName}
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
                <TextInput
                  style={styles.inputWithIcon}
                  placeholder="you@example.com"
                  placeholderTextColor="#9CA3AF"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
                <TextInput
                  style={styles.inputWithIcon}
                  placeholder="Min. 8 characters"
                  placeholderTextColor="#9CA3AF"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#9CA3AF"
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.selectedRoleInfo}>
              <Ionicons
                name={ROLES.find((r) => r.value === selectedRole)?.icon as any}
                size={20}
                color="#0D9488"
              />
              <Text style={styles.selectedRoleText}>
                Registering as {ROLES.find((r) => r.value === selectedRole)?.label}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.registerButton, isLoading && styles.registerButtonDisabled]}
              onPress={handleRegister}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.registerButtonText}>Create Account</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.terms}>
              By creating an account, you agree to our{' '}
              <Text style={styles.termsLink}>Terms of Service</Text> and{' '}
              <Text style={styles.termsLink}>Privacy Policy</Text>
            </Text>
          </View>
        )}

        {/* Login Link */}
        <View style={styles.loginContainer}>
          <Text style={styles.loginText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/auth/login')}>
            <Text style={styles.loginLink}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 60,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  progress: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  progressStep: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
  },
  progressStepActive: {
    backgroundColor: '#0D9488',
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0D1117',
    fontFamily: 'PlayfairDisplay-Bold',
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    marginTop: 8,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    flex: 1,
  },
  roleSelection: {
    gap: 12,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  roleCardSelected: {
    borderColor: '#0D9488',
    backgroundColor: '#F0FDFA',
  },
  roleCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  roleIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F0FDFA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleIconSelected: {
    backgroundColor: '#0D9488',
  },
  roleInfo: {
    marginLeft: 12,
    flex: 1,
  },
  roleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0D1117',
  },
  roleLabelSelected: {
    color: '#0D9488',
  },
  roleDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  continueButton: {
    backgroundColor: '#0D9488',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  form: {
    gap: 16,
  },
  nameRow: {
    flexDirection: 'row',
  },
  inputGroup: {
    marginBottom: 0,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#0D1117',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  inputWithIcon: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: '#0D1117',
  },
  passwordToggle: {
    padding: 4,
  },
  selectedRoleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F0FDFA',
    borderRadius: 8,
  },
  selectedRoleText: {
    color: '#0D9488',
    fontSize: 14,
    fontWeight: '500',
  },
  registerButton: {
    backgroundColor: '#0D9488',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  registerButtonDisabled: {
    opacity: 0.7,
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  terms: {
    textAlign: 'center',
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 18,
  },
  termsLink: {
    color: '#0D9488',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
  },
  loginText: {
    color: '#6B7280',
    fontSize: 14,
  },
  loginLink: {
    color: '#0D9488',
    fontSize: 14,
    fontWeight: '600',
  },
});
