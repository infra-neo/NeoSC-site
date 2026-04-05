import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import axios from 'axios';
import { Shield, CreditCard, Lock, CheckCircle2, ArrowLeft } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function CheckoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { getAuthHeader } = useAuth();
  const orderId = searchParams.get('order_id');

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [payMethod, setPayMethod] = useState('stripe'); // stripe | paypal | demo
  const [cardData, setCardData] = useState({ number: '', expiry: '', cvc: '', name: '' });

  useEffect(() => {
    if (!orderId) { navigate('/market'); return; }
    axios.get(`${API}/market/orders/${orderId}`, { headers: getAuthHeader() })
      .then(r => setOrder(r.data))
      .catch(() => { toast.error('Orden no encontrada'); navigate('/market'); })
      .finally(() => setLoading(false));
  }, [orderId]);

  const handlePay = async () => {
    setPaying(true);
    try {
      if (payMethod === 'demo') {
        await axios.post(`${API}/market/orders/${orderId}/simulate-payment`, {}, {
          headers: getAuthHeader()
        });
        navigate(`/market/progress?order_id=${orderId}`);
        return;
      }

      const res = await axios.post(`${API}/market/orders/${orderId}/pay`, {
        method: payMethod,
        card_data: payMethod === 'stripe' ? cardData : undefined,
      }, { headers: getAuthHeader() });

      if (res.data.redirect_url) {
        window.location.href = res.data.redirect_url; // PayPal
      } else {
        navigate(`/market/progress?order_id=${orderId}`);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error procesando el pago');
    } finally {
      setPaying(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const isDemoMode = !order?.stripe_enabled;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <button onClick={() => navigate('/market')} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Volver al configurador
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          {/* Formulario de pago */}
          <div className="space-y-4">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Lock className="w-5 h-5 text-cyan-400" /> Pago seguro
            </h1>

            {/* Selector de método */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'stripe',  label: 'Tarjeta',  icon: '💳' },
                  { id: 'paypal',  label: 'PayPal',   icon: '🅿️' },
                  { id: 'demo',    label: 'Demo',     icon: '🧪' },
                ].map(m => (
                  <button
                    key={m.id}
                    onClick={() => setPayMethod(m.id)}
                    className={`p-3 rounded-xl border text-sm font-medium transition-all flex flex-col items-center gap-1 ${
                      payMethod === m.id ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400' : 'border-border hover:border-border/80'
                    }`}
                  >
                    <span className="text-lg">{m.icon}</span>
                    {m.label}
                    {m.id === 'demo' && (
                      <span className="text-[10px] text-muted-foreground">Sin cobro real</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {payMethod === 'stripe' && (
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <div>
                  <Label className="text-sm mb-1.5 block">Número de tarjeta</Label>
                  <Input
                    value={cardData.number}
                    onChange={e => setCardData(p => ({ ...p, number: e.target.value.replace(/\D/g,'').slice(0,16) }))}
                    placeholder="4242 4242 4242 4242"
                    className="bg-background font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm mb-1.5 block">Vencimiento</Label>
                    <Input
                      value={cardData.expiry}
                      onChange={e => setCardData(p => ({ ...p, expiry: e.target.value }))}
                      placeholder="MM/YY"
                      className="bg-background font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">CVC</Label>
                    <Input
                      value={cardData.cvc}
                      onChange={e => setCardData(p => ({ ...p, cvc: e.target.value.slice(0,4) }))}
                      placeholder="123"
                      className="bg-background font-mono"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-sm mb-1.5 block">Nombre en la tarjeta</Label>
                  <Input
                    value={cardData.name}
                    onChange={e => setCardData(p => ({ ...p, name: e.target.value }))}
                    placeholder="Juan Pérez"
                    className="bg-background"
                  />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                  <Shield className="w-3 h-3 text-cyan-400" />
                  Procesado por Stripe. Nunca almacenamos datos de tarjeta.
                </div>
              </div>
            )}

            {payMethod === 'paypal' && (
              <div className="rounded-xl border border-border bg-card p-5 text-center">
                <p className="text-muted-foreground text-sm mb-3">Serás redirigido a PayPal para completar el pago.</p>
                <div className="text-4xl mb-2">🅿️</div>
                <p className="text-xs text-muted-foreground">Regresarás automáticamente después del pago.</p>
              </div>
            )}

            {payMethod === 'demo' && (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🧪</span>
                  <span className="font-medium text-cyan-400">Modo Demo</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Simula el pago sin cargo real. El proceso de aprovisionamiento iniciará exactamente igual que en producción.
                </p>
              </div>
            )}

            <Button
              onClick={handlePay}
              disabled={paying}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-3 text-base gap-2"
            >
              {paying ? (
                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <CreditCard className="w-5 h-5" />
              )}
              {payMethod === 'demo'
                ? 'Simular pago y provisionar VM'
                : payMethod === 'paypal'
                ? 'Pagar con PayPal'
                : `Pagar ${order ? `$${((order.total_cents || 0) / 100).toFixed(2)}` : ''}`}
            </Button>
          </div>

          {/* Resumen del pedido */}
          {order && (
            <div className="rounded-xl border border-border bg-card p-5 h-fit">
              <h3 className="font-bold mb-4">Tu pedido</h3>
              <div className="space-y-2 text-sm mb-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="font-medium">{order.neosc_plan}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VM</span>
                  <span>{order.vcpu} vCPU / {order.ram_gb} GB / {order.disk_gb} GB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">TSplus</span>
                  <span>{order.tsplus_licenses} usuarios</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Región</span>
                  <span>{order.region}</span>
                </div>
                {order.addons?.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Add-ons</span>
                    <span>{order.addons.length} activos</span>
                  </div>
                )}
              </div>
              <div className="border-t border-border pt-3 mb-4">
                <div className="flex justify-between items-baseline">
                  <span className="text-muted-foreground text-sm">Total</span>
                  <div>
                    <span className="text-2xl font-black text-cyan-400">
                      ${((order.total_cents || 0) / 100).toFixed(2)}
                    </span>
                    <span className="text-xs text-muted-foreground">/mes</span>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-cyan-400" /> Listo en ~8 minutos</div>
                <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-cyan-400" /> TSplus HTML5 activado</div>
                <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-cyan-400" /> Netbird Zero Trust</div>
                <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-cyan-400" /> Credenciales por email</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
