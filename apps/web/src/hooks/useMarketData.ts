import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/auth/SessionContext';

export interface ReferencePriceData {
  value: number; // in paise/kWh
  unit: string;
  source: string;
  asOf: number;
  stale: boolean;
}

export interface SolarIrradianceData {
  value: number; // W/m²
  unit: string;
  source: string;
  asOf: number;
  stale: boolean;
}

export function useMarketData(zoneId = 1, intervalStart?: number) {
  const { session } = useSession();
  const apiBase = import.meta.env.VITE_API_URL || '';

  const [referencePrice, setReferencePrice] = useState<ReferencePriceData | null>(null);
  const [irradiance, setIrradiance] = useState<SolarIrradianceData[]>([]);
  const [currentGhi, setCurrentGhi] = useState<SolarIrradianceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMarketData = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    setError(null);

    const headers = { Authorization: `Bearer ${session.token}` };
    const nowSec = intervalStart ?? Math.floor(Date.now() / 1000);

    try {
      // 1. Fetch Reference Price
      const priceRes = await fetch(`${apiBase}/api/v1/market-data/reference-price?zoneId=${zoneId}&from=${nowSec}`, { headers });
      if (priceRes.ok) {
        const data = await priceRes.json();
        setReferencePrice(data);
      }

      // 2. Fetch Irradiance
      const irrRes = await fetch(`${apiBase}/api/v1/market-data/irradiance?zoneId=${zoneId}&from=${nowSec - 3600}&to=${nowSec + 86400}`, { headers });
      if (irrRes.ok) {
        const irrData: SolarIrradianceData[] = await irrRes.json();
        setIrradiance(irrData);
        if (irrData.length > 0) {
          // Nearest interval
          const current = irrData.reduce((prev, curr) =>
            Math.abs(curr.asOf - nowSec) < Math.abs(prev.asOf - nowSec) ? curr : prev
          );
          setCurrentGhi(current);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch market data');
    } finally {
      setLoading(false);
    }
  }, [apiBase, session?.token, zoneId, intervalStart]);

  useEffect(() => {
    fetchMarketData();
    const timer = setInterval(fetchMarketData, 60000); // 1 min poll
    return () => clearInterval(timer);
  }, [fetchMarketData]);

  return { referencePrice, irradiance, currentGhi, loading, error, reload: fetchMarketData };
}
