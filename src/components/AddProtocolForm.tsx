'use client';

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import BrandMark from '@/components/BrandMark';
import {
  ADD_PROTOCOL_LIMITS,
  type AddProtocolFields,
  type PrivacyMethod,
  validateStep,
} from '@/lib/add-protocol';

const EMPTY: AddProtocolFields = {
  name: '',
  website: '',
  xHandle: '',
  description: '',
  privacyMethod: '',
  privacyMethodOther: '',
  programIds: '',
  dataSource: '',
  contactName: '',
  contactEmail: '',
  notes: '',
};

type StepType = 'text' | 'textarea' | 'email' | 'url' | 'choice';

type Step = {
  id: keyof AddProtocolFields;
  kicker: string;
  question: string;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  optional?: boolean;
  type: StepType;
  inputMode?: 'text' | 'email' | 'url' | 'search' | 'numeric';
  autoComplete?: string;
  maxLength: number;
};

const STEPS: Step[] = [
  {
    id: 'name',
    kicker: 'Protocol',
    question: "What's the protocol called?",
    hint: "The name we'll list on the dashboard.",
    placeholder: 'e.g. Cloak',
    required: true,
    type: 'text',
    autoComplete: 'organization',
    maxLength: ADD_PROTOCOL_LIMITS.name,
  },
  {
    id: 'website',
    kicker: 'Website',
    question: 'Got a website?',
    hint: 'Docs or app URL is fine.',
    placeholder: 'https://',
    optional: true,
    type: 'url',
    inputMode: 'url',
    autoComplete: 'url',
    maxLength: ADD_PROTOCOL_LIMITS.website,
  },
  {
    id: 'xHandle',
    kicker: 'X',
    question: "What's the X handle?",
    placeholder: '@handle',
    optional: true,
    type: 'text',
    autoComplete: 'off',
    maxLength: ADD_PROTOCOL_LIMITS.xHandle,
  },
  {
    id: 'description',
    kicker: 'Description',
    question: 'In a sentence, what does it do?',
    hint: 'Shift + Enter for a new line.',
    placeholder: 'Short description of the privacy protocol',
    optional: true,
    type: 'textarea',
    maxLength: ADD_PROTOCOL_LIMITS.description,
  },
  {
    id: 'privacyMethod',
    kicker: 'Method',
    question: 'How does the privacy work?',
    hint: 'Choose one, or press 1, 2, or 3.',
    required: true,
    type: 'choice',
    maxLength: ADD_PROTOCOL_LIMITS.privacyMethodOther,
  },
  {
    id: 'programIds',
    kicker: 'On-chain',
    question: 'Solana program ID(s)?',
    hint: 'One address per line. Shift + Enter for a new line.',
    placeholder: 'e.g. zh1eLd6rSphLejbFfJEneUwzHRfMKxgzrgkfwA6qRkW',
    optional: true,
    type: 'textarea',
    maxLength: ADD_PROTOCOL_LIMITS.programIds,
  },
  {
    id: 'dataSource',
    kicker: 'TVL',
    question: 'Where should we read TVL?',
    hint: 'DefiLlama slug, API, or pool addresses.',
    placeholder: 'slug, API URL, or vault / pool addresses',
    optional: true,
    type: 'textarea',
    maxLength: ADD_PROTOCOL_LIMITS.dataSource,
  },
  {
    id: 'contactName',
    kicker: 'You',
    question: "What's your name?",
    placeholder: 'Name',
    optional: true,
    type: 'text',
    autoComplete: 'name',
    maxLength: ADD_PROTOCOL_LIMITS.contactName,
  },
  {
    id: 'contactEmail',
    kicker: 'You',
    question: "What's your email?",
    hint: "We'll only use this to follow up about the listing.",
    placeholder: 'you@example.com',
    required: true,
    type: 'email',
    inputMode: 'email',
    autoComplete: 'email',
    maxLength: ADD_PROTOCOL_LIMITS.contactEmail,
  },
  {
    id: 'notes',
    kicker: 'Anything else',
    question: 'Anything else we should know?',
    hint: 'Optional. Press Enter or Submit to send.',
    placeholder: 'Links, caveats, launch timing…',
    optional: true,
    type: 'textarea',
    maxLength: ADD_PROTOCOL_LIMITS.notes,
  },
];

const CHOICES: { id: PrivacyMethod; key: string; label: string; blurb: string }[] = [
  { id: 'zk', key: '1', label: 'ZK', blurb: 'Zero-knowledge proofs' },
  { id: 'mpc', key: '2', label: 'MPC', blurb: 'Multi-party computation' },
  { id: 'other', key: '3', label: 'Other', blurb: 'Tell us in a word' },
];

export default function AddProtocolForm() {
  const [values, setValues] = useState<AddProtocolFields>(EMPTY);
  const [stepIndex, setStepIndex] = useState(0);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const otherRef = useRef<HTMLInputElement | null>(null);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const progress = done ? 100 : (stepIndex / STEPS.length) * 100;

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (step.id === 'privacyMethod' && values.privacyMethod === 'other') {
        otherRef.current?.focus();
        return;
      }
      inputRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, [stepIndex, step.id, values.privacyMethod, done]);

  const setField = (id: keyof AddProtocolFields, value: string) => {
    setValues((prev) => ({ ...prev, [id]: value }));
    if (error) setError(null);
  };

  const goTo = (next: number) => {
    setDir(next < stepIndex ? 'back' : 'fwd');
    setError(null);
    setStepIndex(next);
  };

  const advance = async () => {
    if (submitting || done) return;
    const message = validateStep(step.id, values);
    if (step.id === 'privacyMethod') {
      const methodError =
        message ||
        (values.privacyMethod === 'other'
          ? validateStep('privacyMethodOther', values)
          : null);
      if (methodError) {
        setError(methodError);
        return;
      }
    } else if (message) {
      setError(message);
      return;
    }
    if (!isLast) {
      goTo(stepIndex + 1);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/add-protocol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, company: honeypot }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        success?: boolean;
      };
      if (!res.ok || !data.success) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }
      setDone(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void advance();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      if (step.type === 'textarea' || step.type === 'text' || step.type === 'email' || step.type === 'url') {
        e.preventDefault();
        void advance();
      }
    }
    if (e.key === 'ArrowUp' && (e.metaKey || e.ctrlKey) && stepIndex > 0) {
      e.preventDefault();
      goTo(stepIndex - 1);
    }
  };

  const onChoiceKey = (e: KeyboardEvent) => {
    if (step.type !== 'choice') return;
    const hit = CHOICES.find((c) => c.key === e.key);
    if (hit) {
      e.preventDefault();
      setField('privacyMethod', hit.id);
      if (hit.id !== 'other') {
        setField('privacyMethodOther', '');
      }
    }
  };

  const remaining = useMemo(() => {
    const value = values[step.id] || '';
    if (step.type === 'choice') return null;
    if (value.length < step.maxLength * 0.7) return null;
    return `${value.length}/${step.maxLength}`;
  }, [step, values]);

  return (
    <div className="add-shell">
      <div className="add-progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>

      <header className="add-top">
        <BrandMark href="/" size={28} variant="header" withWordmark />
        {!done && stepIndex > 0 && (
          <button
            type="button"
            className="add-back"
            onClick={() => goTo(stepIndex - 1)}
          >
            ← Back
          </button>
        )}
      </header>

      <main className="add-main">
        {done ? (
          <div className="add-step" data-dir="fwd" key="thanks">
            <p className="add-kicker">Done</p>
            <h1 className="add-question">Thanks — we got it.</h1>
            <p className="add-hint">
              We&apos;ll review {values.name || 'the submission'} and follow up
              if we need anything.
            </p>
            <a className="add-ok" href="/">
              Back to the dashboard
            </a>
          </div>
        ) : (
          <form
            className="add-form"
            onSubmit={onSubmit}
            noValidate
            onKeyDown={onChoiceKey}
          >
            <div className="add-step" data-dir={dir} key={step.id}>
              <p className="add-kicker">
                <span className="add-num">{stepIndex + 1}</span>
                {step.kicker}
                {step.optional ? <span className="add-optional">optional</span> : null}
              </p>
              <h1 className="add-question" id={`q-${step.id}`}>
                {step.question}
              </h1>
              {step.hint ? <p className="add-hint">{step.hint}</p> : null}

              {/* Honeypot — visually hidden, not tabbable */}
              <label className="add-hp" aria-hidden="true">
                Company
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  name="company"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </label>

              {step.type === 'choice' ? (
                <div
                  className="add-choices"
                  role="radiogroup"
                  aria-labelledby={`q-${step.id}`}
                >
                  {CHOICES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={values.privacyMethod === c.id}
                      className={
                        values.privacyMethod === c.id
                          ? 'add-choice is-selected'
                          : 'add-choice'
                      }
                      onClick={() => {
                        setField('privacyMethod', c.id);
                        if (c.id !== 'other') setField('privacyMethodOther', '');
                      }}
                    >
                      <span className="add-choice-key">{c.key}</span>
                      <span className="add-choice-copy">
                        <strong>{c.label}</strong>
                        <span>{c.blurb}</span>
                      </span>
                    </button>
                  ))}
                  {values.privacyMethod === 'other' && (
                    <input
                      ref={otherRef}
                      className="add-input add-input-inline"
                      type="text"
                      value={values.privacyMethodOther}
                      maxLength={ADD_PROTOCOL_LIMITS.privacyMethodOther}
                      placeholder="What method?"
                      onChange={(e) => setField('privacyMethodOther', e.target.value)}
                      onKeyDown={onKeyDown}
                      aria-label="Other privacy method"
                    />
                  )}
                </div>
              ) : step.type === 'textarea' ? (
                <textarea
                  ref={(el) => {
                    inputRef.current = el;
                  }}
                  className="add-input add-textarea"
                  rows={3}
                  value={values[step.id]}
                  maxLength={step.maxLength}
                  placeholder={step.placeholder}
                  onChange={(e) => setField(step.id, e.target.value)}
                  onKeyDown={onKeyDown}
                  aria-labelledby={`q-${step.id}`}
                  aria-required={step.required}
                  aria-invalid={!!error}
                />
              ) : (
                <input
                  ref={(el) => {
                    inputRef.current = el;
                  }}
                  className="add-input"
                  type={step.type === 'email' ? 'email' : step.type === 'url' ? 'url' : 'text'}
                  inputMode={step.inputMode}
                  autoComplete={step.autoComplete}
                  value={values[step.id]}
                  maxLength={step.maxLength}
                  placeholder={step.placeholder}
                  onChange={(e) => setField(step.id, e.target.value)}
                  onKeyDown={onKeyDown}
                  aria-labelledby={`q-${step.id}`}
                  aria-required={step.required}
                  aria-invalid={!!error}
                />
              )}

              {remaining ? <p className="add-count">{remaining}</p> : null}
              {error ? (
                <p className="add-error" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="add-actions">
                <button
                  type="submit"
                  className="add-ok"
                  disabled={submitting}
                >
                  {submitting ? 'Sending…' : isLast ? 'Submit' : 'OK'}
                </button>
                {!submitting && (
                  <span className="add-enter">
                    press <kbd>Enter</kbd>
                    {step.type === 'textarea' ? '  ·  Shift + Enter for a new line' : ''}
                  </span>
                )}
              </div>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
