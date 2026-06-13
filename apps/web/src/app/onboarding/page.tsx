'use client';

import { useState } from 'react';
import { StepBusiness } from '@/components/onboarding/step-business';
import { StepProducts } from '@/components/onboarding/step-products';
import { StepComplete } from '@/components/onboarding/step-complete';
import { VsproLogo } from '@/components/vspro-logo';

export interface OnboardingData {
  business: {
    slug: string;
    businessName: string;
    email: string;
    ownerName: string;
    password: string;
    phone?: string;
  };
  products: { name: string; price: number; category?: string; initialStock?: number }[];
}

const STEPS = ['Datos del negocio', 'Primer producto', 'Listo'];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingData>({
    business: { slug: '', businessName: '', email: '', ownerName: '', password: '' },
    products: [],
  });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('http://localhost:3001/tenants/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Error en el registro');
      setResult(json);
      next();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8">
          <VsproLogo size="md" showSlogan={true} />
          <p className="text-gray-400 mt-3 text-center text-sm">Configura tu negocio en minutos</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  i <= step
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-400'
                }`}
              >
                {i < step ? '✓' : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-12 h-0.5 ${i < step ? 'bg-blue-600' : 'bg-gray-700'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-gray-800 border border-gray-700 p-8 shadow-xl">
          {error && (
            <div className="mb-4 rounded-lg bg-red-900/50 border border-red-700 px-4 py-3">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {step === 0 && (
            <StepBusiness
              data={data.business}
              onChange={(business) => setData({ ...data, business })}
              onNext={next}
            />
          )}

          {step === 1 && (
            <StepProducts
              products={data.products}
              onChange={(products) => setData({ ...data, products })}
              onNext={submit}
              onBack={prev}
              loading={loading}
            />
          )}

          {step === 2 && result && <StepComplete result={result} />}
        </div>

        <p className="text-center text-xs text-gray-500 mt-6">
          Trial gratuito de 14 días · Sin tarjeta de crédito
        </p>
      </div>
    </div>
  );
}
