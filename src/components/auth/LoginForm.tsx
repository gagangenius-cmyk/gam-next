'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { AlertCircle, ArrowLeft, ArrowRight, CreditCard, Eye, EyeOff, FileSignature, Globe, Loader2, Lock, Plane, ShieldCheck, User, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { getDefaultAdminPathForUser } from '@/lib/roleAccess'
import { isCompleteVerificationCode, normalizeVerificationCode } from '@/lib/mfaCodeInput'
import ThemeToggle from '@/components/theme/ThemeToggle'

interface LoginFormData {
  username: string
  password: string
}

interface LoginResponse {
  message: string
  mfaRequired?: boolean
  user?: {
    id: number
    name: string
    email: string
    cemail: string
    role: number
    branch: number
    region: number
    type: string
    roleName?: string
    photo: string
    wfh: number
    permissions?: string[]
    mustChangePassword?: boolean
  }
}

const JOURNEY: { icon: LucideIcon; label: string }[] = [
  { icon: Users, label: 'Lead' },
  { icon: FileSignature, label: 'Agreement' },
  { icon: CreditCard, label: 'Payment' },
  { icon: Plane, label: 'Visa' },
]

const PILLARS: { icon: LucideIcon; label: string }[] = [
  { icon: Users, label: 'Role-based access' },
  { icon: ShieldCheck, label: 'Protected client records' },
  { icon: Globe, label: 'Dubai-based, global reach' },
]

// Every colour comes from the CSS tokens in globals.css, so the page follows the light/dark switch.
// The field outline mixes the ink colour at 45%, which keeps it above the 3:1 non-text contrast
// in both themes; focus swaps it for a 2px bronze ring and an error for a red one.
const FIELD_BASE =
  'h-12 w-full rounded-xl border bg-[var(--cmg-surface)] pl-11 text-[15px] text-[var(--cmg-ink)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[var(--cmg-muted)] read-only:opacity-80'
const FIELD_IDLE =
  'border-[color-mix(in_srgb,var(--cmg-ink)_45%,transparent)] hover:border-[var(--cmg-ink)] focus:border-[var(--cmg-blue)] focus:ring-[3px] focus:ring-[var(--cmg-blue)]/25'
const FIELD_INVALID = 'border-[#D9331E] focus:border-[#D9331E] focus:ring-[3px] focus:ring-[#D9331E]/25'

interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className'> {
  id: string
  label: string
  icon: LucideIcon
  invalid?: boolean
  trailing?: React.ReactNode
  inputClassName?: string
}

function TextField({ id, label, icon: Icon, invalid = false, trailing, inputClassName = '', ...input }: TextFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[13px] font-semibold text-[var(--cmg-ink)]">
        {label}
      </label>
      <div className="group relative">
        <Icon
          aria-hidden="true"
          className={`pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 transition-colors ${
            invalid ? 'text-[#D9331E]' : 'text-[var(--cmg-muted)] group-focus-within:text-[var(--cmg-blue)]'
          }`}
        />
        <input
          id={id}
          aria-invalid={invalid || undefined}
          className={`${FIELD_BASE} ${invalid ? FIELD_INVALID : FIELD_IDLE} ${trailing ? 'pr-12' : 'pr-4'} ${inputClassName}`}
          {...input}
        />
        {trailing}
      </div>
    </div>
  )
}

function SubmitButton({ loading, idle, busy, disabled = false }: { loading: boolean; idle: string; busy: string; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="gam-submit-btn group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl text-[15px] font-bold text-[#1A1612] shadow-[0_10px_24px_-10px_rgba(154,106,43,0.7)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--cmg-blue)]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--cmg-surface)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
    >
      {loading ? (
        <>
          <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {busy}
        </>
      ) : (
        <>
          {idle}
          <ArrowRight className="h-[18px] w-[18px] transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
        </>
      )}
    </button>
  )
}

function BrandLogo({ className = '', sizes = '280px' }: { className?: string; sizes?: string }) {
  return (
    <div className={`relative ${className}`}>
      <Image src="/gam-logo-on-light.webp" alt="Go Abroad Migration" fill sizes={sizes} priority className="gam-logo-light-variant object-contain object-left" />
      <Image src="/gam-logo-on-dark.webp" alt="Go Abroad Migration" fill sizes={sizes} priority className="gam-logo-dark-variant object-contain object-left" />
    </div>
  )
}

export default function LoginForm() {
  const router = useRouter()
  const { login } = useAuth()
  const reduceMotion = Boolean(useReducedMotion())
  const [formData, setFormData] = useState<LoginFormData>({
    username: '',
    password: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Two-step login: once /api/auth/login reports mfaRequired, the form
  // switches to asking for the authenticator code instead of navigating —
  // the real session cookie isn't set until /api/auth/verify-mfa succeeds.
  const [mfaStep, setMfaStep] = useState(false)
  const [mfaCode, setMfaCode] = useState('')

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    if (error) setError('')
  }

  const enterSession = (user: NonNullable<LoginResponse['user']>) => {
    const sessionUser = {
      id: user.id,
      name: user.name,
      email: user.email || user.cemail,
      role: user.role === 1 ? 'admin' : String(user.role),
      type: user.type,
      roleName: user.roleName,
      branch: user.branch ? String(user.branch) : undefined,
      avatar: user.photo || undefined,
      permissions: user.permissions || (user.role === 1 ? ['all'] : []),
      mustChangePassword: Boolean(user.mustChangePassword),
    }

    // Keep AuthContext and localStorage in sync before entering protected routes.
    login(sessionUser, 'cookie-session')

    // Redirect to the dashboard that matches the user's role
    router.replace(getDefaultAdminPathForUser(sessionUser))
    router.refresh()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const data: LoginResponse = await response.json()

      if (response.ok && data.mfaRequired) {
        setMfaStep(true)
      } else if (response.ok && data.user) {
        enterSession(data.user)
      } else {
        setError(data.message || 'Login failed')
      }
    } catch (error) {
      console.error('Login error:', error)
      setError('An error occurred during login')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isCompleteVerificationCode(mfaCode)) return
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth/verify-mfa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: mfaCode }),
      })

      const data: LoginResponse = await response.json()

      if (response.ok && data.user) {
        enterSession(data.user)
      } else {
        setError(data.message || 'Invalid code')
      }
    } catch (error) {
      console.error('MFA verification error:', error)
      setError('An error occurred while verifying your code')
    } finally {
      setLoading(false)
    }
  }

  const backToSignIn = () => {
    setMfaStep(false)
    setMfaCode('')
    setError('')
  }

  // Content blocks rise in one after another; none of it moves for reduced-motion users.
  const rise = (index: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, delay: index * 0.07, ease: 'easeOut' as const },
  })

  const errorAlert = error ? (
    <motion.div
      role="alert"
      initial={reduceMotion ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 rounded-xl border border-[#F2B8B0] bg-[#FDECEA] px-4 py-3 text-sm text-[#B0241E]"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span id="login-error">{error}</span>
    </motion.div>
  ) : null

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[var(--background)] text-[var(--cmg-ink)] lg:grid lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
      <div className="gam-login-aurora" aria-hidden="true">
        <i />
        <i />
      </div>
      <div className="gam-login-grid" aria-hidden="true" />

      {/* Left: the brand story (desktop only) */}
      <aside className="relative hidden flex-col justify-between overflow-hidden px-14 py-12 lg:flex xl:px-20">
        <BrandLogo className="h-16 w-72" sizes="288px" />

        <div className="relative z-10 max-w-xl">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cmg-blue)]">Go Abroad Migration CRM</p>
          <h2 className="text-balance text-4xl font-extrabold leading-[1.1] tracking-tight xl:text-[3.1rem]">
            Where global dreams <span className="gam-shimmer-text">become reality.</span>
          </h2>
          <p className="mt-5 max-w-md text-balance text-lg leading-relaxed text-[var(--cmg-muted)]">
            One workspace for leads, agreements, payments and visa cases, from the first enquiry to final approval.
          </p>

          <div className="relative mt-10 grid max-w-lg grid-cols-4">
            <div className="gam-journey-line absolute left-[12.5%] right-[12.5%] top-5 h-0.5 overflow-hidden rounded bg-[var(--cmg-blue)]/20" aria-hidden="true">
              <i />
            </div>
            {JOURNEY.map(({ icon: Icon, label }, index) => (
              <div key={label} className="relative flex flex-col items-center gap-2">
                <span
                  className="gam-journey-dot grid h-10 w-10 place-items-center rounded-full border border-[var(--cmg-border)] bg-[var(--cmg-surface)] text-[var(--cmg-blue)]"
                  style={{ animationDelay: `${index * 1.6}s` }}
                >
                  <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <span className="text-xs font-semibold tracking-wide text-[var(--cmg-muted)]">{label}</span>
              </div>
            ))}
          </div>

          <ul className="mt-9 flex flex-wrap gap-2">
            {PILLARS.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--cmg-border)] bg-[var(--cmg-surface)]/70 px-3.5 py-1.5 text-[13px] font-medium backdrop-blur-sm"
              >
                <Icon className="h-4 w-4 text-[var(--cmg-blue)]" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-xs text-[var(--cmg-muted)]">Sama Tower, Sheikh Zayed Road, Dubai, UAE</p>

        <div className="gam-orbit" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </aside>

      {/* Right: sign-in */}
      <section className="relative flex min-h-dvh flex-col px-6 py-6 sm:px-12 lg:border-l lg:border-[var(--cmg-border)] lg:bg-[var(--cmg-surface)]/80 lg:px-14 lg:backdrop-blur-xl xl:px-20">
        <header className="flex items-center justify-between">
          <BrandLogo className="h-12 w-52 lg:invisible" sizes="208px" />
          <ThemeToggle />
        </header>

        <div className="flex flex-1 items-center py-8">
          <div className="mx-auto w-full max-w-[26rem]">
            <motion.div key={mfaStep ? 'mfa-heading' : 'signin-heading'} {...rise(0)} className="mb-8">
              <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-[var(--cmg-border)] bg-[var(--cmg-blue-soft)] px-3 py-1 text-xs font-semibold text-[var(--cmg-blue-dark)]">
                {mfaStep ? <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
                {mfaStep ? 'Two-step verification' : 'Staff portal'}
              </span>
              <h1 className="text-[2rem] font-extrabold leading-tight tracking-tight">{mfaStep ? 'Enter your code' : 'Welcome back'}</h1>
              <p className="mt-2 text-balance leading-relaxed text-[var(--cmg-muted)]">
                {mfaStep
                  ? 'Open your authenticator app and enter the 6-digit code. Lost your phone? Use one of your backup codes instead.'
                  : 'Sign in to continue to the Go Abroad Migration CRM.'}
              </p>
            </motion.div>

            {mfaStep ? (
              <form onSubmit={handleVerifyMfa} className="space-y-5" noValidate>
                <motion.div key="mfa-field" {...rise(1)}>
                  <TextField
                    id="mfaCode"
                    name="mfaCode"
                    label="Verification code"
                    icon={ShieldCheck}
                    invalid={Boolean(error)}
                    inputClassName="font-mono text-lg tracking-[0.18em] placeholder:tracking-[0.18em]"
                    type="text"
                    inputMode="text"
                    autoFocus
                    autoComplete="one-time-code"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={11}
                    required
                    readOnly={loading}
                    value={mfaCode}
                    onChange={(e) => {
                      setMfaCode(normalizeVerificationCode(e.target.value))
                      if (error) setError('')
                    }}
                    placeholder="123456"
                    aria-describedby={error ? 'login-error' : 'mfa-hint'}
                  />
                  <p id="mfa-hint" className="mt-2 text-xs text-[var(--cmg-muted)]">
                    Backup codes look like ABCDE-12345 and can be used once.
                  </p>
                </motion.div>

                <div aria-live="assertive">{errorAlert}</div>

                <motion.div key="mfa-submit" {...rise(2)}>
                  <SubmitButton loading={loading} idle="Verify" busy="Verifying..." disabled={!isCompleteVerificationCode(mfaCode)} />
                </motion.div>

                <motion.div key="mfa-back" {...rise(3)} className="text-center">
                  <button
                    type="button"
                    onClick={backToSignIn}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold text-[var(--cmg-blue)] transition-colors hover:text-[var(--cmg-blue-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cmg-blue)]/40"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Back to sign in
                  </button>
                </motion.div>
              </form>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <motion.div key="username" {...rise(1)}>
                  <TextField
                    id="username"
                    name="username"
                    label="Login ID"
                    icon={User}
                    invalid={Boolean(error)}
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    readOnly={loading}
                    value={formData.username}
                    onChange={handleInputChange}
                    placeholder="Enter your login ID"
                    aria-describedby={error ? 'login-error' : undefined}
                  />
                </motion.div>

                <motion.div key="password" {...rise(2)}>
                  <TextField
                    id="password"
                    name="password"
                    label="Password"
                    icon={Lock}
                    invalid={Boolean(error)}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    readOnly={loading}
                    value={formData.password}
                    onChange={handleInputChange}
                    onKeyDown={(e) => setCapsLock(e.getModifierState('CapsLock'))}
                    onKeyUp={(e) => setCapsLock(e.getModifierState('CapsLock'))}
                    onBlur={() => setCapsLock(false)}
                    placeholder="Enter your password"
                    aria-describedby={error ? 'login-error' : undefined}
                    trailing={
                      <button
                        type="button"
                        onClick={() => setShowPassword((visible) => !visible)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showPassword}
                        className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--cmg-muted)] transition-colors hover:text-[var(--cmg-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cmg-blue)]/40"
                      >
                        {showPassword ? <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" /> : <Eye className="h-[18px] w-[18px]" aria-hidden="true" />}
                      </button>
                    }
                  />
                  {capsLock && (
                    <p role="status" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#8A5200]">
                      <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      Caps Lock is on
                    </p>
                  )}
                </motion.div>

                <div aria-live="assertive">{errorAlert}</div>

                <motion.div key="submit" {...rise(3)}>
                  <SubmitButton loading={loading} idle="Sign in" busy="Signing in..." />
                </motion.div>

                <motion.p key="help" {...rise(4)} className="text-balance text-center text-sm text-[var(--cmg-muted)]">
                  Forgot your password? Ask your administrator or HR to reset it.
                </motion.p>
              </form>
            )}
          </div>
        </div>

        <footer className="text-center text-xs text-[var(--cmg-muted)] lg:text-left">
          © {new Date().getFullYear()} Go Abroad Migration · Authorised staff only
        </footer>
      </section>
    </main>
  )
}
