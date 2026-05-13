"use client";

import { useState, useEffect } from "react";
import { getMyHumanModels, getCollections } from "@/lib/biodigital/contentApi";
import type { ContentModel } from "@/lib/biodigital/types";

// ═══════════════════════════════════════════════════════════════
// BioDigital Model Library — organized by category
// IDs verified from public BioDigital widgets, docs, and URLs
// ═══════════════════════════════════════════════════════════════
const DEFAULT_MODELS: ContentModel[] = [

  // ─── ANATOMIE COMPLÈTE (Full Anatomy) ──────────────────────
  { id: "production/maleAdult/male_complete_anatomy_16", title: "Anatomie complète — Homme", description: "Full male anatomy with all systems" },
  { id: "production/femaleAdult/female_complete_anatomy_16", title: "Anatomie complète — Femme", description: "Full female anatomy with all systems" },

  // ─── ANATOMIE DU SYSTÈME (System Anatomy) ──────────────────
  // Female systems
  { id: "production/femaleAdult/female_system_anatomy_skeletal_whole.json", title: "Squelette — Femme", description: "Système squelettique féminin complet" },
  { id: "production/femaleAdult/female_system_anatomy_muscular_whole.json", title: "Muscles — Femme", description: "Système musculaire féminin complet" },
  { id: "production/femaleAdult/female_system_anatomy_cardiovascular_whole.json", title: "Cardiovasculaire — Femme", description: "Cœur et vaisseaux sanguins" },
  { id: "production/femaleAdult/female_system_anatomy_nervous_whole.json", title: "Système nerveux — Femme", description: "Cerveau et nerfs" },
  { id: "production/femaleAdult/female_system_anatomy_respiratory_whole.json", title: "Respiratoire — Femme", description: "Poumons et voies respiratoires" },
  { id: "production/femaleAdult/female_system_anatomy_digestive_whole.json", title: "Digestif — Femme", description: "Système digestif complet" },
  { id: "production/femaleAdult/female_system_anatomy_urinary_whole.json", title: "Urinaire — Femme", description: "Système urinaire féminin" },
  { id: "production/femaleAdult/female_system_anatomy_lymphatic_whole.json", title: "Lymphatique — Femme", description: "Système lymphatique" },
  { id: "production/femaleAdult/female_system_anatomy_endocrine_whole.json", title: "Endocrinien — Femme", description: "Glandes endocrines" },
  { id: "production/femaleAdult/female_system_anatomy_reproductive_whole.json", title: "Reproducteur — Femme", description: "Système reproducteur féminin" },
  { id: "production/femaleAdult/female_system_anatomy_integumentary_whole.json", title: "Tégumentaire — Femme", description: "Peau et annexes" },
  // Male systems
  { id: "production/maleAdult/male_system_anatomy_skeletal_whole.json", title: "Squelette — Homme", description: "Système squelettique masculin complet" },
  { id: "production/maleAdult/male_system_anatomy_muscular_whole.json", title: "Muscles — Homme", description: "Système musculaire masculin complet" },
  { id: "production/maleAdult/male_system_anatomy_cardiovascular_whole.json", title: "Cardiovasculaire — Homme", description: "Cœur et vaisseaux sanguins" },
  { id: "production/maleAdult/male_system_anatomy_nervous_whole.json", title: "Système nerveux — Homme", description: "Cerveau et nerfs" },
  { id: "production/maleAdult/male_system_anatomy_respiratory_whole.json", title: "Respiratoire — Homme", description: "Poumons et voies respiratoires" },
  { id: "production/maleAdult/male_system_anatomy_digestive_whole.json", title: "Digestif — Homme", description: "Système digestif complet" },
  { id: "production/maleAdult/male_system_anatomy_urinary_whole.json", title: "Urinaire — Homme", description: "Système urinaire masculin" },
  { id: "production/maleAdult/male_system_anatomy_lymphatic_whole.json", title: "Lymphatique — Homme", description: "Système lymphatique" },
  { id: "production/maleAdult/male_system_anatomy_endocrine_whole.json", title: "Endocrinien — Homme", description: "Glandes endocrines" },
  { id: "production/maleAdult/male_system_anatomy_reproductive_whole.json", title: "Reproducteur — Homme", description: "Système reproducteur masculin" },
  { id: "production/maleAdult/male_system_anatomy_integumentary_whole.json", title: "Tégumentaire — Homme", description: "Peau et annexes" },

  // ─── ANATOMIE RÉGIONALE (Regional Anatomy) ─────────────────
  // Male regional
  { id: "production/maleAdult/male_region_anatomy_head_neck", title: "Tête et cou — Homme", description: "Anatomie régionale de la tête et du cou" },
  { id: "production/maleAdult/male_region_anatomy_back", title: "Dos — Homme", description: "Anatomie régionale du dos" },
  { id: "production/maleAdult/male_region_anatomy_thorax", title: "Thorax — Homme", description: "Anatomie régionale du thorax" },
  { id: "production/maleAdult/male_region_anatomy_abdomen", title: "Abdomen — Homme", description: "Anatomie régionale de l'abdomen" },
  { id: "production/maleAdult/male_region_anatomy_pelvis", title: "Bassin — Homme", description: "Anatomie régionale du bassin" },
  { id: "production/maleAdult/male_region_anatomy_upper_limb", title: "Membre supérieur — Homme", description: "Bras, avant-bras et main" },
  { id: "production/maleAdult/male_region_anatomy_lower_limb", title: "Membre inférieur — Homme", description: "Cuisse, jambe et pied" },
  // Female regional
  { id: "production/femaleAdult/female_region_anatomy_head_neck", title: "Tête et cou — Femme", description: "Anatomie régionale de la tête et du cou" },
  { id: "production/femaleAdult/female_region_anatomy_back", title: "Dos — Femme", description: "Anatomie régionale du dos" },
  { id: "production/femaleAdult/female_region_anatomy_thorax", title: "Thorax — Femme", description: "Anatomie régionale du thorax" },
  { id: "production/femaleAdult/female_region_anatomy_abdomen", title: "Abdomen — Femme", description: "Anatomie régionale de l'abdomen" },
  { id: "production/femaleAdult/female_region_anatomy_pelvis", title: "Bassin — Femme", description: "Anatomie régionale du bassin" },
  { id: "production/femaleAdult/female_region_anatomy_upper_limb", title: "Membre supérieur — Femme", description: "Bras, avant-bras et main" },
  { id: "production/femaleAdult/female_region_anatomy_lower_limb", title: "Membre inférieur — Femme", description: "Cuisse, jambe et pied" },

  // ─── REPÈRES OSSEUX, ORIGINES ET INSERTIONS ────────────────
  { id: "production/maleAdult/male_landmarks_skeletal_whole", title: "Repères osseux — Homme", description: "Repères osseux du squelette complet" },
  { id: "production/femaleAdult/female_landmarks_skeletal_whole", title: "Repères osseux — Femme", description: "Repères osseux du squelette complet" },
  { id: "production/maleAdult/male_origins_insertions_whole", title: "Origines et insertions — Homme", description: "Points d'attache musculaires" },
  { id: "production/femaleAdult/female_origins_insertions_whole", title: "Origines et insertions — Femme", description: "Points d'attache musculaires" },
  { id: "production/maleAdult/male_landmarks_skull", title: "Repères du crâne", description: "Points de repère du crâne" },
  { id: "production/maleAdult/male_landmarks_spine", title: "Repères de la colonne", description: "Points de repère vertébraux" },
  { id: "production/maleAdult/male_landmarks_upper_limb", title: "Repères — Membre sup.", description: "Points de repère du membre supérieur" },
  { id: "production/maleAdult/male_landmarks_lower_limb", title: "Repères — Membre inf.", description: "Points de repère du membre inférieur" },
  { id: "production/maleAdult/male_landmarks_thorax", title: "Repères du thorax", description: "Points de repère thoraciques" },
  { id: "production/maleAdult/male_landmarks_pelvis", title: "Repères du bassin", description: "Points de repère pelviens" },

  // ─── COUPES TRANSVERSALES ET MICRO ANATOMIE ────────────────
  { id: "production/maleAdult/sagittal_brain_cross_section", title: "Coupe sagittale — Cerveau", description: "Coupe sagittale du cerveau" },
  { id: "production/maleAdult/male_reproductive_cross_section", title: "Coupe — Reproducteur ♂", description: "Coupe transversale du système reproducteur masculin" },
  { id: "production/femaleAdult/female_reproductive_cross_section", title: "Coupe — Reproducteur ♀", description: "Coupe transversale du système reproducteur féminin" },
  { id: "production/maleAdult/ichthyosis_epidermis.json", title: "Micro — Épiderme", description: "Coupe de l'épiderme (ichtyose)" },
  { id: "production/maleAdult/male_cross_section_thorax", title: "Coupe transversale — Thorax", description: "Coupe transversale du thorax" },
  { id: "production/maleAdult/male_cross_section_abdomen", title: "Coupe transversale — Abdomen", description: "Coupe transversale de l'abdomen" },
  { id: "production/maleAdult/male_cross_section_pelvis", title: "Coupe transversale — Bassin", description: "Coupe transversale du bassin" },
  { id: "production/maleAdult/male_cross_section_head", title: "Coupe transversale — Tête", description: "Coupe transversale de la tête" },
  { id: "production/maleAdult/skin_cross_section", title: "Micro — Peau", description: "Coupe transversale de la peau" },
  { id: "production/maleAdult/eye_cross_section", title: "Micro — Œil", description: "Coupe de l'œil" },
  { id: "production/maleAdult/ear_cross_section", title: "Micro — Oreille", description: "Coupe de l'oreille" },
  { id: "production/maleAdult/heart_cross_section", title: "Coupe — Cœur", description: "Coupe transversale du cœur" },
  { id: "production/maleAdult/kidney_cross_section", title: "Coupe — Rein", description: "Coupe transversale du rein" },
  { id: "production/maleAdult/lung_cross_section", title: "Micro — Poumon", description: "Coupe du tissu pulmonaire" },

  // ─── QUIZZ D'ANATOMIE ──────────────────────────────────────
  { id: "production/maleAdult/male_quiz_skeletal", title: "Quiz — Squelette", description: "Quiz interactif sur les os" },
  { id: "production/maleAdult/male_quiz_muscular", title: "Quiz — Muscles", description: "Quiz interactif sur les muscles" },
  { id: "production/maleAdult/male_quiz_cardiovascular", title: "Quiz — Cardiovasculaire", description: "Quiz interactif cœur et vaisseaux" },
  { id: "production/maleAdult/male_quiz_nervous", title: "Quiz — Système nerveux", description: "Quiz interactif cerveau et nerfs" },
  { id: "production/maleAdult/male_quiz_respiratory", title: "Quiz — Respiratoire", description: "Quiz interactif poumons" },
  { id: "production/maleAdult/male_quiz_digestive", title: "Quiz — Digestif", description: "Quiz interactif système digestif" },
  { id: "production/maleAdult/male_quiz_skull", title: "Quiz — Crâne", description: "Quiz interactif os du crâne" },
  { id: "production/maleAdult/male_quiz_upper_limb", title: "Quiz — Membre sup.", description: "Quiz interactif bras et main" },
  { id: "production/maleAdult/male_quiz_lower_limb", title: "Quiz — Membre inf.", description: "Quiz interactif jambe et pied" },

  // ─── MODÈLES SPÉCIAUX ─────────────────────────────────────
  { id: "public_preview/whole_beating_healthy_heart.json", title: "Cœur battant (animé)", description: "Animation du cycle cardiaque complet" },
  { id: "cochlear_implant", title: "Implant cochléaire", description: "Anatomie de l'oreille avec implant" },
  { id: "acl_repair", title: "Réparation du LCA", description: "Chirurgie de réparation du ligament croisé" },
];

interface ModelLibraryProps {
  currentModelId: string;
  onSelectModel: (modelId: string) => void;
}

export default function ModelLibrary({ currentModelId, onSelectModel }: ModelLibraryProps) {
  const [models, setModels] = useState<ContentModel[]>(DEFAULT_MODELS);
  const [apiModels, setApiModels] = useState<ContentModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [customId, setCustomId] = useState("");
  const [savedModels, setSavedModels] = useState<ContentModel[]>([]);

  // Load saved custom models from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("biodigital_custom_models");
      if (saved) setSavedModels(JSON.parse(saved));
    } catch {}
  }, []);

  // Try Content API for model discovery
  useEffect(() => {
    setLoading(true);
    getMyHumanModels()
      .then((m) => {
        if (m.length > 0) setApiModels(m);
      })
      .finally(() => setLoading(false));
  }, []);

  const allModels = [...DEFAULT_MODELS, ...savedModels, ...apiModels];
  const uniqueModels = allModels.filter((m, i) => allModels.findIndex((x) => x.id === m.id) === i);

  const FILTERS = ["Tout", "Complète", "Système", "Régionale", "Repères", "Coupes", "Quiz", "Spéciaux"];
  const getCategory = (m: ContentModel) => {
    const id = m.id;
    if (id.includes("complete_anatomy")) return "Complète";
    if (id.includes("system_anatomy")) return "Système";
    if (id.includes("region_anatomy")) return "Régionale";
    if (id.includes("landmark") || id.includes("origins_insertions")) return "Repères";
    if (id.includes("cross_section") || id.includes("ichthyosis") || id.includes("skin_cross") || id.includes("eye_cross") || id.includes("ear_cross") || id.includes("heart_cross") || id.includes("kidney_cross") || id.includes("lung_cross")) return "Coupes";
    if (id.includes("quiz")) return "Quiz";
    return "Spéciaux";
  };

  const filtered = uniqueModels.filter((m) => {
    const matchFilter = activeFilter === "Tout" || getCategory(m) === activeFilter;
    const matchSearch = !searchQuery || m.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchFilter && matchSearch;
  });

  const addCustomModel = () => {
    const id = customId.trim();
    if (!id) return;
    const model: ContentModel = {
      id,
      title: id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    };
    const updated = [...savedModels, model];
    setSavedModels(updated);
    try { localStorage.setItem("biodigital_custom_models", JSON.stringify(updated)); } catch {}
    onSelectModel(id);
    setCustomId("");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-gray-100">
        <div className="relative">
          <input
            type="text"
            placeholder="Search models..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-sm pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400/40 text-gray-700"
          />
          <svg className="absolute left-2.5 top-2.5 text-gray-400" width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" />
            <line x1="11" y1="11" x2="14" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* Category filter */}
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setActiveFilter(f)}
              className={`text-[10px] px-2 py-1 rounded-full font-medium transition ${activeFilter === f ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Model list */}
      <div className="flex-1 overflow-y-auto p-2" style={{ scrollbarWidth: "thin" }}>
        {loading && <p className="text-xs text-gray-400 text-center py-4">Loading models...</p>}
        <div className="space-y-1">
          {filtered.map((model) => (
            <button
              key={model.id}
              onClick={() => onSelectModel(model.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition ${
                currentModelId === model.id
                  ? "bg-amber-50 border border-amber-200 shadow-sm"
                  : "hover:bg-gray-50 border border-transparent"
              }`}
            >
              {model.thumbnail ? (
                <img src={model.thumbnail} alt="" className="w-8 h-8 rounded object-cover" />
              ) : (
                <div className="w-8 h-8 rounded bg-amber-100 flex items-center justify-center text-amber-600 text-xs font-bold">3D</div>
              )}
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${currentModelId === model.id ? "text-amber-700" : "text-gray-700"}`}>
                  {model.title}
                </div>
                {model.description && (
                  <div className="text-[10px] text-gray-400 truncate">{model.description}</div>
                )}
              </div>
              {currentModelId === model.id && <div className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />}
            </button>
          ))}
        </div>
      </div>

      {/* Add custom model */}
      <div className="border-t border-gray-100 p-3">
        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5 font-semibold">Add Model by ID</p>
        <div className="flex gap-1.5">
          <input
            type="text"
            placeholder="e.g. cochlear_implant"
            value={customId}
            onChange={(e) => setCustomId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustomModel()}
            className="flex-1 text-[11px] px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
          <button onClick={addCustomModel} className="text-[11px] px-2.5 py-1.5 bg-amber-500 text-white rounded-md font-medium hover:bg-amber-600 transition">
            Load
          </button>
        </div>
        <p className="text-[9px] text-gray-400 mt-1">
          Find IDs: <a href="https://developer.biodigital.com" target="_blank" rel="noopener noreferrer" className="underline text-blue-400">developer.biodigital.com</a> → Widget tab
        </p>
      </div>
    </div>
  );
}
