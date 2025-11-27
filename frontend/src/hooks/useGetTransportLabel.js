'use client';
import { useTranslations } from 'next-intl';

export function useGetTransportLabel() {
  const t = useTranslations('transportTypes');
  
  return (labelKey) => {
    return t(labelKey);
  };
}
