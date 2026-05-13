"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { HumanProvider } from "@/contexts/HumanContext";
import Viewer from "@/components/biodigital/Viewer";
import CameraControls from "@/components/biodigital/CameraControls";
import ScenePanel from "@/components/biodigital/ScenePanel";
import TimelinePanel from "@/components/biodigital/TimelinePanel";
import LabelsPanel from "@/components/biodigital/LabelsPanel";
import EventLog from "@/components/biodigital/EventLog";

// ═══════════════════════════════════════════════════════════
// Model library — organized like BioDigital's Explore page
// ═══════════════════════════════════════════════════════════
interface Model {
  id: string;
  title: string;
  desc: string;
  category: string;
  subcategory: string;
  tags: string[];
  thumbnail?: string;
}

const MODELS: Model[] = [
  // ─── Anatomie complète ───
  { id: "production/maleAdult/male_complete_anatomy_16", title: "Anatomie complète — Homme", desc: "Corps masculin entier, tous systèmes", category: "Anatomie complète", subcategory: "Corps entier", tags: ["Homme", "Complet"] },
  { id: "production/femaleAdult/female_complete_anatomy_16", title: "Anatomie complète — Femme", desc: "Corps féminin entier, tous systèmes", category: "Anatomie complète", subcategory: "Corps entier", tags: ["Femme", "Complet"] },

  // ─── Anatomie du système — Femme ───
  { id: "production/femaleAdult/female_system_anatomy_skeletal_whole.json", title: "Squelette", desc: "Système squelettique féminin complet", category: "Anatomie du système", subcategory: "Squelettique", tags: ["Femme", "Os"] },
  { id: "production/femaleAdult/female_system_anatomy_muscular_whole.json", title: "Muscles", desc: "Système musculaire féminin complet", category: "Anatomie du système", subcategory: "Musculaire", tags: ["Femme", "Muscles"] },
  { id: "production/femaleAdult/female_system_anatomy_cardiovascular_whole.json", title: "Cardiovasculaire", desc: "Cœur et vaisseaux sanguins", category: "Anatomie du système", subcategory: "Cardiovasculaire", tags: ["Femme", "Cœur"] },
  { id: "production/femaleAdult/female_system_anatomy_nervous_whole.json", title: "Système nerveux", desc: "Cerveau, moelle épinière et nerfs", category: "Anatomie du système", subcategory: "Nerveux", tags: ["Femme", "Cerveau"] },
  { id: "production/femaleAdult/female_system_anatomy_respiratory_whole.json", title: "Respiratoire", desc: "Poumons et voies respiratoires", category: "Anatomie du système", subcategory: "Respiratoire", tags: ["Femme", "Poumons"] },
  { id: "production/femaleAdult/female_system_anatomy_digestive_whole.json", title: "Digestif", desc: "Système digestif complet", category: "Anatomie du système", subcategory: "Digestif", tags: ["Femme", "Estomac"] },
  { id: "production/femaleAdult/female_system_anatomy_urinary_whole.json", title: "Urinaire", desc: "Reins et voies urinaires", category: "Anatomie du système", subcategory: "Urinaire", tags: ["Femme", "Reins"] },
  { id: "production/femaleAdult/female_system_anatomy_lymphatic_whole.json", title: "Lymphatique", desc: "Système lymphatique et immunitaire", category: "Anatomie du système", subcategory: "Lymphatique", tags: ["Femme"] },
  { id: "production/femaleAdult/female_system_anatomy_endocrine_whole.json", title: "Endocrinien", desc: "Glandes endocrines", category: "Anatomie du système", subcategory: "Endocrinien", tags: ["Femme", "Hormones"] },
  { id: "production/femaleAdult/female_system_anatomy_reproductive_whole.json", title: "Reproducteur ♀", desc: "Système reproducteur féminin", category: "Anatomie du système", subcategory: "Reproducteur", tags: ["Femme"] },
  { id: "production/femaleAdult/female_system_anatomy_integumentary_whole.json", title: "Tégumentaire", desc: "Peau et annexes cutanées", category: "Anatomie du système", subcategory: "Tégumentaire", tags: ["Femme", "Peau"] },

  // ─── Anatomie du système — Homme ───
  { id: "production/maleAdult/male_system_anatomy_skeletal_whole.json", title: "Squelette", desc: "Système squelettique masculin complet", category: "Anatomie du système", subcategory: "Squelettique", tags: ["Homme", "Os"] },
  { id: "production/maleAdult/male_system_anatomy_muscular_whole.json", title: "Muscles", desc: "Système musculaire masculin complet", category: "Anatomie du système", subcategory: "Musculaire", tags: ["Homme", "Muscles"] },
  { id: "production/maleAdult/male_system_anatomy_cardiovascular_whole.json", title: "Cardiovasculaire", desc: "Cœur et vaisseaux sanguins", category: "Anatomie du système", subcategory: "Cardiovasculaire", tags: ["Homme", "Cœur"] },
  { id: "production/maleAdult/male_system_anatomy_nervous_whole.json", title: "Système nerveux", desc: "Cerveau, moelle épinière et nerfs", category: "Anatomie du système", subcategory: "Nerveux", tags: ["Homme", "Cerveau"] },
  { id: "production/maleAdult/male_system_anatomy_respiratory_whole.json", title: "Respiratoire", desc: "Poumons et voies respiratoires", category: "Anatomie du système", subcategory: "Respiratoire", tags: ["Homme", "Poumons"] },
  { id: "production/maleAdult/male_system_anatomy_digestive_whole.json", title: "Digestif", desc: "Système digestif complet", category: "Anatomie du système", subcategory: "Digestif", tags: ["Homme", "Estomac"] },
  { id: "production/maleAdult/male_system_anatomy_urinary_whole.json", title: "Urinaire", desc: "Reins et voies urinaires", category: "Anatomie du système", subcategory: "Urinaire", tags: ["Homme", "Reins"] },
  { id: "production/maleAdult/male_system_anatomy_lymphatic_whole.json", title: "Lymphatique", desc: "Système lymphatique et immunitaire", category: "Anatomie du système", subcategory: "Lymphatique", tags: ["Homme"] },
  { id: "production/maleAdult/male_system_anatomy_endocrine_whole.json", title: "Endocrinien", desc: "Glandes endocrines", category: "Anatomie du système", subcategory: "Endocrinien", tags: ["Homme", "Hormones"] },
  { id: "production/maleAdult/male_system_anatomy_reproductive_whole.json", title: "Reproducteur ♂", desc: "Système reproducteur masculin", category: "Anatomie du système", subcategory: "Reproducteur", tags: ["Homme"] },
  { id: "production/maleAdult/male_system_anatomy_integumentary_whole.json", title: "Tégumentaire", desc: "Peau et annexes cutanées", category: "Anatomie du système", subcategory: "Tégumentaire", tags: ["Homme", "Peau"] },

  // ─── Anatomie régionale — Homme ───
  { id: "production/maleAdult/male_region_anatomy_head_neck", title: "Tête et cou", desc: "Anatomie régionale de la tête et du cou", category: "Anatomie régionale", subcategory: "Tête et cou", tags: ["Homme"] },
  { id: "production/maleAdult/male_region_anatomy_back", title: "Dos", desc: "Anatomie régionale du dos", category: "Anatomie régionale", subcategory: "Dos", tags: ["Homme"] },
  { id: "production/maleAdult/male_region_anatomy_thorax", title: "Thorax", desc: "Anatomie régionale du thorax", category: "Anatomie régionale", subcategory: "Thorax", tags: ["Homme"] },
  { id: "production/maleAdult/male_region_anatomy_abdomen", title: "Abdomen", desc: "Anatomie régionale de l'abdomen", category: "Anatomie régionale", subcategory: "Abdomen", tags: ["Homme"] },
  { id: "production/maleAdult/male_region_anatomy_pelvis", title: "Bassin", desc: "Anatomie régionale du bassin", category: "Anatomie régionale", subcategory: "Bassin", tags: ["Homme"] },
  { id: "production/maleAdult/male_region_anatomy_upper_limb", title: "Membre supérieur", desc: "Bras, avant-bras et main", category: "Anatomie régionale", subcategory: "Membre supérieur", tags: ["Homme"] },
  { id: "production/maleAdult/male_region_anatomy_lower_limb", title: "Membre inférieur", desc: "Cuisse, jambe et pied", category: "Anatomie régionale", subcategory: "Membre inférieur", tags: ["Homme"] },

  // ─── Anatomie régionale — Femme ───
  { id: "production/femaleAdult/female_region_anatomy_head_neck", title: "Tête et cou", desc: "Anatomie régionale de la tête et du cou", category: "Anatomie régionale", subcategory: "Tête et cou", tags: ["Femme"] },
  { id: "production/femaleAdult/female_region_anatomy_back", title: "Dos", desc: "Anatomie régionale du dos", category: "Anatomie régionale", subcategory: "Dos", tags: ["Femme"] },
  { id: "production/femaleAdult/female_region_anatomy_thorax", title: "Thorax", desc: "Anatomie régionale du thorax", category: "Anatomie régionale", subcategory: "Thorax", tags: ["Femme"] },
  { id: "production/femaleAdult/female_region_anatomy_abdomen", title: "Abdomen", desc: "Anatomie régionale de l'abdomen", category: "Anatomie régionale", subcategory: "Abdomen", tags: ["Femme"] },
  { id: "production/femaleAdult/female_region_anatomy_pelvis", title: "Bassin", desc: "Anatomie régionale du bassin", category: "Anatomie régionale", subcategory: "Bassin", tags: ["Femme"] },
  { id: "production/femaleAdult/female_region_anatomy_upper_limb", title: "Membre supérieur", desc: "Bras, avant-bras et main", category: "Anatomie régionale", subcategory: "Membre supérieur", tags: ["Femme"] },
  { id: "production/femaleAdult/female_region_anatomy_lower_limb", title: "Membre inférieur", desc: "Cuisse, jambe et pied", category: "Anatomie régionale", subcategory: "Membre inférieur", tags: ["Femme"] },

  // ─── Repères osseux, origines et insertions ───
  { id: "production/maleAdult/male_landmarks_skeletal_whole", title: "Repères osseux complets", desc: "Tous les repères osseux du squelette", category: "Repères osseux", subcategory: "Squelette", tags: ["Repères", "Os"] },
  { id: "production/femaleAdult/female_landmarks_skeletal_whole", title: "Repères osseux ♀", desc: "Repères osseux du squelette féminin", category: "Repères osseux", subcategory: "Squelette", tags: ["Femme", "Repères"] },
  { id: "production/maleAdult/male_origins_insertions_whole", title: "Origines et insertions", desc: "Points d'attache musculaires complets", category: "Repères osseux", subcategory: "Insertions", tags: ["Muscles", "Os"] },
  { id: "production/maleAdult/male_landmarks_skull", title: "Repères — Crâne", desc: "Points de repère du crâne", category: "Repères osseux", subcategory: "Crâne", tags: ["Tête"] },
  { id: "production/maleAdult/male_landmarks_spine", title: "Repères — Colonne", desc: "Points de repère vertébraux", category: "Repères osseux", subcategory: "Colonne", tags: ["Dos"] },
  { id: "production/maleAdult/male_landmarks_upper_limb", title: "Repères — Membre sup.", desc: "Points de repère du bras", category: "Repères osseux", subcategory: "Membre supérieur", tags: ["Bras"] },
  { id: "production/maleAdult/male_landmarks_lower_limb", title: "Repères — Membre inf.", desc: "Points de repère de la jambe", category: "Repères osseux", subcategory: "Membre inférieur", tags: ["Jambe"] },
  { id: "production/maleAdult/male_landmarks_thorax", title: "Repères — Thorax", desc: "Points de repère thoraciques", category: "Repères osseux", subcategory: "Thorax", tags: ["Thorax"] },
  { id: "production/maleAdult/male_landmarks_pelvis", title: "Repères — Bassin", desc: "Points de repère pelviens", category: "Repères osseux", subcategory: "Bassin", tags: ["Bassin"] },

  // ─── Coupes transversales et micro anatomie ───
  { id: "production/maleAdult/sagittal_brain_cross_section", title: "Coupe sagittale — Cerveau", desc: "Section sagittale du cerveau", category: "Coupes transversales", subcategory: "Tête", tags: ["Cerveau", "Coupe"] },
  { id: "production/maleAdult/male_reproductive_cross_section", title: "Coupe — Reproducteur ♂", desc: "Section du système reproducteur masculin", category: "Coupes transversales", subcategory: "Bassin", tags: ["Homme", "Coupe"] },
  { id: "production/femaleAdult/female_reproductive_cross_section", title: "Coupe — Reproducteur ♀", desc: "Section du système reproducteur féminin", category: "Coupes transversales", subcategory: "Bassin", tags: ["Femme", "Coupe"] },
  { id: "production/maleAdult/male_cross_section_thorax", title: "Coupe — Thorax", desc: "Coupe transversale du thorax", category: "Coupes transversales", subcategory: "Thorax", tags: ["Coupe"] },
  { id: "production/maleAdult/male_cross_section_abdomen", title: "Coupe — Abdomen", desc: "Coupe transversale de l'abdomen", category: "Coupes transversales", subcategory: "Abdomen", tags: ["Coupe"] },
  { id: "production/maleAdult/male_cross_section_pelvis", title: "Coupe — Bassin", desc: "Coupe transversale du bassin", category: "Coupes transversales", subcategory: "Bassin", tags: ["Coupe"] },
  { id: "production/maleAdult/male_cross_section_head", title: "Coupe — Tête", desc: "Coupe transversale de la tête", category: "Coupes transversales", subcategory: "Tête", tags: ["Coupe"] },
  { id: "production/maleAdult/heart_cross_section", title: "Coupe — Cœur", desc: "Section transversale du cœur", category: "Coupes transversales", subcategory: "Cœur", tags: ["Coupe", "Cœur"] },
  { id: "production/maleAdult/kidney_cross_section", title: "Coupe — Rein", desc: "Section transversale du rein", category: "Coupes transversales", subcategory: "Rein", tags: ["Coupe"] },
  { id: "production/maleAdult/eye_cross_section", title: "Micro — Œil", desc: "Coupe anatomique de l'œil", category: "Coupes transversales", subcategory: "Œil", tags: ["Micro", "Tête"] },
  { id: "production/maleAdult/ear_cross_section", title: "Micro — Oreille", desc: "Coupe anatomique de l'oreille", category: "Coupes transversales", subcategory: "Oreille", tags: ["Micro", "Tête"] },
  { id: "production/maleAdult/skin_cross_section", title: "Micro — Peau", desc: "Coupe transversale de la peau", category: "Coupes transversales", subcategory: "Peau", tags: ["Micro", "Peau"] },
  { id: "production/maleAdult/lung_cross_section", title: "Micro — Poumon", desc: "Coupe du tissu pulmonaire", category: "Coupes transversales", subcategory: "Poumon", tags: ["Micro", "Poumons"] },
  { id: "production/maleAdult/ichthyosis_epidermis.json", title: "Micro — Épiderme", desc: "Coupe de l'épiderme avec ichtyose", category: "Coupes transversales", subcategory: "Peau", tags: ["Micro", "Pathologie"] },

  // ─── Quiz d'anatomie ───
  { id: "production/maleAdult/male_quiz_skeletal", title: "Quiz — Squelette", desc: "Identifier les os du squelette", category: "Quiz d'anatomie", subcategory: "Squelettique", tags: ["Quiz", "Os"] },
  { id: "production/maleAdult/male_quiz_muscular", title: "Quiz — Muscles", desc: "Identifier les muscles du corps", category: "Quiz d'anatomie", subcategory: "Musculaire", tags: ["Quiz", "Muscles"] },
  { id: "production/maleAdult/male_quiz_cardiovascular", title: "Quiz — Cardiovasculaire", desc: "Identifier les structures du cœur", category: "Quiz d'anatomie", subcategory: "Cardiovasculaire", tags: ["Quiz", "Cœur"] },
  { id: "production/maleAdult/male_quiz_nervous", title: "Quiz — Système nerveux", desc: "Identifier les structures nerveuses", category: "Quiz d'anatomie", subcategory: "Nerveux", tags: ["Quiz", "Cerveau"] },
  { id: "production/maleAdult/male_quiz_respiratory", title: "Quiz — Respiratoire", desc: "Identifier les structures respiratoires", category: "Quiz d'anatomie", subcategory: "Respiratoire", tags: ["Quiz", "Poumons"] },
  { id: "production/maleAdult/male_quiz_digestive", title: "Quiz — Digestif", desc: "Identifier les organes digestifs", category: "Quiz d'anatomie", subcategory: "Digestif", tags: ["Quiz"] },
  { id: "production/maleAdult/male_quiz_skull", title: "Quiz — Crâne", desc: "Identifier les os du crâne", category: "Quiz d'anatomie", subcategory: "Crâne", tags: ["Quiz", "Tête"] },
  { id: "production/maleAdult/male_quiz_upper_limb", title: "Quiz — Membre sup.", desc: "Identifier les structures du bras", category: "Quiz d'anatomie", subcategory: "Membre supérieur", tags: ["Quiz"] },
  { id: "production/maleAdult/male_quiz_lower_limb", title: "Quiz — Membre inf.", desc: "Identifier les structures de la jambe", category: "Quiz d'anatomie", subcategory: "Membre inférieur", tags: ["Quiz"] },

  // ─── Modèles spéciaux ───
  { id: "public_preview/whole_beating_healthy_heart.json", title: "Cœur battant (animé)", desc: "Animation du cycle cardiaque", category: "Modèles spéciaux", subcategory: "Animé", tags: ["Animé", "Cœur"] },
  { id: "cochlear_implant", title: "Implant cochléaire", desc: "Anatomie de l'oreille avec implant", category: "Modèles spéciaux", subcategory: "Procédures", tags: ["Procédure", "Oreille"] },
  { id: "acl_repair", title: "Réparation du LCA", desc: "Chirurgie du ligament croisé antérieur", category: "Modèles spéciaux", subcategory: "Procédures", tags: ["Procédure", "Genou"] },
];

const CATEGORIES = [
  "Anatomie complète",
  "Anatomie du système",
  "Anatomie régionale",
  "Repères osseux",
  "Coupes transversales",
  "Quiz d'anatomie",
  "Modèles spéciaux",
];

const CATEGORY_ICONS: Record<string, string> = {
  "Anatomie complète": "🧬",
  "Anatomie du système": "🫀",
  "Anatomie régionale": "🦴",
  "Repères osseux": "📍",
  "Coupes transversales": "🔬",
  "Quiz d'anatomie": "❓",
  "Modèles spéciaux": "⭐",
};

// ═══════════════════════════════════════════════════════════
// Page Component
// ═══════════════════════════════════════════════════════════
type ViewMode = "browse" | "viewer";

const SciencesPage = () => {
  const router = useRouter();
  const [developerKey, setDeveloperKey] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("browse");
  const [currentModelId, setCurrentModelId] = useState("");
  const [activeCategory, setActiveCategory] = useState("Anatomie complète");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [controlsOpen, setControlsOpen] = useState(false);

  useEffect(() => {
    fetch("/api/biodigital/token")
      .then((r) => r.json())
      .then((data) => setDeveloperKey(data.accessToken || data.developerKey || ""))
      .catch(() => {});
  }, []);

  // Get all unique tags for current category
  const categoryModels = useMemo(() => {
    return MODELS.filter((m) => m.category === activeCategory);
  }, [activeCategory]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    categoryModels.forEach((m) => m.tags.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [categoryModels]);

  // Filter models
  const filteredModels = useMemo(() => {
    return categoryModels.filter((m) => {
      const matchSearch = !searchQuery || m.title.toLowerCase().includes(searchQuery.toLowerCase()) || m.desc.toLowerCase().includes(searchQuery.toLowerCase());
      const matchTags = activeTags.length === 0 || activeTags.every((t) => m.tags.includes(t));
      return matchSearch && matchTags;
    });
  }, [categoryModels, searchQuery, activeTags]);

  const toggleTag = (tag: string) => {
    setActiveTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  };

  const openModel = (modelId: string) => {
    setCurrentModelId(modelId);
    setViewMode("viewer");
  };

  // Model card color based on category
  const getCardAccent = (cat: string) => {
    const map: Record<string, string> = {
      "Anatomie complète": "border-t-emerald-500",
      "Anatomie du système": "border-t-blue-500",
      "Anatomie régionale": "border-t-amber-500",
      "Repères osseux": "border-t-purple-500",
      "Coupes transversales": "border-t-rose-500",
      "Quiz d'anatomie": "border-t-cyan-500",
      "Modèles spéciaux": "border-t-orange-500",
    };
    return map[cat] || "border-t-gray-300";
  };

  // ─── VIEWER MODE ───
  if (viewMode === "viewer" && currentModelId) {
    return (
      <HumanProvider>
        <div className="flex flex-col h-[calc(100vh-64px)]">
          {/* Viewer header */}
          <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0">
            <div className="flex items-center gap-3">
              <button onClick={() => setViewMode("browse")} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 transition font-medium">
                ← Bibliothèque
              </button>
              <div className="w-px h-5 bg-gray-200" />
              <h1 className="text-sm font-semibold text-gray-800 truncate max-w-md">
                {MODELS.find((m) => m.id === currentModelId)?.title || currentModelId}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setControlsOpen(!controlsOpen)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${controlsOpen ? "bg-amber-100 text-amber-700 border border-amber-200" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {controlsOpen ? "Masquer contrôles" : "Contrôles 3D"}
              </button>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* 3D viewer */}
            <div className="flex-1 bg-gray-900 relative">
              {developerKey ? (
                <Viewer modelId={currentModelId} developerKey={developerKey} />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="w-10 h-10 border-3 border-amber-200/30 border-t-amber-500 rounded-full animate-spin" />
                </div>
              )}
            </div>

            {/* Controls panel */}
            {controlsOpen && (
              <div className="w-72 bg-white border-l border-gray-200 overflow-y-auto p-3 space-y-4" style={{ scrollbarWidth: "thin" }}>
                <CameraControls />
                <div className="border-t border-gray-100 pt-3"><ScenePanel /></div>
                <div className="border-t border-gray-100 pt-3"><TimelinePanel /></div>
                <div className="border-t border-gray-100 pt-3"><LabelsPanel /></div>
                <div className="border-t border-gray-100 pt-3"><EventLog /></div>
              </div>
            )}
          </div>
        </div>

        <style dangerouslySetInnerHTML={{ __html: `
          .btn-panel { font-size:11px;padding:6px 8px;border-radius:6px;font-weight:500;background:#f9fafb;border:1px solid #e5e7eb;color:#6b7280;transition:all .15s;cursor:pointer;text-align:center }
          .btn-panel:hover { background:#f3f4f6;color:#374151 }
          .btn-panel-active { font-size:11px;padding:6px 8px;border-radius:6px;font-weight:500;background:#fffbeb;border:1px solid #fbbf24;color:#b45309;transition:all .15s;cursor:pointer;text-align:center }
          .btn-panel-active:hover { background:#fef3c7 }
        `}} />
      </HumanProvider>
    );
  }

  // ─── BROWSE MODE (BioDigital Explore-style) ───
  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-[#f5f5f7]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 flex-shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/list/labs")} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 transition">
            ← Labs
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <div>
            <h1 className="text-base font-bold text-gray-900">Explorer l&apos;anatomie 3D</h1>
            <p className="text-[10px] text-gray-400">BioDigital Human — {MODELS.length} modèles interactifs</p>
          </div>
        </div>
        {/* Search */}
        <div className="relative w-80">
          <input
            type="text"
            placeholder="Rechercher un modèle..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-sm pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-400 text-gray-700"
          />
          <svg className="absolute left-3 top-2.5 text-gray-400" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <line x1="11" y1="11" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — categories */}
        <div className="w-56 bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0 py-3" style={{ scrollbarWidth: "thin" }}>
          <p className="px-4 text-[9px] text-gray-400 uppercase tracking-widest font-bold mb-2">Catégories</p>
          {CATEGORIES.map((cat) => {
            const count = MODELS.filter((m) => m.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => { setActiveCategory(cat); setActiveTags([]); }}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-2.5 transition text-sm ${
                  activeCategory === cat
                    ? "bg-red-50 text-red-700 font-semibold border-r-[3px] border-red-500"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <span className="text-base">{CATEGORY_ICONS[cat]}</span>
                <span className="flex-1 truncate">{cat}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeCategory === cat ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-400"}`}>
                  {count}
                </span>
              </button>
            );
          })}

          {/* Custom ID */}
          <div className="px-4 pt-4 mt-4 border-t border-gray-100">
            <p className="text-[9px] text-gray-400 uppercase tracking-widest font-bold mb-2">ID personnalisé</p>
            <input
              type="text"
              placeholder="Coller un ID..."
              className="w-full text-[11px] px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-1 focus:ring-red-400 mb-1.5"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = (e.target as HTMLInputElement).value.trim();
                  if (val) openModel(val);
                }
              }}
            />
            <p className="text-[9px] text-gray-400">Appuyez Entrée pour charger</p>
          </div>
        </div>

        {/* Main content — tags + grid */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {/* Category header + tag filters */}
          <div className="px-6 pt-5 pb-3">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">{CATEGORY_ICONS[activeCategory]}</span>
              <div>
                <h2 className="text-lg font-bold text-gray-900">{activeCategory}</h2>
                <p className="text-xs text-gray-500">{filteredModels.length} modèle{filteredModels.length !== 1 ? "s" : ""}</p>
              </div>
            </div>

            {/* Tags */}
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`text-[11px] px-3 py-1 rounded-full font-medium transition border ${
                      activeTags.includes(tag)
                        ? "bg-red-500 text-white border-red-500"
                        : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
                {activeTags.length > 0 && (
                  <button onClick={() => setActiveTags([])} className="text-[11px] px-3 py-1 rounded-full text-red-500 hover:text-red-700 transition font-medium">
                    ✕ Réinitialiser
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Model grid */}
          <div className="px-6 pb-6">
            {filteredModels.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-4xl mb-3">🔍</p>
                <p className="text-sm">Aucun modèle trouvé</p>
                <p className="text-xs mt-1">Essayez de modifier vos filtres</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredModels.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => openModel(model.id)}
                    className={`group bg-white rounded-xl border border-gray-200 border-t-[3px] ${getCardAccent(model.category)} overflow-hidden hover:shadow-lg hover:border-gray-300 transition-all duration-200 text-left`}
                  >
                    {/* Thumbnail placeholder */}
                    <div className="aspect-[4/3] bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center relative overflow-hidden">
                      <div className="text-4xl opacity-30 group-hover:opacity-50 group-hover:scale-110 transition-all duration-300">
                        {CATEGORY_ICONS[model.category] || "🧬"}
                      </div>
                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-all flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-all bg-red-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg">
                          Voir en 3D →
                        </div>
                      </div>
                    </div>
                    {/* Card body */}
                    <div className="p-3">
                      <h3 className="text-sm font-semibold text-gray-800 group-hover:text-red-600 transition truncate">
                        {model.title}
                      </h3>
                      <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                        {model.desc}
                      </p>
                      {/* Tags */}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {model.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SciencesPage;
