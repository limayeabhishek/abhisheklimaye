-- ============================================================================
-- Migration: 001_auth_and_thoughts.sql
-- Purpose: Profiles, automatic signup role/status trigger, non-recursive RLS
--          helper functions, and public/private thoughts table with seed data.
-- Idempotent: Safe to re-run in the Supabase SQL Editor.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  display_name text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Automatic signup trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_display_name text;
  v_role text;
BEGIN
  v_display_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'display_name'), ''),
    split_part(NEW.email, '@', 1)
  );

  IF LOWER(NEW.email) = 'abhishek.d.limaye@gmail.com' THEN
    v_role := 'admin';
  ELSE
    v_role := 'user';
  END IF;

  INSERT INTO public.profiles (id, email, display_name, role, status)
  VALUES (NEW.id, NEW.email, v_display_name, v_role, 'active')
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 3. Non-recursive RLS helper functions (SECURITY DEFINER bypasses RLS inside helper)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND status = 'active'
  );
$$;

-- 4. RLS on public.profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Only admins can update profiles" ON public.profiles;
CREATE POLICY "Only admins can update profiles"
  ON public.profiles
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5. Thoughts table & RLS
CREATE TABLE IF NOT EXISTS public.thoughts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  excerpt text NOT NULL,
  content text NOT NULL,
  published_at date NOT NULL DEFAULT current_date,
  is_private boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.thoughts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public or active users can read thoughts" ON public.thoughts;
CREATE POLICY "Public or active users can read thoughts"
  ON public.thoughts
  FOR SELECT
  USING (is_private = false OR public.is_active_user());

DROP POLICY IF EXISTS "Only admins can insert thoughts" ON public.thoughts;
CREATE POLICY "Only admins can insert thoughts"
  ON public.thoughts
  FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Only admins can update thoughts" ON public.thoughts;
CREATE POLICY "Only admins can update thoughts"
  ON public.thoughts
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Only admins can delete thoughts" ON public.thoughts;
CREATE POLICY "Only admins can delete thoughts"
  ON public.thoughts
  FOR DELETE
  USING (public.is_admin());

-- 6. Seed thoughts (idempotent)
INSERT INTO public.thoughts (slug, title, excerpt, content, published_at, is_private)
VALUES
(
  'your-data-is-more-powerful-than-you-think',
  'Your Data Is More Powerful Than You Think',
  'I often hear people joke, “I don’t care if someone has my data — I have nothing to hide.” But the truth is, your data is not just about you...',
  $public_essay$
I often hear people joke, "I don't care if someone has my data — I have nothing to hide." But the truth is, your data is not just about you. It paints a bigger picture that companies, marketers, and even governments can use to understand entire populations.

Your personal data — what you search, watch, click on, and even how long you pause on a post — is constantly being analyzed. It's not just about what you actively share; algorithms can also learn from scrolling patterns, response times, and browsing behavior across apps.

That's why you might notice ads or recommendations for things you only recently searched for or showed interest in. This isn't a coincidence — it's data collection and machine learning at work.

Companies across industries rely on this data:
- Entertainment platforms use it to recommend shows and movies you're more likely to watch.
- Healthcare organizations study trends to improve treatments and develop targeted solutions.
- Tech companies use it to design products that feel intuitive to your habits.

This tailored experience can feel convenient, but it also means organizations know a lot about you. Even something as simple as health or lifestyle preferences can influence pricing, product availability, and marketing strategies.

On a larger scale, patterns derived from millions of users can shape decisions in business, healthcare, and even politics.

The key takeaway? Protecting your digital presence is more than just safeguarding your privacy — it's about maintaining control over how your information shapes the world around you.

Cybersecurity and responsible data handling are not just for experts. They are for all of us.

Your data is powerful. Treat it that way.
$public_essay$,
  '2026-01-20',
  false
),
(
  'inside-lab-triage-memory-artifacts-live-forensics',
  'Inside Lab Triage: Notes on Memory Artifacts & Live Forensics',
  'Field notes from volatile memory acquisition, process-injection triage, and preserving ephemeral kernel indicators before a host is powered down...',
  $private_essay$
When an endpoint exhibits anomalous outbound beaconing or credential-access telemetry, the most decisive evidence rarely survives a cold reboot. Disk forensics reconstructs what persisted; volatile memory reveals what actually executed in the moments before containment.

## 1. Volatile First: Order of Volatility in Practice

In lab triage exercises across Linux, macOS, and Windows targets, the first five minutes dictate whether an analyst recovers plaintext C2 staging artifacts or stares at an encrypted swap partition. Before isolating a host via firewall rules or pulling a disk image, capture:

- **Physical Memory Image**: Acquire raw RAM (`LiME` on Linux, `WinPmem` on Windows) to an external write-protected or network-streamed destination, hashing the output stream immediately (`SHA-256`) to anchor chain of custody.
- **Live Socket & Process Tables**: Record active `PID` -> `PPID` trees, open file descriptors (`lsof`), and ephemeral listening sockets before tearing down network interfaces.
- **Loaded Kernel Modules & Persistence Hooks**: Snapshot `LaunchDaemons`, `systemd` unit overrides, and in-memory `eBPF` or kernel-extension registries.

## 2. Hunting Process Injection Without Relying Solely on Signatures

Modern payload staging often executes entirely inside legitimate host binaries via `VirtualAllocEx` / `ptrace` / `mach_vm_write`. Automated EDR alerts catch noisy variants, but manual memory triage looks for structural contradictions:

- **VAD / Memory Region Anomalies**: Private executable (`PAGE_EXECUTE_READWRITE`) memory pages backed by no mapped file on disk (`vadinfo` / `malfind` in Volatility 3).
- **Parent-Child Drift**: A browser renderer or office binary spawning an unsigned scripting interpreter with an unexpected `PPID` or spoofed command-line arguments in the `PEB`.
- **Unlinked Shared Objects**: Threads whose instruction pointer resolves outside any module listed in the process's `InLoadOrderModuleList`.

## 3. Correlating Memory Timelines With Host Logs

Memory artifacts gain maximum evidentiary weight when anchored to disk and log timelines:

1. Extract `DLL` / `dylib` load timestamps and process creation epochs from RAM.
2. Pivot into macOS Unified Logs (`log show`), Windows `Security.evtx` / `Sysmon`, or Linux `auditd` around that exact millisecond window.
3. Verify cryptographic hashes of any dropped stage-2 binaries and cross-check network flow records for matching `JA3`/`TLS` handshakes.

## 4. Key Discipline Takeaway

Live triage is a balancing act between speed and contamination control. Every diagnostic command run on a suspect host mutates caches and timestamps—document every command, timestamp every acquisition, and shift analysis to an offline copy as soon as volatile state is preserved.
$private_essay$,
  '2026-11-15',
  true
)
ON CONFLICT (slug) DO NOTHING;
