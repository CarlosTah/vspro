'use client';

import { useState } from 'react';

interface Product {
  name: string;
  price: number;
  category?: string;
  initialStock?: number;
}

interface Props {
  products: Product[];
  onChange: (products: Product[]) => void;
  onNext: () => void;
  onBack: () => void;
  loading: boolean;
}

export function StepProducts({ products, onChange, onNext, onBack, loading }: Props) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [stock, setStock] = useState('');

  const addProduct = () => {
    if (!name || !price) return;
    onChange([
      ...products,
      {
        name,
        price: parseFloat(price),
        category: category || undefined,
        initialStock: stock ? parseInt(stock) : undefined,
      },
    ]);
    setName('');
    setPrice('');
    setCategory('');
    setStock('');
  };

  const removeProduct = (index: number) => {
    onChange(products.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-white">Tu primer producto</h2>
        <p className="text-sm text-gray-400 mt-1">
          Agrega al menos un producto para que tus clientes puedan pedir por WhatsApp.
          Puedes agregar más después.
        </p>
      </div>

      {/* Productos agregados */}
      {products.length > 0 && (
        <div className="space-y-2">
          {products.map((p, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-gray-600 bg-gray-900 px-4 py-2.5"
            >
              <div>
                <p className="text-sm font-medium text-white">{p.name}</p>
                <p className="text-xs text-gray-400">
                  ${p.price} {p.category && `· ${p.category}`} {p.initialStock && `· Stock: ${p.initialStock}`}
                </p>
              </div>
              <button
                onClick={() => removeProduct(i)}
                className="text-red-400 hover:text-red-300 text-sm"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Formulario para agregar */}
      <div className="space-y-3 rounded-lg border border-dashed border-gray-600 p-4">
        <div className="grid grid-cols-2 gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del producto"
            className="col-span-2 rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Precio"
            type="number"
            step="0.01"
            className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Categoría (opcional)"
            className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            placeholder="Stock inicial"
            type="number"
            className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={addProduct}
            disabled={!name || !price}
            className="rounded-lg bg-gray-700 px-3 py-2 text-sm font-medium text-white hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            + Agregar
          </button>
        </div>
      </div>

      {/* Botones */}
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 rounded-lg border border-gray-600 py-3 text-sm font-medium text-gray-300 hover:bg-gray-700 transition-colors"
        >
          ← Atrás
        </button>
        <button
          onClick={onNext}
          disabled={loading}
          className="flex-1 rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Creando tu negocio...' : products.length > 0 ? 'Crear mi negocio →' : 'Saltar y crear →'}
        </button>
      </div>
    </div>
  );
}
