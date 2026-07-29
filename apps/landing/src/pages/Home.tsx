import { motion } from 'framer-motion';
import { Check, X, ArrowRight, Zap, ChevronRight, MessageCircle } from 'lucide-react';
import { features, plans, clients, stats } from '@/data/index';

const C = {
  navy: '#070c1a',
  navyCard: '#0d1428',
  blue: '#2563eb',
  blueBright: '#3b82f6',
  blueLight: '#60a5fa',
  cyan: '#06b6d4',
  white: '#f8fafc',
  muted: '#94a3b8',
  green: '#22c55e',
  gradient: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
  gradientHero: 'linear-gradient(180deg, #070c1a 0%, #0a1228 60%, #0d1630 100%)',
};

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] },
  }),
};

function SectionBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-4"
      style={{ background: `${C.blue}15`, color: C.blue, border: `1px solid ${C.blue}33` }}
    >
      {children}
    </span>
  );
}

/* ── Animated Node Sphere (PPT visual) ── */
function NodeSphere() {
  const nodes = [
    { cx: 50, cy: 18, r: 6 },
    { cx: 82, cy: 34, r: 4 },
    { cx: 90, cy: 62, r: 5 },
    { cx: 72, cy: 86, r: 4 },
    { cx: 42, cy: 92, r: 6 },
    { cx: 16, cy: 74, r: 4 },
    { cx: 10, cy: 44, r: 5 },
    { cx: 28, cy: 22, r: 4 },
    { cx: 64, cy: 8, r: 3 },
    { cx: 94, cy: 50, r: 3 },
  ];
  const edges = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 0],
    [0, 8],
    [8, 1],
    [2, 9],
    [9, 3],
    [1, 3],
    [5, 7],
  ];
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <div
        className="absolute inset-0 rounded-full blur-3xl opacity-25"
        style={{ background: 'radial-gradient(circle, #2563eb 0%, #7c3aed 50%, transparent 80%)' }}
      />
      <motion.svg
        viewBox="0 0 100 100"
        className="w-72 h-72 md:w-[420px] md:h-[420px] relative z-10"
        animate={{ rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
      >
        <defs>
          <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
        {edges.map(([a, b], i) => (
          <line
            key={i}
            x1={`${nodes[a].cx}%`}
            y1={`${nodes[a].cy}%`}
            x2={`${nodes[b].cx}%`}
            y2={`${nodes[b].cy}%`}
            stroke="#2563eb"
            strokeWidth="0.5"
            strokeOpacity="0.45"
          />
        ))}
        <circle
          cx="50%"
          cy="50%"
          r="36%"
          fill="none"
          stroke="url(#sg)"
          strokeWidth="0.5"
          strokeOpacity="0.35"
        />
        <ellipse
          cx="50%"
          cy="50%"
          rx="36%"
          ry="14%"
          fill="none"
          stroke="#2563eb"
          strokeWidth="0.4"
          strokeOpacity="0.3"
        />
        <ellipse
          cx="50%"
          cy="50%"
          rx="20%"
          ry="36%"
          fill="none"
          stroke="#7c3aed"
          strokeWidth="0.4"
          strokeOpacity="0.3"
        />
        {nodes.map((n, i) => (
          <g key={i}>
            <circle
              cx={`${n.cx}%`}
              cy={`${n.cy}%`}
              r={`${n.r * 0.38}%`}
              fill="#2563eb"
              opacity="0.9"
            />
            <circle
              cx={`${n.cx}%`}
              cy={`${n.cy}%`}
              r={`${n.r * 0.75}%`}
              fill="#2563eb"
              opacity="0.12"
            />
          </g>
        ))}
        <circle cx="78%" cy="42%" r="4%" fill="#0d1428" stroke="#25d366" strokeWidth="0.8" />
        <circle cx="88%" cy="58%" r="3.5%" fill="#0d1428" stroke="#2563eb" strokeWidth="0.8" />
        <circle cx="22%" cy="35%" r="3.5%" fill="#0d1428" stroke="#e1306c" strokeWidth="0.8" />
      </motion.svg>
      <motion.div
        className="absolute top-10 right-6 md:right-14 px-2.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5"
        style={{ background: '#128C7E22', color: '#25d366', border: '1px solid #25d36644' }}
        animate={{ y: [-4, 4, -4] }}
        transition={{ duration: 3, repeat: Infinity }}
      >
        💬 WhatsApp
      </motion.div>
      <motion.div
        className="absolute bottom-16 right-2 md:right-10 px-2.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5"
        style={{ background: '#2563eb22', color: '#60a5fa', border: '1px solid #2563eb44' }}
        animate={{ y: [4, -4, 4] }}
        transition={{ duration: 3.5, repeat: Infinity }}
      >
        💙 Messenger
      </motion.div>
      <motion.div
        className="absolute top-20 left-0 md:left-6 px-2.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5"
        style={{ background: '#e1306c22', color: '#f472b6', border: '1px solid #e1306c44' }}
        animate={{ y: [-3, 5, -3] }}
        transition={{ duration: 4, repeat: Infinity }}
      >
        📸 Instagram
      </motion.div>
    </div>
  );
}

/* ── HERO ── */
function Hero() {
  return (
    <section
      className="relative min-h-screen flex items-center overflow-hidden pt-16"
      style={{ background: C.gradientHero }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle,#2563eb 0%,transparent 70%)' }}
        />
        <div
          className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle,#7c3aed 0%,transparent 70%)' }}
        />
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              'linear-gradient(#2563eb 1px,transparent 1px),linear-gradient(90deg,#2563eb 1px,transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>
      <div className="container mx-auto px-4 py-20 lg:py-0 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center min-h-[85vh]">
          <div>
            {/* Logo */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={0}
              className="flex items-center gap-2 mb-8"
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ background: C.blue }}
              >
                <Zap className="w-5 h-5 text-white" />
              </div>
              <span className="text-2xl font-black tracking-tight" style={{ color: C.blue }}>
                VSPRO
              </span>
            </motion.div>
            {/* H1 */}
            <motion.h1
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={1}
              className="text-5xl md:text-6xl lg:text-7xl font-black leading-[1.05] mb-5"
              style={{ fontFamily: "'Space Grotesk',sans-serif", color: C.white }}
            >
              El Futuro de las
              <br />
              <span style={{ color: C.blue }}>Ventas con IA</span>
            </motion.h1>
            {/* PPT gradient divider line */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={2}
              className="h-0.5 w-3/4 rounded-full mb-6"
              style={{ background: C.gradient }}
            />
            <motion.p
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={3}
              className="text-lg md:text-xl leading-relaxed mb-8"
              style={{ color: C.muted }}
            >
              La plataforma de ventas y atención al cliente impulsada por IA para{' '}
              <strong style={{ color: C.white }}>WhatsApp, Messenger e Instagram</strong>. Sin apps.
              Sin ser técnico.
            </motion.p>
            {/* Channel badges — igual que el PPT */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={4}
              className="flex flex-wrap gap-3 mb-10"
            >
              {[
                { label: 'WhatsApp', color: '#25d366', bg: '#128C7E22', icon: '💬' },
                { label: 'Messenger', color: '#2563eb', bg: '#2563eb22', icon: '💙' },
                { label: 'Instagram', color: '#e1306c', bg: '#e1306c22', icon: '📸' },
                { label: 'Dashboard Web', color: '#94a3b8', bg: '#94a3b822', icon: '🖥️' },
              ].map((ch) => (
                <span
                  key={ch.label}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold"
                  style={{ color: ch.color, background: ch.bg, border: `1px solid ${ch.color}44` }}
                >
                  {ch.icon} {ch.label}
                </span>
              ))}
            </motion.div>
            {/* CTAs */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={5}
              className="flex flex-col sm:flex-row gap-4"
            >
              <a
                href="#pricing"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-bold text-base text-white transition-all hover:scale-105"
                style={{ background: C.gradient, boxShadow: `0 0 30px ${C.blue}40` }}
              >
                Prueba 14 días GRATIS <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href="#features"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-semibold text-base transition-all hover:bg-white/5"
                style={{ color: C.blueLight, border: `1px solid ${C.blue}44` }}
              >
                Ver 21 módulos <ChevronRight className="w-4 h-4" />
              </a>
            </motion.div>
            <motion.p
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={6}
              className="mt-6 text-xs"
              style={{ color: C.muted }}
            >
              ✅ Sin tarjeta &nbsp;·&nbsp; ✅ Cancela cuando quieras &nbsp;·&nbsp; ✅ Soporte en
              español 🇲🇽
            </motion.p>
          </div>
          {/* Sphere */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={2}
            className="relative h-80 lg:h-[520px]"
          >
            <NodeSphere />
          </motion.div>
        </div>
      </div>
      {/* Stats bar */}
      <div
        className="absolute bottom-0 left-0 right-0 border-t py-5"
        style={{ borderColor: `${C.blue}20`, background: `${C.navy}f0` }}
      >
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            {stats.map((s) => (
              <div key={s.label}>
                <div
                  className="text-2xl md:text-3xl font-black"
                  style={{ color: C.blue, fontFamily: "'Space Grotesk',sans-serif" }}
                >
                  {s.value}
                </div>
                <div className="text-xs" style={{ color: C.muted }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── PROPUESTA DE VALOR ── */
function ValorProps() {
  const props = [
    {
      icon: '🤖',
      title: 'IA que atiende en <5 segundos',
      desc: 'Tu asistente responde a cualquier hora, en el idioma del cliente, con la personalidad de tu marca.',
    },
    {
      icon: '📸',
      title: 'Alta de productos por foto',
      desc: 'Foto del pizarrón → GPT-4o Vision lee el menú y da de alta todo con un clic. Magia OCR real.',
    },
    {
      icon: '💳',
      title: 'Pagos verificados automáticamente',
      desc: 'El cliente manda el comprobante → la IA lee el monto y confirma en segundos. Sin errores humanos.',
    },
    {
      icon: '🛵',
      title: 'Delivery por WhatsApp',
      desc: 'Asigna repartidores automáticamente. Tracking completo: offered → accepted → delivered.',
    },
  ];
  return (
    <section className="py-20" style={{ background: '#08101f' }}>
      <div className="container mx-auto px-4">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <SectionBadge>⚡ Propuesta de Valor</SectionBadge>
          <h2
            className="text-3xl md:text-5xl font-black"
            style={{ fontFamily: "'Space Grotesk',sans-serif", color: C.white }}
          >
            VSPRO gestiona lo que más tiempo te quita
          </h2>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {props.map((p, i) => (
            <motion.div
              key={p.title}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i}
              className="p-6 rounded-2xl hover:scale-[1.02] transition-transform"
              style={{ background: C.navyCard, border: `1px solid ${C.blue}22` }}
            >
              <div className="text-4xl mb-4">{p.icon}</div>
              <h3 className="font-bold text-sm mb-2" style={{ color: C.white }}>
                {p.title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
                {p.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── CÓMO FUNCIONA ── */
function HowItWorks() {
  const steps = [
    {
      step: '01',
      emoji: '⚙️',
      title: 'Configura tu IA',
      desc: 'Dale nombre, personalidad e instrucciones. Define catálogo, precios y reglas en minutos.',
    },
    {
      step: '02',
      emoji: '💬',
      title: 'Conecta tus canales',
      desc: 'Vincula WhatsApp, Messenger e Instagram. Tu IA atiende en <5 segundos, 24/7.',
    },
    {
      step: '03',
      emoji: '📦',
      title: 'Pedidos y pagos solos',
      desc: 'La IA crea pedidos, envía tu CLABE, verifica comprobantes OCR y notifica al equipo.',
    },
    {
      step: '04',
      emoji: '📊',
      title: 'Crece sin contratar',
      desc: 'Reportes, campañas win-back, KDS, delivery y 8 agentes IA trabajan solos.',
    },
  ];
  return (
    <section id="how" className="py-20" style={{ background: C.navy }}>
      <div className="container mx-auto px-4">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <SectionBadge>🔄 Cómo Funciona</SectionBadge>
          <h2
            className="text-3xl md:text-5xl font-black"
            style={{ fontFamily: "'Space Grotesk',sans-serif", color: C.white }}
          >
            En 4 pasos tu negocio está en modo IA
          </h2>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s, i) => (
            <motion.div
              key={s.step}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i}
              className="relative p-6 rounded-2xl"
              style={{ background: C.navyCard, border: `1px solid ${C.blue}22` }}
            >
              <div
                className="text-5xl font-black mb-3"
                style={{ color: `${C.blue}20`, fontFamily: "'Space Grotesk',sans-serif" }}
              >
                {s.step}
              </div>
              <div className="text-3xl mb-3">{s.emoji}</div>
              <h3 className="font-bold mb-2" style={{ color: C.white }}>
                {s.title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
                {s.desc}
              </p>
              {i < 3 && (
                <div className="hidden lg:block absolute top-1/2 -right-4 z-10">
                  <ChevronRight style={{ color: C.blue }} />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── TE IDENTIFICAS? ── */
function Urgency() {
  const pains = [
    {
      pain: '❌ Pierdes ventas cuando no estás disponible',
      fix: '✅ VSPRO atiende 24/7 sin descansar',
    },
    {
      pain: '❌ Contar pedidos a mano y cometer errores',
      fix: '✅ Todo se crea y confirma automáticamente',
    },
    {
      pain: '❌ Verificar pagos manualmente foto a foto',
      fix: '✅ OCR verifica comprobantes en segundos',
    },
    {
      pain: '❌ Coordinar repartidores por teléfono',
      fix: '✅ VSPRO asigna y trackea por WhatsApp solo',
    },
  ];
  return (
    <section className="py-20" style={{ background: '#08101f' }}>
      <div className="container mx-auto px-4">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2
            className="text-3xl md:text-5xl font-black mb-2"
            style={{ fontFamily: "'Space Grotesk',sans-serif", color: C.white }}
          >
            ¿Te identificas?
          </h2>
          <p style={{ color: C.muted }}>Estos problemas tienen solución con VSPRO</p>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
          {pains.map((p, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i}
              className="p-5 rounded-xl space-y-2"
              style={{ background: C.navyCard, border: `1px solid ${C.blue}15` }}
            >
              <p className="text-sm" style={{ color: '#f87171' }}>
                {p.pain}
              </p>
              <p className="text-sm font-semibold" style={{ color: C.green }}>
                {p.fix}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── 21 MÓDULOS ── */
function Features() {
  return (
    <section id="features" className="py-20 md:py-28" style={{ background: C.navy }}>
      <div className="container mx-auto px-4">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <SectionBadge>🚀 21 Módulos Funcionales</SectionBadge>
          <h2
            className="text-3xl md:text-5xl font-black mb-3"
            style={{ fontFamily: "'Space Grotesk',sans-serif", color: C.white }}
          >
            Todo lo que tu negocio necesita
          </h2>
          <p style={{ color: C.muted }}>
            Una plataforma completa. Sin apps extra. Sin conocimientos técnicos.
          </p>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <motion.div
              key={f.id}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i % 6}
              className="group p-5 rounded-2xl transition-all duration-200"
              style={{ background: C.navyCard, border: `1px solid ${C.blue}20` }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = `${C.blue}50`;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = `${C.blue}20`;
              }}
            >
              <div className="flex items-start gap-3 mb-3">
                <span className="text-2xl">{f.emoji}</span>
                <div className="flex-1">
                  <div className="text-xs font-mono mb-0.5" style={{ color: `${C.blue}80` }}>
                    {String(f.id).padStart(2, '0')}
                  </div>
                  <h3 className="font-bold text-sm" style={{ color: C.white }}>
                    {f.title}
                  </h3>
                </div>
              </div>
              <p className="text-xs leading-relaxed mb-3" style={{ color: C.muted }}>
                {f.description}
              </p>
              <div
                className="text-xs pt-3 font-mono"
                style={{ color: `${C.muted}90`, borderTop: `1px solid ${C.blue}15` }}
              >
                {f.detail}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── CASOS REALES ── */
function Clients() {
  return (
    <section id="clients" className="py-20" style={{ background: '#08101f' }}>
      <div className="container mx-auto px-4">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <SectionBadge>🏆 Casos de Éxito</SectionBadge>
          <h2
            className="text-3xl md:text-5xl font-black mb-2"
            style={{ fontFamily: "'Space Grotesk',sans-serif", color: C.white }}
          >
            Negocios que ya venden con VSPRO
          </h2>
          <p style={{ color: C.muted }}>Datos reales de la plataforma activa</p>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {clients.map((c, i) => (
            <motion.div
              key={c.name}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i % 2}
              className="p-6 rounded-2xl"
              style={{ background: C.navyCard, border: `1px solid ${C.blue}25` }}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3
                    className="font-black text-xl mb-1"
                    style={{ color: C.white, fontFamily: "'Space Grotesk',sans-serif" }}
                  >
                    {c.name}
                  </h3>
                  <p className="text-sm" style={{ color: C.muted }}>
                    {c.category}
                  </p>
                </div>
                <span
                  className="px-3 py-1.5 rounded-full text-xs font-bold"
                  style={{
                    background: `${C.blue}15`,
                    color: C.blueLight,
                    border: `1px solid ${C.blue}33`,
                  }}
                >
                  {c.assistant}
                </span>
              </div>
              <p className="text-sm leading-relaxed mb-5" style={{ color: C.muted }}>
                {c.description}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {c.stats.map((s) => (
                  <div
                    key={s.label}
                    className="text-center p-3 rounded-xl"
                    style={{ background: `${C.blue}10`, border: `1px solid ${C.blue}20` }}
                  >
                    <div
                      className="font-black text-sm mb-0.5"
                      style={{ color: C.blue, fontFamily: "'Space Grotesk',sans-serif" }}
                    >
                      {s.value}
                    </div>
                    <div className="text-xs" style={{ color: C.muted }}>
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── PRECIOS ── */
function Pricing() {
  return (
    <section id="pricing" className="py-20 md:py-28" style={{ background: C.navy }}>
      <div className="container mx-auto px-4">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <SectionBadge>💰 Planes y Precios</SectionBadge>
          <h2
            className="text-3xl md:text-5xl font-black mb-3"
            style={{ fontFamily: "'Space Grotesk',sans-serif", color: C.white }}
          >
            Precios para cada negocio
          </h2>
          <p style={{ color: C.muted }}>14 días de prueba gratis. Sin tarjeta de crédito.</p>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan, i) => {
            const isPro = plan.name === 'Profesional';
            return (
              <motion.div
                key={plan.name}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i}
                className="relative flex flex-col rounded-2xl overflow-hidden"
                style={{
                  background: isPro
                    ? `linear-gradient(135deg,${C.blue}22 0%,#7c3aed22 100%)`
                    : C.navyCard,
                  border: isPro ? `1px solid ${C.blue}60` : `1px solid ${C.blue}20`,
                  boxShadow: isPro ? `0 0 40px ${C.blue}30` : 'none',
                }}
              >
                {isPro && (
                  <div
                    className="absolute top-0 left-0 right-0 h-0.5"
                    style={{ background: C.gradient }}
                  />
                )}
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span
                      className="px-4 py-1 rounded-full text-xs font-bold text-white"
                      style={{ background: C.gradient }}
                    >
                      {plan.badge}
                    </span>
                  </div>
                )}
                <div className="p-7 flex-1">
                  <h3
                    className="font-black text-xl mb-1"
                    style={{ color: C.white, fontFamily: "'Space Grotesk',sans-serif" }}
                  >
                    {plan.name}
                  </h3>
                  <p className="text-sm mb-5" style={{ color: C.muted }}>
                    {plan.description}
                  </p>
                  <div className="flex items-end gap-1 mb-7">
                    <span
                      className="text-5xl font-black"
                      style={{ color: C.white, fontFamily: "'Space Grotesk',sans-serif" }}
                    >
                      {plan.price}
                    </span>
                    <span className="mb-1.5" style={{ color: C.muted }}>
                      /mes MXN
                    </span>
                  </div>
                  <ul className="space-y-3">
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-center gap-2.5 text-sm"
                        style={{ color: C.white }}
                      >
                        <Check className="w-4 h-4 flex-shrink-0" style={{ color: C.green }} />
                        {f}
                      </li>
                    ))}
                    {plan.missing.map((f) => (
                      <li
                        key={f}
                        className="flex items-center gap-2.5 text-sm opacity-35"
                        style={{ color: C.muted }}
                      >
                        <X className="w-4 h-4 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="px-7 pb-7">
                  <a
                    href="#"
                    className="block text-center py-3.5 rounded-xl font-bold text-sm text-white transition-all hover:scale-[1.02]"
                    style={{
                      background: isPro ? C.gradient : `${C.blue}25`,
                      border: isPro ? 'none' : `1px solid ${C.blue}40`,
                    }}
                  >
                    Empezar gratis 14 días →
                  </a>
                </div>
              </motion.div>
            );
          })}
        </div>
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mt-10 text-center p-6 rounded-2xl max-w-2xl mx-auto"
          style={{ background: C.navyCard, border: `1px solid ${C.blue}20` }}
        >
          <p className="text-sm" style={{ color: C.muted }}>
            ¿Necesitas algo a la medida?{' '}
            <a
              href="mailto:hola@vspro.mx"
              style={{ color: C.blueLight }}
              className="hover:underline font-semibold"
            >
              Plan Enterprise
            </a>{' '}
            con SLA, integraciones custom y marca blanca.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

/* ── TECH BAR ── */
function TechBar() {
  return (
    <section
      className="py-12 border-y"
      style={{ background: '#08101f', borderColor: `${C.blue}15` }}
    >
      <div className="container mx-auto px-4 text-center">
        <p className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: C.muted }}>
          Tecnología de punta detrás de cada interacción
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {[
            'GPT-4o',
            'GPT-4o Vision',
            'Whisper',
            'WhatsApp API',
            'NestJS',
            'WebSocket Real-time',
          ].map((t) => (
            <span
              key={t}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{
                background: C.navyCard,
                color: C.blueLight,
                border: `1px solid ${C.blue}25`,
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── CTA FINAL ── */
function FinalCTA() {
  return (
    <section className="py-28 relative overflow-hidden" style={{ background: '#08101f' }}>
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{ background: 'radial-gradient(ellipse at center,#2563eb 0%,transparent 70%)' }}
      />
      <div className="container mx-auto px-4 text-center relative z-10">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <div className="flex items-center justify-center gap-2 mb-8">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: C.blue }}
            >
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-3xl font-black" style={{ color: C.blue }}>
              VSPRO
            </span>
          </div>
          <h2
            className="text-4xl md:text-6xl font-black mb-4"
            style={{ fontFamily: "'Space Grotesk',sans-serif", color: C.white }}
          >
            Tu negocio merece{' '}
            <span
              style={{
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                backgroundImage: C.gradient,
              }}
            >
              vender más
            </span>
          </h2>
          <p className="text-lg mb-10 max-w-lg mx-auto" style={{ color: C.muted }}>
            Únete a los negocios que ya atienden clientes 24/7 con IA. Configura en minutos, sin
            apps, sin ser técnico.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="#pricing"
              className="inline-flex items-center justify-center gap-2 px-10 py-5 rounded-xl font-black text-lg text-white transition-all hover:scale-105"
              style={{ background: C.gradient, boxShadow: `0 0 50px ${C.blue}50` }}
            >
              Empieza GRATIS hoy <ArrowRight className="w-5 h-5" />
            </a>
            <a
              href="https://wa.me/521234567890"
              className="inline-flex items-center justify-center gap-2 px-10 py-5 rounded-xl font-bold text-base transition-all hover:bg-white/5"
              style={{ color: C.white, border: `1px solid ${C.blue}44` }}
            >
              <MessageCircle className="w-5 h-5 text-green-400" /> Habla con ventas por WhatsApp
            </a>
          </div>
          <p className="mt-8 text-sm" style={{ color: C.muted }}>
            14 días gratis · Sin tarjeta · Soporte en español 🇲🇽 · Cancela cuando quieras
          </p>
        </motion.div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <main style={{ background: C.navy }}>
      <Hero />
      <ValorProps />
      <HowItWorks />
      <Urgency />
      <Features />
      <Clients />
      <TechBar />
      <Pricing />
      <FinalCTA />
    </main>
  );
}
