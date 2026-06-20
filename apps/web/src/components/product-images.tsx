'use client';

import { useState, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface ProductImagesProps {
  productId: string;
  images: string[];
  onImagesChange: (images: string[]) => void;
}

export function ProductImages({ productId, images, onImagesChange }: ProductImagesProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const token = localStorage.getItem('vspro_token');
    const tenantSlug = localStorage.getItem('vspro_tenant_slug');

    for (const file of Array.from(files)) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch(`${API_URL}/products/${productId}/upload-image`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'x-tenant-slug': tenantSlug ?? '',
          },
          body: formData,
        });

        const result = await res.json();
        if (result.success && result.url) {
          onImagesChange([...images, result.url]);
        } else {
          alert(`Error subiendo ${file.name}: ${result.message ?? 'Error desconocido'}`);
        }
      } catch (err: any) {
        alert(`Error: ${err.message}`);
      }
    }

    setUploading(false);
    e.target.value = '';
  };

  const handleRemove = async (url: string) => {
    const token = localStorage.getItem('vspro_token');
    const tenantSlug = localStorage.getItem('vspro_tenant_slug');

    try {
      await fetch(`${API_URL}/products/${productId}/images`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-tenant-slug': tenantSlug ?? '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });
      onImagesChange(images.filter(i => i !== url));
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1.5">Imágenes del producto</label>
      <p className="text-xs text-gray-500 mb-3">Sube hasta 5 fotos. La primera será la imagen principal.</p>

      {/* Image grid */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-3">
        {images.map((url, i) => (
          <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-gray-700 group">
            <img src={url} alt={`Producto ${i + 1}`} className="w-full h-full object-cover" />
            {i === 0 && (
              <span className="absolute top-1 left-1 bg-accent text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                Principal
              </span>
            )}
            <button
              onClick={() => handleRemove(url)}
              className="absolute top-1 right-1 bg-red-600 text-white w-5 h-5 rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ✕
            </button>
          </div>
        ))}

        {/* Upload button */}
        {images.length < 5 && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="aspect-square rounded-lg border-2 border-dashed border-gray-600 flex flex-col items-center justify-center text-gray-500 hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <span className="text-xs">Subiendo...</span>
            ) : (
              <>
                <span className="text-2xl">📷</span>
                <span className="text-xs mt-1">Agregar</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={handleUpload}
        className="hidden"
      />
    </div>
  );
}
