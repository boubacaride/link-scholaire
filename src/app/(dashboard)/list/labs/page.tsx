"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

const labs = [
  {
    id: "math",
    title: "Mathematics",
    subtitle: "Algebra, Calculus, Geometry & more",
    description: "Solve equations step-by-step, plot functions, and explore mathematical concepts with our AI-powered math engine.",
    href: "/list/labs/math",
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="14" fill="#0F4F3C" />
        <text x="24" y="30" textAnchor="middle" fontSize="22" fontFamily="Georgia,serif" fontStyle="italic" fill="#fff">∑</text>
      </svg>
    ),
    gradient: "from-emerald-600 to-teal-700",
    features: ["Step-by-step solving", "Interactive graphing", "Wolfram Alpha powered", "Shape calculator"],
  },
  {
    id: "physics",
    title: "Physics",
    subtitle: "Mechanics, Waves, Thermodynamics",
    description: "Explore physics simulations, solve mechanics problems, and visualize wave phenomena interactively.",
    href: "/list/labs/physics",
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="14" fill="#1e3a5f" />
        <circle cx="24" cy="24" r="3" fill="#fff" />
        <ellipse cx="24" cy="24" rx="14" ry="6" stroke="#fff" strokeWidth="1.5" fill="none" />
        <ellipse cx="24" cy="24" rx="14" ry="6" stroke="#fff" strokeWidth="1.5" fill="none" transform="rotate(60 24 24)" />
        <ellipse cx="24" cy="24" rx="14" ry="6" stroke="#fff" strokeWidth="1.5" fill="none" transform="rotate(-60 24 24)" />
      </svg>
    ),
    gradient: "from-blue-600 to-indigo-700",
    features: ["Physics simulations", "Formula solver", "Unit converter", "Lab experiments"],
  },
  {
    id: "chemistry",
    title: "Chimie",
    subtitle: "Tableau Périodique & Réactions",
    description: "Explorez le tableau périodique interactif, étudiez les éléments chimiques et les réactions en détail.",
    href: "/list/labs/chemistry",
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="14" fill="#7c3aed" />
        <path d="M18,12 L18,26 L12,38 L36,38 L30,26 L30,12" stroke="#fff" strokeWidth="2" fill="none" strokeLinejoin="round" />
        <line x1="18" y1="12" x2="30" y2="12" stroke="#fff" strokeWidth="2" />
        <line x1="14" y1="32" x2="34" y2="32" stroke="#fff" strokeWidth="1.5" opacity="0.5" />
        <circle cx="20" cy="34" r="1.5" fill="#c4b5fd" />
        <circle cx="26" cy="35" r="1" fill="#c4b5fd" />
        <circle cx="30" cy="33" r="1.5" fill="#c4b5fd" />
      </svg>
    ),
    gradient: "from-purple-600 to-violet-700",
    features: ["Tableau périodique", "Éléments chimiques", "Réactions chimiques", "Modèles moléculaires"],
  },
  {
    id: "sciences",
    title: "Sciences",
    subtitle: "Human Body & Biology",
    description: "Explore the human body in 3D, study anatomy, and understand biological systems with interactive models.",
    href: "/list/labs/sciences",
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="14" fill="#b45309" />
        <path d="M24,10 C24,10 20,16 20,22 C20,26 22,28 24,32 C26,28 28,26 28,22 C28,16 24,10 24,10Z" stroke="#fff" strokeWidth="1.8" fill="none" />
        <line x1="24" y1="32" x2="24" y2="38" stroke="#fff" strokeWidth="1.8" />
        <line x1="20" y1="36" x2="28" y2="36" stroke="#fff" strokeWidth="1.5" />
        <circle cx="24" cy="20" r="2" fill="#fde68a" />
      </svg>
    ),
    gradient: "from-amber-600 to-orange-700",
    features: ["3D Anatomy", "Human body explorer", "Biological systems", "Interactive models"],
  },
];

const LabsLandingPage = () => {
  const router = useRouter();
  const { user } = useAuth();

  return (
    <div className="flex-1 p-6 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[0.2em] text-gray-400 mb-2">Learning · Laboratories</div>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-800 tracking-tight">
          Science Labs
        </h1>
        <p className="text-gray-500 text-sm mt-2">
          Choose a subject to start exploring. Interactive tools powered by AI and real-time simulations.
        </p>
      </div>

      {/* Lab Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {labs.map((lab) => (
          <button
            key={lab.id}
            onClick={() => router.push(lab.href)}
            className="group text-left bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-lg hover:border-gray-300 transition-all duration-300"
          >
            {/* Card header with gradient */}
            <div className={`bg-gradient-to-r ${lab.gradient} p-5 flex items-start gap-4`}>
              <div className="flex-shrink-0">{lab.icon}</div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-white">{lab.title}</h2>
                <p className="text-white/70 text-sm mt-0.5">{lab.subtitle}</p>
              </div>
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M6 4L10 8L6 12" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>

            {/* Card body */}
            <div className="p-5">
              <p className="text-gray-600 text-sm leading-relaxed mb-4">{lab.description}</p>
              <div className="flex flex-wrap gap-2">
                {lab.features.map((f) => (
                  <span key={f} className="text-[11px] bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default LabsLandingPage;
