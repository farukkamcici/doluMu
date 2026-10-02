'use client';
import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { Sheet } from '@/components/primitives/Sheet';
import { Segmented } from '@/components/primitives/Segmented';
import { Button } from '@/components/primitives/Button';
import { api, type ReportPayload } from '@/lib/api';
import { cn } from '@/lib/utils';

const MIN_DESCRIPTION = 10;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ReportType = ReportPayload['report_type'];

const inputClass =
  'w-full rounded-md border-[1.5px] border-line bg-bg px-3.5 py-2.5 text-base outline-none transition-colors placeholder:text-fg-subtle focus:border-fg';

export function ReportSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('report');
  const [type, setType] = useState<ReportType>('bug');
  const [line, setLine] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);

  const mutation = useMutation({ mutationFn: api.submitReport });

  const descriptionError = description.trim().length < MIN_DESCRIPTION;
  const emailError = email.trim() !== '' && !EMAIL.test(email.trim());

  const reset = () => {
    setType('bug');
    setLine('');
    setDescription('');
    setEmail('');
    setTouched(false);
    mutation.reset();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (descriptionError || emailError) return;
    mutation.mutate({
      report_type: type,
      description: description.trim(),
      ...(line.trim() && { line_code: line.trim().toUpperCase() }),
      ...(email.trim() && { contact_email: email.trim() }),
    });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next && mutation.isSuccess) reset();
      }}
      title={t('title')}
    >
      {mutation.isSuccess ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="h-10 w-10" />
          <p className="font-medium">{t('success')}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5 pb-6" noValidate>
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('type')}</p>
            <Segmented
              label={t('type')}
              value={type}
              onChange={setType}
              options={(['bug', 'data', 'feature'] as const).map((v) => ({ value: v, label: t(`types.${v}`) }))}
            />
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-medium">{t('line')}</span>
            <input
              value={line}
              onChange={(e) => setLine(e.target.value)}
              placeholder={t('linePlaceholder')}
              autoCapitalize="characters"
              className={inputClass}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">{t('description')}</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('descriptionPlaceholder')}
              rows={4}
              maxLength={2000}
              aria-invalid={touched && descriptionError}
              className={cn(inputClass, 'resize-none', touched && descriptionError && 'border-danger')}
            />
            {touched && descriptionError ? (
              <span className="block text-xs text-danger">{t('descriptionMin', { min: MIN_DESCRIPTION })}</span>
            ) : null}
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">{t('email')}</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={touched && emailError}
              className={cn(inputClass, touched && emailError && 'border-danger')}
            />
            <span className={cn('block text-xs', touched && emailError ? 'text-danger' : 'text-fg-subtle')}>
              {touched && emailError ? t('emailInvalid') : t('emailHint')}
            </span>
          </label>

          {mutation.isError ? <p className="text-sm text-danger">{t('error')}</p> : null}

          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? t('submitting') : t('submit')}
          </Button>
        </form>
      )}
    </Sheet>
  );
}
