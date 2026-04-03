import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { getPlan, createOrder, simulatePayment } from '../services/api';
import { 
  Monitor, ArrowLeft, CreditCard, Check, Loader2, Globe, ShieldCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const Checkout = () => {
  const { planId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState(searchParams.get('billing') || 'monthly');
  const [region, setRegion] = useState('eu-west');
  const [step, setStep] = useState('config'); // config, payment, provisioning

  useEffect(() => {
    getPlan(planId)
      .then(res => setPlan(res.data))
      .catch(() => navigate('/plans'))
      .finally(() => setLoading(false));
  }, [planId, navigate]);

  const handleCheckout = async () => {
    setProcessing(true);
    try {
      // Create order
      const orderRes = await createOrder({
        plan_id: planId,
        billing_period: billingPeriod,
        region: region
      });
      
      setStep('payment');
      
      // Simulate payment (DEMO MODE)
      await simulatePayment(orderRes.data.id);
      
      setStep('provisioning');
      
      // Wait a bit then redirect to dashboard
      setTimeout(() => {
        navigate('/dashboard');
      }, 3000);
      
    } catch (err) {
      console.error(err);
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-teal animate-spin" />
      </div>
    );
  }

  const price = billingPeriod === 'annual' ? plan.price_annual : plan.price_monthly;

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] grid-pattern">
      {/* Header */}
      <header className="border-b border-custom">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/plans" className="text-muted-custom hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <Link to="/" className="flex items-center gap-2">
              <Monitor className="w-8 h-8 text-brand-teal" />
              <span className="text-xl font-bold text-brand-teal">WinDesk</span>
              <span className="text-xl font-light text-muted2">Cloud</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {step === 'provisioning' ? (
          <div className="card-cyber p-12 text-center animate-scaleIn">
            <div className="w-20 h-20 rounded-full bg-brand-teal/20 flex items-center justify-center mx-auto mb-6">
              <Loader2 className="w-10 h-10 text-brand-teal animate-spin" />
            </div>
            <h2 className="text-2xl font-bold mb-4">Setting up your desktop</h2>
            <p className="text-muted2 mb-6">
              Your Windows VM is being provisioned. This usually takes 2-5 minutes.
            </p>
            <div className="max-w-xs mx-auto">
              <div className="progress-cyber">
                <div className="progress-cyber-bar" style={{ width: '60%' }} />
              </div>
              <p className="text-xs text-muted-custom mt-2">Configuring network...</p>
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-8">
            {/* Order Summary */}
            <div className="card-cyber p-8">
              <h2 className="text-xl font-bold mb-6">Order Summary</h2>
              
              <div className="p-4 bg-elevated rounded-lg mb-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-lg bg-brand-teal/10 flex items-center justify-center">
                    <Monitor className="w-6 h-6 text-brand-teal" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{plan.name} Plan</h3>
                    <p className="text-sm text-muted-custom">{plan.vcpu} vCPU • {plan.ram_gb}GB RAM • {plan.disk_gb}GB SSD</p>
                  </div>
                </div>
                
                <ul className="space-y-2">
                  {plan.features.slice(0, 4).map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-muted2">
                      <Check className="w-4 h-4 text-brand-green" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-3 border-t border-custom pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-custom">Plan</span>
                  <span>{plan.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-custom">Billing</span>
                  <span className="capitalize">{billingPeriod}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-custom">Region</span>
                  <span>{region}</span>
                </div>
                <div className="flex justify-between font-semibold pt-3 border-t border-custom">
                  <span>Total</span>
                  <span className="text-brand-teal text-xl">${price}/{billingPeriod === 'annual' ? 'yr' : 'mo'}</span>
                </div>
              </div>
            </div>

            {/* Configuration & Payment */}
            <div className="card-cyber p-8">
              <h2 className="text-xl font-bold mb-6">Configuration</h2>

              <div className="space-y-6">
                {/* Billing Period */}
                <div>
                  <label className="text-sm text-muted-custom mb-2 block">Billing Period</label>
                  <Select value={billingPeriod} onValueChange={setBillingPeriod}>
                    <SelectTrigger data-testid="billing-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly (${plan.price_monthly}/mo)</SelectItem>
                      <SelectItem value="annual">Annual (${plan.price_annual}/yr - Save 17%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Region */}
                <div>
                  <label className="text-sm text-muted-custom mb-2 block">Region</label>
                  <Select value={region} onValueChange={setRegion}>
                    <SelectTrigger data-testid="region-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eu-west">EU West (France)</SelectItem>
                      <SelectItem value="eu-central">EU Central (Germany)</SelectItem>
                      <SelectItem value="us-east">US East (Virginia)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Demo Mode Notice */}
                <div className="p-4 rounded-lg bg-brand-teal/10 border border-brand-teal/30">
                  <div className="flex items-center gap-2 text-brand-teal mb-2">
                    <ShieldCheck className="w-5 h-5" />
                    <span className="font-semibold">Demo Mode</span>
                  </div>
                  <p className="text-sm text-muted2">
                    Payment is simulated. Click "Deploy" to provision a demo VM instantly.
                  </p>
                </div>

                <Button
                  className="w-full btn-cyber py-6"
                  onClick={handleCheckout}
                  disabled={processing}
                  data-testid="deploy-btn"
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {step === 'payment' ? 'Processing payment...' : 'Creating order...'}
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4 mr-2" />
                      Deploy Desktop - ${price}/{billingPeriod === 'annual' ? 'yr' : 'mo'}
                    </>
                  )}
                </Button>

                <p className="text-xs text-muted-custom text-center">
                  By clicking Deploy, you agree to our Terms of Service and Privacy Policy.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Checkout;
