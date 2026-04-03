import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Monitor, Users, Server, Shield, FileText, Settings, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

const GuidedTour = ({ onComplete, onSkip }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  const tourSteps = [
    {
      target: 'welcome',
      title: '¡Bienvenido a WinDesk Cloud!',
      description: 'Te daremos un recorrido rápido por las funcionalidades principales de la plataforma.',
      icon: Sparkles,
      position: 'center'
    },
    {
      target: 'nav-dashboard',
      title: 'Panel Principal',
      description: 'Aquí puedes ver tus escritorios virtuales activos, métricas de uso y el estado de tus VMs.',
      icon: Monitor,
      position: 'right',
      highlight: '[data-testid="nav-dashboard"]'
    },
    {
      target: 'new-vm-btn',
      title: 'Crear Nuevo Workspace',
      description: 'Haz clic aquí para provisionar un nuevo escritorio Windows en la nube. Elige el plan y la región.',
      icon: Server,
      position: 'bottom',
      highlight: '[data-testid="new-vm-btn"]'
    },
    {
      target: 'nav-admin',
      title: 'Panel de Administración',
      description: 'Gestiona usuarios, grupos, roles y políticas de acceso desde el panel de administración.',
      icon: Settings,
      position: 'right',
      highlight: '[data-testid="nav-admin"]'
    },
    {
      target: 'users-section',
      title: 'Gestión de Usuarios',
      description: 'Crea y administra los usuarios que tendrán acceso a los escritorios virtuales.',
      icon: Users,
      position: 'center'
    },
    {
      target: 'groups-section',
      title: 'Grupos de Trabajo',
      description: 'Organiza usuarios en grupos para asignar accesos de forma más eficiente.',
      icon: Users,
      position: 'center'
    },
    {
      target: 'policies-section',
      title: 'Políticas de Acceso',
      description: 'Define qué usuarios o grupos pueden acceder a qué VMs y con qué permisos.',
      icon: Shield,
      position: 'center'
    },
    {
      target: 'complete',
      title: '¡Listo para comenzar!',
      description: 'Ya conoces las funcionalidades principales. Explora la plataforma y crea tu primer workspace.',
      icon: Sparkles,
      position: 'center'
    }
  ];

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    setIsVisible(false);
    onComplete?.();
  };

  const handleSkip = () => {
    setIsVisible(false);
    onSkip?.();
  };

  useEffect(() => {
    // Highlight current element if exists
    const step = tourSteps[currentStep];
    if (step.highlight) {
      const element = document.querySelector(step.highlight);
      if (element) {
        element.classList.add('tour-highlight');
        return () => element.classList.remove('tour-highlight');
      }
    }
  }, [currentStep]);

  if (!isVisible) return null;

  const step = tourSteps[currentStep];
  const StepIcon = step.icon;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === tourSteps.length - 1;
  const isCenterPosition = step.position === 'center' || isFirstStep || isLastStep;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/70 z-[100] transition-opacity duration-300" />

      {/* Tour Modal */}
      <div
        className={`fixed z-[101] transition-all duration-300 ${
          isCenterPosition
            ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
            : step.position === 'right'
            ? 'top-1/3 left-72'
            : 'top-40 right-10'
        }`}
      >
        <div className="card-cyber p-6 w-[420px] shadow-2xl animate-scaleIn">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-brand-teal/20 flex items-center justify-center">
                <StepIcon className="w-6 h-6 text-brand-teal" />
              </div>
              <div>
                <span className="text-xs text-muted-custom">Paso {currentStep + 1} de {tourSteps.length}</span>
                <h3 className="text-lg font-bold">{step.title}</h3>
              </div>
            </div>
            <button
              onClick={handleSkip}
              className="text-muted-custom hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <p className="text-muted2 mb-6 leading-relaxed">{step.description}</p>

          {/* Progress Dots */}
          <div className="flex justify-center gap-2 mb-6">
            {tourSteps.map((_, index) => (
              <div
                key={index}
                className={`w-2 h-2 rounded-full transition-all ${
                  index === currentStep
                    ? 'bg-brand-teal w-6'
                    : index < currentStep
                    ? 'bg-brand-teal/50'
                    : 'bg-muted-custom'
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleSkip}
              className="text-sm text-muted-custom hover:text-white transition-colors"
            >
              Saltar tour
            </button>
            <div className="flex items-center gap-2">
              {!isFirstStep && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrev}
                  className="btn-cyber-outline"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Anterior
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleNext}
                className="btn-cyber"
                data-testid="tour-next-btn"
              >
                {isLastStep ? (
                  <>
                    ¡Comenzar!
                    <Sparkles className="w-4 h-4 ml-1" />
                  </>
                ) : (
                  <>
                    Siguiente
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Highlight pointer arrow (for non-center positions) */}
      {!isCenterPosition && step.highlight && (
        <div
          className={`fixed z-[102] ${
            step.position === 'right' ? 'left-64 top-1/3' : 'right-14 top-36'
          }`}
        >
          <div className="w-0 h-0 border-t-[10px] border-t-transparent border-b-[10px] border-b-transparent border-r-[15px] border-r-brand-teal animate-pulse" />
        </div>
      )}

      {/* CSS for highlight effect */}
      <style>{`
        .tour-highlight {
          position: relative;
          z-index: 102;
          box-shadow: 0 0 0 4px rgba(0, 212, 170, 0.5), 0 0 20px rgba(0, 212, 170, 0.3);
          border-radius: 8px;
          animation: tour-pulse 2s infinite;
        }
        
        @keyframes tour-pulse {
          0%, 100% {
            box-shadow: 0 0 0 4px rgba(0, 212, 170, 0.5), 0 0 20px rgba(0, 212, 170, 0.3);
          }
          50% {
            box-shadow: 0 0 0 8px rgba(0, 212, 170, 0.3), 0 0 30px rgba(0, 212, 170, 0.2);
          }
        }
      `}</style>
    </>
  );
};

export default GuidedTour;
