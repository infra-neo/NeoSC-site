import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  Building2, User, CreditCard, CheckCircle, ArrowRight, ArrowLeft,
  Monitor, Users, Server, Shield, FileText, Loader2, Sparkles,
  ChevronRight, Check, Zap, HardDrive
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const Onboarding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState([]);
  const [summary, setSummary] = useState(null);

  // Form data
  const [orgData, setOrgData] = useState({ name: '', domain: '' });
  const [adminData, setAdminData] = useState({ admin_name: '', admin_email: '', admin_password: '' });
  const [selectedPlan, setSelectedPlan] = useState('');

  useEffect(() => {
    // Pre-fill admin data with current user
    if (user) {
      setAdminData(prev => ({
        ...prev,
        admin_name: user.name || '',
        admin_email: user.email || ''
      }));
    }
    // Fetch plans
    axios.get(`${API_URL}/api/plans`).then(res => setPlans(res.data)).catch(console.error);
  }, [user]);

  const steps = [
    { id: 1, title: 'Organización', icon: Building2, description: 'Datos de tu empresa' },
    { id: 2, title: 'Administrador', icon: User, description: 'Usuario principal' },
    { id: 3, title: 'Plan', icon: CreditCard, description: 'Selecciona tu plan' },
    { id: 4, title: 'Revisión', icon: CheckCircle, description: 'Confirma los datos' },
  ];

  const handleNext = async () => {
    setLoading(true);
    try {
      if (currentStep === 1) {
        await axios.post(`${API_URL}/api/onboarding/organization`, orgData, { withCredentials: true });
        setCurrentStep(2);
      } else if (currentStep === 2) {
        await axios.post(`${API_URL}/api/onboarding/admin`, adminData, { withCredentials: true });
        setCurrentStep(3);
      } else if (currentStep === 3) {
        await axios.post(`${API_URL}/api/onboarding/plan`, { selected_plan: selectedPlan }, { withCredentials: true });
        // Fetch summary for review
        const summaryRes = await axios.get(`${API_URL}/api/onboarding/summary`, { withCredentials: true });
        setSummary(summaryRes.data);
        setCurrentStep(4);
      } else if (currentStep === 4) {
        await axios.post(`${API_URL}/api/onboarding/complete`, {}, { withCredentials: true });
        navigate('/dashboard?tour=true');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceed = () => {
    if (currentStep === 1) return orgData.name.length > 0;
    if (currentStep === 2) return adminData.admin_name.length > 0 && adminData.admin_email.length > 0;
    if (currentStep === 3) return selectedPlan.length > 0;
    return true;
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] grid-pattern">
      {/* Header */}
      <header className="border-b border-custom bg-surface/80 backdrop-blur-lg">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Monitor className="w-8 h-8 text-brand-teal" />
            <span className="text-xl font-bold text-brand-teal">WinDesk</span>
            <span className="text-xl font-light text-muted2">Cloud</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-custom">
            <Sparkles className="w-4 h-4 text-brand-amber" />
            <span>Configuración inicial</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Progress Steps */}
        <div className="mb-12">
          <div className="flex items-center justify-center">
            {steps.map((step, index) => (
              <React.Fragment key={step.id}>
                <div className="flex flex-col items-center">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                      currentStep >= step.id
                        ? 'bg-brand-teal text-[#060810] shadow-lg shadow-brand-teal/30'
                        : 'bg-elevated border-2 border-dashed border-custom text-muted-custom'
                    }`}
                  >
                    {currentStep > step.id ? (
                      <Check className="w-6 h-6" />
                    ) : (
                      <step.icon className="w-6 h-6" />
                    )}
                  </div>
                  <p className={`mt-3 text-sm font-medium ${currentStep >= step.id ? 'text-white' : 'text-muted-custom'}`}>
                    {step.title}
                  </p>
                  <p className="text-xs text-muted-custom mt-1">{step.description}</p>
                </div>
                {index < steps.length - 1 && (
                  <div className={`w-20 h-0.5 mx-2 mt-[-40px] ${currentStep > step.id ? 'bg-brand-teal' : 'bg-border-custom'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="card-cyber p-8 max-w-2xl mx-auto animate-fadeIn">
          {/* Step 1: Organization */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold mb-2">¡Bienvenido a WinDesk Cloud!</h2>
                <p className="text-muted2">Comencemos configurando tu organización</p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="orgName">Nombre de la Organización *</Label>
                  <Input
                    id="orgName"
                    placeholder="ACME Corporation"
                    value={orgData.name}
                    onChange={(e) => setOrgData({ ...orgData, name: e.target.value })}
                    className="mt-2"
                    data-testid="org-name-input"
                  />
                </div>
                <div>
                  <Label htmlFor="domain">Dominio (Opcional)</Label>
                  <Input
                    id="domain"
                    placeholder="acme.com"
                    value={orgData.domain}
                    onChange={(e) => setOrgData({ ...orgData, domain: e.target.value })}
                    className="mt-2"
                    data-testid="org-domain-input"
                  />
                  <p className="text-xs text-muted-custom mt-2">
                    El dominio ayuda a identificar tu organización en el sistema
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Admin */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold mb-2">Administrador Técnico</h2>
                <p className="text-muted2">Confirma o configura el usuario administrador principal</p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="adminName">Nombre del Administrador *</Label>
                  <Input
                    id="adminName"
                    placeholder="Juan Pérez"
                    value={adminData.admin_name}
                    onChange={(e) => setAdminData({ ...adminData, admin_name: e.target.value })}
                    className="mt-2"
                    data-testid="admin-name-input"
                  />
                </div>
                <div>
                  <Label htmlFor="adminEmail">Email del Administrador *</Label>
                  <Input
                    id="adminEmail"
                    type="email"
                    placeholder="admin@empresa.com"
                    value={adminData.admin_email}
                    onChange={(e) => setAdminData({ ...adminData, admin_email: e.target.value })}
                    className="mt-2"
                    data-testid="admin-email-input"
                  />
                </div>
                <div className="p-4 rounded-lg bg-brand-teal/10 border border-brand-teal/30">
                  <p className="text-sm text-brand-teal">
                    Este usuario tendrá acceso completo al panel de administración y podrá gestionar usuarios, grupos y VMs.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Plan Selection */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold mb-2">Selecciona tu Plan</h2>
                <p className="text-muted2">Elige el plan que mejor se adapte a tus necesidades</p>
              </div>

              <div className="grid gap-4">
                {plans.map((plan) => (
                  <div
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`p-5 rounded-xl border-2 cursor-pointer transition-all ${
                      selectedPlan === plan.id
                        ? 'border-brand-teal bg-brand-teal/10 shadow-lg shadow-brand-teal/20'
                        : 'border-custom hover:border-muted-custom'
                    }`}
                    data-testid={`plan-option-${plan.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                          selectedPlan === plan.id ? 'bg-brand-teal text-[#060810]' : 'bg-elevated'
                        }`}>
                          <Server className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg">{plan.name}</h3>
                          <div className="flex items-center gap-3 text-sm text-muted2">
                            <span className="flex items-center gap-1">
                              <Zap className="w-3 h-3" />
                              {plan.vcpu} vCPU
                            </span>
                            <span className="flex items-center gap-1">
                              <HardDrive className="w-3 h-3" />
                              {plan.ram_gb}GB RAM
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-brand-teal">${plan.price_monthly}</p>
                        <p className="text-xs text-muted-custom">/mes</p>
                      </div>
                    </div>
                    {selectedPlan === plan.id && (
                      <div className="mt-4 pt-4 border-t border-brand-teal/30">
                        <div className="flex flex-wrap gap-2">
                          {plan.features.slice(0, 3).map((feature, i) => (
                            <span key={i} className="px-2 py-1 text-xs bg-brand-teal/20 text-brand-teal rounded">
                              {feature}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {currentStep === 4 && summary && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold mb-2">Revisa tu Configuración</h2>
                <p className="text-muted2">Confirma los datos antes de finalizar</p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-elevated border border-custom">
                  <div className="flex items-center gap-3 mb-3">
                    <Building2 className="w-5 h-5 text-brand-teal" />
                    <span className="font-semibold">Organización</span>
                  </div>
                  <div className="ml-8 space-y-1 text-sm">
                    <p><span className="text-muted-custom">Nombre:</span> {summary.organization.name}</p>
                    {summary.organization.domain && (
                      <p><span className="text-muted-custom">Dominio:</span> {summary.organization.domain}</p>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-elevated border border-custom">
                  <div className="flex items-center gap-3 mb-3">
                    <User className="w-5 h-5 text-brand-blue" />
                    <span className="font-semibold">Administrador</span>
                  </div>
                  <div className="ml-8 space-y-1 text-sm">
                    <p><span className="text-muted-custom">Nombre:</span> {summary.admin.name}</p>
                    <p><span className="text-muted-custom">Email:</span> {summary.admin.email}</p>
                  </div>
                </div>

                {summary.plan && (
                  <div className="p-4 rounded-lg bg-elevated border border-custom">
                    <div className="flex items-center gap-3 mb-3">
                      <CreditCard className="w-5 h-5 text-brand-amber" />
                      <span className="font-semibold">Plan Seleccionado</span>
                    </div>
                    <div className="ml-8 space-y-1 text-sm">
                      <p><span className="text-muted-custom">Plan:</span> {summary.plan.name}</p>
                      <p><span className="text-muted-custom">Precio:</span> ${summary.plan.price_monthly}/mes</p>
                      <p><span className="text-muted-custom">Recursos:</span> {summary.plan.vcpu} vCPU, {summary.plan.ram_gb}GB RAM, {summary.plan.disk_gb}GB Disco</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 rounded-lg bg-brand-green/10 border border-brand-green/30 text-center">
                <p className="text-brand-green font-medium">
                  ¡Todo listo! Al continuar, se creará tu espacio de trabajo y podrás comenzar a usar WinDesk Cloud.
                </p>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8 pt-6 border-t border-custom">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1 || loading}
              className="btn-cyber-outline"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Atrás
            </Button>
            <Button
              onClick={handleNext}
              disabled={!canProceed() || loading}
              className="btn-cyber"
              data-testid="onboarding-next-btn"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : currentStep === 4 ? (
                <>
                  Finalizar
                  <CheckCircle className="w-4 h-4 ml-2" />
                </>
              ) : (
                <>
                  Siguiente
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Onboarding;
