import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getPlans } from '../services/api';
import { 
  Monitor, Zap, Shield, Globe, ArrowRight, Check, 
  Cpu, HardDrive, Users, Clock, ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const Landing = () => {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    getPlans().then(res => setPlans(res.data)).catch(console.error);
  }, []);

  return (
    <div className="min-h-screen gradient-hero">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" data-testid="logo-link">
            <Monitor className="w-8 h-8 text-brand-teal" />
            <span className="text-xl font-bold text-brand-teal">WinDesk</span>
            <span className="text-xl font-light text-muted2">Cloud</span>
          </Link>
          <nav className="flex items-center gap-6">
            {user ? (
              <Link to="/dashboard">
                <Button className="btn-cyber" data-testid="go-to-dashboard-btn">
                  Dashboard
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/login" className="text-muted2 hover:text-white transition-colors" data-testid="login-link">
                  Sign In
                </Link>
                <Link to="/register">
                  <Button className="btn-cyber" data-testid="get-started-btn">
                    Get Started
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 grid-pattern">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mx-auto text-center animate-fadeIn">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-elevated border border-custom mb-8">
              <span className="status-dot status-dot-active" />
              <span className="text-sm text-muted2">Demo Mode Active</span>
            </div>
            
            <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
              Your <span className="text-brand-teal text-glow-teal">Windows Desktop</span>
              <br />in the Cloud
            </h1>
            
            <p className="text-xl text-muted2 mb-10 max-w-2xl mx-auto">
              Access a full Windows environment from anywhere. Instant provisioning, 
              secure Zero Trust access, and enterprise-grade performance.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to={user ? "/dashboard" : "/register"}>
                <Button className="btn-cyber text-lg px-8 py-6" data-testid="hero-cta-btn">
                  Start Free Trial
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <a href="#pricing">
                <Button variant="outline" className="btn-cyber-outline text-lg px-8 py-6" data-testid="view-pricing-btn">
                  View Pricing
                </Button>
              </a>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-20">
            {[
              { value: '99.9%', label: 'Uptime SLA' },
              { value: '<5min', label: 'Deployment Time' },
              { value: '256-bit', label: 'Encryption' },
              { value: '24/7', label: 'Support' },
            ].map((stat, i) => (
              <div key={i} className="card-cyber p-6 text-center" style={{ animationDelay: `${i * 100}ms` }}>
                <div className="text-3xl font-bold text-brand-teal mb-2">{stat.value}</div>
                <div className="text-sm text-muted-custom">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 bg-surface">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Why WinDesk Cloud?</h2>
            <p className="text-muted2 max-w-2xl mx-auto">
              Enterprise-grade virtual desktops with cutting-edge security and performance
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <Zap className="w-8 h-8" />,
                title: 'Instant Provisioning',
                description: 'Your Windows VM is ready in minutes, not hours. Automated deployment with TSplus pre-installed.'
              },
              {
                icon: <Shield className="w-8 h-8" />,
                title: 'Zero Trust Security',
                description: 'NetBird WireGuard mesh + Cloudflare Tunnel for enterprise-grade security without VPN complexity.'
              },
              {
                icon: <Globe className="w-8 h-8" />,
                title: 'Access Anywhere',
                description: 'HTML5 browser access via TSplus. No client installation required. Works on any device.'
              },
            ].map((feature, i) => (
              <div key={i} className="card-cyber p-8 group">
                <div className="w-14 h-14 rounded-lg bg-brand-teal/10 flex items-center justify-center text-brand-teal mb-6 group-hover:glow-teal transition-all">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                <p className="text-muted2">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h2>
            <p className="text-muted2 max-w-2xl mx-auto">
              Choose the plan that fits your needs. All plans include TSplus, Zero Trust access, and 24/7 monitoring.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {plans.map((plan, i) => (
              <div 
                key={plan.id} 
                className={`card-cyber p-8 relative ${plan.id === 'business' ? 'border-brand-teal glow-teal' : ''}`}
                data-testid={`plan-card-${plan.id}`}
              >
                {plan.id === 'business' && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-brand-teal text-bg-primary text-sm font-semibold rounded-full">
                    Most Popular
                  </div>
                )}
                
                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <p className="text-muted2 text-sm mb-6">{plan.description}</p>
                
                <div className="mb-6">
                  <span className="text-4xl font-bold text-brand-teal">${plan.price_monthly}</span>
                  <span className="text-muted-custom">/mo</span>
                </div>

                <div className="flex items-center gap-4 mb-6 text-sm text-muted2">
                  <div className="flex items-center gap-1">
                    <Cpu className="w-4 h-4" />
                    <span>{plan.vcpu} vCPU</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <HardDrive className="w-4 h-4" />
                    <span>{plan.ram_gb}GB RAM</span>
                  </div>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-brand-green flex-shrink-0 mt-0.5" />
                      <span className="text-muted2">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link to={user ? `/checkout/${plan.id}` : '/register'}>
                  <Button 
                    className={`w-full ${plan.id === 'business' ? 'btn-cyber' : 'btn-cyber-outline'}`}
                    data-testid={`select-plan-${plan.id}`}
                  >
                    Get Started
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-surface">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">Ready to get started?</h2>
          <p className="text-muted2 mb-10">
            Deploy your Windows desktop in the cloud in minutes. No credit card required for the demo.
          </p>
          <Link to={user ? "/dashboard" : "/register"}>
            <Button className="btn-cyber text-lg px-10 py-6" data-testid="final-cta-btn">
              Start Your Free Trial
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 border-t border-custom">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <Monitor className="w-6 h-6 text-brand-teal" />
            <span className="font-semibold text-brand-teal">WinDesk</span>
            <span className="text-muted-custom">Cloud</span>
          </div>
          <p className="text-sm text-muted-custom">
            © 2025 WinDesk Cloud. Demo Mode - Powered by NeoSC Infrastructure.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
