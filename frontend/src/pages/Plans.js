import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getPlans } from '../services/api';
import { 
  Monitor, ArrowLeft, Check, Cpu, HardDrive, Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const Plans = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [billingPeriod, setBillingPeriod] = useState('monthly');

  useEffect(() => {
    getPlans()
      .then(res => setPlans(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSelectPlan = (planId) => {
    navigate(`/checkout/${planId}?billing=${billingPeriod}`);
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] grid-pattern">
      {/* Header */}
      <header className="border-b border-custom">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="text-muted-custom hover:text-white transition-colors">
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

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Choose Your Plan</h1>
          <p className="text-muted2 max-w-xl mx-auto mb-8">
            Select the configuration that best fits your needs. All plans include Windows 11 Pro, 
            TSplus HTML5 access, and Zero Trust security.
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center gap-2 p-1 rounded-lg bg-elevated border border-custom">
            <button
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                billingPeriod === 'monthly' 
                  ? 'bg-brand-teal text-bg-primary' 
                  : 'text-muted2 hover:text-white'
              }`}
              onClick={() => setBillingPeriod('monthly')}
              data-testid="billing-monthly"
            >
              Monthly
            </button>
            <button
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                billingPeriod === 'annual' 
                  ? 'bg-brand-teal text-bg-primary' 
                  : 'text-muted2 hover:text-white'
              }`}
              onClick={() => setBillingPeriod('annual')}
              data-testid="billing-annual"
            >
              Annual <span className="text-xs opacity-80">(-17%)</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-8">
            {plans.map((plan, i) => (
              <div 
                key={plan.id}
                className={`card-cyber p-8 relative ${plan.id === 'business' ? 'border-brand-teal glow-teal' : ''}`}
                data-testid={`plan-${plan.id}`}
              >
                {plan.id === 'business' && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-brand-teal text-bg-primary text-sm font-semibold rounded-full">
                    Recommended
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                  <p className="text-muted2 text-sm">{plan.description}</p>
                </div>

                <div className="mb-6">
                  <span className="text-5xl font-bold text-brand-teal">
                    ${billingPeriod === 'annual' ? plan.price_annual : plan.price_monthly}
                  </span>
                  <span className="text-muted-custom">
                    /{billingPeriod === 'annual' ? 'year' : 'month'}
                  </span>
                </div>

                {/* Specs */}
                <div className="grid grid-cols-3 gap-3 mb-6 p-4 bg-elevated rounded-lg">
                  <div className="text-center">
                    <Cpu className="w-5 h-5 text-brand-teal mx-auto mb-1" />
                    <p className="font-semibold">{plan.vcpu}</p>
                    <p className="text-xs text-muted-custom">vCPU</p>
                  </div>
                  <div className="text-center">
                    <Zap className="w-5 h-5 text-brand-blue mx-auto mb-1" />
                    <p className="font-semibold">{plan.ram_gb} GB</p>
                    <p className="text-xs text-muted-custom">RAM</p>
                  </div>
                  <div className="text-center">
                    <HardDrive className="w-5 h-5 text-brand-amber mx-auto mb-1" />
                    <p className="font-semibold">{plan.disk_gb} GB</p>
                    <p className="text-xs text-muted-custom">SSD</p>
                  </div>
                </div>

                {/* Features */}
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-brand-green flex-shrink-0 mt-0.5" />
                      <span className="text-muted2">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className={`w-full ${plan.id === 'business' ? 'btn-cyber' : 'btn-cyber-outline'}`}
                  onClick={() => handleSelectPlan(plan.id)}
                  data-testid={`select-${plan.id}`}
                >
                  Select {plan.name}
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-12 text-center">
          <Link to="/dashboard" className="text-muted-custom hover:text-brand-teal transition-colors">
            ← Back to Dashboard
          </Link>
        </div>
      </main>
    </div>
  );
};

export default Plans;
